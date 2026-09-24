/**
 * Fresh NEW CHAT progressive: cream → gray → icons → brand logo → name style → moves.
 * Always starts a brand-new chat (never resume). Verifies Live preview at the end.
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
const OUT = path.join(root, '.tmp-brand-progressive');
fs.mkdirSync(OUT, { recursive: true });
const SLUG = `BrandLab-${Date.now().toString(36).slice(-5)}`;

const turns = [
  {
    newChat: true,
    ask: `create a brand new Vite React project called ${SLUG}. Just a solid premium cream-white background — blank page only, no text, no icons, no logos, no nav. create on disk and make Preview Ready.`,
    label: 'TURN 1 — cream blank (NEW CHAT)',
    timeoutMs: '600000',
    mustNot: [/@@@FILE\s+src/i],
    mustHave: [/Created|cream|Preview|Ready|folder|Live|project/i],
  },
  {
    newChat: false,
    ask: 'change the background to a soft premium gray',
    label: 'TURN 2 — soft premium gray',
    timeoutMs: '180000',
    mustNot: [/@@@FILE\s+src/i],
    mustHave: [/gr[ae]y|updated|changed|background|done|Preview|Ready/i],
  },
  {
    newChat: false,
    ask: 'add four UI icons in the top left: search, settings, menu, and user. keep the soft gray background. no brand logos yet.',
    label: 'TURN 3 — UI icons top-left',
    timeoutMs: '300000',
    mustNot: [/@@@FILE\s+src/i],
    mustHave: [/icon|search|settings|menu|updated|added|done|Preview|Ready/i],
  },
  {
    newChat: false,
    ask: 'add one Netflix brand logo in the top right corner. keep the icons and gray background.',
    label: 'TURN 4 — Netflix logo top-right',
    timeoutMs: '300000',
    mustNot: [/@@@FILE\s+src/i],
    mustHave: [/Netflix|logo|updated|added|done|Preview|Ready/i],
  },
  {
    newChat: false,
    ask: 'put the words Nightglass in the center of the page in a bold professional style. keep the gray background, icons, and Netflix logo.',
    label: 'TURN 5 — centered bold name',
    timeoutMs: '300000',
    mustNot: [/@@@FILE\s+src/i],
    mustHave: [/Nightglass|updated|added|done|center|Preview|Ready/i],
  },
  {
    newChat: false,
    ask: 'make the Nightglass name look more cursive and elegant',
    label: 'TURN 6 — cursive name',
    timeoutMs: '180000',
    mustNot: [/@@@FILE\s+src/i],
    mustHave: [/cursive|italic|Nightglass|updated|changed|done|font|Preview|Ready/i],
  },
  {
    newChat: false,
    ask: 'move the Netflix logo to the top left. move the search icon to the top right. move Nightglass to the bottom center.',
    label: 'TURN 7 — rearrange logo / icon / name',
    timeoutMs: '300000',
    mustNot: [/@@@FILE\s+src/i],
    mustHave: [/move|logo|search|Nightglass|updated|changed|done|Preview|Ready/i],
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
  return { ok: code === 0 || code === 2, code, text };
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
    return 'no-live';
  })()`);
  console.log('liveClick', clicked);
  await sleep(4000);

  const list2 = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const preview = list2.find((t) => t.type === 'page' && t.url
    && !/localhost:5173/i.test(t.url)
    && /127\.0\.0\.1|localhost/i.test(t.url));

  let verify = { ok: false, reason: 'no-preview-target' };
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
        const app = document.querySelector('.app');
        const appBg = app ? getComputedStyle(app).backgroundColor : null;
        const vw = window.innerWidth || 1200;
        const vh = window.innerHeight || 800;
        const icons = [...document.querySelectorAll('img.nav-icon, img[data-icon], .icon-rail img')].map((img) => {
          const r = img.getBoundingClientRect();
          return {
            src: img.getAttribute('src') || '',
            dataIcon: img.getAttribute('data-icon') || '',
            rail: img.closest('[class*="icon-rail"]')?.className || '',
            x: Math.round(r.left), y: Math.round(r.top),
          };
        });
        const logos = [...document.querySelectorAll('img.brand-mark, .brand-rail img, img[src*="logo"], img[src*="netflix"]')].map((img) => {
          const r = img.getBoundingClientRect();
          return {
            src: img.getAttribute('src') || '',
            alt: img.getAttribute('alt') || '',
            rail: img.closest('[class*="brand-rail"], [class*="corner-logo"]')?.className || '',
            x: Math.round(r.left), y: Math.round(r.top),
          };
        });
        const nameEl = document.querySelector('.center-word, h1');
        const nameRect = nameEl?.getBoundingClientRect();
        const nameStyle = nameEl ? getComputedStyle(nameEl) : null;
        const search = icons.find((i) => /search/i.test(i.src + i.dataIcon));
        const netflix = logos.find((i) => /netflix/i.test(i.src + i.alt)) || logos[0];
        const checks = {
          grayish: /rgb\\(\\s*(2[0-3]\\d|1\\d\\d)\\s*,\\s*(2[0-3]\\d|1\\d\\d)\\s*,\\s*(2[0-3]\\d|1\\d\\d)/i.test(String(appBg || '')),
          hasIcons: icons.length >= 3,
          hasLogo: logos.length >= 1,
          hasName: /nightglass/i.test(nameEl?.textContent || ''),
          nameCursive: nameStyle ? /italic|cursive|georgia|times/i.test(nameStyle.fontStyle + nameStyle.fontFamily) : false,
          searchTopRight: search ? search.x > vw * 0.55 && search.y < vh * 0.35 : false,
          logoTopLeft: netflix ? netflix.x < vw * 0.35 && netflix.y < vh * 0.35 : false,
          nameBottomish: nameRect ? nameRect.top > vh * 0.45 : false,
        };
        return {
          appBg, icons, logos,
          name: nameEl?.textContent || '',
          nameFont: nameStyle ? { style: nameStyle.fontStyle, family: nameStyle.fontFamily, weight: nameStyle.fontWeight } : null,
          checks,
          vw, vh,
          ok: checks.grayish && checks.hasIcons && checks.hasLogo && checks.hasName
            && checks.searchTopRight && checks.logoTopLeft,
        };
      })()`,
      returnByValue: true,
      awaitPromise: true,
    }).then((r) => r.result?.value);

    const shot = await send2('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path.join(OUT, 'verify-preview.png'), Buffer.from(shot.data, 'base64'));
    console.log('shot', path.join(OUT, 'verify-preview.png'));
    try { ws2.close(); } catch { /* */ }
  }

  console.log('verify', JSON.stringify(verify, null, 2));
  fs.writeFileSync(path.join(OUT, 'verify.json'), JSON.stringify({ slug: SLUG, verify }, null, 2));
  try { ws.close(); } catch { /* */ }
  return verify;
}

