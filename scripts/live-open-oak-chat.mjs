/**
 * Open the chat thread that successfully created the blank Oak page, then
 * optionally send a follow-up prompt (args after --send).
 *
 *   node scripts/live-open-oak-chat.mjs
 *   node scripts/live-open-oak-chat.mjs --send "put the name..."
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const args = process.argv.slice(2);
const sendIdx = args.indexOf('--send');
const followUp = sendIdx >= 0 ? args.slice(sendIdx + 1).join(' ').trim() : '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    expression, returnByValue: true, awaitPromise: true, userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
await send('Runtime.enable');

const picked = await evalE(`(() => {
  let best = null;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !/NOVA:chat-thread:chat:/.test(k)) continue;
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
    const blob = arr.map((m) => String(m.content || '')).join('\\n');
    const user = [...arr].reverse().find((m) => m.role === 'user');
    const last = arr[arr.length - 1];
    const lastText = String(last?.content || '');
    // Prefer the successful blank-page create (nova-trace done / Live ready), not old fail chats.
    const isBlankAsk = /plain white blank page|nothing else yet/i.test(String(user?.content || ''));
    if (!isBlankAsk) continue;
    const score =
      (/nova-trace|Live ready|Blank page Live|quality verified/i.test(lastText) ? 100 : 0)
      + (/won't compile|Self-closing/i.test(lastText) ? -50 : 0)
      + (/I am making/i.test(String(user?.content || '')) ? 5 : 0)
      + arr.length;
    if (!best || score > best.score) {
      best = { key: k, chatId: k.replace(/^.*chat:/, ''), score, user: String(user?.content || '').slice(0, 80) };
    }
  }
  return best;
})()`);

if (!picked?.chatId) {
  console.log('no-oak-blank-chat');
  ws.close();
  process.exit(1);
}

const opened = await evalE(`(() => {
  const chatId = ${JSON.stringify(picked.chatId)};
  try {
    if (typeof window.__NOVA_NAVIGATE__ === 'function') {
      window.__NOVA_NAVIGATE__({ name: 'chat', chatId });
      return 'navigate-fn';
    }
  } catch {}
  const els = [...document.querySelectorAll('button,[role=button],a,[data-chat-id]')];
  const hit = els.find((el) => {
    const id = el.getAttribute('data-chat-id') || '';
    const t = (el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '');
    return id === chatId || t.includes(chatId.slice(0, 8));
  });
  if (hit) { hit.click(); return 'ui'; }
  return null;
})()`);

console.log(JSON.stringify({ opened, chatId: picked.chatId, user: picked.user, score: picked.score }));
await sleep(800);

if (followUp) {
  const sent = await evalE(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) throw new Error('no textarea');
    const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    d.set.call(ta, ${JSON.stringify(followUp)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
    return true;
  })()`);
  console.log(sent ? `sent: ${followUp}` : 'send-failed');
}

ws.close();
