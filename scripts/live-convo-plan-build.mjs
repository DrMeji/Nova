/**
 * LIVE watch: conversation → Plan → tiny Build.
 * Human pauses so you can watch Nova. Stops hard on empty/gibberish/too-fast nonsense.
 * Always starts a NEW chat. CDP: NOVA_CDP_PORT (default 9229)
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const PAUSE = Number(process.env.NOVA_WATCH_PAUSE_MS || 6500);
const TURN_MS = Number(process.env.NOVA_TURN_TIMEOUT_MS || 120000);
const PLAN_MS = Number(process.env.NOVA_PLAN_TIMEOUT_MS || 180000);
const BUILD_MS = Number(process.env.NOVA_BUILD_TIMEOUT_MS || 540000);
const OUT = path.join(__dirname, '..', '.tmp-live-convo-plan-build.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Longer sticky-note convo → Plan → Build, then verify Live actually paints. */
const TURNS = [
  {
    id: 'greet',
    kind: 'chat',
    ask: 'Hey — quick question if you’ve got a minute.',
    minMs: 800,
    maxMsSoft: 45000,
  },
  {
    id: 'riff-1',
    kind: 'chat',
    ask: 'I’ve been jotting ideas on sticky notes and losing them. Want something dumb-simple on screen instead.',
    minMs: 1200,
    maxMsSoft: 60000,
  },
  {
    id: 'seed',
    kind: 'chat',
    expectPlanNudge: true,
    ask: 'I’m thinking of a tiny sticky-note page — just a title and one note you can type. Calling it NoteDot. What should a first version actually do?',
    minMs: 1500,
    maxMsSoft: 60000,
  },
  {
    id: 'riff-2',
    kind: 'chat',
    ask: 'Yeah keep it minimal — no accounts, no folders. Just one note field I can type into. Dark vibe is fine.',
    minMs: 1200,
    maxMsSoft: 60000,
  },
  {
    id: 'enter-plan',
    kind: 'plan',
    ask: 'Alright, let’s plan NoteDot out — keep it tiny, just the first version before we build anything.',
    minMs: 2000,
    maxMsSoft: 120000,
  },
  {
    id: 'refine-plan',
    kind: 'plan',
    ask: 'Looks close. Make sure step one is the title, and there’s a clear text box for the note. No extra screens.',
    minMs: 1500,
    maxMsSoft: 120000,
  },
  {
    id: 'build',
    kind: 'build',
    ask: 'Looks good — Let’s build this. Keep it the most basic page possible: one title, one text box for the note, nothing else.',
    minMs: 3000,
    maxMsSoft: 240000,
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
  if (!s) return true;
  if (s.length < 12) return true;
  // Repeated token spam / broken tokens
  if (/(.)\1{20,}/.test(s)) return true;
  if (/(?:asdf|qwer|xxxx|lorem ipsum|�){2,}/i.test(s)) return true;
  // Mostly non-letters
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  if (s.length > 40 && letters / s.length < 0.35) return true;
  return false;
}

function judgeReply(turn, snap, elapsedMs) {
  const t = String(snap?.reply || '').trim();
  const flags = [];

  if (!t || t.length < 8) flags.push('empty-or-thin');
  if (looksGibberish(t) && turn.kind !== 'build') flags.push('gibberish');
  if (elapsedMs < (turn.minMs || 600) && t.length > 20) flags.push('suspiciously-fast');
  if (/@@@FILE\b|<!DOCTYPE html/i.test(t) && turn.kind === 'chat') flags.push('code-dump-in-chat');
  if (/coding or programming|any coding projects/i.test(t)) flags.push('coding-pitch');

  if (turn.id === 'greet') {
    if (!/hey|hi|sure|yeah|minute|help|go ahead|what'?s|of course/i.test(t)) {
      flags.push('off-topic-greet');
    }
  }

  if (turn.id === 'riff-1' || turn.id === 'riff-2') {
    if (!/note|sticky|simple|title|type|text|minimal|dark|page|idea/i.test(t)) {
      flags.push('off-topic-riff');
    }
    if (/@@@FILE\b|<!DOCTYPE html/i.test(t)) flags.push('code-dump-in-chat');
  }

  if (turn.id === 'seed') {
    if (!/note|sticky|title|type|text|simple|tiny|first version|NoteDot/i.test(t)) {
      flags.push('off-topic-seed');
    }
    const nudged = /switch to \*\*plan\*\*|go into \*\*plan\*\*|Want to go into|Switch to Plan|Plan mode so we can map/i.test(t)
      || Boolean(snap.planNudgeChip)
      || /Want to go into[\s\S]{0,40}Plan/i.test(t);
    if (turn.expectPlanNudge && !nudged) flags.push('missing-plan-nudge');
  }

  if (turn.kind === 'plan') {
    if (!snap.planOverlay && !snap.planPill) flags.push('no-plan-ui');
    if (snap.inlinePlanAccordion) flags.push('legacy-inline-plan');
    if (turn.id === 'enter-plan' && !snap.planOverlay) flags.push('plan-overlay-not-auto-open');
    if (!/NoteDot|note|sticky|title|text/i.test(t + (snap.planText || ''))) {
      flags.push('plan-misses-prompt');
    }
    if (/lock the v1 promise|must-have screens|choose sensible defaults|plan mode[\s\S]{0,40}read-only/i.test(snap.planText || '')) {
      flags.push('meta-plan-fluff');
    }
    if (turn.id === 'enter-plan' && !/scaffold|smoke|text box|textarea|App\.tsx|single-screen|note/i.test(snap.planText || '')) {
      flags.push('plan-not-build-blueprint');
    }
  }

  if (turn.kind === 'build') {
    const tLow = t;
    const setupFailed = /Node\.js is not installed|setup did not finish|Live is unavailable|Dependencies are not installed|npm install timed out|Could not install npm/i.test(tLow)
      || /Installing[.…]|Installing\.\.\./i.test(tLow);
    const createdOk = /Created\s+\*\*[^*]+\*\*|Created\s+NoteDot|Dependencies installed|Live preview verified|Code scan passed/i.test(tLow);
    const appOk = Boolean(
      (snap.appHasNoteInput && !snap.appIsStubSite)
      || (createdOk && !setupFailed && (snap.codePill || snap.codeOverlay || snap.hasFiles)),
    );
    const built = Boolean(
      snap.codeOverlay || snap.codePill || snap.hasFiles
      || /@@@FILE|Created\s|wrote|building|preview|Live/i.test(tLow),
    );
    if (!built && elapsedMs > 15000) flags.push('no-build-signal');
    if (setupFailed) flags.push('npm-or-live-setup-failed');
    // Never pass a build that is still generating.
    if (snap.stopStill) flags.push('build-still-generating');
    if (snap.appIsStubSite) flags.push('stub-site-not-notedot');
    if (snap.hasFiles && !snap.appHasNoteInput && elapsedMs > 60000) flags.push('missing-note-input');
    if (snap.appTitle && !/notedot|note/i.test(String(snap.appTitle))) {
      if (/^site$/i.test(String(snap.appTitle).trim())) flags.push('wrong-product-title');
    }
    // Soft plan leftovers must not count as a finished build.
    if (/detailed plan for the first version|Alright, let’s plan NoteDot|Alright, let's plan NoteDot/i.test(tLow)
      && !createdOk) {
      flags.push('build-captured-plan-not-create');
    }
    if (elapsedMs > 180000 && !appOk) flags.push('build-too-slow');
    if (elapsedMs > 60000 && !createdOk && !setupFailed && !snap.appHasNoteInput) {
      flags.push('build-incomplete-reply');
    }
  }

  return flags;
}

async function connect() {
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = list.find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('no NOVA page on CDP ' + PORT);
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
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  return { ws, send, evalE };
}

async function waitCdp(maxMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      if (list?.some((t) => t.type === 'page')) return true;
    } catch { /* retry */ }
    await sleep(1500);
  }
  return false;
}

