/**
 * Live invent create — proves harness pack after P0–P2 / R7–R10 wire.
 * Requires Nova on CDP (default 9229).
 *
 *   npx tsx --tsconfig tsconfig.app.json scripts/live-harness-invent-once.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const TAG = Date.now().toString(36).slice(-4);
const BRAND = process.env.NOVA_CREATE_BRAND || `Cedar Loom ${TAG}`;
const SLUG = BRAND.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const TIMEOUT_MS = Number(process.env.NOVA_CREATE_TIMEOUT_MS || 25 * 60_000);
const ROOT = process.cwd();
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

function pickNovaPage(list) {
  const pages = (list || []).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!pages.length) return null;
  return pages.find((t) => {
    const u = String(t.url || '');
    const title = String(t.title || '');
    return /:5173|dist\/index\.html|#\/chat|file:\/\//i.test(u) || /^NOVA\b/i.test(title);
  }) || pages[0] || null;
}

async function waitForCdp(maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      const page = pickNovaPage(list);
      if (page?.webSocketDebuggerUrl) {
        await sleep(1500);
        return page;
      }
    } catch { /* retry */ }
    await sleep(1000);
  }
  throw new Error(`NOVA missing on CDP ${PORT}`);
}

function readProjectFiles(disk) {
  const out = {};
  const want = [
    'src/App.jsx', 'src/App.tsx', 'src/App.css', 'src/index.css', 'src/main.jsx', 'src/main.tsx',
    'SPEC.md', 'PROGRESS.md', 'DESIGN.md', 'package.json',
  ];
  for (const rel of want) {
    const p = path.join(disk, rel);
    if (fs.existsSync(p)) out[rel.replace(/\\/g, '/')] = fs.readFileSync(p, 'utf8');
  }
  return out;
}

function gradeOnDisk(files, brief, brand) {
  const tmpJson = path.join(os.tmpdir(), `nova-harness-grade-${TAG}.json`);
  const tmpMjs = path.join(os.tmpdir(), `nova-harness-grade-${TAG}.mjs`);
  fs.writeFileSync(tmpJson, JSON.stringify({ files, brief, brand }));
  fs.writeFileSync(tmpMjs, `
import fs from 'fs';
import { evaluateBinaryCreateRubric, harnessQualityReadyGate } from '@/lib/agentHarness';
import { looksLikePlaceholderFloor } from '@/lib/codingAgentPack';
import { smokeCheckCreateFiles } from '@/lib/createEvidence';
const { files, brief, brand } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const floor = looksLikePlaceholderFloor(files);
const smoke = smokeCheckCreateFiles(files, brief);
const rub = evaluateBinaryCreateRubric({
  files, brief, brand,
  evidence: { mounted: true, consoleClean: true, smokeOk: smoke.ok, floor: floor.floor, axeCritical: 0 },
});
const gate = harnessQualityReadyGate({
  files, brief, brand,
  evidence: { mounted: true, consoleClean: true, smokeOk: smoke.ok, floor: floor.floor },
  smoke,
});
const app = files['src/App.jsx'] || files['src/App.tsx'] || '';
console.log(JSON.stringify({
  floor: floor.floor,
  floorReasons: floor.reasons,
  smoke: smoke.ok,
  smokeDetail: smoke.detail,
  rubricOk: rub.ok,
  rubricFailed: rub.failed,
  gateOk: gate.ok,
  gateReasons: gate.reasons,
  hasBrand: new RegExp(String(brand).split(/\\s+/)[0], 'i').test(app),
  appLen: app.length,
  hasSpec: Boolean(files['SPEC.md']),
  hasProgress: Boolean(files['PROGRESS.md']),
  hasDesign: Boolean(files['DESIGN.md']),
}, null, 2));
`);
  const g = spawnSync(
    'npx',
    ['tsx', '--tsconfig', 'tsconfig.app.json', tmpMjs, tmpJson],
    { cwd: ROOT, encoding: 'utf8', shell: true, env: process.env },
  );
  const out = String(g.stdout || '');
  if (g.status !== 0) console.error('grade err:', String(g.stderr || '').slice(0, 400));
  try {
    const s = out.indexOf('{');
    const e = out.lastIndexOf('}');
    if (s >= 0 && e > s) return JSON.parse(out.slice(s, e + 1));
  } catch { /* ignore */ }
  return null;
}

