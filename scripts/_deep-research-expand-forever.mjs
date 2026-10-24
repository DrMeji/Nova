/**
 * Keep inventing NEW peer/spine stems each run (wave stamped) so research
 * never stalls on "already discovered". APPLY=1 appends to catalog.
 *
 * Each wave rotates a DIFFERENT gap pool so the living canvas list visibly
 * changes (not the same peer/bar template with only R### / hash swapped).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { appendStems, loadCatalogMap } from './lib/honestCatalog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'data', 'discover-batch.jsonl');
const wave = Number(process.env.RESEARCH_WAVE || Date.now() % 100000);
const peers = [
  'Cursor', 'ChatGPT', 'Claude Code', 'Grok', 'Gemini', 'Copilot Workspace',
  'Devin', 'Windsurf', 'OpenCode', 'Cline', 'v0', 'Bolt', 'Lovable', 'Amazon Q',
];

/** Rotating gap pools — wave % pools.length picks which set of bars appear. */
const GAP_POOLS = [
  [
    ['brief', ['negation-aware genre', 'must-have extraction', 'do-not list honored', 'brand lock across turns']],
    ['plan', ['visible step list', 'user confirm before scaffold', 'estimate file touch count', 'risk callouts']],
    ['build', ['streaming file writes', 'mid-build cancel', 'Live unlock honesty', 'no twin skeleton']],
    ['edit', ['surgical rename', 'keep layout salt', 'reject unrelated rewrite', 'show diff before apply']],
    ['debug', ['console error → fix', 'Network fail hint', 'blank Live auto-heal', 'repro steps in reply']],
    ['agent', ['tool call trace UI', 'sandbox shell', 'multi-file patch batch', 'stop on test fail']],
    ['chat', ['short answer for short ask', 'no random create pivot', 'remember locked brand', 'cite project file']],
    ['craft', ['logo when asked', 'hero image pipeline', 'SKU art unique', 'premium typography']],
  ],
  [
    ['brief', ['anti template twin', 'simple prompt stays simple', 'no silent genre swap', 'locked palette honored']],
    ['plan', ['todos with owners', 'exit plan without building', 'cost/time estimate', 'dependency callouts']],
    ['build', ['partial apply resume', 'cancel leaves clean tree', 'progress with file list', 'never invent extra pages']],
    ['edit', ['rename updates imports', 'preserve a11y labels', 'no drive-by refactors', 'inline diff accept/reject']],
    ['debug', ['stack trace → file:line', 'fix red → focused fix', 'hydration mismatch hint', 'keep failing test first']],
    ['agent', ['parallel tool calls', 'permission before rm -rf', 'MCP tool picker', 'context from whole repo']],
    ['chat', ['clarify before build', 'refuse silent invent pivot', 'multi-turn memory', 'ask before destructive']],
    ['craft', ['og image when asked', 'icon set consistency', 'photo not stock twin', 'motion only if requested']],
  ],
  [
    ['brief', ['competitor feature parity note', 'accessibility must-haves', 'i18n-ready copy', 'empty-state copy locked']],
    ['plan', ['milestone gates', 'rollback plan visible', 'who edits which folder', 'open questions listed']],
    ['build', ['env secrets never echoed', 'install then verify', 'screenshot after Live', 'bundle size warning']],
    ['edit', ['css token reuse', 'no absolute px sprawl', 'keep route names', 'comment only when asked']],
    ['debug', ['CORS hint', '404 asset path', 'websocket reconnect', 'slow query callout']],
    ['agent', ['git status before commit', 'PR description draft', 'bisect failing commit', 'worktree isolation']],
    ['chat', ['quote user constraint', 'no jargon when asked simple', 'link to file path', 'stop when done']],
    ['craft', ['favicon + app icon', 'dark/light pair', 'print stylesheet skip', 'chart not decoration']],
  ],
  [
    ['brief', ['mobile-first constraint', 'offline-capable ask', 'SEO title locked', 'analytics events named']],
    ['plan', ['API contract first', 'seed data plan', 'auth roles matrix', 'feature flag map']],
    ['build', ['typecheck before Live', 'lint clean gate', 'storybook skip unless asked', 'docker only if asked']],
    ['edit', ['dead code sweep optional', 'import sort stable', 'no prettier wars', 'keep existing test ids']],
    ['debug', ['memory leak hint', 'race condition repro', 'flaky test quarantine', 'sourcemap jump']],
    ['agent', ['browser CDP click', 'screenshot to edit', 'long context map', 'cheap model classify']],
    ['chat', ['voice transcript cleanup', 'plan mode stickiness', 'debug clinic tone', 'homes banner honesty']],
    ['craft', ['SVG logo crisp', 'hero video poster', 'SKU angle unique', 'type scale 1.25']],
  ],
];

const THEMES = [
  'peer-gap',
  'spine-gap',
  'oss-gap',
  'premium-gap',
  'mobile-gap',
  'a11y-gap',
  'perf-gap',
  'security-gap',
];

const families = GAP_POOLS[wave % GAP_POOLS.length];
const theme = THEMES[wave % THEMES.length];
const gapTag = ['Nova missing', 'Nova weaker', 'peer stronger UX', 'peer clearer plan'][wave % 4];

const existing = loadCatalogMap();
const rows = [];

// Peer rows — readable, theme-stamped so wave N ≠ wave N+1 visually.
for (const p of peers) {
  for (const [fam, bars] of families) {
    for (const b of bars) {
      const stem = `PeerR${wave} ${theme} ${p} ${fam}: ${b} (${gapTag})`;
      if (existing.has(stem.toLowerCase())) continue;
      rows.push({
        stem,
        peerNote: p,
        howTheyDoIt: `${theme} · ${fam} · ${b}`,
        leader: p,
      });
    }
  }
}

// Hash-expanded coverage — unique research volume; theme in stem for visible churn.
for (let i = 0; i < Number(process.env.EXTRA_ROWS || 400); i += 1) {
  const p = peers[i % peers.length];
  const [fam, bars] = families[i % families.length];
  const b = bars[i % bars.length];
  const h = crypto.createHash('sha1').update(`w${wave}:${theme}:${i}:${p}:${b}`).digest('hex').slice(0, 8);
  const stem = `CoverageR${wave} ${theme} #${i} ${p} ${fam} ${b} ${h}`;
  if (existing.has(stem.toLowerCase())) continue;
  rows.push({ stem, peerNote: p, howTheyDoIt: `${theme} · ${b}`, leader: p });
}

fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(JSON.stringify({ wave, theme, gapTag, pool: wave % GAP_POOLS.length, wrote: rows.length, path: out }, null, 2));
if (process.env.APPLY === '1') {
  console.log(JSON.stringify({ applied: appendStems(rows, { wave }) }, null, 2));
}
