/**
 * Bind NovaClinicGym via NOVA:bind-studio-disk, ask to add Patients link, verify disk.
 * Env: NOVA_CDP_PORT (default 9230 for this session)
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9230);
const GYM = path.resolve('C:/Users/thoma/Desktop/Projects/NovaClinicGym');
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
const page = list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || '')) || list.find((t) => t.type === 'page');
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

await send('Runtime.enable');
await send('Page.bringToFront').catch(() => {});

await evalE(`(() => { location.hash = '#/chat?new=' + Date.now(); return true; })()`);
await sleep(900);

const bind = await evalE(`(async () => {
  const diskPath = ${JSON.stringify(GYM)};
  window.dispatchEvent(new CustomEvent('NOVA:bind-studio-disk', {
    detail: { diskPath, name: 'NovaClinicGym' },
  }));
  await new Promise(r => setTimeout(r, 1800));
  return {
    diskPath,
    textHasGym: /NovaClinicGym/i.test(document.body.innerText),
  };
})()`);
console.log('bind', bind);

const ask = 'In the open NovaClinicGym project, add a Patients nav link in the header that goes to /dashboard. Keep Logout.';
const sent = await evalE(`(() => {
  const ta = [...document.querySelectorAll('textarea')].find(n => n.getClientRects().length) || document.querySelector('textarea');
  if (!ta) return false;
  const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  const tracker = ta._valueTracker; if (tracker) tracker.setValue('');
  const text = ${JSON.stringify(ask)};
  d.set.call(ta, text);
  ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  ta.focus();
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  return true;
})()`);
console.log('sent', sent);

const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  await sleep(3000);
  const gen = await evalE(`(() => !!document.querySelector('[aria-label*="Stop" i], button[aria-label*="stop" i]'))`);
  if (!gen && Date.now() - t0 > 18000) {
    await sleep(2500);
    break;
  }
}

const headerPath = path.join(GYM, 'src/components/AppHeader.jsx');
const header = fs.readFileSync(headerPath, 'utf8');
const patients = /Patients/i.test(header);
console.log(JSON.stringify({
  patients,
  logoutStillThere: /Logout/i.test(header),
  header,
}, null, 2));

ws.close();
process.exit(patients ? 0 : 2);
