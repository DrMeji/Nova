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
const nova = list.find((t) => /nova/i.test(String(t.title || '')) && /file:/i.test(String(t.url || '')))
  || list.find((t) => /nova/i.test(String(t.title || '')));
async function attach(url) {
  const ws = new WebSocket(url);
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
  const evalE = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  return { ws, send, evalE };
}
const { ws, evalE } = await attach(nova.webSocketDebuggerUrl);
try { await evalE('window.novaDesktop.previewCloseLive?.({})'); } catch { /* ignore */ }
await new Promise((r) => setTimeout(r, 300));
const opened = await evalE(`(async () => window.novaDesktop.previewOpenWindow({
  url: 'http://127.0.0.1:5200/',
  title: 'La Strado',
  show: true,
  projectId: 'la-strado',
  forceNavigate: true,
}))()`);
console.log('opened', opened);
ws.close();
await new Promise((r) => setTimeout(r, 2500));
const list2 = await new Promise((res, rej) => {
  http.get(`http://127.0.0.1:${PORT}/json/list`, (r) => {
    let b = '';
    r.on('data', (c) => (b += c));
    r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej);
});
const prev = list2.find((t) => String(t.url || '').includes('5200'));
const { ws: ws2, evalE: eval2 } = await attach(prev.webSocketDebuggerUrl);
const snap = await eval2(`({
  title: document.title,
  h1: document.querySelector('h1')?.textContent,
  mice: [...document.querySelectorAll('.rail-card strong')].map((n) => n.textContent),
  softBroken: /Input|leather|Trail Sling/i.test(document.body?.innerText || ''),
})`);
console.log(JSON.stringify(snap, null, 2));
ws2.close();
