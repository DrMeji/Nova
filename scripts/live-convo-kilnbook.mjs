/**
 * LIVE watch: long conversation → Plan → Build for KilnBook (pottery firing journal).
 * Brand-new product — not todo / coffee / tip / NoteDot.
 *
 *   $env:NOVA_CDP_PORT='9229'; node scripts/live-convo-kilnbook.mjs
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const PAUSE = Number(process.env.NOVA_WATCH_PAUSE_MS || 5500);
const TURN_MS = Number(process.env.NOVA_TURN_TIMEOUT_MS || 150000);
const PLAN_MS = Number(process.env.NOVA_PLAN_TIMEOUT_MS || 200000);
const BUILD_MS = Number(process.env.NOVA_BUILD_TIMEOUT_MS || 720000);
const OUT = path.join(__dirname, '_convo-kilnbook-out.json');
const LOG = path.join(__dirname, '_convo-kilnbook-console.txt');
const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const BRAND = 'KilnBook';
/** Medium/small local model — prove create works (32B stalled/truncated on this PC). */
const MODEL_ID = String(process.env.NOVA_KILN_MODEL || 'qwen25-7b');
const MODEL_LABEL = String(process.env.NOVA_KILN_MODEL_LABEL || 'Qwen2.5 7B');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  try { fs.appendFileSync(LOG, `${line}\n`); } catch { /* ignore */ }
  try { process.stdout.write(`${line}\n`); } catch { /* ignore */ }
}