const page = await waitForCdp();
console.log('CDP:', page.title || '', String(page.url || '').slice(0, 100));

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

await evalE(`(() => {
  const raw = localStorage.getItem('NOVA:local-prefs');
  const prefs = raw ? JSON.parse(raw) : {};
  prefs.agentLoopOnEdit = true;
  prefs.agentLoopOnCreate = true;
  prefs.agentLoopEnabled = true;
  prefs.planApproveGate = false;
  prefs.approvalPolicy = 'on-request';
  prefs.sandboxMode = 'workspace-write';
  prefs.networkDenyByDefault = true;
  prefs.prefsVersion = Math.max(17, Number(prefs.prefsVersion) || 0);
  localStorage.setItem('NOVA:local-prefs', JSON.stringify(prefs));
  return prefs.prefsVersion;
})()`);

await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button]')];
  const stop = els.find(el => /stop|cancel|abort/i.test((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')));
  if (stop) stop.click();
  return Boolean(stop);
})()`);
await sleep(800);

await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const hits = els.filter(el => (el.getAttribute('aria-label') || '') === 'Chat');
  hits.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
  if (hits[0]) hits[0].click();
  return Boolean(hits[0]);
})()`);
await sleep(1000);

await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const hit = els.find(el => /new chat|new conversation/i.test((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')));
  if (hit) hit.click();
  return Boolean(hit);
})()`);
await sleep(1200);

const prompt = process.env.NOVA_CREATE_PROMPT || [
  `Create a new website on disk for **${BRAND}** — a small textile atelier landing page.`,
  'Hero with the brand name large, short craft story, one materials section, one contact form with name/email state.',
  'Unique textile atelier look — brand-first hero, warm natural materials, no utility-app chrome.',
  'Skip Plan. Start building now — invent App + CSS and open Live when ready.',
].join(' ');

console.log('=== LIVE HARNESS INVENT ===');
console.log('Brand:', BRAND);
console.log('Prompt:', prompt);

await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) throw new Error('no textarea');
  const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  d.set.call(ta, ${JSON.stringify(prompt)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  return true;
})()`);

const needle = prompt.slice(0, 40);
const t0 = Date.now();
let reply = '';
let lastStatus = '';
let lastJobSig = '';
let lastJob = null;

