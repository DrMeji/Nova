/**
 * Hard reload Nova page + send calculator ask; assert no plan_talk bleed / has code.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const OUT = path.join(__dirname, '..', '.tmp-live-calc-repro2.json');
const ASK = 'Can you help me build a simple calculator';
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

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const page = list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('no page');
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

await send('Page.enable');
await send('Runtime.enable');
console.log('Reloading…');
await send('Page.reload', { ignoreCache: true });
await sleep(4000);

// Clear sticky plan + start fresh chat
await evalE(`(() => {
  try {
    for (const k of Object.keys(localStorage)) {
      if (/composer-mode|plan-nudge|active-plan/i.test(k)) localStorage.removeItem(k);
    }
  } catch {}
  window.dispatchEvent(new CustomEvent('NOVA:new-chat'));
  return true;
})()`);
await sleep(1500);

const contractProbe = await evalE(`(async () => {
  // Probe routing in the live bundle if exposed; else null
  return { href: location.href, title: document.title };
})()`);
console.log('page', contractProbe);

const beforeLen = await evalE(`(document.body?.innerText || '').length`);

await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) throw new Error('no textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(ta, ${JSON.stringify(ASK)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  return ta.value;
})()`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await sleep(500);
const still = await evalE(`(document.querySelector('textarea')?.value || '').includes('calculator')`);
if (still) {
  // click last icon button near composer
  await evalE(`(() => {
    const ta = document.querySelector('textarea');
    ta?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  })()`);
}

const ticks = [];
const t0 = Date.now();
while (Date.now() - t0 < 90000) {
  const s = await evalE(`(() => {
    const body = document.body?.innerText || '';
    // Only look at text AFTER the latest user ask
    const idx = body.lastIndexOf(${JSON.stringify(ASK)});
    const slice = idx >= 0 ? body.slice(idx) : body.slice(-2000);
    const stop = [...document.querySelectorAll('button')].some(b =>
      /stop generating/i.test(b.getAttribute('aria-label') || b.title || '')
    );
    return {
      len: body.length,
      stop,
      hasPlanBleed: /Overall:\\s*keep the first version tiny/i.test(slice),
      hasPlanMode: /Plan\\s*[·•]\\s*(?:drafting|gathering)/i.test(slice),
      hasCodeFence: /\`\`\`/.test(slice) || /<html|function\\s*\\(|onclick=/i.test(slice),
      hasPlanClose: /proceed with this plan/i.test(slice),
      status: (slice.match(/Reading your message|Thinking|Done|Plan\\s*[·•][^\\n]{0,40}/i) || [])[0] || null,
      tail: slice.slice(-700),
    };
  })()`);
  const elapsed = Date.now() - t0;
  ticks.push({ atMs: elapsed, ...s, tail: undefined });
  console.log(`[${Math.round(elapsed/1000)}s] stop=${s.stop} bleed=${s.hasPlanBleed} planMode=${s.hasPlanMode} code=${s.hasCodeFence} planClose=${s.hasPlanClose} status=${JSON.stringify(s.status)}`);
  if (elapsed > 10000 && !s.stop && s.len > beforeLen + 100) {
    if (elapsed > 20000 || s.hasCodeFence || s.hasPlanBleed) break;
  }
  if (s.hasPlanMode && elapsed > 40000) break;
  await sleep(2000);
}

const last = await evalE(`(() => {
  const body = document.body?.innerText || '';
  const idx = body.lastIndexOf(${JSON.stringify(ASK)});
  return idx >= 0 ? body.slice(idx) : body.slice(-2000);
})()`);

const report = {
  ask: ASK,
  ticks,
  lastSlice: last,
  verdict: {
    planBleed: ticks.some((t) => t.hasPlanBleed),
    planMode: ticks.some((t) => t.hasPlanMode),
    gotCode: ticks.some((t) => t.hasCodeFence),
    planClose: ticks.some((t) => t.hasPlanClose),
    doneWhileStop: ticks.some((t) => t.status === 'Done' && t.stop),
  },
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('VERDICT', report.verdict);
ws.close();
process.exit(report.verdict.planBleed || report.verdict.planMode || !report.verdict.gotCode ? 2 : 0);
