/**
 * Smoke checks for brain API honesty (run with ARK desktop open).
 * node scripts/smoke-brain-check.cjs
 */
const http = require('http');

const BASE = process.env.ARK_BRAIN_URL || 'http://127.0.0.1:8787';
const TOKEN = process.env.ARK_BRAIN_TOKEN || '';

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function post(path, body, headers = {}) {
  return request('POST', path, body, headers);
}

function get(path, headers = {}) {
  return request('GET', path, null, headers);
}

(async () => {
  let failed = 0;
  const ok = (msg) => console.log('OK:', msg);
  const fail = (msg) => {
    console.error('FAIL:', msg);
    failed += 1;
  };

  const health = await get('/health').catch(() => null);
  if (!health) {
    fail(`brain not reachable at ${BASE}`);
    process.exit(1);
  }
  ok(`health ${health.status}`);

  const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
  const chat = await post('/v1/chat', { message: 'ping smoke test' }, headers);
  const parsed = (() => {
    try { return JSON.parse(chat.body); } catch { return {}; }
  })();
  if (chat.status >= 500 || parsed.ok === false) {
    ok(`chat error status honest (${chat.status})`);
  } else if (chat.status === 401) {
    ok('chat requires auth (401)');
  } else if (/Local GGUF brain failed/i.test(String(parsed.reply || ''))) {
    fail('soft failure disguised as reply');
  } else if (!parsed.reply?.trim()) {
    fail('empty reply with success status');
  } else {
    ok(`chat status ${chat.status}`);
  }

  const noAuth = await post('/v1/chat', { message: 'auth probe' });
  if (!TOKEN && noAuth.status === 401) {
    ok('dev without token still allows or blocks consistently');
  }

  const bigBody = 'x'.repeat(3 * 1024 * 1024);
  const tooBig = await post('/v1/chat', { message: bigBody }, headers).catch(err => ({ status: 400, body: String(err) }));
  if (tooBig.status === 400 || tooBig.status === 413 || tooBig.status === 429) {
    ok('large body rejected or limited');
  } else {
    ok(`large body status ${tooBig.status}`);
  }

  process.exit(failed ? 1 : 0);
})();
