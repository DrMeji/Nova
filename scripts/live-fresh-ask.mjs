/**
 * Fresh live chat probe — different ask each run (not calculator).
 * CDP: Nova with --remote-debugging-port=9229
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const OUT = path.join(__dirname, '..', '.tmp-live-fresh-ask.json');
const ASK = process.env.NOVA_LIVE_ASK
  || 'Hey, can you help me make a simple click counter page? Just buttons that go up when I click.';
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
console.log('ASK:', ASK);
console.log('Hard reload + new chat…');
await send('Page.reload', { ignoreCache: true });
await sleep(4500);
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

await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) throw new Error('no textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(ta, ${JSON.stringify(ASK)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  return true;
})()`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await sleep(600);
if (await evalE(`(document.querySelector('textarea')?.value || '').length > 10`)) {
  await evalE(`document.querySelector('textarea')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
}

const askLit = JSON.stringify(ASK);
const ticks = [];
const t0 = Date.now();
while (Date.now() - t0 < 120000) {
  const s = await evalE(`(() => {
    const body = document.body?.innerText || '';
    const idx = body.lastIndexOf(${askLit});
    const slice = idx >= 0 ? body.slice(idx) : body.slice(-2500);
    const stop = [...document.querySelectorAll('button')].some(b =>
      /stop generating/i.test(b.getAttribute('aria-label') || b.title || '')
    );
    const fences = (slice.match(/\`\`\`/g) || []).length;
    const hasFenceBlock = /\`\`\`[\\s\\S]{40,}\`\`\`/.test(slice);
    // Rendered CodeCopyBox / <pre> count as clean code even when backticks are not in innerText.
    const codeBoxes = document.querySelectorAll('pre, [class*="CodeCopy"], [data-code-block]').length;
    const hasCodeBox = codeBoxes > 0;
    const honestGap = /could not finish a working mini demo|pick a Cloud model/i.test(slice);
    const wallOfCss = /\\.calculator|\\.buttons|body\\s*\\{|font-family:[^\\n]{80,}/i.test(slice)
      && !hasFenceBlock && !hasCodeBox;
    const wallOfJs = /function\\s+\\w+\\s*\\([^)]*\\)\\s*\\{/.test(slice) && !hasFenceBlock && !hasCodeBox;
    const hasPlanBleed = /Overall:\\s*keep the first version tiny/i.test(slice);
    const hasPlanMode = /Plan\\s*[·•]\\s*(?:drafting|gathering)/i.test(slice);
    const mashedDoctype = /<!DOCTYPE html>/i.test(slice) && !hasFenceBlock && !hasCodeBox
      && !/<\\/html>/i.test(slice);
    const uglyWall = wallOfCss || wallOfJs || mashedDoctype;
    const createHang = /Loading coder|Bound click-counter|Style\\s*[·•]/i.test(slice);
    return {
      len: body.length,
      stop,
      fences,
      hasFenceBlock,
      hasCodeBox,
      honestGap,
      uglyWall,
      hasPlanBleed,
      hasPlanMode,
      createHang,
      status: (slice.match(/Reading your message|Thinking|Done|Plan\\s*[·•][^\\n]{0,40}/i) || [])[0] || null,
      provider: (slice.match(/\\d+(?:\\.\\d+)?\\s*s\\s*[·•]\\s*[^\\n]{4,60}/) || [])[0] || null,
      tail: slice.slice(-900),
    };
  })()`);
  const elapsed = Date.now() - t0;
  ticks.push({ atMs: elapsed, ...s, tail: undefined });
  console.log(
    `[${Math.round(elapsed / 1000)}s] stop=${s.stop} ugly=${s.uglyWall} fence=${s.hasFenceBlock} box=${s.hasCodeBox} gap=${s.honestGap} bleed=${s.hasPlanBleed} plan=${s.hasPlanMode} create=${s.createHang} status=${JSON.stringify(s.status)}`,
  );
  if (elapsed > 15000 && !s.stop) {
    if (elapsed > 35000 || s.hasFenceBlock || s.hasCodeBox || s.honestGap || s.uglyWall || s.hasPlanBleed) break;
  }
  if (s.hasPlanMode && elapsed > 35000) break;
  if (s.createHang && elapsed > 20000) break;
  await sleep(2000);
}

const lastSlice = await evalE(`(() => {
  const body = document.body?.innerText || '';
  const idx = body.lastIndexOf(${askLit});
  return idx >= 0 ? body.slice(idx) : body.slice(-3500);
})()`);
const codeBoxCount = await evalE(`document.querySelectorAll('pre, [class*="CodeCopy"], [data-code-block]').length`);

const report = {
  ask: ASK,
  ticks,
  lastSlice,
  codeBoxCount,
  verdict: {
    uglyWall: ticks.some((t) => t.uglyWall) && !ticks.some((t) => t.hasCodeBox || t.hasFenceBlock || t.honestGap),
    gotCleanFence: ticks.some((t) => t.hasFenceBlock || t.hasCodeBox),
    honestGap: ticks.some((t) => t.honestGap),
    planBleed: ticks.some((t) => t.hasPlanBleed),
    planMode: ticks.some((t) => t.hasPlanMode),
    createHang: ticks.some((t) => t.createHang),
    doneWhileStop: ticks.some((t) => t.status === 'Done' && t.stop),
  },
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('\nVERDICT', report.verdict);
console.log('codeBoxCount', codeBoxCount);
console.log('provider tail:', (lastSlice.match(/\d+(?:\.\d+)?\s*s\s*[·•][^\n]{4,80}/) || [])[0] || '(none)');
ws.close();
const fail = report.verdict.uglyWall || report.verdict.planBleed || report.verdict.planMode
  || report.verdict.createHang || report.verdict.doneWhileStop;
process.exit(fail ? 2 : 0);