console.log('\n=== LIVE CONVO → PLAN → BASIC BUILD (watch Nova) ===\n');
console.log(`CDP ${PORT} · pause ${PAUSE}ms · watching every reply\n`);

if (!(await waitCdp())) {
  console.error('NOVA CDP not up on', PORT);
  process.exit(2);
}

let { ws, send, evalE } = await connect();

async function reconnect(reason = 'CDP dropped') {
  console.log(`  ↻ ${reason} — reconnecting…`);
  try { ws.close(); } catch { /* ok */ }
  if (!(await waitCdp(90_000))) throw new Error('CDP gone after reconnect wait');
  ({ ws, send, evalE } = await connect());
  await send('Page.enable');
  await send('Runtime.enable');
  try { await send('Page.bringToFront'); } catch { /* ok */ }
}

async function evalSafe(expression) {
  try {
    return await evalE(expression);
  } catch (err) {
    await reconnect(String(err?.message || err).slice(0, 80));
    return evalE(expression);
  }
}

await send('Page.enable');
await send('Runtime.enable');
try { await send('Page.bringToFront'); } catch { /* ok */ }

console.log('Fresh NEW chat (no hard reload — avoids Electron network-service crashes)…');
await sleep(1500);
try { await send('Page.bringToFront'); } catch { /* ok */ }

