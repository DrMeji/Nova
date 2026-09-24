import http from 'http';
import WebSocket from 'ws';
import { normalizeAssistantLists } from '../src/lib/chatPlanMode.ts';
import { scrubHelpVoice } from '../src/lib/plainChatAsk.ts';

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

const needle = process.argv[2] || 'r56945';
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
  const needle = ${JSON.stringify(needle)};
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
  }
  for (const k of keys.reverse()) {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
    const hit = arr.some((m) => String(m.content || '').includes(needle));
    if (!hit) continue;
    const asst = [...arr].reverse().find((m) => m?.role === 'assistant' && !/^__generating__:/i.test(String(m.content || '')));
    return { k, text: String(asst?.content || ''), provider: asst?.provider_used || asst?.provider || null };
  }
  return { k: null, text: '', provider: null };
})()`);

const raw = String(snap.text || '');
const cleaned = scrubHelpVoice(normalizeAssistantLists(raw));
console.log(JSON.stringify({
  k: snap.k,
  provider: snap.provider,
  rawLen: raw.length,
  cleanedLen: cleaned.length,
  hasStarRaw: /[★☆✦]/.test(raw),
  hasStarClean: /[★☆✦]/.test(cleaned),
  hasWeHelpRaw: /We can definitely help/i.test(raw),
  hasWeHelpClean: /We can definitely help/i.test(cleaned),
  nums: [...cleaned.matchAll(/^\s*(\d+)\.\s+/gm)].map((m) => m[1]).join(','),
  cleanedPreview: cleaned.slice(0, 900),
}, null, 2));
ws.close();
