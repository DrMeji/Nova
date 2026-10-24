/**
 * Live bottle-shop create (full prompt or step).
 *   $env:NOVA_CDP_PORT='9230'; $env:NOVA_BOTTLE_MODE='full'; node scripts/_live-bottle-shop-create.mjs
 *   $env:NOVA_BOTTLE_MODE='step'; $env:NOVA_BOTTLE_STEP='1'; node ...
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9230);
const MODE = String(process.env.NOVA_BOTTLE_MODE || 'full').toLowerCase();
const STEP = String(process.env.NOVA_BOTTLE_STEP || '1');
const RUN = Date.now().toString(36).slice(-4);
const BRAND = process.env.NOVA_CREATE_BRAND || `PeakFlask ${RUN}`;
const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const TEST_STARTED_AT = Date.now();
const OUT = path.join(process.cwd(), 'scripts', '_live-bottle-shop-out.txt');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keepAlive = setInterval(() => {}, 60_000);
process.on('exit', () => clearInterval(keepAlive));

const FULL_PROMPT = [
  `Build a full e-commerce storefront website on disk for an original insulated bottle brand called ${BRAND} (not Yeti — invent our own brand).`,
  'This is a shopping site with cart + checkout flow — not a blank page, not a solid color wipe.',
  'Light warm ivory page (#f7f3eb), welcoming and professional — avoid dark charcoal themes.',
  'Product catalog grid with exactly 9 bottles in src/data/products.ts. Each bottle: unique name, unique color, blurb, and its own price.',
  'Real add-to-cart: qty steppers, cart drawer, line items, running total, purchase/checkout button.',
  'Also ship About the company, Careers, Help/Support, and a support email in the footer/nav.',
  'Header: logo, Shop / About / Careers / Help links, cart icon with count. Clean product cards with color chips.',
  'Rich outdoor-gear bottle store people would actually buy from. New project folder — do not edit whatever is open.',
].join(' ');

const STEPS = {
  1: `Create project now — go build on disk, no planning. New website folder for bottle brand ${BRAND}. Light warm ivory page (#f7f3eb), welcoming professional store. Shell first only: header with logo + Shop/About/Careers/Help, cart icon, footer with support email. Do not edit whatever folder is open.`,
  2: `On the ${BRAND} store, add a product grid with exactly 9 bottle cards on the ivory page. Each card: different bottle color, name, short blurb, unique price, Add to cart button. Put products in src/data/products.ts.`,
  3: `Wire a real cart for ${BRAND}: Add to cart updates qty, cart icon shows count, cart drawer lists line items with prices and total, user can change qty or remove. Keep the ivory welcoming look.`,
  4: `Finish ${BRAND}: About the company, Careers, Help/Support with contact email. Make the storefront feel complete for buying bottles — still light ivory, not dark.`,
  go: `Create project now. Go build ${BRAND} on disk — stop planning, write the Vite React folder, shell with ivory page, header Shop/About/Careers/Help, cart icon, support email footer.`,
};

const prompt = MODE === 'step'
  ? (STEPS[STEP] || STEPS['1'])
  : FULL_PROMPT;

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

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  try { fs.appendFileSync(OUT, `${line}\n`); } catch { /* ignore */ }
}

try {
  fs.writeFileSync(OUT, `=== bottle shop ${MODE} step=${STEP} ${new Date().toISOString()} ===\n`);
} catch { /* ignore */ }

let list;
for (let i = 0; i < 40; i++) {
  try {
    list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
    if (list?.length) break;
  } catch { /* wait */ }
  await sleep(500);
}
const page = list?.find((t) => t.type === 'page' && /nova/i.test(String(t.title || '')))
  || list?.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error(`NOVA missing on CDP ${PORT}`);
log('CDP page:', page.title, page.url);

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
await sleep(1500);

if (MODE !== 'step' || STEP === '1') {
  await evalE(`(() => {
    const els = [...document.querySelectorAll('button,[role=button],a')];
    const hits = els.filter((el) => (el.getAttribute('aria-label') || '') === 'Chat');
    hits.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
    if (hits[0]) hits[0].click();
    return true;
  })()`);
  await sleep(600);
  await evalE(`(() => {
    const btns = [...document.querySelectorAll('button,[role=button]')];
    const neu = btns.find((b) => /new chat|new conversation/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
    if (neu) { neu.click(); return 'new'; }
    return 'skip';
  })()`);
  await sleep(1000);
  await evalE(`(() => {
    const els = [...document.querySelectorAll('button,[role=button],a')];
    const clear = els.find((el) => /clear folder|unbind|close project|leave folder/i.test(
      ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim(),
    ));
    if (clear) { clear.click(); return 'cleared'; }
    return 'none';
  })()`);
  await sleep(400);
}

