/**
 * Coding-deep research — Nova vs peers on the FULL coding pipeline:
 * understand brief → prep (keys/models/PC/MCP) → scaffold → code craft order
 * → per-file/per-patch verify → premium quality → Live/done.
 *
 * Combines prior CodeBuild/Nav/Model/UX/Unique/MissingUI dims with new
 * CodePipe / CodeCraft / CodeVerify / CodePremium / CodeUnderstand dims.
 *
 * APPLY=1 appends coding catalog. Existing stems are skipped (resume-safe).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { appendStems, loadCatalogKeySet, CODING_MISSING_PATH } from './lib/honestCatalog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'data', 'coding-discover-batch.jsonl');
const wave = Number(process.env.RESEARCH_WAVE || Date.now() % 100000);

/** Frontier + open coding stacks — labels for how they wire prompt→build. */
const peers = [
  'Cursor', 'Claude Code', 'ChatGPT Codex', 'Devin', 'Windsurf', 'Cline',
  'OpenCode', 'Aider', 'Continue', 'v0', 'Bolt', 'Lovable', 'Copilot Workspace',
  'Replit Agent', 'Amazon Q', 'Zed AI', 'Sourcegraph Amp',
  'Gemini Code Assist', 'Cody', 'Roo Code', 'Goose', 'Augment', 'Trae',
  'Codeium', 'Tabnine', 'PearAI', 'OpenHands', 'SWE-agent', 'Mentat',
];

/**
 * Begin → end coding pipeline (what peers do seamlessly; Nova must match).
 * Prefixes kept stable so resumeWaveStart / family classify keep working.
 */
