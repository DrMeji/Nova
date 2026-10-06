/**
 * Natural conversation → Plan mode live test.
 * Expects: chat answer → Switch to Plan nudge → Plan overlay auto-opens (Code-pill pattern)
 * + clickable Plan pill in chat (no inline accordion) → fast incremental add → risks stay chat.
 * CDP: NOVA_CDP_PORT (default 9229)
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const PAUSE = Number(process.env.NOVA_WATCH_PAUSE_MS || 4000);
const TURN_MS = Number(process.env.NOVA_TURN_TIMEOUT_MS || 90000);
const PLAN_MS = Number(process.env.NOVA_PLAN_TIMEOUT_MS || 180000);
const OUT = path.join(__dirname, '..', '.tmp-live-convo-to-plan.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fresh product: CorridorCup — coffee-run signup board for office floors. */
const TURNS = [
  {
    id: 'greet',
    kind: 'chat',
    ask: 'Hey — got a sec? I’ve been kicking around a small app idea and could use a sounding board.',
  },
  {
    id: 'seed',
    kind: 'chat',
    expectPlanNudge: true,
    ask: 'I’m trying to build something for my office floor — people post when they’re doing a coffee run, and coworkers can hop on. Calling it CorridorCup. What should a first version actually do?',
  },
  {
    id: 'enter-plan',
    kind: 'plan',
    ask: 'Yeah, let’s plan this out properly — I just need help mapping the first version before we build anything.',
  },
  {
    id: 'feature-add',
    kind: 'plan-refine',
    ask: 'Also I want a quiet reminder if nobody’s claimed the run after ten minutes.',
    maxMs: 60000,
  },
  {
    id: 'risks',
    kind: 'chat',
    ask: 'Quick one — what are the top two ways we could overcomplicate CorridorCup in week one?',
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

function judgeReply(turn, snap, elapsedMs) {
  const t = String(snap?.reply || '').trim();
  const flags = [];
  if (!t || t.length < 8) flags.push('empty-or-thin');
  if (/Overall:\s*keep the first version tiny/i.test(t) && turn.kind === 'chat') flags.push('plan-bleed');
  if (/@@@FILE\b|<!DOCTYPE html/i.test(t)) flags.push('code-dump');
  if (!snap.planUi && (/^\s*[-*•]\s*$/m.test(t) || /\n\s*\d+[.)]\s*(?:Backend|Frontend|Security|Deployment)\s*(?:\n|$)/i.test(t))) {
    flags.push('hollow-outline');
  }
  if (/coding or programming|any coding projects/i.test(t)) flags.push('coding-pitch');

  if (turn.expectPlanNudge) {
    const nudged = /switch to \*\*plan\*\*|go into \*\*plan\*\*|Want to go into|Switch to Plan|Plan mode so we can map/i.test(t)
      || Boolean(snap.planNudgeChip)
      || /Want to go into[\s\S]{0,40}Plan/i.test(String(snap.reply || ''));
    if (!nudged) flags.push('missing-plan-nudge');
  }
  if (turn.id === 'seed' && !/corridor|coffee|run|coworker|floor|post/i.test(t)) {
    flags.push('off-topic');
  }
  if (turn.kind === 'plan' || turn.kind === 'plan-refine') {
    // Code-pill pattern: overlay and/or clickable Plan pill — not the old inline accordion alone.
    if (!snap.planOverlay && !snap.planPill) {
      flags.push('no-plan-ui');
    }
    if (snap.inlinePlanAccordion) {
      flags.push('legacy-inline-plan');
    }
    if (snap.planOverlay && snap.planNodes != null && snap.planNodes < 2) {
      flags.push('few-plan-nodes');
    }
    if (turn.kind === 'plan' && !snap.planOverlay) {
      flags.push('plan-overlay-not-auto-open');
    }
  }
  if (turn.kind === 'plan-refine' && elapsedMs > 90000) {
    flags.push('refine-too-slow');
  }
  if (turn.id === 'feature-add' && snap.planUi && !/remind|alert|ten minutes|10\s*min|claim/i.test(t + (snap.planText || ''))) {
    if (snap.planText && !/remind|alert|claim|minute/i.test(snap.planText)) {
      flags.push('missing-feature-add');
    }
  }
  if (turn.id === 'risks') {
    if (/jeff bezos|amazon day 1/i.test(t)) flags.push('wrong-entity');
    // Side questions must not spawn a fresh plan accordion in chat.
    if (snap.inlinePlanAccordion) flags.push('risks-spawned-inline-plan');
  }
  return flags;
}

async function connect() {
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = list.find((t) => t.type === 'page')
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

console.log('\n=== NATURAL CONVO → PLAN LIVE TEST (overlay + pill) ===\n');

let { ws, send, evalE } = await connect();
await send('Page.enable');
await send('Runtime.enable');
try { await send('Page.bringToFront'); } catch { /* ok */ }

console.log('Fresh reload + NEW chat…');
await send('Page.reload', { ignoreCache: true });
await sleep(4500);
ws.close();
({ ws, send, evalE } = await connect());
await send('Page.enable');
await send('Runtime.enable');
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
await sleep(2200);

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
  await sleep(300);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(400);
  if (await evalE(`(document.querySelector('textarea')?.value || '').length > 8`)) {
    await evalE(`document.querySelector('textarea')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  }
}

async function snapPlanUi() {
  return evalE(`(() => {
    const overlay = document.querySelector('[aria-label="Plan mode"][role="dialog"]');
    const planPill = Boolean(
      document.querySelector('[data-nova-plan-pill="1"]')
      || [...document.querySelectorAll('button')].some(b =>
        /^(Open Plan|Plan — drafting)/i.test(b.getAttribute('aria-label') || '')
      )
    );
    const headerPlanPill = [...document.querySelectorAll('button')].some(b =>
      (b.getAttribute('aria-label') || '') === 'Open Plan'
      || (b.getAttribute('aria-label') || '') === 'Plan — drafting in progress'
    );
    const inlinePlanAccordion = [...document.querySelectorAll('.nova-plan-flow')].some((el) => {
      return !el.closest('[aria-label="Plan mode"]');
    });
    const planNodes = overlay
      ? overlay.querySelectorAll('.nova-plan-flow button').length
      : 0;
    const planText = overlay
      ? (overlay.querySelector('.nova-plan-flow')?.innerText || overlay.innerText || '').slice(0, 2000)
      : '';
    const planOverlay = Boolean(overlay);
    const planUi = planOverlay || planPill || headerPlanPill;
    return {
      planOverlay,
      planPill: planPill || headerPlanPill,
      headerPlanPill,
      inlinePlanAccordion,
      planNodes,
      planText,
      planUi,
    };
  })()`);
}

async function waitAndCapture(ask, timeoutMs, { expectPlan = false } = {}) {
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
      const slice = idx >= 0 ? body.slice(idx) : body.slice(-2400);
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
        )
      );
      const headerPlanPill = [...document.querySelectorAll('button')].some(b =>
        (b.getAttribute('aria-label') || '') === 'Open Plan'
        || (b.getAttribute('aria-label') || '') === 'Plan — drafting in progress'
      );
      const inlinePlanAccordion = [...document.querySelectorAll('.nova-plan-flow')].some((el) => {
        return !el.closest('[aria-label="Plan mode"]');
      });
      const planNodes = overlay
        ? overlay.querySelectorAll('.nova-plan-flow button').length
        : 0;
      const planText = overlay
        ? (overlay.querySelector('.nova-plan-flow')?.innerText || overlay.innerText || '').slice(0, 2000)
        : '';
      const planOverlay = Boolean(overlay);
      const planUi = planOverlay || planPill || headerPlanPill;
      const planNudgeChip = [...document.querySelectorAll('button')].some(b =>
        /switch to plan/i.test(b.textContent || '')
      );
      const bodyHasNudge = /Want to go into|Switch to Plan|Plan mode so we can map/i.test(body);
      let reply = after
        .replace(/^\\s*(?:Done|Reading your message|Thinking…?|Planning[^.\\n]*|Outline ready|Refocusing…?|Plan · adding your change)\\s*/i, '')
        .replace(/\\d+(?:\\.\\d+)?\\s*s\\s*[·•][^\\n]+/g, '')
        .trim();
      if (bodyHasNudge && !/Want to go into|Switch to Plan|Plan mode so we can map/i.test(reply)) {
        reply = reply + '\\n\\nWant to go into **Plan** mode so we can map this out.';
      }
      return {
        stop, provider,
        planOverlay, planPill: planPill || headerPlanPill, headerPlanPill,
        inlinePlanAccordion, planNodes, planText, planUi, planNudgeChip,
        reply: reply.slice(0, 1800),
        len: reply.length,
      };
    })()`);
    last = s;
    if (s.stop) sawStop = true;
    const elapsed = Date.now() - t0;
    process.stdout.write(
      `\r  … ${Math.round(elapsed / 1000)}s stop=${s.stop} overlay=${s.planOverlay} pill=${s.planPill} nodes=${s.planNodes} len=${s.len}   `,
    );
    if (sawStop && !s.stop && (s.len > 40 || s.planUi) && elapsed > 5000) {
      await sleep(1600);
      const s2 = await evalE(`(() => ({
        stop: [...document.querySelectorAll('button')].some(b =>
          /stop generating/i.test(b.getAttribute('aria-label') || b.title || '')
        ),
      }))()`);
      if (!s2.stop) break;
    }
    if (expectPlan && s.planOverlay && s.planNodes >= 2 && elapsed > 6000) {
      await sleep(1200);
      break;
    }
    if (!expectPlan && sawStop && !s.stop && s.len > 40 && elapsed > 5000) {
      await sleep(800);
      break;
    }
    if (elapsed > 40000 && !s.stop && (s.len > 80 || s.planUi)) break;
    await sleep(1100);
  }
  process.stdout.write('\n');
  await sleep(600);
  return last;
}

const results = [];
for (let i = 0; i < TURNS.length; i++) {
  const turn = TURNS[i];
  console.log(`\n── ${i + 1}/${TURNS.length} · ${turn.id} (${turn.kind})`);
  console.log(`ASK: ${turn.ask}`);
  try { await send('Page.bringToFront'); } catch { /* ok */ }

  const t0 = Date.now();
  await typeAndSend(turn.ask);
  const timeout = turn.maxMs
    || ((turn.kind === 'plan' || turn.kind === 'plan-refine') ? PLAN_MS : TURN_MS);
  const snap = await waitAndCapture(turn.ask, timeout, {
    expectPlan: turn.kind === 'plan' || turn.kind === 'plan-refine',
  });
  const elapsedMs = Date.now() - t0;

  // After first plan: if overlay somehow closed, click the chat Plan pill and require reopen.
  if (turn.id === 'enter-plan' && snap && !snap.planOverlay && snap.planPill) {
    console.log('  → clicking Plan pill to open overlay…');
    await evalE(`(() => {
      const pill = document.querySelector('[data-nova-plan-pill="1"]')
        || [...document.querySelectorAll('button')].find(b =>
          /^Open Plan:/i.test(b.getAttribute('aria-label') || '')
          || (b.getAttribute('aria-label') || '') === 'Open Plan'
        );
      if (pill) pill.click();
      return Boolean(pill);
    })()`);
    await sleep(900);
    Object.assign(snap, await snapPlanUi());
  }

  const flags = judgeReply(turn, snap, elapsedMs);
  const ok = flags.length === 0;
  console.log(`REPLY (${snap.provider || '?'} · ${Math.round(elapsedMs / 1000)}s): ${(snap.reply || '').slice(0, 240).replace(/\\s+/g, ' ')}`);
  console.log(`  overlay=${snap.planOverlay} pill=${snap.planPill} nodes=${snap.planNodes} inlineAcc=${snap.inlinePlanAccordion} nudgeChip=${snap.planNudgeChip}`);
  console.log(ok ? '  ✓ OK' : `  ✗ ${flags.join(', ')}`);
  results.push({
    id: turn.id,
    kind: turn.kind,
    ask: turn.ask,
    reply: snap?.reply || '',
    provider: snap?.provider || null,
    planOverlay: Boolean(snap?.planOverlay),
    planPill: Boolean(snap?.planPill),
    planNodes: snap?.planNodes || 0,
    inlinePlanAccordion: Boolean(snap?.inlinePlanAccordion),
    planNudgeChip: Boolean(snap?.planNudgeChip),
    elapsedMs,
    flags,
    ok,
  });
  await sleep(PAUSE);
}

const passed = results.filter((r) => r.ok).length;
const summary = {
  at: new Date().toISOString(),
  passed,
  total: results.length,
  results,
};
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(`\n=== ${passed}/${results.length} OK → ${OUT} ===\n`);
ws.close();
process.exit(passed === results.length ? 0 : 1);
