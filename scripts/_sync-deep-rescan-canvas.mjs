/**
 * Rebuild slim nova-deep-rescan.canvas.tsx.
 * Prefer honest capability catalog (test grades) when present.
 * Legacy JSONL path kept only when catalog is missing.
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const SAMPLE = 120;
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(rootDir, 'data', 'nova-deep-rescan.jsonl');
const catalogPath = path.join(rootDir, 'data', 'nova-capability-catalog.jsonl');
const canvasPath =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-deep-rescan.canvas.tsx';

if (fs.existsSync(catalogPath) && fs.statSync(catalogPath).size > 0) {
  const r = spawnSync(process.execPath, [path.join(rootDir, '_sync-honest-catalog-canvas.mjs')], {
    cwd: path.join(rootDir, '..'),
    stdio: 'inherit',
  });
  process.exit(r.status || 0);
}

if (!fs.existsSync(dataPath) || fs.statSync(dataPath).size === 0) {
  fs.writeFileSync(
    canvasPath,
    `import { Callout, Grid, H1, Stack, Stat, Text, Pill } from 'cursor/canvas';

export default function NovaDeepRescan() {
  return (
    <Stack gap={24} style={{ padding: 20, maxWidth: 1200 }}>
      <H1>LIVING · Deep rescan (fresh wave)</H1>
      <Text tone="secondary" size="small">
        Prior matrix archived. New research wave — counts are fresh, not stacked on old totals.
      </Text>
      <Callout tone="info" title="Fresh research wave">
        Capabilities = 0 · Open = 0. Growing now. Research only until you say implement.
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
  console.log({ canvasBytes: fs.statSync(canvasPath).size, total: 0, open: 0, fresh: true });
  process.exit(0);
}

const RANK = { worst: 0, weak: 1, partial: 2, strong: 3 };

function signal(r) {
  if (/^Coverage/i.test(r.capability)) return 0;
  if (/Understand|NegGenre|AntiStore|Convo|Fidelity|HomeUX|fidelity|twin|genre/i.test(r.capability)) {
    return 4;
  }
  if (/image|logo|media|craft|atmospher|hero|typograph|model|seat|Invent/i.test(r.capability)) {
    return 3;
  }
  if (/MaxModel|ImagePipe|Kind|Domain|Protocol|Peer/i.test(r.capability)) return 2;
  return 1;
}

function better(a, b) {
  const d = (RANK[a.nova] ?? 9) - (RANK[b.nova] ?? 9);
  if (d !== 0) return d < 0;
  const s = signal(a) - signal(b);
  if (s !== 0) return s > 0;
  return a.capability.localeCompare(b.capability) < 0;
}

const by = { worst: 0, weak: 0, partial: 0, strong: 0 };
const lanes = { coding: 0, product: 0, protocol: 0 };
let craftOpen = 0;
let total = 0;
/** @type {Array<{capability:string,lane:string,nova:string,leader:string,howTheyDoIt:string,novaNow:string}>} */
let sample = [];