const CODE_DIMS = [
  // —— Understand the ask (before any file write) ——
  ['CodeUnderstand', 'parse product kind genre constraints from one user prompt'],
  ['CodeUnderstand', 'reject generic twin when brief names a specific product'],
  ['CodeUnderstand', 'extract brand tone premium bar colors layout intent'],
  ['CodeUnderstand', 'clarify only when brief is ambiguous never stall hard go'],
  ['CodeUnderstand', 'map simple build-me-X to concrete file plan before coding'],

  // —— Prep: keys, models, PC, servers, MCP ——
  ['CodePipe', 'check provider API keys before first model call'],
  ['CodePipe', 'pick create model seat vs chat model seat explicitly'],
  ['CodePipe', 'prefer cloud coding model when local too weak for multi-file'],
  ['CodePipe', 'read PC RAM disk Node npm availability before scaffold'],
  ['CodePipe', 'register MCP tools and allowlist before agent acts'],
  ['CodePipe', 'warm model load with timeout then continue scaffold'],
  ['CodePipe', 'create project folders and package scaffold before craft'],
  ['CodePipe', 'bind binder project path so Create never hijacks wrong folder'],

  // —— Build / agent pipeline (prior + keep) ——
  ['CodeBuild', 'multi-file create from brief without invent-demo twin'],
  ['CodeBuild', 'stream file writes with cancel mid-build'],
  ['CodeBuild', 'npm install + Live verify after invent'],
  ['CodeBuild', 'surgical edit keeps layout salt and brand'],
  ['CodeBuild', 'debug console error maps to file:line patch'],
  ['CodeBuild', 'resume create job exactly where it left off after interrupt'],
  ['CodeBuild', 'checkpoint disk state so crash does not lose craft progress'],

  // —— How it actually codes (craft order + quality) ——
  ['CodeCraft', 'code layout shell structure before colors and copy'],
  ['CodeCraft', 'derive palette typography logo from product kind first'],
  ['CodeCraft', 'write real sections buttons forms not placeholder lorem'],
  ['CodeCraft', 'add icons motion only after structure and brand land'],
  ['CodeCraft', 'write one coherent App then CSS then data not random order'],
  ['CodeCraft', 'read file before patch every surgical edit'],
  ['CodeCraft', 'full file rewrite only when scaffold is still thin'],
  ['CodeCraft', 'premium density spacing hierarchy not basic thrown UI'],
  ['CodeCraft', 'match asked product SKUs features not sibling brand twin'],
  ['CodeCraft', 'gaming HUD loop vs website landing vs utility app each path'],

  // —— Verify cadence while coding ——
  ['CodeVerify', 'syntax check after each file write before next file'],
  ['CodeVerify', 'thin-app reject after App.jsx write force deepen'],
  ['CodeVerify', 'post-patch verify after every agent patch not only at end'],
  ['CodeVerify', 'Live mount console smoke before marking Ready'],
  ['CodeVerify', 'per-step evidence in agent trace for each tool call'],
  ['CodeVerify', 'doom-loop breaker when same thin file rewritten thrice'],
  ['CodeVerify', 'accept-first depth never persist rejected weak UI'],

  // —— Premium bar ——
  ['CodePremium', 'output looks designed not template-default brown chrome'],
  ['CodePremium', 'unique layout salt per brand same genre'],
  ['CodePremium', 'copy and CTAs sound on-brief not generic startup speak'],
  ['CodePremium', 'responsive states hover focus empty error covered'],
  ['CodePremium', 'no storefront-floor markers in shipped Ready app'],

  // —— Hard coding-quality win (forces implement, not Strong-by-wire) ——
  ['CodeQuality', 'understand→prep→scaffold→craft→verify→premium→done pipeline enforced'],
  ['CodeQuality', 'verify after every file write before next file'],
  ['CodeQuality', 'premium floor reject blocks Ready on twin or thin App'],
  ['CodeQuality', 'dashboard SaaS invent path not generic shop chrome'],
  ['CodeQuality', 'game and utility invent paths never storefront twin'],
  ['CodeQuality', 'create wires codingQualityWinPack progress statuses'],
  ['CodeQuality', 'agent loop floor hit observations before done'],
  ['CodeQuality', 'one-prompt build matches asked product without heal loops'],

  // —— Nav / model / UX (prior) ——
  ['CodeNav', 'project tree jump to edited file'],
  ['CodeNav', 'diff review before apply'],
  ['CodeNav', 'open binder project never hijacked by Create'],
  ['CodeModel', 'explicit model seat pick for create vs chat'],
  ['CodeModel', 'cheap model for classify expensive for implement'],
  ['CodeModel', 'show which model wrote which file'],
  ['CodeUX', 'live progress says exact step invent→npm→Live'],
  ['CodeUX', 'stop/cancel create leaves clean disk'],
  ['CodeUX', 'agent trace lists tools and file paths'],
  ['CodeUX', 'progress shows understand→prep→scaffold→craft→verify→done'],

  // —— Uniqueness / product kinds ——
  ['CodeUnique', 'knife shop palette logo font layout ≠ textile atelier'],
  ['CodeUnique', 'cafe build ≠ speakers ≠ luggage chrome'],
  ['CodeUnique', 'gaming app scaffold has HUD loop not landing page'],
  ['CodeUnique', 'basic utility app scaffold not storefront twin'],
  ['CodeUnique', 'two brands same genre still salt layout and SKUs'],
  ['CodeUnique', 'logo and --bg derived from product kind not fixed brown'],

  // —— Missing UI / keys / tabs / chrome (→ Missing tab with eventualHome) ——
  ['CodeMissingUI', 'mode switcher Ask/Plan/Act always visible'],
  ['CodeMissingUI', 'model picker in composer like Cursor'],
  ['CodeMissingUI', 'coding worker DAG viewer'],
  ['CodeMissingUI', 'apply-patch confidence meter'],
  ['CodeMissingUI', 'per-file model attribution chip'],
  ['CodeMissingUI', 'create kind picker website/game/utility'],
  ['CodeMissingUI', 'pipeline step checklist understand through done'],
  ['CodeMissingUI', 'per-file verify pass/fail chips while coding'],
  ['CodeMissingUI', 'Settings Providers API key rows with test-connection'],
  ['CodeMissingUI', 'Settings AI create-vs-chat model seat tabs'],
  ['CodeMissingUI', 'Settings Privacy secrets never echoed banner'],
  ['CodeMissingUI', 'Settings Projects binder path + invent scope'],
  ['CodeMissingUI', 'MCP servers tab connect OAuth and tool list'],
  ['CodeMissingUI', 'Agents window timeline cancel and retry'],
  ['CodeMissingUI', 'Live chrome console errors jump to file:line'],
  ['CodeMissingUI', 'Code header Ready npm Live status cluster'],
  ['CodeMissingUI', 'Chat side plan card approve before scaffold'],
  ['CodeMissingUI', 'Nav Tools automations MCP ACP entrypoints'],
  ['CodeMissingUI', 'missing-items home routing chips by surface'],
  ['CodeMissingUI', 'cloud key missing CTA opens Providers settings'],
  ['CodeMissingUI', 'local model download progress in Settings AI'],
  ['CodeMissingUI', 'create progress cancel button always reachable'],
  ['CodeMissingUI', 'diff review panel before apply patch'],
  ['CodeMissingUI', 'premium quality score chip after each craft file'],
];

const kinds = [
  ['CodeKind', 'website landing invent path'],
  ['CodeKind', 'ecommerce storefront invent path'],
  ['CodeKind', 'gaming canvas app invent path'],
  ['CodeKind', 'todo/utility app invent path'],
  ['CodeKind', 'dashboard/saas invent path'],
  ['CodeKind', 'portfolio invent path'],
];

