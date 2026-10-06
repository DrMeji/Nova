/**
 * Piece-by-piece Nova create/edit driver for Aurel (new premium brand).
 * Usage:
 *   node scripts/live-piecewise-aurel.mjs          # run next pending step
 *   node scripts/live-piecewise-aurel.mjs --reset  # clear progress
 *   node scripts/live-piecewise-aurel.mjs --status
 *   node scripts/live-piecewise-aurel.mjs --step 0
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.NOVA_CDP_PORT || 9231);
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const STATE = path.join(ROOT, 'scripts', '_aurel-piecewise-state.json');
const OUT = path.join(ROOT, 'scripts', '_aurel-piecewise-out.txt');
const SLUG = 'aurel';
const BRAND = 'Aurel';
const DISK = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects', 'Aurel');

const STEPS = [
  {
    id: 'shell-white',
    prompt: [
      `Build ${BRAND} on disk now — product name ${BRAND}, folder aurel.`,
      'Simple marketing color shell only: full-viewport solid #ffffff background, wordmark "Aurel" top-left in small black text.',
      'Add one useState that toggles wordmark opacity on click so handlers exist.',
      'Never ship a todo list, tip calculator, kiln app, or 3D/WebGL scene.',
      'Skip Plan card. Build the Vite React project on disk immediately.',
    ].join(' '),
  },
  {
    id: 'bg-dark',
    prompt: [
      `<!-- nova-kind: edit -->`,
      `Edit the bound ${BRAND} project on disk now.`,
      'Change only the page background to deep black #0a0a0a (html/body/.app).',
      'Make the Aurel wordmark white so it stays readable.',
      'Keep the rest of the layout. Apply the CSS change immediately.',
    ].join(' '),
  },
  {
    id: 'orbs',
    prompt: [
      `<!-- nova-kind: edit -->`,
      `Update the bound ${BRAND} project on disk now.`,
      'Keep the dark background. Add soft sage/olive glowing color orbs with CSS only (radial-gradients + subtle @keyframes drift).',
      'Add one thin diagonal accent line. No images yet. Quiet-luxury atmosphere for a high-end scent brand.',
    ].join(' '),
  },
  {
    id: 'nav-type',
    prompt: [
      `<!-- nova-kind: edit -->`,
      `Rewrite the entire src/App.tsx file on the bound ${BRAND} project now.`,
      'Use this structure (React + useState ok):',
      'nav with brand text Aurel. and three buttons Discover, Sign in, Help;',
      'hero with p.eyebrow INTRODUCING AUREL ONE, h1 Air, distilled., p Quiet scent for considered rooms., button Meet Aurel One.',
      'Update App.css: --bg #0a0a0a, --display Georgia, Times New Roman, serif on h1/.title, keep sage orbs.',
      'Remove the old title text that currently reads: one short support line, and a sage pill CTA.',
    ].join(' '),
  },
  {
    id: 'screens',
    prompt: [
      `<!-- nova-kind: edit -->`,
      `Edit the bound ${BRAND} project on disk now.`,
      'Make every nav/CTA navigate inside the app with React useState views.',
      'Views: home (current hero), welcome (short welcome message + Continue), signin (email + password fields + Sign in button),',
      'help (FAQ-style short copy + Back), discover (three feature bands: Quiet by design, Scent that listens, Built to last).',
      'Every button/link must switch a real view — no dead buttons.',
    ].join(' '),
  },
  {
    id: 'bands-footer',
    prompt: [
      `<!-- nova-kind: edit -->`,
      `Edit the bound ${BRAND} project on disk now.`,
      'On home + discover: polish the three feature bands with thin top rules and sage numbers 01 02 03.',
      'Add a refined footer with Aurel. copyright and Back to top that returns to home.',
      'Generous whitespace, serif headlines, sans body — premium editorial alignment.',
    ].join(' '),
  },
  {
    id: 'hero-image',
    prompt: [
      `<!-- nova-kind: edit -->`,
      `Edit the bound ${BRAND} project on disk now.`,
      'Generate or fetch a real on-disk hero product image for a quiet-luxury oval ambient object',
      '(matte soft-metal, cream/sage glow) into public/heroes — never a gray placeholder, never Pollinations hotlink text stubs.',
      'Wire it into a split hero: image stage left, cream copy panel right (Made for the in-between / Presence without the noise).',
      'Keep working view navigation.',
    ].join(' '),
  },
];

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  try { fs.appendFileSync(OUT, `${line}\n`); } catch { /* ignore */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch { return { next: 0, results: [] }; }
}
function saveState(s) { fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); }

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