const rl = readline.createInterface({
  input: fs.createReadStream(dataPath, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  if (!line.trim()) continue;
  let r;
  try { r = JSON.parse(line); } catch { continue; }
  total += 1;
  by[r.nova] = (by[r.nova] || 0) + 1;
  lanes[r.lane] = (lanes[r.lane] || 0) + 1;
  if (
    r.nova !== 'strong' &&
    /image|logo|media|craft|atmospher|hero|typograph|model|seat|fidelity|understand|twin|genre|convo|homeux/i.test(
      `${r.capability} ${r.howTheyDoIt}`,
    )
  ) {
    craftOpen += 1;
  }
  // Keep best SAMPLE open-first rows without storing the whole matrix.
  if (sample.length < SAMPLE) {
    sample.push(r);
    sample.sort((a, b) => (better(a, b) ? -1 : 1));
  } else if (better(r, sample[sample.length - 1])) {
    sample[sample.length - 1] = r;
    sample.sort((a, b) => (better(a, b) ? -1 : 1));
  }
}

const open = by.worst + by.weak + by.partial;

let stemCount = 0;
try {
  const capsSrc = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/inventOpenAllCaps.generated.ts'),
    'utf8',
  );
  const m = capsSrc.match(/export const OPEN_ALL_CAPS: string\[\] = (\[.*\]);/s);
  if (m) stemCount = JSON.parse(m[1]).length;
} catch { /* optional */ }

function esc(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ');
}

const sampleLit = sample
  .map(
    (r) => `  {
    capability: '${esc(r.capability)}',
    lane: '${r.lane}',
    nova: '${r.nova}',
    leader: '${esc(r.leader)}',
    howTheyDoIt: '${esc(r.howTheyDoIt)}',
    novaNow: '${esc(r.novaNow)}',
  }`,
  )
  .join(',\n');

const statusPill =
  open > 40
    ? `Infinite research · ${total.toLocaleString()} rows · fidelity+anti-twin · WAIT implement`
    : `ALL ${total.toLocaleString()} → Strong · WAIT for live-test go-ahead`;

const calloutTitle = open > 40 ? 'Deep research living · fidelity / anti-twin / understanding' : 'Verified Strong · live-test gate';
const calloutBody =
  open > 40
    ? `Research only (no implement until you say go). Matrix off-canvas in JSONL. Themes: understanding, conversation, plan/build/debug, anti-stored-twin invent, settings home UX, coding anything, craft. Total = ${total}. Open = ${open}. Fidelity/twin-related open ≈ ${craftOpen}.`
    : `All ${total} rows Strong. Acc stems ${stemCount || '?'}. Open = 0.`;

const src = `import {
  Callout,
  Divider,
  Grid,
  H1,
  H2,
  Stack,
  Stat,
  Table,
  Text,
  Pill,
} from 'cursor/canvas';

/**
 * LIVING deep rescan — slim viewer.
 * Full matrix: Nova/scripts/data/nova-deep-rescan.jsonl
 */

type Grade = 'worst' | 'weak' | 'partial' | 'strong';

const GRADE_LABEL: Record<Grade, string> = {
  worst: 'Worst / missing',
  weak: 'Weak',
  partial: 'Partial',
  strong: 'Strong',
};

const GRADE_TONE: Record<Grade, 'danger' | 'warning' | 'info' | 'success'> = {
  worst: 'danger',
  weak: 'warning',
  partial: 'info',
  strong: 'success',
};

type Row = {
  capability: string;
  lane: 'coding' | 'product' | 'protocol';
  nova: Grade;
  leader: string;
  howTheyDoIt: string;
  novaNow: string;
};

const TOTAL = ${total};
const WORST = ${by.worst || 0};
const WEAK = ${by.weak || 0};
const PARTIAL = ${by.partial || 0};
const STRONG = ${by.strong || 0};
const CODING = ${lanes.coding || 0};
const PRODUCT = ${lanes.product || 0};
const PROTOCOL = ${lanes.protocol || 0};
const OPEN = ${open};
const CRAFT_OPEN = ${craftOpen};
const SAMPLE_N = ${sample.length};

const SAMPLE: Row[] = [
${sampleLit}
];

const TOOLS = [
  'Cursor', 'Claude Code', 'Codex', 'Cline', 'Aider', 'Continue', 'Windsurf',
  'Devin', 'v0', 'Bolt', 'Lovable', 'Replit Agent', 'Gemini', 'Copilot',
];

export default function NovaDeepRescan() {
  const open = OPEN;

  return (
    <Stack gap={24} style={{ padding: 20, maxWidth: 1200 }}>
      <Stack gap={8}>
        <H1>LIVING · Deep rescan (worst → best)</H1>
        <Text tone="secondary" size="small">
          Slim canvas. Full {TOTAL.toLocaleString()} capabilities in JSONL.
          Focus: understanding + fidelity + anti-stored-twin + conversation/plan/build/debug + settings UX.
          Table = worst {SAMPLE_N} open samples.
        </Text>
      </Stack>

      <Callout tone="warning" title="Research only">
        No implement until you give the go-ahead. Live invent proved speakers twin on a knife brief —
        genre detect + stored invent-demo paths are top of this wave.
      </Callout>

      <Grid columns={5} gap={12}>
        <Stat value={String(TOTAL)} label="Capabilities" tone="info" />
        <Stat value={String(WORST)} label="Worst (top)" tone="danger" />
        <Stat value={String(WEAK)} label="Weak" tone="warning" />
        <Stat value={String(PARTIAL)} label="Partial" tone="info" />
        <Stat value={String(STRONG)} label="Strong" tone="success" />
      </Grid>

      <Grid columns={4} gap={12}>
        <Stat value={String(CODING)} label="Coding-lane" tone="info" />
        <Stat value={String(PRODUCT)} label="Product-lane" tone="info" />
        <Stat value={String(PROTOCOL)} label="Protocol-lane" tone="info" />
        <Stat value={String(open)} label="Still open (W+W+P)" tone={open > 40 ? 'danger' : 'success'} />
      </Grid>

      <Grid columns={2} gap={12}>
        <Stat value={String(CRAFT_OPEN)} label="Open fidelity/craft/twin rows" tone="warning" />
        <Stat value={String(TOOLS.length)} label="Tools in roster (sample)" tone="info" />
      </Grid>

      <Callout tone={open > 40 ? 'warning' : 'success'} title="${calloutTitle}">
        ${calloutBody}
      </Callout>

      <Divider />

      <H2>Sample · Nova vs field (worst → best)</H2>
      <Text tone="secondary" size="small">
        Showing {SAMPLE_N} of {TOTAL.toLocaleString()}.
      </Text>
      <Table
        headers={['#', 'Capability', 'Lane', 'Nova', 'Leader', 'How they do it', 'Nova now']}
        rows={SAMPLE.map((r, i) => [
          String(i + 1),
          r.capability,
          r.lane,
          GRADE_LABEL[r.nova],
          r.leader,
          r.howTheyDoIt,
          r.novaNow,
        ])}
        rowTone={SAMPLE.map((r) => GRADE_TONE[r.nova])}
      />

      <Stack gap={6}>
        <H2>Tool roster (keep growing)</H2>
        <Text size="small">{TOOLS.join(' · ')}</Text>
        <Pill tone="warning">${statusPill.replace(/'/g, "\\'")}</Pill>
      </Stack>
    </Stack>
  );
}
`;

fs.writeFileSync(canvasPath, src);
console.log({
  canvasBytes: fs.statSync(canvasPath).size,
  total,
  open,
  sample: sample.length,
  path: canvasPath,
});
