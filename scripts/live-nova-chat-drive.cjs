/**
 * Continue / run multi-turn NOVA chat via Electron CDP (9229).
 */
const http = require('http');
const WebSocket = require('ws');

const CDP_PORT = Number(process.env.NOVA_CDP_PORT || 9229);

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function connectPage() {
  const list = await getJson(`http://127.0.0.1:${CDP_PORT}/json`);
  const page = (list || []).find((t) => t.type === 'page' && /NOVA/i.test(t.title || ''))
    || (list || []).find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No NOVA CDP page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  let nextId = 1;
  const pending = new Map();
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res?.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || JSON.stringify(res.exceptionDetails));
    }
    return res?.result?.value;
  };
  return { ws, send, evaluate };
}

async function waitForIdle(evaluate, { timeoutMs = 240_000, quietMs = 3500, minGrowth = 40 } = {}) {
  const start = Date.now();
  let lastLen = -1;
  let stableSince = Date.now();
  const baseline = await evaluate(`(document.body?.innerText || '').length`);
  while (Date.now() - start < timeoutMs) {
    const snap = await evaluate(`(() => {
      const gen = document.body?.innerText || '';
      const status = !!document.querySelector('[class*="nova-status"], [aria-live="polite"]');
      const stop = [...document.querySelectorAll('button')].some(b => /stop/i.test(b.getAttribute('aria-label') || b.textContent || ''));
      const busyText = /Researching|Reviewing sources|Reading layout|Thinking…|Creating folder|Craft ·|Contract floor|Writing project|layout references/i.test(gen);
      return { len: gen.length, stop, busyText, status, tail: gen.slice(-600) };
    })()`);
    if (snap.len !== lastLen) {
      lastLen = snap.len;
      stableSince = Date.now();
    }
    const grew = snap.len >= baseline + minGrowth;
    const quiet = Date.now() - stableSince >= quietMs;
    if (grew && quiet && !snap.stop && !snap.busyText) {
      return snap;
    }
    await sleep(1000);
  }
  const tail = await evaluate(`(document.body?.innerText || '').slice(-800)`);
  throw new Error('Timed out waiting for NOVA reply. Tail:\\n' + tail);
}

async function sendChat(evaluate, text) {
  const before = await evaluate(`(document.body?.innerText || '').length`);
  const payload = JSON.stringify(text);
  const ok = await evaluate(`(() => {
    const ta = document.querySelector('textarea[aria-label*="Message"], textarea');
    if (!ta) return { ok: false, reason: 'no textarea' };
    const text = ${payload};
    const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    ta.focus();
    desc.set.call(ta, text);
    ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    const sendBtn = [...document.querySelectorAll('button')].find(b => {
      const t = (b.getAttribute('aria-label') || '').toLowerCase();
      return t.includes('send');
    });
    if (sendBtn) {
      sendBtn.click();
      return { ok: true, via: 'button' };
    }
    ta.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
    }));
    return { ok: true, via: 'enter', left: ta.value };
  })()`);

  if (!ok?.ok) throw new Error('send failed: ' + (ok?.reason || 'unknown'));

  await sleep(400);
  const left = await evaluate(`document.querySelector('textarea')?.value || ''`);
  if (left && left.length > 5) {
    await evaluate(`(() => {
      const ta = document.querySelector('textarea');
      const text = ${payload};
      const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      desc.set.call(ta, text);
      ta.dispatchEvent(new InputEvent('input', { bubbles: true }));
      ta.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
      }));
    })()`);
  }

  const start = Date.now();
  while (Date.now() - start < 15000) {
    const now = await evaluate(`({
      len: (document.body?.innerText || '').length,
      ta: document.querySelector('textarea')?.value || '',
    })`);
    if (!now.ta || now.len > before + 20) return ok;
    await sleep(400);
  }
  return ok;
}

async function main() {
  console.log('Connecting to NOVA CDP…');
  const { evaluate, send, ws } = await connectPage();
  await send('Runtime.enable');
  await send('Page.bringToFront').catch(() => undefined);

  const turns = [
    "Yeah — trip boards, a left sidebar for lists, and a calm dark UI. Kind of like how Linear feels, but for travel planning.",
    "For the first viewport I want a marketing homepage, not the app shell yet. Sticky nav, sharp type, one indigo accent, hairline borders — linear.app vibes.",
    "Product name is Northline Atlas. Keep branding original — do not copy Linear logos or copy. Can you outline the page sections before we build?",
    "Perfect. Now create the project: Vite React site for Northline Atlas that looks like linear.app as the layout reference. Search the web for layout and React/Vite implementation ideas if helpful, then build files I can open in Live.",
  ];

  for (let i = 0; i < turns.length; i++) {
    const msg = turns[i];
    console.log(`\\n=== USER ${i + 1}/${turns.length} ===\\n${msg}\\n`);
    await sendChat(evaluate, msg);
    console.log('Waiting for NOVA…');
    const snap = await waitForIdle(evaluate, {
      timeoutMs: i === turns.length - 1 ? 480_000 : 240_000,
      quietMs: i === turns.length - 1 ? 5000 : 3500,
      minGrowth: i === turns.length - 1 ? 80 : 40,
    });
    console.log('--- assistant tail ---\\n' + String(snap.tail || '').slice(-700));
    await sleep(1500);
  }

  console.log('\\nDone — inspect NOVA Live / project files.');
  ws.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
