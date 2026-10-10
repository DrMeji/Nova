/**
 * Fresh Live verify — UI-ready stack (graphics → interact v2).
 * Nova-only via CDP. Does not edit created projects.
 *
 *   npm run build
 *   start electron with --remote-debugging-port=9229
 *   $env:NOVA_CDP_PORT='9229'; node scripts/live-ui-ready-verify.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const BUDGET_MS = Number(process.env.NOVA_BUILD_BUDGET_MS || 12 * 60 * 1000);
const POLL_MS = 5000;
const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const RUN = Date.now().toString(36).slice(-5);
const OUT = path.join(os.tmpdir(), `nova-ui-ready-verify-${RUN}.json`);

const ALL_CASES = [
  {
    id: 'gin',
    brand: `Saltmere Gin ${RUN}`,
    prompt: (brand) => [
      `Build a brand-new marketing website for ${brand}.`,
      'Coastal gin brand with tasting notes, shop, and subscribe. Not coffee.',
      'Skip Plan. Put it on disk and Get it Live.',
      'Full sections: nav, hero with product visual, story, tasting notes, shop, subscribe, footer.',
    ].join(' '),
    expect: {
      genre: 'bottle',
      forbid: /coffee brand|careful roasting|whole bean/i,
      need: [/HERO_VISUAL|hero-art/i, /id=["']notes["']/i, /id=["']shop["']/i, /nova\.bag\./i, /useState/i],
      heroMust: /small batch/i,
      heroForbid: /#2997ff|width="320" height="600"/i,
      logoMust: /M8 22h8|M12 15a5/i, // lucide wine
      leakForbid: /-new marketing|Skip Plan|Put it on disk|Get it Live/i,
    },
  },
  {
    id: 'coffee',
    brand: `Emberlot Roasters ${RUN}`,
    prompt: (brand) => [
      `Build a brand-new marketing website for ${brand}.`,
      'Specialty coffee farm origin with tasting notes, shop, and subscribe.',
      'Skip Plan. Put it on disk and Get it Live.',
      'Full sections: nav, hero with roast visual, story, tasting notes, shop, subscribe, footer.',
    ].join(' '),
    expect: {
      genre: 'coffee',
      forbid: /coastal gin|small batch spirits/i,
      need: [/HERO_VISUAL|hero-art/i, /id=["']notes["']/i, /id=["']shop["']/i, /nova\.bag\./i, /useState/i],
      heroMust: /whole bean/i,
      heroForbid: /#2997ff|width="320" height="600"|small batch/i,
      logoMust: /M10 2v2|M16 8a1 1 0 0 1 1 1v8/i, // lucide coffee
      leakForbid: /-new marketing|Skip Plan|Put it on disk|Get it Live/i,
    },
  },
];
const ONLY = String(process.env.NOVA_LIVE_CASE || '').trim().toLowerCase();
const CASES = ONLY ? ALL_CASES.filter((c) => c.id === ONLY) : ALL_CASES;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keepAlive = setInterval(() => {}, 60_000);
process.on('exit', () => clearInterval(keepAlive));

function log(...args) {
  console.log(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
}

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

async function connect() {
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = list.find((t) => t.type === 'page' && !/devtools/i.test(t.url || ''))
    || list.find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error(`NOVA missing on CDP ${PORT}`);
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
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  return { ws, send, evalE };
}

function slugOf(brand) {
  return brand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function readTree(root) {
  const files = {};
  const walk = (dir, rel = '') => {
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const abs = path.join(dir, e.name);
      const key = path.join(rel, e.name).replace(/\\/g, '/');
      if (e.isDirectory()) {
        if (/node_modules|\.git|dist/.test(e.name)) continue;
        walk(abs, key);
      } else if (/\.(jsx?|tsx?|css|svg)$/i.test(e.name)) {
        try { files[key] = fs.readFileSync(abs, 'utf8'); } catch { /* */ }
      }
    }
  };
  walk(root);
  return files;
}

