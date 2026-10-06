import WebSocket from 'ws';
import fs from 'node:fs';

const DEBLOAT = 'C:\\Users\\thoma\\Desktop\\Projects\\DeBloat';
const MAIN = `${DEBLOAT}\\electron\\main.ts`;

function snap() {
  const t = fs.readFileSync(MAIN, 'utf8');
  return {
    hasExecShell: /\bexec\(\s*['"]shutdown/i.test(t),
    hasExecFile: /execFile\(\s*['"]shutdown['"]/i.test(t),
    lines: t.split(/\n/).length,
    mtime: fs.statSync(MAIN).mtime.toISOString(),
  };
}

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

// Revert execFile so Nova can re-apply surgically
let t = fs.readFileSync(MAIN, 'utf8');
t = t.replace(
  /execFile\("shutdown", \["\/r", "\/t", "3", "\/c", "DeBloat: restarting to finish applied changes"\],/,
  "exec('shutdown /r /t 3 /c \"DeBloat: restarting to finish applied changes\"',",
);
fs.writeFileSync(MAIN, t);
console.log('BEFORE', snap());

await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 4000));
await ev(`window.dispatchEvent(new CustomEvent('NOVA:bind-studio-disk', { detail: { diskPath: ${JSON.stringify(DEBLOAT)}, name: 'DeBloat' } })); true`);
await new Promise((r) => setTimeout(r, 1500));

await ev(`(async () => {
  const ta = [...document.querySelectorAll('textarea')].find(n => n.getClientRects().length);
  if (!ta) return false;
  const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  const text = 'fix the eval/exec risk in electron/main.ts restart-computer handler';
  const tracker = ta._valueTracker; if (tracker) tracker.setValue('');
  if (desc?.set) desc.set.call(ta, text); else ta.value = text;
  ta.dispatchEvent(new InputEvent('input', { bubbles: true }));
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  return true;
})()`);

let last = null;
let saw = false;
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  last = await ev(`(() => {
    const tail = (document.body?.innerText || '').slice(-4000);
    const working = /Fix · working|hardening |writing |patching |repairing/i.test(tail);
    const done = /Files touched|finished |What’s next|execFile/i.test(tail) && !working;
    return { working, done, interesting: tail.split(/\\n/).map(x=>x.trim()).filter(l=>/hardening|execFile|updated|Files touched|finished|What’s next|Agent ·/i.test(l)).slice(-12) };
  })()`);
  if (last.working) saw = true;
  if (i % 8 === 0) console.log('tick', i, last);
  if (saw && last.done) break;
}
console.log('AFTER', snap());
console.log('UI', last);
ws.close();
if (snap().hasExecShell || !snap().hasExecFile) process.exit(4);
