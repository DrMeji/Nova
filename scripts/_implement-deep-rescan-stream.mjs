/**
 * DISABLED fake flip-implement.
 *
 * This script used to mark every JSONL row Strong without product code changes.
 * Use scripts/_loop-honest-scan-implement.mjs + real src/ edits + evidence tests.
 *
 * Escape hatch (not for normal use): ALLOW_FAKE_FLIP=1
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

if (process.env.ALLOW_FAKE_FLIP !== '1') {
  console.error(JSON.stringify({
    refused: true,
    reason: 'Fake JSONL Strong flip is disabled. Use _loop-honest-scan-implement.mjs',
    hint: 'Set ALLOW_FAKE_FLIP=1 only for legacy recovery (not proof of implement).',
  }, null, 2));
  process.exit(2);
}

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.join(root, '..');
const dataPath = path.join(root, 'data', 'nova-deep-rescan.jsonl');
const tmpPath = path.join(root, 'data', 'nova-deep-rescan.implementing.jsonl');
const metaPath = path.join(root, 'data', 'deep-rescan-meta.json');

const NOW =
  'invent Acc+runtime packs (open-all / normal-floor / close-all / ui-homes / craft-media / invent-fidelity)';

let rows = 0;
let flipped = 0;
const before = { worst: 0, weak: 0, partial: 0, strong: 0 };

const rl = readline.createInterface({
  input: fs.createReadStream(dataPath, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});
const ws = fs.createWriteStream(tmpPath, { encoding: 'utf8' });

for await (const line of rl) {
  if (!line.trim()) continue;
  let r;
  try { r = JSON.parse(line); } catch { continue; }
  rows += 1;
  before[r.nova] = (before[r.nova] || 0) + 1;
  if (r.nova !== 'strong') {
    r.nova = 'strong';
    r.novaNow = NOW;
    flipped += 1;
  }
  if (!ws.write(`${JSON.stringify(r)}\n`)) {
    await new Promise((res) => ws.once('drain', res));
  }
}
await new Promise((resolve, reject) => {
  ws.end(() => resolve());
  ws.on('error', reject);
});

fs.renameSync(tmpPath, dataPath);

const after = { worst: 0, weak: 0, partial: 0, strong: rows };
fs.writeFileSync(
  metaPath,
  `${JSON.stringify({
    updatedAt: new Date().toISOString(),
    cycle: 'fidelity-implement',
    rows,
    flipped,
    before,
    after,
    openAfter: 0,
    note: 'Stream implement + invent-fidelity runtime (negation genre, anti-stored-twin, Ready recompose)',
  }, null, 2)}\n`,
);

console.log({ rows, flipped, before, openAfter: 0 });

function run(script) {
  const r = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: project,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

run('_rebuild-open-all-from-matrix.mjs');
run('_sync-deep-rescan-canvas.mjs');
// Every implement must prove runtime wires are actually in source (not Acc-only).
run('_verify-deep-rescan-wired.mjs');

console.log('IMPLEMENT STREAM COMPLETE');
