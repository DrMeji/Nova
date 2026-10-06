/**
 * Live talk-only conversation for watching — no builds.
 * Greeting → chat → hard math → goal setup → follow-ups.
 * CDP: NOVA_CDP_PORT (default 9229)
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const PAUSE = Number(process.env.NOVA_WATCH_PAUSE_MS || 4500);
const TURN_MS = Number(process.env.NOVA_TURN_TIMEOUT_MS || 90000);
const OUT = path.join(__dirname, '_live-talk-watch-out.json');
const LOG = path.join(__dirname, '_live-talk-watch-out.txt');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TURNS = [
  {
    id: 'greet',
    ask: "Hey Nova — I'm just hanging out tonight, not trying to build anything. How's your evening going?",
  },
  {
    id: 'smalltalk',
    ask: "Honestly mine's a mix of tired and wired. What's one low-effort thing people underestimate for winding down?",
  },
  {
    id: 'complex-opinion',
    ask: "Okay, more serious for a second: if someone keeps starting ambitious side projects and abandoning them after two weeks, what's usually the real problem — motivation, scope, or identity? Give me a nuanced take, not a slogan.",
  },
  {
    id: 'math-hard',
    ask: "Math check — no coding. A train leaves City A at 09:15 traveling east at 72 km/h. Another leaves City B (216 km east of A) at 09:45 traveling west at 84 km/h on the same track. At what clock time do they meet, and how far from City A is the meeting point? Show the work briefly.",
  },
  {
    id: 'math-follow',
    ask: "Quick confirm: what meeting time did you get, and distance from A? One short line each.",
  },
  {
    id: 'goal-setup',
    ask: "Switching gears — I want help setting a personal goal. I've been meaning to get back into reading fiction, but I scroll my phone instead. Can you help me set a realistic 4-week goal, with weekly checkpoints, and one rule that keeps it from becoming another abandoned project?",
  },
  {
    id: 'goal-obstacle',
    ask: "Week 1 usually fails because I get home late and my brain is fried. How should we adjust the goal for those nights without quitting the whole plan?",
  },
  {
    id: 'memory-goal',
    ask: "Without me restating it — what 4-week reading goal did we just settle on?",
  },
  {
    id: 'wrap',
    ask: "Thanks. One last thing: in two sentences, what should I do tomorrow night if I only have 12 free minutes?",
  },
];

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  fs.appendFileSync(LOG, `${line}\n`);
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

function judgeReply(ask, reply, id) {
  const t = String(reply || '').trim();
  const flags = [];
  if (!t || t.length < 12) flags.push('empty-or-thin');
  if (/@@@FILE\b|<!DOCTYPE html|vite\s*\+|createReact|scaffold/i.test(t)) flags.push('build-bleed');
  if (/<!--nova-plan-report-->|Habit Tracker Build Plan|\.nova-plan-flow/i.test(t)) flags.push('plan-card');
  if (/Loading coder|Bound click-counter|Let's build|Get it Live/i.test(t)) flags.push('create-push');
  if (/(.)\1{40,}/.test(t)) flags.push('runaway-repeat');
  if (/%[0-9a-fA-F]{2}/.test(t) && (t.match(/%[0-9a-fA-F]{2}/g) || []).length >= 12) flags.push('token-garbage');

  if (id === 'math-hard' || id === 'math-follow') {
    // Expected: leave A 09:15 @72, B 09:45 @84, gap 216.
    // At 09:45 A has already gone 72*0.5=36km → remaining 180km.
    // Closing 72+84=156 km/h → 180/156 ≈ 1.1538h ≈ 1h 9.2m → meet ≈ 10:54.
    // Distance from A: 72*(1.5+1.1538) or 36+72*1.1538 ≈ 119.1 km.
    const hasTime = /10\s*[:.]?\s*5[0-9]|10\s*h|ten\s*(?:fifty|fifty-)/i.test(t);
    const hasDist = /11[89]|120|119/.test(t);
    if (!hasTime) flags.push('math-time-miss');
    if (id === 'math-hard' && !hasDist && !/km|kilomet/i.test(t)) flags.push('math-distance-miss');
  }
  if (id === 'goal-setup' && !/week|read|page|chapter|minute/i.test(t)) flags.push('goal-thin');
  if (id === 'memory-goal' && !/read|fiction|week|page|chapter|minute|book/i.test(t)) flags.push('missed-goal-memory');
  if (id === 'wrap' && /build|website|app|scaffold/i.test(t) && !/read|book|phone|minute/i.test(t)) {
    flags.push('wrap-build-push');
  }
  return flags;
}

async function waitForCdp(maxMs = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      if (Array.isArray(list) && list.some((t) => t.type === 'page')) return list;
    } catch { /* not up */ }
    await sleep(2000);
  }
  throw new Error(`CDP not ready on ${PORT}`);
}

async function connect() {
  const list = await waitForCdp(5000);
  const page = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''))
    || list.find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('no NOVA page');
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

fs.writeFileSync(LOG, '');
log('\n=== LIVE TALK WATCH (no builds) — new chat ===\n');
log(`CDP ${PORT} · pause ${PAUSE}ms · turn budget ${TURN_MS}ms`);

