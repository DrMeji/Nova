/**
 * Conversation-only live test — no builds, no HTML toys.
 * Normal + complex chat. Color is ASKED (not planted), then recalled later.
 * Always starts a brand-new chat. Judges each reply for quality.
 * CDP: NOVA_CDP_PORT (default 9229)
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const PAUSE = Number(process.env.NOVA_WATCH_PAUSE_MS || 3500);
const TURN_MS = Number(process.env.NOVA_TURN_TIMEOUT_MS || 60000);
const OUT = path.join(__dirname, '..', '.tmp-live-convo-only.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Teal accent ask → deterministic #008080 (colorCodeAsk). Recall must match that. */
const EXPECTED_COLOR_HEX = /#008080\b/i;

const TURNS = [
  // —— Normal conversation (all new asks) ——
  { id: 'greet', ask: 'Hi Nova — hope you’re well. What’s one small thing that made today decent so far?' },
  { id: 'brazil', ask: 'Quick fact: what is the capital of Brazil?' },
  { id: 'brasilia-more', ask: 'One cool detail about that city in two sentences max.' },
  { id: 'mac-howto', ask: 'How do I pin an app to the Dock on a Mac? Keep it under five steps.' },
  // Ask for a color (do NOT plant the hex) — later recall must pull what Nova gave.
  { id: 'color-ask', ask: 'What’s a good teal accent color hex code I could use?' },
  // Topic switch before a long advice turn.
  { id: 'breath', ask: 'Switching topics - give me one simple breathing exercise for feeling wired at night.' },
  { id: 'hobby', ask: 'I’ve been thinking about starting a tiny balcony garden. What’s one beginner-friendly plant for that?' },
  { id: 'habit-talk', ask: 'I want a habit of going to bed 30 minutes earlier. Walk me through a gentle first week — no apps, no files, just advice.' },
  // —— Memory probes ——
  { id: 'memory-color', ask: 'Hey, remember the color code I asked for earlier? What was it?' },
  { id: 'memory-habit', ask: 'And what habit were we talking about improving?' },
  { id: 'memory-plant', ask: 'What plant did you suggest for the balcony earlier?' },
  // —— Complex conversation (still no build) ——
  { id: 'opinion', ask: 'For learning a language as an adult, is daily 15 minutes better than two long weekend sessions? Short take with one reason each way.' },
  {
    id: 'complex-plan',
    ask: 'I get Saturday mornings free for about 90 minutes. Help me sketch a simple weekend rhythm that mixes reading one chapter and a short outdoor walk — no apps, no trackers, just a two-week outline.',
  },
  {
    id: 'complex-tradeoff',
    ask: 'If a busy Saturday only allows one of those two (read or walk), which should I protect first and why? Two sentences.',
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

function judgeReply(ask, reply, id) {
  const t = String(reply || '').trim();
  const flags = [];
  if (!t || t.length < 8) flags.push('empty-or-thin');
  if (/%[0-9a-fA-F]{2}/.test(t) && (t.match(/%[0-9a-fA-F]{2}/g) || []).length >= 12) flags.push('token-garbage');
  if (/(?:fff\d{4,}){8,}/i.test(t)) flags.push('hex-garbage');
  if (/Overall:\s*keep the first version tiny/i.test(t)) flags.push('plan-bleed');
  if (/<!--nova-plan-report-->|Habit Tracker Build Plan/i.test(t)) flags.push('plan-card');
  if (/@@@FILE\b|<!DOCTYPE html/i.test(t)) flags.push('code-dump');
  if (/coding or programming|dive deeper (?:in|into) coding|feel free to ask.*cod|help with coding|related to coding|questions about coding|any coding projects/i.test(t)) {
    flags.push('coding-pitch');
  }
  if (/Loading coder|Bound click-counter|Style\s*[·•]/i.test(t)) flags.push('create-hang');
  if (/(.)\1{40,}/.test(t)) flags.push('runaway-repeat');
  if (/[\u4e00-\u9fff]{8,}/.test(t) && !/[\u4e00-\u9fff]/.test(ask)) flags.push('unexpected-cjk');
  if (id === 'greet' && /coding project|programming project|excited about today/i.test(t)) {
    flags.push('coding-pitch');
  }
  if (id === 'color-ask' && !EXPECTED_COLOR_HEX.test(t) && !/\bteal\b/i.test(t)) {
    flags.push('missed-color-answer');
  }
  // Recall must cite the hex Nova already gave (not invent a new one).
  if (id === 'memory-color' && !EXPECTED_COLOR_HEX.test(t) && !/\bteal\b/i.test(t)) {
    flags.push('missed-color-memory');
  }
  if (id === 'memory-habit' && !/bed|sleep|earlier|night/i.test(t)) flags.push('missed-habit-memory');
  if (id === 'memory-plant' && !/plant|herb|basil|mint|tomato|lettuce|succulent|pepper|chive|parsley|rosemary|lavender|fern|spider|pothos|balcony|garden/i.test(t)) {
    flags.push('missed-plant-memory');
  }
  if (id === 'brazil' && !/bras[ií]lia/i.test(t)) flags.push('wrong-fact');
  if (id === 'breath') {
    const priorHeavy = /\bteal|hex|#008080|balcony|garden|plant|Dock|Mac\b/i.test(t.slice(0, 220));
    const breathLead = /\b(?:breath|inhale|exhale|box breath|4-?7-?8|calm|nose|count)\b/i.test(t.slice(0, 220));
    if ((priorHeavy && !breathLead) || /^[a-z]/.test(t)) flags.push('topic-bleed');
  }
  // Memory ack must not drag prior how-tos back in.
  if ((id === 'color-ask' || id === 'memory-color') && /Dock|default browser|Windows\s*11/i.test(t) && !/color|hex|teal/i.test(t)) {
    flags.push('topic-bleed');
  }
  if (id === 'complex-plan' && /create (?:a )?(?:file|folder|app)|scaffold|vite|react/i.test(t)) {
    flags.push('build-push');
  }
  return flags;
}

async function connect() {
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
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

console.log('\n=== CONVERSATION-ONLY LIVE TEST (new chat) ===\n');

let { ws, send, evalE } = await connect();
await send('Page.enable');
await send('Runtime.enable');
try { await send('Page.bringToFront'); } catch { /* ok */ }

console.log('Fresh reload + NEW chat (not resume)…');
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
        const head = ${JSON.stringify(ask.slice(0, 40).replace(/[\u2014\u2013\u2212]/g, '-'))};
        idx = bodyNorm.lastIndexOf(head);
      }
      const slice = idx >= 0 ? body.slice(idx) : body.slice(-1800);
      let after = slice.slice(${ask.length});
      after = after.split(/\\n(?:Ask a question|Multimodal|0%)/)[0] || after;
      // Prefer text after the last Done marker for this turn.
      const doneParts = after.split(/\\nDone\\n/);
      if (doneParts.length >= 2) after = doneParts[doneParts.length - 1];
      const provider = (after.match(/\\d+(?:\\.\\d+)?\\s*s\\s*[·•]\\s*[^\\n]{3,60}/) || [])[0] || null;
      const planCard = Boolean(document.querySelector('.nova-plan-flow'));
      let reply = after
        .replace(/^\\s*(?:Done|Reading your message|Thinking…?|Refocusing…?)\\s*/i, '')
        .replace(/\\d+(?:\\.\\d+)?\\s*s\\s*[·•][^\\n]+/g, '')
        .trim();
      if (/^Chat\\s+WORK\\s+Projects/i.test(reply)) {
        const doneIdx = reply.search(/\\nDone\\n/);
        if (doneIdx >= 0) reply = reply.slice(doneIdx + 6).trim();
      }
      return { stop, provider, planCard, reply: reply.slice(0, 1500), len: reply.length };
    })()`);
    last = s;
    if (s.stop) sawStop = true;
    const elapsed = Date.now() - t0;
    process.stdout.write(`\r  … ${Math.round(elapsed / 1000)}s stop=${s.stop} len=${s.len}   `);
    if (sawStop && !s.stop && s.len > 40 && elapsed > 5000) {
      await sleep(1500);
      const s2 = await evalE(`(() => {
        const stop = [...document.querySelectorAll('button')].some(b =>
          /stop generating/i.test(b.getAttribute('aria-label') || b.title || '')
        );
        return { stop, len: (document.body?.innerText || '').length };
      })()`);
      if (!s2.stop) break;
    }
    if (elapsed > 25000 && !s.stop && s.len > 40) break;
    await sleep(1200);
  }
  process.stdout.write('\n');
  await sleep(600);
  return last;
}

const results = [];
for (let i = 0; i < TURNS.length; i++) {
  const turn = TURNS[i];
  console.log(`\n── ${i + 1}/${TURNS.length} · ${turn.id}`);
  console.log(`ASK: ${turn.ask}`);
  try { await send('Page.bringToFront'); } catch { /* ok */ }
  await typeAndSend(turn.ask);
  const snap = await waitAndCapture(turn.ask);
  const flags = judgeReply(turn.ask, snap.reply, turn.id);
  if (snap.planCard) flags.push('plan-card-dom');
  const ok = flags.length === 0;
  console.log(`REPLY (${snap.provider || '?'}): ${(snap.reply || '').slice(0, 280).replace(/\\s+/g, ' ')}`);
  console.log(ok ? '  ✓ OK' : `  ✗ ${flags.join(', ')}`);
  results.push({
    id: turn.id,
    ask: turn.ask,
    reply: snap?.reply || '',
    provider: snap?.provider || null,
    flags,
    ok,
  });
  await sleep(PAUSE);
  // Long advice turns sometimes keep streaming after Done — give the engine a beat to settle.
  if (/habit|week|routine|outline|walk me through|weekend rhythm/i.test(turn.ask)) {
    await sleep(2500);
  }
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
