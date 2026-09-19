/**
 * Live: wipe → 5–6 turn natural chat (new product) → then build.
 * Talk turns must stay prose; build turn should create + polish.
 * CDP: Open-NOVA-Build.bat uses --remote-debugging-port=9229
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const OUT = path.join(__dirname, '..', '.tmp-live-talk-then-build.json');
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
const page = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''))
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
  // Prefer the already-open NOVA page (file:// dist or vite). Avoid forcing 5173.
  const href = await evalE('location.href').catch(() => '');
  if (!/index\.html|localhost:5173|NOVA/i.test(String(href || '')) && !String(href || '').includes('Projects/Nova')) {
    // Only navigate if we somehow landed on about:blank
    if (/about:blank|^chrome/i.test(String(href || ''))) {
      await send('Page.reload', { ignoreCache: true });
      await sleep(2500);
    }
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 45000) {
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
  throw new Error('NOVA UI not ready (localStorage / textarea)');
}

await ensureAppReady();
await evalE(`(() => {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && /chat-thread|recent-chats|chat-studio|recent-projects|last-disk|thread-brain/i.test(k)) {
        localStorage.removeItem(k);
      }
    }
    return true;
  } catch (e) { return String(e); }
})()`);
await send('Page.reload', { ignoreCache: true });
await sleep(3500);
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
      const lastContent = String(last?.content || '');
      const generating = /^__generating__:/i.test(lastContent);
      const userHit = arr.some(m => m?.role === 'user' && String(m.content || '').includes(${JSON.stringify(text.slice(0, 24))}));
      const assistants = arr.filter(m => m?.role === 'assistant' && !/^__generating__:/i.test(String(m.content || '')));
      const lastAsst = assistants[assistants.length - 1];
      const body = document.body?.innerText || '';
      const foreignBleed = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]{2,}/.test(String(lastAsst?.content || ''));
      const promptLeak = /You are NOVA,/i.test(String(lastAsst?.content || ''));
      const switched = /·\s*switched/i.test(String(lastAsst?.provider_used || lastAsst?.provider || ''));
      const modelPill = (document.querySelector('[aria-label="Select model"]')?.textContent || '').trim();
      const codeOpen = !!document.querySelector('[aria-label="Code files"]');
      return {
        len: arr.length,
        generating,
        userHit,
        provider: lastAsst?.provider_used || lastAsst?.provider || null,
        content: lastAsst ? String(lastAsst.content || '') : '',
        foreignBleed,
        promptLeak,
        switched,
        modelPill: modelPill.slice(0, 60),
        codeOpen,
        statusLine: (body.match(/(?:Tuning |Building |Creating |Using |Coding |Still waiting)/i) || [null])[0],
      };
    })()`);
    if (snap?.codeOpen) codeOpenEver = true;
    if (
      snap
      && snap.userHit
      && !snap.generating
      && String(snap.content || '').trim().length > 20
      && snap.len > (before?.count || 0)
    ) {
      await sleep(400);
      return {
        meta: snap.provider || 'ok',
        text: String(snap.content || '').trim(),
        foreignBleed: snap.foreignBleed,
        promptLeak: snap.promptLeak,
        switched: snap.switched,
        modelPill: snap.modelPill,
        codeOpen: codeOpenEver || !!snap.codeOpen,
      };
    }
  }
  return { meta: 'timeout', text: '', foreignBleed: false, promptLeak: false, codeOpen: codeOpenEver };
}

function talkFlags(reply) {
  const flags = [];
  const t = String(reply || '');
  if (!t || t.length < 40) flags.push('too-short');
  if (/NOVA · scaffold|Files written|Created .*Path/i.test(t)) flags.push('scaffolded-too-early');
  if (/@@@FILE\b/i.test(t)) flags.push('file-protocol-bleed');
  if (/You are NOVA,/i.test(t) && /Stay in chat mode/i.test(t)) flags.push('prompt-leak');
  // Empty CODE / opener-only fence bleed (the freeze the user screenshot).
  if (/^```/.test(t.trim()) || /(?:^|\n)\s*(?:markdown|md)\s*```/i.test(t) || /^markdown\s*```/i.test(t.trim())) {
    flags.push('empty-fence-bleed');
  }
  if (/^```[\w]*\s*$/m.test(t) && t.replace(/```[\w]*\s*/g, '').trim().length < 20) {
    flags.push('empty-fence-bleed');
  }
  // Real CJK/Hangul runs only (avoid false positives from curly quotes / punctuation).
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]{2,}/.test(t)) flags.push('foreign-bleed');
  return flags;
}

