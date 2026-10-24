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
    if (!k || !/NOVA:chat-thread:chat:/.test(k)) continue;
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
    const user = [...arr].reverse().find((m) => m.role === 'user');
    if (!/plain white blank page/i.test(String(user?.content || ''))) continue;
    const asst = [...arr].reverse().find((m) => m.role === 'assistant' && !/^__generating__/i.test(String(m.content || '')));
    if (!asst) continue;
    let text = String(asst.content || '');
    const tm = text.match(/<!--nova-trace:([\\s\\S]*?)-->/);
    let badge = null;
    let path = null;
    let answer = '';
    if (tm) {
      try {
        const p = JSON.parse(tm[1]);
        badge = p.buildBadge || null;
        path = p.projectPath || null;
        answer = String(p.answer || '').trim();
      } catch {}
      text = text.replace(/<!--nova-trace:[\\s\\S]*?-->/g, '').trim();
    }
    const body = answer || text;
    out.push({
      path,
      badge,
      answer: body.slice(0, 500),
      hasFolderBullet: /-\\s*\\*?\\*?Folder\\*?\\*?\\s*:/i.test(body),
      hasPkgLine: /Package build/i.test(body),
      hasClickLive: /Click \\*\\*Live\\*\\*/i.test(body),
    });
  }
  // Prefer newest Oak-2 / buildBadge present
  out.sort((a, b) => {
    const score = (x) => (x.badge ? 10 : 0) + (x.hasClickLive ? 5 : 0) + (x.hasFolderBullet ? -5 : 0) + (x.hasPkgLine ? -5 : 0);
    return score(b) - score(a);
  });
  return out.slice(0, 3);
})()`);
console.log(JSON.stringify(snap, null, 2));
ws.close();
