/**
 * Live create with create-relay (Plan → Design → Copy → Craft).
 * Opens Nova so you can watch; does not write project files from this script.
 *
 *   node scripts/live-relay-premium.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const OUT = path.join(ROOT, 'scripts', '_relay-premium-out.txt');

const RUN = (process.env.NOVA_RELAY_RUN || Date.now().toString(36).slice(-4)).replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'x';
const BRAND = `Vireo Vac ${RUN}`;
const SLUG = `vireo-vac-${RUN}`;
const PROMPT = [
  `Build ${BRAND} on disk now — a premium product homepage for a professional home vacuum company.`,
  `Quiet-luxury editorial quality: full-bleed hero with brand dominant, soft color orbs/spheres and accent lines in CSS, scroll-reveal bands, refined CTAs, three feature sections (suction, quiet motor, design), specs strip, footer.`,
  `Full-width desktop layout at 1920 — never a skinny phone column. Original brand voice for ${BRAND}.`,
  `Do not ship a tip app, todo list, or Apple product-grid clone. No flat black void with only text.`,
  `Skip Plan card. Build the Vite React project on disk immediately. Create relay must run Plan → Design → Copy → Craft with different Ready brains when available.`,
].join(' ');

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  try { fs.appendFileSync(OUT, `${line}\n`); } catch { /* ignore */ }
}

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

function killNovaHard() {
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'electron' -and $_.CommandLine -match 'Nova|electron\\\\dist\\\\electron' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'ignore', windowsHide: true, timeout: 15000 },
    );
  } catch { /* ignore */ }
}

function launchNova() {
  log('LAUNCH Nova (watch this window)…');
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

async function connect() {
  const page = await waitCdp();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
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
  const send = (method, params = {}, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const i = ++id;
    const timer = setTimeout(() => {
      pending.delete(i);
      reject(new Error(`cdp-timeout ${method} ${timeoutMs}ms`));
    }, timeoutMs);
    pending.set(i, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression, awaitPromise = true, timeoutMs = 20000) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
      userGesture: true,
    }, timeoutMs);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  return {
    evaluate,
    close: () => { try { ws.close(); } catch { /* ignore */ } },
  };
}

try { fs.writeFileSync(OUT, `relay-premium ${new Date().toISOString()}\n`); } catch { /* ignore */ }

log('Brand', BRAND);
log('Prompt', PROMPT.slice(0, 160) + '…');

// Always cold-start so this script never reuses an old dist build.
killNovaHard();
await sleep(2000);
launchNova();
await waitCdp(90_000);

const { evaluate, close } = await connect();
log('CDP connected — Nova is up. Watch the window + model chip (Plan → Design → Copy → Craft).');

await evaluate(`(() => {
  try {
    const raw = localStorage.getItem('NOVA:local-prefs');
    const p = raw ? JSON.parse(raw) : {};
    p.multiModelCreate = true;
    p.prefsVersion = Math.max(7, Number(p.prefsVersion) || 0);
    p.agentLoopOnCreate = false;
    p.planApproveGate = false;
    // Multimodal Auto so relay seat labels show on the composer chip.
    p.defaultModelId = 'NOVA-auto';
    p.lastChatModelId = 'NOVA-auto';
    p.activeChatId = 'NOVA-auto';
    // Prefer design seat on UIGEN when installed; craft on best coder/instruct.
    p.activeDesignId = 'uigen-fx-4b';
    localStorage.setItem('NOVA:local-prefs', JSON.stringify(p));
  } catch {}
  return true;
})()`);

await evaluate(`location.hash = '#/chat?new=' + Date.now()`).catch(() => null);
let ready = false;
for (let i = 0; i < 40; i++) {
  const hit = await evaluate(`(() => {
    const els = [...document.querySelectorAll('button,[role=button],a')];
    const chat = els.find(el => (el.getAttribute('aria-label') || '') === 'Chat' || /^Chat$/i.test((el.textContent || '').trim()));
    if (chat) chat.click();
    const skip = els.find(el => /skip|get started|continue|enter nova|start/i.test((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')));
    if (skip && /onboard|welcome|setup/i.test(document.body?.innerText || '')) skip.click();
    window.dispatchEvent(new CustomEvent('NOVA:new-chat'));
    const ta = document.querySelector('textarea');
    return { ta: !!ta, title: document.title || '' };
  })()`).catch(() => ({ ta: false }));
  if (hit?.ta) { ready = true; break; }
  await sleep(1000);
}
if (!ready) throw new Error('chat textarea never appeared — finish onboarding in the Nova window, then re-run');

await evaluate(`document.title = ${JSON.stringify(`NOVA · relay · ${BRAND}`)}`);
await evaluate(`window.dispatchEvent(new CustomEvent('NOVA:sidebar-toast', { detail: {
  message: ${JSON.stringify(`Relay create · ${BRAND} — watch Plan → Design → Copy → Craft on the model chip`)},
  tone: 'info',
}}))`).catch(() => null);