function buildFlags(reply) {
  const flags = [];
  const t = String(reply || '');
  if (!t || t.length < 20) flags.push('too-short');
  if (/scaffold only — UI not Preview-ready|Preview Ready failed/i.test(t)) flags.push('ui-not-ready');
  if (/NOVA · scaffold/i.test(t) && !/NOVA · create/i.test(t)) flags.push('scaffold-only');
  const created = /NOVA · create|Files written|Created |Preview|Ready/i.test(t);
  if (!created && t.length < 80) flags.push('no-create-signal');
  return flags;
}

async function verifyLiveImages() {
  const outDir = path.join(__dirname, '..', '.tmp-quietshelf-live');
  fs.mkdirSync(outDir, { recursive: true });
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const p = path.join(outDir, `${name}.png`);
    fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
    return p;
  };

  // Disk truth first — Live UI is a separate BrowserWindow (not an iframe).
  const projectsRoot = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects');
  const candidates = fs.existsSync(projectsRoot)
    ? fs.readdirSync(projectsRoot)
      .filter((n) => /^QuietShelf/i.test(n))
      .map((n) => path.join(projectsRoot, n))
      .filter((d) => fs.existsSync(path.join(d, 'src', 'App.tsx')) || fs.existsSync(path.join(d, 'src', 'App.jsx')))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    : [];
  const diskRoot = candidates[0] || null;
  const disk = { ok: false, root: diskRoot, heroes: [], brokenHeroFiles: [], missingRefs: [], appSnippet: '' };
  if (diskRoot) {
    const appPath = fs.existsSync(path.join(diskRoot, 'src', 'App.tsx'))
      ? path.join(diskRoot, 'src', 'App.tsx')
      : path.join(diskRoot, 'src', 'App.jsx');
    const app = fs.readFileSync(appPath, 'utf8');
    disk.appSnippet = app.slice(0, 400);
    const heroesDir = path.join(diskRoot, 'public', 'heroes');
    const heroFiles = fs.existsSync(heroesDir)
      ? fs.readdirSync(heroesDir).filter((n) => /\.(?:jpe?g|png|webp|svg)$/i.test(n))
      : [];
    disk.heroes = heroFiles.map((n) => {
      const full = path.join(heroesDir, n);
      const size = fs.statSync(full).size;
      return { name: n, size };
    });
    disk.brokenHeroFiles = disk.heroes.filter((h) => h.size < 2000 && !/\.svg$/i.test(h.name));
    const refs = [...app.matchAll(/\/heroes\/([a-z0-9._-]+\.(?:jpe?g|png|webp|svg))/gi)].map((m) => m[1].toLowerCase());
    const onDisk = new Set(heroFiles.map((n) => n.toLowerCase()));
    disk.missingRefs = [...new Set(refs)].filter((r) => !onDisk.has(r));
    const logoPath = path.join(diskRoot, 'public', 'logo.svg');
    disk.logoBytes = fs.existsSync(logoPath) ? fs.statSync(logoPath).size : 0;
    disk.usesCoverHrefs = /\bCOVER_HREFS\b/.test(app) && /src=\{COVER_HREFS/.test(app);
    disk.ok = disk.brokenHeroFiles.length === 0
      && disk.missingRefs.length === 0
      && disk.heroes.length >= 1
      && disk.logoBytes >= 80
      && (disk.usesCoverHrefs || disk.missingRefs.length === 0);
  }

  // Click Live (opens separate preview window).
  const liveClick = await evalE(`(() => {
    const nodes = [...document.querySelectorAll('button, a, [role="button"]')];
    const live = nodes.find((n) => /^\\s*live\\s*$/i.test((n.textContent || '').trim())
      || /\\blive\\b/i.test((n.getAttribute('aria-label') || '')));
    if (live) { live.click(); return 'clicked'; }
    return 'missing';
  })()`);
  await sleep(6000);
  await shot('01-after-live-click');

  // Attach to any preview BrowserWindow / vite page.
  let preview = null;
  try {
    const list2 = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
    preview = list2.find((t) => t.type === 'page' && /QuietShelf|preview|127\\.0\\.0\\.1:\\d{4}/i.test(`${t.title || ''} ${t.url || ''}`) && !/index\\.html#/i.test(t.url || ''))
      || list2.find((t) => t.type === 'page' && /127\\.0\\.0\\.1:\\d+|localhost:\\d+/i.test(t.url || '') && !/Nova[/\\\\]dist/i.test(t.url || ''));
  } catch { /* ignore */ }

  let liveDom = null;
  if (preview?.webSocketDebuggerUrl) {
    const ws2 = new WebSocket(preview.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws2.once('open', resolve); ws2.once('error', reject); });
    let id2 = 0;
    const pending2 = new Map();
    ws2.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && pending2.has(msg.id)) {
        const { resolve, reject } = pending2.get(msg.id);
        pending2.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
    const send2 = (method, params = {}) => new Promise((resolve, reject) => {
      const i = ++id2;
      pending2.set(i, { resolve, reject });
      ws2.send(JSON.stringify({ id: i, method, params }));
    });
    await send2('Page.enable');
    await send2('Runtime.enable');
    await sleep(2000);
    const shot2 = await send2('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path.join(outDir, '02-preview-page.png'), Buffer.from(shot2.data, 'base64'));
    const r = await send2('Runtime.evaluate', {
      expression: `(() => {
        const imgs = [...document.querySelectorAll('img')];
        const rows = imgs.map((img) => ({
          src: String(img.getAttribute('src') || img.currentSrc || '').slice(0, 140),
          alt: String(img.alt || '').slice(0, 40),
          w: img.naturalWidth || 0,
          h: img.naturalHeight || 0,
        }));
        const broken = rows.filter((x) => x.w < 2);
        return {
          title: document.title,
          brand: /QuietShelf/i.test(document.body?.innerText || ''),
          broken,
          rows,
          ok: broken.length === 0 && rows.some((x) => /heroes\\//i.test(x.src) && x.w >= 8),
        };
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    liveDom = r.result?.value || null;
    ws2.close();
  }

  const report = {
    liveClick,
    disk,
    previewUrl: preview?.url || null,
    liveDom,
    ok: Boolean(disk.ok) && (liveDom ? liveDom.ok : disk.ok),
  };
  fs.writeFileSync(path.join(outDir, 'live-img-report.json'), JSON.stringify(report, null, 2));
  console.log('liveImages', JSON.stringify(report, null, 2).slice(0, 1600));
  return report;
}

await clickNewChat();
await sleep(1200);

const turns = [
  { role: 'talk', text: 'hey — i keep lending books to friends and never remember who has what. thinking of a tiny phone thing for that.' },
  { role: 'talk', text: 'yeah something like a little shelf you browse, tap a book to borrow it, and see who has what checked out. no accounts or payments.' },
  { role: 'talk', text: 'hmm would that work on a phone too? like if someone is standing by a shared bookshelf with their phone?' },
  { role: 'talk', text: 'what about when they bring the book back? should there be a return button or something?' },
  { role: 'talk', text: "i'm thinking soft paper tones and warm walnut wood, nothing neon or purple. more like a quiet reading nook." },
  { role: 'build', text: 'ok go ahead and build QuietShelf for me — a simple phone-friendly shelf browser with borrow and return, soft paper tones and warm walnut. create the project on disk. take your time and make sure every book cover image and the logo actually load.' },
];

const results = [];
for (const turn of turns) {
  console.log(`\n→ [${turn.role}] ${turn.text.slice(0, 72)}…`);
  const out = await sendAsk(turn.text, {
    timeoutMs: turn.role === 'build' ? 900000 : 300000,
  });
  const flags = turn.role === 'talk' ? talkFlags(out.text) : buildFlags(out.text);
  if (out.foreignBleed) flags.push('foreign-bleed');
  if (out.promptLeak) flags.push('prompt-leak');
  if (out.switched && turn.role === 'talk') flags.push('mid-chat-switched');
  // Code overlay must stay closed until the user clicks the Code pill.
  if (out.codeOpen) flags.push('code-auto-opened');
  const row = {
    role: turn.role,
    ask: turn.text,
    meta: out.meta,
    flags,
    modelPill: out.modelPill,
    codeOpen: out.codeOpen,
    preview: String(out.text || '').slice(0, 420),
    len: String(out.text || '').length,
  };
  results.push(row);
  console.log(`  meta=${out.meta} flags=${flags.join(',') || 'ok'} pill=${out.modelPill || '?'} len=${row.len}`);
  console.log(`  preview: ${row.preview.replace(/\\s+/g, ' ').slice(0, 160)}…`);
}

let liveImages = null;
const buildOk = results.some((r) => r.role === 'build' && !r.flags.includes('ui-not-ready') && r.meta !== 'timeout');
if (buildOk) {
  console.log('\n→ verifying Live images…');
  liveImages = await verifyLiveImages();
  if (!liveImages?.ok) {
    results.push({
      role: 'live',
      ask: 'Live image check',
      meta: 'live-images',
      flags: ['broken-live-images'],
      preview: JSON.stringify(liveImages).slice(0, 420),
      len: 0,
    });
  }
}

const talkBad = results.filter((r) => r.role === 'talk' && r.flags.length);
const buildBad = results.filter((r) => r.role === 'build' && r.flags.length);
const liveBad = results.filter((r) => r.role === 'live' && r.flags.length);
const report = {
  at: new Date().toISOString(),
  port: PORT,
  ok: talkBad.length === 0 && buildBad.length === 0 && liveBad.length === 0 && results.every((r) => r.meta !== 'timeout'),
  talkBad: talkBad.length,
  buildBad: buildBad.length,
  liveBad: liveBad.length,
  liveImages,
  results,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\nWrote ${OUT}`);
console.log(report.ok ? 'PASS' : 'FAIL');
ws.close();
process.exit(report.ok ? 0 : 1);
