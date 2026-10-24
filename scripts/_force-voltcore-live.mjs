import http from 'http';
import fs from 'fs';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9301);
// Prefer App Live (:5206) — that's the window Nova chat actually owns.
const URL = process.env.VOLTCORE_URL || 'http://127.0.0.1:5206/';

const list = await new Promise((res, rej) => {
  http.get(`http://127.0.0.1:${PORT}/json/list`, (r) => {
    let b = '';
    r.on('data', (c) => (b += c));
    r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej);
});
const nova = list.find((t) => /nova/i.test(String(t.title || '')) && /file:/i.test(String(t.url || '')))
  || list.find((t) => /nova/i.test(String(t.title || '')));
if (!nova?.webSocketDebuggerUrl) {
  console.log('no nova');
  process.exit(1);
}

async function attach(wsUrl) {
  const ws = new WebSocket(wsUrl);
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
  return { ws, send, evalE };
}

const { ws, evalE } = await attach(nova.webSocketDebuggerUrl);
// Close junk Live first
try {
  await evalE(`window.novaDesktop.previewCloseLive?.({})`);
} catch { /* ignore */ }
await new Promise((r) => setTimeout(r, 400));
const opened = await evalE(`(async () => {
  return await window.novaDesktop.previewOpenWindow({
    url: ${JSON.stringify(URL)},
    title: 'VoltCore GPUs',
    show: true,
    projectId: 'App',
    forceNavigate: true,
  });
})()`);
console.log('opened', opened);
await new Promise((r) => setTimeout(r, 3500));

const list2 = await new Promise((res, rej) => {
  http.get(`http://127.0.0.1:${PORT}/json/list`, (r) => {
    let b = '';
    r.on('data', (c) => (b += c));
    r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej);
});
console.log('pages', list2.map((t) => ({ t: t.title, u: String(t.url || '').slice(0, 90) })));
const wantHost = (() => { try { return new URL(URL).host; } catch { return '127.0.0.1:5206'; } })();
const prev = list2.find((t) => String(t.url || '').includes(wantHost))
  || list2.find((t) => /voltcore/i.test(String(t.title || '')))
  || list2.find((t) => /127\.0\.0\.1:\d{4}/.test(String(t.url || '')));
ws.close();

if (!prev?.webSocketDebuggerUrl) {
  console.log('no preview window');
  process.exit(1);
}

const { ws: ws2, send, evalE: eval2 } = await attach(prev.webSocketDebuggerUrl);
await send('Page.enable');
if (!String(prev.url || '').includes(wantHost)) {
  await send('Page.navigate', { url: URL });
  await new Promise((r) => setTimeout(r, 2500));
}
const snap = await eval2(`({
  url: location.href,
  title: document.title,
  cards: document.querySelectorAll('.gpu-card').length,
  softBroken: /can.t show|broken/i.test(document.body.innerText || ''),
  text: (document.body.innerText || '').slice(0, 280),
})`);
console.log('live', JSON.stringify(snap, null, 2));
const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
fs.writeFileSync('C:/Users/thoma/Desktop/Projects/Nova/.tmp-voltcore-live.png', Buffer.from(shot.data, 'base64'));
console.log('shot ok');
ws2.close();
