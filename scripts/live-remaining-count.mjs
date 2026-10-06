/** Live: bind DeBloat → rescan → print remaining DBG count (watch in Nova UI). */
import WebSocket from 'ws';

const DEBLOAT = 'C:\\Users\\thoma\\Desktop\\Projects\\DeBloat';

const pages = await (await fetch('http://127.0.0.1:9229/json')).json();
const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
let id = 1;
const pending = new Map();
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(m.error) : res(m.result);
  }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = id++;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

console.log('Reloading Nova so UI patches (Repair all / single Repair) load…');
await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 4500));
await ev(`window.dispatchEvent(new CustomEvent('NOVA:bind-studio-disk', { detail: { diskPath: ${JSON.stringify(DEBLOAT)}, name: 'DeBloat' } })); true`);
await new Promise((r) => setTimeout(r, 1500));

await ev(`(async () => {
  const ta = [...document.querySelectorAll('textarea')].find(n => n.getClientRects().length);
  if (!ta) return false;
  const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  const text = "What's remaining? Fresh rescan after fixes.";
  const tracker = ta._valueTracker; if (tracker) tracker.setValue('');
  if (desc?.set) desc.set.call(ta, text); else ta.value = text;
  ta.dispatchEvent(new InputEvent('input', { bubbles: true }));
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  return true;
})()`);

let result = null;
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const s = await ev(`(() => {
    const body = document.body?.innerText || '';
    const idx = Math.max(body.lastIndexOf('ISSUES FOUND'), body.lastIndexOf('Issues found'), body.lastIndexOf('DEBUG CLINIC'));
    const slice = body.slice(Math.max(0, idx));
    const dbgs = [...new Set([...slice.matchAll(/DBG-\\d+/g)].map(m => m[0]))];
    const scanning = /Pass \\d|Deep ·|Scanning all|Inventory ·/i.test(body.split(/\\n/).slice(-8).join('\\n'))
      && !/Clinic ready|ISSUES FOUND|Issues found|· Done/i.test(body.slice(-1200));
    const issues = /ISSUES FOUND|Issues found|No issues found/i.test(slice) || /No material findings/i.test(slice);
    const repairAll = /Repair all/i.test(slice);
    const done = /NOVA · Debug/i.test(body.slice(-900)) && !/Scanning all|Pass 1 ·|Deep · reading/i.test(body.slice(-500));
    return { dbgs: dbgs.length, sample: dbgs, scanning, issues, repairAll, done, snip: slice.slice(0, 600) };
  })()`);
  if (i % 4 === 0) console.log('tick', i, { dbgs: s.dbgs, scanning: s.scanning, issues: s.issues, repairAll: s.repairAll, done: s.done });
  if (s.done && (s.issues || /no material findings/i.test(s.snip || ''))) { result = s; break; }
  if (s.issues && s.dbgs >= 0 && !s.scanning && s.done) { result = s; break; }
}

console.log('\\nRESULT', JSON.stringify(result, null, 2));
ws.close();
if (!result) process.exit(2);
