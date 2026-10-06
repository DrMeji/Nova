/**
 * Short link-only ask (no create). Uses Plan framing so classify stays off CREATE.
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);

function get(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await get(`http://127.0.0.1:${PORT}/json/list`);
const page = list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || '')) || list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(JSON.stringify(m.error)));
    else resolve(m.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  pending.set(i, { resolve, reject });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(x =>
    /stop/i.test(x.getAttribute('aria-label') || x.textContent || ''));
  if (b) b.click();
})()`);
await sleep(500);

await evaluate(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b =>
    /new chat/i.test(b.getAttribute('aria-label') || '') || /new chat/i.test(b.textContent || ''));
  if (btn) btn.click();
})()`);
await sleep(900);

const prompt = [
  'QUESTION ONLY — do not create a project, do not write files, do not start a build.',
  'I am thinking about a coffee brand site inspired by https://www.starbucks.com/',
  'Answer in chat: (1) Can you use a public URL like that as a reference when planning?',
  '(2) What visual cues would you copy vs invent for an original Harbor Roast brand?',
  '(3) Would screenshots/images I attach help more than the link alone? Why?',
  '(4) One honest sentence on how well you can match a site from link vs image.',
  'Under 160 words. No code fences. No build.',
].join(' ');

const sent = await evaluate(`(() => {
  const ta = document.querySelector('textarea[aria-label*="Message"], textarea');
  if (!ta) return { ok: false };
  const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  ta.focus();
  desc.set.call(ta, ${JSON.stringify(prompt)});
  ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  const sendBtn = [...document.querySelectorAll('button')].find(b =>
    (b.getAttribute('aria-label') || '').toLowerCase().includes('send'));
  if (sendBtn) { sendBtn.click(); return { ok: true, via: 'button' }; }
  ta.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
  }));
  return { ok: true, via: 'enter' };
})()`);
console.log('sent', sent);

const start = Date.now();
let last = '';
while (Date.now() - start < 120000) {
  const snap = await evaluate(`(() => {
    const t = document.body?.innerText || '';
    const stop = [...document.querySelectorAll('button')].some(b =>
      /stop/i.test(b.getAttribute('aria-label') || b.textContent || ''));
    const building = /Creating folder|Writing project|Build uses|Craft ·/i.test(t.slice(-1500));
    return { stop, building, tail: t.slice(-1100) };
  })()`);
  last = snap.tail;
  if (!snap.stop && !snap.building && /Harbor|Starbucks|screenshot|URL|link|reference/i.test(snap.tail)
    && snap.tail.length > 200 && Date.now() - start > 8000) {
    // quiet check
    await sleep(3500);
    const again = await evaluate(`(document.body?.innerText || '').slice(-1100)`);
    if (again === snap.tail || again.length <= snap.tail.length + 20) {
      console.log('--- link reply ---');
      console.log(again);
      const bad = /Creating folder|Writing project|Build uses/i.test(again);
      console.log('SUMMARY', { answered: true, startedBuild: bad });
      ws.close();
      process.exit(bad ? 2 : 0);
    }
  }
  await sleep(1500);
}
console.log('--- timeout tail ---');
console.log(last);
console.log('SUMMARY', { answered: false, startedBuild: /Build uses|Creating folder/i.test(last) });
ws.close();
process.exit(1);
