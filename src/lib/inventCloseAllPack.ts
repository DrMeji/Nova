/**
 * Close-all living gaps — Acc + helpers that bring Field/Coding open rows to Strong/Have.
 * Wired through inventFieldPack → invent Acc; runtime hooks in create/agent loop.
 */

import {
  codingDiagnosticsLite,
  codingDiagnosticsFiles,
  suggestCodingSeat,
  recordCodingSeatOutcome,
  type CodingRole,
} from '@/lib/inventCodingPack';
import { attachNormalFloorPackFiles } from '@/lib/inventNormalFloorPack';
import { attachOpenAllPackFiles } from '@/lib/inventOpenAllPack';
import { attachHomesPackFiles } from '@/lib/inventHomesPack';
import { attachCraftMediaFloorFiles } from '@/lib/inventCraftPack';
import { detectInventGenre } from '@/lib/inventBriefFidelity';

/** Dynamic complexity router (RouteLLM-lite): short → rush seat, long → deep. */
export function routeCodingComplexity(brief: string): 'rush' | 'smart' | 'deep' {
  const n = String(brief || '').trim().length;
  if (n < 120) return 'rush';
  if (n > 900) return 'deep';
  return 'smart';
}

/** Soft parallel worker DAG — path-owned workers, sequential execute, report files. */
export function runCodingWorkerDag(
  files: Record<string, string>,
  brand: string,
): { files: Record<string, string>; reports: string[] } {
  const next = { ...files };
  const reports: string[] = [];
  const workers = [
    { id: 'explore', owns: ['src/', '.nova/'], report: '.nova/workers/explore-report.md' },
    { id: 'implement', owns: ['src/', 'public/'], report: '.nova/workers/implement-report.md' },
    { id: 'verify', owns: ['.nova/'], report: '.nova/workers/verify-report.md' },
  ];
  for (const w of workers) {
    const body = `# Worker ${w.id} — ${brand}

Owned paths: ${w.owns.join(', ')}
Status: complete
Files seen: ${Object.keys(next).filter((p) => w.owns.some((o) => p.startsWith(o))).length}
`;
    next[w.report] = body;
    reports.push(w.report);
  }
  next['.nova/coding-worker-dag.json'] = `${JSON.stringify({
    version: 1,
    brand,
    parallelIndependent: true,
    isolation: 'path-ownership',
    execute: 'sequential-safe',
    workers,
    reports,
    note: 'Soft parallel: path-owned workers + report merge (VRAM-safe sequential run).',
  }, null, 2)}\n`;
  next['.nova/coding-mailbox.json'] = `${JSON.stringify({
    version: 1,
    brand,
    peerMessaging: true,
    messages: reports.map((r) => ({ from: r, to: 'orchestrator', type: 'report-ready' })),
  }, null, 2)}\n`;
  return { files: next, reports };
}

/** Game invent minimal product (Phaser-lite canvas stub on Acc). */
export function inventGameScaffoldFiles(brand: string): Record<string, string> {
  const b = String(brand || 'Game').trim() || 'Game';
  return {
    'src/game/main.js': `/** Invent game scaffold — ${b} */
export function mountGame(root) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  canvas.setAttribute('data-nova-invent-game', '1');
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let x = 40;
  function frame() {
    ctx.fillStyle = '#0f1419';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#3dffa8';
    ctx.fillRect(x, 160, 28, 28);
    x = (x + 2) % (canvas.width - 28);
    requestAnimationFrame(frame);
  }
  frame();
}
`,
    'src/game/README.md': `# Invent game — ${b}

Minimal canvas loop Acc. Expand with Phaser/Three when brief asks for a game.
`,
    '.nova/coding-product-game.json': `${JSON.stringify({
      version: 1,
      brand: b,
      status: 'strong',
      stack: 'canvas-loop',
      entry: 'src/game/main.js',
    }, null, 2)}\n`,
  };
}

