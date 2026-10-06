/**
 * Live: rescan → multi-id chat fix → Repair button → verify security write.
 */
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';

const DEBLOAT = 'C:\\Users\\thoma\\Desktop\\Projects\\DeBloat';
const MAIN = path.join(DEBLOAT, 'electron', 'main.ts');

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

function mainSnap() {
  const text = fs.existsSync(MAIN) ? fs.readFileSync(MAIN, 'utf8') : '';
  return {
    len: text.length,
    mtime: fs.existsSync(MAIN) ? fs.statSync(MAIN).mtime.toISOString() : null,
    hasExecShell: /\bexec\(\s*['"`]shutdown/i.test(text),
    hasExecFileShutdown: /execFile\(\s*['"]shutdown['"]/i.test(text),
    hasSecureMarker: /nova-secure:\s*fixed-argv/i.test(text),
    hasExecImport: /const\s*\{[^}]*\bexecFile\b[^}]*\}\s*=\s*require\(\s*['"]child_process['"]/i.test(text),
  };
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
    return { ok: true, text };
  })()`);
}

async function waitClinic(ev, label) {
  let sawScanning = false;
  for (let i = 0; i < 130; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await ev(`(() => {
      const body = document.body?.innerText || '';
      const idx = Math.max(body.lastIndexOf('ISSUES FOUND'), body.lastIndexOf('Pass 1'));
      const slice = body.slice(Math.max(0, idx));
      const dbgs = [...new Set([...slice.matchAll(/DBG-(\\d+)/g)].map(m => m[0]))];
      const nums = [...new Set([...slice.matchAll(/DBG-(\\d+)/g)].map(m => Number(m[1])))].sort((a,b)=>a-b);
      const scanning = /Pass \\d|Deep ·|Scanning|Inventory/i.test(body.split(/\\n/).slice(-15).join('\\n'));
      return { dbgs: dbgs.length, nums: nums.slice(0, 24), scanning, issues: /ISSUES FOUND/i.test(slice) };
    })()`);
    if (s.scanning) sawScanning = true;
    console.log(label, { ...s, sawScanning });
    if (sawScanning && s.issues && s.dbgs >= 3 && !s.scanning) return s;
  }
  return null;
}

async function waitFix(ev, label, maxSec = 360) {
  let sawWorking = false;
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < maxSec) {
    await new Promise((r) => setTimeout(r, 1200));
    const s = await ev(`(() => {
      const tail = (document.body?.innerText || '').slice(-7000);
      const working = /Fix · working|finishing |patching |writing |hardening | · repairing/i.test(tail);
      const done = (/finished batch|finished DBG-|Files touched|What’s next/i.test(tail)) && !working;
      const interesting = tail.split(/\\n/).map(x => x.trim()).filter(l =>
        /finished batch|Batch results|updated|could not write|skipped|What’s next|Files touched|hardening|execFile|DBG-/i.test(l)
      ).slice(-22);
      return { working, done, overlay: !!document.querySelector('[data-nova-code-overlay]'), interesting };
    })()`);
    if (s.working || s.overlay) sawWorking = true;
    if (Math.floor((Date.now() - t0) / 1200) % 5 === 0) console.log(label, { ...s, sawWorking });
    if (sawWorking && s.done) return s;
  }
  return null;
}

async function main() {
  console.log('DISK BEFORE', mainSnap());
  const { ws, send, ev } = await connect();
  await send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 4500));
  for (let i = 0; i < 30; i++) {
    if (await ev(`!![...document.querySelectorAll('textarea')].find(n => n.getClientRects().length)`)) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  await ev(`window.dispatchEvent(new CustomEvent('NOVA:bind-studio-disk', { detail: { diskPath: ${JSON.stringify(DEBLOAT)}, name: 'DeBloat' } })); true`);
  await new Promise((r) => setTimeout(r, 2000));

  console.log('\\n=== RESCAN ===');
  await sendAsk(ev, "What's remaining that still needs to be fixed? Rescan the project.");
  const rem = await waitClinic(ev, 'clinic');
  console.log('CLINIC', rem);

  const nums = rem?.nums || [];
  // Prefer a mix: pick several real IDs including extremes (1, mid, high) like the user ask pattern.
  const pick = [];
  for (const n of [1, 7, 15, 17, 18]) {
    if (nums.includes(n)) pick.push(n);
  }
  // Fill from available if some missing
  for (const n of nums) {
    if (pick.length >= 5) break;
    if (!pick.includes(n)) pick.push(n);
  }
  const ask = pick.length >= 2
    ? `fix ${pick.slice(0, 3).join(', ')}${pick.length > 3 ? `, and ${pick.slice(3).map((n) => (n === 1 ? 'number one' : n === 7 ? 'number seven' : n)).join(' and ')}` : ''}`
    : 'fix next 3 low issues';
  console.log('\\n=== MULTI-ID ASK ===', ask);
  await sendAsk(ev, ask);
  const multi = await waitFix(ev, 'multi');
  console.log('MULTI', multi);
  console.log('DISK after multi', mainSnap());

  console.log('\\n=== REPAIR BUTTON ===');
  const clicked = await ev(`(() => {
    const buttons = [...document.querySelectorAll('button')].filter(b => /^\\s*Repair\\s*$/i.test((b.textContent || '').trim()));
    // Prefer a LOW any-cast / button if present; else first Repair
    for (const b of buttons) {
      const wrap = b.closest('li') || b.parentElement?.parentElement || b.parentElement;
      const t = wrap?.textContent || '';
      if (/any|button missing type/i.test(t)) { b.click(); return { ok: true, via: 'surgical', n: buttons.length, snippet: t.slice(0, 120) }; }
    }
    if (buttons[0]) { buttons[0].click(); return { ok: true, via: 'first', n: buttons.length }; }
    return { ok: false, n: buttons.length };
  })()`);
  console.log('clicked', clicked);
  let repair = null;
  if (clicked?.ok) repair = await waitFix(ev, 'repair', 240);
  console.log('REPAIR', repair);
  console.log('DISK FINAL', mainSnap());

  console.log('SUMMARY', JSON.stringify({
    clinicCount: rem?.dbgs,
    ask,
    pick,
    multiDone: !!multi?.done,
    repairDone: !!repair?.done,
    disk: mainSnap(),
  }, null, 2));
  ws.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
