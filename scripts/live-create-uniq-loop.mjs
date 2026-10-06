/**
 * Live uniqueness prove-out loop — build brand-new products in Nova via CDP.
 * Uses never-before-used product names so Design Spine cannot reuse TipWise/LeafNote/Luna looks.
 *
 *   $env:NOVA_CDP_PORT='9234'; npx tsx --tsconfig tsconfig.app.json scripts/live-create-uniq-loop.mjs
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import { STOCK_SPINE_CLONE_RE } from '../src/lib/createDesignSystem.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9234);
const OUT = path.join(__dirname, '_create-uniq-loop-out.txt');
const RESULTS = path.join(__dirname, '_create-uniq-loop-results.json');
const MAX_ROUNDS = Number(process.env.NOVA_UNIQ_ROUNDS || 4);
const PER_ROUND_MS = Number(process.env.NOVA_UNIQ_ROUND_MS || 420_000);
const KIND_FILTER = String(process.env.NOVA_UNIQ_KIND || 'all').toLowerCase();
const RUN_TAG = String(process.env.NOVA_UNIQ_TAG || Date.now().toString(36)).slice(0, 8);

const ALL_CASES = [
  {
    id: 'driftwood-boats',
    kind: 'website',
    product: `Driftwood${RUN_TAG}`,
    ask: [
      `Build a complete marketing website for Driftwood${RUN_TAG}, a coastal boat brand.`,
      'Unique visual identity — not a skincare/Luna look and not a Harbor clone. Dark maritime palette, product homepage,',
      'nav, hero, three story bands, footer. Working CTA button. Skip Plan. Ok start building on disk now.',
    ].join(' '),
  },
  {
    id: 'splitcheck-app',
    kind: 'application',
    product: `SplitCheck${RUN_TAG}`,
    ask: [
      `Build a complete tip calculator web app called SplitCheck${RUN_TAG}.`,
      'Utility tool UI — bill amount, tip percent, split people, live totals. Settings toggle for dark mode.',
      'Clean professional software look, not a marketing homepage and not a TipWise clone. Skip Plan. Ok start building on disk now.',
    ].join(' '),
  },
  {
    id: 'kilnco-coffee',
    kind: 'website',
    product: `KilnCo${RUN_TAG}`,
    ask: [
      `Build a complete coffee brand website for KilnCo${RUN_TAG}.`,
      'Warm bakery/coffee identity — different from skincare, boats, or Ember Roast. Hero, story bands, menu CTA.',
      'Skip Plan. Ok start building on disk now.',
    ].join(' '),
  },
  {
    id: 'inkwell-app',
    kind: 'application',
    product: `InkWell${RUN_TAG}`,
    ask: [
      `Build a complete notes app called InkWell${RUN_TAG} with sidebar note list, editor, and a Settings panel`,
      '(font size + theme). Sign-in screen with email + continue button (local state only, no backend).',
      'Real working tabs/panels. Professional software chrome — not a skincare homepage and not a LeafNote clone. Skip Plan. Ok start building on disk now.',
    ].join(' '),
  },
];

const CASES = KIND_FILTER === 'all'
  ? ALL_CASES
  : ALL_CASES.filter((c) => c.kind === KIND_FILTER || c.kind.startsWith(KIND_FILTER));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
function log(s) {
  const t = `[${new Date().toISOString().slice(11, 19)}] ${s}`;
  console.log(t);
  lines.push(t);
  try { fs.writeFileSync(OUT, `${lines.join('\n')}\n`); } catch { /* */ }
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
  const page = (list || []).find((t) => t.type === 'page' && /nova/i.test(`${t.title} ${t.url}`))
    || (list || []).find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error(`No CDP page on ${PORT}`);
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
  return { ws, send, evalE };
}