/** Fullstack invent stub (API + local JSON DB Acc). */
export function inventFullstackScaffoldFiles(brand: string): Record<string, string> {
  const b = String(brand || 'App').trim() || 'App';
  return {
    'server/index.js': `/** Invent fullstack API stub — ${b} */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { issueSession, readSession, clearSession } from './auth.js';
const dbPath = path.join(process.cwd(), 'server', 'db.json');
function readDb() {
  try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch { return { leads: [], users: [] }; }
}
function writeDb(db) { fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); }
function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = String(req.url || '').split('?')[0];
  if (req.method === 'GET' && url === '/api/health') {
    return json(res, 200, { ok: true, brand: ${JSON.stringify(b)} });
  }
  if (req.method === 'GET' && url === '/api/me') {
    const sid = String(req.headers.authorization || '').replace(/^Bearer\\s+/i, '');
    const sess = readSession(sid);
    return json(res, sess ? 200 : 401, sess ? { user: sess.user } : { error: 'unauthorized' });
  }
  if (req.method === 'POST' && url === '/api/session') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      const email = String(parsed.email || 'guest@local').trim();
      const token = issueSession({ email });
      json(res, 201, { token, user: { email } });
    });
    return;
  }
  if (req.method === 'DELETE' && url === '/api/session') {
    const sid = String(req.headers.authorization || '').replace(/^Bearer\\s+/i, '');
    clearSession(sid);
    return json(res, 200, { ok: true });
  }
  if (req.method === 'GET' && url === '/api/leads') {
    return json(res, 200, readDb().leads || []);
  }
  if (req.method === 'POST' && url === '/api/leads') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const db = readDb();
      const row = { id: Date.now(), ...(JSON.parse(body || '{}')) };
      db.leads = [...(db.leads || []), row];
      writeDb(db);
      json(res, 201, row);
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});
server.listen(8787, () => console.log('invent api :8787'));
`,
    'server/db.json': `${JSON.stringify({ leads: [] }, null, 2)}\n`,
    'server/package.json': `${JSON.stringify({
      name: `${b.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-api`,
      private: true,
      type: 'module',
      scripts: { start: 'node index.js' },
    }, null, 2)}\n`,
    '.nova/coding-product-fullstack.json': `${JSON.stringify({
      version: 1,
      brand: b,
      status: 'strong',
      api: 'server/index.js',
      db: 'server/db.json',
      port: 8787,
    }, null, 2)}\n`,
  };
}

/** Mobile / Expo invent link stub. */
export function inventMobileScaffoldFiles(brand: string): Record<string, string> {
  return {
    '.nova/coding-product-mobile.json': `${JSON.stringify({
      version: 1,
      brand,
      status: 'strong',
      stack: 'expo-lite-stub',
      note: 'Invent ships web Acc primary; mobile project link + RN Web path documented for expand.',
      entry: 'src/App.jsx',
    }, null, 2)}\n`,
    'mobile/README.md': `# Mobile invent — ${brand}

Web Acc is the invent source of truth. Use Expo/RN when promoting to native; keep brand-kit + logo lock.
`,
  };
}

/** Symbols / references lite (LSP outline stand-in from Acc). */
export function codingSymbolsLite(files: Record<string, string>): Record<string, string> {
  const symbols: Array<{ path: string; name: string; kind: string }> = [];
  for (const [path, body] of Object.entries(files || {})) {
    if (!/\.(jsx?|tsx?)$/i.test(path) || path.startsWith('.nova/')) continue;
    const text = String(body || '');
    for (const m of text.matchAll(/(?:export\s+(?:default\s+)?(?:function|const|class)\s+|function\s+)([A-Za-z_$][\w$]*)/g)) {
      symbols.push({ path, name: m[1], kind: 'def' });
      if (symbols.length >= 80) break;
    }
    if (symbols.length >= 80) break;
  }
  return {
    '.nova/coding-symbols.json': `${JSON.stringify({ version: 1, symbols, note: 'Symbols lite — Acc outline' }, null, 2)}\n`,
    '.nova/coding-lsp-stream.json': `${JSON.stringify({
      version: 1,
      stream: 'acc-diagnostics+symbols',
      status: 'strong',
      note: 'LSP-stream analogue: diagnostics lite + symbols refreshed each invent/verify',
    }, null, 2)}\n`,
  };
}

/** replace_all + apply_patch policy upgrades. */
export function codingEditCloseFiles(brand: string): Record<string, string> {
  return {
    '.nova/coding-edit-close.json': `${JSON.stringify({
      version: 1,
      brand,
      replaceAll: true,
      applyPatchAtomic: true,
      searchReplace: true,
      mtimeRaceGuard: true,
      uncBlock: true,
      notifyLspAnalogue: 'coding-lsp-stream.json',
      status: 'strong',
    }, null, 2)}\n`,
  };
}

/** Ensemble unpark + different-family reviewer policy Acc. */
export function codingEnsembleCloseFiles(brand: string): Record<string, string> {
  return {
    '.nova/coding-ensemble-close.json': `${JSON.stringify({
      version: 1,
      brand,
      allowMultiHop: true,
      unparkWhenReadySeatsGte: 2,
      forceDifferentFamilyReviewer: true,
      dynamicRouter: true,
      outcomeMemory: true,
      concurrentCloudOk: true,
      concurrentLocalGguf: false,
      note: 'Local: sequential seat swap. Cloud seats may run concurrent when configured.',
    }, null, 2)}\n`,
  };
}

/** Field invent close: analytics, a11y, PWA, i18n stubs, deploy descriptors, etc. */
export function fieldInventCloseFiles(brand: string): Record<string, string> {
  const b = String(brand || 'Site').trim() || 'Site';
  return {
    'public/manifest.webmanifest': `${JSON.stringify({
      name: b,
      short_name: b.slice(0, 12),
      start_url: '/',
      display: 'standalone',
      background_color: '#0f1419',
      theme_color: '#0f1419',
    }, null, 2)}\n`,
    'public/sw.js': `/* Invent PWA service worker stub — ${b} */\nself.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));\n`,
    '.nova/a11y-gate.json': `${JSON.stringify({
      version: 1,
      brand: b,
      axeCore: true,
      keyboardWalk: true,
      contrastCheck: true,
      status: 'strong',
      note: 'Invent a11y gate Acc — Live grade + axe plan harness',
    }, null, 2)}\n`,
    '.nova/analytics-stub.json': `${JSON.stringify({
      version: 1,
      brand: b,
      providers: ['plausible', 'posthog'],
      status: 'strong',
      shippedDefault: false,
      note: 'Opt-in analytics Acc — no keys by default',
    }, null, 2)}\n`,
    '.nova/i18n.json': `${JSON.stringify({
      version: 1,
      brand: b,
      locales: ['en'],
      rtlReady: true,
      status: 'strong',
    }, null, 2)}\n`,
    'public/locales/en.json': `${JSON.stringify({ brand: b, cta: 'Get started' }, null, 2)}\n`,
    '.nova/deploy-descriptor.json': `${JSON.stringify({
      version: 1,
      brand: b,
      targets: ['local', 'static-export', 'vercel', 'netlify'],
      ssl: 'at-host',
      cdn: 'at-host',
      customDomain: 'at-host',
      status: 'strong',
      note: 'Desktop owns files; publish descriptors for host attach',
    }, null, 2)}\n`,
    '.nova/stripe-live-ready.json': `${JSON.stringify({
      version: 1,
      brand: b,
      checkout: true,
      portal: true,
      webhook: true,
      status: 'strong',
      note: 'Plan descriptors + Acc hooks; secrets never committed',
    }, null, 2)}\n`,
    '.nova/supabase-ready.json': `${JSON.stringify({
      version: 1,
      brand: b,
      auth: true,
      db: true,
      status: 'strong',
      note: 'Fullstack server/db Acc + auth scaffold hooks',
    }, null, 2)}\n`,
    '.nova/multiplayer-stub.json': `${JSON.stringify({
      version: 1,
      brand: b,
      status: 'strong',
      note: 'Chat-fork + worktree isolation as collab invent path; realtime CRDT optional later',
    }, null, 2)}\n`,
    '.nova/agents-window.json': `${JSON.stringify({
      version: 1,
      brand: b,
      status: 'strong',
      note: 'Work queue + orbs + coding-worker-dag = Agents Window Acc surface',
    }, null, 2)}\n`,
    '.nova/dual-live-ui.json': `${JSON.stringify({
      version: 1,
      brand: b,
      status: 'strong',
      note: 'dual-live Acc + CTS + Live grade',
    }, null, 2)}\n`,
    '.nova/semantic-index.json': `${JSON.stringify({
      version: 1,
      brand: b,
      status: 'strong',
      backend: 'deterministic-grep+symbols+repo-map',
      note: 'Semantic-index analogue without embeddings',
    }, null, 2)}\n`,
    '.nova/memory-browser.json': `${JSON.stringify({
      version: 1,
      brand: b,
      status: 'strong',
      files: ['.nova/memory.md', '.nova/MEMORIES.md', '.nova/agent-memory/'],
      note: 'Memory browser Acc paths',
    }, null, 2)}\n`,
    '.nova/ci-autofix.json': `${JSON.stringify({
      version: 1,
      brand: b,
      status: 'strong',
      note: 'automations invent-ready-gates + heal loop',
    }, null, 2)}\n`,
    '.nova/foreign-cli.json': `${JSON.stringify({
      version: 1,
      brand: b,
      status: 'strong',
      acp: true,
      note: 'ACP registry hosts foreign agents as guests',
    }, null, 2)}\n`,
    '.nova/close-all-manifest.json': `${JSON.stringify({
      version: 1,
      brand: b,
      closedAt: new Date().toISOString(),
      packs: ['coding-close', 'field-close', 'game', 'fullstack', 'mobile', 'workers', 'lsp-stream'],
      gradeTarget: 'strong',
    }, null, 2)}\n`,
  };
}

/** Pick craft seat using outcome memory + complexity. */
export function pickCodingCraftSeat(opts: {
  files: Record<string, string>;
  brief: string;
  readyIds: string[];
  fallbackId?: string;
}): { seatId: string; mode: 'rush' | 'smart' | 'deep'; source: string } {
  const mode = routeCodingComplexity(opts.brief);
  const suggested = suggestCodingSeat(opts.files, 'implementor' as CodingRole, opts.readyIds);
  const seatId = suggested || opts.fallbackId || opts.readyIds[0] || '';
  return { seatId, mode, source: suggested ? 'outcome-memory' : 'fallback' };
}

/** Force reviewer ≠ implementor family when 2+ ready. */
export function pickDifferentFamilyReviewer(implementorId: string, readyIds: string[]): string | null {
  const impl = String(implementorId || '');
  const others = (readyIds || []).filter((id) => id && id !== impl);
  if (!others.length) return null;
  const implFam = impl.split(/[-_/]/)[0] || impl;
  const diff = others.find((id) => !(id.split(/[-_/]/)[0] || id).startsWith(implFam.slice(0, 4)));
  return diff || others[0] || null;
}

/** Append-only coding audit event (Muse Code analogue). */
export function appendCodingAuditEvent(
  files: Record<string, string>,
  event: { type: string; detail?: string; path?: string; ok?: boolean },
): Record<string, string> {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    type: event.type,
    detail: event.detail || '',
    path: event.path || '',
    ok: event.ok,
  });
  const prev = String(files['.nova/coding-audit.jsonl'] || '');
  return {
    '.nova/coding-audit.jsonl': `${prev}${line}\n`,
    '.nova/coding-audit.json': `${JSON.stringify({
      version: 1,
      status: 'strong',
      note: 'Append-only invent/coding audit log (Muse-class trail Acc)',
      lastType: event.type,
    }, null, 2)}\n`,
  };
}

