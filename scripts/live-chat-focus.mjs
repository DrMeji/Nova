/**
 * Focused live check: hello + what can you do + Discord talk-first.
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9272);
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
const page = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''))
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

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(2500);
await evalE(`(() => {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && /chat-thread|recent-chats|chat-studio|recent-projects|last-disk/i.test(k)) localStorage.removeItem(k);
  }
  return true;
})()`);
await send('Page.reload', { ignoreCache: true });
await sleep(3000);

// Wait until composer exists
{
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const n = await evalE('document.querySelectorAll("textarea").length');
    if (n > 0) break;
    await sleep(500);
  }
}

async function sendAsk(text) {
  const setExpr = `(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return false;
    const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    d.set.call(ta, ${JSON.stringify(text)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
    return true;
  })()`;
  const ok = await evalE(setExpr);
  if (!ok) throw new Error('no textarea');
  const t0 = Date.now();
  let prevMeta = '';
  while (Date.now() - t0 < 100000) {
    await sleep(1000);
    const body = String(await evalE('document.body.innerText') || '');
    const metas = [...body.matchAll(/Responded in [^\n]+/g)].map((m) => m[0]);
    const meta = metas[metas.length - 1] || '';
    if (meta && meta !== prevMeta && body.includes(text.slice(0, Math.min(18, text.length)))) {
      await sleep(900);
      const body2 = String(await evalE('document.body.innerText') || '');
      const metas2 = [...body2.matchAll(/Responded in [^\n]+/g)].map((m) => m[0]);
      const meta2 = metas2[metas2.length - 1] || meta;
      const i = body2.lastIndexOf(text);
      const after = (i >= 0 ? body2.slice(i + text.length) : body2).trim();
      const cut = after.split(/\nResponded in /)[0];
      return { meta: meta2, text: cut.trim().slice(0, 900), ms: /Responded in (\d+)\s*ms/i.test(meta2) };
    }
    if (meta) prevMeta = meta;
  }
  return { meta: 'timeout', text: '', ms: false };
}

const results = [];
for (const p of [
  'hello',
  'what can you do for me',
  'i want to build a app like discord, are you familiar with Discord',
]) {
  console.log('\n>>>', p);
  const r = await sendAsk(p);
  console.log(r.meta);
  console.log(r.text.slice(0, 600));
  results.push({ prompt: p, ...r });
  await sleep(800);
}

const hello = results[0];
const cap = results[1];
const disc = results[2];
let failed = 0;
if (hello.ms) { console.log('FAIL hello: instant ms canned'); failed += 1; }
else if (!/hello|hi|hey|assist|help/i.test(hello.text)) { console.log('FAIL hello: empty/odd'); failed += 1; }
else console.log('PASS hello: model reply');

if (/File Management|Personal Assistance|Educational Resources|Certainly! Here's a detailed/i.test(cap.text)) {
  console.log('FAIL capability: laundry list'); failed += 1;
} else if ((cap.text.match(/\n\s*\d+\./g) || []).length >= 5) {
  console.log('FAIL capability: long numbered list'); failed += 1;
} else if (cap.text.length > 650) {
  console.log('FAIL capability: too long (' + cap.text.length + ')'); failed += 1;
} else console.log('PASS capability: short-ish');

if (/NOVA · scaffold|Files written|Created .*Path/i.test(disc.text)) {
  console.log('FAIL discord: scaffolded'); failed += 1;
} else console.log('PASS discord: no scaffold');

ws.close();
if (failed) {
  console.log('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nAll focused live checks passed');