function scoreClone(appSrc, productName, kind, ask = '') {
  const reasons = [];
  const name = String(productName || '');
  if (STOCK_SPINE_CLONE_RE.test(appSrc)) reasons.push('stock-spine-clone-copy');
  if (/orb orb-1[\s\S]*orb orb-2[\s\S]*orb orb-3/i.test(appSrc) && !/skincare|serum|beauty/i.test(`${name} ${ask}`)) {
    reasons.push('soft-orbs-on-non-beauty');
  }
  if (/Nourish Your Skin|Embrace Radiance|Skin, moonlight/i.test(appSrc)) reasons.push('luna-headline-reuse');
  if (/The Luna ritual|Form that earns its keep|Made for real rooms/i.test(appSrc)) reasons.push('luna-band-reuse');
  if (/Welcome to (?:LeafNote|TipWise|Luna|Harbor|Ember)/i.test(appSrc) && !new RegExp(name, 'i').test(appSrc.slice(0, 200))) {
    reasons.push('prior-product-name-leak');
  }
  if (kind === 'application') {
    const isTip = /tip|calculator|SplitCheck|TipWise/i.test(`${name} ${ask}`);
    const isNotes = /note|InkWell|LeafNote/i.test(`${name} ${ask}`);
    if (/site-hero|site-band/i.test(appSrc) && !/tool-panel|tool-chrome|app-shell|app-sidebar|bill|tipPct|tip percent/i.test(appSrc)) {
      reasons.push('app-built-as-marketing-shell');
    }
    if (isTip && !(/input|tipPct|bill|onChange|tip percent/i.test(appSrc))) {
      reasons.push('tip-app-missing-controls');
    }
    if (isNotes && !(/sidebar|app-sidebar|settings|signIn|sign-in|authed|notes/i.test(appSrc))) {
      reasons.push('notes-app-missing-chrome');
    }
  }
  if (/\n\}\s*\n\s*<\/div>\s*\n\}/i.test(appSrc)) reasons.push('trailing-jsx-junk');
  return { ok: reasons.length === 0, reasons };
}

function findLatestProject(product) {
  const root = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects');
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root)
    .map((name) => ({ name, full: path.join(root, name), mtime: fs.statSync(path.join(root, name)).mtimeMs }))
    .filter((d) => fs.statSync(d.full).isDirectory())
    .filter((d) => new RegExp(`^${product.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-\\d+)?$`, 'i').test(d.name))
    .sort((a, b) => b.mtime - a.mtime);
  return dirs[0] || null;
}

async function wipeOldProjectsAndMemory(evalE) {
  const root = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects');
  if (fs.existsSync(root)) {
    for (const name of fs.readdirSync(root)) {
      const full = path.join(root, name);
      try {
        fs.rmSync(full, { recursive: true, force: true });
        log(`wiped project ${name}`);
      } catch (e) {
        log(`wipe fail ${name}: ${e.message || e}`);
      }
    }
  }
  await evalE(`(() => {
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (/chat-build-memory|chat-studio|last-disk|last-pending|composer-mode|plan-nudge|active-plan|NOVA:chat/i.test(k)) {
          localStorage.removeItem(k);
        }
      }
      // Force locked chrome prefs immediately.
      const prefsRaw = localStorage.getItem('NOVA:local-prefs') || localStorage.getItem('nova:local-prefs');
      // also try known key patterns
      for (const k of Object.keys(localStorage)) {
        if (/local-prefs|localPrefs/i.test(k)) {
          try {
            const p = JSON.parse(localStorage.getItem(k) || '{}');
            p.prefsVersion = 11;
            p.density = 'comfortable';
            p.compactSidebar = false;
            p.fontSizePx = 16;
            localStorage.setItem(k, JSON.stringify(p));
          } catch {}
        }
      }
      void prefsRaw;
      window.dispatchEvent(new CustomEvent('NOVA:new-chat'));
      return true;
    } catch (e) { return String(e); }
  })()`);
  log('cleared chat build memory + forced chrome prefs v11');
}