log('=== BOTTLE SHOP CREATE ===');
log('Mode:', MODE, 'Step:', STEP);
log('Brand:', BRAND);
log('Prompt:', prompt);

const primed = await evalE(`(() => {
  const ta = document.querySelector('textarea.nova-composer-textarea, textarea');
  if (!ta) return { ok: false, reason: 'no textarea' };
  const text = ${JSON.stringify(prompt)};
  // Reset React value tracker so controlled input accepts the new value.
  const tracker = ta._valueTracker;
  if (tracker && typeof tracker.setValue === 'function') tracker.setValue('');
  const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  d.set.call(ta, text);
  ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
  ta.focus();
  // Call React onKeyDown/onChange via fiber props when available.
  const key = Object.keys(ta).find((k) => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$'));
  let via = 'dom';
  if (key && key.startsWith('__reactProps$')) {
    const props = ta[key];
    try { props?.onChange?.({ target: ta, currentTarget: ta }); via = 'react-onChange'; } catch { /* ignore */ }
  } else if (key && key.startsWith('__reactFiber$')) {
    let fiber = ta[key];
    for (let i = 0; i < 8 && fiber; i++, fiber = fiber.return) {
      const props = fiber.memoizedProps || fiber.pendingProps;
      if (props && typeof props.onChange === 'function') {
        try { props.onChange({ target: ta, currentTarget: ta }); via = 'fiber-onChange'; break; } catch { /* ignore */ }
      }
    }
  }
  return { ok: true, len: (ta.value || '').length, via };
})()`);
log('prime:', primed);
if (!primed?.ok) throw new Error(primed?.reason || 'prime failed');

// Nova composer has no Send button — Enter submits (React handler or CDP Input).
const sent = await evalE(`(() => {
  const ta = document.querySelector('textarea.nova-composer-textarea, textarea');
  if (!ta) return { ok: false, reason: 'no textarea' };
  ta.focus();
  const fake = {
    key: 'Enter', code: 'Enter', which: 13, keyCode: 13,
    shiftKey: false, preventDefault() {}, stopPropagation() {},
    target: ta, currentTarget: ta, nativeEvent: { isComposing: false },
  };
  const propKey = Object.keys(ta).find((k) => k.startsWith('__reactProps$'));
  if (propKey && typeof ta[propKey]?.onKeyDown === 'function') {
    ta[propKey].onKeyDown(fake);
    return { ok: true, via: 'react-onKeyDown', len: (ta.value || '').length };
  }
  let fiber = ta[Object.keys(ta).find((k) => k.startsWith('__reactFiber$'))];
  for (let i = 0; i < 10 && fiber; i++, fiber = fiber.return) {
    const props = fiber.memoizedProps || fiber.pendingProps;
    if (props && typeof props.onKeyDown === 'function') {
      props.onKeyDown(fake);
      return { ok: true, via: 'fiber-onKeyDown', len: (ta.value || '').length };
    }
  }
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true, cancelable: true }));
  return { ok: true, via: 'dom-enter', len: (ta.value || '').length };
})()`);
log('send:', sent);
if (!sent?.ok) {
  try {
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r',
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
    });
    log('send:', { ok: true, via: 'cdp-enter-fallback' });
  } catch (e) {
    throw new Error(`send failed: ${e}`);
  }
}

