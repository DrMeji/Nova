/**
 * Smoke: "try orange color" on bound project must local-patch, not dump CODE.
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9255);
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

class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
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

const SNAP = `(() => {
  const body = document.body?.innerText || '';
  const foots = [...body.matchAll(/Responded in [\\d.]+\\s*(?:ms|s)[^\\n]*/gi)].map((m) => m[0]);
  return {
    footer: foots[foots.length - 1] || '',
    generating: /(?:Coding…|Thinking|Updating project|messages queued)/i.test(body.slice(-1400)),
    queued: /messages queued/i.test(body),
    dumpedCode: /@@@FILE\\s+src\\/|\\bCODE\\b[\\s\\S]{0,40}Copy/i.test(body.slice(-900))
      && /try orange/i.test(body.slice(-900)),
    localPatch: /NOVA · local patch|local patch/i.test(foots[foots.length - 1] || ''),
    qwenDump: /Qwen|attached files/i.test(foots[foots.length - 1] || ''),
    orangeCss: /#f97316|#fa7315|orange/i.test(body.slice(-500)),
    tail: body.slice(-700),
  };
})()`;

const SEND = (text) => `(() => {
  const t = ${JSON.stringify(text)};
  const ta = document.querySelector('textarea');
  if (!ta) return { ok: false, error: 'no textarea' };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, t);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  const btn = [...document.querySelectorAll('button')].find((b) =>
    /send|arrow up/i.test(b.getAttribute('aria-label') || '')
  );
  if (btn && !btn.disabled) { btn.click(); return { ok: true, via: 'button' }; }
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  return { ok: true, via: 'enter' };
})()`;

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const page = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''));
if (!page?.webSocketDebuggerUrl) throw new Error('no nova page');
const cdp = new Cdp(page.webSocketDebuggerUrl);
await cdp.connect();
const before = await cdp.eval(SNAP);
console.log('bound?', /bound:/i.test(before.tail || ''));
console.log('sent', await cdp.eval(SEND('try orange color')));
const t0 = Date.now();
let after = before;
while (Date.now() - t0 < 90000) {
  after = await cdp.eval(SNAP);
  if (!after.generating && !after.queued && after.footer && after.footer !== before.footer) break;
  await sleep(800);
}
console.log('footer', after.footer);
console.log('localPatch', after.localPatch);
console.log('dumpedCode', after.dumpedCode);
console.log('qwenDump', after.qwenDump);
console.log('tail', (after.tail || '').slice(-350));
cdp.close();
if (after.qwenDump || !after.localPatch) {
  console.error('FAIL shorthand did not surgical-apply');
  process.exit(2);
}
console.log('PASS try orange → local patch');