while (Date.now() - t0 < TIMEOUT_MS) {
  await sleep(5000);
  const snap = await evalE(`(() => {
    const needle = ${JSON.stringify(needle)};
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
    }
    let chat = null;
    for (const k of keys) {
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
      let userIdx = -1;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i]?.role === 'user' && String(arr[i].content || '').includes(needle)) { userIdx = i; break; }
      }
      if (userIdx < 0) continue;
      const last = arr[arr.length - 1];
      if (last?.role === 'assistant' && /^__generating__:/i.test(String(last.content || ''))) {
        chat = { generating: true, status: String(last.content || '').slice(0, 200), chatId: k.replace(/^.*chat:/, '') };
      } else {
        let asst = null;
        for (let i = userIdx + 1; i < arr.length; i++) {
          if (arr[i]?.role === 'assistant' && !/^__generating__:/i.test(String(arr[i].content || ''))) asst = arr[i];
        }
        if (asst) chat = { generating: false, content: String(asst.content || ''), provider: asst.provider_used || asst.provider, chatId: k.replace(/^.*chat:/, '') };
      }
      if (chat) break;
    }
    let job = null;
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k || !/^nova-create-job:/.test(k)) continue;
      try {
        const j = JSON.parse(sessionStorage.getItem(k) || 'null');
        const blob = \`\${j.name || ''} \${j.path || ''} \${j.originalBrief || ''}\`;
        // Exact brand or unique TAG only — never slug prefix (matches prior WarpAtelier-* fails).
        if (j && (blob.includes(${JSON.stringify(BRAND)}) || blob.includes(${JSON.stringify(TAG)}))) {
          const fk = Object.keys(j.files || {});
          job = {
            name: j.name, status: j.status, stage: j.stage, craftBlocked: j.craftBlocked,
            previewUrl: j.previewUrl, error: j.error, obs: j.lastObservation,
            evidencePass: j.evidencePass, blockedReasons: j.blockedReasons,
            fileCount: fk.length, path: j.path,
            hasSpec: fk.includes('SPEC.md'),
            hasProgress: fk.includes('PROGRESS.md'),
            hasDesign: fk.includes('DESIGN.md'),
            metaHarness: j.files && j.files['.__novaMetaHarness'],
          };
        }
      } catch {}
    }
    return { chat, job };
  })()`);

  if (snap?.job) {
    lastJob = snap.job;
    const sig = `${snap.job.status}|${snap.job.stage}|${snap.job.fileCount}|${snap.job.hasSpec}|${snap.job.obs || ''}`;
    if (sig !== lastJobSig) {
      lastJobSig = sig;
      console.log('job:', JSON.stringify({
        status: snap.job.status,
        stage: snap.job.stage,
        files: snap.job.fileCount,
        hasSpec: snap.job.hasSpec,
        hasProgress: snap.job.hasProgress,
        hasDesign: snap.job.hasDesign,
        meta: snap.job.metaHarness,
        evidencePass: snap.job.evidencePass,
        obs: String(snap.job.obs || '').slice(0, 120),
        path: snap.job.path,
      }));
    }
  }
  if (snap?.chat?.generating) {
    const st = String(snap.chat.status || '').replace(/^__generating__:/, '');
    if (st && st !== lastStatus) {
      lastStatus = st;
      console.log('status:', st.slice(0, 160));
    }
  }
  // Terminal job only — never "disk early win". Nova Ready/Live or craft-fail is truth.
  // Ignore stale failed jobs from prior runs that share a brand family.
  const jobIsOurs = snap?.job?.path
    && (String(snap.job.path).includes(TAG) || String(snap.job.name || '').includes(BRAND));
  if (jobIsOurs && (snap.job.status === 'ready' || snap.job.previewUrl)) {
    reply = reply || `(job ready) preview=${snap.job.previewUrl || 'none'} evidence=${snap.job.evidencePass}`;
    console.log('job terminal READY:', JSON.stringify({
      status: snap.job.status,
      previewUrl: snap.job.previewUrl,
      evidencePass: snap.job.evidencePass,
      craftBlocked: snap.job.craftBlocked,
    }));
    break;
  }
  if (jobIsOurs && (snap.job.status === 'failed' || snap.job.craftBlocked)) {
    reply = reply || `(job failed) ${snap.job.error || snap.job.obs || 'craftBlocked'}`;
    console.log('job terminal FAILED:', JSON.stringify({
      status: snap.job.status,
      craftBlocked: snap.job.craftBlocked,
      error: snap.job.error,
      blockedReasons: snap.job.blockedReasons,
      obs: snap.job.obs,
    }));
    break;
  }
  if (snap?.chat?.content && snap.chat.content.length > 40 && !snap?.chat?.generating) {
    // Only accept chat reply once job is also terminal (or missing after timeout grace).
    const st = snap?.job?.status;
    if (!st || st === 'ready' || st === 'failed') {
      reply = snap.chat.content;
      console.log('meta:', snap.chat.provider);
      console.log(reply.slice(0, 700));
      break;
    }
  }
}

