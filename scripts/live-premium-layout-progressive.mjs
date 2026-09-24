/**
 * Fresh-chat progressive: premium cream → soft gray → UI icons → move icons to corners.
 * Always starts a NEW chat. Opens Live preview and verifies DOM + screenshots.
 * Env: NOVA_CDP_PORT (default 9340)
 */
import { spawnSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = process.env.NOVA_CDP_PORT || '9340';
const OUT = path.join(root, '.tmp-premium-layout');
fs.mkdirSync(OUT, { recursive: true });
const SLUG = `CreamLab-${Date.now().toString(36).slice(-5)}`;

const turns = [
  {
    newChat: true,
    ask: `create a brand new Vite React project called ${SLUG}. Just a solid premium cream-white background — blank page only, no text, no icons, no nav. create on disk and make Preview Ready.`,
    label: 'TURN 1 — premium cream blank (NEW CHAT)',
    timeoutMs: '600000',
    mustNot: [/@@@FILE\s+src/i],
    mustHave: [/cream|Preview|Ready|project|folder|created|Live/i],
  },
  {
    newChat: false,
    ask: 'change the background to a soft premium gray',
    label: 'TURN 2 — cream → soft premium gray',
    timeoutMs: '180000',
    mustNot: [/@@@FILE\s+src/i, /I applied that in your project files/i],
    mustHave: [/gr[ae]y|updated|changed|background|done|Preview|Ready/i],
  },
  {
    newChat: false,
    ask: 'add four UI icons clustered in the top left: search, settings, menu, and user. keep the soft gray background. no brand logos.',
    label: 'TURN 3 — add UI icons top-left',
    timeoutMs: '300000',
    mustNot: [/@@@FILE\s+src/i, /I applied that in your project files/i],
    mustHave: [/icon|search|settings|menu|updated|added|done|Preview|Ready/i],
  },
  {
    newChat: false,
    ask: 'move the search icon to the top right corner',
    label: 'TURN 4a — search → top-right',
    timeoutMs: '180000',
    mustNot: [/@@@FILE\s+src/i, /I applied that in your project files/i],
    mustHave: [/move|top right|search|updated|changed|done|Preview|Ready/i],
  },
  {
    newChat: false,
    ask: 'move the settings icon to the bottom left corner. leave menu and user in the top left.',
    label: 'TURN 4b — settings → bottom-left',
    timeoutMs: '180000',
    mustNot: [/@@@FILE\s+src/i, /I applied that in your project files/i],
    mustHave: [/move|bottom left|settings|updated|changed|done|Preview|Ready/i],
  },
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

function runTurn(t) {
  console.log(`\n======== ${t.label} ========\n`);
  console.log(`ASK: ${t.ask}\n`);
  const env = {
    ...process.env,
    NOVA_CDP_PORT: PORT,
    NOVA_NEW_CHAT: t.newChat ? '1' : '0',
    NOVA_ASK: t.ask,
    NOVA_TIMEOUT_MS: t.timeoutMs || '180000',
  };
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'live-one-turn.mjs')], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const code = r.status ?? 1;

  let parsed = null;
  try {
    const start = r.stdout.indexOf('{');
    const end = r.stdout.lastIndexOf('}');
    if (start >= 0 && end > start) parsed = JSON.parse(r.stdout.slice(start, end + 1));
  } catch { /* ignore */ }
  const text = String(parsed?.text || '');
  const meta = String(parsed?.meta || '');

  if (code === 3 || code === 4 || /timeout/i.test(meta)) {
    console.error(`\nGATE FAIL: no usable reply (exit ${code}, meta=${meta})`);
    return { ok: false, code: 3 };
  }
  for (const re of t.mustNot || []) {
    if (re.test(text) || re.test(meta)) {
      console.error(`\nGATE FAIL: forbidden ${re}`);
      return { ok: false, code: 5 };
    }
  }
  for (const re of t.mustHave || []) {
    if (!re.test(text) && !re.test(meta)) {
      console.error(`\nGATE FAIL: missing ${re}`);
      return { ok: false, code: 5 };
    }
  }
  console.log(`\nGATE OK (exit ${code})\n`);
  return { ok: code === 0 || code === 2, code };
}

