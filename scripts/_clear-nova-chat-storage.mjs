import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9301);
const list = await new Promise((res, rej) => {
  http.get(`http://127.0.0.1:${PORT}/json/list`, (r) => {
    let b = '';
    r.on('data', (c) => (b += c));
    r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej);
});
const nova = list.find((t) => /nova/i.test(String(t.title || '')));
if (!nova?.webSocketDebuggerUrl) {
  console.log('no nova page');
  process.exit(0);
}
const ws = new WebSocket(nova.webSocketDebuggerUrl);
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
const r = await send('Runtime.evaluate', {
  expression: `(() => {
    try { window.novaDesktop?.previewCloseLive?.({}); } catch {}
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    let removed = 0;
    for (const k of keys) {
      if (/NOVA:|chat-thread|recent|create-job|thread-brain|studio/i.test(k)) {
        localStorage.removeItem(k);
        removed += 1;
      }
    }
    try { sessionStorage.clear(); } catch {}
    return { removed, left: localStorage.length };
  })()`,
  returnByValue: true,
  awaitPromise: true,
});
console.log('cleared', JSON.stringify(r.result?.value));
ws.close();
