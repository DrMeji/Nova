/**
 * Live repro: calculator ask → detect plan bleed / Plan mode stall / Done+Stop.
 * Requires Nova with --remote-debugging-port=9229
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const OUT = path.join(__dirname, '..', '.tmp-live-calc-repro.json');
const ASK = process.env.NOVA_LIVE_ASK || 'Can you help me build a simple calculator';
const WATCH_MS = Number(process.env.NOVA_WATCH_MS || 90_000);
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

async function waitForCdp(ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      if (Array.isArray(list) && list.length) return list;
    } catch { /* retry */ }
    await sleep(1000);
  }
  throw new Error(`CDP not up on ${PORT}`);
}

const list = await waitForCdp();
const page = list.find((t) => t.type === 'page' && /NOVA|localhost/i.test(`${t.title || ''}${t.url || ''}`))
  || list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('NOVA page missing');

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
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');

const snap = async () => evalE(`(() => {
  const body = document.body?.innerText || '';
  const stop = [...document.querySelectorAll('button')].some(b =>
    /stop/i.test(b.getAttribute('aria-label') || '') || /stop generating/i.test(b.title || '')
  );
  const hasPlanBleed = /Overall:\\s*keep the first version tiny/i.test(body);
  const hasPlanMode = /Plan\\s*[·•]\\s*(?:drafting|gathering|refining)/i.test(body)
    || /Plan\\s*[·•]\\s*drafting outline/i.test(body);
  const hasDone = /\\bDone\\b/.test(body.slice(-4000));
  const hasCalculatorCode = /<html|function\\s+calculate|onclick|input\\s+type=["']button/i.test(body);
  const lastAssistant = (() => {
    const nodes = [...document.querySelectorAll('[class*="message"], [data-role], article, .prose')];
    return (nodes.map(n => n.innerText).filter(Boolean).slice(-3).join('\\n---\\n') || body).slice(-2500);
  })();
  return {
    len: body.length,
    stop,
    hasPlanBleed,
    hasPlanMode,
    hasDone,
    hasCalculatorCode,
    planSnippet: (body.match(/Overall:[^\\n]{0,120}/i) || [])[0] || null,
    statusSnippet: (body.match(/Plan\\s*[·•][^\\n]{0,80}/i) || [])[0]
      || (body.match(/Reading your message|Thinking|Done/i) || [])[0]
      || null,
    tail: body.slice(-900),
  };
})()`);

// Prefer a clean composer: focus chat if needed
await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (ta) { ta.focus(); return true; }
  return false;
})()`);

const before = await snap();
console.log('BEFORE', JSON.stringify({ len: before.len, stop: before.stop, hasPlanMode: before.hasPlanMode }, null, 0));

const sent = await evalE(`(() => {
  const ta = document.querySelector('textarea[aria-label*="Message"], textarea');
  if (!ta) return { ok: false, reason: 'no textarea' };
  const text = ${JSON.stringify(ASK)};
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(ta, text);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
  // Try Enter
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  // Also click send-looking button if present
  const btn = [...document.querySelectorAll('button')].find(b =>
    /send/i.test(b.getAttribute('aria-label') || '') || b.querySelector('svg')
  );
  return { ok: true, value: ta.value?.slice(0, 80), hasSend: !!btn };
})()`);
console.log('SENT', JSON.stringify(sent));

// If Enter didn't clear the box, click a plausible send / press Enter via CDP Input
await sleep(800);
const stillInBox = await evalE(`(() => {
  const ta = document.querySelector('textarea');
  return (ta?.value || '').includes('calculator');
})()`);
if (stillInBox) {
  console.log('composer still has text — pressing Enter via Input');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
}

const ticks = [];
const t0 = Date.now();
while (Date.now() - t0 < WATCH_MS) {
  const s = await snap();
  const elapsed = Date.now() - t0;
  ticks.push({ atMs: elapsed, ...s, tail: undefined });
  console.log(
    `[${Math.round(elapsed / 1000)}s] stop=${s.stop} planBleed=${s.hasPlanBleed} planMode=${s.hasPlanMode} done=${s.hasDone} code=${s.hasCalculatorCode} status=${JSON.stringify(s.statusSnippet)}`,
  );
  // Early exit: idle after reply with no stop, and either bleed detected or code present or 25s quiet with growth
  if (elapsed > 8000 && !s.stop && s.len > before.len + 80) {
    // wait a bit more for bleed finalize
    if (s.hasPlanBleed || s.hasCalculatorCode || elapsed > 25_000) {
      ticks.push({ atMs: elapsed, final: true, ...s });
      break;
    }
  }
  // Plan mode hung > 35s is enough evidence
  if (s.hasPlanMode && elapsed > 35_000) {
    ticks.push({ atMs: elapsed, hungPlan: true, ...s });
    break;
  }
  await sleep(2000);
}

const last = ticks[ticks.length - 1] || {};
const report = {
  ask: ASK,
  watchMs: WATCH_MS,
  ticks,
  verdict: {
    planBleed: ticks.some((t) => t.hasPlanBleed),
    planModeHang: ticks.some((t) => t.hasPlanMode && t.atMs > 20_000),
    gotCode: ticks.some((t) => t.hasCalculatorCode),
    doneWhileStop: ticks.some((t) => t.hasDone && t.stop),
  },
  lastTail: (await snap()).tail,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('\\nVERDICT', JSON.stringify(report.verdict, null, 2));
console.log('wrote', OUT);
ws.close();
process.exit(report.verdict.planBleed || report.verdict.planModeHang || report.verdict.doneWhileStop ? 2 : 0);