log('Sending create ask…');
await evaluate(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) throw new Error('no textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(ta, ${JSON.stringify(PROMPT)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  return true;
})()`);
await sleep(400);
await evaluate(`(() => {
  const ta = document.querySelector('textarea');
  ta?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  const send = [...document.querySelectorAll('button')].find(b =>
    /send|submit/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
  if (send) send.click();
  return true;
})()`);

log('Create started — watch model chip for Plan → Design → Copy → Craft');
const t0 = Date.now();
let last = '';
const seatsSeen = new Set();
while (Date.now() - t0 < 22 * 60_000) {
  await sleep(5000);
  let snap = null;
  try {
    snap = await evaluate(`(() => {
      const chip = [...document.querySelectorAll('button')]
        .map(b => (b.textContent || '').trim())
        .find(t => /^(Plan|Design|Copy|Craft|Style|Relay)\\s·/i.test(t)) || '';
      const statusEl = document.querySelector('[data-nova-status],.agent-progress-status,[class*="AgentProgress"]');
      const status = (statusEl?.textContent || '').trim().slice(0, 140)
        || (document.body?.innerText?.match(
          /(?:Relay ·|Plan ·|Design ·|Copy ·|Craft ·|coding ·|Installing|Preview|Live verified|Deepening|Scaffold|Writing)[^\\n]{0,100}/i
        )?.[0] || '');
      const gen = !!document.querySelector('[aria-label="Stop generating"],button[title*="Stop"]');
      const reply = [...document.querySelectorAll('[data-role="assistant"],.nova-chat-msg,[class*="assistant"]')]
        .map(el => (el.textContent || '').trim())
        .filter(t => t.length > 40 && !/^__generating__/i.test(t) && !/Build ${BRAND} on disk/i.test(t))
        .pop() || '';
      const ui = document.body?.innerText || '';
      const hasCreated = /Live verified|Live ready|Preview ready|is up —|on disk and Live|Dependencies installed|Created\\s+Vireo/i.test(reply)
        || /Live verified|Preview ready|Created\\s+Vireo/i.test(ui);
      // Do NOT treat "Live locked" alone as failure — that pill is normal until Live verifies.
      const craftFailed = /craft preflight failed|Failed at:\\s*UI polish|App has no interactive handlers/i.test(reply)
        || /craft preflight failed|Failed at:\\s*UI polish/i.test(ui);
      const liveUnlocked = !/Live locked/i.test(ui)
        && (/\\bLive\\b/i.test(ui) || /Vireo Vac[\\s\\S]{0,160}(?:Built for the job|Full-bleed hero|feature|Quiet)/i.test(ui));
      const liveShowingPage = /Vireo Vac[\\s\\S]{0,240}(?:Built for the job|Quiet confidence|Full-bleed hero|feature-a|Suction)/i.test(ui);
      return {
        gen,
        chip: chip.slice(0, 48),
        status: String(status).slice(0, 140),
        replyHead: reply.slice(0, 220).replace(/\\s+/g, ' '),
        hasCreated,
        craftFailed,
        liveUnlocked,
        liveShowingPage,
      };
    })()`, true, 15000);
  } catch (e) {
    log('poll', String(e.message || e).slice(0, 100));
    continue;
  }
  if (snap?.chip) {
    const seat = String(snap.chip).split('·')[0].trim().toLowerCase();
    if (seat) seatsSeen.add(seat);
  }
  let disk = { bytes: 0, tipStub: false, hasHero: false };
  try {
    const proj = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects', SLUG);
    const appPath = ['src/App.tsx', 'src/App.jsx', 'src/App.ts', 'src/App.js']
      .map((r) => path.join(proj, r))
      .find((p) => fs.existsSync(p));
    if (appPath) {
      const body = fs.readFileSync(appPath, 'utf8');
      disk = {
        bytes: body.length,
        tipStub: /tipAmt|Tip percent|tip calculator/i.test(body),
        hasHero: /hero|feature|footer|full-?bleed|Vireo|vacuum/i.test(body) && body.length > 1800,
      };
    }
  } catch { /* ignore */ }
  const key = `${snap?.gen}|${snap?.chip}|${snap?.status}|${disk.bytes}|${disk.hasHero}`;
  if (key !== last) {
    last = key;
    log(
      'LIVE',
      snap?.chip || snap?.status || (snap?.gen ? 'Thinking…' : 'idle'),
      `app=${disk.bytes}b`,
      seatsSeen.size ? `seats=${[...seatsSeen].join('+')}` : '',
      disk.tipStub ? '· TIP-STUB' : '',
      disk.hasHero ? '· homepage-ish' : '',
    );
    if (snap?.replyHead) log('reply', snap.replyHead);
  }
  // Only hard-fail on explicit craft preflight failure — "Live locked" is normal until Live verifies.
  if (snap?.craftFailed && !snap?.gen) {
    log('FAIL craft preflight');
    if (snap?.replyHead) log('reply', snap.replyHead);
    if (snap?.status) log('status', snap.status);
    close();
    process.exit(2);
  }
  const statusBlob = `${snap?.status || ''} ${snap?.replyHead || ''}`;
  const realDone = !snap?.gen && !disk.tipStub && disk.bytes > 1800
    && !snap?.craftFailed
    && (
      snap?.hasCreated
      || snap?.liveShowingPage
      || (snap?.liveUnlocked && disk.hasHero && disk.bytes > 2000)
      || /Live verified|Dependencies installed|Created\s+Vireo|project (?:is )?ready|Live preview/i.test(statusBlob)
      || (disk.hasHero && disk.bytes > 2000 && /Installing|npm|Preview|Live|Wiring|Fetching/i.test(statusBlob) === false && /Created|ready|verified|Folder:/i.test(statusBlob))
    );
  if (realDone) {
    log('DONE — seats seen:', [...seatsSeen].join(' → ') || '(none)');
    if (snap?.replyHead) log('reply', snap.replyHead);
    log('Open Live under the chat and review quality.');
    close();
    process.exit(0);
  }
}

close();
log('TIMEOUT — create did not finish cleanly');
process.exit(3);
