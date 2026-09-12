/**
 * Live incremental site build — one short chat prompt at a time.
 * Watch the Nova window; do not dump the whole brief in one shot.
 *
 * Usage:
 *   set ARK_CDP_PORT=9229
 *   node scripts/live-step-build.mjs
 */
import http from 'http';
import WebSocket from 'ws';

const port = process.env.ARK_CDP_PORT || '9229';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[step ${new Date().toISOString().slice(11, 19)}]`, ...a);

/** Natural one-ask-at-a-time prompts — talk like a person, not a spec sheet. */
const STEPS = [
  'Hey, can you make a new Vite React site called Nightglass? Start with just a pure black full-screen background for now.',
  'Nice. Put a small logo up in the top left.',
  'Add another little icon next to that logo.',
  'Now add a search bar in the top right.',
  'And a shopping bag icon next to the search bar.',
  'Under the header, put a big white title that says Nightglass.',
  'Add a short subtitle under that: Quiet light for dark rooms.',
  'Add an Explore button under the subtitle — white outline style.',
  'Give it a simple footer that just says Nightglass, with a thin line above it.',
  'Last thing — polish the spacing so the header, hero, and footer feel a bit more premium on desktop.',
];

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

async function connectCdp() {
  let targets;
  for (let i = 0; i < 40; i++) {
    try {
      targets = await fetchJson(`http://127.0.0.1:${port}/json`);
      if (Array.isArray(targets) && targets.length) break;
    } catch { /* retry */ }
    await sleep(500);
  }
  if (!targets?.length) throw new Error(`No CDP targets on ${port}`);
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    || targets.find((t) => t.webSocketDebuggerUrl);
  if (!page?.webSocketDebuggerUrl) throw new Error('No websocket target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', rej);
  });
  let nextId = 1;
  const waiters = new Map();
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && waiters.has(msg.id)) {
      const w = waiters.get(msg.id);
      waiters.delete(msg.id);
      if (msg.error) w.rej(new Error(JSON.stringify(msg.error)));
      else w.res(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = nextId++;
    waiters.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable', {});
  const ev = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'evaluate failed');
    }
    return result?.result?.value;
  };
  return { ws, ev, send };
}

async function resetChat(ev) {
  await ev(`(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const k of keys) {
      if (!k) continue;
      if (
        k === 'NOVA:recent-chats'
        || k.startsWith('NOVA:chat-studio:')
        || k.startsWith('NOVA:chat-messages:')
        || k.startsWith('NOVA:chat-thread:')
        || k.startsWith('NOVA:thread-brain:')
        || k.startsWith('NOVA:pending-greenfield:')
        || k.startsWith('NOVA:activity:')
        || k.startsWith('NOVA:last-disk:')
        || k.startsWith('NOVA:chat-code-pill:')
      ) localStorage.removeItem(k);
    }
    localStorage.setItem('NOVA:recent-chats', '[]');
    location.hash = '#/chat';
    return true;
  })()`);
  await sleep(1200);
}

async function sendChat(ev, text) {
  const payload = JSON.stringify(String(text || ''));
  return ev(`(async () => {
    const text = ${payload};
    const pick = () =>
      document.querySelector('textarea[placeholder*="Ask" i]')
      || document.querySelector('textarea[placeholder*="Message" i]')
      || document.querySelector('textarea[placeholder*="chat" i]')
      || document.querySelector('form textarea')
      || document.querySelector('textarea');
    let ta = pick();
    for (let i = 0; i < 40 && !ta; i++) {
      await new Promise((r) => setTimeout(r, 250));
      ta = pick();
    }
    if (!ta) return { ok: false, error: 'no textarea' };
    ta.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(ta, text);
    else ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const btn =
      document.querySelector('button[aria-label*="Send" i]')
      || document.querySelector('button[title*="Send" i]')
      || Array.from(document.querySelectorAll('button')).find((b) => /^\\s*send\\s*$/i.test((b.textContent || '').trim()))
      || Array.from(document.querySelectorAll('button')).find((b) => /send/i.test(b.getAttribute('aria-label') || ''));
    if (btn && !btn.disabled) {
      btn.click();
      return { ok: true, via: 'button' };
    }
    // Only use Enter when there is no Send button — never both (double-queues the same prompt).
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    return { ok: true, via: 'enter' };
  })()`);
}

async function waitTurnDone(ev, { timeoutMs = 420_000, label = '' } = {}) {
  const start = Date.now();
  let last = '';
  let idleHits = 0;
  // Give the send a moment to flip into generating / queue.
  await sleep(2500);
  while (Date.now() - start < timeoutMs) {
    const st = await ev(`(() => {
      const stopVisible = Array.from(document.querySelectorAll('button')).some((b) => {
        const t = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase();
        return /\\bstop\\b|cancel generation|stop generating/.test(t)
          && !/stopwatch|desktop/i.test(t);
      });
      const dots = !!document.querySelector('.ark-status-dot');
      const queueBanner = Array.from(document.querySelectorAll('div,p,span'))
        .some((n) => /message queued|messages queued/i.test(n.textContent || ''));
      const statusLine = (() => {
        const live = document.querySelector('[aria-live="polite"]');
        return (live?.textContent || '').trim().slice(0, 160);
      })();
      const generatingHint = /Building with|Writing |Updating |Installing|Importing|Equipped|Multi-model|Reading your brief|Creating folder|Finishing setup|Polishing|Repairing|Opening localhost|Applying your change|Patching App/i.test(statusLine);
      return {
        generating: stopVisible || dots || generatingHint || queueBanner,
        stopVisible,
        dots,
        queueBanner,
        statusLine,
      };
    })()`);
    const snap = `${st?.generating}|${st?.stopVisible}|${st?.dots}|${st?.queueBanner}|${(st?.statusLine || '').slice(0, 50)}`;
    if (snap !== last) {
      last = snap;
      log(label, st?.generating ? 'working…' : 'settling…', (st?.statusLine || '').replace(/\\s+/g, ' ').slice(0, 100));
    }
    if (!st?.generating) {
      idleHits += 1;
      // Require a longer idle so we never enqueue the next ask on top of the same create.
      if (idleHits >= 5) return true;
    } else {
      idleHits = 0;
    }
    await sleep(2000);
  }
  throw new Error(`timeout waiting for turn: ${label}`);
}

async function clearQueue(ev) {
  await ev(`(() => {
    const clearBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => /^\\s*clear\\s*$/i.test((b.textContent || '').trim()));
    if (clearBtn) clearBtn.click();
    return Boolean(clearBtn);
  })()`);
  await sleep(400);
}

async function main() {
  log('connecting CDP', port);
  const { ws, ev } = await connectCdp();
  log('resetting chat for a clean Nightglass run');
  await resetChat(ev);

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    // Never stack the next ask while a reply (or queue) is still active.
    await clearQueue(ev);
    await waitTurnDone(ev, { label: `pre${i + 1}`, timeoutMs: 60_000 }).catch(() => {});
    log(`STEP ${i + 1}/${STEPS.length}`, step.slice(0, 90) + '…');
    const sent = await sendChat(ev, step);
    log('sent', sent);
    if (!sent?.ok) throw new Error(`send failed: ${JSON.stringify(sent)}`);
    await waitTurnDone(ev, { label: `step${i + 1}` });
    await clearQueue(ev);
    log(`STEP ${i + 1} done — pausing so you can watch Preview`);
    await sleep(3500);
  }

  log('ALL STEPS COMPLETE');
  try { ws.close(); } catch { /* ignore */ }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
