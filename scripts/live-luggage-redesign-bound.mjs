/**
 * Force-bind Ridgeline Carry xnws + Nova agent redesign (same brand, new layout).
 *   $env:NOVA_CDP_PORT='9340'; node scripts/live-luggage-redesign-bound.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9340);
const DISK = process.env.NOVA_LUGGAGE_DISK
  || path.join(os.homedir(), 'Documents', 'NOVA Projects', 'ridgeline-carry-xnws');
const BRAND = 'Ridgeline Carry xnws';
const TIMEOUT_MS = Number(process.env.NOVA_CREATE_TIMEOUT_MS || 25 * 60_000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();

if (!fs.existsSync(DISK)) {
  console.error('missing', DISK);
  process.exit(2);
}

const list = await new Promise((res, rej) => {
  http.get(`http://127.0.0.1:${PORT}/json/list`, (r) => {
    let b = '';
    r.on('data', (c) => (b += c));
    r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej);
});
const page = list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || ''))
  || list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(JSON.stringify(m.error)));
    else resolve(m.result);
  }
});
const send = (method, params = {}, timeoutMs = 25_000) => new Promise((resolve, reject) => {
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
const evalE = async (expression, timeoutMs = 20_000, awaitPromise = false) => {
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

console.log('=== LUGGAGE REDESIGN (bound) ===');
console.log('Brand:', BRAND);
console.log('Disk:', DISK);

// Clear hung generating markers
await evalE(`(() => {
  let n = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !/NOVA:chat-thread:chat:/.test(k)) continue;
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
    let changed = false;
    arr = arr.map((m) => {
      if (m?.role === 'assistant' && /^__generating__:/i.test(String(m.content || ''))) {
        changed = true; n += 1;
        return { ...m, content: 'Stopped hung generation.' };
      }
      return m;
    });
    if (changed) localStorage.setItem(k, JSON.stringify(arr));
  }
  return n;
})()`);

await send('Page.reload', { ignoreCache: true });
await sleep(3500);
await send('Runtime.enable');

await evalE(`(() => {
  const raw = localStorage.getItem('NOVA:local-prefs');
  const prefs = raw ? JSON.parse(raw) : {};
  prefs.agentLoopOnEdit = true;
  prefs.agentLoopOnCreate = true;
  prefs.agentLoopEnabled = true;
  prefs.planApproveGate = false;
  localStorage.setItem('NOVA:local-prefs', JSON.stringify(prefs));
  localStorage.setItem('NOVA:last-disk-target', JSON.stringify({
    path: ${JSON.stringify(DISK)},
    name: ${JSON.stringify(BRAND)},
    kind: 'folder',
  }));
  return true;
})()`);

await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const hits = els.filter((el) => (el.getAttribute('aria-label') || '') === 'Chat');
  hits.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
  if (hits[0]) hits[0].click();
  return true;
})()`);
await sleep(500);
await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const hit = els.find((el) => /new chat|new conversation/i.test((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')));
  if (hit) hit.click();
  return Boolean(hit);
})()`);
await sleep(1200);

console.log('bind workspace…');
const bind = await evalE(`(async () => {
  const api = window.novaDesktop;
  const root = ${JSON.stringify(DISK)};
  const brand = ${JSON.stringify(BRAND)};
  const out = { root };
  try {
    if (api?.workspaceSetGrants) {
      out.grants = await Promise.race([
        api.workspaceSetGrants({ paths: [root], allowDocumentsFolderAccess: true }),
        new Promise((r) => setTimeout(() => r({ timedOut: true }), 5000)),
      ]);
    }
  } catch (e) { out.grantErr = String(e?.message || e); }
  try {
    if (api?.workspaceOpenRoot) {
      out.open = await Promise.race([
        api.workspaceOpenRoot({
          projectId: 'proj-luggage-' + Date.now().toString(36),
          projectName: brand,
          sourceDir: root,
          catalogOnly: false,
        }),
        new Promise((r) => setTimeout(() => r({ timedOut: true }), 45000)),
      ]);
    }
  } catch (e) { out.openErr = String(e?.message || e); }
  out.fileCount = out.open?.files ? Object.keys(out.open.files).length : 0;
  // Wire React studio state (load App from disk into the chat studio).
  try {
    window.dispatchEvent(new CustomEvent('NOVA:open-code-overlay', {
      detail: {
        diskPath: root,
        name: brand,
        projectId: out.open?.projectId || ('proj-luggage-' + Date.now().toString(36)),
        openOverlay: false,
      },
    }));
    out.studioEvent = true;
  } catch (e) { out.studioErr = String(e?.message || e); }
  return out;
})()`, 60_000, true);
console.log('bind', JSON.stringify({
  ok: bind?.open?.ok,
  listed: bind?.open?.listed,
  fileCount: bind?.fileCount,
  studioEvent: bind?.studioEvent,
  openErr: bind?.openErr,
}, null, 2));
await sleep(2000);
// Re-dispatch + wait until studio disk root sticks (new-chat can race the first event).
for (let i = 0; i < 8; i++) {
  await evalE(`(() => {
    window.dispatchEvent(new CustomEvent('NOVA:open-code-overlay', {
      detail: {
        diskPath: ${JSON.stringify(DISK)},
        name: ${JSON.stringify(BRAND)},
        openOverlay: false,
      },
    }));
    return true;
  })()`);
  await sleep(600);
  const rooted = await evalE(`(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /NOVA:studio/.test(k)) keys.push(k);
    }
    for (const k of keys) {
      try {
        const o = JSON.parse(localStorage.getItem(k) || '{}');
        if (String(o.diskRoot || o.root || '').includes('ridgeline-carry-xnws')) return k;
      } catch { /* ignore */ }
    }
    const chip = [...document.querySelectorAll('button,[role=button]')]
      .some((b) => /ridgeline|bound folder/i.test((b.getAttribute('aria-label') || '') + (b.textContent || '')));
    return chip ? 'chip' : '';
  })()`);
  if (rooted) {
    console.log('studio rooted:', rooted);
    break;
  }
}
await sleep(800);

const folderChip = await evalE(`(() => {
  const t = [...document.querySelectorAll('button,[role=button]')]
    .map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim())
    .find((x) => /ridgeline|bound folder/i.test(x));
  return (t || '').slice(0, 100);
})()`);
console.log('folder chip:', folderChip || '(none)');

const promptReal = [
  // nova-kind:edit — must NOT use nova-agent-mode (that path skips edit salvage).
  '<!--nova-kind:edit-->',
  `Edit the bound **${BRAND}** project on disk (path already bound — skip any folder picker).`,
  'Same brand name only — keep working in this folder (not a fresh project).',
  'Full rewrite src/App.jsx + src/App.css: completely NEW layout, NEW background colors, NEW typography, NEW composition.',
  'Travel luggage brand — suitcases/carry-ons/duffels. Never microphones.',
  'Keep: brand in hero, exactly 12 unique bags with prices, /logo.svg nav, and a name+email inquiry section with React state.',
  'Remove data-nova-invent-demo, bag-layers, layout-luggage, harness copy.',
  'Quality→premium. Skip Plan. Write App.jsx and App.css now, then refresh Live.',
].join('\n');

console.log('submit…');
await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) throw new Error('no textarea');
  const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  d.set.call(ta, ${JSON.stringify(promptReal)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  return true;
})()`);
console.log('submitted — watch Nova');