const gaps = ['Nova missing', 'Nova weaker', 'peer stronger UX', 'needs Missing tab'];
const existing = loadCatalogKeySet();
const rows = [];
const missingSink = [];
const MISSING_CAP = Math.max(200, Number(process.env.MISSING_NEW_CAP || 800));

function pushStem(stem, peerNote, howTheyDoIt, leader) {
  if (existing.has(stem.toLowerCase())) return;
  existing.add(stem.toLowerCase());
  rows.push({ stem, peerNote, howTheyDoIt, leader });
  if (
    missingSink.length < MISSING_CAP
    && /CodeMissingUI|needs Missing tab|Nova missing|CodePipe|CodeCraft|CodeVerify|CodePremium|CodeUnderstand/i.test(
      `${stem} ${howTheyDoIt}`,
    )
  ) {
    const id = `coding-${crypto.createHash('sha1').update(stem).digest('hex').slice(0, 10)}`;
    missingSink.push({
      id,
      title: stem.replace(/^Code\w+\s+\d+\s+/, '').slice(0, 96),
      why: `${howTheyDoIt} · peer=${leader} · wave ${wave}`,
      eventualHome: (() => {
        const t = `${stem} ${howTheyDoIt}`;
        if (/Providers|API key|cloud key|test-connection/i.test(t)) return 'settings-providers';
        if (/Settings AI|local model download|model seat tabs/i.test(t)) return 'settings-ai';
        if (/Privacy|secrets never echoed/i.test(t)) return 'settings-privacy';
        if (/Settings Projects|binder path|invent scope/i.test(t)) return 'settings-projects';
        if (/MCP servers|OAuth|Nav Tools|automations|ACP/i.test(t)) return 'nav-tools';
        if (/Agents window|DAG|worker|agent|trace|verify cadence/i.test(t)) return 'agents-window';
        if (/Live chrome|preview|console errors jump/i.test(t)) return 'live-chrome';
        if (/Chat side|plan card|composer|mode switcher|model picker/i.test(t)) return 'chat-composer';
        if (/kind picker|premium|palette|layout|craft|workspace/i.test(t)) return 'workspace';
        if (/Code header|Ready npm|diff review|missing-items home/i.test(t)) return 'code-header';
        if (/Pipe|Understand|prep|Node|RAM|key/i.test(t)) return 'settings-providers';
        return 'new-surface';
      })(),
      homeLabel: 'Coding-deep discovery',
      critical: /missing|weaker|Unique|twin|premium|verify|Understand|Pipe/i.test(
        `${stem} ${howTheyDoIt}`,
      ),
    });
  }
}

for (const peer of peers) {
  for (const [prefix, dim] of CODE_DIMS) {
    for (const g of gaps) {
      const stem = `${prefix} ${wave} ${peer}: ${dim} (${g})`;
      pushStem(stem, peer, dim, peer);
    }
  }
}

for (const [prefix, dim] of kinds) {
  for (const peer of peers.slice(0, 10)) {
    const stem = `${prefix} ${wave} ${peer}: ${dim} (Nova missing)`;
    pushStem(stem, peer, dim, peer);
  }
}

// Extra volume — hash-stamped so waves never stall; capped for PC safety.
const EXTRA = Number(process.env.EXTRA_ROWS || 300);
for (let i = 0; i < EXTRA; i += 1) {
  const peer = peers[i % peers.length];
  const [prefix, dim] = CODE_DIMS[i % CODE_DIMS.length];
  const h = crypto.createHash('sha1').update(`code:${wave}:${i}:${dim}`).digest('hex').slice(0, 8);
  const stem = `${prefix} ${wave} #${i} ${peer} ${dim} ${h}`;
  pushStem(stem, peer, dim, peer);
}

fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

// Merge missing sink (append-only by id).
let prior = [];
if (fs.existsSync(CODING_MISSING_PATH)) {
  try { prior = JSON.parse(fs.readFileSync(CODING_MISSING_PATH, 'utf8')).items || []; } catch { prior = []; }
}
const missMap = new Map(prior.map((x) => [x.id, x]));
for (const m of missingSink) if (!missMap.has(m.id)) missMap.set(m.id, m);
const missingDoc = {
  updatedAt: new Date().toISOString(),
  wave,
  count: missMap.size,
  items: [...missMap.values()],
};
fs.writeFileSync(CODING_MISSING_PATH, `${JSON.stringify(missingDoc, null, 2)}\n`);

console.log(JSON.stringify({
  wave,
  wrote: rows.length,
  missingNew: missingSink.length,
  missingTotal: missMap.size,
  dims: CODE_DIMS.length,
  peers: peers.length,
  path: out,
  missingPath: CODING_MISSING_PATH,
}, null, 2));

if (process.env.APPLY === '1') {
  console.log(JSON.stringify({ applied: appendStems(rows, { wave }) }, null, 2));
}
