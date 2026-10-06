/**
 * Focused live multi-fix after layout + batch fixes.
 * remaining → fix 3 low → remaining → fix 5 low → fix 1 → fix 1 → fix 3 → remaining
 */
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
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  };
  return { ws, send, ev };
}

function anyCastFiles() {
  return ['RestorePrompt.tsx', 'RestoreGateModal.tsx', 'WindowControls.tsx'].map((name) => {
    const rel = `src/components/${name}`;
    const abs = path.join(DEBLOAT, rel);
    const text = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    return { rel, hasAny: /\(window as any\)/.test(text), hasUnknown: /as unknown as/.test(text), mtime: fs.existsSync(abs) ? fs.statSync(abs).mtime.toISOString() : null };
  });
}

async function sendAsk(ev, text) {
  const lit = JSON.stringify(text);
  return ev(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(250);
    const ta = [...document.querySelectorAll('textarea')].find(n => n.getClientRects().length);
    if (!ta) return { ok: false };
    ta.focus();
    const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    const text = ${lit};
    const tracker = ta._valueTracker; if (tracker) tracker.setValue('');
    if (desc?.set) desc.set.call(ta, text); else ta.value = text;
    ta.dispatchEvent(new InputEvent('input', { bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    return { ok: true };
  })()`);
}

async function waitClinic(ev, label, maxSec = 300) {
  const t0 = Date.now();
  let last = null;
  let sawScanning = false;
  while ((Date.now() - t0) / 1000 < maxSec) {
    await new Promise((r) => setTimeout(r, 2000));
    last = await ev(`(() => {
      const body = document.body?.innerText || '';
      // Prefer the LAST clinic block only.
      const idx = Math.max(body.lastIndexOf('ISSUES FOUND'), body.lastIndexOf('Debug clinic'));
      const slice = idx >= 0 ? body.slice(idx) : body.slice(-4000);
      const dbgs = [...new Set([...slice.matchAll(/DBG-\\d+/g)].map(m => m[0]))];
      const issues = /ISSUES FOUND/i.test(slice);
      const scanning = /Pass \\d|Deep ·|Scanning|Inventory/i.test(body.split(/\\n/).slice(-12).join('\\n'));
      return { dbgs: dbgs.length, sample: dbgs.slice(0, 6), issues, scanning };
    })()`);
    if (last?.scanning) sawScanning = true;
    console.log(label, { ...last, sawScanning });
    if (sawScanning && last?.issues && last.dbgs >= 3 && !last.scanning) return last;
  }
  return last;
}

async function waitFix(ev, label, maxSec = 300) {
  const t0 = Date.now();
  let last = null;
  let sawWorking = false;
  const marker = `nova-fix-${Date.now()}`;
  while ((Date.now() - t0) / 1000 < maxSec) {
    await new Promise((r) => setTimeout(r, 1200));
    last = await ev(`(() => {
      const body = document.body?.innerText || '';
      const tail = body.slice(-5000);
      const interesting = tail.split(/\\n/).map(x => x.trim()).filter(l =>
        /finished batch|What’s next|Files touched|skipped \\(no write\\)|updated|Agent ·|writing |patching |Batch results/i.test(l)
      ).slice(-20);
      const working = /Fix · working|finishing .*open item| · repairing|writing /i.test(tail);
      const done = /finished batch/i.test(tail) && /What’s next/i.test(tail) && !working;
      return { interesting, overlay: !!document.querySelector('[data-nova-code-overlay]'), done, working };
    })()`);
    if (last?.working || last?.overlay) sawWorking = true;
    if (Math.floor((Date.now() - t0) / 1200) % 4 === 0) console.log(label, { ...last, sawWorking });
    if (sawWorking && last?.done) {
      await new Promise((r) => setTimeout(r, 900));
      return last;
    }
  }
  return { ...last, marker };
}

async function main() {
  console.log('DISK BEFORE', anyCastFiles());
  const { ws, send, ev } = await connect();
  console.log('Reload…');
  await send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 4500));
  for (let i = 0; i < 40; i++) {
    if (await ev(`!![...document.querySelectorAll('textarea')].find(n => n.getClientRects().length)`)) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  await ev(`window.dispatchEvent(new CustomEvent('NOVA:bind-studio-disk', { detail: { diskPath: ${JSON.stringify(DEBLOAT)}, name: 'DeBloat' } })); true`);
  await new Promise((r) => setTimeout(r, 2000));

  console.log('\\n=== REMAINING 1 ===');
  await sendAsk(ev, "What's remaining that still needs to be fixed? Rescan the project.");
  const rem1 = await waitClinic(ev, 'rem1');
  console.log('REM1', rem1);

  console.log('\\n=== FIX 3 LOW ===');
  await sendAsk(ev, 'fix next 3 low issues');
  const fix3 = await waitFix(ev, 'fix3');
  console.log('FIX3', fix3);
  console.log('DISK after3', anyCastFiles());

  console.log('\\n=== REMAINING 2 ===');
  await sendAsk(ev, 'How many remaining problems are left? Rescan.');
  const rem2 = await waitClinic(ev, 'rem2');
  console.log('REM2', rem2);

  console.log('\\n=== FIX 5 LOW ===');
  await sendAsk(ev, 'fix next 5 low issues');
  const fix5 = await waitFix(ev, 'fix5', 420);
  console.log('FIX5', fix5);
  console.log('DISK after5', anyCastFiles());

  console.log('\\n=== FIX 1A ===');
  await sendAsk(ev, 'do next work item');
  const f1a = await waitFix(ev, 'f1a', 120);
  console.log('F1A', f1a);

  console.log('\\n=== FIX 1B ===');
  await sendAsk(ev, 'do next work item');
  const f1b = await waitFix(ev, 'f1b', 120);
  console.log('F1B', f1b);

  console.log('\\n=== FIX 3 LOW AGAIN ===');
  await sendAsk(ev, 'fix next 3 low issues');
  const fix3b = await waitFix(ev, 'fix3b');
  console.log('FIX3B', fix3b);

  console.log('\\n=== REMAINING FINAL ===');
  await sendAsk(ev, "What's left to fix? Show remaining problems.");
  const rem3 = await waitClinic(ev, 'rem3');
  console.log('REM3', rem3);

  const layout = await ev(`(() => {
    const body = document.body?.innerText || '';
    const idx = body.lastIndexOf('What’s next');
    return {
      hasWhatsNext: idx >= 0,
      glued: /eval\\/exec[\\s\\S]{0,30}Queue clear/i.test(body),
      snippet: idx >= 0 ? body.slice(Math.max(0, idx - 120), idx + 220) : body.slice(-400),
    };
  })()`);
  console.log('LAYOUT', layout);
  console.log('SUMMARY', JSON.stringify({
    rem1: rem1?.dbgs, rem2: rem2?.dbgs, rem3: rem3?.dbgs,
    fix3: !!fix3?.done, fix5: !!fix5?.done, f1a: !!f1a?.done, f1b: !!f1b?.done, fix3b: !!fix3b?.done,
    anyLeft: anyCastFiles().filter(f => f.hasAny).map(f => f.rel),
  }, null, 2));
  ws.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
