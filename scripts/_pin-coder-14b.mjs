/**
 * Pin create craft to qwen25-coder-14b and list ready engines (CDP).
 * Env: NOVA_CDP_PORT (default 9230)
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9230);

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const page = list.find((t) => t.type === 'page' && /index\.html|localhost/i.test(t.url || ''))
  || list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('NOVA page not found');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  pending.set(i, { resolve, reject });
  ws.send(JSON.stringify({ id: i, method, params }));
});

await send('Runtime.enable');
const prefs = await send('Runtime.evaluate', {
  expression: `(() => {
    const keys = ['NOVA:local-prefs'];
    let used = null;
    let prefs = {};
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try { prefs = JSON.parse(raw); used = k; break; } catch {}
    }
    if (!used) used = 'NOVA:local-prefs';
    prefs.activeCoderId = 'qwen25-coder-14b';
    prefs.defaultCodeModelId = 'qwen25-coder-14b';
    localStorage.setItem(used, JSON.stringify(prefs));
    return { used, activeCoderId: prefs.activeCoderId, defaultCodeModelId: prefs.defaultCodeModelId };
  })()`,
  returnByValue: true,
});
console.log('prefs', JSON.stringify(prefs.result?.value || prefs, null, 2));

const models = await send('Runtime.evaluate', {
  expression: `(async () => {
    const st = await (window.novaDesktop?.engineStatus?.()
      || window.novaDesktop?.getEngineStatus?.()
      || Promise.resolve(null));
    const rows = st?.models || [];
    return rows
      .filter((m) => /coder|qwen25-7b|uigen|instruct/i.test(String(m.id || '') + String(m.name || '')))
      .map((m) => ({ id: m.id, status: m.status, name: m.name }));
  })()`,
  returnByValue: true,
  awaitPromise: true,
});
console.log('models', JSON.stringify(models.result?.value || models, null, 2));
ws.close();
