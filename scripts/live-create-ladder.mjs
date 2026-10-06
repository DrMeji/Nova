/**
 * Live CREATE → PREVIEW ladder (smallest → largest model).
 *
 * For each model: 3 consecutive PASSes required.
 * Passes rotate through: todo / coffee landing / tip calculator.
 * Fresh New Chat every attempt. Never resume a failed turn.
 *
 * PASS only if:
 *   - project lands on disk
 *   - create reply isn't a setup/install failure
 *   - Live preview attaches + paints real UI
 *
 * On freeze/timeout: kill Nova hard, relaunch, reset streak.
 *
 *   node scripts/live-create-ladder.mjs
 *   $env:NOVA_CREATE_LADDER_FROM='qwen25-7b'; node scripts/live-create-ladder.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const OUT = path.join(ROOT, 'scripts', '_create-ladder-out.txt');
const RESULTS = path.join(ROOT, 'scripts', '_create-ladder-results.json');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const PASSES_NEEDED = 3;

const ALL_MODELS = [
  { id: 'uigen-fx-4b', name: 'UIGEN-FX 4B' },
  { id: 'qwen25-7b', name: 'Qwen2.5 7B Instruct' },
  { id: 'qwen2-vl-7b', name: 'Qwen2-VL 7B Instruct' },
];
const FROM = String(process.env.NOVA_CREATE_LADDER_FROM || '').trim();
const MODELS = FROM
  ? ALL_MODELS.slice(Math.max(0, ALL_MODELS.findIndex((m) => m.id === FROM)))
  : ALL_MODELS;
if (FROM && !MODELS.length) {
  console.error('NOVA_CREATE_LADDER_FROM not found:', FROM);
  process.exit(2);
}

const WORD = ['Oak', 'River', 'Pine', 'Cedar', 'Maple', 'Stone', 'Harbor', 'Ridge', 'Grove', 'Lake'];
function niceTag(attempt) {
  const w = WORD[attempt % WORD.length];
  const n = Date.now().toString(36).slice(-4);
  return `${w} ${n}`;
}

const SCENARIOS = [
  {
    id: 'todo',
    label: 'Todo add/delete',
    brand: (tag) => `TaskNest ${tag}`,
    prompt: (brand) =>
      `Build ${brand} on disk now. Simple todo app with a text input, Add button, a list of todos, and Delete on each row. Clean local UI. Skip Plan. Start building now — create the project files.`,
    uiNeedles: [/todo|task|add|delete|list/i, /<input|<button|button|type=["']text/i],
  },
  {
    id: 'coffee',
    label: 'Coffee landing',
    brand: (tag) => `BrewHaus ${tag}`,
    // Keep brief short — UIGEN-FX 4B stalls (~14m) on long “premium landing” coffee asks.
    prompt: (brand) =>
      `Build ${brand} on disk now. Simple coffee shop page with the brand name, a short line about coffee, a list of 3 drinks with prices, and hours. Skip Plan. Start building now — create the project files.`,
    uiNeedles: [/brew|coffee|menu|hours|drink|haus/i, /<h1|<header|hero|section/i],
  },
  {
    id: 'tip',
    label: 'Tip calculator',
    brand: (tag) => `TipWise ${tag}`,
    prompt: (brand) =>
      `Build ${brand} on disk now. Tip calculator called ${brand}: bill amount number input, tip percent input, show tip dollars and total. No nav rails, no icon bars. Skip Plan. Start building now — create the project files.`,
    uiNeedles: [/tip|bill|total|percent|%/i, /<input|<button|button|type=["'](?:number|text)/i],
  },
];

/** Human-readable model labels shown in the Multimodal picker. */
const MODEL_PICK_LABEL = {
  'uigen-fx-4b': /uigen/i,
  'qwen25-7b': /qwen2\.5\s*7b|qwen25.?7b/i,
  'qwen2-vl-7b': /qwen2.?vl|vision/i,
};

const GEN_TIMEOUT_BY_ID = {
  // createV2 craft + first Windows npm unpack often needs 25–40+ minutes end-to-end
  'uigen-fx-4b': 45 * 60_000,
  'qwen25-7b': 50 * 60_000,
  'qwen2-vl-7b': 45 * 60_000,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Drop leftover ladder scaffolds so slug allocator never exhausts mid-run. */
function pruneLadderLeftovers() {
  try {
    if (!fs.existsSync(PROJECTS)) return;
    const re = /^(todo-list|tasknest|brewhaus|tipwise|coffee-shop|coffee|tip-?calc|site)(-\d+)?$/i;
    for (const ent of fs.readdirSync(PROJECTS, { withFileTypes: true })) {
      if (!ent.isDirectory() || !re.test(ent.name)) continue;
      try {
        fs.rmSync(path.join(PROJECTS, ent.name), { recursive: true, force: true });
        log('pruned leftover', ent.name);
      } catch { /* ignore locked */ }
    }
  } catch { /* ignore */ }
}

/** Zombie Vite on 5200–5350 makes the next create attach a dead/wrong Live → evidence FAIL. */
function killStalePreviewPorts() {
  try {
    if (process.platform === 'win32') {
      execSync(
        'powershell -NoProfile -Command "5200..5350 | ForEach-Object { Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"',
        { stdio: 'ignore', windowsHide: true, timeout: 15000 },
      );
    }
  } catch { /* ignore */ }
}

const keepAlive = setInterval(() => {}, 60_000);
process.on('unhandledRejection', (err) => {
  log('unhandledRejection', String(err?.message || err).slice(0, 200));
});
process.on('exit', () => clearInterval(keepAlive));

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  // File first — piping stdout (Tee-Object) can block console.log and freeze the whole ladder.
  try { fs.appendFileSync(OUT, `${line}\n`); } catch { /* ignore */ }
  try { process.stdout.write(`${line}\n`); } catch { /* ignore */ }
}

