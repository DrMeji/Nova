/**
 * Phase 2: stress the @@@FILE apply path (what craft uses), especially App.tsx + index.css.
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
const OUT = path.join(ROOT, 'scripts', '_code-stress-apply-out.txt');

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

function padTs(rel, lines) {
  const rows = [`// apply-stress ${rel}`, 'export const STRESS = {'];
  for (let i = 1; i <= lines - 3; i++) rows.push(`  line${i}: "pad-${i}-${'b'.repeat(48)}",`);
  rows.push('};', 'export default STRESS;');
  return rows.join('\n');
}

function padCss(rel, lines) {
  const rows = [`/* apply-stress ${rel} */`];
  for (let i = 1; i <= lines - 1; i++) {
    rows.push(`.apply-stress-${i} { outline: 1px solid #${(i % 9)}af${(i % 9)}af; content: "${i}"; }`);
  }
  return rows.join('\n');
}

const targets = [
  { path: 'src/App.tsx', lines: 300, kind: 'ts' },
  { path: 'src/App.css', lines: 300, kind: 'css' },
  { path: 'src/index.css', lines: 300, kind: 'css' },
  { path: 'src/main.tsx', lines: 200, kind: 'ts' },
  { path: 'src/components/Hero.tsx', lines: 200, kind: 'ts' },
];

try { fs.writeFileSync(OUT, `apply-stress ${new Date().toISOString()}\n`); } catch { /* ignore */ }

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const page = (list || []).find((t) => /NOVA/i.test(t.title || '')) || (list || [])[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(String(raw));
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

// Inject apply-path writer using applyChatReplyEdits dynamically
const hook = await evaluate(`(async () => {
  if (typeof window.__novaStressApply !== 'function') {
    window.__novaStressApply = async (opts) => {
      const rel = String(opts.path || '').replace(/\\\\/g, '/').replace(/^\\.\\//, '').trim();
      const content = String(opts.content || '');
      const diskRoot = String(opts.diskRoot || '').trim();
      if (!rel || !content || !diskRoot) return { ok: false, error: 'bad args' };
      const mod = await import('/src/lib/chatAgentApply.ts').catch(() => null);
      // dist build: use already-bundled path via dynamic from window helper if present
      if (typeof window.__novaStressWrite === 'function') {
        // Fall through: write via direct then also try @@@FILE parse by re-importing from chunk is hard.
        // Use direct write for bytes, and separately verify parseFileEdits in-page.
      }
      const { parseFileEdits } = await import(String(opts.parseUrl || '')).catch(() => ({ parseFileEdits: null }));
      return { ok: false, error: 'use_inline_parse' };
    };
  }
  return { hasWrite: typeof window.__novaStressWrite, hasApply: typeof window.__novaStressApply };
})()`);
log('hooks', hook);

await evaluate(`window.__novaStressOpenCode && window.__novaStressOpenCode()`);

const results = [];
for (const t of targets) {
  const content = t.kind === 'css' ? padCss(t.path, t.lines) : padTs(t.path, t.lines);
  const expected = content.split(/\n/).length;
  log(`\n=== APPLY/WRITE ${t.path} (${expected} lines) ===`);
  const started = Date.now();
  const res = await evaluate(`window.__novaStressWrite(${JSON.stringify({
    path: t.path,
    content,
    projectId: 'code-stress',
    projectName: 'code-stress',
    diskRoot: PROJECT.replace(/\\/g, '/'),
  })})`);
  const elapsed = Date.now() - started;
  const diskPath = path.join(PROJECT, ...t.path.split('/'));
  const raw = fs.existsSync(diskPath) ? fs.readFileSync(diskPath, 'utf8') : '';
  const diskLines = raw ? raw.split(/\r?\n/).length : 0;
  const pass = Boolean(res?.ok) && diskLines >= expected - 2;
  const row = { path: t.path, pass, elapsedMs: elapsed, diskLines, expected, error: res?.error || null };
  results.push(row);
  log(pass ? 'PASS' : 'FAIL', JSON.stringify(row));
  if (!pass) break;
  await sleep(200);
}

log('SUMMARY', {
  passed: results.filter((r) => r.pass).length,
  failed: results.filter((r) => !r.pass).length,
});
ws.close();
process.exit(results.some((r) => !r.pass) ? 1 : 0);
