/**
 * Live: wipe → natural chat (new product MossMarket) → then build.
 * Talk stays prose; build creates + polishes via Nova tool loop.
 * CDP: Open-NOVA-Build.bat --remote-debugging-port=9229
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const OUT = path.join(__dirname, '..', '.tmp-live-talk-then-build-moss.json');
const PRODUCT = 'MossMarket';
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

async function waitForCdp(ms = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      if (Array.isArray(list) && list.length) return list;
    } catch { /* retry */ }
    await sleep(1500);
  }
  throw new Error(`CDP not up on ${PORT}`);
}

const list = await waitForCdp();
const page = list.find((t) => t.type === 'page' && /localhost:5173|index\.html/i.test(t.url || ''))
  || list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('NOVA page missing');

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

async function ensureAppReady() {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const ok = await evalE(`(() => {
      try {
        void localStorage.length;
        const ta = document.querySelectorAll('textarea').length;
        const root = (document.getElementById('root')?.innerHTML || '').length;
        return ta > 0 || root > 40;
      } catch { return false; }
    })()`).catch(() => false);
    if (ok) return true;
    await sleep(600);
  }
  throw new Error('NOVA UI not ready');
}

await ensureAppReady();
await evalE(`(() => {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && /chat-thread|recent-chats|chat-studio|recent-projects|last-disk|thread-brain|pending-build-plan/i.test(k)) {
        localStorage.removeItem(k);
      }
    }
    // Force create tool loop on for this live run.
    try {
      const raw = localStorage.getItem('NOVA:local-prefs') || localStorage.getItem('NOVA:local-prefs');
      const prefs = raw ? JSON.parse(raw) : {};
      prefs.agentLoopOnCreate = true;
      prefs.agentLoopOnEdit = true;
      prefs.planApproveGate = false;
      prefs.agentLoopEnabled = true;
      prefs.prefsVersion = 3;
      localStorage.setItem('NOVA:local-prefs', JSON.stringify(prefs));
    } catch { /* ignore */ }
    return true;
  } catch (e) { return String(e); }
})()`);
await send('Page.reload', { ignoreCache: true });
await sleep(4000);
await ensureAppReady();

async function clickNewChat() {
  return evalE(`(() => {
    const btns = [...document.querySelectorAll('button, a, [role="button"]')];
    const hit = btns.find((b) => /new\\s*chat/i.test(((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase()));
    if (hit) { hit.click(); return 'clicked'; }
    location.hash = '#/chat';
    return 'hash';
  })()`);
}

