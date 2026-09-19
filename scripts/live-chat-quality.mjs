/**
 * Live chat quality pass via CDP (port 9272).
 * Sends prompts one-by-one and prints assistant replies + latency.
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9272);

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
let page = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''));
if (!page) page = list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('NOVA page not found — is Open-NOVA-Build running?');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.once('open', resolve);
  ws.once('error', reject);
});
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

await send('Page.enable');
await send('Runtime.enable');
const href = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
if (!/localhost:5173/i.test(String(href.result?.value || ''))) {
  await send('Page.navigate', { url: 'http://localhost:5173/' });
  await new Promise((r) => setTimeout(r, 2500));
}

async function evalExpr(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}

// Soft wipe + new chat via UI if possible
await evalExpr(`(() => {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (/chat-thread|recent-chats|chat-studio|chat-code-pill|last-disk-target|recent-projects/i.test(k)) {
      localStorage.removeItem(k);
    }
  }
  return true;
})()`);
await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 2800));

async function clickNewChat() {
  return evalExpr(`(() => {
    const btns = [...document.querySelectorAll('button, a, [role="button"]')];
    const hit = btns.find(b => /new chat/i.test((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')));
    if (hit) { hit.click(); return 'clicked'; }
    // fallback: hash / keyboard path
    const plus = btns.find(b => /\\+$|new/i.test(b.getAttribute('aria-label') || ''));
    if (plus) { plus.click(); return 'plus'; }
    return 'none';
  })()`);
}

async function setComposer(text) {
  const expr = `(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return false;
    const native = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    native.set.call(ta, ${JSON.stringify(text)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;
  return evalExpr(expr);
}

async function pressEnter() {
  return evalExpr(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return false;
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    return true;
  })()`);
}

async function lastAssistant() {
  return evalExpr(`(() => {
    const nodes = [...document.querySelectorAll('[class*="message"], [data-role], article, .prose, div')];
    // Prefer explicit assistant meta line
    const metas = [...document.body.innerText.matchAll(/Responded in ([\\d.]+)\\s*s[^\\n]*/g)];
    const text = document.body.innerText || '';
    return { meta: metas.length ? metas[metas.length - 1][0] : null, sample: text.slice(-1800) };
  })()`);
}

async function waitForReply(prevSample, timeoutMs = 90000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1200));
    last = await lastAssistant();
    const sample = String(last?.sample || '');
    if (/Responded in /i.test(sample) && sample !== prevSample) {
      // settle: two stable reads
      await new Promise((r) => setTimeout(r, 1500));
      const again = await lastAssistant();
      if (String(again?.sample || '') === sample || /Responded in /i.test(String(again?.sample || ''))) {
        return again;
      }
    }
  }
  return last;
}

const prompts = [
  'hello',
  'what can you do for me',
  'what is the weather like in Seattle',
  'who is Elon Musk',
  'recommend a good sci-fi movie and its rating',
  'good Italian restaurants in downtown Seattle',
];

console.log('=== LIVE CHAT PASS ===');
await clickNewChat();
await new Promise((r) => setTimeout(r, 1200));

for (const p of prompts) {
  const before = await lastAssistant();
  console.log('\\n>>> USER:', p);
  await setComposer(p);
  await pressEnter();
  const after = await waitForReply(String(before?.sample || ''));
  const sample = String(after?.sample || '');
  // Extract roughly the last assistant block
  const idx = sample.lastIndexOf(p);
  const tail = idx >= 0 ? sample.slice(idx + p.length) : sample.slice(-900);
  console.log('META:', after?.meta || '(none)');
  console.log('REPLY_TAIL:\\n' + tail.trim().slice(0, 900));
  // Flags
  if (/Responded in \\d+\\s*ms/i.test(String(after?.meta || '')) && /hello/i.test(p)) {
    console.log('FLAG: instant ms reply on hello (possible canned)');
  }
  if (/File Management|Personal Assistance|Educational Resources|Entertainment/i.test(tail) && /what can you do/i.test(p)) {
    console.log('FLAG: generic capability laundry list');
  }
  if (/NOVA · scaffold|Files written|Created .*Path/i.test(tail)) {
    console.log('FLAG: scaffold leaked into chat');
  }
}

console.log('\\n=== NEW CHAT: exploratory build ===');
await clickNewChat();
await new Promise((r) => setTimeout(r, 1500));
const buildAsk = 'i want to build a app like discord, are you familiar with Discord the chat platform';
const before2 = await lastAssistant();
console.log('\\n>>> USER:', buildAsk);
await setComposer(buildAsk);
await pressEnter();
const after2 = await waitForReply(String(before2?.sample || ''), 120000);
const tail2 = String(after2?.sample || '').slice(-1200);
console.log('META:', after2?.meta || '(none)');
console.log('REPLY_TAIL:\\n' + tail2.trim().slice(0, 1000));
if (/NOVA · scaffold|Files written|Created .*Path/i.test(tail2)) {
  console.log('FAIL: scaffolded instead of talking');
  process.exitCode = 2;
} else {
  console.log('PASS: no scaffold on exploratory Discord ask');
}

ws.close();
console.log('\\n=== DONE ===');