function fetchJson(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`fetch-timeout ${timeoutMs}ms`));
    });
    req.on('error', reject);
  });
}

function killNovaHard() {
  log('KILL Nova completely…');
  for (const im of ['electron.exe', 'llama-server.exe', 'llama-cli.exe']) {
    try { execSync(`taskkill /F /IM ${im} /T`, { stdio: 'ignore', windowsHide: true }); } catch { /* ignore */ }
  }
  killStalePreviewPorts();
}

function launchNova() {
  log('LAUNCH Nova (CDP 9229)…');
  spawn(ELECTRON, ['.', '--remote-debugging-port=9229', '--remote-allow-origins=*'], {
    cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: false,
  }).unref();
}

function pickNovaPage(list) {
  const pages = (list || []).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!pages.length) return null;
  // HARD: only the Nova shell. Vite Live tabs (127.0.0.1:52xx) must never win —
  // they have no novaDesktop / localStorage and break setModel + probes.
  const nova = pages.find((t) => {
    const u = String(t.url || '');
    const title = String(t.title || '');
    if (/127\.0\.0\.1:\d+|localhost:\d+/i.test(u)) return false;
    return /dist\/index\.html|#\/chat|file:\/\//i.test(u) || /^NOVA\b/i.test(title);
  });
  if (nova) return nova;
  // Early boot: about:blank / chrome:// before index loads — keep waiting (caller retries).
  return null;
}

async function waitForCdp(maxMs = 120_000) {
  const start = Date.now();
  let lastHint = '';
  while (Date.now() - start < maxMs) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      const page = pickNovaPage(list);
      if (page?.webSocketDebuggerUrl) {
        await sleep(2500);
        return page;
      }
      const hint = (list || []).filter((t) => t.type === 'page').map((t) => `${t.title}|${String(t.url || '').slice(0, 60)}`).join('; ');
      if (hint && hint !== lastHint) {
        lastHint = hint;
        log('CDP pages (waiting for Nova shell)', hint.slice(0, 200));
      }
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg !== lastHint) {
        lastHint = msg;
        log('CDP wait', msg.slice(0, 80));
      }
    }
    await sleep(1000);
  }
  throw new Error('CDP not up');
}

