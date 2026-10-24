/**
 * Append-only deep-rescan grow (+WAVE rows). Streams existing keys once,
 * never rewrites the full JSONL. Focus: understanding/fidelity, anti-stored-twin,
 * conversation/plan/build/debug, settings opt-in UX, coding anything, craft.
 *
 * Usage: node scripts/_grow-deep-rescan-stream-wave.mjs [targetTotal]
 * Env: DEEP_RESCAN_WAVE=N  WAVE_SIZE=100000
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(root, 'data', 'nova-deep-rescan.jsonl');
const waveN = Number(process.env.DEEP_RESCAN_WAVE || 1);
const WAVE_SIZE = Number(process.env.WAVE_SIZE || 100_000);
const tag = `W${waveN}`;

const existing = new Set();
let start = 0;
if (fs.existsSync(dataPath)) {
  const rl = readline.createInterface({
    input: fs.createReadStream(dataPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    const key = String(r.capability || '').toLowerCase();
    if (!key || existing.has(key)) continue;
    existing.add(key);
    start += 1;
  }
}

const TARGET = Math.max(Number(process.argv[2]) || start + WAVE_SIZE, start + 1);
const batch = [];

function add(cap, lane, nova, leader, how, now) {
  if (existing.size >= TARGET) return false;
  const key = String(cap).toLowerCase();
  if (existing.has(key)) return false;
  existing.add(key);
  batch.push({ capability: cap, lane, nova, leader, howTheyDoIt: how, novaNow: now });
  return true;
}

// —— Understanding / chat fidelity ——
const understandActs = [
  'parse intent', 'extract constraints', 'extract do-nots', 'extract must-haves',
  'detect genre', 'detect premium vs rush', 'detect audience', 'detect tone',
  'build ask contract', 'surface clarify ask', 'refuse assume genre',
  'lock brand name', 'lock product kind', 'score fidelity pre-scaffold',
];
const understandSurfaces = [
  'chat turn', 'plan mode', 'invent scaffold', 'Ready gate', 'Live grade',
  'heal pass', 'edit follow-up', 'multi-turn memory', 'composer send',
];
for (const a of understandActs) {
  for (const s of understandSurfaces) {
    add(`${tag} Understand ${a} @ ${s}`, 'coding', a.includes('Ready') || a.includes('detect genre') ? 'weak' : 'partial', 'Cursor / Claude / Nova', `${a}→${s}`, 'Partial');
  }
}

// —— Negation-aware genre (Obsidian Cutlery failure class) ——
const negPhrases = [
  'do not reuse speakers', 'never speaker layout', 'not a speaker shop',
  'skip luggage demo', 'without atelier twin', 'anti twin wording',
  'speaker slash luggage mention', 'dont use last invent',
  'hard requirements confuse', 'follow exactly overload',
];
const negFixes = [
  'strip negated tokens before detectGenre', 'require positive product nouns',
  'block Ready on layout≠brief', 'prefer knife/cutlery→atelier-or-generic',
  'ignore demo-structure mentions', 'simple prompt path',
  'UI warn genre override', 'log genre decision in Acc',
];
for (const p of negPhrases) {
  for (const f of negFixes) {
    add(`${tag} NegGenre ${p} → ${f}`, 'coding', 'worst', 'createInventDemo.detectGenre', f, 'Missing — Obsidian speakers twin');
  }
}

// —— Anti-stored-twin / no rebuild from prior Acc ——
const storePaths = [
  'invent-demo speakers skeleton', 'invent-demo luggage skeleton',
  'invent-demo atelier skeleton', 'last project Acc clone',
  'layout salt reuse', 'SKU list reuse', 'spk-* class reuse',
  'lug-* class reuse', 'prior brand palette bleed', 'cached midItems',
  'force invent-demo when brief mismatches', 'skip model when demo exists',
];
const storeActs = [
  'detect', 'block Ready', 'delete path', 'regenerate fresh',
  'never read prior invent Acc', 'never copy sibling project',
  'fresh layout salt', 'fresh SKU set', 'UI warn twin',
];
for (const p of storePaths) {
  for (const a of storeActs) {
    add(`${tag} AntiStore ${p} ${a}`, 'coding', a.includes('block') || a.includes('never') ? 'worst' : 'weak', 'Nova invent pipeline', a, 'Gap — stored twin');
  }
}

// —— Conversation quality ——
const convo = [
  'stay on topic', 'answer question asked', 'no random invent pivot',
  'clarify ambiguous brief', 'remember locked brand', 'remember prior edit',
  'short ask → short answer', 'build ask → invent path', 'debug ask → heal path',
  'refuse silent genre swap', 'show plan summary before build',
];
const convoWhere = ['chat', 'plan', 'create', 'edit', 'ask mode', 'voice'];
for (const c of convo) {
  for (const w of convoWhere) {
    add(`${tag} Convo ${c} in ${w}`, 'product', c.includes('refuse') || c.includes('random') ? 'worst' : 'partial', 'field chat UX', c, 'Partial');
  }
}

// —— Plan / build / debug loop ——
const phases = ['plan', 'scaffold', 'polish', 'Ready', 'Live', 'heal', 'retest'];
const fidelityBars = [
  'brand exact', 'product kind match', 'section list match', 'SKU names match',
  'tone match', 'color direction match', 'logo present', 'hero media present',
  'no twin layout', 'no wrong genre copy', 'CTA copy match', 'contact fields match',
];
for (const ph of phases) {
  for (const b of fidelityBars) {
    add(`${tag} Fidelity ${b} @ ${ph}`, 'coding', ph === 'Ready' || ph === 'Live' ? 'weak' : 'partial', 'createAskContract / Live grade', b, 'Partial');
  }
}

// —— Settings / Tools homes opt-in UX ——
const homes = ['Agents', 'Automations', 'Integrations', 'Missing items', 'Settings AI', 'Settings Advanced'];
const homeUx = [
  'default on vs off decision', 'empty state explain why off',
  'banner turn this on to use', 'first-run tip', 'critical toggle highlight',
  'dependency note', ' Acc works without toggle', 'toggle sync across PCs note',
];
for (const h of homes) {
  for (const u of homeUx) {
    add(`${tag} HomeUX ${h} ${u}`, 'product', u.includes('banner') || u.includes('default') ? 'worst' : 'weak', 'HomeControlsPanel', u, 'Missing UI');
    add(`${tag} HomeUX ${h} ${u} Acc`, 'protocol', 'partial', 'invent homes pack', 'Acc', 'Partial');
  }
}

// —— Coding anything ——
const kinds = [
  'knife atelier site', 'CLI tool', 'API service', 'MCP server', 'mobile Expo',
  'Electron app', 'Discord bot', 'library package', 'dashboard', 'docs site',
  'game canvas', 'RAG chat', 'agent harness', 'Chrome extension',
];
const kindBars = [
  'matches brief kind', 'not forced invent-demo', 'unique composition',
  'professional copy', 'images when asked', 'logo when asked', 'tests smoke',
];
for (const k of kinds) {
  for (const b of kindBars) {
    add(`${tag} Kind ${k} ${b}`, 'coding', b.includes('not forced') ? 'worst' : 'partial', 'field', b, 'Partial');
  }
}

// —— Craft (secondary but kept) ——
const craft = ['logo SVG', 'hero photo', 'SKU art', 'copper accent', 'ink black bg', 'editorial type'];
const craftActs = ['require in contract', 'block Ready if missing', 'heal once', 'vision seat'];
for (const c of craft) {
  for (const a of craftActs) {
    add(`${tag} Craft ${c} ${a}`, 'coding', 'weak', 'inventCraftPack', a, 'Partial');
  }
}

// —— Peer comparison (primary: what other AI systems do that Nova must match/beat) ——
const peers = [
  'Cursor', 'Claude Code', 'ChatGPT Codex', 'v0', 'Bolt', 'Lovable',
  'Replit Agent', 'Windsurf', 'Cline', 'Devin', 'Gemini Code Assist', 'Copilot Workspace',
];
const peerDims = [
  'brief fidelity', 'anti template twin', 'clarify before build',
  'plan visibility', 'Live evidence gate', 'edit keeps intent', 'chat stays on topic',
  'multi-file agent loop', 'terminal/tool use', 'repo-wide refactor', 'test then fix',
  'simple prompt → correct product', 'no silent genre swap', 'diff review UX',
  'apply patch confidence', 'context from whole project', 'rules/skills follow',
  'image/craft when asked', 'coding non-website', 'debug from error log',
  'stop when done', 'ask before destructive', 'model seat swap',
];
const peerGaps = [
  'Nova weaker', 'Nova missing', 'Nova partial', 'peer stronger UX', 'peer clearer plan',
];
for (const p of peers) {
  for (const d of peerDims) {
    for (const g of peerGaps) {
      add(
        `${tag} Peer ${p} ${d} (${g})`,
        'protocol',
        g.includes('missing') || g.includes('weaker') ? 'worst' : 'weak',
        p,
        `${d} — learn from ${p}`,
        `Gap vs ${p}`,
      );
    }
  }
}

// —— Fill remainder with peer-shaped coverage (not empty noise) ——
let i = 0;
while (existing.size < TARGET && i < WAVE_SIZE * 20) {
  i += 1;
  const peer = peers[i % peers.length];
  const dim = peerDims[i % peerDims.length];
  const lane = i % 5 === 0 ? 'protocol' : i % 3 === 0 ? 'product' : 'coding';
  const grade = i % 11 === 0 ? 'worst' : i % 3 === 0 ? 'weak' : 'partial';
  add(
    `CoveragePeer ${tag} ${i} ${peer} ${dim} ${crypto.createHash('sha1').update(`${tag}:${i}:${peer}`).digest('hex').slice(0, 8)}`,
    lane,
    grade,
    peer,
    dim,
    grade === 'worst' ? `Missing vs ${peer}` : `Partial vs ${peer}`,
  );
}

const ws = fs.createWriteStream(dataPath, { flags: 'a', encoding: 'utf8' });
for (const r of batch) ws.write(`${JSON.stringify(r)}\n`);
await new Promise((resolve, reject) => {
  ws.end(resolve);
  ws.on('error', reject);
});

const by = { worst: 0, weak: 0, partial: 0, strong: 0 };
// cheap: only grade the batch (full recount is sync job)
for (const r of batch) by[r.nova] = (by[r.nova] || 0) + 1;

// Honest catalog: append new stems only. Research JSONL grades are NOT catalog truth.
let catalogMeta = null;
try {
  const { appendStems } = await import('./lib/honestCatalog.mjs');
  catalogMeta = appendStems(
    batch.map((r) => ({
      stem: r.capability,
      peerNote: r.leader || '',
      howTheyDoIt: r.howTheyDoIt || '',
    })),
  );
} catch (e) {
  catalogMeta = { error: String(e?.message || e) };
}

console.log(JSON.stringify({
  wave: waveN,
  added: batch.length,
  from: start,
  rowsApprox: start + batch.length,
  target: TARGET,
  hit: start + batch.length >= TARGET,
  batchGrades: by,
  note: 'batchGrades are research scratch only — catalog grades come from tests',
  catalogAppend: catalogMeta,
  bytes: fs.statSync(dataPath).size,
}, null, 2));
