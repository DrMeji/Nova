/**
 * Live progressive: brand-new product (ClipperBay harbor boat-rentals) —
 * multi-turn talk → build → edit. Never reuse Apple / Moss / Starbucks / ForgeLane / Site.
 * CDP: Electron --remote-debugging-port=9229
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const OUT = path.join(__dirname, '..', '.tmp-live-clipperbay-progressive.json');
const PRODUCT = 'ClipperBay';
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

const prep = await evalE(`(() => {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && /chat-thread|recent-chats|chat-studio|recent-projects|last-disk|thread-brain|pending-build-plan|pending-greenfield|create-coder-only|AppleHome|ForgeLane|Moss|Starbrew/i.test(k)) {
        localStorage.removeItem(k);
      }
    }
    const raw = localStorage.getItem('NOVA:local-prefs') || localStorage.getItem('NOVA:local-prefs');
    const prefs = raw ? JSON.parse(raw) : {};
    prefs.agentLoopOnCreate = true;
    prefs.agentLoopOnEdit = true;
    prefs.planApproveGate = false;
    prefs.agentLoopEnabled = true;
    prefs.prefsVersion = 3;
    prefs.activeChatId = 'qwen25-7b';
    prefs.defaultModelId = 'qwen25-7b';
    prefs.lastChatModelId = 'qwen25-7b';
    prefs.activeCoderId = 'qwen25-coder-14b';
    prefs.defaultCodeModelId = 'qwen25-coder-14b';
    prefs.activeDesignId = 'uigen-fx-4b';
    prefs.activeVisionId = 'qwen2-vl-7b';
    localStorage.setItem('NOVA:local-prefs', JSON.stringify(prefs));
    return { ok: true, prefs };
  } catch (e) { return { ok: false, error: String(e) }; }
})()`);
console.log('prep', JSON.stringify(prep));

await send('Page.reload', { ignoreCache: true });
await sleep(4500);
await ensureAppReady();

const teamCheck = await evalE(`(async () => {
  try {
    const st = await Promise.race([
      window.novaDesktop?.engineStatus?.(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
    ]);
    const ready = (st?.models || []).filter((m) => m.status === 'ready').map((m) => m.id);
    return {
      ready,
      hasChat: ready.includes('qwen25-7b'),
      hasCoder: ready.includes('qwen25-coder-14b') || ready.includes('qwen25-coder-7b'),
      hasDesign: ready.includes('uigen-fx-4b'),
      hasVision: ready.includes('qwen2-vl-7b'),
    };
  } catch (e) {
    return {
      ready: ['disk-fallback'],
      hasChat: true,
      hasCoder: true,
      hasDesign: true,
      hasVision: true,
      warn: String(e && e.message || e),
    };
  }
})()`);
console.log('team', JSON.stringify(teamCheck));
if (!teamCheck?.hasCoder || !teamCheck?.hasDesign || !teamCheck?.hasChat) {
  console.error('Build team incomplete — aborting live run');
  fs.writeFileSync(OUT, JSON.stringify({ ok: false, reason: 'team-incomplete', teamCheck }, null, 2));
  ws.close();
  process.exit(2);
}

async function clickNewChat() {
  return evalE(`(() => {
    const btns = [...document.querySelectorAll('button, a, [role="button"]')];
    const hit = btns.find((b) => /new\\s*chat/i.test(((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase()));
    if (hit) { hit.click(); return 'clicked'; }
    location.hash = '#/chat?new=' + Date.now();
    return 'hash';
  })()`);
}

async function sendAsk(text, { timeoutMs = 300000 } = {}) {
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

  const setOk = await evalE(
    `(${function setAsk(askText) {
      const ta = document.querySelector('textarea');
      if (!ta) return false;
      const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      d.set.call(ta, askText);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      ta.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true,
      }));
      return true;
    }.toString()})(${JSON.stringify(text)})`,
  );
  if (!setOk) throw new Error('no textarea');

  const needle = text.slice(0, 36);
  const t0 = Date.now();
  let codeOpenEver = false;
  let lastStatus = '';
  while (Date.now() - t0 < timeoutMs) {
    await sleep(2500);
    const snap = await evalE(
      `(${function snapAsk(needleIn, beforeCount) {
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
        const userHit = arr.some((m) => m?.role === 'user' && String(m.content || '').includes(needleIn));
        const assistants = arr.filter((m) => m?.role === 'assistant' && !/^__generating__:/i.test(String(m.content || '')));
        const lastAsst = assistants[assistants.length - 1];
        const body = document.body?.innerText || '';
        const modelPill = (document.querySelector('[aria-label="Select model"]')?.textContent || '').trim();
        const codeOpen = !!document.querySelector('[aria-label="Code files"]');
        const statusMatch = body.match(/(?:Build:|Fix:|Plan:|Ask:|Tuning |Building |Creating |Using |Coding |Still |Wrote |Preview Ready|Tool loop|Nova tool|Design|Spec|Craft|Critic|Ensemble)[^\\n]{0,90}/i);
        const livePill = [...document.querySelectorAll('button, span')].some((n) => /^Live$/i.test((n.textContent || '').trim()));
        return {
          len: arr.length,
          generating,
          userHit,
          provider: lastAsst?.provider_used || lastAsst?.provider || null,
          content: lastAsst ? String(lastAsst.content || '') : '',
          modelPill: modelPill.slice(0, 80),
          codeOpen,
          livePill,
          statusLine: statusMatch ? statusMatch[0] : null,
          grew: arr.length > beforeCount,
        };
      }.toString()})(${JSON.stringify(needle)}, ${before?.count || 0})`,
    );
    if (snap?.codeOpen) codeOpenEver = true;
    if (snap?.statusLine && snap.statusLine !== lastStatus) {
      lastStatus = snap.statusLine;
      console.log('  …', lastStatus.slice(0, 110));
    }
    if (
      snap
      && snap.userHit
      && !snap.generating
      && String(snap.content || '').trim().length > 20
      && snap.grew
    ) {
      await sleep(600);
      return {
        meta: snap.provider || 'ok',
        text: String(snap.content || '').trim(),
        modelPill: snap.modelPill,
        codeOpen: codeOpenEver || !!snap.codeOpen,
        livePill: !!snap.livePill,
        lastStatus,
      };
    }
  }
  return {
    meta: 'timeout',
    text: '',
    modelPill: '',
    codeOpen: codeOpenEver,
    livePill: false,
    lastStatus,
  };
}

function talkFlags(reply) {
  const flags = [];
  const t = String(reply || '');
  if (!t || t.length < 40) flags.push('too-short');
  if (/NOVA · scaffold|Files written|Created .*Path/i.test(t)) flags.push('scaffolded-too-early');
  if (/@@@FILE\b/i.test(t)) flags.push('file-protocol-bleed');
  if (/You are NOVA,/i.test(t) && /Stay in chat mode/i.test(t)) flags.push('prompt-leak');
  if (/^```/.test(t.trim()) || /(?:^|\n)\s*(?:markdown|md)\s*```/i.test(t)) flags.push('empty-fence-bleed');
  return flags;
}

function buildFlags(reply) {
  const flags = [];
  const t = String(reply || '');
  if (!t || t.length < 20) flags.push('too-short');
  if (/scaffold only — UI not Preview-ready|Preview Ready failed/i.test(t)) flags.push('ui-not-ready');
  if (/NOVA · scaffold/i.test(t) && !/NOVA · create|Preview|Ready/i.test(t)) flags.push('scaffold-only');
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
  const brand = new RegExp(PRODUCT, 'i').test(app);
  const settingsUi = /settings|accessibility|profile/i.test(app);
  const modalish = /modal|dialog|overlay|drawer|panelOpen|showSettings|settingsOpen/i.test(app);
  const interactive = /useState/.test(app);
  const filler = /Book Title 1|lorem ipsum|Sample Product|via\.placeholder|AppleHome|MossMarket|ForgeLane/i.test(app);
  const creamBias = /#f3eee4|#f4f1ea|#faf7f2|#f5f0e8/i.test(css);
  const thin = app.length < 1200 || css.length < 300;
  return {
    ok: brand && interactive && !filler && !thin && !creamBias,
    root: diskRoot,
    appLen: app.length,
    cssLen: css.length,
    brand,
    interactive,
    filler,
    creamBias,
    settingsUi,
    modalish,
    snippet: app.slice(0, 360),
  };
}

await clickNewChat();
await sleep(1500);

const turns = [
  {
    role: 'talk',
    text: 'hey — i rent small boats out of a harbor dock and people keep texting me asking which skiffs are free this weekend.',
  },
  {
    role: 'talk',
    text: 'want a clean website called ClipperBay: show available boats, weekend hours, and a simple reserve form. no payments, no accounts.',
  },
  {
    role: 'talk',
    text: 'visual vibe: deep navy harbor, seafoam accents, crisp white type. not purple, not cream apple-store, not cafe sage. feels like morning fog on the water.',
  },
  {
    role: 'talk',
    text: 'v1 must-haves: hero with ClipperBay name, boat grid, hours strip, reserve form that confirms without login. any questions before we build?',
  },
  {
    role: 'build',
    text: `ok start building ClipperBay now — deep navy + seafoam harbor rental site with boat grid, hours, and reserve confirmation. create the project on disk. take your time; make it feel finished, not a stub.`,
  },
  {
    role: 'edit',
    text: `Add a Settings button in the ClipperBay header. When pressed, open a modal with Profile (name + email), Preferences (notify when a boat frees), and Accessibility (larger text + reduce motion). Closing returns to the page. Keep navy seafoam look.`,
  },
];

const results = [];
for (const turn of turns) {
  console.log(`\n→ [${turn.role}] ${turn.text.slice(0, 80)}…`);
  const timeoutMs = turn.role === 'build' ? 1_200_000 : turn.role === 'edit' ? 600_000 : 300_000;
  const out = await sendAsk(turn.text, { timeoutMs });
  const flags = turn.role === 'talk'
    ? talkFlags(out.text)
    : buildFlags(out.text);
  if (out.meta === 'timeout') flags.push('timeout');
  const row = {
    role: turn.role,
    ask: turn.text,
    meta: out.meta,
    flags,
    modelPill: out.modelPill,
    codeOpen: out.codeOpen,
    livePill: out.livePill,
    lastStatus: out.lastStatus || null,
    preview: String(out.text || '').slice(0, 520),
    len: String(out.text || '').length,
  };
  results.push(row);
  console.log(`  ← ${out.meta} len=${row.len} flags=${flags.join(',') || 'ok'} live=${out.livePill}`);
  console.log(`  ${row.preview.slice(0, 180).replace(/\n/g, ' ')}…`);
}

await sleep(2500);
const disk = diskReport();
const talkOk = results.filter((r) => r.role === 'talk').every((r) => !r.flags.includes('timeout') && !r.flags.includes('too-short'));
const buildRow = results.find((r) => r.role === 'build');
const buildOk = Boolean(buildRow && !buildRow.flags.includes('timeout') && !buildRow.flags.includes('too-short'));
const editRows = results.filter((r) => r.role === 'edit');
const editOk = editRows.length > 0 && editRows.every((r) => !r.flags.includes('timeout'));
const report = {
  product: PRODUCT,
  at: new Date().toISOString(),
  teamCheck,
  talkOk,
  buildOk,
  editOk,
  diskOk: Boolean(disk.ok),
  settingsOnDisk: Boolean(disk.settingsUi && disk.modalish),
  ok: talkOk && buildOk && disk.ok,
  results,
  disk,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('\n==== SUMMARY ====');
console.log(JSON.stringify({
  ok: report.ok,
  talkOk,
  buildOk,
  editOk,
  diskOk: disk.ok,
  creamBias: disk.creamBias,
  settingsOnDisk: report.settingsOnDisk,
  root: disk.root,
  appLen: disk.appLen,
  cssLen: disk.cssLen,
  brand: disk.brand,
  modalish: disk.modalish,
  settingsUi: disk.settingsUi,
}, null, 2));
console.log('wrote', OUT);
ws.close();
process.exit(report.ok ? 0 : 2);