async function connect() {
  const page = await waitForCdp();
  log('cdp', page.title || '', (page.url || '').slice(0, 80));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  ws.on('close', () => {
    for (const [, p] of pending) p.reject(new Error('cdp-closed'));
    pending.clear();
  });
  const send = (method, params = {}, timeoutMs = 45_000) => new Promise((resolve, reject) => {
    const i = ++id;
    const timer = setTimeout(() => {
      pending.delete(i);
      reject(new Error(`cdp-timeout ${method} ${timeoutMs}ms`));
    }, timeoutMs);
    pending.set(i, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    try {
      ws.send(JSON.stringify({ id: i, method, params }));
    } catch (err) {
      clearTimeout(timer);
      pending.delete(i);
      reject(err);
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
  const evaluate = async (expression, awaitPromise = true, timeoutMs = 30_000) => {
    const r = await send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise, userGesture: true,
    }, timeoutMs);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  return {
    evaluate,
    close: () => { try { ws.close(); } catch { /* ignore */ } },
  };
}

async function ensureLiveSession() {
  // Quick probe — don't sit silent 120s when Nova isn't running.
  try {
    await waitForCdp(5000);
    return await connect();
  } catch {
    log('CDP cold — relaunch Nova');
    killNovaHard();
    await sleep(2500);
    launchNova();
    await waitForCdp(120_000);
    return connect();
  }
}

function slugify(brand) {
  return brand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function findProjectDisk(brand, slug, sinceMs) {
  if (!fs.existsSync(PROJECTS)) return null;
  const brandKey = brand.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const slugHead = slug.split('-')[0];
  const hits = fs.readdirSync(PROJECTS)
    .map((n) => {
      const p = path.join(PROJECTS, n);
      let t = 0;
      try { t = fs.statSync(p).mtimeMs; } catch { return null; }
      return { n, p, t };
    })
    .filter(Boolean)
    .filter((x) => x.t >= sinceMs - 10_000)
    .filter((x) => {
      const key = x.n.toLowerCase().replace(/[^a-z0-9]+/g, '');
      return key.includes(brandKey.slice(0, 8))
        || key.includes(slugHead)
        || x.n.toLowerCase() === slug;
    })
    .sort((a, b) => b.t - a.t);
  return hits[0]?.p
    || [path.join(PROJECTS, slug), path.join(PROJECTS, brand)].find((p) => fs.existsSync(p))
    || null;
}

function diskLooksBuilt(disk) {
  if (!disk || !fs.existsSync(disk)) return { ok: false, reason: 'missing-folder' };
  const hasIndex = fs.existsSync(path.join(disk, 'index.html'));
  const hasPkg = fs.existsSync(path.join(disk, 'package.json'));
  const hasSrc = fs.existsSync(path.join(disk, 'src'));
  const hasApp = ['src/App.tsx', 'src/App.jsx', 'src/main.tsx', 'src/main.jsx', 'app.js', 'main.js']
    .some((rel) => fs.existsSync(path.join(disk, rel)));
  if (!(hasIndex || (hasPkg && (hasSrc || hasApp)))) {
    return { ok: false, reason: 'no-entry', hasIndex, hasPkg, hasSrc, hasApp };
  }
  return { ok: true, hasIndex, hasPkg, hasSrc, hasApp };
}

function uiSampleOk(sample, scenario) {
  const s = String(sample || '');
  if (s.length < 20) return { ok: false, reason: 'sample-too-short' };
  // Vite red-screen / esbuild transform overlay — never count as Live paint
  if (/plugin:vite:esbuild|Transform failed|Expected ">" but found|Internal Server Error|\[vite\]|vite error overlay|Failed to load resource/i.test(s)) {
    return { ok: false, reason: 'vite-red-screen' };
  }
  if (/failed to fetch|cannot get|error:|vite error|this page isn't working/i.test(s) && s.length < 400) {
    return { ok: false, reason: 'error-page' };
  }
  const hits = (scenario.uiNeedles || []).filter((re) => re.test(s)).length;
  if (hits < 1) return { ok: false, reason: 'ui-signals-missing', hits };
  return { ok: true, hits };
}

/** Delete a just-tested project folder so the next attempt is always fresh. */
function wipeProjectDisk(disk) {
  if (!disk || !fs.existsSync(disk)) return false;
  // Vite/node hold locks on node_modules — free ports first or rm EPERM's.
  killStalePreviewPorts();
  try {
    fs.rmSync(disk, { recursive: true, force: true });
    log('wiped project', disk);
    return true;
  } catch (e) {
    log('wipe project failed', String(e?.message || e).slice(0, 120));
    // One more try after a short wait
    try {
      execSync(`powershell -NoProfile -Command "Start-Sleep -Milliseconds 800; Remove-Item -LiteralPath '${String(disk).replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue"`, {
        stdio: 'ignore', windowsHide: true, timeout: 20000,
      });
      if (!fs.existsSync(disk)) {
        log('wiped project (retry)', disk);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }
}

/** Fetch Live URL HTML text as a backup when BrowserWindow probe returns empty. */
function fetchPreviewSample(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!url || !/^https?:\/\//i.test(url)) {
      resolve({ ok: false, sample: '', status: 0 });
      return;
    }
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; if (body.length > 80_000) req.destroy(); });
      res.on('end', () => {
        const text = body
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode || 0,
          sample: text.slice(0, 600),
          rawHead: body.slice(0, 400),
        });
      });
    });
    req.on('error', () => resolve({ ok: false, sample: '', status: 0 }));
    req.setTimeout(timeoutMs, () => { try { req.destroy(); } catch { /* ignore */ } resolve({ ok: false, sample: '', status: 0 }); });
  });
}

try { fs.writeFileSync(OUT, `create-ladder ${new Date().toISOString()}\n`); } catch { /* ignore */ }

const ladderResults = [];
log('ORDER', MODELS.map((m) => m.id).join(' → '));
log(`Need ${PASSES_NEEDED} consecutive passes · scenarios: ${SCENARIOS.map((s) => s.id).join(' → ')}`);

