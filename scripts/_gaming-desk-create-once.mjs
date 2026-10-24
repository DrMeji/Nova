/**
 * Fresh gaming-desk site create → disk + Live (no Velvet reuse).
 *   $env:NOVA_CDP_PORT='9333'; node scripts/_gaming-desk-create-once.mjs
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
const BRAND = process.env.NOVA_CREATE_BRAND || `ForgeRail ${RUN}`;
const SLUG = BRAND.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const TEST_STARTED_AT = Date.now();

const prompt = [
  `Create a new website project called ${BRAND} on disk now.`,
  'Brand-new project — do not edit any open folder. Do not reopen Velvet Hour, DeskForge, RaidDesk, CarbonForge, PulseDesk, or any prior project.',
  'Product landing page for a premium gaming desk brand (not SaaS, not dashboard, not auth shell).',
  'Near-black canvas, electric cyan accent, subtle under-glow atmosphere.',
  `Hero: brand name "${BRAND}" large, line “Precision height. Zero cable drama.”, button “Shop the desk”.`,
  'Three feature ideas (rephrase freely — invent unique layout AND copy): Cable Chaos Solved, RGB Edge Glow, Height Memory.',
  'Footer with free shipping note and an email field for drop alerts.',
  'Invent a unique composition — do not reuse a prior desk template (no identical hero+3 cards+email twin).',
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
await send('Page.reload', { ignoreCache: true });
await sleep(5000);

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

await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const clear = els.find((el) => /clear folder|unbind|close project|leave folder/i.test(
    ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim(),
  ));
  if (clear) { clear.click(); return 'cleared'; }
  return 'none';
})()`);
await sleep(500);

await evalE(`(async () => {
  try {
    const eng = await import('/src/lib/novaEngine.ts');
    if (eng.engineGenerateCancel) await eng.engineGenerateCancel({});
  } catch {}
  return true;
})()`).catch(() => {});

console.log('=== GAMING DESK CREATE → LIVE ===');
console.log('Brand:', BRAND);
console.log('Prompt:', prompt);

const sent = await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) return { ok: false, reason: 'no textarea' };
  const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  d.set.call(ta, ${JSON.stringify(prompt)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
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
let controlsLogged = false;
while (Date.now() - t0 < 720_000) {
  await sleep(3000);
  let liveLabel = '';
  try {
    liveLabel = await evalE(`(async () => {
      try {
        const m = await import('/src/lib/chatTurnStatusStore.ts');
        return String(m.getChatTurnStatus()?.label || '').slice(0, 120);
      } catch { return ''; }
    })()`);
  } catch { /* ignore */ }

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

  if (snap?.generating) {
    if (!controlsLogged) {
      try {
        const ctl = await evalE(`(() => {
          const glass = document.querySelector('[data-ark-composer="1"]');
          const stop = document.querySelector('[aria-label="Stop generating"]');
          const pctBtn = [...(glass?.querySelectorAll('button') || [])].find((b) => /\\d+%/.test((b.textContent || '').trim()));
          const model = glass?.querySelector('[data-nova-model-seat]');
          return {
            stop: Boolean(stop),
            stopInsideGlass: Boolean(glass && stop && glass.contains(stop)),
            outerRail: Boolean(document.querySelector('[data-nova-composer-rail="1"]')),
            controls: Boolean(document.querySelector('[data-nova-composer-controls="1"]')),
            usagePct: (pctBtn?.textContent || '').trim(),
            modelIconOnly: Boolean(model) && !/Building\\s·|Qwen/i.test(model?.textContent || ''),
            working: Boolean(document.querySelector('[aria-label^="Working "]')),
          };
        })()`);
        console.log('\ncomposer controls:', ctl);
        controlsLogged = true;
      } catch { /* ignore */ }
    }
    const shown = liveLabel || (snap.status || '').replace(/^__generating__:/, '');
    process.stdout.write(`\rstatus: ${String(shown).slice(0, 100)}   `);
    continue;
  }

  if (snap?.content && snap.content.length > 40) {
    const c = snap.content;
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
    const looksDone = /Created\s+\*\*|create miss|Craft stalled|craft preflight failed|was not marked Ready|time limit was reached|Live preview verified|Open \*\*Live\*\*|Dependencies installed|Live server started|Here you go|scaffolded|project is ready|Live is open/i.test(spoken);
    const mentionsBrand = c.includes(BRAND) || /DeskForge/i.test(c) || c.toLowerCase().includes(SLUG.slice(0, 8));
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
if (!reply) throw new Error('create timed out (>10m)');

const diskCandidates = fs.existsSync(PROJECTS)
  ? fs.readdirSync(PROJECTS)
    .map((n) => ({ n, p: path.join(PROJECTS, n), t: fs.statSync(path.join(PROJECTS, n)).mtimeMs }))
    .filter((x) => x.t >= TEST_STARTED_AT - 10_000)
    .filter((x) => /pulse|carbon|forge|raid|desk|gaming|rail/i.test(x.n) || x.n.toLowerCase().includes(SLUG.split('-')[0]))
    .filter((x) => !/velvet|deskforge$|raiddesk$|carbonforge$/i.test(x.n) || /forge|rail|pulse/i.test(x.n))
    .sort((a, b) => b.t - a.t)
  : [];
const disk = diskCandidates[0]?.p
  || [path.join(PROJECTS, SLUG), path.join(PROJECTS, BRAND), path.join(PROJECTS, BRAND.replace(/\s+[a-z0-9]{3,5}$/i, ''))]
    .find((p) => fs.existsSync(p) && fs.statSync(p).mtimeMs >= TEST_STARTED_AT - 10_000);
console.log('disk:', disk || '(missing)');
if (disk) {
  const appPath = ['src/App.jsx', 'src/App.tsx'].map((r) => path.join(disk, r)).find((p) => fs.existsSync(p));
  const app = appPath ? fs.readFileSync(appPath, 'utf8') : '';
  const logo = fs.existsSync(path.join(disk, 'public', 'logo.svg'))
    ? fs.readFileSync(path.join(disk, 'public', 'logo.svg'), 'utf8')
    : '';
  const brandBase = BRAND.replace(/\s+[a-z0-9]{3,5}$/i, '').trim();
  console.log(
    'hasPkg=', fs.existsSync(path.join(disk, 'package.json')),
    'hasApp=', Boolean(appPath),
    'hasBrand=', new RegExp(brandBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(app),
    'hasShopCta=', /Shop the desk|Shop now|Buy/i.test(app),
    'isSaasShell=', /Billing|Dashboard|Sign in/i.test(app) && !/Shop the desk/i.test(app),
    'isVelvetLeak=', /Velvet Hour|Reserve a seat|Vinyl Hour/i.test(app),
    'isProductShell=', /app product|className="app product"/i.test(app),
    'isCannedTwin=', /Channels and grommets keep every run clean|you@raid\.mail|className="app product"|className="app vibe"/i.test(app),
    'isTodoFloor=', /nova-todos|New todo|todo-form/i.test(app),
    'isFrozenTwin=', (/you@desk\.mail/i.test(app) && /Drop alerts/i.test(app))
      || (/Tray routes keep power bricks off the floor\s*\(/i.test(app) && /Edge light stays dim enough for focus\s*\(/i.test(app))
      || (/className=["'][^"']*\bapp\s+desk-[a-f0-9]{4,8}\b/i.test(app)
        && !/desk-(?:split-stage|band-stack|center-rail|spec-strip)-/i.test(app)),
    'hasSaltBlurb=', /\([a-f0-9]{5,8}\)\./i.test(app),
    'logoMusicNote=', /M9 18V5l12-2v13/i.test(logo),
    'logoSparkles=', /M9\.937 15\.5/i.test(logo),
  );
  if (appPath) console.log('app head:\n', app.slice(0, 700));
}

const craftMiss = /craft preflight failed|create miss|Product ladder miss|Live stays locked/i.test(reply);
if (!craftMiss) {
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
    const probe = await Promise.race([
      evalE(`(async () => {
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
      })()`),
      sleep(20_000).then(() => ({ ok: false, error: 'preview probe timeout' })),
    ]);
    console.log('preview:', JSON.stringify(probe, null, 2));
  }
} else {
  console.log('preview: skipped (craft miss / Live locked)');
}

console.log('elapsed_s=', Math.round((Date.now() - t0) / 1000));
process.exit(0);
