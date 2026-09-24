import http from 'http';
import WebSocket from 'ws';

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

const list = await fetchJson('http://127.0.0.1:9333/json/list');
const page = list.find((t) => t.type === 'page');
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
const evalE = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true, userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
await send('Runtime.enable');
const snap = await evalE(`(() => {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
  }
  keys.sort();
  const k = keys[keys.length - 1];
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch {}
  const asst = [...arr].reverse().find(m => m?.role === 'assistant' && !/^__generating__:/i.test(String(m.content||'')));
  const text = String(asst?.content || '');
  return {
    k,
    len: arr.length,
    textLen: text.length,
    provider: asst?.provider_used || asst?.provider || null,
    text,
    hasVite: /Vite|proceed with creating|what directory/i.test(text),
    sectionHints: {
      ack: /acknowledge|frustrating|losing track|tricky/i.test(text),
      fields: /stall|vendor|product|field/i.test(text),
      search: /search|filter|sort/i.test(text),
      flows: /add|edit|update|day/i.test(text),
      later: /later|nice|future|could also/i.test(text),
      ask: /\\?/.test(text),
    },
  };
})()`);
console.log(JSON.stringify({
  ...snap,
  textPreview: snap.text.slice(0, 500),
  textTail: snap.text.slice(-400),
}, null, 2));
ws.close();
