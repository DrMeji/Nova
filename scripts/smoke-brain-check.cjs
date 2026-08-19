/**
 * Smoke checks for brain API honesty (run with ARK desktop open).
 * node scripts/smoke-brain-check.cjs
 */
const http = require('http');

const BASE = process.env.ARK_BRAIN_URL || 'http://127.0.0.1:8787';
const TOKEN = process.env.ARK_BRAIN_TOKEN || '';

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
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
    req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  const health = await post('/health', {}).catch(() => null);
  if (!health) {
    console.error('FAIL: brain not reachable at', BASE);
    process.exit(1);
  }
  console.log('OK: health', health.status);

  const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
  const chat = await post('/v1/chat', { message: 'ping smoke test' }, headers);
  const parsed = (() => {
    try { return JSON.parse(chat.body); } catch { return {}; }
  })();
  if (chat.status >= 500) {
    console.log('OK: chat returned error status (no fake success)', chat.status, parsed.error || parsed);
  } else if (chat.status === 401) {
    console.log('OK: chat requires auth (401)');
  } else if (parsed.ok === false) {
    console.log('OK: chat body reports failure honestly');
  } else if (/Local GGUF brain failed/i.test(String(parsed.reply || ''))) {
    console.error('FAIL: soft failure disguised as reply');
    process.exit(1);
  } else {
    console.log('OK: chat status', chat.status);
  }
})();
