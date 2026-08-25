/**
 * Minimal MCP host (stdio JSON-RPC) for listing tools from registered servers.
 * Full tools/call agent loop comes later — this unlocks registration + discoverability.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/** @type {Map<string, { child: import('child_process').ChildProcess, buf: string, pending: Map<number, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>, nextId: number }>} */
const sessions = new Map();

function splitArgs(args) {
  const raw = String(args || '').trim();
  if (!raw) return [];
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(raw))) {
    out.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  return out.filter(Boolean);
}

function stopSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  try {
    for (const [, p] of s.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('MCP session closed'));
    }
  } catch { /* ignore */ }
  sessions.delete(id);
  try {
    if (process.platform === 'win32' && s.child.pid) {
      spawn('taskkill', ['/pid', String(s.child.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      s.child.kill('SIGTERM');
    }
  } catch { /* ignore */ }
}

function sendRpc(session, method, params) {
  return new Promise((resolve, reject) => {
    const id = session.nextId++;
    const timer = setTimeout(() => {
      session.pending.delete(id);
      reject(new Error(`MCP timeout waiting for ${method}`));
    }, 25_000);
    session.pending.set(id, { resolve, reject, timer });
    const payload = `${JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} })}\n`;
    try {
      if (!session.child.stdin || session.child.stdin.destroyed) {
        clearTimeout(timer);
        session.pending.delete(id);
        reject(new Error('MCP stdin closed'));
        return;
      }
      session.child.stdin.write(payload);
    } catch (err) {
      clearTimeout(timer);
      session.pending.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function onStdoutLine(session, line) {
  const text = String(line || '').trim();
  if (!text) return;
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }
  if (msg.id == null) return;
  const pending = session.pending.get(msg.id);
  if (!pending) return;
  clearTimeout(pending.timer);
  session.pending.delete(msg.id);
  if (msg.error) {
    pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
    return;
  }
  pending.resolve(msg.result);
}

function ensureStdioSession(server) {
  const id = String(server.id || '');
  const existing = sessions.get(id);
  if (existing && existing.child && !existing.child.killed) return existing;

  const command = String(server.command || '').trim();
  if (!command) throw new Error('stdio MCP needs a command (e.g. npx, node, python)');

  const args = splitArgs(server.args);
  let cwd = server.cwd ? String(server.cwd).trim() : undefined;
  if (cwd && !fs.existsSync(cwd)) {
    throw new Error(`Working folder not found: ${cwd}`);
  }

  const child = spawn(command, args, {
    cwd: cwd || undefined,
    windowsHide: true,
    // Windows often needs shell so `npx` / `.cmd` shims resolve.
    shell: process.platform === 'win32',
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const session = {
    child,
    buf: '',
    pending: new Map(),
    nextId: 1,
  };
  sessions.set(id, session);

  child.stdout.on('data', (chunk) => {
    session.buf += chunk.toString('utf8');
    let idx;
    while ((idx = session.buf.indexOf('\n')) >= 0) {
      const line = session.buf.slice(0, idx);
      session.buf = session.buf.slice(idx + 1);
      onStdoutLine(session, line);
    }
  });

  child.stderr.on('data', () => {
    /* keep stderr quiet in UI; probe surfaces timeouts/errors */
  });

  child.on('exit', () => {
    stopSession(id);
  });

  child.on('error', (err) => {
    for (const [, p] of session.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    session.pending.clear();
    sessions.delete(id);
  });

  return session;
}

async function initializeSession(session) {
  await sendRpc(session, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'ARK', version: '0.1' },
  });
  // notification (no id)
  try {
    const note = `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`;
    session.child.stdin.write(note);
  } catch { /* ignore */ }
}

/**
 * List tools for one registered server config.
 * @param {{ id: string, transport: string, command?: string, args?: string, cwd?: string, url?: string }} server
 */
async function listTools(server) {
  if (!server || !server.id) return { ok: false, error: 'Missing server id', tools: [] };

  if (server.transport === 'sse') {
    return {
      ok: false,
      error: 'SSE MCP connect is registered, but live probe is not wired yet. Use stdio for now.',
      tools: [],
    };
  }

  try {
    const session = ensureStdioSession(server);
    // Fresh process may need initialize once
    if (!session.initialized) {
      await initializeSession(session);
      session.initialized = true;
    }
    const result = await sendRpc(session, 'tools/list', {});
    const tools = Array.isArray(result?.tools)
      ? result.tools.map((t) => ({
        name: String(t?.name || ''),
        description: t?.description ? String(t.description) : undefined,
      })).filter((t) => t.name)
      : [];
    return { ok: true, tools, error: null };
  } catch (err) {
    stopSession(String(server.id));
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err || 'MCP probe failed'),
      tools: [],
    };
  }
}

/**
 * Call one tool on a registered server.
 * @param {{ id: string, transport: string, command?: string, args?: string, cwd?: string, url?: string }} server
 * @param {string} name
 * @param {Record<string, unknown>} [args]
 */
async function callTool(server, name, args) {
  if (!server || !server.id) return { ok: false, error: 'Missing server id', content: '' };
  const toolName = String(name || '').trim();
  if (!toolName) return { ok: false, error: 'Missing tool name', content: '' };

  if (server.transport === 'sse') {
    return {
      ok: false,
      error: 'SSE MCP tools/call is not wired yet. Use stdio.',
      content: '',
    };
  }

  try {
    const session = ensureStdioSession(server);
    if (!session.initialized) {
      await initializeSession(session);
      session.initialized = true;
    }
    const result = await sendRpc(session, 'tools/call', {
      name: toolName,
      arguments: args && typeof args === 'object' ? args : {},
    });
    const content = formatToolResult(result);
    const isError = Boolean(result?.isError);
    return { ok: !isError, content, isError, error: isError ? content : null, raw: result };
  } catch (err) {
    stopSession(String(server.id));
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err || 'MCP call failed'),
      content: '',
    };
  }
}

function formatToolResult(result) {
  if (result == null) return '(empty tool result)';
  const parts = Array.isArray(result.content) ? result.content : null;
  if (parts) {
    const lines = parts.map((p) => {
      if (!p || typeof p !== 'object') return String(p);
      if (p.type === 'text' && p.text != null) return String(p.text);
      try {
        return JSON.stringify(p);
      } catch {
        return String(p);
      }
    }).filter(Boolean);
    if (lines.length) return lines.join('\n');
  }
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function stopServer(id) {
  stopSession(String(id || ''));
  return { ok: true };
}

function stopAll() {
  for (const id of [...sessions.keys()]) stopSession(id);
  return { ok: true };
}

module.exports = {
  listTools,
  callTool,
  stopServer,
  stopAll,
  splitArgs,
};
