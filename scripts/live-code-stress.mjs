/**
 * Live Code-pill stress: create many folders/files, write 150 lines ONE BY ONE via Nova,
 * verify each, report stalls. Watch the Nova Code overlay.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = path.join(os.homedir(), 'Documents', 'NOVA Projects', 'code-stress');
const OUT = path.join(ROOT, 'scripts', '_code-stress-out.txt');
const LINES = Number(process.env.NOVA_STRESS_LINES || 150);
const WRITE_TIMEOUT_MS = Number(process.env.NOVA_STRESS_TIMEOUT_MS || 45_000);

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  try { fs.appendFileSync(OUT, line + '\n'); } catch { /* ignore */ }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

function padContent(rel, lines) {
  const ext = path.extname(rel).toLowerCase();
  const rows = [];
  if (ext === '.json') {
    rows.push('{');
    rows.push(`  "stressFile": ${JSON.stringify(rel)},`);
    rows.push('  "lines": [');
    for (let i = 1; i <= lines - 5; i++) {
      rows.push(`    "pad-line-${i}-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",`);
    }
    rows.push('    "end"');
    rows.push('  ]');
    rows.push('}');
    return rows.join('\n');
  }
  if (ext === '.css') {
    rows.push(`/* stress ${rel} */`);
    for (let i = 1; i <= lines - 1; i++) {
      rows.push(`.stress-${i} { content: "pad-${i}"; display: block; opacity: 0.${(i % 9) + 1}; }`);
    }
    return rows.join('\n');
  }
  if (ext === '.html') {
    rows.push('<!doctype html><html><head><meta charset="utf-8"/><title>stress</title></head><body>');
    for (let i = 1; i <= lines - 2; i++) rows.push(`  <div class="pad-${i}">pad line ${i}</div>`);
    rows.push('</body></html>');
    return rows.join('\n');
  }
  if (ext === '.svg') {
    rows.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">');
    for (let i = 1; i <= lines - 2; i++) {
      rows.push(`  <!-- pad ${i} --><circle cx="${i % 90}" cy="${(i * 3) % 90}" r="1" fill="#${(i % 9)}af"/>`);
    }
    rows.push('</svg>');
    return rows.join('\n');
  }
  if (ext === '.md') {
    rows.push(`# Stress ${rel}`);
    for (let i = 1; i <= lines - 1; i++) rows.push(`- pad line ${i} lorem stress token ${'x'.repeat(24)}`);
    return rows.join('\n');
  }
  // ts/tsx/js/jsx/default
  rows.push(`// stress ${rel}`);
  rows.push('export const STRESS = {');
  for (let i = 1; i <= lines - 3; i++) {
    rows.push(`  line${i}: "pad-${i}-${'a'.repeat(40)}",`);
  }
  rows.push('};');
  rows.push('export default STRESS;');
  return rows.join('\n');
}

/** Many folders + many file kinds — one-by-one write targets. */
function buildTargetList() {
  const targets = [
    'index.html',
    'package.json',
    'vite.config.ts',
    'tsconfig.json',
    'README.md',
    '.gitignore',
    'src/main.tsx',
    'src/App.tsx',
    'src/App.css',
    'src/index.css',
    'src/vite-env.d.ts',
    'src/components/Header.tsx',
    'src/components/Hero.tsx',
    'src/components/Footer.tsx',
    'src/components/FeatureGrid.tsx',
    'src/components/ui/Button.tsx',
    'src/components/ui/Card.tsx',
    'src/hooks/useTheme.ts',
    'src/hooks/useScroll.ts',
    'src/lib/format.ts',
    'src/lib/math.ts',
    'src/lib/colors.ts',
    'src/styles/tokens.css',
    'src/styles/motion.css',
    'src/assets/icons/logo.svg',
    'src/assets/icons/star.svg',
    'src/assets/icons/arrow.svg',
    'src/assets/brand.svg',
    'src/game/loop.ts',
    'src/game/sprites.ts',
    'src/game/input.ts',
    'src/game/scenes/Boot.ts',
    'src/api/client.ts',
    'src/api/types.ts',
    'src/api/routes.ts',
    'public/favicon.svg',
    'public/robots.txt',
    'public/manifest.json',
    'server/index.js',
    'server/router.js',
    'scripts/build-notes.md',
    'docs/architecture.md',
    'docs/ui-notes.md',
  ];
  return targets;
}

