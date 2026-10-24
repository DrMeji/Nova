import http from 'http';
import WebSocket from 'ws';
import fs from 'fs';

const PORT = Number(process.env.NOVA_CDP_PORT || 9301);
const list = await new Promise((res, rej) => {
  http.get(`http://127.0.0.1:${PORT}/json/list`, (r) => {
    let b = '';
    r.on('data', (c) => (b += c));
    r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej);
});
const prev = list.find((t) => /5200|strado|la.?strado/i.test(`${t.title} ${t.url}`))
  || list.find((t) => /127\.0\.0\.1:\d{4}/.test(String(t.url || '')));
if (!prev?.webSocketDebuggerUrl) {
  console.log('pages', list.map((t) => ({ t: t.title, u: t.url })));
  process.exit(1);
}
const ws = new WebSocket(prev.webSocketDebuggerUrl);
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
const snap = await send('Runtime.evaluate', {
  expression: `({
    title: document.title,
    url: location.href,
    text: (document.body?.innerText || '').slice(0, 700),
    htmlLen: (document.body?.innerHTML || '').length,
    bg: getComputedStyle(document.body).backgroundColor,
  })`,
  returnByValue: true,
  awaitPromise: true,
});
console.log(JSON.stringify(snap.result?.value, null, 2));
const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
fs.writeFileSync('C:/Users/thoma/Desktop/Projects/Nova/.tmp-lastrado-live.png', Buffer.from(shot.data, 'base64'));
console.log('shot ok');
ws.close();
