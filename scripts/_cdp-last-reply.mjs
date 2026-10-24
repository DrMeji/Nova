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
const page = list.find((t) => t.type === 'page') || list[0];
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
    if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
  }
  keys.sort();
  const out = [];
  for (const k of keys.slice(-4)) {
    try {
      const arr = JSON.parse(localStorage.getItem(k) || '[]');
      const users = arr.filter((m) => m?.role === 'user').map((m) => String(m.content || '').slice(0, 80));
      const asst = [...arr].reverse().find((m) => m?.role === 'assistant' && !/^__generating__:/i.test(String(m.content || '')));
      const raw = String(asst?.content || '');
      out.push({
        k: k.slice(-28),
        users,
        hasTrace: /nova-trace|<!--nova-agent-trace|Files changed|fileChanges/i.test(raw),
        rawHead: raw.slice(0, 500),
        stop: [...document.querySelectorAll('button')].some((b) => /^stop$/i.test((b.textContent || '').trim())),
      });
    } catch {}
  }
  return out;
})()`);
console.log(JSON.stringify(snap, null, 2));

const root = 'C:/Users/thoma/Documents/NOVA Projects';
const dirs = fs.readdirSync(root).map((n) => {
  const p = path.join(root, n);
  return { n, p, t: fs.statSync(p).mtimeMs };
}).sort((a, b) => b.t - a.t).slice(0, 3);
for (const d of dirs) {
  const files = [];
  const walk = (dir, base = dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name !== 'node_modules') walk(fp, base);
      } else files.push(path.relative(base, fp).replace(/\\/g, '/'));
    }
  };
  walk(d.p);
  console.log('\\nPROJECT', d.n, files.join(', '));
  if (files.includes('bin/cli.js')) {
    console.log('CLI', fs.readFileSync(path.join(d.p, 'bin/cli.js'), 'utf8').slice(0, 400));
  }
  if (files.includes('package.json')) {
    console.log('PKG', fs.readFileSync(path.join(d.p, 'package.json'), 'utf8').slice(0, 350));
  }
}
ws.close();
