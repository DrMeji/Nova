/**
 * Live drive: bind NovaClinicGym → fix / add / remove via chat. Watch NOVA while this runs.
 * Requires Open-NOVA-Build.bat (CDP 9229).
 *
 *   node scripts/live-clinic-gym-drive.mjs
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const GYM = path.resolve(__dirname, '..', '..', 'NovaClinicGym');
const OUT = path.join(__dirname, '..', '.tmp-live-clinic-gym-drive.json');
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

async function waitForCdp(ms = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      if (Array.isArray(list) && list.length) return list;
    } catch { /* retry */ }
    await sleep(1000);
  }
  throw new Error(`CDP not up on ${PORT} — start Open-NOVA-Build.bat`);
}

function readGym(rel) {
  const p = path.join(GYM, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

function snapshotGym() {
  return {
    settings: readGym('src/pages/SettingsPage.jsx'),
    header: readGym('src/components/AppHeader.jsx'),
    search: readGym('src/components/SearchBar.jsx'),
    nav: readGym('src/components/NavTabs.jsx'),
  };
}

const before = snapshotGym();
const list = await waitForCdp();
const page = list.find((t) => t.type === 'page' && /NOVA|index\.html|localhost/i.test(`${t.title || ''}${t.url || ''}`))
  || list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('NOVA page missing');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
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
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');

async function ensureReady() {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const ok = await evalE(`(() => {
      try {
        return document.querySelectorAll('textarea').length > 0
          || (document.getElementById('root')?.innerHTML || '').length > 40;
      } catch { return false; }
    })()`).catch(() => false);
    if (ok) return;
    await sleep(500);
  }
  throw new Error('NOVA UI not ready');
}
await ensureReady();

async function clickNewChat() {
  return evalE(`(() => {
    const btns = [...document.querySelectorAll('button, a, [role="button"]')];
    const hit = btns.find((b) => /new\\s*chat/i.test(((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase()));
    if (hit) { hit.click(); return 'clicked'; }
    location.hash = '#/chat?new=' + Date.now();
    return 'hash';
  })()`);
}

async function bindGymFolder() {
  // Prefer desktop bridge if exposed
  return evalE(`(async () => {
    const root = ${JSON.stringify(GYM)};
    const d = window.novaDesktop;
    if (!d) return { ok: false, reason: 'no-desktop' };
    try {
      if (typeof d.openProjectFolder === 'function') {
        await d.openProjectFolder(root);
        return { ok: true, via: 'openProjectFolder' };
      }
      if (typeof d.bindFolder === 'function') {
        await d.bindFolder(root);
        return { ok: true, via: 'bindFolder' };
      }
      if (typeof d.setStudioRoot === 'function') {
        await d.setStudioRoot(root);
        return { ok: true, via: 'setStudioRoot' };
      }
      // Soft bind via session keys used by chat studio
      try {
        sessionStorage.setItem('NOVA:pending-studio-bind', JSON.stringify({ diskRoot: root, name: 'NovaClinicGym' }));
        localStorage.setItem('NOVA:last-disk-hint', root);
      } catch {}
      return { ok: true, via: 'session-hint' };
    } catch (e) {
      return { ok: false, reason: String(e && e.message || e) };
    }
  })()`);
}

async function sendAsk(text, { timeoutMs = 240000 } = {}) {
  const ok = await evalE(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return false;
    const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    d.set.call(ta, ${JSON.stringify(text)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    const sendBtn = [...document.querySelectorAll('button')].find((b) =>
      /send/i.test(b.getAttribute('aria-label') || '') || b.querySelector('svg') && /send/i.test(b.outerHTML)
    );
    if (sendBtn) sendBtn.click();
    else ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error('no textarea');

  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < timeoutMs) {
    await sleep(2500);
    const snap = await evalE(`(() => {
      const status = document.body.innerText.match(/Repairing|Writing|Thinking|Reading|Applying|Done|Live/i)?.[0] || '';
      const generating = !!document.querySelector('[aria-label*="Stop"], button[aria-label*="stop" i]');
      return { status, generating, len: document.body.innerText.length };
    })()`);
    last = snap?.status || last;
    if (!snap?.generating && Date.now() - t0 > 12000) {
      // settle
      await sleep(2000);
      const again = await evalE(`(() => !!document.querySelector('[aria-label*="Stop"], button[aria-label*="stop" i]'))`);
      if (!again) break;
    }
  }
  return { lastStatus: last };
}

const log = [];
const step = async (label, fn) => {
  console.log(`→ ${label}`);
  log.push({ t: Date.now(), label, phase: 'start' });
  try {
    const result = await fn();
    log.push({ t: Date.now(), label, phase: 'ok', result });
    console.log(`  ok ${label}`, typeof result === 'object' ? JSON.stringify(result).slice(0, 160) : result);
    return result;
  } catch (e) {
    log.push({ t: Date.now(), label, phase: 'fail', error: String(e.message || e) });
    console.error(`  FAIL ${label}`, e.message || e);
    throw e;
  }
};

await step('new-chat', clickNewChat);
await sleep(800);
await step('bind-gym', bindGymFolder);
await sleep(1200);

// Mention absolute path so hands-free debug / edit can resolve the folder.
const gymPath = GYM.replace(/\\/g, '\\\\');

await step('ask-fix-settings', () => sendAsk(
  `The project is at ${GYM}. I'm having a problem switching between Settings and Profile — the panels never show. Can you fix it now?`,
  { timeoutMs: 300000 },
));

await sleep(2000);
await step('ask-add-logout', () => sendAsk(
  `In the same project at ${GYM}, add a Logout button to the header next to Login.`,
  { timeoutMs: 240000 },
));

await sleep(2000);
await step('ask-remove-dead-nav', () => sendAsk(
  `In the same project at ${GYM}, remove the dead href="#" nav links in NavTabs (Reports/Billing/Help placeholders). Keep the header clean.`,
  { timeoutMs: 240000 },
));

await sleep(1500);
const after = snapshotGym();

const checks = {
  settingsFixed:
    /tab === ['"]settings['"]/.test(after.settings)
    && /tab === ['"]profile['"]/.test(after.settings)
    && !/tab === ['"]account['"]/.test(after.settings),
  logoutAdded: /logout|sign\s*out/i.test(after.header),
  navCleaned: !/href\s*=\s*["']#["']/.test(after.nav) || after.nav.length < before.nav.length,
  settingsChanged: after.settings !== before.settings,
  headerChanged: after.header !== before.header,
  navChanged: after.nav !== before.nav,
};

const report = {
  gym: GYM,
  checks,
  beforeLens: {
    settings: before.settings.length,
    header: before.header.length,
    nav: before.nav.length,
  },
  afterLens: {
    settings: after.settings.length,
    header: after.header.length,
    nav: after.nav.length,
  },
  log,
  ok: checks.settingsChanged || checks.headerChanged || checks.navChanged,
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, checks, out: OUT }, null, 2));
ws.close();
process.exit(report.ok ? 0 : 2);
