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
const page = list.find((t) => /nova/i.test(String(t.title || '')) && /file:/i.test(String(t.url || '')))
  || list.find((t) => /nova/i.test(String(t.title || '')));
if (!page?.webSocketDebuggerUrl) {
  console.log('no nova page', list.map((t) => t.title));
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
const evalE = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
await send('Runtime.enable');
const clicked = await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const live = els.find((el) => {
    const lab = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim();
    return lab === 'Live' || /^Live$/i.test(lab);
  });
  if (live) { live.click(); return 'live'; }
  return 'miss:' + els.map((el) => ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim().slice(0, 24)).filter(Boolean).slice(0, 12).join('|');
})()`);
console.log('click', clicked);
await new Promise((r) => setTimeout(r, 5000));
const list2 = await new Promise((res, rej) => {
  http.get(`http://127.0.0.1:${PORT}/json/list`, (r) => {
    let b = '';
    r.on('data', (c) => (b += c));
    r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej);
});
console.log(list2.map((t) => ({ t: t.title, u: String(t.url || '').slice(0, 90) })));
ws.close();
