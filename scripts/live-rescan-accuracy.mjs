/** Quick accuracy check: remaining → fix 3 low → remaining; compare DBG counts. */
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';

const DEBLOAT = 'C:\\Users\\thoma\\Desktop\\Projects\\DeBloat';

async function connect() {
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
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
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
  return { ws, send, ev };
}

async function sendAsk(ev, text) {
  const lit = JSON.stringify(text);
  return ev(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(200);
    const ta = [...document.querySelectorAll('textarea')].find(n => n.getClientRects().length);
    if (!ta) return false;
    ta.focus();
    const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    const text = ${lit};
    const tracker = ta._valueTracker; if (tracker) tracker.setValue('');
    if (desc?.set) desc.set.call(ta, text); else ta.value = text;
    ta.dispatchEvent(new InputEvent('input', { bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    return true;
  })()`);
}

async function waitClinic(ev, label) {
  let sawScanning = false;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await ev(`(() => {
      const body = document.body?.innerText || '';
      const idx = Math.max(body.lastIndexOf('ISSUES FOUND'), body.lastIndexOf('Pass 1'));
      const slice = body.slice(Math.max(0, idx));
      const dbgs = [...new Set([...slice.matchAll(/DBG-\\d+/g)].map(m => m[0]))];
      const scanning = /Pass \\d|Deep ·|Scanning|Inventory/i.test(body.split(/\\n/).slice(-15).join('\\n'));
      const issues = /ISSUES FOUND/i.test(slice);
      const low = [...slice.matchAll(/\\bLOW\\b/gi)].length;
      return { dbgs: dbgs.length, sample: dbgs.slice(0, 8), scanning, issues, low };
    })()`);
    if (s.scanning) sawScanning = true;
    console.log(label, { ...s, sawScanning });
    if (sawScanning && s.issues && s.dbgs >= 3 && !s.scanning) return s;
  }
  return null;
}

async function waitFix(ev, label) {
  let sawWorking = false;
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const s = await ev(`(() => {
      const tail = (document.body?.innerText || '').slice(-6000);
      const working = /Fix · working|finishing |patching |writing | · repairing/i.test(tail);
      const done = /finished batch/i.test(tail) && /What’s next/i.test(tail) && !working;
      const interesting = tail.split(/\\n/).map(x => x.trim()).filter(l =>
        /finished batch|Batch results|updated|skipped|What’s next|Files touched/i.test(l)
      ).slice(-16);
      return { working, done, overlay: !!document.querySelector('[data-nova-code-overlay]'), interesting };
    })()`);
    if (s.working || s.overlay) sawWorking = true;
    if (i % 5 === 0) console.log(label, { ...s, sawWorking });
    if (sawWorking && s.done) return s;
  }
  return null;
}

function buttonDiffStat() {
  const files = ['RestorePrompt.tsx', 'RestoreGateModal.tsx', 'Sidebar.tsx', 'WindowControls.tsx'];
  return files.map((name) => {
    const abs = path.join(DEBLOAT, 'src/components', name);
    const text = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    const bare = [...text.matchAll(/<button\b(?![^>]*\btype=)/gi)].length;
    const typed = [...text.matchAll(/<button\b[^>]*\btype=/gi)].length;
    return { name, bare, typed, hasAny: /\(window as any\)/.test(text) };
  });
}

async function main() {
  console.log('DISK buttons', buttonDiffStat());
  const { ws, send, ev } = await connect();
  await send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 4500));
  await ev(`window.dispatchEvent(new CustomEvent('NOVA:bind-studio-disk', { detail: { diskPath: ${JSON.stringify(DEBLOAT)}, name: 'DeBloat' } })); true`);
  await new Promise((r) => setTimeout(r, 2000));

  console.log('=== REM1 ===');
  await sendAsk(ev, "What's remaining? Rescan for leftover problems.");
  const rem1 = await waitClinic(ev, 'rem1');

  console.log('=== FIX3 ===');
  await sendAsk(ev, 'fix next 3 low issues');
  const fix3 = await waitFix(ev, 'fix3');
  console.log('FIX3', fix3);
  console.log('DISK after fix3', buttonDiffStat());

  console.log('=== REM2 ===');
  await sendAsk(ev, 'How many remaining problems are left? Fresh rescan.');
  const rem2 = await waitClinic(ev, 'rem2');

  const layout = await ev(`(() => {
    const body = document.body?.innerText || '';
    const idx = body.lastIndexOf('What’s next');
    const snip = idx >= 0 ? body.slice(Math.max(0, idx - 180), idx + 200) : '';
    return { glued: /eval\\/exec[^\\n]{0,40}What’s next/i.test(body), snip };
  })()`);

  console.log('RESULT', JSON.stringify({ rem1: rem1?.dbgs, rem2: rem2?.dbgs, delta: (rem1?.dbgs ?? 0) - (rem2?.dbgs ?? 0), layout }, null, 2));
  ws.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
