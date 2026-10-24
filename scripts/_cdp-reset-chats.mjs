/**
 * Wipe Nova chat threads / create jobs and open a blank chat.
 *   $env:NOVA_CDP_PORT='9229'; npx tsx --tsconfig tsconfig.app.json scripts/_cdp-reset-chats.mjs
 */
import http from 'http';
import WebSocket from 'ws';

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
// Stop sticky timers first.
await evalE(`(() => {
  for (const b of document.querySelectorAll('button, [role="button"]')) {
    const t = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).trim().toLowerCase();
    if (t === 'stop' || /^stop\\b/.test(t)) { b.click(); break; }
  }
  return true;
})()`);
await new Promise((r) => setTimeout(r, 600));
const out = await evalE(`(() => {
  const kill = [];
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (/NOVA:(?:chat-thread|chat-meta|chats|recent-projects|create-job|pending-greenfield|chat-studio|disk-target|agent-continue|build-diag)/i.test(k)) {
      kill.push(k);
      localStorage.removeItem(k);
    }
  }
  location.hash = '#/chat?new=' + Date.now();
  return { killed: kill.length };
})()`);
console.log(JSON.stringify(out));
ws.close();
