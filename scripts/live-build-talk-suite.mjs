/**
 * Live suite: exploratory build talk + business/how-to asks.
 * Flags truncated replies, scaffolds, and off-topic answers.
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9272);
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
const page = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''))
  || list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('NOVA page missing — start Open-NOVA-Build');

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
await send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(2500);
await evalE(`(() => {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && /chat-thread|recent-chats|chat-studio|recent-projects|last-disk/i.test(k)) localStorage.removeItem(k);
  }
  return true;
})()`);
await send('Page.reload', { ignoreCache: true });
await sleep(3500);
{
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const n = await evalE('document.querySelectorAll("textarea").length');
    if (n > 0) break;
    await sleep(400);
  }
}

async function clickNewChat() {
  return evalE(`(() => {
    const btns = [...document.querySelectorAll('button, a, [role="button"]')];
    const hit = btns.find(b => /new chat/i.test((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')));
    if (hit) { hit.click(); return 'clicked'; }
    return 'none';
  })()`);
}

async function sendAsk(text) {
  const before = await evalE(`(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
    }
    keys.sort();
    const k = keys[keys.length - 1];
    if (!k) return { count: 0 };
    try {
      const arr = JSON.parse(localStorage.getItem(k) || '[]');
      return { count: Array.isArray(arr) ? arr.length : 0, key: k };
    } catch { return { count: 0 }; }
  })()`);

  const setExpr = `(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return false;
    const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    d.set.call(ta, ${JSON.stringify(text)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
    return true;
  })()`;
  const ok = await evalE(setExpr);
  if (!ok) throw new Error('no textarea');

  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    await sleep(1200);
    const snap = await evalE(`(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
      }
      keys.sort();
      const k = keys[keys.length - 1];
      if (!k) return null;
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { return null; }
      if (!Array.isArray(arr) || !arr.length) return null;
      const last = arr[arr.length - 1];
      const prev = arr[arr.length - 2];
      const lastRole = String(last?.role || '');
      const lastContent = String(last?.content || '');
      const generating = /^__generating__:/i.test(lastContent);
      const userHit = arr.some(m => m?.role === 'user' && String(m.content || '').includes(${JSON.stringify(text.slice(0, 24))}));
      return {
        key: k,
        len: arr.length,
        lastRole,
        generating,
        userHit,
        provider: last?.provider_used || last?.provider || null,
        content: lastRole === 'assistant' && !generating ? lastContent : '',
        prevUser: prev?.role === 'user' ? String(prev.content || '').slice(0, 80) : '',
      };
    })()`);
    if (
      snap
      && snap.userHit
      && snap.lastRole === 'assistant'
      && !snap.generating
      && String(snap.content || '').trim().length > 20
      && snap.len > (before?.count || 0)
    ) {
      await sleep(400);
      return {
        meta: snap.provider || 'ok',
        text: String(snap.content || '').trim().slice(0, 1600),
      };
    }
  }
  return { meta: 'timeout', text: '' };
}

function scoreReply(prompt, reply) {
  const flags = [];
  const t = String(reply || '');
  if (!t || t.length < 40) flags.push('too-short');
  if (/[:：]\s*$/.test(t)) flags.push('ends-with-colon');
  if (/\bhere(?:'s| is) (?:a |the )?(?:basic )?(?:structure|example)\b/i.test(t) && t.length < 280) {
    flags.push('truncated-scaffold-tease');
  }
  if (/NOVA · scaffold|Files written|Created .*Path/i.test(t)) flags.push('scaffolded');
  if (/live model connected/i.test(t)) flags.push('false-no-model');
  if (/familiar/i.test(prompt) && /^```/.test(t.trim())) flags.push('code-dump-on-familiarity');
  if (/@@@FILE\b/i.test(t)) flags.push('file-protocol-bleed');
  if (/:(?:javascript|typescript|python|java|cpp|jsx|tsx)\b/i.test(t)) flags.push('lang-tag-bleed');
  if (/^```/m.test(t) && /familiar|what would|how do|requirements|hardware|restaurant|business|learning to code/i.test(prompt)) {
    flags.push('code-fence-on-howto');
  }
  // Rough topic presence
  const topicHints = [];
  if (/discord/i.test(prompt)) topicHints.push(/discord/i);
  if (/netflix/i.test(prompt)) topicHints.push(/netflix|stream(?:ing)?|catalog/i);
  if (/keyboard/i.test(prompt)) topicHints.push(/keyboard|switch|pcb|keycap|hot[- ]?swap/i);
  if (/restaurant/i.test(prompt)) topicHints.push(/restaurant|menu|kitchen|permit|food/i);
  if (/business/i.test(prompt)) topicHints.push(/business|customer|product|revenue|plan/i);
  if (/coding|learn to code|start coding/i.test(prompt)) topicHints.push(/code|program|language|practice|project/i);
  if (topicHints.length && !topicHints.some((re) => re.test(t))) flags.push('off-topic');
  return flags;
}

const prompts = [
  'i want to build a app like discord, are you familiar with Discord the chat platform',
  'how would I actually build something like Discord — what do I need first',
  'i want to build something like Netflix, what would that take',
  'how do you build an actual gaming keyboard, like the hardware and parts',
  'how do I start a restaurant',
  'how do I start a small business',
  'how do I start learning to code',
];

console.log('=== LIVE BUILD / HOW-TO SUITE ===');

let failed = 0;
const rows = [];
for (const p of prompts) {
  console.log('\n>>>', p);
  await clickNewChat();
  await sleep(900);
  const r = await sendAsk(p);
  const flags = scoreReply(p, r.text);
  console.log(r.meta);
  console.log(r.text.slice(0, 700));
  if (flags.length) {
    console.log('FLAGS:', flags.join(', '));
    failed += 1;
  } else {
    console.log('OK');
  }
  rows.push({ prompt: p, meta: r.meta, flags, len: r.text.length });
  await sleep(500);
}

console.log('\n=== SUMMARY ===');
for (const row of rows) {
  console.log(`- (${row.len} chars) ${row.flags.length ? 'FAIL ' + row.flags.join('|') : 'PASS'} :: ${row.prompt.slice(0, 60)}`);
}
ws.close();
if (failed) {
  console.log(`\n${failed}/${rows.length} failed`);
  process.exit(1);
}
console.log(`\nAll ${rows.length} live asks passed`);
