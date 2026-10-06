import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';

const DEBLOAT = 'C:\\Users\\thoma\\Desktop\\Projects\\DeBloat';
const TARGET = 'src/components/RestoreGateModal.tsx';

async function connect() {
  const pages = await (await fetch('http://127.0.0.1:9229/json')).json();
  const page = pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
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

function snap() {
  const abs = path.join(DEBLOAT, TARGET);
  const text = fs.readFileSync(abs, 'utf8');
  return {
    abs,
    len: text.length,
    mtime: fs.statSync(abs).mtime.toISOString(),
    hasAny: /\(window as any\)/.test(text),
    hasUnknown: /as unknown as/.test(text),
    hasSpinner: /restore-spinner/.test(text),
    line7: text.split(/\n/)[6],
  };
}

async function main() {
  const before = snap();
  console.log('BEFORE', before);
  if (!before.hasAny) {
    console.log('Target already fixed — aborting so we do not false-pass.');
    process.exit(3);
  }

  const { ws, send, ev } = await connect();
  console.log('Reload…');
  await send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 3500));

  console.log('Bind DeBloat…');
  await ev(`(() => {
    window.dispatchEvent(new CustomEvent('NOVA:bind-studio-disk', {
      detail: { diskPath: ${JSON.stringify(DEBLOAT)}, name: 'DeBloat' },
    }));
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 2000));

  console.log('Ask clinic…');
  await ev(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(200);
    const ta = [...document.querySelectorAll('textarea')].find(n => n.getClientRects().length);
    if (!ta) return false;
    ta.focus();
    const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    const text = 'Find all problems in this project.';
    const tracker = ta._valueTracker; if (tracker) tracker.setValue('');
    if (desc?.set) desc.set.call(ta, text); else ta.value = text;
    ta.dispatchEvent(new InputEvent('input', { bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    return true;
  })()`);

  console.log('Wait for Issues found…');
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await ev(`(() => {
      const body = document.body?.innerText || '';
      return {
        issues: /ISSUES FOUND/i.test(body),
        dbg: [...new Set([...body.matchAll(/DBG-\\d+/g)].map(m => m[0]))].length,
      };
    })()`);
    console.log('clinic', s);
    if (s.issues && s.dbg >= 5) break;
  }

  console.log('Click LOW Repair for RestoreGateModal any-cast…');
  const clicked = await ev(`(() => {
    const buttons = [...document.querySelectorAll('button')].filter(b => /^\\s*Repair\\s*$/i.test((b.textContent || '').trim()));
    for (const b of buttons) {
      const section = b.closest('section') || b.closest('[class]') || b.parentElement?.parentElement?.parentElement;
      const wrap = b.closest('li') || b.parentElement?.parentElement || b.parentElement;
      const t = ((wrap?.textContent || '') + ' ' + (section?.textContent || '')).slice(0, 800);
      const inLow = /\\blow\\b/i.test(t) || Boolean(b.closest('section')?.querySelector('h4,header')?.textContent?.match(/low/i));
      if (!inLow && !/RestoreGateModal/i.test(t)) continue;
      if (/RestoreGateModal/i.test(t) && /any/i.test(t)) {
        b.scrollIntoView({ block: 'center' });
        b.click();
        return { ok: true, via: 'restore-gate-any', snippet: t.slice(0, 160) };
      }
    }
    // Fallback: type a precise fix ask
    const ta = [...document.querySelectorAll('textarea')].find(n => n.getClientRects().length);
    if (!ta) return { ok: false, n: buttons.length };
    const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    const text = 'fix the low as any cast in src/components/RestoreGateModal.tsx';
    const tracker = ta._valueTracker; if (tracker) tracker.setValue('');
    if (desc?.set) desc.set.call(ta, text); else ta.value = text;
    ta.dispatchEvent(new InputEvent('input', { bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    return { ok: true, via: 'typed-ask', n: buttons.length };
  })()`);
  console.log('clicked', clicked);
  if (!clicked?.ok) {
    ws.close();
    process.exit(2);
  }

  let sawOverlay = false;
  let sawWriting = false;
  let done = false;
  let lastUi = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const s = await ev(`(() => {
      const body = document.body?.innerText || '';
      const overlayOpen = Boolean(
        document.querySelector('[data-nova-code-overlay], .nova-code-overlay')
        || [...document.querySelectorAll('div')].some(d => /RestoreGateModal\\.tsx/i.test(d.textContent || '') && d.querySelector('textarea, pre, code, [contenteditable]'))
      );
      const interesting = body.split(/\\n/).map(x => x.trim()).filter(l =>
        /finished DBG|could not finish|Files touched|patching|writing |Agent ·|Fix ·|code/i.test(l)
      ).slice(0, 16);
      return {
        interesting,
        done: /finished DBG-|Files touched/i.test(body) && /RestoreGateModal/i.test(body),
        overlayHint: overlayOpen,
        writing: /writing |patching /i.test(body),
      };
    })()`);
    lastUi = s;
    if (s.overlayHint) sawOverlay = true;
    if (s.writing) sawWriting = true;
    if (i % 2 === 0) console.log('tick', i, { sawOverlay, sawWriting, done: s.done, interesting: s.interesting?.slice(0, 6) });
    if (s.done) { done = true; break; }
    // Also accept disk change mid-loop
    const mid = snap();
    if (mid.hasUnknown && !mid.hasAny) { done = true; break; }
  }

  // Wait for overlay auto-close beat + write verify
  await new Promise((r) => setTimeout(r, 1200));
  const after = snap();
  const verdict = after.hasUnknown && !after.hasAny && after.hasSpinner !== false && after.len > 500
    ? 'FIXED_ON_DISK'
    : (after.hasAny ? 'STILL_HAS_ANY' : 'UNKNOWN');

  console.log('AFTER', after);
  console.log('UI', lastUi);
  console.log(JSON.stringify({
    verdict,
    sawOverlay,
    sawWriting,
    done,
    lenDelta: after.len - before.len,
    mtimeBefore: before.mtime,
    mtimeAfter: after.mtime,
  }, null, 2));

  ws.close();
  if (verdict !== 'FIXED_ON_DISK') process.exit(4);
}

main().catch((e) => { console.error(e); process.exit(1); });
