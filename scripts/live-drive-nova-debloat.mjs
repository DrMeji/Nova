/**
 * Live-drive NOVA: bind Desktop DeBloat, arm Debug, send clinic (React-safe).
 */
import WebSocket from 'ws';

const DEBLOAT = 'C:\\Users\\thoma\\Desktop\\Projects\\DeBloat';

async function getWsUrl() {
  const res = await fetch('http://127.0.0.1:9229/json');
  const pages = await res.json();
  const page = pages.find((p) => /NOVA/i.test(p.title) || /index\.html/i.test(p.url)) || pages[0];
  if (!page?.webSocketDebuggerUrl) throw new Error('No CDP page target');
  return page.webSocketDebuggerUrl;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    ws.on('open', () => resolve({
      ws,
      send(method, params = {}) {
        const id = nextId++;
        return new Promise((res, rej) => {
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      },
    }));
    ws.on('error', reject);
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.id != null && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      }
    });
  });
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const d = result.exceptionDetails;
    throw new Error(d.exception?.description || d.text || 'evaluate failed');
  }
  return result.result?.value;
}

const SET_COMPOSER = `
function setComposerText(text) {
  const ta = [...document.querySelectorAll('textarea')].find(n => n.getClientRects().length) || document.querySelector('textarea');
  if (!ta) return { ok: false, error: 'no textarea' };
  ta.focus();
  const proto = HTMLTextAreaElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  const tracker = ta._valueTracker;
  if (tracker) tracker.setValue('');
  if (desc?.set) desc.set.call(ta, text); else ta.value = text;
  ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, value: ta.value, reactValueMatch: ta.value === text };
}
`;

async function main() {
  const client = await connect(await getWsUrl());
  await client.send('Runtime.enable');
  await client.send('Page.bringToFront').catch(() => {});

  console.log('1) Bind Desktop DeBloat via event (diskPath)…');
  const bind = await evaluate(client, `
    (async () => {
      const diskPath = ${JSON.stringify(DEBLOAT)};
      window.dispatchEvent(new CustomEvent('NOVA:bind-studio-disk', {
        detail: { diskPath, name: 'DeBloat' },
      }));
      // Give hydrate a moment
      await new Promise(r => setTimeout(r, 1200));
      return {
        dispatched: true,
        diskPath,
        pills: [...document.querySelectorAll('button,span,[class*="pill"]')]
          .map(el => (el.textContent || '').trim())
          .filter(t => /debloat|debug|bind|files/i.test(t))
          .slice(0, 12),
      };
    })()
  `);
  console.log(bind);

  console.log('2) Open + menu → Debug…');
  const menu = await evaluate(client, `
    (async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      // Close any open dialogs
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(200);
      const plus = [...document.querySelectorAll('button')].find(b =>
        b.querySelector('svg.lucide-plus, svg[class*="plus"]')
        || (b.getAttribute('aria-label') || '').toLowerCase().includes('plus')
        || b.textContent?.trim() === '+'
      );
      if (!plus) return { ok: false, error: 'no plus' };
      plus.click();
      await sleep(450);
      const debugBtn = [...document.querySelectorAll('button,[role="menuitem"]')].find(b =>
        /^\\s*Debug\\s*$/i.test(b.textContent || '')
      );
      if (!debugBtn) return { ok: false, error: 'no debug item', plus: true };
      debugBtn.click();
      await sleep(800);
      return { ok: true };
    })()
  `);
  console.log(menu);

  // If Debug opened a folder picker earlier it may steal focus — re-bind after.
  await evaluate(client, `
    window.dispatchEvent(new CustomEvent('NOVA:bind-studio-disk', {
      detail: { diskPath: ${JSON.stringify(DEBLOAT)}, name: 'DeBloat' },
    }));
    true
  `);
  await new Promise((r) => setTimeout(r, 1500));

  console.log('3) Type clinic seed visibly…');
  const typed = await evaluate(client, `
    ${SET_COMPOSER}
    (async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const text = 'Find all problems in this project.';
      // Clear first
      setComposerText('');
      await sleep(80);
      const ta = [...document.querySelectorAll('textarea')].find(n => n.getClientRects().length);
      if (!ta) return { ok: false, error: 'no ta' };
      ta.focus();
      let cur = '';
      const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      for (const ch of text) {
        cur += ch;
        const tracker = ta._valueTracker;
        if (tracker) tracker.setValue(cur.slice(0, -1));
        if (desc?.set) desc.set.call(ta, cur); else ta.value = cur;
        ta.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
        await sleep(30);
      }
      return { ok: true, value: ta.value };
    })()
  `);
  console.log(typed);

  console.log('4) Submit with Enter (React key handler)…');
  await evaluate(client, `
    (() => {
      const ta = [...document.querySelectorAll('textarea')].find(n => n.getClientRects().length);
      if (!ta) return false;
      ta.focus();
      const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      const down = new KeyboardEvent('keydown', opts);
      const ok = ta.dispatchEvent(down);
      ta.dispatchEvent(new KeyboardEvent('keyup', opts));
      return ok;
    })()
  `);

  // CDP Input as backup while focused
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  });
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  });

  console.log('5) Watch for clinic…');
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const status = await evaluate(client, `
      (() => {
        const body = document.body?.innerText || '';
        const lines = body.split(/\\n/).map(s => s.trim()).filter(Boolean);
        const interesting = lines.filter(l =>
          /debug clinic|pass [123]|issues found|dbg-\\d+|scanning|clinic ready|deep ·|grant access|debloat|files ·/i.test(l)
        ).slice(0, 12);
        return {
          interesting,
          hasUserBubble: /Find all problems/i.test(body),
          dbgCount: (body.match(/DBG-\\d+/g) || []).length,
        };
      })()
    `);
    console.log(`t+${(i + 1) * 2}s`, JSON.stringify(status));
    if ((status?.dbgCount || 0) >= 2 || /clinic ready|issues found/i.test((status?.interesting || []).join(' '))) {
      console.log('Clinic results visible.');
      break;
    }
  }

  client.ws.close();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
