/** Dump recent chat threads via CDP. */
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
if (!page) throw new Error('Nova page not on CDP');
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
  const threads = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !/NOVA:chat-thread:chat:/.test(k)) continue;
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
    if (!arr.length) continue;
    const users = arr.filter((m) => m.role === 'user').map((m) => String(m.content || '').slice(0, 100));
    const last = arr[arr.length - 1];
    threads.push({
      id: k.slice(-18),
      n: arr.length,
      users,
      lastRole: last?.role,
      last: String(last?.content || '').slice(0, 180),
      gen: last?.role === 'assistant' && /^__generating__/i.test(String(last.content || '')),
    });
  }
  return threads.sort((a, b) => b.n - a.n).slice(0, 8);
})()`);
console.log(JSON.stringify(snap, null, 2));
ws.close();