let failed = 0;
let createText = '';
for (let i = 0; i < turns.length; i++) {
  const result = runTurn(turns[i]);
  if (i === 0) createText = result.text || '';
  if (!result.ok) {
    failed = 1;
    console.error(`Stopped after turn ${i + 1}.`);
    break;
  }
  spawnSync(process.execPath, ['-e', 'setTimeout(()=>{}, 2500)'], { stdio: 'ignore' });
}

if (!failed && createText) {
  const professional = /Created\s+\*\*/i.test(createText)
    && /-\s+Project files/i.test(createText)
    && !/The product UI is on disk, dependencies installed/i.test(createText);
  console.log(professional ? 'CREATE COPY OK (bullet layout)' : 'CREATE COPY WARN (old prose?)');
}

if (!failed) {
  console.log('\n======== verifying Live preview ========');
  try {
    const v = await verifyLivePreview();
    if (!v?.ok) {
      console.error('VERIFY FAIL', v?.checks || v);
      failed = 1;
    } else {
      console.log('VERIFY OK');
    }
  } catch (err) {
    console.error('VERIFY ERROR', err);
    failed = 1;
  }
}

console.log(`\n======== brand progressive ${failed ? 'STOPPED' : 'done'} · ${SLUG} ========`);
process.exit(failed ? 1 : 0);