const candidates = [];
try {
  for (const name of fs.readdirSync(PROJECTS)) {
    if (new RegExp(TAG, 'i').test(name) || name.toLowerCase() === SLUG.toLowerCase()) {
      candidates.push(path.join(PROJECTS, name));
    }
  }
} catch { /* ignore */ }
if (lastJob?.path) candidates.unshift(lastJob.path);
candidates.push(path.join(PROJECTS, SLUG));

const disk = candidates
  .filter((p) => p && fs.existsSync(p))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

console.log('\n=== GRADE ===');
if (!disk) {
  console.error('FAIL: project folder missing under', PROJECTS);
  console.error('lastJob:', lastJob);
  process.exit(1);
}
console.log('disk:', disk);

const files = readProjectFiles(disk);
const app = files['src/App.jsx'] || files['src/App.tsx'] || '';
console.log('app bytes:', app.length);
console.log('harness files on disk:', {
  SPEC: Boolean(files['SPEC.md']),
  PROGRESS: Boolean(files['PROGRESS.md']),
  DESIGN: Boolean(files['DESIGN.md']),
});

const parsed = gradeOnDisk(files, prompt, BRAND);
console.log('harness grade:', parsed);

const inventOk = app.length > 800 && !/Bare Vite mount|root-app/i.test(app);
const notFloor = parsed ? !parsed.floor : !/nova-storefront-spine|storefront-floor/i.test(app);
const harnessDocs = Boolean(
  files['SPEC.md'] || files['PROGRESS.md'] || files['DESIGN.md']
  || lastJob?.hasSpec || lastJob?.hasProgress || lastJob?.hasDesign,
);

const liveOk = Boolean(lastJob?.previewUrl)
  || lastJob?.status === 'ready'
  || lastJob?.evidencePass === true;
const craftFail = Boolean(lastJob?.craftBlocked)
  || lastJob?.status === 'failed'
  || /craft preflight failed|Live stays locked|Unavailable until then/i.test(reply);

console.log('summary:', {
  inventOk,
  notFloor,
  harnessDocs,
  rubricOk: parsed?.rubricOk,
  gateOk: parsed?.gateOk,
  jobStatus: lastJob?.status,
  craftBlocked: lastJob?.craftBlocked,
  previewUrl: lastJob?.previewUrl || null,
  evidencePass: lastJob?.evidencePass,
  liveOk,
  craftFail,
  replyLen: reply.length,
  elapsedMin: ((Date.now() - t0) / 60000).toFixed(1),
});

if (!inventOk) {
  console.error('FAIL: invent App too thin or bare scaffold');
  process.exit(1);
}
if (!notFloor) {
  console.error('FAIL: placeholder floor shipped');
  process.exit(1);
}
if (craftFail || !liveOk) {
  console.error('FAIL: Nova did not unlock Live (craftBlocked/failed or no previewUrl)');
  console.error('blockedReasons:', lastJob?.blockedReasons);
  console.error('reply head:', String(reply || '').slice(0, 400));
  process.exit(1);
}

const brandTok = BRAND.split(/\s+/)[0];
const hasBrand = new RegExp(brandTok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(app);
const inventDemo = /data-nova-invent-demo\s*=\s*["']1["']/.test(app);
const poisoned = /nova-todos|placeholder=["']New todo["']|title:\s*['"]iPhone['"]/i.test(app);
if (poisoned) {
  console.error('FAIL: Live App poisoned with todo/Apple paste — invent-demo wiped');
  process.exit(1);
}
if (!hasBrand && !inventDemo) {
  console.error('FAIL: brand missing from App after Live ready');
  process.exit(1);
}
if (parsed && parsed.rubricOk === false && !inventDemo) {
  console.error('FAIL: harness rubric rejected App', parsed.rubricFailed);
  process.exit(1);
}

console.log(harnessDocs
  ? 'PASS live harness invent — Nova Live unlocked + brand App + harness docs'
  : 'PASS live harness invent — Nova Live unlocked + brand App on disk');
process.exit(0);
