/**
 * Live: new chat → talk about Discord → short convo → build it out.
 * Talk turns must stay prose (no scaffold / @@@FILE). Build turn should create.
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
    const btns = [...document.querySelectorAll('button, a, [role="button"], [data-testid]')];
    const score = (b) => {
      const t = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')).toLowerCase();
      if (/new chat/.test(t)) return 3;
      if (/^\\s*new\\s*$/.test((b.textContent || '').trim()) && /chat|compose|message/i.test(t + ' ' + (b.className || ''))) return 2;
      if (/new\\s+conversation|start\\s+(?:a\\s+)?(?:new\\s+)?chat/.test(t)) return 2;
      return 0;
    };
    const ranked = btns.map(b => ({ b, s: score(b) })).filter(x => x.s > 0).sort((a, c) => c.s - a.s);
    if (ranked[0]) { ranked[0].b.click(); return 'clicked:' + (ranked[0].b.textContent || '').trim().slice(0, 40); }
    // Fallback: navigate to blank chat route
    if (location.hash !== '#/chat' && !/\\/chat\\/?$/.test(location.pathname)) {
      location.hash = '#/chat';
      return 'hash-chat';
    }
    return 'none';
  })()`);
}

async function sendAsk(text, { timeoutMs = 180000 } = {}) {
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

  const ok = await evalE(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return false;
    const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    d.set.call(ta, ${JSON.stringify(text)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error('no textarea');

  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await sleep(1500);
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
      const lastRole = String(last?.role || '');
      const lastContent = String(last?.content || '');
      const generating = /^__generating__:/i.test(lastContent);
      const userHit = arr.some(m => m?.role === 'user' && String(m.content || '').includes(${JSON.stringify(text.slice(0, 28))}));
      const assistants = arr.filter(m => m?.role === 'assistant' && !/^__generating__:/i.test(String(m.content || '')));
      const lastAsst = assistants[assistants.length - 1];
      return {
        key: k,
        len: arr.length,
        lastRole,
        generating,
        userHit,
        provider: lastAsst?.provider_used || lastAsst?.provider || last?.provider_used || null,
        content: lastAsst ? String(lastAsst.content || '') : '',
        msgCount: arr.length,
      };
    })()`);
    if (
      snap
      && snap.userHit
      && !snap.generating
      && String(snap.content || '').trim().length > 20
      && snap.len > (before?.count || 0)
    ) {
      await sleep(500);
      return {
        meta: snap.provider || 'ok',
        text: String(snap.content || '').trim(),
        len: snap.msgCount,
      };
    }
  }
  return { meta: 'timeout', text: '', len: 0 };
}

function talkFlags(prompt, reply) {
  const flags = [];
  const t = String(reply || '');
  if (!t || t.length < 40) flags.push('too-short');
  if (/NOVA · scaffold|Files written|Created .*Path/i.test(t)) flags.push('scaffolded-too-early');
  if (/@@@FILE\b/i.test(t)) flags.push('file-protocol-bleed');
  if (/:(?:javascript|typescript|python|cpp|jsx)\b/i.test(t)) flags.push('lang-tag-bleed');
  if (/^```/m.test(t.trim()) && t.length < 200) flags.push('code-dump');
  if (/discord/i.test(prompt) && !/discord/i.test(t)) flags.push('off-topic');
  return flags;
}

function buildFlags(reply) {
  const flags = [];
  const t = String(reply || '');
  if (!t || t.length < 20) flags.push('too-short');
  if (/scaffold only — UI not Preview-ready/i.test(t)) flags.push('ui-not-ready');
  // Instant title-splash scaffold is a fail — must clear create polish / chat shell.
  if (/NOVA · scaffold/i.test(t) && !/NOVA · create/i.test(t)) flags.push('scaffold-only');
  const created = /NOVA · create|Files written|Created |Preview|chat layout|Discord-like|server/i.test(t)
    || /@@@FILE\b/i.test(t)
    || /src\/App\.(jsx|tsx|css)/i.test(t);
  if (!created) flags.push('no-build-signal');
  return flags;
}

console.log('=== LIVE DISCORD TALK → BUILD ===');
const newHit = await clickNewChat();
console.log('New chat:', newHit);
await sleep(1000);

const turns = [
  {
    phase: 'talk',
    prompt: 'i want to build a app like discord, are you familiar with Discord the chat platform',
  },
  {
    phase: 'talk',
    prompt: 'cool — what are the main pieces of Discord I would need to recreate first, like servers channels and chat',
  },
  {
    phase: 'talk',
    prompt: 'got it. keep it high level for now — what would a simple MVP look like before we write any files',
  },
  {
    phase: 'build',
    prompt: 'ok lets build this out now — create a Discord-like chat web app called PulseCord with servers, channels, and a chat pane',
    timeoutMs: 420000,
  },
];

let failed = 0;
const rows = [];

for (const turn of turns) {
  console.log(`\n>>> [${turn.phase}] ${turn.prompt}`);
  const r = await sendAsk(turn.prompt, { timeoutMs: turn.timeoutMs || 180000 });
  const flags = turn.phase === 'talk' ? talkFlags(turn.prompt, r.text) : buildFlags(r.text);
  console.log(r.meta);
  console.log(r.text.slice(0, 900));
  if (flags.length) {
    console.log('FLAGS:', flags.join(', '));
    failed += 1;
  } else {
    console.log(turn.phase === 'talk' ? 'OK talk' : 'OK build');
  }
  rows.push({ phase: turn.phase, flags, len: r.text.length, meta: r.meta });
  await sleep(800);
}

console.log('\n=== SUMMARY ===');
for (const row of rows) {
  console.log(`- [${row.phase}] (${row.len} chars) ${row.flags.length ? 'FAIL ' + row.flags.join('|') : 'PASS'} · ${row.meta}`);
}
ws.close();
if (failed) {
  console.log(`\n${failed}/${rows.length} failed`);
  process.exit(1);
}
console.log(`\nAll ${rows.length} turns passed`);
