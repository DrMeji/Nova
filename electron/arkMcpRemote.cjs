/**
 * Remote MCP transports for NOVA: Streamable HTTP (2025+) and legacy HTTP+SSE (2024-11-05).
 */

/** @type {Map<string, { kind: 'streamable' | 'legacy', url: string, postUrl?: string, initialized?: boolean }>} */
const httpSessions = new Map();

let rpcSeq = 1;

function nextRpcId() {
  return rpcSeq++;
}

function parseSseBlocks(text) {
  const blocks = String(text || '').split(/\r?\n\r?\n/);
  const out = [];
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = 'message';
    const dataLines = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length) out.push({ event, data: dataLines.join('\n') });
  }
  return out;
}

function pickJsonRpcResult(messages, wantId) {
  for (const msg of messages) {
    try {
      const parsed = JSON.parse(msg.data);
      if (parsed.id === wantId) {
        if (parsed.error) {
          throw new Error(parsed.error.message || JSON.stringify(parsed.error));
        }
        return parsed.result;
      }
    } catch (err) {
      if (err instanceof Error && err.message && !err.message.startsWith('Unexpected')) throw err;
    }
  }
  return undefined;
}

async function readBody(res) {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text();
  if (ct.includes('text/event-stream')) {
    return { kind: 'sse', text };
  }
  try {
    return { kind: 'json', json: JSON.parse(text) };
  } catch {
    return { kind: 'text', text };
  }
}

async function postRpc(url, method, params, { expectResponse = true } = {}) {
  const id = nextRpcId();
  const payload = expectResponse
    ? { jsonrpc: '2.0', id, method, params: params || {} }
    : { jsonrpc: '2.0', method, params: params || {} };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25_000),
  });

  if (!expectResponse) {
    if (!res.ok && res.status !== 202) {
      throw new Error(`MCP notify failed (${res.status})`);
    }
    return null;
  }

  const body = await readBody(res);
  if (body.kind === 'json') {
    if (body.json?.error) {
      throw new Error(body.json.error.message || JSON.stringify(body.json.error));
    }
    if (body.json?.id === id) return body.json.result;
    if (body.json?.result !== undefined) return body.json.result;
    throw new Error('MCP response missing result');
  }
  if (body.kind === 'sse') {
    const result = pickJsonRpcResult(parseSseBlocks(body.text), id);
    if (result !== undefined) return result;
    throw new Error('MCP SSE response missing JSON-RPC result');
  }
  throw new Error(body.text?.slice(0, 200) || `MCP request failed (${res.status})`);
}

async function tryStreamable(url) {
  const base = String(url).trim().replace(/\/$/, '');
  await postRpc(base, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'NOVA', version: '0.1' },
  });
  await postRpc(base, 'notifications/initialized', {}, { expectResponse: false });
  return { kind: 'streamable', url: base, initialized: true };
}

async function tryLegacySse(url) {
  const base = String(url).trim().replace(/\/$/, '');
  const res = await fetch(base, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Legacy MCP SSE failed (${res.status})`);

  const text = await res.text();
  const events = parseSseBlocks(text);
  let postUrl = null;
  for (const ev of events) {
    if (ev.event === 'endpoint') {
      postUrl = ev.data.startsWith('http') ? ev.data : new URL(ev.data, base).href;
      break;
    }
  }
  if (!postUrl) throw new Error('Legacy MCP SSE: no endpoint event');

  await postRpc(postUrl, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'NOVA', version: '0.1' },
  });
  await postRpc(postUrl, 'notifications/initialized', {}, { expectResponse: false });

  return { kind: 'legacy', url: base, postUrl, initialized: true };
}

async function ensureRemoteSession(server) {
  const id = String(server.id || '');
  const url = String(server.url || '').trim();
  if (!url) throw new Error('Remote MCP needs a URL');

  const existing = httpSessions.get(id);
  if (existing && existing.url === url && existing.initialized) return existing;

  try {
    const session = await tryStreamable(url);
    httpSessions.set(id, session);
    return session;
  } catch {
    /* fall through */
  }

  const legacy = await tryLegacySse(url);
  httpSessions.set(id, legacy);
  return legacy;
}

async function remoteRpc(server, method, params) {
  const session = await ensureRemoteSession(server);
  const target = session.kind === 'legacy' ? session.postUrl : session.url;
  if (!target) throw new Error('Remote MCP session has no POST URL');
  return postRpc(target, method, params);
}

function stopRemoteSession(id) {
  httpSessions.delete(String(id || ''));
}

function stopAllRemote() {
  httpSessions.clear();
}

module.exports = {
  ensureRemoteSession,
  remoteRpc,
  stopRemoteSession,
  stopAllRemote,
};