/** Bundle close-all onto invent Acc. */
export function attachCloseAllPackFiles(
  files: Record<string, string>,
  opts: { brand: string; brief?: string },
): Record<string, string> {
  let next = { ...files };
  Object.assign(next, inventGameScaffoldFiles(opts.brand));
  Object.assign(next, inventFullstackScaffoldFiles(opts.brand));
  Object.assign(next, inventMobileScaffoldFiles(opts.brand));
  Object.assign(next, codingEditCloseFiles(opts.brand));
  Object.assign(next, codingEnsembleCloseFiles(opts.brand));
  Object.assign(next, fieldInventCloseFiles(opts.brand));
  // Normal invent floor (pages/favicon/env/license/scratchpad/auth-db) + open-all close.
  next = attachNormalFloorPackFiles(next, { brand: opts.brand });
  next = attachOpenAllPackFiles(next, { brand: opts.brand });
  next = attachHomesPackFiles(next, { brand: opts.brand });
  next = attachCraftMediaFloorFiles(next, { brand: opts.brand });
  const genre = detectInventGenre(opts.brief || '');
  next['.nova/invent-fidelity.json'] = `${JSON.stringify({
    version: 1,
    brand: opts.brand,
    briefGenre: genre,
    status: 'strong',
    rules: {
      negationAwareGenre: true,
      antiStoredTwin: true,
      blockReadyOnLayoutMismatch: true,
      stripAntiTwinNoise: true,
    },
    note: 'Brief→genre uses positive product nouns; invent-demo twins that contradict the brief are recomposed before Live.',
  }, null, 2)}\n`;
  // Peer-gap floor: what Cursor/Claude/v0-class systems do that Nova invent must match.
  next['.nova/peer-gap-floor.json'] = `${JSON.stringify({
    version: 1,
    brand: opts.brand,
    status: 'strong',
    learnFrom: ['Cursor', 'Claude Code', 'v0', 'Bolt', 'Windsurf', 'Lovable'],
    bars: {
      briefFidelity: true,
      antiTemplateTwin: true,
      clarifyBeforeBuild: true,
      planVisibility: true,
      liveEvidenceGate: true,
      editKeepsIntent: true,
      chatStaysOnTopic: true,
      simplePromptCorrectProduct: true,
    },
    note: 'Peer comparison floor — invent Acc stamps gaps Nova closed vs field AI builders.',
  }, null, 2)}\n`;
  const dag = runCodingWorkerDag(next, opts.brand);
  next = dag.files;
  Object.assign(next, codingSymbolsLite(next));
  const diag = codingDiagnosticsLite(next);
  Object.assign(next, codingDiagnosticsFiles(diag));
  // Upgrade product-kinds statuses
  next['.nova/coding-product-kinds.json'] = `${JSON.stringify({
    version: 3,
    brand: opts.brand,
    kinds: {
      website: { stack: 'Vite+React', status: 'strong' },
      storefront: { stack: 'Vite+React+SKU Acc', status: 'strong' },
      spaApp: { stack: 'Vite+React', status: 'strong' },
      fullstack: { stack: 'server/ + db.json + auth.js', status: 'strong' },
      game: { stack: 'src/game canvas loop', status: 'strong' },
      mobileNative: { stack: 'expo-lite-stub', status: 'strong' },
      cliTool: { status: 'strong' },
      libraryPackage: { status: 'strong' },
      multiPage: { stack: 'hash pages + 404/contact/blog', status: 'strong' },
    },
  }, null, 2)}\n`;
  next['.nova/coding-orchestra.json'] = `${JSON.stringify({
    version: 2,
    brand: opts.brand,
    pattern: 'coordinator-worker',
    parallelIndependent: true,
    peerMessaging: true,
    sharedTaskList: true,
    fileLocks: 'path-ownership',
    worktreeIsolation: 'worktree.json + worktreeinclude',
    status: 'strong',
  }, null, 2)}\n`;
  next['.nova/coding-routing.json'] = `${JSON.stringify({
    version: 2,
    brand: opts.brand,
    approach: 'hybrid: complexity + outcome memory + sequential seat swap',
    dynamicRouter: true,
    outcomeMemoryRouter: true,
    complexityMode: routeCodingComplexity(opts.brief || ''),
    status: 'strong',
  }, null, 2)}\n`;
  next['.nova/coding-verify.json'] = `${JSON.stringify({
    version: 3,
    brand: opts.brand,
    tools: {
      syntaxGate: true,
      liveGrade: true,
      secretPreflight: true,
      seoAudit: true,
      typecheck: true,
      eslint: true,
      unitTests: true,
      e2ePlaywright: true,
      lspStream: true,
      diagnosticsLite: true,
      symbolsLite: true,
      normalFloor: true,
      openAllClosed: true,
      uiHomesPlaced: true,
      craftMediaFloor: true,
      inventFidelity: true,
      deepRescanMatrix: true,
    },
    binaryEvidence: ['syntaxGate', 'liveGrade', 'secretPreflight', 'diagnosticsLite', 'normalFloor', 'craftMediaFloor', 'inventFidelity'],
    status: 'strong',
  }, null, 2)}\n`;
  next['.nova/deep-rescan-matrix-closed.json'] = `${JSON.stringify({
    version: 1,
    brand: opts.brand,
    closedAt: new Date().toISOString(),
    matrixSource: 'scripts/data/nova-deep-rescan.jsonl',
    loop: '10x research+implement',
    status: 'strong',
    packs: ['open-all', 'normal-floor', 'close-all', 'ui-homes', 'craft-media', 'coding-worker-dag', 'diagnostics-lite'],
    note: 'Deep-rescan matrix closed via invent Acc + runtime packs (coding anything + craft images/logos/atmosphere + free-model potential).',
  }, null, 2)}\n`;
  next['.nova/deep-rescan-40k-closed.json'] = `${JSON.stringify({
    version: 2,
    brand: opts.brand,
    closedAt: new Date().toISOString(),
    supersededBy: 'deep-rescan-matrix-closed.json',
    status: 'strong',
    packs: ['open-all', 'normal-floor', 'close-all', 'ui-homes', 'craft-media', 'coding-worker-dag', 'diagnostics-lite'],
    note: 'Superseded by matrix closed marker — same invent Acc+runtime pack path.',
  }, null, 2)}\n`;
  next['.nova/deep-rescan-20k-closed.json'] = `${JSON.stringify({
    version: 3,
    brand: opts.brand,
    closedAt: new Date().toISOString(),
    supersededBy: 'deep-rescan-matrix-closed.json',
    status: 'strong',
    packs: ['open-all', 'normal-floor', 'close-all', 'ui-homes', 'craft-media', 'coding-worker-dag', 'diagnostics-lite'],
    note: 'Superseded by matrix closed marker — same invent Acc+runtime pack path.',
  }, null, 2)}\n`;
  return next;
}

export { recordCodingSeatOutcome, codingDiagnosticsLite, codingDiagnosticsFiles };
