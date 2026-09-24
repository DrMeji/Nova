/**
 * New chat only. Natural conversation → Apple-style homepage → one edit.
 * No "don't build" / "don't create" instructions. Does not hand-write the site.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = Number(process.env.NOVA_CDP_PORT || 9368);
const OUT = path.join(root, '.tmp-apple-watch');
fs.mkdirSync(OUT, { recursive: true });
const SLUG = `AppleHome-${Date.now().toString(36).slice(-5)}`;

const TURNS = [
  {
    id: 'convo-plan',
    newChat: true,
    timeoutMs: 180000,
    ask: [
      'Hey. I want a homepage that feels like apple.com.',
      'Thin nav across the top with the product names, a huge hero for a new phone, then colorful bands for Mac, iPad, Watch, and AirPods.',
      'Lots of white space, big type, and that slow premium motion. Footer with store, support, and the usual links.',
    ].join(' '),
  },
  {
    id: 'convo-confirm',
    newChat: false,
    timeoutMs: 180000,
    ask: [
      'Yeah, that direction. Keep the hero huge and quiet, product names in the nav where they belong, and each product band its own color.',
      'The pictures should look like the products, not random scenery. Tell me how you would lay that page out.',
    ].join(' '),
  },
  {
    id: 'build',
    newChat: false,
    timeoutMs: 1200000,
    ask: [
      `Alright, build it. New Vite React project called ${SLUG}.`,
      'Make it look like apple.com: black nav with product names, a full-width phone hero, then Mac, iPad, Watch, and AirPods bands with their own colors and motion.',
      'White space, big type, real buttons, and a footer. Plain JavaScript JSX. Take your time.',
    ].join(' '),
  },
  {
    id: 'edit',
    newChat: false,
    timeoutMs: 720000,
    ask: [
      `On the ${SLUG} page, change the hero headline to “Hello” and add a thin line under the nav that says “Now available”.`,
      'Leave the rest of the page as it is.',
    ].join(' '),
  },
];

function fetchJson(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('timeout ' + url));
    });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
    await this.send('Runtime.enable');
    await this.send('Page.enable');
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval');
    return r.result?.value;
  }
  close() { try { this.ws.close(); } catch { /* */ } }
}

function judgeReply(text, turnId) {
  const problems = [];
  const t = String(text || '');
  if (!t.trim()) problems.push('empty-reply');
  if (/@@@FILE\b|```(?:jsx|tsx|css|html|javascript)/i.test(t)) problems.push('code-in-chat');
  if (/I scanned\s+\*\*0 source files\*\*|Local scan/i.test(t)) problems.push('local-scan-misroute');
  if (/Hello!\s*How can I assist you today/i.test(t)) problems.push('canned-greeting');
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]{4,}/.test(t)) problems.push('foreign-gibberish');
  const words = t.toLowerCase().match(/[a-z']{3,}/g) || [];
  if (words.length > 20) {
    const counts = new Map();
    for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
    const top = [...counts.values()].sort((a, b) => b - a)[0] || 0;
    if (top > 18 && top / words.length > 0.22) problems.push('repeated-gibberish');
  }
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (t.length > 80 && letters / t.length < 0.35) problems.push('symbol-gibberish');
  if (turnId.startsWith('convo') && t.length < 80) problems.push('convo-too-thin');
  if (turnId.startsWith('convo') && /```/.test(t)) problems.push('convo-dumped-code');
  return problems;
}

async function findNova() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      const page = list.find((t) => t.type === 'page' && /localhost:5173|index\.html/i.test(t.url || ''))
        || list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* */ }
    await sleep(400);
  }
  throw new Error('NOVA page not found on CDP ' + PORT);
}

