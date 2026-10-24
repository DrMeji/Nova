import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);

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
const page = (list || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl
  && (/NOVA|dist\/index|file:/i.test(`${t.title}${t.url}`))
  && !/127\.0\.0\.1:\d+|localhost:\d+/i.test(String(t.url || '')));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
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
const evalE = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
await send('Runtime.enable');
const snap = await evalE(`(() => {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (!/NOVA:chat-studio|NOVA:chat-studio-files|create-job|Oak-4|diskRoot/i.test(k)) continue;
    let v = localStorage.getItem(k) || '';
    if (v.length > 300) v = v.slice(0, 300) + '…';
    out.push({ k, v });
  }
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (!k) continue;
    if (!/nova-create-job|Oak/i.test(k)) continue;
    let j = null;
    try { j = JSON.parse(sessionStorage.getItem(k) || 'null'); } catch {}
    out.push({
      k,
      name: j?.name,
      path: j?.path,
      status: j?.status,
      obs: String(j?.lastObservation || '').slice(0, 120),
      chatId: j?.chatId,
    });
  }
  return out.slice(0, 40);
})()`);
console.log(JSON.stringify(snap, null, 2));
ws.close();
