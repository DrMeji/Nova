/**
 * Open Code pill and report whether Reject/Apply / Code controls / pipeline pills are visible.
 *   $env:NOVA_CDP_PORT='9229'; npx tsx --tsconfig tsconfig.app.json scripts/_cdp-peek-code-overlay.mjs
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const list = await new Promise((resolve, reject) => {
  http.get(`http://127.0.0.1:${PORT}/json/list`, (res) => {
    let b = '';
    res.on('data', (c) => (b += c));
    res.on('end', () => {
      try { resolve(JSON.parse(b)); } catch (e) { reject(e); }
    });
  }).on('error', reject);
});
const page = list.find((t) => t.type === 'page') || list[0];
if (!page?.webSocketDebuggerUrl) throw new Error('no page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
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
await send('Runtime.enable');

const opened = await evalE(`(() => {
  const btns = [...document.querySelectorAll('button, a, [role="button"], [data-pill]')];
  const hit = btns.find((b) => {
    const t = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')).toLowerCase();
    return /\\bcode\\b/.test(t) && !/code controls|vscode|barcode/.test(t);
  });
  if (hit) { hit.click(); return 'clicked:' + (hit.textContent || '').trim().slice(0, 40); }
  return 'no-code-pill';
})()`);
await new Promise((r) => setTimeout(r, 900));

const snap = await evalE(`(() => {
  const body = document.body?.innerText || '';
  return {
    hasApplyPatch: /Apply patch/i.test(body),
    hasReject: /\\bReject\\b/.test(body) && /Apply patch/i.test(body),
    hasCodeControls: /Code controls/i.test(body),
    hasPipelinePills: /1\\.\\s*understand|2\\.\\s*prep|7\\.\\s*done/i.test(body),
    hasExplorer: /EXPLORER|\\.gitignore|package\\.json/i.test(body),
    overlayHint: (body.match(/Return to chat|Select a file|Pick a file/i) || [null])[0],
  };
})()`);

const out = { opened, ...snap };
console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(out.hasApplyPatch || out.hasCodeControls || out.hasPipelinePills ? 2 : 0);
