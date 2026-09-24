/**
 * Wipe Nova chats + recent projects from the live renderer (keep prefs/auth).
 * Env: NOVA_CDP_PORT (default 9340)
 */
import http from 'http';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PORT = Number(process.env.NOVA_CDP_PORT || 9340);

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
const page = list.find((t) => t.type === 'page' && /index\.html|localhost/i.test(t.url || ''))
  || list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('NOVA page not found');

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

await send('Runtime.enable');
const r = await send('Runtime.evaluate', {
  expression: `(() => {
    const remove = [];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (/chat-thread|recent-chats|chat-studio|chat-code-pill|apply-snapshot|last-edit|pending-add|last-disk-target|recent-projects|deleted-chat|deleted-project|deleted-media|inflight|chat-turn/i.test(k)) {
        remove.push(k);
        localStorage.removeItem(k);
      }
    }
    try { sessionStorage.clear(); } catch {}
    return { removed: remove.length, sample: remove.slice(0, 16) };
  })()`,
  returnByValue: true,
});
console.log('cleared storage', JSON.stringify(r.result?.value || r, null, 2));

// Remove leftover MossMarket / NOVA scaffold folders so create starts clean.
const home = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const wiped = [];
if (fs.existsSync(home)) {
  for (const name of fs.readdirSync(home)) {
    if (!/^(NOVA|MossMarket|QuietShelf)/i.test(name)) continue;
    const full = path.join(home, name);
    try {
      fs.rmSync(full, { recursive: true, force: true });
      wiped.push(name);
    } catch (e) {
      console.warn('could not remove', full, e.message);
    }
  }
}
console.log('wiped folders', wiped);

await send('Page.reload', { ignoreCache: true });
await new Promise((res) => setTimeout(res, 2500));
ws.close();
console.log('fresh wipe done');