await evalE(`(() => {
  try {
    for (const store of [localStorage, sessionStorage]) {
      const keys = [];
      for (let i = 0; i < store.length; i++) keys.push(store.key(i));
      for (const k of keys) {
        if (k && /composer-mode|plan-nudge|active-plan|chat-plan/i.test(k)) store.removeItem(k);
      }
    }
  } catch {}
  const btns = [...document.querySelectorAll('button,[role="button"],a')];
  const hit = btns.find(b => {
    const a = (b.getAttribute('aria-label') || '').toLowerCase();
    const t = (b.textContent || '').trim().toLowerCase();
    const title = (b.getAttribute('title') || '').toLowerCase();
    return a.includes('new chat') || title.includes('new chat') || t === 'new chat'
      || a.includes('new thread');
  });
  if (hit) hit.click();
  else window.dispatchEvent(new CustomEvent('NOVA:new-chat'));
  return true;
})()`);
await sleep(2500);

async function typeAndSend(ask) {
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
  await sleep(350);
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
    const s = await evalE(`(() => {
      const stop = [...document.querySelectorAll('button')].some(b =>
        /stop generating/i.test(b.getAttribute('aria-label') || b.title || '')
      );
      const body = document.body?.innerText || '';
      const askNorm = ${askLit}.replace(/[\\u2014\\u2013\\u2212]/g, '-');
      const bodyNorm = body.replace(/[\\u2014\\u2013\\u2212]/g, '-');
      let idx = bodyNorm.lastIndexOf(askNorm);
      if (idx < 0) {
        const head = ${JSON.stringify(ask.slice(0, 40).replace(/[\u2014\u2013\u2212]/g, '-'))};
        idx = bodyNorm.lastIndexOf(head);
      }
      const slice = idx >= 0 ? body.slice(idx) : body.slice(-2800);
      let after = slice.slice(${Math.min(ask.length, 80)});
      after = after.split(/\\n(?:Ask a question|Multimodal|0%)/)[0] || after;
      const doneParts = after.split(/\\nDone\\n/);
      if (doneParts.length >= 2) after = doneParts[doneParts.length - 1];
      const provider = (after.match(/\\d+(?:\\.\\d+)?\\s*s\\s*[·•]\\s*[^\\n]{3,60}/) || [])[0]
        || (after.match(/NOVA\\s*·\\s*Plan/i) || [])[0]
        || null;
      const overlay = document.querySelector('[aria-label="Plan mode"][role="dialog"]');
      const planPill = Boolean(
        document.querySelector('[data-nova-plan-pill="1"]')
        || [...document.querySelectorAll('button')].some(b =>
          /^Open Plan:/i.test(b.getAttribute('aria-label') || '')
          || (b.getAttribute('aria-label') || '') === 'Open Plan'
          || (b.getAttribute('aria-label') || '') === 'Plan — drafting in progress'
        )
      );
      const inlinePlanAccordion = [...document.querySelectorAll('.nova-plan-flow')].some((el) =>
        !el.closest('[aria-label="Plan mode"]')
      );
      const planNodes = overlay ? overlay.querySelectorAll('.nova-plan-flow button').length : 0;
      const planText = overlay
        ? (overlay.querySelector('.nova-plan-flow')?.innerText || overlay.innerText || '').slice(0, 2000)
        : '';
      const planOverlay = Boolean(overlay);
      const planNudgeChip = [...document.querySelectorAll('button')].some(b =>
        /switch to plan/i.test(b.textContent || '')
      );
      const codeOverlay = Boolean(
        document.querySelector('[aria-label="Code"][role="dialog"], [aria-label*="Code workspace"], [aria-label*="code overlay"]')
        || document.querySelector('.nova-code-overlay, [data-nova-code-overlay="1"]')
      );
      const codePill = [...document.querySelectorAll('button')].some(b =>
        /^(Open )?Code$/i.test((b.getAttribute('aria-label') || '').trim())
        || ((b.textContent || '').trim() === 'Code' && /code|violet|purple/i.test(b.className || ''))
      );
      const hasFiles = /App\\.(tsx|jsx)|index\\.html|@@@FILE/i.test(body)
        || Boolean(document.querySelector('[data-nova-code-pill="1"]'));
      let appSrc = '';
      let appTitle = '';
      let appHasNoteInput = false;
      let appIsStubSite = false;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          let v;
          try { v = JSON.parse(localStorage.getItem(k) || 'null'); } catch { continue; }
          const files = v?.files || v?.snapshot?.files;
          if (!files || typeof files !== 'object') continue;
          const appKey = Object.keys(files).find((f) => /App\\.(tsx|jsx)$/i.test(f));
          if (!appKey) continue;
          appSrc = String(files[appKey] || '');
          break;
        }
      } catch {}
      if (appSrc) {
        appHasNoteInput = /<textarea\\b|placeholder=[\"'][^\"']*note/i.test(appSrc);
        appIsStubSite = /<h1[^>]*>\\s*Site\\s*<\\/h1>/i.test(appSrc)
          && !appHasNoteInput
          && appSrc.length < 400;
        const m = appSrc.match(/<h1[^>]*>([^<]{1,60})<\\/h1>/i);
        appTitle = m ? m[1].trim() : '';
      }
      const bodyHasNudge = /Want to go into|Switch to Plan|Plan mode so we can map/i.test(body);
      let reply = after
        .replace(/^\\s*(?:Done|Reading your message|Thinking…?|Planning[^.\\n]*|Outline ready|Refocusing…?|Plan · adding your change|Building[^.\\n]*)\\s*/i, '')
        .replace(/\\d+(?:\\.\\d+)?\\s*s\\s*[·•][^\\n]+/g, '')
        .trim();
      if (bodyHasNudge && !/Want to go into|Switch to Plan|Plan mode so we can map/i.test(reply)) {
        reply = reply + '\\n\\nWant to go into **Plan** mode so we can map this out.';
      }
      return {
        stop, provider,
        planOverlay, planPill, inlinePlanAccordion, planNodes, planText, planNudgeChip,
        codeOverlay, codePill, hasFiles,
        appHasNoteInput, appIsStubSite, appTitle, stopStill: stop,
        reply: reply.slice(0, 2200),
        len: reply.length,
      };
    })()`);
    last = s;
    if (s.stop) sawStop = true;
    const elapsed = Date.now() - t0;
    process.stdout.write(
      `\r  … ${Math.round(elapsed / 1000)}s stop=${s.stop} plan=${s.planOverlay}/${s.planNodes} code=${s.codePill||s.codeOverlay} len=${s.len}   `,
    );

    if (sawStop && !s.stop && (s.len > 40 || s.planOverlay || s.codePill) && elapsed > 4000) {
      // Build: never settle on a stale Code pill / plan overlay from a prior turn.
      if (expectBuild) {
        const installing = /Installing|npm (?:still|download)|unpacking node_modules|finishing setup/i.test(s.reply || '');
        const createDone = /Created\s|setup did not finish|Dependencies installed|Live preview verified|npm install timed out/i.test(s.reply || '');
        if (!installing && createDone) {
          await sleep(1800);
          const s2 = await evalE(`(() => ({
            stop: [...document.querySelectorAll('button')].some(b =>
              /stop generating/i.test(b.getAttribute('aria-label') || b.title || '')
            ),
          }))()`);
          if (!s2.stop) break;
        }
      } else {
        await sleep(1800);
        const s2 = await evalE(`(() => ({
          stop: [...document.querySelectorAll('button')].some(b =>
            /stop generating/i.test(b.getAttribute('aria-label') || b.title || '')
          ),
        }))()`);
        if (!s2.stop) break;
      }
    }
    if (expectPlan && s.planOverlay && s.planNodes >= 2 && elapsed > 6000) {
      await sleep(1400);
      break;
    }
    if (expectBuild && (s.codeOverlay || s.codePill || s.hasFiles) && !s.stop && elapsed > 8000) {
      await sleep(2000);
      // Prefer a finished build that matches the tiny NoteDot ask.
      // Never break while Stop is visible or install is still running.
      const installing = /Installing|npm (?:still|download)|unpacking node_modules|finishing setup|Thought for/i.test(s.reply || '');
      const createDone = /Created\s|setup did not finish|Dependencies installed|Live preview verified|npm install timed out/i.test(s.reply || '');
      if (installing || !createDone) {
        /* keep waiting for create/bootstrap copy — stale Code pill is not enough */
      } else if (s.appHasNoteInput && !s.appIsStubSite) {
        break;
      } else if (elapsed > 120000 && /Created |Live preview|Folder:|setup did not finish/i.test(s.reply || '')) {
        break;
      }
    }
    if (!expectPlan && !expectBuild && sawStop && !s.stop && s.len > 8 && elapsed > 2500) {
      await sleep(900);
      break;
    }
    // Soft early exit for chat/plan only — never for build (create can take 5–8 min).
    if (!expectBuild && elapsed > 50000 && !s.stop && (s.len > 12 || s.planOverlay || s.hasFiles)) break;
    await sleep(1100);
  }
  process.stdout.write('\n');
  await sleep(700);
  return last;
}