async function sendAsk(text, { timeoutMs = 240000 } = {}) {
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
      return { count: Array.isArray(arr) ? arr.length : 0 };
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
  let codeOpenEver = false;
  let lastStatus = '';
  while (Date.now() - t0 < timeoutMs) {
    await sleep(2000);
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
      const lastContent = String(last?.content || '');
      const generating = /^__generating__:/i.test(lastContent);
      const userHit = arr.some(m => m?.role === 'user' && String(m.content || '').includes(${JSON.stringify(text.slice(0, 28))}));
      const assistants = arr.filter(m => m?.role === 'assistant' && !/^__generating__:/i.test(String(m.content || '')));
      const lastAsst = assistants[assistants.length - 1];
      const body = document.body?.innerText || '';
      const foreignBleed = /[\\u3040-\\u30ff\\u3400-\\u9fff\\uac00-\\ud7af]{2,}/.test(String(lastAsst?.content || ''));
      const promptLeak = /You are NOVA,/i.test(String(lastAsst?.content || ''));
      const modelPill = (document.querySelector('[aria-label="Select model"]')?.textContent || '').trim();
      const codeOpen = !!document.querySelector('[aria-label="Code files"]');
      const statusMatch = body.match(/(?:Build:|Fix:|Plan:|Ask:|Tuning |Building |Creating |Using |Coding |Still |Wrote |Preview Ready|Tool loop|Nova tool)[^\\n]{0,80}/i);
      return {
        len: arr.length,
        generating,
        userHit,
        provider: lastAsst?.provider_used || lastAsst?.provider || null,
        content: lastAsst ? String(lastAsst.content || '') : '',
        foreignBleed,
        promptLeak,
        modelPill: modelPill.slice(0, 60),
        codeOpen,
        statusLine: statusMatch ? statusMatch[0] : null,
      };
    })()`);
    if (snap?.codeOpen) codeOpenEver = true;
    if (snap?.statusLine && snap.statusLine !== lastStatus) {
      lastStatus = snap.statusLine;
      console.log('  …', lastStatus.slice(0, 100));
    }
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
        foreignBleed: snap.foreignBleed,
        promptLeak: snap.promptLeak,
        modelPill: snap.modelPill,
        codeOpen: codeOpenEver || !!snap.codeOpen,
        lastStatus,
      };
    }
  }
  return { meta: 'timeout', text: '', foreignBleed: false, promptLeak: false, codeOpen: codeOpenEver, lastStatus };
}

function talkFlags(reply) {
  const flags = [];
  const t = String(reply || '');
  if (!t || t.length < 40) flags.push('too-short');
  if (/NOVA · scaffold|Files written|Created .*Path/i.test(t)) flags.push('scaffolded-too-early');
  if (/@@@FILE\b/i.test(t)) flags.push('file-protocol-bleed');
  if (/You are NOVA,/i.test(t) && /Stay in chat mode/i.test(t)) flags.push('prompt-leak');
  if (/^```/.test(t.trim()) || /(?:^|\n)\s*(?:markdown|md)\s*```/i.test(t) || /^markdown\s*```/i.test(t.trim())) {
    flags.push('empty-fence-bleed');
  }
  if (/^```[\\w]*\\s*$/m.test(t) && t.replace(/```[\\w]*\\s*/g, '').trim().length < 20) {
    flags.push('empty-fence-bleed');
  }
  if (/[\\u3040-\\u30ff\\u3400-\\u9fff\\uac00-\\ud7af]{2,}/.test(t)) flags.push('foreign-bleed');
  return flags;
}

function buildFlags(reply) {
  const flags = [];
  const t = String(reply || '');
  if (!t || t.length < 20) flags.push('too-short');
  if (/scaffold only — UI not Preview-ready|Preview Ready failed/i.test(t)) flags.push('ui-not-ready');
  if (/NOVA · scaffold/i.test(t) && !/NOVA · create/i.test(t)) flags.push('scaffold-only');
  const created = /NOVA · create|Files written|Created |Preview|Ready|MossMarket/i.test(t);
  if (!created && t.length < 80) flags.push('no-create-signal');
  return flags;
}

function diskReport() {
  const projectsRoot = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects');
  const candidates = fs.existsSync(projectsRoot)
    ? fs.readdirSync(projectsRoot)
      .filter((n) => new RegExp(`^${PRODUCT}`, 'i').test(n))
      .map((n) => path.join(projectsRoot, n))
      .filter((d) => fs.existsSync(path.join(d, 'src', 'App.tsx')) || fs.existsSync(path.join(d, 'src', 'App.jsx')))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    : [];
  const diskRoot = candidates[0] || null;
  if (!diskRoot) return { ok: false, root: null, reason: 'no project folder' };
  const appPath = fs.existsSync(path.join(diskRoot, 'src', 'App.tsx'))
    ? path.join(diskRoot, 'src', 'App.tsx')
    : path.join(diskRoot, 'src', 'App.jsx');
  const app = fs.readFileSync(appPath, 'utf8');
  const cssPath = path.join(diskRoot, 'src', 'App.css');
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  const heroesDir = path.join(diskRoot, 'public', 'heroes');
  const heroes = fs.existsSync(heroesDir)
    ? fs.readdirSync(heroesDir).filter((n) => /\\.(?:jpe?g|png|webp|svg)$/i.test(n)).map((n) => {
      const full = path.join(heroesDir, n);
      return { name: n, size: fs.statSync(full).size };
    })
    : [];
  const logoPath = path.join(diskRoot, 'public', 'logo.svg');
  const logoBytes = fs.existsSync(logoPath) ? fs.statSync(logoPath).size : 0;
  const brand = new RegExp(PRODUCT, 'i').test(app);
  const interactive = /useState/.test(app);
  const filler = /Book Title 1|lorem ipsum|Sample Product|via\\.placeholder/i.test(app);
  const thin = app.length < 1200 || css.length < 400;
  return {
    ok: brand && interactive && !filler && !thin && logoBytes >= 40,
    root: diskRoot,
    appLen: app.length,
    cssLen: css.length,
    brand,
    interactive,
    filler,
    logoBytes,
    heroes,
    brokenHeroes: heroes.filter((h) => h.size < 2000 && !/\\.svg$/i.test(h.name)),
    snippet: app.slice(0, 280),
  };
}