// Confirm the turn actually started.
let sawWorking = false;
for (let i = 0; i < 20; i++) {
  await sleep(1000);
  const live = await evalE(`(() => {
    const el = document.querySelector('[aria-label^="Working "], [data-nova-status]');
    return (el?.getAttribute('aria-label') || el?.textContent || '').slice(0, 140);
  })()`).catch(() => '');
  const taLen = await evalE(`(() => (document.querySelector('textarea')?.value || '').length)`).catch(() => -1);
  if (live && /working|building|creating|writing|scaffold|invent|ladder|thinking/i.test(live)) {
    sawWorking = true;
    log('confirmed working:', live);
    break;
  }
  // Composer cleared after send is also a good signal.
  if (typeof taLen === 'number' && taLen === 0 && i >= 2) {
    log('composer cleared after send — assuming started');
    sawWorking = true;
    break;
  }
  if (i === 8 || i === 14) {
    log('re-Enter via CDP…');
    try {
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r',
      });
      await send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
      });
    } catch { /* ignore */ }
  }
}
if (!sawWorking) {
  log('WARN: never saw Working status — create may not have started');
}

const brandCore = BRAND.replace(/\s+[a-z0-9]{3,5}$/i, '').trim() || BRAND;
const t0 = Date.now();
let reply = '';
let lastStatus = '';
const wallMs = MODE === 'step' ? 420_000 : 900_000;