/** Wipe leftover scaffolds so this run is a clean project. */
function wipeProjects() {
  try {
    if (!fs.existsSync(PROJECTS)) return;
    for (const ent of fs.readdirSync(PROJECTS, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      try {
        fs.rmSync(path.join(PROJECTS, ent.name), { recursive: true, force: true });
        log('wiped', ent.name);
      } catch (e) {
        log('wipe lock', ent.name, String(e?.message || e).slice(0, 80));
      }
    }
  } catch { /* ignore */ }
}

const TURNS = [
  {
    id: 'greet',
    kind: 'chat',
    ask: 'Hey — you around? I’ve got a little hobby idea and I just want to bounce it around first.',
  },
  {
    id: 'riff-1',
    kind: 'chat',
    ask: 'So I throw pottery on weekends. After a kiln firing I scribble clay body, cone temp, whether the glaze crawled… then I lose the scrap. Every time.',
  },
  {
    id: 'riff-2',
    kind: 'chat',
    ask: 'I don’t want accounts or some giant studio CRM. Just a small page I can open on the laptop next to the kiln.',
  },
  {
    id: 'seed',
    kind: 'chat',
    expectPlanNudge: false,
    ask: `Thinking of calling it ${BRAND}. For v1 I’d log a firing: clay body, cone (like 6 or 10), glaze notes, pass/fail. What would you actually put in that first version?`,
  },
  {
    id: 'riff-3',
    kind: 'chat',
    ask: 'Yeah that tracks. Keep a short list of past firings under the form so I can see the last few. No photos yet. Warm clay / charcoal studio vibe is fine.',
  },
  {
    id: 'riff-4',
    kind: 'chat',
    ask: 'Oh — and put the name big up top with one line like “log every kiln run.” Local-only is fine.',
  },
  {
    id: 'enter-plan',
    kind: 'plan',
    ask: `Alright — switch into Plan and map ${BRAND} v1 for me: form fields, the firing list, and the look. Don’t build yet.`,
  },
  {
    id: 'refine-plan',
    kind: 'plan',
    ask: 'Looks close — but open Plan and flesh it out. I want clear steps: brand header, add-firing form (clay, cone, glaze, result), saved firings list, studio look. Single screen. More detail per step.',
  },
  {
    id: 'build',
    kind: 'build',
    ask: `Plan looks good — Let’s build this now. Create ${BRAND} on disk: pottery firing journal with brand name, short tagline, form for clay/cone/glaze/result, and a list of firings. Skip Plan. Start building.`,
  },
];

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

function looksGibberish(t) {
  const s = String(t || '').trim();
  if (!s || s.length < 10) return true;
  if (/(.)\1{20,}/.test(s)) return true;
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  if (s.length > 40 && letters / s.length < 0.35) return true;
  return false;
}

function judgeReply(turn, snap, elapsedMs) {
  const t = String(snap?.reply || '').trim();
  const flags = [];
  if (!t || t.length < 8) flags.push('empty-or-thin');
  if (looksGibberish(t) && turn.kind !== 'build') flags.push('gibberish');
  if (/@@@FILE\b|<!DOCTYPE html/i.test(t) && turn.kind === 'chat') flags.push('code-dump-in-chat');

  if (turn.kind === 'chat' && turn.id !== 'greet') {
    if (!/kiln|fir|clay|cone|glaze|potter|studio|log|journal|list|form|KilnBook/i.test(t)
      && !/sounds|yeah|simple|v1|version|page|local|idea|hobby/i.test(t)) {
      flags.push('off-topic-chat');
    }
  }

  if (turn.kind === 'plan') {
    // Soft: chat-shaped plans still count if they outline KilnBook (overlay may not auto-open).
    const blob = t + (snap.planText || '');
    if (!snap.planOverlay && !snap.planPill) {
      if (!/1\.|step|form|list|header|screen|v1|KilnBook|clay|cone/i.test(blob)) {
        flags.push('no-plan-ui');
      }
    }
    if (!/kiln|fir|clay|cone|glaze|KilnBook|journal|list|form/i.test(blob)) {
      flags.push('plan-misses-prompt');
    }
  }

  if (turn.kind === 'build') {
    const setupFailed = /Node\.js is not installed|setup did not finish|Live is unavailable|Dependencies are not installed|npm install timed out|craft preflight failed/i.test(t);
    const createdOk = /Created\s+|Dependencies installed|Live verified|Live preview verified|Folder:\s*[`\\/A-Za-z]/i.test(t)
      || /NOVA Projects[/\\][A-Za-z0-9._-]*[Kk]iln/i.test(t);
    // Must be a real create reply — studio leftovers / plan chat do NOT count.
    if (!createdOk && elapsedMs > 45000) flags.push('no-create-reply');
    if (setupFailed) flags.push('setup-failed');
    if (snap.stopStill && !createdOk) flags.push('build-still-generating');
    if (createdOk && !snap.appHasFiringUi && elapsedMs > 90000) flags.push('missing-firing-ui');
  }
  return flags;
}

async function connect() {
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = (list || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl
    && (/dist\/index\.html|#\/chat|file:\/\//i.test(t.url || '') || /^NOVA\b/i.test(t.title || '')));
  if (!page?.webSocketDebuggerUrl) throw new Error('no NOVA page on CDP ' + PORT);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}, timeoutMs = 60_000) => new Promise((resolve, reject) => {
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
  const evalE = async (expression, timeoutMs = 45_000) => {
    const r = await send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    }, timeoutMs);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  return { ws, send, evalE };
}

try { fs.writeFileSync(LOG, `kilnbook convo ${new Date().toISOString()}\n`); } catch { /* ignore */ }
wipeProjects();
log('\n=== LIVE CONVO → PLAN → BUILD · KilnBook (watch Nova) ===\n');
log(`CDP ${PORT} · pause ${PAUSE}ms · model ${MODEL_ID}\n`);

let { ws, send, evalE } = await connect();
await send('Page.enable');
await send('Runtime.enable');
try { await send('Page.bringToFront'); } catch { /* ok */ }

log('Fresh NEW chat…');
await evalE(`(() => {
  try {
    const drop = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /chat-thread|chat-plan|composer-mode|plan-nudge|recent-chats|chat-studio/i.test(k)) drop.push(k);
    }
    for (const k of drop) localStorage.removeItem(k);
    try { sessionStorage.clear(); } catch {}
    const raw = localStorage.getItem('NOVA:local-prefs');
    const p = raw ? JSON.parse(raw) : {};
    p.planApproveGate = false;
    p.agentLoopOnCreate = false;
    // Pin smaller/medium model for this prove-out (not coder-32b).
    p.activeChatId = ${JSON.stringify(MODEL_ID)};
    p.defaultModelId = ${JSON.stringify(MODEL_ID)};
    p.lastChatModelId = ${JSON.stringify(MODEL_ID)};
    p.activeCoderId = ${JSON.stringify(MODEL_ID)};
    p.defaultCodeModelId = ${JSON.stringify(MODEL_ID)};
    p.lastAnsweredLabel = ${JSON.stringify(MODEL_LABEL)};
    localStorage.setItem('NOVA:local-prefs', JSON.stringify(p));
    try {
      window.dispatchEvent(new CustomEvent('NOVA:engine-model', { detail: { id: ${JSON.stringify(MODEL_ID)} } }));
    } catch {}
  } catch {}
  // Always land on Chat first — Models / other routes have no composer textarea.
  const chat = [...document.querySelectorAll('button,[role=button],a')].find(el =>
    (el.getAttribute('aria-label') || '') === 'Chat' || /^Chat$/i.test((el.textContent || '').trim()));
  if (chat) chat.click();
  location.hash = '#/chat';
  return true;
})()`);
await sleep(1200);
await evalE(`(() => {
  const chat = [...document.querySelectorAll('button,[role=button],a')].find(el =>
    (el.getAttribute('aria-label') || '') === 'Chat' || /^Chat$/i.test((el.textContent || '').trim()));
  if (chat) chat.click();
  const neu = [...document.querySelectorAll('button,[role=button],a')].find(b =>
    /new chat|new conversation/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
  if (neu) neu.click();
  else location.hash = '#/chat?new=' + Date.now();
  return true;
})()`);
// Wait until the chat composer exists (Models/Brain routes have none).
for (let i = 0; i < 40; i++) {
  const snap = await evalE(`({
    ta: Boolean(document.querySelector('textarea')),
    title: document.title,
    hash: location.hash,
  })`).catch(() => ({ ta: false }));
  if (snap?.ta) {
    log('Composer ready', snap.title, snap.hash);
    break;
  }
  if (i === 5 || i === 15) {
    await evalE(`(() => {
      const chat = [...document.querySelectorAll('button,[role=button],a')].find(el =>
        (el.getAttribute('aria-label') || '') === 'Chat' || /^Chat$/i.test((el.textContent || '').trim()));
      if (chat) chat.click();
      if (!/#\\/chat/i.test(location.hash)) location.hash = '#/chat';
      return true;
    })()`).catch(() => {});
  }
  await sleep(500);
}
await sleep(600);

// Hard-lock engine + prefs to 7B — create must not hop to coder-32B.
log('Model pin (hard):', MODEL_ID);
await evalE(`(async () => {
  try {
    const raw = localStorage.getItem('NOVA:local-prefs');
    const p = raw ? JSON.parse(raw) : {};
    p.activeChatId = ${JSON.stringify(MODEL_ID)};
    p.defaultModelId = ${JSON.stringify(MODEL_ID)};
    p.lastChatModelId = ${JSON.stringify(MODEL_ID)};
    p.activeCoderId = ${JSON.stringify(MODEL_ID)};
    p.defaultCodeModelId = ${JSON.stringify(MODEL_ID)};
    p.multiModelCreate = false;
    p.agentLoopOnCreate = false;
    p.aiMode = 'local_only';
    localStorage.setItem('NOVA:local-prefs', JSON.stringify(p));
  } catch {}
  try { await window.novaDesktop?.engineSetModel?.(${JSON.stringify(MODEL_ID)}); } catch {}
  try {
    window.dispatchEvent(new CustomEvent('NOVA:force-chat-model', {
      detail: { id: ${JSON.stringify(MODEL_ID)}, name: ${JSON.stringify(MODEL_LABEL)} },
    }));
  } catch {}
  const chat = [...document.querySelectorAll('button,[role=button],a')].find(el =>
    (el.getAttribute('aria-label') || '') === 'Chat' || /^Chat$/i.test((el.textContent || '').trim()));
  if (chat) chat.click();
  if (!/#\\/chat/i.test(location.hash)) location.hash = '#/chat';
  return true;
})()`).catch(() => {});
await sleep(1200);

async function ensureComposer() {
  for (let i = 0; i < 24; i++) {
    const ok = await evalE(`Boolean(document.querySelector('textarea'))`).catch(() => false);
    if (ok) return true;
    await evalE(`(() => {
      const chat = [...document.querySelectorAll('button,[role=button],a')].find(el =>
        (el.getAttribute('aria-label') || '') === 'Chat' || /^Chat$/i.test((el.textContent || '').trim()));
      if (chat) chat.click();
      if (!/#\\/chat/i.test(location.hash)) location.hash = '#/chat';
      return true;
    })()`).catch(() => {});
    await sleep(400);
  }
  return false;
}

async function ensurePlanMode() {
  await evalE(`(() => {
    // Click Switch to Plan / Plan mode chip if present
    const btns = [...document.querySelectorAll('button,[role=button],a,[role=menuitem]')];
    const hit = btns.find(b => {
      const t = ((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')).trim();
      return /switch to plan|^plan$/i.test(t) && t.length < 40;
    });
    if (hit) { hit.click(); return 'chip'; }
    // Composer mode toggle
    const mode = btns.find(b => /plan mode|mode:\\s*plan|composer.*plan/i.test(
      ((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')).trim()));
    if (mode) { mode.click(); return 'mode'; }
    try {
      window.dispatchEvent(new CustomEvent('NOVA:set-composer-mode', { detail: { mode: 'plan' } }));
      return 'event';
    } catch { return 'none'; }
  })()`);
  await sleep(900);
}

async function clickLetsBuild() {
  return evalE(`(() => {
    const btns = [...document.querySelectorAll('button,[role=button],a')];
    const hit = btns.find(b => /let'?s build this|start building|ok start building/i.test((b.textContent || '').trim()));
    if (hit) { hit.click(); return (hit.textContent || '').trim().slice(0, 40); }
    return null;
  })()`);
}

async function typeAndSend(ask, opts = {}) {
  if (!(await ensureComposer())) throw new Error('no textarea');
  if (opts.plan) {
    await ensurePlanMode();
    if (!(await ensureComposer())) throw new Error('no textarea after plan mode');
  }
  if (opts.build) {
    // Prefer Plan CTA — that's the reliable create path after plan overlay.
    const clicked = await clickLetsBuild().catch(() => null);
    if (clicked) {
      log('  clicked Plan CTA:', clicked);
      await sleep(1200);
      return; // don't also send a chat ask — CTA starts create
    }
  }
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
  await sleep(300);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(400);
  if (await evalE(`(document.querySelector('textarea')?.value || '').length > 8`)) {
    await evalE(`document.querySelector('textarea')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  }
}

async function waitAndCapture(ask, timeoutMs, { expectPlan = false, expectBuild = false } = {}) {
  const askLit = JSON.stringify(ask);
  const t0 = Date.now();
  let last = null;
  let sawStop = false;
  while (Date.now() - t0 < timeoutMs) {
    // Click Let's build if a plan CTA appears during build turn
    if (expectBuild) {
      try {
        await evalE(`(() => {
          const hit = [...document.querySelectorAll('button,[role=button],a')].find(b =>
            /let'?s build this|start building|ok start building/i.test((b.textContent || '').trim()));
          if (hit) hit.click();
          return !!hit;
        })()`);
      } catch { /* ignore */ }
    }
    const s = await evalE(`(() => {
      const stop = [...document.querySelectorAll('button')].some(b =>
        /stop generating/i.test(b.getAttribute('aria-label') || b.title || '')
      );
      const body = document.body?.innerText || '';
      const askNorm = ${askLit}.replace(/[\\u2014\\u2013\\u2212]/g, '-');
      const bodyNorm = body.replace(/[\\u2014\\u2013\\u2212]/g, '-');
      let idx = bodyNorm.lastIndexOf(askNorm.slice(0, 48));
      const slice = idx >= 0 ? body.slice(idx) : body.slice(-3000);
      let after = slice.slice(Math.min(askNorm.length, 80));
      after = after.split(/\\n(?:Ask a question|Multimodal|0%)/)[0] || after;
      const overlay = document.querySelector('[aria-label="Plan mode"][role="dialog"]');
      const planPill = Boolean(
        document.querySelector('[data-nova-plan-pill="1"]')
        || [...document.querySelectorAll('button')].some(b => /^Open Plan:/i.test(b.getAttribute('aria-label') || ''))
      );
      const planNodes = overlay ? overlay.querySelectorAll('.nova-plan-flow button').length : 0;
      const planText = overlay
        ? (overlay.querySelector('.nova-plan-flow')?.innerText || overlay.innerText || '').slice(0, 2000)
        : '';
      const codePill = [...document.querySelectorAll('button')].some(b =>
        /^(Open )?Code$/i.test((b.getAttribute('aria-label') || '').trim())
      );
      const codeOverlay = Boolean(document.querySelector('[data-nova-code-editor], [aria-label="Code"][role="dialog"]'));
      const hasFiles = /App\\.(tsx|jsx)|@@@FILE|KilnBook/i.test(body) || codePill;
      let appHasFiringUi = false;
      let appTitle = '';
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          let v; try { v = JSON.parse(localStorage.getItem(k) || 'null'); } catch { continue; }
          const files = v?.files || v?.snapshot?.files;
          if (!files || typeof files !== 'object') continue;
          const appKey = Object.keys(files).find((f) => /App\\.(tsx|jsx)$/i.test(f));
          if (!appKey) continue;
          const appSrc = String(files[appKey] || '');
          appHasFiringUi = /clay|cone|glaze|fir|kiln/i.test(appSrc) && /useState|<form|<input|<button/i.test(appSrc);
          const m = appSrc.match(/<h1[^>]*>([^<]{1,60})<\\/h1>/i);
          appTitle = m ? m[1].trim() : '';
          break;
        }
      } catch {}
      let reply = after
        .replace(/^\\s*(?:Done|Reading your message|Thinking…?|Planning[^.\\n]*)\\s*/i, '')
        .replace(/\\d+(?:\\.\\d+)?\\s*s\\s*[·•][^\\n]+/g, '')
        .trim();
      return {
        stop, planOverlay: Boolean(overlay), planPill, planNodes, planText,
        codePill, codeOverlay, hasFiles, appHasFiringUi, appTitle, stopStill: stop,
        reply: reply.slice(0, 2400), len: reply.length,
      };
    })()`, 30_000);
    last = s;
    if (s.stop) sawStop = true;
    const elapsed = Date.now() - t0;
    process.stdout.write(
      `\r  … ${Math.round(elapsed / 1000)}s stop=${s.stop} plan=${s.planOverlay}/${s.planNodes} code=${s.codePill} len=${s.len}   `,
    );

    if (expectPlan && s.planOverlay && s.planNodes >= 1 && elapsed > 5000) {
      await sleep(1200);
      break;
    }
    if (expectBuild && elapsed > 8000) {
      // Keep clicking Let's build if Plan CTA reappears
      if (elapsed < 60000) {
        try { await clickLetsBuild(); } catch { /* ignore */ }
      }
      const installing = /Installing|npm |unpacking|Live paints|coding ·|Craft ·/i.test(s.reply || '');
      const createDone = /Created\s|Live verified|Dependencies installed|Folder:|craft preflight failed|setup did not finish/i.test(s.reply || '');
      if (sawStop && !s.stop && createDone) {
        await sleep(1500);
        break;
      }
      if (createDone && s.appHasFiringUi && !installing) {
        await sleep(1200);
        break;
      }
    }
    if (!expectPlan && !expectBuild && sawStop && !s.stop && s.len > 12 && elapsed > 2500) {
      await sleep(800);
      break;
    }
    if (!expectBuild && elapsed > 55000 && !s.stop && (s.len > 12 || s.planOverlay)) break;
    await sleep(1200);
  }
  process.stdout.write('\n');
  return last;
}

const results = [];
let aborted = null;

for (let i = 0; i < TURNS.length; i++) {
  const turn = TURNS[i];
  log(`\n── ${i + 1}/${TURNS.length} · ${turn.id} (${turn.kind})`);
  log(`ASK: ${turn.ask}`);
  try { await send('Page.bringToFront'); } catch { /* ok */ }
  const t0 = Date.now();
  try {
    await typeAndSend(turn.ask, { plan: turn.kind === 'plan', build: turn.kind === 'build' });
  } catch (err) {
    aborted = { turn: turn.id, flags: ['send-failed'], err: String(err?.message || err) };
    log('  ✗ STOP — send-failed', aborted.err);
    break;
  }
  const timeout = turn.kind === 'build' ? BUILD_MS : (turn.kind === 'plan' ? PLAN_MS : TURN_MS);
  let snap;
  try {
    snap = await waitAndCapture(turn.ask, timeout, {
      expectPlan: turn.kind === 'plan',
      expectBuild: turn.kind === 'build',
    });
  } catch (err) {
    aborted = { turn: turn.id, flags: ['wait-failed'], err: String(err?.message || err) };
    log('  ✗ STOP — wait-failed', aborted.err);
    break;
  }
  const elapsedMs = Date.now() - t0;
  const flags = judgeReply(turn, snap, elapsedMs);
  // Soft: don't abort chat on mild off-topic — keep the live watch going
  const hard = flags.filter((f) => !/off-topic|missing-plan-nudge/.test(f));
  const ok = hard.length === 0;
  log(`REPLY (${Math.round(elapsedMs / 1000)}s): ${(snap?.reply || '').slice(0, 280).replace(/\s+/g, ' ')}`);
  log(`  plan=${snap?.planOverlay} pill=${snap?.planPill} code=${snap?.codePill} files=${snap?.hasFiles} firingUi=${snap?.appHasFiringUi}`);
  log(ok ? '  ✓ OK' : `  ✗ flags: ${flags.join(', ')}`);
  results.push({
    id: turn.id, kind: turn.kind, ask: turn.ask, reply: snap?.reply || '',
    elapsedMs, flags, ok,
    planOverlay: Boolean(snap?.planOverlay), codePill: Boolean(snap?.codePill),
    hasFiles: Boolean(snap?.hasFiles), appHasFiringUi: Boolean(snap?.appHasFiringUi),
  });
  if (!ok) {
    aborted = { turn: turn.id, flags: hard.length ? hard : flags };
    log('\n*** Aborting — hard flag ***\n');
    break;
  }
  log(`  …pause ${PAUSE}ms (watch Nova)`);
  await sleep(PAUSE);
}

let liveVerify = null;
if (!aborted && results.some((r) => r.id === 'build' && r.ok)) {
  log('\n── live-verify');
  try {
    // Shorter probes + reconnect-friendly — prior run hit cdp-timeout on a 120s evaluate.
    liveVerify = await evalE(`(async () => {
      const body = document.body?.innerText || '';
      let folder = (body.match(/Folder:\\s*\`?(C:\\\\[^\\\`\\n]+)/i) || [])[1]
        || (body.match(/(C:\\\\Users\\\\[^\\n]+\\\\NOVA Projects\\\\[A-Za-z0-9._-]+)/i) || [])[1]
        || '';
      if (!folder) {
        const short = body.match(/\\b(kilnbook(?:-\\d+)?)/i);
        if (short) folder = ${JSON.stringify(PROJECTS + path.sep)} + short[1];
      }
      const live = [...document.querySelectorAll('button,a,[role=button]')].find(n => {
        const t = ((n.getAttribute('aria-label') || '') + ' ' + (n.textContent || '')).trim();
        return /^Live$/i.test(t) || (/\\bLive\\b/.test(t) && t.length < 28 && !/lock/i.test(t));
      });
      if (live) live.click();
      await new Promise(r => setTimeout(r, 2000));
      if (!folder || !window.novaDesktop?.getOrAttachPreview) {
        return { ok: false, reason: 'no-folder', folder, bodyHead: body.slice(0, 200) };
      }
      const att = await window.novaDesktop.getOrAttachPreview(folder);
      if (!(att?.ok && att.url)) return { ok: false, reason: 'attach-failed', folder, att };
      let probe = null;
      for (let i = 0; i < 3; i++) {
        probe = await window.novaDesktop.previewProbeMounted?.({
          url: att.url, title: ${JSON.stringify(BRAND)}, waitMs: i === 0 ? 6000 : 4000,
        });
        const sample = String(probe?.sample || '');
        if (probe?.mounted && sample.length >= 16) break;
        await new Promise(r => setTimeout(r, 2000));
      }
      const sample = String(probe?.sample || '');
      const painted = Boolean(probe?.mounted && sample.length >= 16
        && !/plugin:vite|Transform failed|Expected ">"/i.test(sample));
      const onBrand = /kiln|fir|clay|cone|glaze/i.test(sample);
      return { ok: painted && onBrand, painted, onBrand, folder, url: att.url, sample: sample.slice(0, 200) };
    })()`, 90_000);
    log(liveVerify?.ok ? '  ✓ Live painted KilnBook UI' : '  ✗ Live verify weak', JSON.stringify(liveVerify).slice(0, 400));
    if (!liveVerify?.ok) aborted = { turn: 'live-verify', flags: ['live-fail'] };
  } catch (e) {
    liveVerify = { ok: false, error: String(e?.message || e) };
    aborted = { turn: 'live-verify', flags: ['live-error'] };
    log('  ✗', liveVerify.error);
  }
}

const summary = {
  at: new Date().toISOString(),
  brand: BRAND,
  passed: results.filter((r) => r.ok).length,
  total: results.length,
  aborted,
  liveVerify,
  results,
};
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
log(`\n=== ${summary.passed}/${summary.total} · live=${liveVerify?.ok ? 'pass' : 'n/a'} → ${OUT} ===\n`);
try { ws.close(); } catch { /* ignore */ }
process.exit(aborted ? 1 : 0);