await clickNewChat();
await sleep(1200);

const turns = [
  { role: 'talk', text: 'hey — i help run a little weekend farmers market and vendors keep asking where their stall is and what they brought last week.' },
  { role: 'talk', text: 'yeah like a simple phone page: browse stalls, see what each one is selling that day, and tap save-a-bag so we know who wants a pickup.' },
  { role: 'talk', text: 'colors should feel like morning produce — soft sage, cream paper, a bit of terracotta. nothing neon or purple.' },
  { role: 'talk', text: 'when someone saves a bag, can they see a little confirmation and undo if they tapped wrong?' },
  { role: 'talk', text: 'also no payments or accounts — this is free for the market crew. just local stall browsing.' },
  { role: 'build', text: `ok build ${PRODUCT} for me — a phone-friendly farmers market stall browser with save-a-bag + undo confirmation, soft sage cream terracotta. create the project on disk. take your time; make sure logo and any stall photos actually load. no paywalls.` },
];

const results = [];
for (const turn of turns) {
  console.log(`\\n→ [${turn.role}] ${turn.text.slice(0, 72)}…`);
  const out = await sendAsk(turn.text, {
    timeoutMs: turn.role === 'build' ? 1_200_000 : 300_000,
  });
  const flags = turn.role === 'talk' ? talkFlags(out.text) : buildFlags(out.text);
  if (out.foreignBleed) flags.push('foreign-bleed');
  if (out.promptLeak) flags.push('prompt-leak');
  if (out.codeOpen) flags.push('code-auto-opened');
  const row = {
    role: turn.role,
    ask: turn.text,
    meta: out.meta,
    flags,
    modelPill: out.modelPill,
    codeOpen: out.codeOpen,
    lastStatus: out.lastStatus || null,
    preview: String(out.text || '').slice(0, 480),
    len: String(out.text || '').length,
  };
  results.push(row);
  console.log(`  ← ${out.meta} len=${row.len} flags=${flags.join(',') || 'ok'}`);
  console.log(`  ${row.preview.slice(0, 160).replace(/\\n/g, ' ')}…`);
}

await sleep(2000);
const disk = diskReport();
const talkOk = results.filter((r) => r.role === 'talk').every((r) => r.flags.length === 0 && r.meta !== 'timeout');
const buildRow = results.find((r) => r.role === 'build');
const buildOk = Boolean(buildRow && buildRow.meta !== 'timeout' && !buildRow.flags.includes('too-short'));
const report = {
  product: PRODUCT,
  at: new Date().toISOString(),
  talkOk,
  buildOk,
  diskOk: Boolean(disk.ok),
  ok: talkOk && buildOk && disk.ok,
  results,
  disk,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('\\n==== SUMMARY ====');
console.log(JSON.stringify({
  ok: report.ok,
  talkOk,
  buildOk,
  diskOk: disk.ok,
  root: disk.root,
  appLen: disk.appLen,
  cssLen: disk.cssLen,
  brand: disk.brand,
  interactive: disk.interactive,
  heroes: disk.heroes?.length,
}, null, 2));
console.log('wrote', OUT);
ws.close();
process.exit(report.ok ? 0 : 2);