const SNAP = `(() => {
  const body = document.body?.innerText || '';
  const foots = [...body.matchAll(/Responded in [\\d.]+\\s*(?:ms|s|m)[^\\n]*/gi)].map((m) => m[0]);
  const footer = foots[foots.length - 1] || '';
  const statusNodes = [...document.querySelectorAll('[aria-live], button[aria-label]')];
  const statusText = statusNodes.map((n) => n.getAttribute('aria-label') || n.textContent || '').join(' | ');
  const liveStatus = (statusText.match(/(?:Ensemble|Plan hop|Verify hop|Style hop|Final pass|Coding|Building|Writing|Using|Creating|Installing|Done|Wiring|Editing|Applying)[^|]{0,90}/gi) || []).slice(-3);
  const generating = /(?:Coding…|Thinking…|Creating folder|Building UI|messages queued|Installing|Plan hop|Verify hop|Style hop|Final pass:|Writing src|Coding src|Wiring|Editing|Applying)/i.test(statusText);
  return { footer, generating: Boolean(generating), queued: /messages queued/i.test(body), statusTail: liveStatus, tail: body.slice(-1800) };
})()`;

async function newChat(cdp) {
  await cdp.eval(`(() => {
    const candidates = [...document.querySelectorAll('button, a, [role="button"]')];
    const plus = candidates.find((b) => /new\\s*chat/i.test((b.getAttribute('aria-label') || '') + (b.textContent || '')));
    if (plus) { plus.click(); return 'new'; }
    location.hash = '#/chat?new=' + Date.now();
    return 'hash';
  })()`);
  await sleep(2500);
}

