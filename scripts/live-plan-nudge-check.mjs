/**
 * Single-turn Plan discovery nudge check (CorridorCup seed).
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const ASK = "I'm trying to build something for my office floor — people post when they're doing a coffee run, and coworkers can hop on. Calling it CorridorCup. What should a first version actually do?";
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

async function connect() {
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
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  return { ws, send, evalE };
}

let { ws, send, evalE } = await connect();
await send('Page.enable');
await send('Runtime.enable');
await send('Page.reload', { ignoreCache: true });
await sleep(4500);
ws.close();
({ ws, send, evalE } = await connect());
await send('Page.enable');
await send('Runtime.enable');

await evalE(`(() => {
  try {
    for (const store of [localStorage, sessionStorage]) {
      const keys = [];
      for (let i = 0; i < store.length; i++) keys.push(store.key(i));
      for (const k of keys) {
        if (k && /composer-mode|plan-nudge|active-plan/i.test(k)) store.removeItem(k);
      }
    }
  } catch {}
  const btns = [...document.querySelectorAll('button,[role="button"],a')];
  const hit = btns.find(b => {
    const a = (b.getAttribute('aria-label') || '').toLowerCase();
    const t = (b.textContent || '').trim().toLowerCase();
    return a.includes('new chat') || t === 'new chat';
  });
  if (hit) hit.click();
  else window.dispatchEvent(new CustomEvent('NOVA:new-chat'));
  return true;
})()`);
await sleep(2000);

const askLit = JSON.stringify(ASK);
await evalE(`(() => {
  const ta = document.querySelector('textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(ta, ${askLit});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  return true;
})()`);
await sleep(300);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });

const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  const stop = await evalE(`([...document.querySelectorAll('button')].some(b => /stop generating/i.test(b.getAttribute('aria-label') || b.title || '')))`);
  if (!stop && Date.now() - t0 > 5000) break;
  await sleep(1000);
}
await sleep(1500);

const snap = await evalE(`(() => {
  const body = document.body?.innerText || '';
  const chip = [...document.querySelectorAll('button')].some(b => /switch to plan/i.test(b.textContent || ''));
  let hit = null;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const v = localStorage.getItem(k) || '';
    if (/CorridorCup/i.test(v) && /role":"assistant"/i.test(v)) {
      hit = {
        key: k,
        hasTip: /Want to go into/i.test(v),
        hasChips: /nova-prompt-chips/i.test(v),
        hasSwitch: /Switch to Plan/i.test(v),
        nudgeKeys: Object.keys(localStorage).filter(x => /plan-nudge/i.test(x)),
      };
    }
  }
  return {
    bodyHasTip: /Want to go into|Switch to Plan|Plan mode so we can map/i.test(body),
    chip,
    hit,
    replyTail: body.slice(Math.max(0, body.lastIndexOf('CorridorCup')), body.lastIndexOf('CorridorCup') + 900),
  };
})()`);

console.log(JSON.stringify(snap, null, 2));
ws.close();
process.exit(snap.bodyHasTip || snap.chip || snap.hit?.hasTip ? 0 : 1);
