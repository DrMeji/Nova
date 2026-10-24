/**
 * One-shot vibe site create → disk + Live.
 *   $env:NOVA_CDP_PORT='9333'; node scripts/_vibe-create-once.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9333);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keepAlive = setInterval(() => {}, 60_000);
process.on('exit', () => clearInterval(keepAlive));

const RUN = Date.now().toString(36).slice(-4);
const BRAND = process.env.NOVA_CREATE_BRAND || `Velvet Hour ${RUN}`;
const SLUG = BRAND.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const TEST_STARTED_AT = Date.now();

const prompt = [
  `Create a new website project called ${BRAND} on disk now.`,
  'Brand-new project — do not edit any open folder.',
  'Late-dusk cocktail lounge / listening room vibe page (not SaaS, not dashboard, not auth shell).',
  'Deep plum-black canvas, warm amber accent, soft atmosphere.',
  `Full-bleed hero: brand name "${BRAND}" large, line “Stay for the last song.”, button “Reserve a seat”.`,
  'Tonight strip with three cards: Vinyl Hour, Low Lights, Quiet Corner — title + one line each.',
  'Footer with hours Tue–Sun 6pm–2am and an email field.',
  'Skip Plan — scaffold Vite React on disk and finish the page.',
].join(' ');

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

// Wipe prior wrong velvet shells so we can trust a fresh folder.
for (const name of fs.existsSync(PROJECTS) ? fs.readdirSync(PROJECTS) : []) {
  if (/^velvet[- ]?hour/i.test(name)) {
    try {
      fs.rmSync(path.join(PROJECTS, name), { recursive: true, force: true });
      console.log('cleanup', name);
    } catch (e) {
      console.log('cleanup skip', name, String(e.message || e).slice(0, 80));
    }
  }
}

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const page = list.find((t) => t.type === 'page');
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

// Pick up Vite HMR for create stall / heal timeouts before this create.
await send('Page.reload', { ignoreCache: true });
await sleep(5000);

// Clear stuck __generating__ assistants so they don't steal status polls.
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
        changed = true;
        n += 1;
        return { ...m, content: 'Stopped hung generation.' };
      }
      return m;
    });
    if (changed) localStorage.setItem(k, JSON.stringify(arr));
  }
  return n;
})()`);

await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const hits = els.filter((el) => (el.getAttribute('aria-label') || '') === 'Chat');
  hits.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
  if (hits[0]) hits[0].click();
  return true;
})()`);
await sleep(800);
await evalE(`(() => {
  const btns = [...document.querySelectorAll('button,[role=button]')];
  const neu = btns.find((b) => /new chat|new conversation/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
  if (neu) { neu.click(); return 'new'; }
  return 'skip';
})()`);
await sleep(1500);

// Drop bound workspace if a clear-folder control exists.
await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const clear = els.find((el) => /clear folder|unbind|close project|leave folder/i.test(
    ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim(),
  ));
  if (clear) { clear.click(); return 'cleared'; }
  return 'none';
})()`);
await sleep(500);

console.log('=== VIBE CREATE → LIVE ===');
console.log('Brand:', BRAND);
console.log('Prompt:', prompt);

// Cancel any leftover hung generate from a prior turn.
await evalE(`(async () => {
  try {
    const eng = await import('/src/lib/novaEngine.ts');
    if (eng.engineGenerateCancel) await eng.engineGenerateCancel({});
  } catch {}
  return true;
})()`).catch(() => {});

const sent = await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) return { ok: false, reason: 'no textarea' };
  const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  d.set.call(ta, ${JSON.stringify(prompt)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  // Prefer explicit Send button — Enter can hit the wrong handler mid-reload.
  const btns = [...document.querySelectorAll('button,[role=button]')];
  const sendBtn = btns.find((b) => {
    const a = ((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')).trim();
    return /^send$/i.test(a) || /send message/i.test(a);
  });
  if (sendBtn) {
    sendBtn.click();
    return { ok: true, via: 'button', value: ta.value.slice(0, 60) };
  }
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  return { ok: true, via: 'enter', value: ta.value.slice(0, 60) };
})()`);
console.log('send:', sent);
if (!sent?.ok) throw new Error(sent?.reason || 'send failed');

const needle = `called ${BRAND}`;
const t0 = Date.now();
let reply = '';
// Ladder-lite + create should finish well under 10m; fail the harness at 10m.
while (Date.now() - t0 < 600_000) {
  await sleep(3000);
  let snap = null;
  try {
    snap = await evalE(`(() => {
      const needle = ${JSON.stringify(needle)};
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
          if (arr[j]?.role === 'user' && (c.includes(needle) || c.includes(brand))) { userIdx = j; break; }
        }
        if (userIdx < 0) continue;
        const last = arr[arr.length - 1];
        if (last?.role === 'assistant' && /^__generating__:/i.test(String(last.content || ''))) {
          return { generating: true, status: String(last.content || '').slice(0, 160) };
        }
        for (let j = arr.length - 1; j > userIdx; j--) {
          if (arr[j]?.role === 'assistant' && !/^__generating__:/i.test(String(arr[j].content || ''))) {
            const ts = Number(arr[j].createdAt || arr[j].ts || arr[j].at || 0);
            if (ts && ts < ${TEST_STARTED_AT} - 5000) continue;
            const row = { generating: false, content: String(arr[j].content || ''), provider: arr[j].provider_used || arr[j].provider };
            if (!best || row.content.length > best.content.length) best = row;
          }
        }
      }
      return best;
    })()`);
  } catch (err) {
    console.log('\nCDP eval error:', String(err.message || err).slice(0, 120));
    await sleep(2000);
    continue;
  }
  // Live craft labels live in the status store — message content stays Thinking until finish.
  let liveLabel = '';
  try {
    liveLabel = await evalE(`(() => {
      try {
        const s = window.__NOVA_CHAT_TURN_STATUS__ || null;
        if (s && typeof s === 'object' && s.label) return String(s.label).slice(0, 120);
      } catch {}
      return '';
    })()`);
  } catch { /* ignore */ }
  if (!liveLabel) {
    try {
      liveLabel = await evalE(`(async () => {
        try {
          const m = await import('/src/lib/chatTurnStatusStore.ts');
          return String(m.getChatTurnStatus()?.label || '').slice(0, 120);
        } catch { return ''; }
      })()`);
    } catch { /* ignore */ }
  }
  if (snap?.generating) {
    const shown = liveLabel || (snap.status || '').replace(/^__generating__:/, '');
    // Composer rail: Stop + timer/usage must stay visible while Building.
    if (!globalThis.__novaControlsChecked) {
      try {
        const ctl = await evalE(`(() => {
          const stop = document.querySelector('[aria-label="Stop generating"]');
          const rail = document.querySelector('[data-nova-composer-rail="1"]');
          const working = document.querySelector('[aria-label^="Working "]');
          return {
            stop: Boolean(stop),
            rail: Boolean(rail),
            working: Boolean(working),
          };
        })()`);
        console.log('\ncomposer controls:', ctl);
        globalThis.__novaControlsChecked = true;
        if (!ctl?.stop && !ctl?.rail) {
          console.warn('WARN: Stop/timer rail missing while generating');
        }
      } catch { /* ignore */ }
    }
    process.stdout.write(`\rstatus: ${String(shown).slice(0, 100)}   `);
    continue;
  }
  if (snap?.content && snap.content.length > 40) {
    const c = snap.content;
    // Match spoken answer / create outcomes only — not thought labels inside nova-trace.
    const spoken = (() => {
      const m = c.match(/<!--nova-trace:([\s\S]*?)-->/);
      if (m?.[1]) {
        try {
          const ans = String(JSON.parse(m[1])?.answer || '').trim();
          if (ans) return ans;
        } catch { /* fall through */ }
      }
      return c;
    })();
    const looksDone = /Created\s+\*\*|create miss|Craft stalled|craft preflight failed|was not marked Ready|time limit was reached|setup did not finish|Live preview verified|Open \*\*Live\*\*|Dependencies installed|Live server started|Here you go|scaffolded|project is ready/i.test(spoken);
    const mentionsBrand = c.includes(BRAND) || /Velvet\s*Hour/i.test(c) || c.toLowerCase().includes(SLUG.slice(0, 10));
    const stallMiss = /create miss|Craft stalled|craft preflight failed|time limit was reached/i.test(spoken);
    if ((!looksDone || (!mentionsBrand && !stallMiss)) && Date.now() - t0 < 540_000) {
      process.stdout.write(`\rwaiting final… ${Math.round((Date.now() - t0) / 1000)}s · ${(liveLabel || '').slice(0, 40)}   `);
      continue;
    }
    reply = c;
    console.log('\nmeta:', snap.provider || '');
    console.log(reply.slice(0, 1000));
    break;
  }
  process.stdout.write(`\rwaiting user+reply… ${Math.round((Date.now() - t0) / 1000)}s   `);
}
if (!reply) throw new Error('create timed out');