function ensureProjectScaffold() {
  fs.mkdirSync(path.join(PROJECT, 'src'), { recursive: true });
  if (!fs.existsSync(path.join(PROJECT, 'package.json'))) {
    fs.writeFileSync(path.join(PROJECT, 'package.json'), JSON.stringify({
      name: 'code-stress',
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: { dev: 'vite', build: 'vite build' },
      dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
      devDependencies: { vite: '^5.4.0', typescript: '^5.6.0', '@vitejs/plugin-react': '^4.3.0' },
    }, null, 2));
  }
}

async function connect() {
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = (list || []).find((t) => t.type === 'page' && /NOVA/i.test(t.title || ''))
    || (list || []).find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('no cdp');
  log('cdp', page.title, page.url);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let id = 0;
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
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (r?.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r?.result?.value;
  };
  return { ws, evaluate };
}

try { fs.writeFileSync(OUT, `code-stress ${new Date().toISOString()}\n`); } catch { /* ignore */ }
ensureProjectScaffold();
const targets = buildTargetList();
log('targets', targets.length, 'linesEach', LINES);

const { ws, evaluate } = await connect();

// Open Chat + Code, bind stress project via stress write context
await evaluate(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const chat = els.find(el => (el.getAttribute('aria-label') || '') === 'Chat' || /^Chat$/i.test((el.textContent || '').trim()));
  if (chat) chat.click();
  return true;
})()`);
await sleep(600);

const ready = await evaluate(`({
  write: typeof window.__novaStressWrite,
  openCode: typeof window.__novaStressOpenCode,
})`);
log('hooks', ready);
if (ready?.write !== 'function') {
  log('FAIL — __novaStressWrite missing (rebuild/restart Nova with latest dist)');
  ws.close();
  process.exit(2);
}

await evaluate(`window.__novaStressOpenCode && window.__novaStressOpenCode()`);
log('Code overlay opened — watch Nova Code explorer');

const results = [];
for (let i = 0; i < targets.length; i++) {
  const rel = targets[i];
  const content = padContent(rel, LINES);
  const expectedLines = content.split(/\r?\n/).length;
  log(`\n=== [${i + 1}/${targets.length}] WRITE ${rel} (${expectedLines} lines) ===`);
  const started = Date.now();
  let res;
  try {
    res = await Promise.race([
      evaluate(`window.__novaStressWrite(${JSON.stringify({
        path: rel,
        content,
        projectId: 'code-stress',
        projectName: 'code-stress',
        diskRoot: PROJECT.replace(/\\/g, '/'),
      })})`),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'timeout' }), WRITE_TIMEOUT_MS)),
    ]);
  } catch (e) {
    res = { ok: false, error: String(e.message || e) };
  }
  const elapsed = Date.now() - started;
  // Verify on disk
  const diskPath = path.join(PROJECT, ...rel.split('/'));
  let diskLines = 0;
  let diskBytes = 0;
  try {
    if (fs.existsSync(diskPath)) {
      const raw = fs.readFileSync(diskPath, 'utf8');
      diskBytes = raw.length;
      diskLines = raw.split(/\r?\n/).length;
    }
  } catch { /* ignore */ }
  const pass = Boolean(res?.ok) && diskLines >= Math.min(LINES, expectedLines - 2);
  const row = {
    path: rel,
    pass,
    elapsedMs: elapsed,
    apiLines: res?.lines || 0,
    diskLines,
    diskBytes,
    error: res?.error || null,
  };
  results.push(row);
  log(pass ? 'PASS' : 'STALL/FAIL', JSON.stringify(row));
  if (!pass) {
    log('STALL DETECTED on', rel, '— stopping batch for source fix, then full retry');
    break;
  }
  await sleep(250);
}

const failed = results.filter((r) => !r.pass);
const passed = results.filter((r) => r.pass);
log('\nSUMMARY', { passed: passed.length, failed: failed.length, totalAttempted: results.length, totalPlanned: targets.length });
fs.writeFileSync(path.join(ROOT, 'scripts', '_code-stress-results.json'), JSON.stringify({ results, passed, failed }, null, 2));

ws.close();
process.exit(failed.length ? 1 : 0);