const needle = 'Full rewrite src/App.jsx';
const appPath = path.join(DISK, 'src', 'App.jsx');
const beforeMtime = fs.statSync(appPath).mtimeMs;
let last = '';

while (Date.now() - T0 < TIMEOUT_MS) {
  await sleep(5000);
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
      const lastMsg = arr[arr.length - 1];
      if (lastMsg?.role === 'assistant' && /^__generating__:/i.test(String(lastMsg.content || ''))) {
        return {
          generating: true,
          status: String(lastMsg.content || '').slice(0, 160),
          stop: !!document.querySelector('[data-nova-stop], [aria-label="Stop generating"]'),
        };
      }
      let asst = null;
      for (let i = userIdx + 1; i < arr.length; i++) {
        if (arr[i]?.role === 'assistant' && !/^__generating__:/i.test(String(arr[i].content || ''))) asst = arr[i];
      }
      if (asst) return { generating: false, content: String(asst.content || '').slice(0, 500) };
    }
    return null;
  })()`);

  if (snap?.generating) {
    const s = String(snap.status || '').replace(/^__generating__:/, '');
    if (s !== last) {
      last = s;
      console.log('status:', s.slice(0, 120), '| stop=', snap.stop);
    }
  } else if (snap?.content) {
    console.log('\\n=== REPLY ===\\n', snap.content);
    break;
  }

  // Early win: App.jsx rewritten on disk
  try {
    const st = fs.statSync(appPath);
    if (st.mtimeMs > beforeMtime + 500) {
      const app = fs.readFileSync(appPath, 'utf8');
      if (!/bag-layers|data-nova-invent-demo/i.test(app) && app.length > 4000) {
        console.log('disk App rewritten while turn running — continuing until reply…');
      }
    }
  } catch { /* ignore */ }
}

const app = fs.readFileSync(appPath, 'utf8');
const css = fs.readFileSync(path.join(DISK, 'src', 'App.css'), 'utf8');
const stillDemo = /data-nova-invent-demo|bag-layers/i.test(app);
const prices = (app.match(/\$\d{2,3}/g) || []).length;
const changed = fs.statSync(appPath).mtimeMs > beforeMtime;
console.log('\\n=== GRADE ===', {
  changed,
  appLen: app.length,
  cssLen: css.length,
  stillDemo,
  prices,
  elapsedMin: ((Date.now() - T0) / 60000).toFixed(1),
});
const ok = changed && !stillDemo && prices >= 8 && app.length > 4000;
console.log(ok ? 'PASS redesign' : 'FAIL redesign');
ws.close();
process.exit(ok ? 0 : 1);