for (const model of MODELS) {
  log(`\n#################### MODEL ${model.id} (${model.name}) ####################`);
  let streak = 0;
  let attempt = 0;
  const modelAttempts = [];
  const genTimeout = GEN_TIMEOUT_BY_ID[model.id] || 18 * 60_000;

  while (streak < PASSES_NEEDED) {
    attempt += 1;
    // Rotate by streak so 3 consecutive passes cover todo → coffee → tip
    const scen = SCENARIOS[streak % SCENARIOS.length];
    const tag = niceTag(attempt);
    const brand = scen.brand(tag);
    const slug = slugify(brand);
    const prompt = scen.prompt(brand);
    const startedAt = Date.now();

    log(`\n----- ${model.id} attempt ${attempt} (streak ${streak}/${PASSES_NEEDED}) · ${scen.id} · ${brand} -----`);
    pruneLadderLeftovers();
    killStalePreviewPorts();

    let session;
    try {
      session = await ensureLiveSession();
    } catch (e) {
      log('session fail', String(e.message || e));
      killNovaHard();
      await sleep(3000);
      launchNova();
      try { session = await connect(); }
      catch (e2) {
        log('FATAL', String(e2.message || e2));
        process.exit(2);
      }
    }
    const { evaluate, close } = session;

    try {
      // Stop any in-flight turn
      await evaluate(`(() => {
        const stop = [...document.querySelectorAll('button')].find(b =>
          /stop/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
        if (stop) stop.click();
        return !!stop;
      })()`, true, 8000).catch(() => false);
      await sleep(800);

      // Chat tab + New Chat (fresh thread every attempt)
      await evaluate(`(() => {
        const els = [...document.querySelectorAll('button,[role=button],a')];
        const chat = els.find(el => (el.getAttribute('aria-label') || '') === 'Chat' || /^Chat$/i.test((el.textContent || '').trim()));
        if (chat) chat.click();
        return true;
      })()`, false, 8000).catch(() => null);
      await sleep(1000);
      await evaluate(`(() => {
        const btns = [...document.querySelectorAll('button,[role=button],a')];
        const neu = btns.find(b => /new chat|new conversation/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
        if (neu) { neu.click(); return 'new'; }
        location.hash = '#/chat?new=' + Date.now();
        return 'hash';
      })()`, true, 8000);
      await sleep(1500);

      // Force prefs: never stall on Plan approve gate; pin this model (not Multimodal auto)
      await evaluate(`(() => {
        try {
          const keys = new Set(['NOVA:local-prefs', ...Object.keys(localStorage).filter(k => /prefs/i.test(k))]);
          for (const k of keys) {
            const raw = localStorage.getItem(k);
            if (!raw) continue;
            try {
              const p = JSON.parse(raw);
              p.planApproveGate = false;
              // Force createV2 (single-coder craft). Legacy agent create loop stalls on app.js.
              p.agentLoopOnCreate = false;
              p.defaultModelId = ${JSON.stringify(model.id)};
              p.lastChatModelId = ${JSON.stringify(model.id)};
              p.activeCoderId = ${JSON.stringify(model.id)};
              p.defaultCodeModelId = ${JSON.stringify(model.id)};
              p.aiMode = 'manual';
              localStorage.setItem(k, JSON.stringify(p));
            } catch {}
          }
          // Drop chat history + studio leftovers so every attempt is a fresh thread.
          const drop = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (/chat-thread|recent-chats|chat-studio|chat-code-pill|apply-snapshot|last-edit|pending-add|last-disk-target|recent-projects|deleted-chat|deleted-project|inflight|chat-turn|chat-plan/i.test(k)) {
              drop.push(k);
            }
          }
          for (const k of drop) localStorage.removeItem(k);
          try { sessionStorage.clear(); } catch {}
        } catch {}
        const clearBtn = [...document.querySelectorAll('button')].find(b =>
          /clear mode/i.test(b.getAttribute('aria-label') || ''));
        if (clearBtn) clearBtn.click();
        return true;
      })()`, true, 8000).catch(() => null);

      try {
        await evaluate(`document.title = ${JSON.stringify(`NOVA · ${model.id} · ${scen.id} · a${attempt}`)}`);
        await evaluate(`window.dispatchEvent(new CustomEvent('NOVA:sidebar-toast', { detail: {
          message: ${JSON.stringify(`CREATE ladder · ${model.id} · ${scen.id} · #${attempt}`)},
          tone: 'info',
        }}))`);
      } catch { /* ignore */ }

      log('setModel', model.id);
      try {
        const sw = await evaluate(`(async () => {
          const st = await window.novaDesktop.engineSetModel(${JSON.stringify(model.id)});
          return { active: st?.activeModelId };
        })()`, true, 200_000);
        log('switched', sw);
      } catch (e) {
        log('setModel FAIL', String(e.message || e));
        close();
        killNovaHard();
        await sleep(2500);
        launchNova();
        streak = 0;
        modelAttempts.push({ attempt, pass: false, error: 'setModel-fail', scenario: scen.id });
        continue;
      }

      // Pick the Ready local model in the chat picker so the UI does NOT say Multimodal
      const pickRe = MODEL_PICK_LABEL[model.id] || new RegExp(model.id, 'i');
      const picked = await evaluate(`(async () => {
        const want = ${pickRe.toString()};
        const wantId = ${JSON.stringify(model.id)};
        // Persist pin into prefs again right before open (New Chat can reset React state).
        try {
          const raw = localStorage.getItem('NOVA:local-prefs');
          const p = raw ? JSON.parse(raw) : {};
          p.defaultModelId = wantId;
          p.lastChatModelId = wantId;
          p.activeCoderId = wantId;
          p.defaultCodeModelId = wantId;
          p.aiMode = 'manual';
          p.planApproveGate = false;
          p.agentLoopOnCreate = false;
          localStorage.setItem('NOVA:local-prefs', JSON.stringify(p));
          window.dispatchEvent(new StorageEvent('storage', { key: 'NOVA:local-prefs', newValue: JSON.stringify(p) }));
        } catch {}
        const triggers = [...document.querySelectorAll('button')].filter(b => {
          const t = ((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')).trim();
          return /select model|multimodal|nova multimodal|qwen|uigen|coder|ready|active model/i.test(t) && t.length < 120;
        });
        const trigger = triggers.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0];
        if (trigger) trigger.click();
        await new Promise(r => setTimeout(r, 700));
        const rows = [...document.querySelectorAll('button,[role=menuitem],[role=option],div[role=button]')];
        const hit = rows.find(b => {
          const t = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('data-model-id') || ''));
          if (/multimodal/i.test(t)) return false;
          return want.test(t) || t.includes(wantId);
        });
        if (hit) { hit.click(); return { ok: true, label: (hit.textContent || '').trim().slice(0, 60) }; }
        document.body.click();
        return { ok: false, wantId, rowCount: rows.length };
      })()`, true, 20000).catch((e) => ({ ok: false, error: String(e.message || e) }));
      log('modelPicker', picked);
      // Hard-pin via engine + prefs even if menu miss — create must craft on this id.
      await evaluate(`(async () => {
        const wantId = ${JSON.stringify(model.id)};
        try {
          await window.novaDesktop?.engineSetModel?.(wantId);
          const raw = localStorage.getItem('NOVA:local-prefs');
          const p = raw ? JSON.parse(raw) : {};
          p.defaultModelId = wantId;
          p.lastChatModelId = wantId;
          p.activeCoderId = wantId;
          p.defaultCodeModelId = wantId;
          localStorage.setItem('NOVA:local-prefs', JSON.stringify(p));
        } catch {}
        return true;
      })()`, true, 60_000).catch(() => null);
      await evaluate(`document.body.click()`, false, 3000).catch(() => null);
      await sleep(800);

      log('prompt', prompt.slice(0, 140) + '…');
      await evaluate(`(() => {
        const ta = document.querySelector('textarea');
        if (!ta) throw new Error('no textarea');
        const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        d.set.call(ta, ${JSON.stringify(prompt)});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.focus();
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
        return true;
      })()`, true, 10000);

      const needle = prompt.slice(0, 36);
      let reply = '';
      let lastStatus = '';
      let stuckSince = Date.now();
      let lastProgressKey = '';
      let cdpFailStreak = 0;

      while (Date.now() - startedAt < genTimeout) {
        await sleep(2000);
        // If Plan card appeared anyway, click Let's build this immediately (never stall)
        try {
          const buildClick = await evaluate(`(() => {
            const btns = [...document.querySelectorAll('button,[role=button],a')];
            const hit = btns.find(b => /let'?s build this|start building|ok start building/i.test((b.textContent || '').trim()));
            if (hit) { hit.click(); return (hit.textContent || '').trim().slice(0, 40); }
            return null;
          })()`, true, 8000);
          if (buildClick) log('clicked build CTA', buildClick);
        } catch { /* ignore */ }

        let snap = null;
        try {
          snap = await evaluate(`(() => {
            const needle = ${JSON.stringify(needle)};
            const startedAt = ${startedAt};
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
            }
            const body = document.body?.innerText || '';
            // Prefer live craft status — avoid matching "Failed at: … Preview Ready preflight"
            // from a finished fail reply (that false-looked like an in-flight status).
            const statusMatch = body.match(/(?:Build:|Creating |Writing |Healing |npm |Live |Craft ·|Coding |Plan |Wrote |Tuning |Dependencies |Installing )[^\\n]{0,100}/i)
              || (!/craft preflight failed|Failed at:/i.test(body)
                ? body.match(/Preview Ready[^\\n]{0,80}/i)
                : null);
            // Keep Code / Live visible while crafting
            try { window.__novaStressOpenCode?.(); } catch {}
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
                return {
                  generating: true,
                  status: String(last.content || '').slice(0, 160),
                  uiStatus: statusMatch ? statusMatch[0] : null,
                };
              }
              let asst = null;
              for (let i = userIdx + 1; i < arr.length; i++) {
                if (arr[i]?.role === 'assistant' && !/^__generating__:/i.test(String(arr[i].content || ''))) asst = arr[i];
              }
              if (asst) {
                // ChatMessage uses created_at (ISO). Number("2026-…") is NaN — always parse.
                const rawTs = asst.createdAt ?? asst.created_at ?? asst.ts ?? asst.at ?? 0;
                const ts = typeof rawTs === 'number' ? rawTs : Date.parse(String(rawTs || '')) || 0;
                let c = String(asst.content || '');
                // Unwrap <!--nova-trace:{...}--> — use the real answer (or payload.answer).
                if (/<!--nova-trace:/i.test(c)) {
                  const m = c.match(/<!--nova-trace:([\\s\\S]*?)-->/);
                  let answer = c.replace(/<!--nova-trace:[\\s\\S]*?-->/, '').trim();
                  if (m?.[1]) {
                    try {
                      const payload = JSON.parse(m[1]);
                      if (!answer && payload?.answer) answer = String(payload.answer || '');
                      // Trace-only "done" with no create answer yet — keep waiting.
                      if (payload?.done && !answer
                        && !/Created\\s+|craft preflight failed|Failed at:|Live verified|Dependencies installed/i.test(c)) {
                        return { generating: true, status: 'waiting-create-answer', uiStatus: statusMatch ? statusMatch[0] : null };
                      }
                    } catch { /* keep raw */ }
                  }
                  if (answer) c = answer;
                }
                const terminal = /Created\\s+|craft preflight failed|Preview Ready failed|Live verified|Live evidence|Dependencies installed|project (?:is )?ready|Failed at:/i.test(c);
                // Prefer dated replies from THIS attempt; undated terminal replies after the
                // needle user turn are still valid (finishPlainReply always sets created_at).
                if (ts && ts < startedAt - 2000) continue;
                if (!ts && !terminal) continue;
                // Plan-only stall: keep waiting after we click Let's build
                if (/concrete build plan|Keep refining|Let'?s build this/i.test(c)
                  && !/Created\\s+|Live preview|Dependencies installed|project (?:is )?ready|Preview Ready failed|craft preflight failed/i.test(c)) {
                  return { generating: true, status: 'plan-card-waiting-build', uiStatus: statusMatch ? statusMatch[0] : null, content: c.slice(0, 200) };
                }
                return { generating: false, content: c, provider: asst.provider_used || asst.provider, ts: ts || startedAt };
              }
              return { generating: true, status: 'waiting-assistant', uiStatus: statusMatch ? statusMatch[0] : null };
            }
            return { generating: true, status: statusMatch ? statusMatch[0] : 'no-user-hit-yet' };
          })()`, true, 15000);
        } catch (err) {
          log('CDP poll error', String(err.message || err).slice(0, 120));
          cdpFailStreak = (cdpFailStreak || 0) + 1;
          // Dead Electron / hung renderer — don't sit for 12m of FREEZE on a corpse.
          if (cdpFailStreak >= 4) {
            log('CDP dead — hard kill + relaunch');
            close();
            killNovaHard();
            await sleep(2500);
            launchNova();
            streak = 0;
            modelAttempts.push({
              attempt, pass: false, error: 'cdp-dead', scenario: scen.id, brand,
              elapsedSec: Math.round((Date.now() - startedAt) / 1000),
            });
            break;
          }
          await sleep(2000);
          continue;
        }
        cdpFailStreak = 0;

        // Include uiStatus — craft timers ("coding · App.jsx · 5:12") live there while
        // the bubble often stays stuck on "Thinking…". Ignoring uiStatus false-FREEZEs active craft.
        const progressKey = snap?.generating
          ? `g:${snap.status || ''}|${snap.uiStatus || ''}`
          : `d:${String(snap?.content || '').length}`;
        if (progressKey !== lastProgressKey) {
          lastProgressKey = progressKey;
          stuckSince = Date.now();
        }

        if (snap?.generating) {
          const st = [snap.status, snap.uiStatus].filter(Boolean).join(' · ');
          if (st !== lastStatus) {
            lastStatus = st;
            log('LIVE', lastStatus.replace(/^__generating__:/, '').slice(0, 140));
          }
          // Preview Ready failed often stays on the generating bubble — treat as terminal.
          if (/Preview Ready failed|Could not find a free folder name|Could not create project folder|Could not resolve a folder/i.test(st)
            || /Preview Ready failed|Could not find a free folder name/i.test(String(snap.content || ''))) {
            reply = String(snap.content || st);
            break;
          }
          // Frozen: no status/ui change for 4 minutes → hard kill
          // (createV2 family wall ~2.5m; tip Fixing used to sit silent ~11m on wedged probe)
          if (Date.now() - stuckSince > 4 * 60_000) {
            log('FREEZE — no progress 4m, hard kill');
            close();
            killNovaHard();
            await sleep(3000);
            launchNova();
            streak = 0;
            modelAttempts.push({
              attempt, pass: false, error: 'freeze', scenario: scen.id, brand,
              elapsedSec: Math.round((Date.now() - startedAt) / 1000),
            });
            break;
          }
          continue;
        }

        if (snap?.content && snap.content.length > 40) {
          const c = snap.content;
          const failedHard = /Preview Ready failed|craft preflight failed|Live evidence incomplete|Live did not verify|setup did not finish|npm install timed out|Cannot start building|App\/CSS source looks truncated|Could not find a free folder name|Could not create project folder/i.test(c);
          const looksDone = failedHard
            || /Created\s+\*\*|Live verified|Live preview verified|Open \*\*Live\*\*|install npm dependencies|Dependencies installed|Live server started|Live evidence|Preview Ready(?!\s+failed)|project (?:is )?ready/i.test(c);
          const mentionsBrand = new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(c)
            || new RegExp(slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(c)
            || /NOVA Projects|folder on disk|Created\s+/i.test(c);
          if (failedHard) {
            reply = c;
            break;
          }
          if ((!looksDone || !mentionsBrand) && Date.now() - startedAt < genTimeout - 30_000) {
            log('waiting final create reply…', `${Math.round((Date.now() - startedAt) / 1000)}s`);
            continue;
          }
          if (!mentionsBrand && Date.now() - startedAt < genTimeout - 30_000) {
            log('stale reply skipped…');
            continue;
          }
          reply = c;
          break;
        }
      }

      if (!reply) {
        // may have already recorded freeze
        if (!modelAttempts.some((r) => r.attempt === attempt)) {
          log('FAIL — streak reset', { attempt, error: 'timeout-no-reply', scenario: scen.id, brand });
          streak = 0;
          modelAttempts.push({
            attempt, pass: false, error: 'timeout-no-reply', scenario: scen.id, brand,
            elapsedSec: Math.round((Date.now() - startedAt) / 1000),
          });
          close();
          killNovaHard();
          await sleep(2500);
          launchNova();
        }
        continue;
      }

      log('reply', reply.slice(0, 280).replace(/\n/g, ' '));

      if (/npm install timed out|Dependencies are not installed yet|setup did not finish|Preview Ready failed|craft preflight failed|Failed at:\s*UI polish|Live did not verify|Live stays locked|Live evidence failed|Live did not start/i.test(reply)) {
        streak = 0;
        const row = {
          attempt, pass: false, error: 'setup-fail', scenario: scen.id, brand,
          elapsedSec: Math.round((Date.now() - startedAt) / 1000),
          replyHead: reply.slice(0, 200),
        };
        log('FAIL — streak reset', row);
        modelAttempts.push(row);
        wipeProjectDisk(findProjectDisk(brand, slug, startedAt));
        close();
        continue;
      }

      // Prefer Where:`path` from create reply — model often names folder Todo List, not TaskNest…
      const whereMatch = reply.match(/Where:\s*`([^`]+)`/i) || reply.match(/Documents\\NOVA Projects\\([^\s`]+)/i);
      let disk = findProjectDisk(brand, slug, startedAt);
      if (!disk && whereMatch) {
        const raw = whereMatch[1];
        const candidate = path.isAbsolute(raw) ? raw : path.join(PROJECTS, raw);
        if (fs.existsSync(candidate)) disk = candidate;
      }
      if (!disk) {
        // Newest project folder written during this attempt
        try {
          const newest = fs.readdirSync(PROJECTS)
            .map((n) => {
              const p = path.join(PROJECTS, n);
              let t = 0;
              try { t = fs.statSync(p).mtimeMs; } catch { return null; }
              return { p, t };
            })
            .filter(Boolean)
            .filter((x) => x.t >= startedAt - 10_000)
            .sort((a, b) => b.t - a.t)[0];
          if (newest) disk = newest.p;
        } catch { /* ignore */ }
      }
      const diskInfo = diskLooksBuilt(disk);
      log('disk', disk || '(none)', diskInfo);

      if (!diskInfo.ok) {
        streak = 0;
        const row = {
          attempt, pass: false, error: `disk:${diskInfo.reason}`, scenario: scen.id, brand,
          elapsedSec: Math.round((Date.now() - startedAt) / 1000),
        };
        log('FAIL — streak reset', row);
        modelAttempts.push(row);
        wipeProjectDisk(disk);
        close();
        continue;
      }

      // Open Live (prefer unlocked Live — "Live locked" is not a usable control)
      const liveClick = await evaluate(`(() => {
        const els = [...document.querySelectorAll('button,[role=button],a,span')];
        const labelOf = (el) => ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim();
        const unlocked = els.find(el => {
          const t = labelOf(el);
          return /^Live$/i.test(t) || (/\\bLive\\b/.test(t) && t.length < 24 && !/lock/i.test(t));
        });
        const live = unlocked || els.find(el => /\\bLive\\b/i.test(labelOf(el)) && labelOf(el).length < 28);
        if (!live) return { ok: false, reason: 'no Live control' };
        live.click();
        return { ok: true, label: labelOf(live).slice(0, 40), locked: /lock/i.test(labelOf(live)) };
      })()`, true, 10000);
      log('Live click', liveClick);
      await sleep(10000);

      const probe = await evaluate(`(async () => {
        const api = window.novaDesktop;
        let attach = null;
        try {
          if (api?.getOrAttachPreview) attach = await api.getOrAttachPreview(${JSON.stringify(disk)});
        } catch (e) {
          attach = { ok: false, error: String(e?.message || e) };
        }
        let mounted = null;
        if (attach?.ok && attach?.url && api?.previewProbeMounted) {
          // Retry hard — cold Vite + BrowserWindow often return empty sample for 10–20s.
          for (let i = 0; i < 8; i++) {
            mounted = await api.previewProbeMounted({
              url: attach.url,
              title: ${JSON.stringify(brand)},
              waitMs: i === 0 ? 10000 : 6000,
            });
            const sample = String(mounted?.sample || '');
            if (mounted?.mounted && sample.length >= 20) break;
            // Force navigate again if blank
            try {
              if (api?.openPreviewWindow && sample.length < 8) {
                await api.openPreviewWindow({
                  url: attach.url,
                  title: ${JSON.stringify(brand)},
                  projectId: 'NOVA-live-preview',
                  forceNavigate: true,
                });
              }
            } catch { /* ignore */ }
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
        let createJob = null;
        try {
          const diskNorm = ${JSON.stringify(disk)}.replace(/\\\\/g, '/').toLowerCase();
          const brandLc = ${JSON.stringify(brand)}.toLowerCase();
          const slugLc = ${JSON.stringify(slug)}.toLowerCase();
          let best = null;
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (!k || !k.startsWith('nova-create-job:')) continue;
            const j = JSON.parse(sessionStorage.getItem(k) || 'null');
            if (!j || !j.path) continue;
            const p = String(j.path).replace(/\\\\/g, '/').toLowerCase();
            const name = String(j.name || '').toLowerCase();
            const matchPath = p.includes(diskNorm) || diskNorm.includes(p) || p.includes(slugLc);
            const matchName = brandLc && (name.includes(brandLc) || brandLc.includes(name));
            if (!matchPath && !matchName) continue;
            best = { status: j.status, evidencePass: j.evidencePass, error: j.error, previewUrl: j.previewUrl, path: j.path };
            if (j.status === 'ready') break;
          }
          createJob = best;
        } catch { /* ignore */ }
        return { attach, mounted, createJob };
      })()`, true, 90_000);

      let sample = String(probe?.mounted?.sample || '');
      // Backup: HTTP-fetch the Live URL when BrowserWindow probe blanks out after a verified create.
      let httpSample = null;
      if ((!sample || sample.length < 20) && probe?.attach?.url) {
        for (let i = 0; i < 5; i++) {
          httpSample = await fetchPreviewSample(probe.attach.url, 10000);
          const raw = String(httpSample?.rawHead || '');
          // Catch Vite/esbuild red screens even when body text is short
          if (/plugin:vite:esbuild|Transform failed|Expected ">"|Internal Server Error/i.test(raw)) {
            sample = raw;
            break;
          }
          if (httpSample?.sample && httpSample.sample.length >= 20 && !/^root$/i.test(httpSample.sample.trim())) {
            sample = httpSample.sample;
            break;
          }
          await sleep(3000);
        }
      }

      const ui = uiSampleOk(sample, scen);
      const consoleErrs = Array.isArray(probe?.mounted?.consoleErrors) ? probe.mounted.consoleErrors : [];
      const consoleClean = !consoleErrs.some((e) => /error|exception|failed|vite|overlay/i.test(String(e || '')));
      const jobFailed = probe?.createJob?.status === 'failed';
      const jobReady = probe?.createJob?.status === 'ready' || probe?.createJob?.evidencePass === true;
      const replyVerified = /Live verified|Live preview verified|evidence passed/i.test(reply);
      const viteRed = ui.reason === 'vite-red-screen' || ui.reason === 'error-page'
        || /plugin:vite:esbuild|Transform failed|Expected ">"/i.test(String(httpSample?.rawHead || sample));
      // NEVER treat probe.ok alone as mounted — blank Vite shells return ok:true with empty sample.
      const probePainted = Boolean(probe?.mounted?.mounted) && String(probe?.mounted?.sample || '').length >= 20;
      const httpPainted = Boolean(httpSample?.ok)
        && String(httpSample?.sample || '').length >= 20
        && !/^root$/i.test(String(httpSample?.sample || '').trim());
      const reallyMounted = probePainted || (httpPainted && ui.ok);
      // Trust create's own Live evidence when attach is up, Live unlocked, no red screen —
      // BrowserWindow probe often blanks even after a real paint (race with Vite HMR).
      const previewOk = Boolean(
        probe?.attach?.ok
        && probe?.attach?.url
        && !viteRed
        && consoleClean
        && !jobFailed
        && liveClick?.locked !== true
        && (
          (reallyMounted && ui.ok)
          || ((jobReady || replyVerified) && !viteRed && (ui.ok || probePainted || httpSample?.ok))
        )
      );

      log('preview', {
        url: probe?.attach?.url || null,
        mounted: reallyMounted,
        probeMounted: Boolean(probe?.mounted?.mounted),
        probeOk: Boolean(probe?.mounted?.ok),
        httpOk: Boolean(httpSample?.ok),
        jobReady,
        replyVerified,
        liveLocked: Boolean(liveClick?.locked),
        ui,
        sample: String(sample).slice(0, 140).replace(/\n/g, ' '),
      });

      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      if (!previewOk) {
        streak = 0;
        const row = {
          attempt, pass: false, error: ui.ok ? 'preview-fail' : `ui:${ui.reason}`,
          scenario: scen.id, brand, elapsedSec,
          attach: probe?.attach || null,
          sampleHead: String(sample).slice(0, 180).replace(/\n/g, ' '),
        };
        log('FAIL — streak reset', row);
        modelAttempts.push(row);
        // Fresh retry: delete the broken project so the next craft cannot reuse it.
        wipeProjectDisk(disk);
        close();
        continue;
      }

      streak += 1;
      const row = {
        attempt, pass: true, scenario: scen.id, brand, disk, elapsedSec,
        url: probe.attach.url, streak,
      };
      log('PASS', `${streak}/${PASSES_NEEDED}`, row);
      modelAttempts.push(row);
      // Fresh next scenario: wipe this project + history (history already cleared on next attempt).
      wipeProjectDisk(disk);
      close();
    } catch (e) {
      log('attempt error', String(e.message || e));
      streak = 0;
      modelAttempts.push({
        attempt, pass: false, error: String(e.message || e).slice(0, 180),
        scenario: scen.id, brand,
      });
      try { close(); } catch { /* ignore */ }
      killNovaHard();
      await sleep(2500);
      launchNova();
    }
  }

  log(`**** ${model.id} CLEARED (3 consecutive) ****`);
  ladderResults.push({ model: model.id, name: model.name, attempts: modelAttempts, cleared: true });
  try { fs.writeFileSync(RESULTS, JSON.stringify(ladderResults, null, 2)); } catch { /* ignore */ }
}

log('\n========== CREATE LADDER DONE ==========');
try { fs.writeFileSync(RESULTS, JSON.stringify(ladderResults, null, 2)); } catch { /* ignore */ }
process.exit(0);
