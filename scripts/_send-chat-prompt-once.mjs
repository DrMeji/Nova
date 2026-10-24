/**
 * Send ONE chat prompt via CDP and wait for assistant handback (no invent matrix).
 *
 *   $env:NOVA_CDP_PORT='9297'
 *   $env:NOVA_CHAT_PROMPT='...'
 *   node scripts/_send-chat-prompt-once.mjs
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9297);
const PROMPT = String(process.env.NOVA_CHAT_PROMPT || '').trim();
const TIMEOUT_MS = Number(process.env.NOVA_CHAT_TIMEOUT_MS || 12 * 60_000);
const NEW_CHAT = process.env.NOVA_CHAT_NEW !== '0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TEST_STARTED_AT = Date.now();

if (!PROMPT) {
  console.error('Set NOVA_CHAT_PROMPT');
  process.exit(1);
}

const list = await new Promise((res, rej) => {
  http.get(`http://127.0.0.1:${PORT}/json/list`, (r) => {
    let b = '';
    r.on('data', (c) => (b += c));
    r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej);
});
const pages = (list || []).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
const page = pages.find((t) => /nova/i.test(`${t.title || ''} ${t.url || ''}`) && !/127\.0\.0\.1:\d{4}/.test(t.url || ''))
  || pages.find((t) => /nova/i.test(`${t.title || ''} ${t.url || ''}`))
  || pages[0];
if (!page?.webSocketDebuggerUrl) throw new Error(`NOVA missing on CDP ${PORT}`);
console.log('CDP:', (page.title || '').slice(0, 40), (page.url || '').slice(0, 70));

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(JSON.stringify(m.error)));
    else resolve(m.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  pending.set(i, { resolve, reject });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evalE = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');

const clickChat = `(() => {
  const els = [...document.querySelectorAll('button,[role=button],a,[data-nova-nav]')];
  const labelOf = (el) => ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim();
  const exact = els.filter((el) => (el.getAttribute('aria-label') || '') === 'Chat');
  if (exact[0]) { exact[0].click(); return 'chat'; }
  const soft = els.find((el) => /^chat$/i.test(labelOf(el)));
  if (soft) { soft.click(); return 'soft'; }
  return 'miss';
})()`;
const hasComposer = `Boolean(
  document.querySelector('textarea.nova-composer-textarea')
  || document.querySelector('[data-ark-composer] textarea')
  || document.querySelector('textarea')
)`;

await evalE(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))`);
await sleep(400);
await evalE(clickChat);
{
  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < 45_000) {
    ok = Boolean(await evalE(hasComposer).catch(() => false));
    if (ok) break;
    await sleep(700);
    await evalE(clickChat).catch(() => {});
  }
  if (!ok) {
    console.error('FAIL: no composer');
    process.exit(1);
  }
}

if (NEW_CHAT) {
  await evalE(`(() => {
    const btns = [...document.querySelectorAll('button,[role=button]')];
    const neu = btns.find((b) => /new chat|new conversation/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
    if (neu) { neu.click(); return 'new'; }
    return 'skip';
  })()`);
  await sleep(1000);
}

const needle = PROMPT.slice(0, 48);
console.log('=== PROMPT ===');
console.log(PROMPT);

await evalE(`(() => {
  const ta = document.querySelector('textarea.nova-composer-textarea')
    || document.querySelector('[data-ark-composer] textarea')
    || document.querySelector('textarea');
  if (!ta) throw new Error('no textarea');
  const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  d.set.call(ta, ${JSON.stringify(PROMPT)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  return true;
})()`);

const t0 = Date.now();
let lastStatus = '';
while (Date.now() - t0 < TIMEOUT_MS) {
  await sleep(2500);
  const snap = await evalE(`(() => {
    const needle = ${JSON.stringify(needle)};
    const startedAt = ${JSON.stringify(TEST_STARTED_AT)};
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
    }
    for (const k of keys) {
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
      let userIdx = -1;
      for (let i = arr.length - 1; i >= 0; i--) {
        const c = String(arr[i]?.content || '');
        if (arr[i]?.role === 'user' && c.includes(needle)) { userIdx = i; break; }
      }
      if (userIdx < 0) continue;
      const last = arr[arr.length - 1];
      const content = String(last?.content || '');
      if (last?.role === 'assistant' && /^__generating__:/i.test(content)) {
        return { generating: true, status: content.slice(0, 160) };
      }
      if (last?.role === 'assistant' && userIdx < arr.length - 1 && !/^__generating__:/i.test(content)) {
        const ts = Number(last?.createdAt || last?.ts || 0);
        if (ts && ts + 2000 < startedAt) continue;
        return { done: true, reply: content.slice(0, 900), meta: String(last?.model || last?.engine || '') };
      }
    }
    return { waiting: true };
  })()`).catch(() => ({ waiting: true }));

  if (snap?.generating) {
    const s = String(snap.status || '');
    if (s !== lastStatus) {
      lastStatus = s;
      console.log('status:', s.replace(/^__generating__:/i, '').slice(0, 100));
    }
    continue;
  }
  if (snap?.done) {
    console.log('meta:', snap.meta || '');
    console.log('--- reply ---');
    console.log(snap.reply);
    console.log('PASS: prompt handback');
    ws.close();
    process.exit(0);
  }
}

console.error('FAIL: timeout waiting for reply');
ws.close();
process.exit(1);