while (Date.now() - t0 < wallMs) {
  await sleep(4000);
  let liveLabel = '';
  try {
    liveLabel = await evalE(`(() => {
      const el = document.querySelector('[aria-label^="Working "], [data-nova-status]');
      return (el?.getAttribute('aria-label') || el?.textContent || '').slice(0, 140);
    })()`);
  } catch { /* ignore */ }
  if (liveLabel && liveLabel !== lastStatus) {
    lastStatus = liveLabel;
    log(`status @${Math.round((Date.now() - t0) / 1000)}s:`, liveLabel);
  } else {
    process.stdout.write(`\r… ${Math.round((Date.now() - t0) / 1000)}s ${(liveLabel || lastStatus || '').slice(0, 70)}   `);
  }

  let snap = null;
  try {
    snap = await evalE(`(() => {
      const brand = ${JSON.stringify(BRAND)};
      let best = null;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !/NOVA:chat-thread:chat:/.test(k)) continue;
        let arr = [];
        try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
        let userIdx = -1;
        for (let j = arr.length - 1; j >= 0; j--) {
          const c = String(arr[j]?.content || '');
          if (arr[j]?.role === 'user' && (c.includes(brand) || c.includes(${JSON.stringify(prompt.slice(0, 48))}))) {
            userIdx = j; break;
          }
        }
        if (userIdx < 0) continue;
        const last = arr[arr.length - 1];
        if (last?.role === 'assistant' && /^__generating__:/i.test(String(last.content || ''))) {
          return { generating: true, status: String(last.content || '').slice(0, 180) };
        }
        for (let j = arr.length - 1; j > userIdx; j--) {
          if (arr[j]?.role === 'assistant' && !/^__generating__:/i.test(String(arr[j].content || ''))) {
            const ts = Number(arr[j].createdAt || arr[j].ts || arr[j].at || 0);
            if (ts && ts < ${TEST_STARTED_AT} - 5000) continue;
            const content = String(arr[j].content || '');
            // Ignore stale replies from other brands (e.g. PeakFlask while waiting on TrailCask).
            const brandHit = content.includes(${JSON.stringify(brandCore)})
              || content.includes(${JSON.stringify(BRAND)})
              || /Created\s+\*\*|Live is open|Dependencies|project is ready|scaffolded|cart|Ready|create miss/i.test(content);
            if (!brandHit && content.length < 800) continue;
            const row = { generating: false, content };
            if (!best || row.content.length > best.content.length) best = row;
          }
        }
      }
      return best;
    })()`);
  } catch { continue; }

  if (snap?.generating) continue;
  if (snap?.content && snap.content.length > 40) {
    const spoken = (() => {
      const m = snap.content.match(/<!--nova-trace:([\s\S]*?)-->/);
      if (m?.[1]) {
        try {
          const ans = String(JSON.parse(m[1])?.answer || '').trim();
          if (ans) return ans;
        } catch { /* fall */ }
      }
      return snap.content;
    })();
    const looksDone = /Created\s+\*\*|create miss|Live is open|Here you go|Unavailable|cart|Ready|Dependencies|project is ready|scaffolded|hard guarantee|storefront/i.test(spoken);
    if (!looksDone && Date.now() - t0 < Math.min(wallMs - 30_000, 720_000)) continue;
    reply = spoken;
    log('\n=== reply ===');
    log(spoken.slice(0, 1800));
    break;
  }

  // Disk-ready early exit for commerce creates (reply can lag / hang after files land).
  if (Date.now() - t0 > 45_000) {
    try {
      const entries = fs.readdirSync(PROJECTS, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => {
          const p = path.join(PROJECTS, d.name);
          let m = 0;
          try { m = fs.statSync(p).mtimeMs; } catch { /* ignore */ }
          return { name: d.name, path: p, m };
        })
        .filter((d) => new RegExp(brandCore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(d.name))
        .sort((a, b) => b.m - a.m);
      const hit = entries[0];
      if (hit?.path && hit.m >= TEST_STARTED_AT - 10_000) {
        const prod = path.join(hit.path, 'src', 'data', 'products.ts');
        const appP = ['src/App.jsx', 'src/App.tsx'].map((rel) => path.join(hit.path, rel)).find((p) => fs.existsSync(p));
        if (fs.existsSync(prod) && appP) {
          const app = fs.readFileSync(appP, 'utf8');
          const products = fs.readFileSync(prod, 'utf8');
          const n = (products.match(/"id"\s*:/g) || []).length;
          const cartOk = /setCart|Add to cart|addToCart/i.test(app);
          if (n >= 9 && cartOk) {
            log('\n=== disk-ready early exit ===');
            log({ name: hit.name, products: n, cartOk, appBytes: app.length });
            reply = `Disk ready: ${hit.name} · ${n} products · cart=${cartOk}`;
            break;
          }
        }
      }
    } catch { /* ignore */ }
  }
}

let disk = null;
try {
  const entries = fs.readdirSync(PROJECTS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const p = path.join(PROJECTS, d.name);
      let m = 0;
      try { m = fs.statSync(p).mtimeMs; } catch { /* ignore */ }
      return { name: d.name, path: p, m };
    })
    .filter((d) => new RegExp(brandCore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(d.name))
    .sort((a, b) => b.m - a.m);
  disk = entries[0] || null;
} catch { /* ignore */ }

log('\n=== disk ===');
log(disk || 'no matching folder');

if (disk?.path) {
  const walk = (dir, acc = []) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory() && !/node_modules|\.git/.test(ent.name)) walk(p, acc);
      else if (/\.(jsx?|tsx?|css|json)$/i.test(ent.name)) acc.push(p);
    }
    return acc;
  };
  const files = walk(disk.path);
  const appPath = files.find((f) => /src[/\\]App\.(jsx|tsx)$/i.test(f));
  const productsPath = files.find((f) => /products\.(ts|js|jsx|tsx)$/i.test(f));
  const app = appPath ? fs.readFileSync(appPath, 'utf8') : '';
  const products = productsPath ? fs.readFileSync(productsPath, 'utf8') : '';
  const allText = files.map((f) => {
    try { return fs.readFileSync(f, 'utf8'); } catch { return ''; }
  }).join('\n');
  const priceHits = (allText.match(/\$\s?\d+(?:\.\d{2})?/g) || []).length;
  const addHits = (allText.match(/add\s+to\s+(?:cart|bag)/gi) || []).length;
  const cartHits = (allText.match(/\bcart\b/gi) || []).length;
  const cream = /#f[5-9a-f]{5}|#fff[a-f0-9]{0,2}|cream|off-?white|floralwhite|seashell|#fafaf[0-9a-f]|#f5f5f[0-9a-f]|#f7f3|bg-\[#f/i.test(allText);
  const darkHeavy = /#0[0-3][0-9a-f]{4}|background:\s*#0[0-2]|min-height:100.*#0b0f14/i.test(allText);
  log('app bytes:', app.length, 'products bytes:', products.length);
  log('signals:', {
    priceHits,
    addHits,
    cartHits,
    creamish: cream,
    darkHeavy,
    hasAbout: /about/i.test(allText),
    hasCareers: /career/i.test(allText),
    hasHelp: /help|support/i.test(allText),
    hasEmail: /@|mailto:/i.test(allText),
    productCountGuess: Math.max(
      (products.match(/name\s*:/gi) || []).length,
      (allText.match(/oz\s+(?:water\s+)?bottle/gi) || []).length,
      (allText.match(/\$\d+/g) || []).length,
    ),
  });
}

log('\nDONE in', Math.round((Date.now() - t0) / 1000), 's');
ws.close();
clearInterval(keepAlive);
process.exit(0);