async function sendAsk(cdp, ask) {
  const filled = await cdp.eval(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return { ok: false, why: 'no-textarea' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    setter.call(ta, ${JSON.stringify(ask)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    return { ok: true, valLen: String(ta.value || '').length };
  })()`);
  if (!filled?.ok) throw new Error('composer missing');
  await sleep(700);
  await cdp.eval(`(() => {
    const ta = document.querySelector('textarea');
    const btn = [...document.querySelectorAll('button')].find((b) => /send|arrow up/i.test(b.getAttribute('aria-label') || ''));
    if (btn && !btn.disabled) { btn.click(); return 'btn'; }
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    return 'enter';
  })()`);
}

async function waitTurn(cdp, prevFooter, timeoutMs, turnId) {
  const t0 = Date.now();
  let stable = 0;
  let lastStatus = '';
  let lastChange = Date.now();
  let sawGen = false;
  const notes = [];
  while (Date.now() - t0 < timeoutMs) {
    const s = await cdp.eval(SNAP);
    const elapsed = Math.round((Date.now() - t0) / 1000);
    const statusKey = (s.statusTail || []).join('|') + '|' + s.footer + '|' + (s.generating ? 'g' : 'i');
    if (statusKey !== lastStatus) {
      lastStatus = statusKey;
      lastChange = Date.now();
      if (elapsed % 15 < 4) console.log(`[${turnId} ${elapsed}s]`, s.statusTail?.slice(-2), 'gen=' + s.generating);
    } else if (Date.now() - lastChange > 150000 && (s.generating || !s.footer)) {
      const note = `stall-${elapsed}s`;
      if (!notes.includes(note)) {
        notes.push('stall');
        console.log(`PROBLEM stall on ${turnId} at ${elapsed}s status=${JSON.stringify(s.statusTail)}`);
      }
      lastChange = Date.now();
    }
    if (s.generating || s.queued) {
      sawGen = true;
      stable = 0;
    } else if (s.footer && s.footer !== prevFooter && sawGen) {
      stable += 1;
      if (stable >= 2) return { ...s, notes, elapsedSec: elapsed };
    }
    await sleep(3000);
  }
  notes.push('timeout');
  const s = await cdp.eval(SNAP);
  console.log(`PROBLEM timeout on ${turnId}`);
  return { ...s, notes, elapsedSec: Math.round((Date.now() - t0) / 1000) };
}

async function shotLive(cdp, name) {
  await cdp.eval(`(() => {
    const nodes = [...document.querySelectorAll('button, a, [role="button"], span')];
    const live = nodes.find((n) => /^\\s*live\\s*$/i.test((n.textContent || '').trim()));
    if (live) live.click();
    return Boolean(live);
  })()`);
  await sleep(8000);
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const preview = list.find((t) => t.type === 'page' && /apple|iphone|mac/i.test((t.title || '') + (t.url || '')))
    || list.find((t) => t.type === 'page' && t.url && !/5173/.test(t.url) && /127\.0\.0\.1|localhost/.test(t.url));
  if (!preview?.webSocketDebuggerUrl) return { ok: false, reason: 'no-preview' };
  const prev = new Cdp(preview.webSocketDebuggerUrl);
  await prev.connect();
  await sleep(1500);
  const hero = await prev.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(OUT, `${name}-hero.png`), Buffer.from(hero.data, 'base64'));
  const probe = await prev.eval(`(() => {
    const text = document.body?.innerText || '';
    const bg = getComputedStyle(document.body).backgroundColor;
    return {
      brand: /apple|iphone|mac|ipad|watch|airpods/i.test(text),
      hello: /\\bhello\\b/i.test(text),
      available: /now available/i.test(text),
      stock: /forest|ocean|woods|waves/i.test(text),
      images: document.querySelectorAll('img, svg').length,
      buttons: document.querySelectorAll('button, a').length,
      appLen: (document.querySelector('#root')?.innerHTML || '').length,
      bg,
      viteError: /plugin:vite|failed to load|Unexpected token/i.test(text),
      title: document.title,
      snippet: text.replace(/\\s+/g, ' ').slice(0, 280),
    };
  })()`);
  prev.close();
  return { ok: true, probe };
}

async function clearHistory(cdp) {
  const cleared = await cdp.eval(`(() => {
    const remove = [];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (/chat-thread|recent-chats|chat-studio|chat-code-pill|apply-snapshot|last-edit|pending-add|last-disk-target|recent-projects|deleted-chat|creations/i.test(k)) {
        remove.push(k);
        localStorage.removeItem(k);
      }
    }
    try { sessionStorage.clear(); } catch {}
    return remove.length;
  })()`);
  console.log('cleared chat keys', cleared);
  await cdp.send('Page.reload', { ignoreCache: true });
  await sleep(2500);
}

async function main() {
  console.log('CDP', PORT, 'SLUG', SLUG, 'OUT', OUT);
  const page = await findNova();
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.connect();
  await clearHistory(cdp);
  cdp.close();
  await sleep(800);
  const page2 = await findNova();
  const session = new Cdp(page2.webSocketDebuggerUrl);
  await session.connect();
  const report = { slug: SLUG, turns: [] };

  for (const turn of TURNS) {
    console.log(`\n===== ${turn.id} =====`);
    if (turn.newChat) await newChat(session);
    const before = await session.eval(SNAP);
    await sendAsk(session, turn.ask);
    const done = await waitTurn(session, before.footer, turn.timeoutMs, turn.id);
    const text = String(done.tail || '');
    fs.writeFileSync(path.join(OUT, `${turn.id}.txt`), text);
    const problems = [...(done.notes || []), ...judgeReply(text, turn.id)];
    const row = {
      id: turn.id,
      footer: done.footer || '',
      elapsedSec: done.elapsedSec,
      problems: [...new Set(problems)],
    };
    if (turn.id === 'build' || turn.id === 'edit') {
      const shot = await shotLive(session, turn.id);
      row.live = shot;
      console.log('LIVE', JSON.stringify(shot));
      if (!shot.ok) row.problems.push('no-live-preview');
      else if (!shot.probe?.appLen) row.problems.push('blank-live');
      else if (shot.probe?.viteError) row.problems.push('vite-error');
      if (turn.id === 'edit' && shot.ok && !shot.probe?.hello) row.problems.push('edit-headline-missing');
      if (turn.id === 'edit' && shot.ok && !shot.probe?.available) row.problems.push('edit-banner-missing');
      if (shot.ok && shot.probe?.stock) row.problems.push('stock-scenery-copy');
    }
    report.turns.push(row);
    console.log('TURN', JSON.stringify(row));
    if (problems.includes('timeout') && turn.id === 'build') break;
    await sleep(2500);
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('REPORT', JSON.stringify(report, null, 2));
  session.close();
  const bad = report.turns.some((t) => t.problems.length);
  process.exit(bad ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
