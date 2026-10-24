/**
 * Nova-only redesign of Ridgeline Carry — Cursor only binds + submits via CDP.
 *
 *   $env:NOVA_CDP_PORT='9333'; npx tsx --tsconfig tsconfig.app.json scripts/live-luggage-redesign-once.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9333);
const DISK = process.env.NOVA_LUGGAGE_DISK
  || path.join(os.homedir(), 'Documents', 'NOVA Projects', 'ridgeline-carry-xnws');
const BRAND = process.env.NOVA_CREATE_BRAND || 'Ridgeline Carry xnws';
const TIMEOUT_MS = Number(process.env.NOVA_CREATE_TIMEOUT_MS || 25 * 60_000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();

if (!fs.existsSync(DISK)) {
  console.error('Missing project folder:', DISK);
  process.exit(2);
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

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const page = list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || '') && /5173/.test(t.url || ''))
  || list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || ''))
  || list.find((t) => t.type === 'page');
if (!page) {
  console.error('No Nova CDP page on', PORT);
  process.exit(3);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(String(raw));
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});
const send = (method, params = {}, timeoutMs = 20_000) => new Promise((resolve, reject) => {
  const i = ++id;
  const t = setTimeout(() => {
    pending.delete(i);
    reject(new Error(`CDP timeout ${method}`));
  }, timeoutMs);
  pending.set(i, {
    resolve: (v) => { clearTimeout(t); resolve(v); },
    reject: (e) => { clearTimeout(t); reject(e); },
  });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evalE = async (expression, timeoutMs = 20_000, awaitPromise = true) => {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
    userGesture: true,
  }, timeoutMs);
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');

console.log('=== NOVA LIVE REDESIGN · LUGGAGE ===');
console.log('Brand:', BRAND);
console.log('Disk:', DISK);
console.log('Watch the Nova window — Cursor only submits the ask.');
console.log('');

console.log('prefs…');
await evalE(`(() => {
  const raw = localStorage.getItem('NOVA:local-prefs');
  const prefs = raw ? JSON.parse(raw) : {};
  prefs.agentLoopOnEdit = true;
  prefs.agentLoopOnCreate = true;
  prefs.agentLoopEnabled = true;
  prefs.planApproveGate = false;
  prefs.approvalPolicy = 'on-request';
  prefs.sandboxMode = 'workspace-write';
  prefs.prefsVersion = Math.max(17, Number(prefs.prefsVersion) || 0);
  localStorage.setItem('NOVA:local-prefs', JSON.stringify(prefs));
  return true;
})()`, 10_000, false);

console.log('ui prep…');
await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button]')];
  const stop = els.find((el) => /stop|cancel|abort/i.test((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')));
  if (stop) stop.click();
  return Boolean(stop);
})()`, 10_000, false);
await sleep(600);

await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const hits = els.filter((el) => (el.getAttribute('aria-label') || '') === 'Chat');
  hits.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
  if (hits[0]) hits[0].click();
  return Boolean(hits[0]);
})()`, 10_000, false);
await sleep(500);

await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const hit = els.find((el) => /new chat|new conversation/i.test((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')));
  if (hit) hit.click();
  return Boolean(hit);
})()`, 10_000, false);
await sleep(1000);

console.log('bind…');
let bind;
try {
  bind = await evalE(`(async () => {
    const api = window.novaDesktop;
    const root = ${JSON.stringify(DISK)};
    const out = { root };
    try {
      if (api?.workspaceOpenRoot) {
        out.open = await Promise.race([
          api.workspaceOpenRoot({
            projectId: 'proj-luggage-' + Date.now().toString(36),
            projectName: ${JSON.stringify(BRAND)},
            sourceDir: root,
            catalogOnly: true,
          }),
          new Promise((r) => setTimeout(() => r({ timedOut: true }), 8000)),
        ]);
      }
    } catch (e) { out.openErr = String(e?.message || e); }
    try {
      if (api?.workspaceSetGrants) {
        out.grants = await Promise.race([
          api.workspaceSetGrants({ paths: [root], allowDocumentsFolderAccess: true }),
          new Promise((r) => setTimeout(() => r({ timedOut: true }), 5000)),
        ]);
      }
    } catch (e) { out.grantErr = String(e?.message || e); }
    try {
      localStorage.setItem('NOVA:last-disk-target', JSON.stringify({
        path: root,
        name: ${JSON.stringify(BRAND)},
        kind: 'folder',
      }));
    } catch {}
    try {
      for (const k of Object.keys(localStorage)) {
        if (/chat-last-disk-target|chat-studio:|chat-pending/i.test(k)) {
          try {
            const o = JSON.parse(localStorage.getItem(k) || '{}');
            if (o && typeof o === 'object') {
              o.path = root;
              o.name = ${JSON.stringify(BRAND)};
              localStorage.setItem(k, JSON.stringify(o));
            }
          } catch {}
        }
      }
    } catch {}
    return out;
  })()`, 25_000, true);
} catch (e) {
  console.warn('bind soft-fail', String(e.message || e));
  bind = await evalE(`(() => {
    const root = ${JSON.stringify(DISK)};
    localStorage.setItem('NOVA:last-disk-target', JSON.stringify({
      path: root, name: ${JSON.stringify(BRAND)}, kind: 'folder',
    }));
    return { root, localOnly: true };
  })()`, 10_000, false);
}
console.log('bind', bind);
await sleep(800);

const prompt = [
  `Edit the bound **${BRAND}** project on disk — same brand, completely new website look.`,
  'Full redesign of src/App.jsx + src/App.css (rewrite both). Target quality between quality and premium — not the current basic numbered bag-layers invent-demo.',
  'MUST look different: no sticky “01–12” text spreadsheet list as the hero idea. Use a new composition — e.g. full-bleed travel hero, featured suitcase spotlight, magazine-style product strips or alternating large/small bag features, strong type hierarchy, atmosphere (gradients/texture), at least one intentional motion (hover or entrance).',
  'Keep: brand name Ridgeline Carry xnws large in the first viewport, exactly 12 unique bags (name, type, short blurb, price), working contact form with name/email state, /logo.svg in nav.',
  'Remove data-nova-invent-demo and layout-luggage demo markers. Customer-facing copy only — no harness phrases like “not a three-tile twin grid”.',
  'Pull or add real travel/luggage imagery under public/ if you can (Unsplash/remote ok); otherwise craft rich SVG/CSS scenes so it does not look like a wireframe.',
  'Skip Plan. Start editing on disk now and refresh Live when ready.',
].join(' ');

console.log('Prompt:', prompt.slice(0, 220) + '…');
console.log('');

console.log('submit redesign ask…');
await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) throw new Error('no textarea');
  const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  d.set.call(ta, ${JSON.stringify(prompt)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  return true;
})()`, 15_000, false);
console.log('submitted — watch Nova');

const needle = prompt.slice(0, 48);
let lastStatus = '';
let reply = '';

while (Date.now() - T0 < TIMEOUT_MS) {
  await sleep(4000);
  const snap = await evalE(`(() => {
    const needle = ${JSON.stringify(needle)};
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
    }
    for (const k of keys) {
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
      let userIdx = -1;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i]?.role === 'user' && String(arr[i].content || '').includes(needle)) { userIdx = i; break; }
      }
      if (userIdx < 0) continue;
      const last = arr[arr.length - 1];
      if (last?.role === 'assistant' && /^__generating__:/i.test(String(last.content || ''))) {
        return { generating: true, status: String(last.content || '').slice(0, 160) };
      }
      let asst = null;
      for (let i = userIdx + 1; i < arr.length; i++) {
        if (arr[i]?.role === 'assistant' && !/^__generating__:/i.test(String(arr[i].content || ''))) asst = arr[i];
      }
      if (asst) {
        const ts = Number(asst.createdAt || asst.ts || asst.at || 0);
        if (ts && ts < ${T0} - 2000) continue;
        return {
          generating: false,
          content: String(asst.content || ''),
          provider: asst.provider_used || asst.provider,
        };
      }
    }
    return null;
  })()`);

  if (snap?.generating) {
    const s = String(snap.status || '').replace(/^__generating__:/, '');
    if (s !== lastStatus) {
      lastStatus = s;
      console.log('status:', s.slice(0, 120));
    }
    continue;
  }
  if (snap?.content && snap.content.length > 30) {
    reply = snap.content;
    console.log('\n=== REPLY ===');
    console.log((snap.provider || ''), reply.slice(0, 600));
    break;
  }
}

const appPath = path.join(DISK, 'src', 'App.jsx');
const cssPath = path.join(DISK, 'src', 'App.css');
const app = fs.existsSync(appPath) ? fs.readFileSync(appPath, 'utf8') : '';
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
const stillDemo = /data-nova-invent-demo|bag-layers|layout-luggage/i.test(app);
const hasForm = /useState|onSubmit|type=["']email["']/i.test(app);
const bagHits = (app.match(/\$\d{2,3}/g) || []).length;
const different = !/bag-layers/i.test(app) && app.length > 3500;

const probe = await evalE(`(async () => {
  const api = window.novaDesktop;
  const root = ${JSON.stringify(DISK)};
  try {
    const attach = await api.getOrAttachPreview?.(root);
    return attach || null;
  } catch (e) {
    return { err: String(e?.message || e) };
  }
})()`).catch((e) => ({ err: String(e) }));

console.log('\n=== GRADE ===');
console.log({
  appLen: app.length,
  cssLen: css.length,
  stillDemo,
  hasForm,
  priceMentions: bagHits,
  different,
  preview: probe,
  elapsedMin: ((Date.now() - T0) / 60000).toFixed(1),
});

const ok = Boolean(reply && different && hasForm && !stillDemo && bagHits >= 8);
if (ok) {
  console.log('PASS redesign — layout changed, form + bags present, invent-demo markers gone');
  process.exit(0);
}
console.log('FAIL redesign — still demo or incomplete');
process.exit(1);