async function runCase(c, round) {
  log(`=== round ${round} · ${c.id} (${c.kind}) · ${c.product} ===`);
  const { ws, send, evalE } = await connect();
  try {
    await send('Page.reload', { ignoreCache: true });
    await sleep(4500);
    await evalE(`(() => {
      try {
        for (const k of Object.keys(localStorage)) {
          if (/composer-mode|plan-nudge|active-plan|chat-build-memory/i.test(k)) localStorage.removeItem(k);
        }
      } catch {}
      window.dispatchEvent(new CustomEvent('NOVA:new-chat'));
      return true;
    })()`);
    await sleep(2000);
    log(`ASK: ${c.ask.slice(0, 160)}…`);
    await evalE(`(() => {
      const ta = document.querySelector('textarea');
      if (!ta) throw new Error('no textarea');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(ta, ${JSON.stringify(c.ask)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      return true;
    })()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });

    const t0 = Date.now();
    let last = '';
    while (Date.now() - t0 < PER_ROUND_MS) {
      const snap = await evalE(`(() => {
        const body = document.body?.innerText || '';
        const stop = [...document.querySelectorAll('button')].some((b) => /stop/i.test(b.getAttribute('aria-label') || b.textContent || ''));
        const live = /\\bLive\\b/.test(body) && !/Live locked/i.test(body.slice(-800));
        const fail = /craft preflight failed|blocked Ready|could not|Live Preview could not render/i.test(body.slice(-1600));
        const status = (document.querySelector('[aria-live="polite"]')?.textContent || '').trim().slice(0, 140);
        const folder = (body.match(/NOVA Projects\\\\[^\\s]+/i) || body.match(/NOVA Projects\\/[\\w.-]+/i) || [])[0] || '';
        return { stop, live, fail, status, folder, tail: body.slice(-500) };
      })()`);
      if (snap.status && snap.status !== last) {
        log(`status: ${snap.status}`);
        last = snap.status;
      }
      if (!snap.stop && Date.now() - t0 > 20_000 && (snap.live || snap.fail || /Done|is up\\.|checked out/i.test(snap.tail))) {
        log(snap.fail ? 'ended fail-ish' : 'turn idle');
        break;
      }
      await sleep(2500);
    }

    const proj = findLatestProject(c.product.split(' ')[0]);
    let app = '';
    if (proj) {
      for (const rel of ['src/App.tsx', 'src/App.jsx']) {
        const p = path.join(proj.full, rel);
        if (fs.existsSync(p)) { app = fs.readFileSync(p, 'utf8'); break; }
      }
      log(`disk: ${proj.full} appBytes=${app.length}`);
    } else {
      log('disk: project folder not found');
    }
    const clone = scoreClone(app, c.product, c.kind, c.ask);
    const interactive = c.kind === 'application'
      ? (/useState/i.test(app)
        && (/onChange|onClick/i.test(app))
        && (/tool-panel|tool-chrome|app-shell|app-sidebar|bill|tipPct|authed|note-list/i.test(app)))
      : /site-hero|site-band|btn-primary/i.test(app);
    const pass = Boolean(app) && clone.ok && interactive && app.length > 800;
    log(`RESULT ${c.id}: pass=${pass} cloneOk=${clone.ok} reasons=${clone.reasons.join(',') || 'none'} interactive=${interactive}`);

    if (!pass) {
      await evalE(`window.dispatchEvent(new CustomEvent('NOVA:new-chat')); true`);
      log('scratched chat (clone or incomplete)');
    }
    return {
      id: c.id,
      kind: c.kind,
      product: c.product,
      pass,
      clone,
      interactive,
      project: proj?.full || null,
      appBytes: app.length,
    };
  } finally {
    ws.close();
  }
}

const results = [];
log(`Uniq loop start · CDP ${PORT} · tag ${RUN_TAG} · up to ${Math.min(MAX_ROUNDS, CASES.length)} rounds`);
{
  const { ws, evalE } = await connect();
  try {
    await wipeOldProjectsAndMemory(evalE);
  } finally {
    ws.close();
  }
}
for (let i = 0; i < Math.min(MAX_ROUNDS, CASES.length); i += 1) {
  try {
    results.push(await runCase(CASES[i], i + 1));
  } catch (e) {
    log(`ERROR ${CASES[i].id}: ${e.message || e}`);
    results.push({ id: CASES[i].id, pass: false, error: String(e.message || e) });
  }
}

const passed = results.filter((r) => r.pass);
const summary = {
  at: new Date().toISOString(),
  tag: RUN_TAG,
  passed: passed.length,
  total: results.length,
  results,
  stopWorthy: passed.length >= 2 && passed.some((r) => r.kind === 'website') && passed.some((r) => r.kind === 'application'),
};
fs.writeFileSync(RESULTS, `${JSON.stringify(summary, null, 2)}\n`);
log(`SUMMARY passed=${summary.passed}/${summary.total} stopWorthy=${summary.stopWorthy}`);
log(`Wrote ${OUT}`);
process.exit(summary.passed > 0 ? 0 : 1);
