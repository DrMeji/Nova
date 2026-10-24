import http from 'http';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const list = await new Promise((resolve, reject) => {
  http.get(`http://127.0.0.1:${PORT}/json/list`, (res) => {
    let b = '';
    res.on('data', (c) => (b += c));
    res.on('end', () => {
      try { resolve(JSON.parse(b)); } catch (e) { reject(e); }
    });
  }).on('error', reject);
});
const page = list.find((t) => t.type === 'page' && /index\.html|localhost/i.test(t.url || ''))
  || list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('no page');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
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
    expression, returnByValue: true, awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
await send('Runtime.enable');

const snap = await evalE(`(() => {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) keys.push(k);
  }
  const studioKeys = keys.filter((k) => /studio|diskRoot|project|workspace|create/i.test(k)).sort();
  const out = { studio: {}, thread: null };
  for (const k of studioKeys.slice(-40)) {
    try {
      const v = localStorage.getItem(k);
      out.studio[k.slice(-48)] = String(v || '').slice(0, 240);
    } catch {}
  }
  const threadKeys = keys.filter((k) => /NOVA:chat-thread:chat:/.test(k)).sort();
  const last = threadKeys[threadKeys.length - 1];
  if (last) {
    try {
      const arr = JSON.parse(localStorage.getItem(last) || '[]');
      const users = arr.filter((m) => m?.role === 'user').map((m) => String(m.content || '').slice(0, 120));
      const asst = [...arr].reverse().find((m) => m?.role === 'assistant' && !/^__generating__:/i.test(String(m.content || '')));
      out.thread = { key: last.slice(-32), users, asst: String(asst?.content || '').slice(0, 400), n: arr.length };
    } catch {}
  }
  // Prefer window-level studio refs if exposed
  out.href = location.href;
  out.folderText = [...document.querySelectorAll('*')]
    .map((el) => (el.textContent || '').trim())
    .filter((t) => /Desktop|Projects|My App|rename|cli/i.test(t) && t.length < 120)
    .slice(0, 15);
  return out;
})()`);

console.log(JSON.stringify(snap, null, 2));

// Also try desktop IPC for current disk root via novaDesktop if present
const disk = await evalE(`(async () => {
  try {
    if (!window.novaDesktop) return { ok: false, why: 'no-novaDesktop' };
    const roots = await window.novaDesktop.browseRoots?.();
    return { ok: true, roots: roots?.roots?.map((r) => ({ id: r.id, path: r.path })) || null };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
})()`);
console.log('roots', JSON.stringify(disk, null, 2));
ws.close();