function judgeCase(c, folderName) {
  const root = path.join(PROJECTS, folderName);
  const files = readTree(root);
  const blob = Object.values(files).join('\n');
  const misses = [];
  for (const re of c.expect.need) {
    if (!re.test(blob)) misses.push(`missing ${re}`);
  }
  if (c.expect.forbid.test(blob)) misses.push('forbidden genre copy present');
  if (c.expect.leakForbid?.test(blob)) misses.push('instruction-leak UI copy');
  // Prefer HeroSection.jsx — Object.entries can hit HeroSection.css first on Windows.
  const hero = Object.entries(files).find(([k]) => /Hero[^/]*\.jsx$/i.test(k))?.[1]
    || Object.entries(files).find(([k]) => /Hero/i.test(k) && /\.jsx?$/i.test(k))?.[1]
    || '';
  const logo = files['public/logo.svg'] || '';
  const svg = (() => {
    const m = String(hero).match(/data:image\/svg\+xml[^"']+/);
    if (!m) return '';
    const raw = m[0].replace(/^data:image\/svg\+xml[^,]*,/i, '');
    try { return decodeURIComponent(raw); }
    catch {
      try { return decodeURIComponent(raw.replace(/\+/g, '%20')); }
      catch { return raw; }
    }
  })();
  if (c.expect.heroMust && !c.expect.heroMust.test(svg)) {
    misses.push(`hero SVG missing genre mark (${c.expect.genre})`);
  }
  if (c.expect.heroForbid?.test(svg)) misses.push('hero SVG is phone/wrong-genre stage');
  if (c.expect.logoMust && !c.expect.logoMust.test(logo)) {
    misses.push(`logo.svg is not the ${c.expect.genre} family mark`);
  }
  if (/M9\.937 15\.5/i.test(logo)) misses.push('logo.svg still generic sparkles');
  return {
    folder: folderName,
    fileCount: Object.keys(files).length,
    hasHeroArt: /HERO_VISUAL|hero-art|data:image\/svg\+xml/i.test(blob),
    hasBagKey: /nova\.bag\./i.test(blob),
    hasNotes: /id=["']notes["']/i.test(blob),
    hasShop: /id=["']shop["']/i.test(blob),
    genreHero: Boolean(c.expect.heroMust?.test(svg)),
    frame: (svg.match(/data-frame="(\d)"/) || [])[1] || null,
    misses,
    ok: misses.length === 0,
  };
}

function findFolder(brand) {
  if (!fs.existsSync(PROJECTS)) return null;
  const slug = slugOf(brand);
  const names = fs.readdirSync(PROJECTS);
  const exact = names.find((n) => n.toLowerCase() === slug || n.toLowerCase().includes(RUN));
  if (exact) return exact;
  const token = brand.split(/\s+/)[0].toLowerCase();
  return names
    .map((n) => {
      try { return { n, m: fs.statSync(path.join(PROJECTS, n)).mtimeMs }; } catch { return null; }
    })
    .filter((x) => x && x.n.toLowerCase().includes(token) && Date.now() - x.m < 30 * 60 * 1000)
    .sort((a, b) => b.m - a.m)[0]?.n || null;
}

async function waitForTextarea(evalE, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ok = await evalE(`Boolean(document.querySelector('textarea'))`).catch(() => false);
    if (ok) return true;
    await sleep(400);
  }
  return false;
}

async function typeAndSend(evalE, send, ask) {
  if (!(await waitForTextarea(evalE))) throw new Error('no textarea after wait');
  const askLit = JSON.stringify(ask);
  await evalE(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) throw new Error('no textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(ta, ${askLit});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    return true;
  })()`);
  await sleep(400);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(500);
  if (await evalE(`(document.querySelector('textarea')?.value || '').length > 8`)) {
    await evalE(`document.querySelector('textarea')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  }
}

async function newChat(evalE, send) {
  await evalE(`(() => {
    try {
      for (const k of Object.keys(localStorage)) {
        if (/composer-mode|plan-nudge|active-plan/i.test(k)) localStorage.removeItem(k);
      }
    } catch {}
    window.dispatchEvent(new CustomEvent('NOVA:new-chat'));
    return true;
  })()`);
  await sleep(1500);
  // Prefer clicking a New chat control if the custom event did not mount a composer.
  await evalE(`(() => {
    const btn = [...document.querySelectorAll('button,[role=button],a')].find((b) =>
      /new chat|new conversation|\\+\\s*chat/i.test((b.textContent || b.getAttribute('aria-label') || '').trim())
    );
    if (btn) btn.click();
    return Boolean(btn);
  })()`).catch(() => false);
  await sleep(1500);
  if (!(await waitForTextarea(evalE))) {
    try { await send('Page.reload', { ignoreCache: true }); } catch { /* */ }
    await sleep(3500);
  }
  if (!(await waitForTextarea(evalE))) throw new Error('no textarea after new chat');
}

async function runCase(c, session) {
  let { ws, send, evalE } = session;
  log(`\n=== CASE ${c.id.toUpperCase()} · ${c.brand} ===`);
  await newChat(evalE, send);
  ({ ws, send, evalE } = session);
  // Rebind after possible reload inside newChat.
  try {
    const again = await connect();
    ws = again.ws; send = again.send; evalE = again.evalE;
    session.ws = ws; session.send = send; session.evalE = evalE;
    await send('Page.enable');
    await send('Runtime.enable');
  } catch { /* keep prior session */ }
  const ask = c.prompt(c.brand);
  log('ASK:', ask);
  await typeAndSend(evalE, send, ask);
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < BUDGET_MS) {
    const elapsed = Math.round((Date.now() - t0) / 1000);
    let ui = null;
    try {
      ui = await evalE(`(() => {
        const body = document.body?.innerText || '';
        const stop = [...document.querySelectorAll('button')].some(b =>
          /stop generating/i.test(b.getAttribute('aria-label') || b.title || '')
        );
        // Avoid matching ask text ("Get it Live. Full sections…") — require craft-status shapes.
        const status = (body.match(/(?:Crafting|Coding|Depth continue|Depth preflight|Installing|Scaffold|Writing|Failed at:|Verifying|Ready|genre (?:lock|seed)|Thin create|Evidence)[^\\n]{0,100}/gi) || []).slice(-5);
        const liveBtn = [...document.querySelectorAll('button,[role=button]')].find(b =>
          /^Live$/i.test((b.textContent || '').trim()) || /get it live/i.test(b.textContent || '')
        );
        const liveOn = liveBtn ? (liveBtn.getAttribute('aria-pressed') === 'true'
          || /sky|emerald|active/i.test(liveBtn.className || '')) : false;
        return { stop, status, liveOn, tail: body.replace(/\\s+/g, ' ').slice(-280) };
      })()`);
    } catch (e) {
      log(`[${elapsed}s] CDP blip: ${String(e.message || e).slice(0, 100)}`);
      try {
        ws.close();
        ({ ws, send, evalE } = await connect());
        await send('Page.enable');
        await send('Runtime.enable');
      } catch { /* */ }
      await sleep(1500);
      continue;
    }
    const folder = findFolder(c.brand);
    const sig = JSON.stringify({ elapsed, folder, liveOn: ui?.liveOn, status: ui?.status });
    if (sig !== last) {
      last = sig;
      log(`[${elapsed}s]`, { folder, liveOn: ui?.liveOn, status: ui?.status, stop: ui?.stop });
    }
    if (folder && (ui?.liveOn || elapsed > 90)) {
      const judged = judgeCase(c, folder);
      // No soft bypass — genre hero + logo + no leak must clear, not just “has some SVG”.
      if (judged.ok) {
        return { ...judged, liveOn: ui?.liveOn, elapsed, brand: c.brand, id: c.id };
      }
      // Craft finished (Ready / no Stop) but disk still fails genre gates — don't burn the budget.
      const craftDone = !ui?.stop && /Ready|Live is open|Live evidence/i.test((ui?.status || []).join(' '));
      if (craftDone && elapsed > 100) {
        return { ...judged, liveOn: ui?.liveOn, elapsed, brand: c.brand, id: c.id, earlyFail: true };
      }
    }
    if (/Failed at:/i.test(ui?.tail || '') && elapsed > 120 && folder) {
      return { ...judgeCase(c, folder), liveOn: ui?.liveOn, elapsed, brand: c.brand, id: c.id, failedUi: true };
    }
    await sleep(POLL_MS);
  }
  const folder = findFolder(c.brand);
  return {
    id: c.id,
    brand: c.brand,
    elapsed: Math.round(BUDGET_MS / 1000),
    timeout: true,
    ...(folder ? judgeCase(c, folder) : { folder: null, ok: false, misses: ['no project folder'] }),
  };
}

log('UI-ready Live verify · CDP', PORT, '· run', RUN);
let session = await connect();
await session.send('Page.enable');
await session.send('Runtime.enable');
try { await session.send('Page.bringToFront'); } catch { /* */ }
await session.send('Page.reload', { ignoreCache: true });
await sleep(4000);
session = await connect();
await session.send('Page.enable');
await session.send('Runtime.enable');

const results = [];
for (const c of CASES) {
  const r = await runCase(c, session);
  results.push(r);
  log('RESULT', r.id, r.ok ? 'PASS' : 'FAIL', r);
  // reconnect between cases
  try { session.ws.close(); } catch { /* */ }
  await sleep(1500);
  session = await connect();
  await session.send('Page.enable');
  await session.send('Runtime.enable');
}

const summary = {
  run: RUN,
  at: new Date().toISOString(),
  results,
  allOk: results.every((r) => r.ok),
};
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
log('\n=== SUMMARY ===');
log(JSON.stringify(summary, null, 2));
log('wrote', OUT);
try { session.ws.close(); } catch { /* */ }
process.exit(summary.allOk ? 0 : 1);