await waitForCdp(180000);
let { ws, send, evalE } = await connect();
await send('Page.enable');
await send('Runtime.enable');
try { await send('Page.bringToFront'); } catch { /* ok */ }

log('Fresh reload + NEW chat…');
await send('Page.reload', { ignoreCache: true });
await sleep(4500);
ws.close();
({ ws, send, evalE } = await connect());
await send('Page.enable');
await send('Runtime.enable');
try { await send('Page.bringToFront'); } catch { /* ok */ }

await evalE(`(() => {
  try {
    for (const k of Object.keys(localStorage)) {
      if (/composer-mode|plan-nudge|active-plan/i.test(k)) localStorage.removeItem(k);
    }
  } catch {}
  window.dispatchEvent(new CustomEvent('NOVA:new-chat'));
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
  await sleep(400);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(500);
  if (await evalE(`(document.querySelector('textarea')?.value || '').length > 8`)) {
    await evalE(`document.querySelector('textarea')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  }
}

async function waitAndCapture(ask) {
  const askLit = JSON.stringify(ask);
  const t0 = Date.now();
  let last = null;
  let sawStop = false;
  while (Date.now() - t0 < TURN_MS) {
    const s = await evalE(`(() => {
      const stop = [...document.querySelectorAll('button')].some(b =>
        /stop generating/i.test(b.getAttribute('aria-label') || b.title || '')
      );
      const body = document.body?.innerText || '';
      const askNorm = ${askLit}.replace(/[\\u2014\\u2013\\u2212]/g, '-');
      const bodyNorm = body.replace(/[\\u2014\\u2013\\u2212]/g, '-');
      let idx = bodyNorm.lastIndexOf(askNorm);
      if (idx < 0) {
        const head = ${JSON.stringify(ask.slice(0, 48).replace(/[\u2014\u2013\u2212]/g, '-'))};
        idx = bodyNorm.lastIndexOf(head);
      }
      const slice = idx >= 0 ? body.slice(idx) : body.slice(-2000);
      let after = slice.slice(${ask.length});
      after = after.split(/\\n(?:Ask a question|Multimodal|0%)/)[0] || after;
      const doneParts = after.split(/\\nDone\\n/);
      if (doneParts.length >= 2) after = doneParts[doneParts.length - 1];
      const provider = (after.match(/\\d+(?:\\.\\d+)?\\s*s\\s*[·•]\\s*[^\\n]{3,60}/) || [])[0] || null;
      const planCard = Boolean(document.querySelector('.nova-plan-flow'));
      let reply = after
        .replace(/^\\s*(?:Done|Reading your message|Thinking…?|Refocusing…?)\\s*/i, '')
        .replace(/\\d+(?:\\.\\d+)?\\s*s\\s*[·•][^\\n]+/g, '')
        .trim();
      return { stop, provider, planCard, reply: reply.slice(0, 1800), len: reply.length };
    })()`);
    last = s;
    if (s.stop) sawStop = true;
    const elapsed = Date.now() - t0;
    process.stdout.write(`\r  … ${Math.round(elapsed / 1000)}s stop=${s.stop} len=${s.len}   `);
    if (sawStop && !s.stop && s.len > 40 && elapsed > 5000) {
      await sleep(1600);
      const s2 = await evalE(`(() => {
        const stop = [...document.querySelectorAll('button')].some(b =>
          /stop generating/i.test(b.getAttribute('aria-label') || b.title || '')
        );
        return { stop };
      })()`);
      if (!s2.stop) break;
    }
    if (elapsed > 28000 && !s.stop && s.len > 50) break;
    await sleep(1200);
  }
  process.stdout.write('\n');
  await sleep(700);
  return last;
}

const results = [];
for (let i = 0; i < TURNS.length; i++) {
  const turn = TURNS[i];
  log(`\n── ${i + 1}/${TURNS.length} · ${turn.id}`);
  log(`ASK: ${turn.ask}`);
  try { await send('Page.bringToFront'); } catch { /* ok */ }
  await typeAndSend(turn.ask);
  const snap = await waitAndCapture(turn.ask);
  const flags = judgeReply(turn.ask, snap?.reply, turn.id);
  if (snap?.planCard) flags.push('plan-card-dom');
  const ok = flags.length === 0;
  log(`REPLY (${snap?.provider || '?'}): ${(snap?.reply || '').slice(0, 360).replace(/\s+/g, ' ')}`);
  log(ok ? '  ✓ OK' : `  ✗ ${flags.join(', ')}`);
  results.push({
    id: turn.id,
    ask: turn.ask,
    reply: snap?.reply || '',
    provider: snap?.provider || null,
    flags,
    ok,
  });
  await sleep(PAUSE);
  if (/goal|week|obstacle|math/i.test(turn.id)) await sleep(2000);
}

const passed = results.filter((r) => r.ok).length;
const summary = { at: new Date().toISOString(), passed, total: results.length, results };
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
log(`\n=== ${passed}/${results.length} OK → ${OUT} ===\n`);
ws.close();
process.exit(passed === results.length ? 0 : 1);