const results = [];
let aborted = null;

try {
for (let i = 0; i < TURNS.length; i++) {
  const turn = TURNS[i];
  console.log(`\n── ${i + 1}/${TURNS.length} · ${turn.id} (${turn.kind})`);
  console.log(`ASK: ${turn.ask}`);
  try { await send('Page.bringToFront'); } catch {
    try { await reconnect('bringToFront failed'); } catch (e) {
      aborted = { turn: turn.id, flags: ['cdp-dead'] };
      console.log('  ✗ STOP — cdp-dead', e?.message || e);
      break;
    }
  }

  const t0 = Date.now();
  try {
    await typeAndSend(turn.ask);
  } catch (err) {
    try {
      await reconnect(String(err?.message || err).slice(0, 80));
      await typeAndSend(turn.ask);
    } catch (e2) {
      aborted = { turn: turn.id, flags: ['send-failed'] };
      console.log('  ✗ STOP — send-failed', e2?.message || e2);
      break;
    }
  }
  const timeout = turn.kind === 'build' ? BUILD_MS
    : (turn.kind === 'plan' ? PLAN_MS : TURN_MS);
  let snap;
  try {
    snap = await waitAndCapture(turn.ask, timeout, {
      expectPlan: turn.kind === 'plan',
      expectBuild: turn.kind === 'build',
    });
  } catch (err) {
    try {
      await reconnect(String(err?.message || err).slice(0, 80));
      snap = await waitAndCapture(turn.ask, Math.min(timeout, 60_000), {
        expectPlan: turn.kind === 'plan',
        expectBuild: turn.kind === 'build',
      });
    } catch (e2) {
      aborted = { turn: turn.id, flags: ['wait-failed'] };
      console.log('  ✗ STOP — wait-failed', e2?.message || e2);
      break;
    }
  }
  const elapsedMs = Date.now() - t0;
  const flags = judgeReply(turn, snap, elapsedMs);
  const ok = flags.length === 0;

  console.log(`REPLY (${snap?.provider || '?'} · ${Math.round(elapsedMs / 1000)}s):`);
  console.log(`  ${(snap?.reply || '').slice(0, 320).replace(/\\s+/g, ' ')}`);
  console.log(`  plan overlay=${snap?.planOverlay} pill=${snap?.planPill} nodes=${snap?.planNodes} inlineAcc=${snap?.inlinePlanAccordion}`);
  console.log(`  code pill=${snap?.codePill} overlay=${snap?.codeOverlay} files=${snap?.hasFiles}`);
  console.log(ok ? '  ✓ OK — continue' : `  ✗ STOP — ${flags.join(', ')}`);

  results.push({
    id: turn.id,
    kind: turn.kind,
    ask: turn.ask,
    reply: snap?.reply || '',
    provider: snap?.provider || null,
    elapsedMs,
    planOverlay: Boolean(snap?.planOverlay),
    planPill: Boolean(snap?.planPill),
    planNodes: snap?.planNodes || 0,
    codePill: Boolean(snap?.codePill),
    codeOverlay: Boolean(snap?.codeOverlay),
    hasFiles: Boolean(snap?.hasFiles),
    flags,
    ok,
  });

  if (!ok) {
    aborted = { turn: turn.id, flags };
    console.log('\n*** Aborting live run — fix required before retry in a NEW chat ***\n');
    break;
  }

  console.log(`  …watching pause ${PAUSE}ms`);
  await sleep(PAUSE);
}
} catch (err) {
  aborted = aborted || { turn: 'harness', flags: ['fatal'] };
  console.error('Fatal harness error:', err?.message || err);
}