function killNovaHard() {
  try {
    execSync('taskkill /F /IM electron.exe', { stdio: 'ignore', windowsHide: true, timeout: 15000 });
  } catch { /* ignore */ }
}

function launchNova() {
  log('LAUNCH Nova…');
  const env = { ...process.env };
  delete env.NOVA_DEV;
  spawn(ELECTRON, ['.', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*'], {
    cwd: ROOT,
    env,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  }).unref();
}

async function waitCdp(ms = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      const page = list.find((t) => t.type === 'page' && /nova|index\.html/i.test(String(t.url || '')))
        || list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* retry */ }
    await sleep(1200);
  }
  throw new Error('CDP timeout');
}

async function connect(cold = false) {
  let page;
  if (cold || process.env.NOVA_PIECEWISE_COLD === '1') {
    killNovaHard();
    await sleep(2500);
    launchNova();
    page = await waitCdp(90_000);
  } else {
    // Prefer the already-open Nova window so you can watch — avoid kill/relaunch
    // which leaves ghost CDP sockets on Windows.
    try { page = await waitCdp(25_000); }
    catch {
      log('CDP not up — soft relaunch on port', PORT);
      try {
        execSync(
          `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -match 'Nova|electron\\\\\\\\dist\\\\\\\\electron' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
          { stdio: 'ignore', windowsHide: true, timeout: 15000 },
        );
      } catch { /* ignore */ }
      await sleep(3000);
      launchNova();
      page = await waitCdp(90_000);
    }
  }
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
  const send = (method, params = {}, timeoutMs = 45000) => new Promise((resolve, reject) => {
    const i = ++id;
    const timer = setTimeout(() => {
      pending.delete(i);
      reject(new Error(`cdp-timeout ${method}`));
    }, timeoutMs);
    pending.set(i, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression, timeoutMs = 25000) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    }, timeoutMs);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  return {
    evaluate,
    screenshot: async (file) => {
      const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true }, 20000);
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    close: () => { try { ws.close(); } catch { /* ignore */ } },
  };
}

async function ensureChat(evaluate) {
  await evaluate(`(() => {
    try {
      const raw = localStorage.getItem('NOVA:local-prefs');
      const p = raw ? JSON.parse(raw) : {};
      p.multiModelCreate = true;
      p.planApproveGate = false;
      p.agentLoopOnCreate = false;
      p.defaultModelId = 'NOVA-auto';
      p.lastChatModelId = 'NOVA-auto';
      localStorage.setItem('NOVA:local-prefs', JSON.stringify(p));
    } catch {}
    return true;
  })()`);
  await evaluate(`location.hash = '#/chat?new=' + Date.now()`).catch(() => null);
  for (let i = 0; i < 40; i++) {
    const hit = await evaluate(`(() => {
      const els = [...document.querySelectorAll('button,[role=button],a')];
      const chat = els.find(el => (el.getAttribute('aria-label') || '') === 'Chat' || /^Chat$/i.test((el.textContent || '').trim()));
      if (chat) chat.click();
      const skip = els.find(el => /skip|get started|continue|enter nova/i.test((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')));
      if (skip && /onboard|welcome|setup/i.test(document.body?.innerText || '')) skip.click();
      window.dispatchEvent(new CustomEvent('NOVA:new-chat'));
      return !!document.querySelector('textarea');
    })()`).catch(() => false);
    if (hit) return;
    await sleep(800);
  }
  throw new Error('chat textarea missing');
}

/** Bind Aurel on disk so edit turns classify as edit (not chat/Plan). */
async function bindAurel(evaluate) {
  if (!fs.existsSync(DISK)) {
    log('bind skip — disk missing', DISK);
    return false;
  }
  const ok = await evaluate(`(() => {
    const diskPath = ${JSON.stringify(DISK)};
    window.dispatchEvent(new CustomEvent('NOVA:bind-studio-disk', {
      detail: { diskPath, name: ${JSON.stringify(BRAND)} },
    }));
    return true;
  })()`).catch(() => false);
  await sleep(2500);
  log('BOUND', DISK, ok ? 'ok' : 'fail');
  return Boolean(ok);
}

async function sendPrompt(evaluate, prompt) {
  // Fresh chat turn so leftover Debug/Repair UI does not steal the reply.
  await evaluate(`window.dispatchEvent(new CustomEvent('NOVA:new-chat'))`).catch(() => null);
  await sleep(800);
  await bindAurel(evaluate);
  await evaluate(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) throw new Error('no textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(ta, ${JSON.stringify(prompt)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    return true;
  })()`);
  await sleep(500);
  const sent = await evaluate(`(() => {
    const ta = document.querySelector('textarea');
    const val = ta?.value || '';
    ta?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    const send = [...document.querySelectorAll('button')].find(b =>
      /send|submit/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
    if (send) send.click();
    return { ok: val.length > 20, head: val.slice(0, 60) };
  })()`);
  log('SENT', sent);
}

async function waitIdle(evaluate, maxMs = 14 * 60_000, { requireDisk = false } = {}) {
  const t0 = Date.now();
  let last = '';
  let idleSince = 0;
  while (Date.now() - t0 < maxMs) {
    await sleep(4000);
    let snap = null;
    try {
      snap = await evaluate(`(() => {
        const gen = !!document.querySelector('[aria-label="Stop generating"],button[title*="Stop"]');
        const statusEl = document.querySelector('[data-nova-status],.agent-progress-status,[class*="AgentProgress"]');
        const status = (statusEl?.textContent || '').trim().slice(0, 120);
        const chip = [...document.querySelectorAll('button,[data-nova-seat],span')]
          .map(b => (b.textContent || '').trim())
          .find(t => /^(Plan|Design|Copy|Craft|Style|Edit|Coding|Relay)\\s*[·•]/i.test(t)) || '';
        const bubbles = [...document.querySelectorAll('[data-role="assistant"],[data-nova-role="assistant"],.nova-msg-assistant,.chat-bubble-assistant')]
          .map(el => (el.textContent || '').trim())
          .filter(t => t.length > 20 && !/^__generating__/i.test(t));
        // Fallback: last long non-user block in the chat column
        let reply = bubbles.pop() || '';
        if (!reply) {
          const all = (document.body?.innerText || '').split(/\\n+/).map(s => s.trim()).filter(Boolean);
          reply = all.filter(s => s.length > 40 && !/^Ask NOVA/i.test(s)).slice(-1)[0] || '';
        }
        const ui = document.body?.innerText || '';
        const terminal = /Created\\s+|craft preflight failed|Live verified|Dependencies installed|rebuild|Updated|Edited|Preview Ready|files on disk|Live checked|on disk at|Project ready|Done\\.|updated the layout|Refresh your browser/i.test(reply + ' ' + ui)
          && !/DBG-\\d+|Repair all|Top issue is/i.test(reply);
        const verifyFail = /left the project unchanged|Still missing:|didn'?t match what you asked|Already on the page/i.test(reply + ' ' + ui);
        const chatOnly = verifyFail || (
            /Switch to Plan|Sure,? let'?s get started|Here are the steps|Want to go into Plan mode|No local coder model|cannot run yet|No workspace yet/i.test(reply + ' ' + ui)
            && !/Created\\s+|on disk|Preview Ready|Live verified|Updated|Edited|files changed|App\\.css|App\\.tsx/i.test(reply + ' ' + ui)
          );
        return {
          gen,
          chip: chip.slice(0, 40),
          status,
          replyHead: reply.slice(0, 200).replace(/\\s+/g, ' '),
          craftFailed: /craft preflight failed|Failed at:\\s*UI polish/i.test(reply + ' ' + ui),
          liveLocked: /Live locked/i.test(ui),
          terminal,
          chatOnly,
        };
      })()`, 20000);
    } catch (e) {
      log('poll', String(e.message || e).slice(0, 80));
      continue;
    }
    const disk = diskSnap();
    const key = `${snap?.gen}|${snap?.chip}|${snap?.status}|${snap?.replyHead?.slice(0, 40)}|disk=${disk.exists}`;
    if (key !== last) {
      last = key;
      log('LIVE', snap?.chip || snap?.status || (snap?.gen ? 'Thinking…' : 'idle'), disk.exists ? 'disk=yes' : 'disk=no');
      if (snap?.replyHead) log('reply', snap.replyHead);
    }
    if (snap?.gen) {
      idleSince = 0;
      continue;
    }
    idleSince += 4000;
    // Chat-only prose with no disk work is a hard fail for create steps — don't advance.
    if (requireDisk && snap?.chatOnly && !disk.exists && idleSince >= 20000) {
      return { ...snap, craftFailed: true, chatOnly: true, diskMissing: true };
    }
    const diskOk = !requireDisk || disk.exists;
    // Require a terminal reply + ~10s idle so seat handoffs don't false-finish.
    // Never finish on idle alone when disk is required and missing.
    if (idleSince >= 10000 && diskOk && (snap?.terminal || (idleSince >= 90000 && disk.exists))) {
      return { ...snap, diskMissing: requireDisk && !disk.exists };
    }
  }
  throw new Error('step timeout');
}

function diskSnap() {
  const appPath = ['src/App.tsx', 'src/App.jsx'].map((r) => path.join(DISK, r)).find((p) => fs.existsSync(p));
  const cssPath = path.join(DISK, 'src', 'App.css');
  const app = appPath && fs.existsSync(appPath) ? fs.readFileSync(appPath, 'utf8') : '';
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  return {
    exists: fs.existsSync(DISK),
    appBytes: app.length,
    cssBytes: css.length,
    hasThree: /from\s+['"]three|THREE\.|OrbitControls/i.test(app),
    hasWhite: /#fff(?:fff)?|#ffffff|white/i.test(css + app),
    hasDark: /#0a0a0a|#000|#0c0f14|background:\s*#0/i.test(css),
    hasOrb: /radial-gradient|orb/i.test(css),
    hasNav: /<nav|Sign in|Discover|Help/i.test(app),
    hasViews: /useState|view\s*===|setView/i.test(app),
    hasHeroImg: /<img\b|\/heroes\//i.test(app),
    heroFiles: fs.existsSync(path.join(DISK, 'public', 'heroes'))
      ? fs.readdirSync(path.join(DISK, 'public', 'heroes'))
      : [],
  };
}

const args = process.argv.slice(2);
if (args.includes('--reset')) {
  try { fs.unlinkSync(STATE); } catch { /* ignore */ }
  try { fs.writeFileSync(OUT, `reset ${new Date().toISOString()}\n`); } catch { /* ignore */ }
  log('RESET state');
  process.exit(0);
}
if (args.includes('--status')) {
  const st = loadState();
  log(JSON.stringify({ state: st, disk: diskSnap(), steps: STEPS.map((s) => s.id) }, null, 2));
  process.exit(0);
}

const stepArg = args.includes('--step') ? Number(args[args.indexOf('--step') + 1]) : null;
const state = loadState();
const stepIndex = Number.isFinite(stepArg) ? stepArg : state.next;
if (stepIndex < 0 || stepIndex >= STEPS.length) {
  log('ALL STEPS DONE', state);
  process.exit(0);
}
const step = STEPS[stepIndex];
try { fs.writeFileSync(OUT, `piecewise ${new Date().toISOString()} step=${stepIndex} ${step.id}\n`); } catch { /* ignore */ }

log('STEP', stepIndex, step.id);
log('PROMPT', step.prompt.slice(0, 180) + '…');

const cold = stepIndex === 0 || process.env.NOVA_PIECEWISE_COLD === '1';
const { evaluate, screenshot, close } = await connect(cold);
log('CDP connected');
if (cold || stepIndex === 0) await ensureChat(evaluate);
else {
  const ok = await evaluate(`!!document.querySelector('textarea')`);
  if (!ok) await ensureChat(evaluate);
}
// Edit / polish steps need the folder bound or classifyTurn falls to chat/Plan.
if (stepIndex > 0) await bindAurel(evaluate);

await evaluate(`document.title = ${JSON.stringify(`NOVA · piecewise · ${BRAND} · ${step.id}`)}`);
await evaluate(`window.dispatchEvent(new CustomEvent('NOVA:sidebar-toast', { detail: {
  message: ${JSON.stringify(`Piecewise ${stepIndex + 1}/${STEPS.length}: ${step.id}`)},
  tone: 'info',
}}))`).catch(() => null);

const before = diskSnap();
log('Sending prompt…');
await sendPrompt(evaluate, step.prompt);
const requireDisk = stepIndex === 0 || step.id === 'shell-white';
const snap = await waitIdle(evaluate, 14 * 60_000, { requireDisk });
const disk = diskSnap();
const shot = path.join(ROOT, 'scripts', `_aurel-step-${stepIndex}-${step.id}.png`);
try { await screenshot(shot); log('SHOT', shot); } catch (e) { log('shot-fail', String(e.message || e).slice(0, 80)); }

const bytesChanged = disk.appBytes !== before.appBytes || disk.cssBytes !== before.cssBytes
  || disk.hasDark !== before.hasDark || disk.hasOrb !== before.hasOrb
  || disk.hasNav !== before.hasNav || disk.hasViews !== before.hasViews
  || disk.hasHeroImg !== before.hasHeroImg
  || (disk.heroFiles?.length || 0) !== (before.heroFiles?.length || 0);
const appText = (() => {
  try {
    const p = ['src/App.tsx', 'src/App.jsx'].map((r) => path.join(DISK, r)).find((x) => fs.existsSync(x));
    return p ? fs.readFileSync(p, 'utf8') : '';
  } catch { return ''; }
})();
const contentOk = (() => {
  if (step.id === 'nav-type') {
    return /INTRODUCING\s+AUREL\s+ONE/i.test(appText)
      && /Air,\s*distilled/i.test(appText)
      && /Discover/i.test(appText)
      && /Meet\s+Aurel\s+One/i.test(appText)
      && !/one short support line/i.test(appText);
  }
  if (step.id === 'screens') {
    return /setView|view\s*===/i.test(appText)
      && /signin|sign-in|Sign in/i.test(appText)
      && /welcome/i.test(appText);
  }
  if (step.id === 'bg-dark') {
    try {
      const css = fs.readFileSync(path.join(DISK, 'src', 'App.css'), 'utf8');
      return /#0a0a0a|#000(?:000)?\b/i.test(css);
    } catch { return false; }
  }
  return true;
})();
const failed = Boolean(snap?.craftFailed) || Boolean(snap?.liveLocked)
  || (requireDisk && !disk.exists)
  || Boolean(snap?.chatOnly)
  || (stepIndex > 0 && !bytesChanged)
  || !contentOk;
if (!contentOk) log('CONTENT_FAIL', step.id);
const result = {
  step: stepIndex,
  id: step.id,
  craftFailed: failed,
  liveLocked: Boolean(snap?.liveLocked),
  chatOnly: Boolean(snap?.chatOnly),
  replyHead: snap?.replyHead || '',
  disk,
  shot,
  at: new Date().toISOString(),
};
state.results.push(result);
if (!failed) state.next = stepIndex + 1;
else state.next = stepIndex; // retry same step
saveState(state);
log('RESULT', JSON.stringify(result, null, 2));
close();
if (failed) {
  log(`FAIL step ${stepIndex} ${step.id} — retry: NOVA_CDP_PORT=${PORT} node scripts/live-piecewise-aurel.mjs --step ${stepIndex}`);
  process.exit(2);
}
log(`NEXT: NOVA_CDP_PORT=${PORT} node scripts/live-piecewise-aurel.mjs   (will run step ${state.next})`);
process.exit(0);
