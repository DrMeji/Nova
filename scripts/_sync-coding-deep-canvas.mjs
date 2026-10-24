/**
 * Coding-deep canvas — open coding FAILs + uniqueness status + missing UI count.
 * PC-safe: does NOT load the full 500MB+ catalog into one string/array.
 */
import fs from 'fs';
import {
  catalogStats,
  LAST_DISCOVER_PATH,
  CODING_MISSING_PATH,
  GRADE_REPORT_PATH,
  CATALOG_META_PATH,
  CATALOG_PATH,
} from './lib/honestCatalog.mjs';

const SAMPLE_N = Math.max(120, Number(process.env.CANVAS_SAMPLE_N || 500));
const canvasPath =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-coding-deep.canvas.tsx';

const stats = catalogStats();
let metaTotal = stats.total;
if (fs.existsSync(CATALOG_META_PATH)) {
  try {
    const m = JSON.parse(fs.readFileSync(CATALOG_META_PATH, 'utf8'));
    if (m.total) metaTotal = Math.max(metaTotal, Number(m.total) || 0);
  } catch { /* */ }
}

let lastDiscover = null;
if (fs.existsSync(LAST_DISCOVER_PATH)) {
  try { lastDiscover = JSON.parse(fs.readFileSync(LAST_DISCOVER_PATH, 'utf8')); } catch { /* */ }
}
let missingCount = 0;
if (fs.existsSync(CODING_MISSING_PATH)) {
  try { missingCount = (JSON.parse(fs.readFileSync(CODING_MISSING_PATH, 'utf8')).items || []).length; } catch { /* */ }
}
let verdict = '';
if (fs.existsSync(GRADE_REPORT_PATH)) {
  try { verdict = JSON.parse(fs.readFileSync(GRADE_REPORT_PATH, 'utf8')).verdict || ''; } catch { /* */ }
}

// Stream only until we have SAMPLE_N open rows (or sample from lastDiscover).
const openRows = [];
if (fs.existsSync(CATALOG_PATH) && stats.open > 0) {
  const fd = fs.openSync(CATALOG_PATH, 'r');
  const buf = Buffer.alloc(1024 * 1024);
  let leftover = '';
  try {
    for (;;) {
      if (openRows.length >= SAMPLE_N) break;
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n <= 0) break;
      leftover += buf.toString('utf8', 0, n);
      let idx;
      while ((idx = leftover.indexOf('\n')) >= 0) {
        const line = leftover.slice(0, idx);
        leftover = leftover.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          const r = JSON.parse(line);
          if (r.grade && r.grade !== 'strong') {
            openRows.push(r);
            if (openRows.length >= SAMPLE_N) break;
          }
        } catch { /* */ }
      }
    }
  } finally {
    fs.closeSync(fd);
  }
}

const discoverMapped = lastDiscover?.sample || [];
const sampleSrc = openRows.length ? openRows : discoverMapped;
const sample = sampleSrc.slice(0, SAMPLE_N);

function esc(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
}

const sampleLit = sample
  .map(
    (r) => `  {
    capability: '${esc(r.stem)}',
    lane: '${esc(r.lane || 'coding')}',
    nova: '${r.grade === 'ungraded' ? 'partial' : (r.grade || 'partial')}',
    leader: '${esc(r.peerNote || r.family || '')}',
    howTheyDoIt: '${esc(r.howTheyDoIt || r.family || '')}',
    novaNow: '${esc(r.lastFail || r.family || '')}',
  }`,
  )
  .join(',\n');

const by = stats.by;
const TOTAL = metaTotal || stats.total;
const OPEN = stats.open;
const src = `import { Callout, Divider, Grid, H1, H2, Stack, Stat, Table, Text, Pill } from 'cursor/canvas';

type Grade = 'worst' | 'weak' | 'partial' | 'strong';
const GRADE_LABEL: Record<Grade, string> = {
  worst: 'Worst / missing', weak: 'Weak', partial: 'Partial / ungraded', strong: 'Strong',
};
const GRADE_TONE: Record<Grade, 'danger' | 'warning' | 'info' | 'success'> = {
  worst: 'danger', weak: 'warning', partial: 'info', strong: 'success',
};

const TOTAL = ${TOTAL};
const OPEN = ${OPEN};
const STRONG = ${by.strong || 0};
const WEAK = ${(by.weak || 0) + (by.worst || 0)};
const PARTIAL = ${(by.partial || 0) + (by.ungraded || 0)};
const MISSING_UI = ${missingCount};
const SAMPLE_N = ${sample.length};
const VERDICT = '${esc(verdict)}';

const ROWS = [
${sampleLit}
];

export default function CodingDeepCanvas() {
  return (
    <Stack gap={16}>
      <H1>Nova coding-deep</H1>
      <Text>
        {OPEN > 0
          ? \`Open=\${OPEN}. Catalog TOTAL=\${TOTAL.toLocaleString()} stems. Table below shows \${SAMPLE_N} rows (sample), not the full catalog. Missing UI staged=\${MISSING_UI}.\`
          : \`Catalog TOTAL=\${TOTAL.toLocaleString()} coding stems Strong. Table = latest \${SAMPLE_N} researched rows (sample only). Missing UI archive=\${MISSING_UI}.\`}
      </Text>
      <Grid columns={4} gap={12}>
        <Stat value={String(TOTAL)} label="Coding stems (full catalog)" tone="info" />
        <Stat value={String(STRONG)} label="Strong" tone="success" />
        <Stat value={String(OPEN)} label="Open / not Strong" tone={OPEN ? 'danger' : 'success'} />
        <Stat value={String(SAMPLE_N)} label="Rows in table (sample)" tone="info" />
      </Grid>
      <Grid columns={3} gap={12}>
        <Stat value={String(WEAK)} label="Weak / worst" tone={WEAK ? 'warning' : 'info'} />
        <Stat value={String(PARTIAL)} label="Partial / ungraded" tone="info" />
        <Stat value={String(MISSING_UI)} label="Missing UI archive" tone="info" />
      </Grid>
      {VERDICT ? <Callout tone={OPEN ? 'warning' : 'success'} title="Grade">{VERDICT}</Callout> : null}
      <Divider />
      <H2>{OPEN > 0 ? \`Open coding FAILs (showing \${SAMPLE_N} of \${OPEN})\` : \`Latest coding research (showing \${SAMPLE_N} of \${TOTAL.toLocaleString()} catalog)\`}</H2>
      <Table
        headers={['Capability', 'Lane', 'Nova', 'Peer / leader', 'How they do it', 'Nova now']}
        rows={ROWS.map((r) => [
          r.capability,
          r.lane,
          <Pill key={r.capability} tone={GRADE_TONE[(r.nova as Grade)] || 'info'}>{GRADE_LABEL[(r.nova as Grade)] || r.nova}</Pill>,
          r.leader,
          r.howTheyDoIt,
          r.novaNow,
        ])}
      />
      <Text tone="secondary">
        Coding-deep · full catalog {TOTAL.toLocaleString()} · table sample {SAMPLE_N} · missing UI {MISSING_UI}
      </Text>
    </Stack>
  );
}
`;

fs.writeFileSync(canvasPath, src);
console.log(JSON.stringify({
  canvasPath,
  total: TOTAL,
  open: OPEN,
  sample: sample.length,
  missingCount,
}, null, 2));
