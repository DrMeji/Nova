/**
 * Longer live convo ramp — simple → heavy → memory probes.
 * Watch the Nova window. CDP port 9229.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const PAUSE = Number(process.env.NOVA_WATCH_PAUSE_MS || 4000);
const TURN_MS = Number(process.env.NOVA_TURN_TIMEOUT_MS || 75000);
const OUT = path.join(__dirname, '..', '.tmp-live-convo-long.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TURNS = [
  { tier: 1, label: 'greeting', ask: 'Hey Nova — good to chat. What are you good at in plain words?' },
  { tier: 2, label: 'fact japan', ask: 'Quick one: what is the capital of Japan?' },
  { tier: 3, label: 'fact follow', ask: 'Nice. One more fun fact about Tokyo in one short sentence.' },
  { tier: 4, label: 'howto', ask: 'How do I pin an app to the Windows 11 taskbar? Keep it under 5 steps.' },
  { tier: 5, label: 'color plant', ask: 'Remember this for later: my favorite accent color is purple — specifically #7C3AED.' },
  { tier: 6, label: 'soft toy', ask: 'Show me a tiny HTML page with one button that rolls a dice 1–6. Full HTML in one code block.' },
  { tier: 7, label: 'toy follow', ask: 'Add a line under the button that shows the last roll. Still one file.' },
  { tier: 8, label: 'talk habit', ask: 'I want to build a small habit tracker for myself — streak calendar, one habit at a time. Talk me through the first version only. Do not create files yet.' },
  { tier: 9, label: 'habit deepen', ask: 'What should v1 store locally, and what should I skip so I do not overbuild?' },
  { tier: 10, label: 'side topic', ask: 'Switching gears for a second — recommend one good stretch for sitting at a desk all day.' },
  { tier: 11, label: 'memory color', ask: 'Hey, can you remember what accent color I told you earlier? What was the hex code?' },
  { tier: 12, label: 'memory habit', ask: 'And what was the one-habit rule we talked about for the tracker?' },
  { tier: 13, label: 'complex multi', ask: 'Ok back to the tracker: name 3 must-have screens, then one risk if I add social sharing in v1.' },
  { tier: 14, label: 'memory dice', ask: 'Last check — earlier I asked for a dice roller. What did that tiny page do?' },
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

async function connect() {
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''))
    || list.find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('no NOVA page on CDP');
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

console.log('\n=== LONG LIVE CONVO (watch Nova) ===');
console.log(`${TURNS.length} turns · pause ${PAUSE}ms · CDP ${PORT}\n`);

let { ws, send, evalE } = await connect();
await send('Page.enable');
await send('Runtime.enable');
try { await send('Page.bringToFront'); } catch { /* ok */ }

console.log('Hard reload + new chat…');
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
await sleep(2000);

async function typeAndSend(ask) {
  await evalE(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) throw new Error('no textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(ta, '');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    return true;
  })()`);
  const chunk = 28;
  for (let i = 0; i < ask.length; i += chunk) {
    const soFar = ask.slice(0, i + chunk);
    await evalE(`(() => {
      const ta = document.querySelector('textarea');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(ta, ${JSON.stringify(soFar)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(60);
  }
  await sleep(350);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(400);
  if (await evalE(`(document.querySelector('textarea')?.value || '').length > 8`)) {
    await evalE(`document.querySelector('textarea')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  }
}

async function waitReply(ask) {
  const askLit = JSON.stringify(ask);
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < TURN_MS) {
    const s = await evalE(`(() => {
      const body = document.body?.innerText || '';
      const idx = body.lastIndexOf(${askLit});
      const slice = idx >= 0 ? body.slice(idx) : body.slice(-2800);
      const stop = [...document.querySelectorAll('button')].some(b =>
        /stop generating/i.test(b.getAttribute('aria-label') || b.title || '')
      );
      const provider = (slice.match(/\\d+(?:\\.\\d+)?\\s*s\\s*[·•]\\s*[^\\n]{4,70}/) || [])[0] || null;
      const status = (slice.match(/Reading your message|Thinking…?|Done|Plan\\s*[·•][^\\n]{0,40}/i) || [])[0] || null;
      const codeBox = document.querySelectorAll('pre, [class*="CodeCopy"], [data-code-block]').length;
      const planCard = /Habit Tracker Build Plan|nova-plan-flow|\\bPLAN\\b[\\s\\S]{0,40}steps/i.test(slice)
        || Boolean(document.querySelector('.nova-plan-flow'));
      const globeBlue = Boolean(document.querySelector('.text-sky-400, .text-sky-300'));
      const codingPitch = /coding or programming questions|feel free to ask/i.test(slice);
      const rememberedPurple = /#7[Cc]3[Aa][Ee][Dd]|purple/i.test(slice);
      const after = slice.slice(${ask.length}, ${ask.length} + 700);
      return {
        stop, provider, status, codeBox, planCard, codingPitch, rememberedPurple,
        after, len: slice.length,
      };
    })()`);
    last = s;
    const elapsed = Date.now() - t0;
    process.stdout.write(
      `\r  … ${Math.round(elapsed / 1000)}s stop=${s.stop} planCard=${s.planCard} pitch=${s.codingPitch} box=${s.codeBox}   `,
    );
    if (elapsed > 7000 && !s.stop && (s.provider || s.codeBox || s.len > ask.length + 60)) break;
    if (elapsed > 22000 && !s.stop) break;
    await sleep(1400);
  }
  process.stdout.write('\n');
  return last;
}

const results = [];
for (let i = 0; i < TURNS.length; i++) {
  const turn = TURNS[i];
  console.log(`\n── ${i + 1}/${TURNS.length} · ${turn.label}`);
  console.log(`ASK: ${turn.ask}`);
  try { await send('Page.bringToFront'); } catch { /* ok */ }
  await typeAndSend(turn.ask);
  const snap = await waitReply(turn.ask);
  const row = {
    n: i + 1,
    label: turn.label,
    ask: turn.ask,
    provider: snap?.provider || null,
    codeBox: snap?.codeBox || 0,
    planCard: Boolean(snap?.planCard),
    codingPitch: Boolean(snap?.codingPitch),
    rememberedPurple: Boolean(snap?.rememberedPurple),
    preview: String(snap?.after || '').replace(/\s+/g, ' ').slice(0, 220),
  };
  results.push(row);
  console.log(`  provider: ${row.provider || '(none)'} | planCard=${row.planCard} pitch=${row.codingPitch}`);
  console.log(`  preview: ${row.preview.slice(0, 140)}…`);
  if (i < TURNS.length - 1) await sleep(PAUSE);
}

const report = {
  at: new Date().toISOString(),
  results,
  summary: {
    turns: results.length,
    planCards: results.filter((r) => r.planCard).length,
    codingPitches: results.filter((r) => r.codingPitch).length,
    codeBoxes: results.filter((r) => r.codeBox > 0).length,
    memoryColorHit: results.some((r) => r.label === 'memory color' && /#7[Cc]3[Aa][Ee][Dd]|7C3AED|purple/i.test(r.preview)),
  },
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('\n=== LONG RAMP DONE ===');
console.log(JSON.stringify(report.summary, null, 2));
console.log(`Wrote ${OUT}`);
ws.close();
const fail = report.summary.planCards > 0 || report.summary.codingPitches > 0;
process.exit(fail ? 2 : 0);
