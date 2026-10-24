import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9301);
const URL = process.env.SHOT_URL || 'http://127.0.0.1:5210/';
const list = await new Promise((res, rej) => {
  http.get(`http://127.0.0.1:${PORT}/json/list`, (r) => {
    let b = '';
    r.on('data', (c) => (b += c));
    r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej);
});
const pages = (list || []).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
const page = pages.find((t) => /127\.0\.0\.1:\d{4}/.test(String(t.url || '')))
  || pages.find((t) => !/file:/i.test(String(t.url || '')));
if (!page?.webSocketDebuggerUrl) {
  console.log('no preview page');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(JSON.stringify(m.error)));
    else resolve(m.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  pending.set(i, { resolve, reject });
  ws.send(JSON.stringify({ id: i, method, params }));
});
await send('Page.enable');
await send('Page.navigate', { url: URL });
await new Promise((r) => setTimeout(r, 2800));
await send('Runtime.enable');
const r = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `({
    url: location.href,
    title: document.title,
    cards: document.querySelectorAll('.gpu-card').length,
    text: (document.body.innerText || '').slice(0, 280),
  })`,
});
console.log(JSON.stringify(r.result?.value, null, 2));
ws.close();