const diskCandidates = fs.existsSync(PROJECTS)
  ? fs.readdirSync(PROJECTS)
    .map((n) => ({ n, p: path.join(PROJECTS, n), t: fs.statSync(path.join(PROJECTS, n)).mtimeMs }))
    .filter((x) => x.t >= TEST_STARTED_AT - 10_000)
    .filter((x) => /velvet|hour/i.test(x.n) || x.n.toLowerCase().includes(SLUG.split('-')[0]))
    .sort((a, b) => b.t - a.t)
  : [];
const disk = diskCandidates[0]?.p
  || [path.join(PROJECTS, SLUG), path.join(PROJECTS, BRAND)].find((p) => fs.existsSync(p));
console.log('disk:', disk || '(missing)');
if (disk) {
  const appPath = ['src/App.jsx', 'src/App.tsx'].map((r) => path.join(disk, r)).find((p) => fs.existsSync(p));
  const app = appPath ? fs.readFileSync(appPath, 'utf8') : '';
  console.log('hasPkg=', fs.existsSync(path.join(disk, 'package.json')),
    'hasApp=', Boolean(appPath),
    'hasVelvet=', /Velvet|Reserve a seat|Vinyl Hour|Stay for the last song/i.test(app),
    'isSaasShell=', /Billing|Dashboard|Sign in/i.test(app) && !/Reserve a seat/i.test(app));
  if (appPath) console.log('app head:\n', app.slice(0, 500));
}

await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a,span')];
  const live = els.find((el) => {
    const t = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim();
    return /^Live$/i.test(t) || (/\\bLive\\b/.test(t) && t.length < 20);
  });
  if (live) live.click();
  return Boolean(live);
})()`);
await sleep(4000);

if (disk) {
  const probe = await evalE(`(async () => {
    const api = window.novaDesktop;
    let attach = null;
    try {
      if (api?.getOrAttachPreview) attach = await api.getOrAttachPreview(${JSON.stringify(disk)});
    } catch (e) {
      attach = { ok: false, error: String(e?.message || e) };
    }
    let mounted = null;
    if (attach?.ok && attach?.url && api?.previewProbeMounted) {
      mounted = await api.previewProbeMounted({ url: attach.url, title: ${JSON.stringify(BRAND)}, waitMs: 4000 });
    }
    return { attach, mounted };
  })()`);
  console.log('preview:', JSON.stringify(probe, null, 2));
}

process.exit(0);