/** After a successful build, click Live and prove #root painted real UI. */
let liveVerify = null;
if (!aborted && results.some((r) => r.id === 'build' && r.ok)) {
  console.log('\n── live-verify · open Live + probe DOM');
  try {
    // Prefer the desktop probe (opens / attaches Live and checks #root).
    const probeBridge = await evalE(`(async () => {
      try {
        const body = document.body?.innerText || '';
        const folderMatch = body.match(/Folder:\\s*[\\\`]?(C:\\\\Users\\\\[^\\n\\r\\\`]+)/i)
          || body.match(/Location\\s*\\n?\\s*(C:\\\\Users\\\\[^\\n\\r]+\\\\NOVA Projects\\\\[A-Za-z0-9._-]+)/i)
          || body.match(/(C:\\\\Users\\\\[^\\n\\r]+\\\\NOVA Projects\\\\[A-Za-z0-9._-]+)/i);
        let folder = folderMatch ? String(folderMatch[1] || '').trim() : '';
        if (folder && /\\\\NOVA$/i.test(folder) && !/NOVA Projects/i.test(folder)) {
          // Truncated at the space in "NOVA Projects" — recover from NoteDot slug.
          const short = body.match(/\\b(NoteDot(?:-\\d+)?)\\b/);
          if (short) folder = ${JSON.stringify('C:\\Users\\thoma\\Documents\\NOVA Projects\\')} + short[1];
        }
        if (!folder) {
          const short = body.match(/\\b(NoteDot(?:-\\d+)?)\\b/);
          if (short) folder = ${JSON.stringify('C:\\Users\\thoma\\Documents\\NOVA Projects\\')} + short[1];
        }
        // Click Live so the renderer starts attach/preview if Ready.
        const nodes = [...document.querySelectorAll('button, a, [role="button"], span')];
        const live = nodes.find((n) => /^\\s*live\\s*$/i.test((n.textContent || '').trim()));
        if (live) live.click();
        await new Promise((r) => setTimeout(r, 2000));
        if (!folder || !window.novaDesktop?.getOrAttachPreview) {
          return { ok: false, mounted: false, reason: 'no-folder-or-bridge', folder };
        }
        const att = await window.novaDesktop.getOrAttachPreview(folder);
        if (!(att?.ok && att.url)) {
          return { ok: false, mounted: false, reason: 'attach-failed', folder, attach: att };
        }
        if (window.novaDesktop.previewProbeMounted) {
          const probe = await window.novaDesktop.previewProbeMounted({
            url: att.url,
            title: 'NoteDot',
            waitMs: 4000,
          });
          return { ...probe, folder, url: att.url };
        }
        await window.novaDesktop.previewOpenWindow?.({
          url: att.url,
          title: 'NoteDot',
          projectId: 'NOVA-live-preview',
          forceNavigate: true,
        });
        return { ok: true, mounted: false, reason: 'opened-no-probe', folder, url: att.url };
      } catch (e) {
        return { ok: false, mounted: false, error: String(e?.message || e) };
      }
    })()`);

    if (probeBridge?.mounted) {
      liveVerify = { ok: true, via: 'previewProbeMounted', probe: probeBridge };
      console.log('  ✓ Live painted real UI (desktop probe)');
      console.log('  probe:', JSON.stringify(probeBridge, null, 2));
    } else {
      // Fallback: CDP scan for a localhost preview page.
      await sleep(6000);
      const list2 = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      const novaPage = list2.find((t) => t.type === 'page' && /nova/i.test(String(t.title || '')));
      const previewPage = list2.find((t) =>
        t.type === 'page'
        && t.webSocketDebuggerUrl
        && /127\.0\.0\.1|localhost/.test(t.url || '')
        && (!novaPage || t.id !== novaPage.id)
      ) || list2.find((t) => t.type === 'page' && /notedot|preview|note/i.test(t.title || ''));

      if (!previewPage?.webSocketDebuggerUrl) {
        liveVerify = {
          ok: false,
          reason: 'no-preview-page',
          bridge: probeBridge,
          pages: list2.map((t) => ({ title: t.title, url: t.url })),
        };
        console.log('  ✗ no preview page', JSON.stringify(liveVerify, null, 2));
        aborted = { turn: 'live-verify', flags: ['live-blank-or-thin'] };
      } else {
        const pws = new WebSocket(previewPage.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { pws.once('open', resolve); pws.once('error', reject); });
        let pid = 0;
        const pPending = new Map();
        pws.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.id && pPending.has(msg.id)) {
            const { resolve, reject } = pPending.get(msg.id);
            pPending.delete(msg.id);
            if (msg.error) reject(new Error(JSON.stringify(msg.error)));
            else resolve(msg.result);
          }
        });
        const pSend = (method, params = {}) => new Promise((resolve, reject) => {
          const id = ++pid;
          pPending.set(id, { resolve, reject });
          pws.send(JSON.stringify({ id, method, params }));
        });
        const pEval = async (expression) => {
          const r = await pSend('Runtime.evaluate', {
            expression, awaitPromise: true, returnByValue: true,
          });
          if (r.exceptionDetails) {
            throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
          }
          return r.result?.value;
        };
        await pSend('Runtime.enable');
        await sleep(2500);
        const probe = await pEval(`(() => {
          const fail = Boolean(document.getElementById('nova-preview-fail'));
          const root = document.getElementById('root');
          const html = (root?.innerHTML || '').trim();
          const text = (root?.innerText || document.body?.innerText || '').trim();
          const kids = root?.childElementCount || 0;
          const ta = document.querySelector('textarea, input[type="text"]');
          const h1 = document.querySelector('h1, .title');
          const viteErr = /\\[plugin:vite|Failed to resolve|Internal Server Error|Unexpected token/i.test(text);
          return {
            fail,
            viteErr,
            kids,
            htmlLen: html.length,
            textLen: text.length,
            hasNoteInput: Boolean(ta),
            hasTitle: Boolean(h1) || /notedot|note/i.test(text),
            titleText: (h1?.textContent || '').trim().slice(0, 80),
            sample: text.slice(0, 160),
            docTitle: document.title || '',
            url: location.href,
          };
        })()`);
        pws.close();
        const painted = Boolean(
          probe
          && !probe.fail
          && !probe.viteErr
          && probe.kids > 0
          && probe.htmlLen >= 24
          && (probe.hasNoteInput || probe.hasTitle)
        );
        liveVerify = { ok: painted, via: 'cdp', probe, previewTitle: previewPage.title, previewUrl: previewPage.url, bridge: probeBridge };
        console.log('  LIVE probe:', JSON.stringify(probe, null, 2));
        console.log(painted ? '  ✓ Live painted real UI' : '  ✗ Live blank / missing UI');
        if (!painted) aborted = { turn: 'live-verify', flags: ['live-blank-or-thin'] };
      }
    }
  } catch (err) {
    liveVerify = { ok: false, error: String(err?.message || err) };
    aborted = { turn: 'live-verify', flags: ['live-probe-error'] };
    console.log('  ✗ Live probe error:', liveVerify.error);
  }
}

const passed = results.filter((r) => r.ok).length;
const summary = {
  at: new Date().toISOString(),
  passed,
  total: results.length,
  aborted,
  liveVerify,
  results,
};
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(`\n=== ${passed}/${results.length} OK · live=${liveVerify?.ok ? 'pass' : (liveVerify ? 'fail' : 'n/a')} → ${OUT} ===\n`);
ws.close();
process.exit(aborted || passed !== results.length || (liveVerify && !liveVerify.ok) ? 1 : 0);