async function verifyLivePreview() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''))
    || list.find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('no Nova page');

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
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');

  const clicked = await evalE(`(() => {
    const nodes = [...document.querySelectorAll('button, a, [role="button"], span, div')];
    const live = nodes.find((n) => /^\\s*live\\s*$/i.test((n.textContent || '').trim()));
    if (live) { live.click(); return 'clicked'; }
    const ready = nodes.find((n) => /preview\\s*ready|live\\s*ready/i.test((n.textContent || '').trim()) && (n.textContent || '').trim().length < 40);
    if (ready) { ready.click(); return 'clicked-ready'; }
    return 'no-live';
  })()`);
  console.log('liveClick', clicked);
  await sleep(4000);

  const list2 = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  console.log('targets', list2.map((t) => ({ title: t.title, url: (t.url || '').slice(0, 80) })).slice(0, 14));

  const preview = list2.find((t) => t.type === 'page' && t.url
    && !/localhost:5173/i.test(t.url)
    && /127\.0\.0\.1|localhost/i.test(t.url))
    || list2.find((t) => t.type === 'page' && /CreamLab|creamlab|preview/i.test(t.title || ''));

  let verify = { ok: false, reason: 'no-preview-target', icons: [] };
  if (preview?.webSocketDebuggerUrl) {
    const ws2 = new WebSocket(preview.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws2.once('open', resolve); ws2.once('error', reject); });
    let id2 = 0;
    const pending2 = new Map();
    ws2.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && pending2.has(msg.id)) {
        const { resolve, reject } = pending2.get(msg.id);
        pending2.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
    const send2 = (method, params = {}) => new Promise((resolve, reject) => {
      const i = ++id2;
      pending2.set(i, { resolve, reject });
      ws2.send(JSON.stringify({ id: i, method, params }));
    });
    await send2('Runtime.enable');
    await send2('Page.enable');
    await sleep(1200);

    verify = await send2('Runtime.evaluate', {
      expression: `(() => {
        const bg = getComputedStyle(document.body).backgroundColor
          || getComputedStyle(document.documentElement).backgroundColor;
        const app = document.querySelector('.app');
        const appBg = app ? getComputedStyle(app).backgroundColor : null;
        const icons = [...document.querySelectorAll('img.nav-icon, img[data-icon], .icon-rail img')].map((img) => {
          const r = img.getBoundingClientRect();
          const rail = img.closest('[class*="icon-rail"]');
          return {
            src: img.getAttribute('src') || '',
            dataIcon: img.getAttribute('data-icon') || '',
            rail: rail ? rail.className : '',
            x: Math.round(r.left),
            y: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height),
          };
        });
        const vw = window.innerWidth || 1200;
        const vh = window.innerHeight || 800;
        const search = icons.find((i) => /search/i.test(i.src + i.dataIcon));
        const settings = icons.find((i) => /settings/i.test(i.src + i.dataIcon));
        const menu = icons.find((i) => /menu/i.test(i.src + i.dataIcon));
        const user = icons.find((i) => /user/i.test(i.src + i.dataIcon));
        const checks = {
          hasFour: icons.length >= 4,
          searchTopRight: search ? search.x > vw * 0.55 && search.y < vh * 0.35 : false,
          settingsBottomLeft: settings ? settings.x < vw * 0.35 && settings.y > vh * 0.55 : false,
          menuTopLeft: menu ? menu.x < vw * 0.35 && menu.y < vh * 0.35 : false,
          userTopLeft: user ? user.x < vw * 0.35 && user.y < vh * 0.35 : false,
          grayish: /rgb\\(\\s*(2[0-3]\\d|1\\d\\d)\\s*,\\s*(2[0-3]\\d|1\\d\\d)\\s*,\\s*(2[0-3]\\d|1\\d\\d)/i.test(String(appBg || bg || '')),
        };
        return { bg, appBg, icons, checks, vw, vh, ok: checks.hasFour && checks.searchTopRight && checks.settingsBottomLeft };
      })()`,
      returnByValue: true,
      awaitPromise: true,
    }).then((r) => r.result?.value);

    const shot = await send2('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const shotPath = path.join(OUT, 'verify-preview.png');
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
    console.log('shot', shotPath);
    try { ws2.close(); } catch { /* */ }
  }

  // Also dump App.jsx from chat studio if exposed
  const diskSnap = await evalE(`(() => {
    try {
      const keys = Object.keys(localStorage).filter((k) => /NOVA:chat-studio|studio/i.test(k));
      return { keys: keys.slice(0, 8) };
    } catch { return { keys: [] }; }
  })()`);
  console.log('verify', JSON.stringify(verify, null, 2));
  console.log('diskSnap', diskSnap);
  try { ws.close(); } catch { /* */ }
  fs.writeFileSync(path.join(OUT, 'verify.json'), JSON.stringify({ slug: SLUG, verify }, null, 2));
  return verify;
}

let failed = 0;
for (let i = 0; i < turns.length; i++) {
  const result = runTurn(turns[i]);
  if (!result.ok) {
    failed = 1;
    console.error(`Stopped after turn ${i + 1}.`);
    break;
  }
  spawnSync(process.execPath, ['-e', 'setTimeout(()=>{}, 2500)'], { stdio: 'ignore' });
}

if (!failed) {
  console.log('\n======== verifying Live preview ========');
  try {
    const v = await verifyLivePreview();
    if (!v?.ok) {
      console.error('VERIFY FAIL: preview does not match ask', v?.checks || v);
      failed = 1;
    } else {
      console.log('VERIFY OK: icons repositioned as asked');
    }
  } catch (err) {
    console.error('VERIFY ERROR', err);
    failed = 1;
  }
}

console.log(`\n======== premium layout live ${failed ? 'STOPPED' : 'done'} · ${SLUG} ========`);
process.exit(failed ? 1 : 0);
