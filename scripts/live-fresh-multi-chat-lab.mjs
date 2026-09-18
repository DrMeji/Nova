/**
 * Fresh multi-chat live lab (watch the NOVA window).
 * Chat1 gaming PC how-to · Chat2 app design talk (no create)
 * Chat3 friends convo · Chat4 talk → premium site create
 *
 *   $env:NOVA_CDP_PORT='9229'; node scripts/live-fresh-multi-chat-lab.mjs
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
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
const page = list.find((t) => t.type === 'page' && /NOVA|localhost:5173|index\.html/i.test(`${t.title} ${t.url}`))
  || list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error(`NOVA page missing on CDP ${PORT}`);

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

async function goToChat() {
  return evalE(`(() => {
    const els = [...document.querySelectorAll('button,[role=button],a')];
    const hits = els.filter(el => (el.getAttribute('aria-label') || '') === 'Chat');
    if (!hits.length) {
      location.hash = '#/chat';
      return 'hash-fallback';
    }
    hits.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
    hits[0].click();
    return 'clicked-chat';
  })()`);
}

async function waitForComposer(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const n = await evalE('document.querySelectorAll("textarea").length');
    if (n > 0) return true;
    await goToChat();
    await sleep(500);
  }
  return false;
}

console.log('Open Chat…', await goToChat());
await sleep(1200);
if (!(await waitForComposer(25000))) {
  throw new Error('Chat composer (textarea) never appeared — open Chat in the sidebar');
}

// Keep all prior chats visible — do NOT wipe threads.
console.log('Keeping existing chats (no wipe)');

// Unique tag so wait-logic does not latch onto an older identical prompt.
const LAB = `lab-${Date.now().toString(36)}`;
console.log('Lab tag:', LAB);

async function clickNewChat() {
  await goToChat();
  await sleep(800);
  const ready = await waitForComposer(10000);
  if (!ready) return 'no-composer';
  return evalE(`(() => {
    const btns = [...document.querySelectorAll('button, a, [role="button"], [data-testid]')];
    const score = (b) => {
      const t = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')).toLowerCase();
      if (/new chat/.test(t)) return 3;
      if (/^\\s*new\\s*$/.test((b.textContent || '').trim())) return 2;
      if (/new\\s+conversation|start\\s+(?:a\\s+)?(?:new\\s+)?chat/.test(t)) return 2;
      return 0;
    };
    const ranked = btns.map(b => ({ b, s: score(b) })).filter(x => x.s > 0).sort((a, c) => c.s - a.s);
    if (ranked[0]) { ranked[0].b.click(); return 'clicked:' + (ranked[0].b.textContent || '').trim().slice(0, 40); }
    location.hash = '#/chat';
    return 'hash-chat';
  })()`);
}

async function threadKeyHint() {
  return evalE(`(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
    }
    keys.sort();
    return keys[keys.length - 1] || null;
  })()`);
}

async function sendAsk(text, { timeoutMs = 180000, threadKey = null } = {}) {
  const needle = text.slice(0, 36);
  const before = await evalE(`(() => {
    const prefer = ${JSON.stringify(threadKey)};
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
    }
    const pick = prefer && keys.includes(prefer) ? prefer : null;
    if (!pick) return { count: 0, key: null, keys: keys.length };
    try {
      const arr = JSON.parse(localStorage.getItem(pick) || '[]');
      return { count: Array.isArray(arr) ? arr.length : 0, key: pick, keys: keys.length };
    } catch { return { count: 0, key: pick, keys: keys.length }; }
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
  if (!ok) {
    await goToChat();
    await sleep(800);
    const retry = await evalE(`(() => {
      const ta = document.querySelector('textarea');
      if (!ta) return false;
      const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      d.set.call(ta, ${JSON.stringify(text)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
      return true;
    })()`);
    if (!retry) throw new Error('no textarea');
  }

  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await sleep(1500);
    // Find the thread that actually contains this user prompt — never trust key sort.
    const snap = await evalE(`(() => {
      const prefer = ${JSON.stringify(threadKey || before?.key || null)};
      const needle = ${JSON.stringify(needle)};
      const beforeCount = ${JSON.stringify(before?.count || 0)};
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
      }
      let best = null;
      for (const k of keys) {
        let arr = [];
        try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
        if (!Array.isArray(arr) || !arr.length) continue;
        // Latest user turn that matches this prompt
        let userIdx = -1;
        for (let i = arr.length - 1; i >= 0; i--) {
          const m = arr[i];
          if (m?.role === 'user' && String(m.content || '').includes(needle)) { userIdx = i; break; }
        }
        if (userIdx < 0) continue;
        const last = arr[arr.length - 1];
        const generating = last?.role === 'assistant' && /^__generating__:/i.test(String(last?.content || ''));
        // Assistant must be AFTER this user turn
        let asst = null;
        for (let i = userIdx + 1; i < arr.length; i++) {
          const m = arr[i];
          if (m?.role === 'assistant' && !/^__generating__:/i.test(String(m.content || ''))) asst = m;
        }
        if (!asst && !generating) continue;
        // Prefer growing threads / preferred key; ignore stale completed matches
        if (prefer && k === prefer && arr.length <= beforeCount && !generating) continue;
        if (!prefer && arr.length <= 2 && userIdx === 0 && asst) {
          // brand new thread — ok
        } else if (!prefer && asst && userIdx < arr.length - 2 && arr.length > beforeCount + 2) {
          // likely stale older match — skip unless this is the newest user in thread
          const laterUser = arr.slice(userIdx + 1).some(m => m?.role === 'user');
          if (laterUser) continue;
        }
        const cand = {
          key: k,
          len: arr.length,
          generating,
          userHit: true,
          provider: asst?.provider_used || asst?.provider || null,
          content: asst ? String(asst.content || '') : '',
          score: (k === prefer ? 10000 : 0) + userIdx * 10 + arr.length,
        };
        if (!best || cand.score > best.score) best = cand;
      }
      return best;
    })()`);
    if (
      snap
      && snap.userHit
      && !snap.generating
      && String(snap.content || '').trim().length > 40
    ) {
      await sleep(400);
      return {
        meta: snap.provider || 'ok',
        text: String(snap.content || '').trim(),
        key: snap.key,
        len: snap.len,
      };
    }
  }
  return { meta: 'timeout', text: '', key: before?.key || null, len: 0 };
}

function scoreTalk(prompt, reply, { expectNoCreate = true, topics = [] } = {}) {
  const flags = [];
  const t = String(reply || '');
  if (!t || t.length < 80) flags.push('too-short');
  if (expectNoCreate) {
    if (/NOVA · scaffold|NOVA · create|Files written|Created .*Path/i.test(t)) flags.push('created-files');
    if (/@@@FILE\b/i.test(t)) flags.push('file-protocol');
  }
  for (const topic of topics) {
    if (!new RegExp(topic, 'i').test(t)) flags.push(`miss:${topic}`);
  }
  return flags;
}

function scoreBuild(reply) {
  const flags = [];
  const t = String(reply || '');
  if (!t || t.length < 40) flags.push('too-short');
  if (/scaffold only — UI not Preview-ready/i.test(t)) flags.push('ui-not-ready');
  if (/NOVA · scaffold/i.test(t) && !/NOVA · create/i.test(t)) flags.push('scaffold-only');
  const created = /NOVA · create|Files written|Created |Preview|ready for Live/i.test(t)
    || /@@@FILE\b/i.test(t)
    || /src\/App\.(jsx|tsx|css)/i.test(t);
  if (!created) flags.push('no-build-signal');
  return flags;
}

const suites = [
  {
    id: 'chat1-gaming-pc',
    title: 'CHAT 1 — Gaming PC how-to (no create)',
    turns: [
      {
        prompt: 'Hey — random question. How do I actually build a gaming PC from scratch? I have never done it.',
        topics: ['cpu|processor', 'motherboard|mobo', 'gpu|graphics|video card', 'ram|memory'],
      },
      {
        prompt: 'Okay go deeper on cooling and power. Do I need an AIO water cooler? What PSU wattage and cables matter?',
        topics: ['cooler|aio|liquid|air', 'psu|power|watt', 'cable|modular|eps|pcie'],
      },
      {
        prompt: 'Walk me through assembly order step by step — like what goes in the case first, then CPU, then RAM, then GPU. Also any static electricity tips.',
        topics: ['case|motherboard|install|order|step', 'static|ground|esd|bracelet'],
      },
      {
        prompt: 'Last one for this: common beginner mistakes that brick a build or make it crash, and a quick first-boot checklist.',
        topics: ['boot|bios|checklist|mistake|ram|cable'],
      },
    ],
  },
  {
    id: 'chat2-app-design',
    title: 'CHAT 2 — Talk about building an app (NO files)',
    turns: [
      {
        prompt: 'I want to build a mobile-first habit tracker app called Streakloom. Do NOT create any project or files yet — I only want to talk through the design.',
        topics: ['habit|streak|tracker', 'mvp|feature|screen'],
      },
      {
        prompt: 'Break down the fundamentals piece by piece: data model, auth, offline sync, and how notifications would work.',
        topics: ['data|model|schema|store', 'auth|login|account', 'offline|sync', 'notif'],
      },
      {
        prompt: 'What are the biggest security risks for an app like this — storing habits, maybe health notes, and user accounts? How would you harden it?',
        topics: ['secur|encrypt|token|password|privacy|risk'],
      },
      {
        prompt: 'Give me a build order: week 1, week 2, week 3 — still planning only, no scaffolding.',
        topics: ['week|phase|first|mvp'],
      },
    ],
  },
  {
    id: 'chat3-friends',
    title: 'CHAT 3 — Normal conversation (making friends)',
    turns: [
      {
        prompt: 'Hey, honestly I am trying to make more friends as an adult and it feels awkward. Any chill advice?',
        topics: ['friend|social|people|awkward|advice'],
      },
      {
        prompt: 'I like board games and hiking. How do I turn that into actual hangouts without seeming pushy?',
        topics: ['board|hike|hang|invite|group'],
      },
      {
        prompt: 'What if someone is polite but never follows up? How do I know when to stop trying?',
        topics: ['follow|signal|stop|energy|respect'],
      },
      {
        prompt: 'Cool. One last thing — how do I keep a new friendship going for more than two hangouts?',
        topics: ['keep|regular|plan|check.?in|ritual'],
      },
    ],
  },
  {
    id: 'chat4-build-premium',
    title: 'CHAT 4 — Talk then build premium site (NEW brand)',
    turns: [
      {
        phase: 'talk',
        prompt: 'I want a premium tea ceremony studio site — calm, editorial, not neon tech. Name ideas that are not tea shop clichés. Planning only.',
        topics: ['tea|ceremony|name|editorial|calm'],
      },
      {
        phase: 'talk',
        prompt: 'I like the direction. What should the first viewport include so the brand feels premium without looking like a template?',
        topics: ['hero|viewport|brand|headline|image'],
      },
      {
        phase: 'build',
        prompt: 'Ok start building now. Create a premium tea ceremony studio website called Serai Clay — warm parchment paper, soft charcoal ink, quiet gold accents, full-bleed tea ceremony hero, editorial typography, not neon, not tech, not bakery leftover.',
        timeoutMs: 600000,
      },
    ],
  },
];

const report = [];
let hardFails = 0;

console.log(`=== FRESH MULTI-CHAT LAB · CDP ${PORT} ===`);
console.log('Watch the NOVA window — new chat each suite.\n');
console.log('KEEPING all existing chats — nothing deleted.\n');

const WATCH_PAUSE = Number(process.env.NOVA_WATCH_PAUSE_MS || 3500);

for (const suite of suites) {
  console.log(`\n======== ${suite.title} ========`);
  console.log('(look at the NOVA window now)');
  const newHit = await clickNewChat();
  console.log('New chat:', newHit);
  await sleep(Math.max(2000, WATCH_PAUSE));
  let threadKey = null;
  const rows = [];

  for (const turn of suite.turns) {
    const phase = turn.phase || 'talk';
    const prompt = `${turn.prompt}\n\n[${LAB}]`;
    console.log(`\n>>> [${phase}] ${turn.prompt.slice(0, 120)}${turn.prompt.length > 120 ? '…' : ''}`);
    console.log('…typing into Chat — watch the window…');
    await sleep(1200);
    const r = await sendAsk(prompt, {
      timeoutMs: turn.timeoutMs || (phase === 'build' ? 600000 : 180000),
      threadKey,
    });
    if (r.key) threadKey = r.key;
    const flags = phase === 'build'
      ? scoreBuild(r.text)
      : scoreTalk(turn.prompt, r.text, {
        expectNoCreate: true,
        topics: turn.topics || [],
      });
    console.log('meta:', r.meta, '| chars:', r.text.length);
    console.log(r.text.slice(0, 700).replace(/\n+/g, '\n'));
    if (r.text.length > 700) console.log('…');
    if (flags.length) {
      console.log('FLAGS:', flags.join(', '));
      hardFails += 1;
    } else {
      console.log(phase === 'build' ? 'OK build' : 'OK talk');
    }
    rows.push({
      phase,
      prompt: turn.prompt.slice(0, 80),
      meta: r.meta,
      chars: r.text.length,
      flags,
      preview: r.text.slice(0, 240),
    });
    await sleep(WATCH_PAUSE);
  }

  report.push({ id: suite.id, title: suite.title, threadKey, rows });
}

console.log('\n======== SUMMARY ========');
for (const s of report) {
  const bad = s.rows.filter((r) => r.flags.length).length;
  console.log(`${s.id}: ${s.rows.length - bad}/${s.rows.length} clean · thread ${s.threadKey || '?'}`);
  for (const r of s.rows) {
    console.log(`  - [${r.phase}] ${r.chars}c ${r.flags.length ? 'FAIL ' + r.flags.join('|') : 'ok'} · ${r.meta}`);
  }
}
console.log(hardFails ? `\n${hardFails} flagged turns` : '\nAll turns clean');
process.exit(hardFails ? 1 : 0);
