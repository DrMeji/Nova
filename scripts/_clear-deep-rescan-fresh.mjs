/**
 * Archive current matrix and start a fresh deep-rescan JSONL + slim canvas.
 * Research only — does not wipe invent Acc runtime code.
 *
 * HONEST CATALOG GUARD: never deletes scripts/data/nova-capability-catalog.jsonl
 * or clears passing Strong grades. Matrix JSONL is research scratch only.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(root, 'data', 'nova-deep-rescan.jsonl');
const catalogPath = path.join(root, 'data', 'nova-capability-catalog.jsonl');
const archiveDir = path.join(root, 'data', 'archives');
fs.mkdirSync(archiveDir, { recursive: true });

if (process.env.WIPE_HONEST_CATALOG === '1') {
  console.error('Refusing WIPE_HONEST_CATALOG via clear — delete catalog manually if you truly mean reset.');
  process.exit(2);
}
if (fs.existsSync(catalogPath)) {
  console.log({
    honestCatalogPreserved: catalogPath,
    bytes: fs.statSync(catalogPath).size,
    note: 'CLEAR only resets research JSONL — Strong catalog grades stay.',
  });
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
if (fs.existsSync(dataPath)) {
  const dest = path.join(archiveDir, `nova-deep-rescan-${stamp}.jsonl`);
  // Prefer rename; copy+truncate if cross-device.
  try {
    fs.renameSync(dataPath, dest);
  } catch {
    fs.copyFileSync(dataPath, dest);
    fs.writeFileSync(dataPath, '');
  }
  console.log({ archived: dest, bytes: fs.statSync(dest).size });
}

fs.writeFileSync(dataPath, '');
fs.writeFileSync(
  path.join(root, 'data', 'infinite-research-progress.json'),
  `${JSON.stringify({
    resetAt: new Date().toISOString(),
    note: 'Fresh deep-rescan wave — prior matrix archived. Research only until implement go-ahead.',
    waves: [],
    rows: 0,
  }, null, 2)}\n`,
);

// Seed empty canvas via sync (0 rows → write minimal viewer)
const sync = spawnSync(process.execPath, [path.join(root, '_sync-deep-rescan-canvas.mjs')], {
  cwd: path.join(root, '..'),
  stdio: 'inherit',
});
if (sync.status !== 0) {
  // Sync may fail on empty — write a minimal fresh canvas.
  const canvasPath =
    'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-deep-rescan.canvas.tsx';
  fs.writeFileSync(
    canvasPath,
    `import { Callout, Grid, H1, Stack, Stat, Text, Pill } from 'cursor/canvas';

export default function NovaDeepRescan() {
  return (
    <Stack gap={24} style={{ padding: 20, maxWidth: 1200 }}>
      <H1>LIVING · Deep rescan (fresh wave)</H1>
      <Text tone="secondary" size="small">
        Prior matrix archived. New research wave starting — counts are fresh, not stacked.
      </Text>
      <Callout tone="info" title="Fresh research wave">
        Open = 0 · Capabilities = 0. Growing fidelity / understanding / anti-twin / conversation / settings UX.
        Research only — implement when you say go.
      </Callout>
      <Grid columns={5} gap={12}>
        <Stat value="0" label="Capabilities" tone="info" />
        <Stat value="0" label="Worst" tone="danger" />
        <Stat value="0" label="Weak" tone="warning" />
        <Stat value="0" label="Partial" tone="info" />
        <Stat value="0" label="Strong" tone="success" />
      </Grid>
      <Pill tone="warning">Fresh wave · research open · WAIT implement</Pill>
    </Stack>
  );
}
`,
  );
  console.log({ canvasReset: canvasPath });
} else {
  console.log({ canvasSynced: true });
}
