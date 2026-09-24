/**
 * Live: brand-new Saltglass reef shop (not apple.com).
 * Env: NOVA_CDP_PORT (default 9229)
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const OUT = path.join(__dirname, '..', '.tmp-live-saltglass.json');
const PRODUCT = 'Saltglass';
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

async function waitForCdp(ms = 120000) {
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
      if (k && /chat-thread|recent-chats|chat-studio|recent-projects|last-disk|thread-brain|pending-build|create-coder|Saltglass|Apple|Northfield/i.test(k)) {
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
    prefs.ggufNPredict = Math.max(Number(prefs.ggufNPredict) || 0, 6144);
    prefs.agentLoopMaxSteps = Math.max(Number(prefs.agentLoopMaxSteps) || 0, 32);
    prefs.activeChatId = 'qwen25-7b';
    prefs.defaultModelId = 'qwen25-7b';
    prefs.lastChatModelId = 'qwen25-7b';
    prefs.activeCoderId = 'qwen25-coder-14b';
    prefs.defaultCodeModelId = 'qwen25-coder-14b';
    prefs.activeDesignId = 'uigen-fx-4b';
    prefs.activeVisionId = 'qwen2-vl-7b';
    prefs.activeImageId = 'sd15-local';
    prefs.defaultImageModelId = 'sd15-local';
    localStorage.setItem('NOVA:local-prefs', JSON.stringify(prefs));
    return { ok: true };
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
      hasImage: ready.includes('sd15-local') || ready.includes('sdxl-turbo-local') || ready.includes('flux-schnell-local'),
    };
  } catch (e) {
    return { ready: [], hasChat: false, hasCoder: false, hasDesign: false, hasImage: false, warn: String(e && e.message || e) };
  }
})()`);
console.log('team', JSON.stringify(teamCheck));
if (!teamCheck?.hasCoder || !teamCheck?.hasChat) {
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

function diskReport() {
  const projectsRoot = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects');
  const candidates = fs.existsSync(projectsRoot)
    ? fs.readdirSync(projectsRoot)
      .filter((n) => /^Saltglass/i.test(n))
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
  const css = fs.existsSync(path.join(diskRoot, 'src', 'App.css'))
    ? fs.readFileSync(path.join(diskRoot, 'src', 'App.css'), 'utf8')
    : '';
  const heroesDir = path.join(diskRoot, 'public', 'heroes');
  const heroFiles = fs.existsSync(heroesDir)
    ? fs.readdirSync(heroesDir).filter((n) => /\.(jpe?g|png|webp|svg)$/i.test(n))
    : [];
  const realHero = heroFiles.some((n) => /\.(jpe?g|png|webp)$/i.test(n));
  const hasReef = /\b(?:reef|aquarium|coral|tank|saltwater|fish)\b/i.test(app);
  const hasNav = /<nav\b/i.test(app);
  const notApple = !/\b(?:AirPods|iPad|MacBook)\b/i.test(app) || hasReef;
  const thin = app.length < 1600;
  return {
    ok: hasReef && hasNav && !thin && app.length >= 1800 && notApple,
    root: diskRoot,
    appLen: app.length,
    cssLen: css.length,
    hasReef,
    hasNav,
    heroFiles: heroFiles.length,
    realHero,
    snippet: app.slice(0, 350),
  };
}

async function sendAsk(text, { timeoutMs = 300000, role = 'talk' } = {}) {
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
  let lastStatus = '';
  let diskOkSeen = false;
  while (Date.now() - t0 < timeoutMs) {
    await sleep(3000);
    if (role === 'build') {
      const d = diskReport();
      if (d.ok) {
        diskOkSeen = true;
        if (Date.now() - t0 > 180_000) {
          return {
            meta: 'disk-ready',
            text: `Disk Ready at ${d.root} (app ${d.appLen}b, heroes=${d.heroFiles}, real=${d.realHero})`,
            livePill: false,
            lastStatus: lastStatus || 'disk-ready',
            modelPill: null,
          };
        }
      }
    }
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
        const statusMatch = body.match(/(?:Build:|Fix:|Plan:|Ask:|Verify|Style|Using |Tool loop|Full UI polish|Coding |Building |Creating |Still |Wrote |Preview Ready|Design|Spec|Craft|Critic|Ensemble|Materializing|Asset|Hero|Image)[^\\n]{0,110}/i);
        const livePill = [...document.querySelectorAll('button, span')].some((n) => /^Live$/i.test((n.textContent || '').trim()));
        const modelPill = [...document.querySelectorAll('button')]
          .map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim())
          .find((t) => /Qwen|Coder|Instruct|UIGEN|Llama|Mistral|SD|FLUX|Image/i.test(t) && t.length < 64) || null;
        return {
          generating,
          userHit,
          provider: lastAsst?.provider_used || lastAsst?.provider || null,
          content: lastAsst ? String(lastAsst.content || '') : '',
          livePill,
          statusLine: statusMatch ? statusMatch[0] : null,
          modelPill,
          grew: arr.length > beforeCount,
        };
      }.toString()})(${JSON.stringify(needle)}, ${before?.count || 0})`,
    );
    if (snap?.statusLine && snap.statusLine !== lastStatus) {
      lastStatus = snap.statusLine;
      console.log('  …', lastStatus.slice(0, 110), snap.modelPill ? `· pill=${snap.modelPill}` : '');
    }
    if (snap && snap.userHit && !snap.generating && String(snap.content || '').trim().length > 20 && snap.grew) {
      await sleep(800);
      return {
        meta: snap.provider || 'ok',
        text: String(snap.content || '').trim(),
        livePill: !!snap.livePill,
        lastStatus,
        modelPill: snap.modelPill || null,
      };
    }
  }
  if (diskOkSeen || diskReport().ok) {
    const d = diskReport();
    return {
      meta: 'disk-ready-timeout',
      text: `Disk Ready at ${d.root} (app ${d.appLen}b)`,
      livePill: false,
      lastStatus,
      modelPill: null,
    };
  }
  return { meta: 'timeout', text: '', livePill: false, lastStatus, modelPill: null };
}

await clickNewChat();
await sleep(1500);

const turns = [
  {
    role: 'talk',
    text: 'I want a specialty saltwater aquarium shop homepage — deep teal water vibes, reef photography hero, calm luxury. Not tech/apple. Name ideas later.',
  },
  {
    role: 'talk',
    text: 'Product name Saltglass. Sections: thin nav, full-bleed reef hero, livestock (corals / fish), care kits, visit hours. Real photos if you can. Quality over speed.',
  },
  {
    role: 'build',
    text: 'ok start building Saltglass now — premium saltwater aquarium shop website on disk. deep ocean teal, reef hero photography, coral & fish sections, care kits, hours, contact. create the project on disk. finished homepage, not a stub.',
  },
];

const results = [];
for (const turn of turns) {
  console.log(`\n→ [${turn.role}] ${turn.text.slice(0, 80)}…`);
  const timeoutMs = turn.role === 'build' ? 1_500_000 : 300_000;
  const out = await sendAsk(turn.text, { timeoutMs, role: turn.role });
  const flags = [];
  if (out.meta === 'timeout') flags.push('timeout');
  if (!out.text || out.text.length < 20) flags.push('too-short');
  if (turn.role === 'build' && /Preview Ready failed|scaffold only/i.test(out.text)) flags.push('ui-not-ready');
  results.push({
    role: turn.role,
    meta: out.meta,
    flags,
    livePill: out.livePill,
    lastStatus: out.lastStatus || null,
    modelPill: out.modelPill || null,
    preview: String(out.text || '').slice(0, 520),
    len: String(out.text || '').length,
  });
  console.log(`  ← ${out.meta} len=${results[results.length - 1].len} flags=${flags.join(',') || 'ok'}`);
}

await sleep(2500);
const disk = diskReport();
const report = {
  product: PRODUCT,
  at: new Date().toISOString(),
  teamCheck,
  ok: results.every((r) => !r.flags.includes('timeout')) && Boolean(disk.ok),
  results,
  disk,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('\n==== SUMMARY ====');
console.log(JSON.stringify({
  ok: report.ok,
  diskOk: disk.ok,
  hasReef: disk.hasReef,
  realHero: disk.realHero,
  heroFiles: disk.heroFiles,
  root: disk.root,
  appLen: disk.appLen,
  cssLen: disk.cssLen,
}, null, 2));
console.log('wrote', OUT);
ws.close();
process.exit(report.ok ? 0 : 2);
