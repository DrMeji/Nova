/**
 * Human-paced one-step Nova driver (CDP).
 * Usage:
 *   node scripts/live-step-driver.mjs "your natural prompt"
 *   node scripts/live-step-driver.mjs --new-chat
 *   node scripts/live-step-driver.mjs --stop
 *   node scripts/live-step-driver.mjs --status
 *   node scripts/live-step-driver.mjs --wait 180000
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const args = process.argv.slice(2);
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

async function connect() {
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = (list || []).find((t) => {
    if (t.type !== 'page' || !t.webSocketDebuggerUrl) return false;
    if (/NOVA/i.test(String(t.title || ''))) return true;
    const blob = `${t.title || ''} ${t.url || ''}`;
    return /dist\/index|file:\/\//i.test(blob);
  });
  if (!page) throw new Error('Nova page not on CDP');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
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
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  await send('Runtime.enable');
  return { ws, evalE };
}

const { ws, evalE } = await connect();

if (args[0] === '--stop') {
  const ok = await evalE(`(() => {
    const els = [...document.querySelectorAll('button,[role=button]')];
    const stop = els.find(el => /stop|cancel|abort/i.test((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')));
    if (stop) stop.click();
    return Boolean(stop);
  })()`);
  console.log(ok ? 'stopped' : 'no-stop-btn');
  ws.close();
  process.exit(0);
}

if (args[0] === '--new-chat') {
  const ok = await evalE(`(() => {
    try { window.dispatchEvent(new CustomEvent('NOVA:new-chat')); return true; }
    catch { return false; }
  })()`);
  await sleep(500);
  if (!ok) {
    await evalE(`(() => {
      const els = [...document.querySelectorAll('button,[role=button],a')];
      const chat = els.filter(el => (el.getAttribute('aria-label') || '') === 'Chat')
        .sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0];
      if (chat) chat.click();
      return true;
    })()`);
    await sleep(800);
  }
  const clicked = await evalE(`(() => {
    const els = [...document.querySelectorAll('button,[role=button],a')];
    const hit = els.find(el => /new chat|new conversation/i.test((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')));
    if (hit) hit.click();
    return Boolean(hit) || ${ok ? 'true' : 'false'};
  })()`);
  console.log(clicked ? 'new-chat' : 'new-chat-miss');
  ws.close();
  process.exit(0);
}

if (args[0] === '--status' || args[0] === '--wait') {
  const maxMs = args[0] === '--wait' ? Number(args[1] || 180000) : 0;
  const t0 = Date.now();
  for (;;) {
    const snap = await evalE(`(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
      }
      let best = null;
      for (const k of keys) {
        let arr = [];
        try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
        if (!arr.length) continue;
        const last = arr[arr.length - 1];
        const user = [...arr].reverse().find(m => m.role === 'user');
        const row = {
          user: String(user?.content || '').slice(0, 100),
          role: last?.role,
          content: String(last?.content || '').slice(0, 220),
          generating: last?.role === 'assistant' && /^__generating__:/i.test(String(last.content || '')),
        };
        if (!best || row.generating) best = row;
      }
      let job = null;
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (!k || !/^nova-create-job:/.test(k)) continue;
        try {
          const j = JSON.parse(sessionStorage.getItem(k) || 'null');
          if (!j) continue;
          job = {
            name: j.name, status: j.status, stage: j.stage, error: j.error,
            files: Object.keys(j.files || {}).length, path: j.path,
            obs: String(j.lastObservation || '').slice(0, 120),
          };
        } catch {}
      }
      return { best, job };
    })()`);
    const st = snap?.best?.generating
      ? String(snap.best.content || '').replace(/^__generating__:/, '')
      : (snap?.best?.content || '');
    console.log(JSON.stringify({
      generating: Boolean(snap?.best?.generating),
      status: String(st).slice(0, 160),
      job: snap?.job || null,
      user: snap?.best?.user || '',
    }));
    if (args[0] === '--status') break;
    if (!snap?.best?.generating && snap?.best?.content && !/^__generating__:/i.test(snap.best.content)) break;
    if (Date.now() - t0 > maxMs) {
      console.log('WAIT_TIMEOUT');
      break;
    }
    await sleep(4000);
  }
  ws.close();
  process.exit(0);
}

// --open <needle>  → open an existing chat whose user text matches needle, then exit
if (args[0] === '--open') {
  const needle = args.slice(1).join(' ').trim().toLowerCase();
  if (!needle) {
    console.error('need a needle');
    process.exit(2);
  }
  const opened = await evalE(`(() => {
    const needle = ${JSON.stringify(needle)};
    // Prefer sidebar / history buttons that mention the needle.
    const els = [...document.querySelectorAll('button,[role=button],a,[data-chat-id]')];
    const hit = els.find((el) => {
      const t = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).toLowerCase();
      return t.includes(needle) || t.includes('oak');
    });
    if (hit) { hit.click(); return 'click:' + ((hit.getAttribute('aria-label') || hit.textContent || '').slice(0, 60)); }
    // Fallback: find thread key and dispatch route via hash if present.
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/NOVA:chat-thread:chat:/.test(k)) continue;
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
      const blob = arr.map((m) => String(m.content || '')).join('\\n').toLowerCase();
      if (!blob.includes(needle)) continue;
      const id = k.replace(/^.*chat:/, '');
      try {
        window.dispatchEvent(new CustomEvent('NOVA:open-chat', { detail: { chatId: id } }));
      } catch {}
      if (location.hash !== undefined) {
        try { history.pushState({}, '', '#/chat/' + id); window.dispatchEvent(new PopStateEvent('popstate')); } catch {}
      }
      return 'thread:' + id.slice(0, 24);
    }
    return null;
  })()`);
  console.log(opened ? `open: ${opened}` : 'open-miss');
  ws.close();
  process.exit(opened ? 0 : 1);
}

const prompt = args.join(' ').trim();
if (!prompt) {
  console.error('need a prompt');
  process.exit(2);
}

// Stay on the current chat — do NOT click the Chat nav (that mints a blank starter).
const sent = await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) throw new Error('no textarea');
  const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  d.set.call(ta, ${JSON.stringify(prompt)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  return true;
})()`);
console.log(sent ? `sent: ${prompt}` : 'send-failed');
ws.close();
