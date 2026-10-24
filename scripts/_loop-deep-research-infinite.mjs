/**
 * Infinite-style deep research loop (append-only JSONL + slim canvas sync).
 * Stops at DEEP_RESCAN_MAX (default 3_000_000) or DEEP_RESCAN_MAX_WAVES.
 * Does NOT implement — research only; wait for user go-ahead.
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.join(root, '..');
const dataPath = path.join(root, 'data', 'nova-deep-rescan.jsonl');
const progressPath = path.join(root, 'data', 'infinite-research-progress.json');
const MAX = Number(process.env.DEEP_RESCAN_MAX || 3_000_000);
const WAVE_SIZE = Number(process.env.WAVE_SIZE || 100_000);
const MAX_WAVES = Number(process.env.DEEP_RESCAN_MAX_WAVES || 50);
const SYNC_EVERY = Number(process.env.SYNC_EVERY || 1);

async function countRows() {
  if (!fs.existsSync(dataPath)) return 0;
  let n = 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(dataPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.trim()) n += 1;
  }
  return n;
}

function run(label, args, env = {}) {
  console.log(`\n======== ${label} ========`);
  const r = spawnSync(process.execPath, args, {
    cwd: project,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(`${label} failed status=${r.status}`);
}

const progress = {
  startedAt: new Date().toISOString(),
  max: MAX,
  waveSize: WAVE_SIZE,
  themes: [
    'peer comparison (Cursor/Claude/v0/Bolt/Windsurf/…)',
    'what peers do better → Nova gaps',
    'understanding/fidelity',
    'anti-stored-twin',
    'conversation',
    'plan/build/debug',
    'settings home UX defaults',
    'coding anything',
    'craft',
  ],
  waves: [],
  implement: false,
  note: 'Peer-gap research only — wait for user implement go-ahead + code-wire verify',
};

let rows = await countRows();
console.log(`Start rows=${rows} max=${MAX}`);

let wave = 0;
while (rows < MAX && wave < MAX_WAVES) {
  wave += 1;
  const target = Math.min(rows + WAVE_SIZE, MAX);
  console.log(`\n########## RESEARCH WAVE ${wave} → ${target} ##########`);
  run(`grow→${target}`, [path.join(root, '_grow-deep-rescan-stream-wave.mjs'), String(target)], {
    DEEP_RESCAN_WAVE: String(wave),
    WAVE_SIZE: String(WAVE_SIZE),
  });
  rows = await countRows();
  if (wave % SYNC_EVERY === 0 || rows >= MAX) {
    run('sync canvas', [path.join(root, '_sync-deep-rescan-canvas.mjs')]);
  }
  progress.waves.push({ wave, rows, target, at: new Date().toISOString() });
  progress.updatedAt = new Date().toISOString();
  progress.rows = rows;
  fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
  if (rows >= MAX) break;
}

progress.finishedAt = new Date().toISOString();
progress.stoppedReason = rows >= MAX ? `hit max ${MAX}` : `hit max waves ${MAX_WAVES}`;
progress.ok = true;
fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);

// Write human summary list for user review (no implement)
const summaryPath = path.join(root, 'data', 'infinite-research-summary.md');
const summary = `# Deep research summary (research only — await implement go-ahead)

Stopped: ${progress.stoppedReason}
Rows: **${rows.toLocaleString()}**
Waves: ${progress.waves.length}
Started: ${progress.startedAt}
Finished: ${progress.finishedAt}

## Theme buckets researched

${progress.themes.map((t) => `- ${t}`).join('\n')}

## Must-fix clusters (for later implement)

1. **Negation-aware genre detect** — “don’t use speaker layout” must not select speakers (Obsidian Cutlery).
2. **Anti-stored-twin** — invent must not rebuild from invent-demo speakers/luggage/atelier skeletons or prior project Acc.
3. **Fidelity Ready gate** — block Ready when layout/SKU/copy contradict the user brief.
4. **Understanding pipeline** — chat → ask contract → plan → build → Live evidence → heal to original ask.
5. **Conversation** — stay on topic; clarify; no random invent pivot.
6. **Settings / Tools homes** — Agents/Automations/Integrations: sensible defaults + “turn this on to use” indicators.
7. **Simple-prompt path** — live tests use plain briefs; system must still understand without adversarial wording.
8. **Craft when asked** — logo/heroes/SKU media still required when brief asks.

## Artifacts

- Matrix: \`scripts/data/nova-deep-rescan.jsonl\`
- Progress: \`scripts/data/infinite-research-progress.json\`
- Themes: \`scripts/data/next-deep-research-themes.md\`
- Slim canvas: synced via \`_sync-deep-rescan-canvas.mjs\`

**Do not implement until user says go.**
`;
fs.writeFileSync(summaryPath, summary);
console.log(`\n########## RESEARCH LOOP STOPPED ##########`);
console.log({ rows, waves: progress.waves.length, reason: progress.stoppedReason, summaryPath });
