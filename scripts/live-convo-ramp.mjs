/**
 * Progressive live convo ramp — simple → heavy, with pauses so you can watch.
 * CDP: Nova with --remote-debugging-port=9229
 *
 * Env:
 *   NOVA_CDP_PORT   default 9229
 *   NOVA_WATCH_PAUSE_MS  pause between turns (default 4500)
 *   NOVA_TURN_TIMEOUT_MS  max wait per reply (default 90000)
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
const OUT = path.join(__dirname, '..', '.tmp-live-convo-ramp.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Escalating conversation: one thread, not calculator. */
const TURNS = [
  {
    tier: 1,
    label: 'simple greeting',
    ask: 'Hey — just checking in. What can you help me with today?',
  },
  {
    tier: 2,
    label: 'simple fact',
    ask: 'Quick one: what is the capital of Japan?',
  },
  {
    tier: 3,
    label: 'soft how-to',
    ask: 'How do I change the default browser on Windows 11? Keep it short.',
  },
  {
    tier: 4,
    label: 'mini build toy',
    ask: 'Show me a tiny HTML page with a button that changes the background color each click. Full HTML in one code block.',
  },
  {
    tier: 5,
    label: 'follow-up polish',
    ask: 'Nice — now make the button show the hex color it picked, and keep it one file.',
  },
  {
    tier: 6,
    label: 'heavier product talk',
    ask: 'I want to build a small habit tracker for myself — streak calendar, one habit at a time. Talk me through the first version only. Do not create files yet.',
  },
  {
    tier: 7,
    label: 'complex multi-part',
    ask: 'Based on that plan: (1) name the 3 must-have screens, (2) what data to store locally, (3) what to skip for v1. Then give me one short risk if I overbuild.',
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

console.log('\n=== LIVE CONVO RAMP (watch the Nova window) ===');
console.log(`CDP ${PORT} · pause ${PAUSE}ms between turns · timeout ${TURN_MS}ms\n`);

let { ws, send, evalE } = await connect();
await send('Page.enable');
await send('Runtime.enable');

// Bring window forward if possible
try {
  await send('Page.bringToFront');
} catch { /* ok */ }

console.log('Hard reload + new chat so you see a clean thread…');
await send('Page.reload', { ignoreCache: true });
await sleep(4500);
// Reconnect after reload (CDP target can change)
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
    setter?.call(ta, ${JSON.stringify('')});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    return true;
  })()`);
  // Type in visible chunks so you can watch it appear
  const chunk = 24;
  for (let i = 0; i < ask.length; i += chunk) {
    const soFar = ask.slice(0, i + chunk);
    await evalE(`(() => {
      const ta = document.querySelector('textarea');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(ta, ${JSON.stringify(soFar)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(80);
  }
  await sleep(400);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(500);
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
      const slice = idx >= 0 ? body.slice(idx) : body.slice(-2200);
      const stop = [...document.querySelectorAll('button')].some(b =>
        /stop generating/i.test(b.getAttribute('aria-label') || b.title || '')
      );
      const provider = (slice.match(/\\d+(?:\\.\\d+)?\\s*s\\s*[·•]\\s*[^\\n]{4,70}/) || [])[0] || null;
      const status = (slice.match(/Reading your message|Thinking…?|Done|Plan\\s*[·•][^\\n]{0,40}/i) || [])[0] || null;
      const codeBox = document.querySelectorAll('pre, [class*="CodeCopy"], [data-code-block]').length;
      const ugly = (/<!DOCTYPE html>/i.test(slice) || /function\\s+\\w+\\s*\\(/i.test(slice))
        && !/\`\`\`/.test(slice) && codeBox === 0;
      const planBleed = /Overall:\\s*keep the first version tiny/i.test(slice);
      // Assistant text after the ask (rough)
      const after = slice.slice(${ask.length}, ${ask.length} + 900);
      return { stop, provider, status, codeBox, ugly, planBleed, after, len: slice.length };
    })()`);
    last = s;
    const elapsed = Date.now() - t0;
    process.stdout.write(
      `\r  … ${Math.round(elapsed / 1000)}s  stop=${s.stop} status=${JSON.stringify(s.status)} box=${s.codeBox}   `,
    );
    if (elapsed > 8000 && !s.stop && (s.provider || s.codeBox || s.len > ask.length + 80)) {
      break;
    }
    if (elapsed > 25000 && !s.stop) break;
    await sleep(1500);
  }
  process.stdout.write('\n');
  return last;
}

const results = [];
for (let i = 0; i < TURNS.length; i++) {
  const turn = TURNS[i];
  console.log(`\n── Tier ${turn.tier}/${TURNS.length}: ${turn.label}`);
  console.log(`ASK: ${turn.ask}`);
  try { await send('Page.bringToFront'); } catch { /* ok */ }
  await typeAndSend(turn.ask);
  const snap = await waitReply(turn.ask);
  const row = {
    tier: turn.tier,
    label: turn.label,
    ask: turn.ask,
    provider: snap?.provider || null,
    codeBox: snap?.codeBox || 0,
    ugly: Boolean(snap?.ugly),
    planBleed: Boolean(snap?.planBleed),
    preview: String(snap?.after || '').replace(/\s+/g, ' ').slice(0, 280),
  };
  results.push(row);
  console.log(`  provider: ${row.provider || '(none)'}`);
  console.log(`  preview: ${row.preview.slice(0, 160)}…`);
  if (row.ugly) console.log('  ⚠ ugly unfenced code wall');
  if (row.planBleed) console.log('  ⚠ plan bleed');
  if (i < TURNS.length - 1) {
    console.log(`  (pause ${PAUSE}ms — watch the reply, next turn coming)`);
    await sleep(PAUSE);
  }
}

const report = {
  at: new Date().toISOString(),
  results,
  summary: {
    turns: results.length,
    ugly: results.filter((r) => r.ugly).length,
    planBleed: results.filter((r) => r.planBleed).length,
    withCodeBox: results.filter((r) => r.codeBox > 0).length,
  },
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('\n=== RAMP DONE ===');
console.log(JSON.stringify(report.summary, null, 2));
console.log(`Wrote ${OUT}`);
ws.close();
process.exit(report.summary.ugly || report.summary.planBleed ? 2 : 0);
