/**
 * Sync nova-deep-rescan.canvas.tsx from honest capability catalog.
 * - Open FAILs shown when any exist
 * - When open=0, table = THIS WAVE's newly discovered stems (honest-last-discover.json)
 *   so the list visibly changes every research wave (not a frozen alphabetical slice)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadCatalogMap,
  catalogStats,
  LAST_DISCOVER_PATH,
} from './lib/honestCatalog.mjs';

const SAMPLE_N = 120;
const root = path.dirname(fileURLToPath(import.meta.url));
const canvasPath =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-deep-rescan.canvas.tsx';

const map = loadCatalogMap();
const rows = [...map.values()];
const stats = catalogStats(rows);

const RANK = { worst: 0, weak: 1, partial: 2, ungraded: 3, strong: 4 };
const openRows = rows
  .filter((r) => r.grade !== 'strong')
  .sort((a, b) => {
    const fa = a.family === 'prompt-fidelity' ? 0 : 1;
    const fb = b.family === 'prompt-fidelity' ? 0 : 1;
    if (fa !== fb) return fa - fb;
    const d = (RANK[a.grade] ?? 9) - (RANK[b.grade] ?? 9);
    if (d !== 0) return d;
    return String(a.stem).localeCompare(String(b.stem));
  });

/** Prefer exact stems added in the last discover wave (order preserved). */
let lastDiscover = null;
if (fs.existsSync(LAST_DISCOVER_PATH)) {
  try {
    lastDiscover = JSON.parse(fs.readFileSync(LAST_DISCOVER_PATH, 'utf8'));
  } catch {
    lastDiscover = null;
  }
}

function hydrateFromLastDiscover(sample) {
  return sample.map((s) => {
    const live = map.get(String(s.stem || '').toLowerCase());
    return {
      stem: s.stem,
      lane: live?.lane || s.lane || 'coding',
      grade: live?.grade || s.grade || 'ungraded',
      peerNote: live?.peerNote || s.peerNote || '',
      howTheyDoIt: live?.howTheyDoIt || s.howTheyDoIt || '',
      family: live?.family || s.family || '',
      testIds: live?.testIds || [],
      lastFail: live?.lastFail || null,
    };
  });
}

/** Fallback: newest by discoveredAt, PeerR before CoverageR, numeric # order. */
function recentFallback() {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.discoveredAt || a.evidenceAt || 0) || 0;
    const tb = Date.parse(b.discoveredAt || b.evidenceAt || 0) || 0;
    if (tb !== ta) return tb - ta;
    const wa = Number((/^(?:PeerR|CoverageR)(\d+)/i.exec(a.stem) || [])[1] || 0);
    const wb = Number((/^(?:PeerR|CoverageR)(\d+)/i.exec(b.stem) || [])[1] || 0);
    if (wb !== wa) return wb - wa;
    const pa = a.stem.startsWith('PeerR') ? 0 : 1;
    const pb = b.stem.startsWith('PeerR') ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const na = Number((/#(\d+)/.exec(a.stem) || /\s(\d+)\s/.exec(a.stem) || [])[1] || 0);
    const nb = Number((/#(\d+)/.exec(b.stem) || /\s(\d+)\s/.exec(b.stem) || [])[1] || 0);
    if (na !== nb) return na - nb;
    return String(a.stem).localeCompare(String(b.stem));
  });
}

const showingOpen = openRows.length > 0;
let sample;
let sampleMode;
// Always prefer THIS wave's discoveries so the table visibly churns every research wave.
// (Open FAIL counts still show in the stats / callout.)
if (lastDiscover?.sample?.length) {
  sample = hydrateFromLastDiscover(lastDiscover.sample).slice(0, SAMPLE_N);
  sampleMode = showingOpen
    ? `wave-${lastDiscover.wave}-new+open`
    : `wave-${lastDiscover.wave}-new`;
} else if (showingOpen) {
  sample = openRows.slice(0, SAMPLE_N);
  sampleMode = 'open-fails';
} else {
  sample = recentFallback().slice(0, SAMPLE_N);
  sampleMode = 'recent-strong';
}

const by = stats.by;
const open = stats.open;
const total = stats.total;
const fidelityOpen = stats.byFamily['prompt-fidelity']?.open || 0;
const fam = stats.byFamily || {};
const lastWave = lastDiscover?.wave ?? null;
const lastAdded = lastDiscover?.added ?? 0;
const lastTheme = (() => {
  const stem = lastDiscover?.sample?.[0]?.stem || '';
  const m = /^(?:PeerR|CoverageR)\d+\s+(\S+)/i.exec(stem);
  return m ? m[1] : '';
})();

function esc(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ');
}

const sampleLit = sample
  .map(
    (r) => `  {
    capability: '${esc(r.stem)}',
    lane: '${esc(r.lane || 'coding')}',
    nova: '${r.grade === 'ungraded' ? 'partial' : r.grade}',
    leader: '${esc(r.peerNote || r.family)}',
    howTheyDoIt: '${esc(r.howTheyDoIt || r.family)}',
    novaNow: '${esc(
      r.grade === 'strong'
        ? `Strong · ${r.family} · ${(r.testIds || []).join(',') || 'tests'}`
        : (r.lastFail || (r.testIds?.length ? `tests: ${r.testIds.join(',')}` : 'research-only')),
    )}',
  }`,
  )
  .join(',\n');

const pf = fam['prompt-fidelity'] || { total: 0, strong: 0, open: 0 };
const calloutTone = open > 0 ? 'warning' : 'info';
const calloutTitle = open > 0
  ? 'Honest catalog · open FAILs need real src/ implement'
  : `Living research · wave ${lastWave ?? '—'} added ${lastAdded.toLocaleString()} new stems`;
const calloutBody = open > 0
  ? `Open = ${open} failing/ungraded. Table = real open FAILs. Strong = evidence tests passed (not JSONL flip).`
  : `Worst/Weak/Partial stay 0 until a family evidence test FAILS — rising Stems+Strong means research found more peer gaps that still pass today's tests. Table below = NEW stems from wave ${lastWave ?? 'latest'}${lastTheme ? ` (${lastTheme})` : ''} so you can see the list change each wave.`;

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
 * HONEST deep rescan — catalog grades from evidence tests.
 * Catalog: Nova/scripts/data/nova-capability-catalog.jsonl
 */

type Grade = 'worst' | 'weak' | 'partial' | 'strong';

const GRADE_LABEL: Record<Grade, string> = {
  worst: 'Worst / missing',
  weak: 'Weak',
  partial: 'Partial / ungraded',
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
  lane: string;
  nova: Grade;
  leader: string;
  howTheyDoIt: string;
  novaNow: string;
};

const TOTAL = ${total};
const WORST = ${by.worst || 0};
const WEAK = ${by.weak || 0};
const PARTIAL = ${(by.partial || 0) + (by.ungraded || 0)};
const STRONG = ${by.strong || 0};
const OPEN = ${open};
const FIDELITY_OPEN = ${fidelityOpen};
const FIDELITY_STRONG = ${pf.strong || 0};
const FAM_FID = ${fam['prompt-fidelity']?.total || 0};
const FAM_CONVO = ${fam.conversation?.total || 0};
const FAM_AGENT = ${fam['coding-agent']?.total || 0};
const FAM_UI = ${fam['protocol-ui']?.total || 0};
const FAM_CRAFT = ${fam['craft-media']?.total || 0};
const LAST_WAVE = ${lastWave == null ? 'null' : Number(lastWave)};
const LAST_ADDED = ${Number(lastAdded) || 0};
const LAST_THEME = '${esc(lastTheme)}';
const SHOWING_OPEN = ${showingOpen ? 'true' : 'false'};
const SAMPLE_N = ${sample.length};

const SAMPLE: Row[] = [
${sampleLit}
];

export default function NovaDeepRescan() {
  return (
    <Stack gap={24} style={{ padding: 20, maxWidth: 1200 }}>
      <Stack gap={8}>
        <H1>HONEST · Capability catalog (tests → Strong)</H1>
        <Text tone="secondary" size="small">
          Strong = family evidence tests passed (not JSONL flipped).
          {SHOWING_OPEN
            ? ' Table = open FAILs (worst first).'
            : ' No open FAILs — table = NEW stems from the latest research wave.'}
        </Text>
      </Stack>

      <Callout tone="${calloutTone}" title="${calloutTitle}">
        ${calloutBody}
      </Callout>

      <Grid columns={5} gap={12}>
        <Stat value={String(TOTAL)} label="Stems (catalog)" tone="info" />
        <Stat value={String(WORST)} label="Worst" tone="danger" />
        <Stat value={String(WEAK)} label="Weak" tone="warning" />
        <Stat value={String(PARTIAL)} label="Partial/ungraded" tone="info" />
        <Stat value={String(STRONG)} label="Strong (tests)" tone="success" />
      </Grid>

      <Grid columns={3} gap={12}>
        <Stat value={LAST_WAVE == null ? '—' : String(LAST_WAVE)} label="Last research wave" tone="info" />
        <Stat value={String(LAST_ADDED)} label="New stems this wave" tone="success" />
        <Stat value={LAST_THEME || '—'} label="Wave theme" tone="info" />
      </Grid>

      <Grid columns={3} gap={12}>
        <Stat value={String(OPEN)} label="Still open" tone={OPEN > 0 ? 'danger' : 'success'} />
        <Stat value={String(FIDELITY_OPEN)} label="prompt-fidelity open" tone={FIDELITY_OPEN > 0 ? 'danger' : 'success'} />
        <Stat value={String(FIDELITY_STRONG)} label="prompt-fidelity Strong" tone="success" />
      </Grid>

      <Grid columns={5} gap={12}>
        <Stat value={String(FAM_FID)} label="Family · fidelity" tone="info" />
        <Stat value={String(FAM_CONVO)} label="Family · conversation" tone="info" />
        <Stat value={String(FAM_AGENT)} label="Family · coding-agent" tone="info" />
        <Stat value={String(FAM_UI)} label="Family · protocol-ui" tone="info" />
        <Stat value={String(FAM_CRAFT)} label="Family · craft" tone="info" />
      </Grid>

      <Divider />

      <H2>
        {SHOWING_OPEN
          ? 'Open sample · real FAILs'
          : \`Wave \${LAST_WAVE ?? '—'} · NEW researched stems\${LAST_THEME ? \` · \${LAST_THEME}\` : ''}\`}
      </H2>
      <Text tone="secondary" size="small">
        Showing {SAMPLE_N} of {SHOWING_OPEN ? OPEN.toLocaleString() + ' open' : (LAST_ADDED || TOTAL).toLocaleString() + ' new this wave'} ·
        Worst/Weak/Partial only move when evidence tests fail.
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

      <Pill tone={OPEN > 0 ? 'warning' : 'info'}>
        {OPEN > 0
          ? \`Honest open \${OPEN} · implement next FAIL then re-grade\`
          : \`Wave \${LAST_WAVE ?? '—'} · +\${LAST_ADDED.toLocaleString()} new · catalog \${TOTAL.toLocaleString()} Strong\`}
      </Pill>
    </Stack>
  );
}
`;

fs.mkdirSync(path.dirname(canvasPath), { recursive: true });
fs.writeFileSync(canvasPath, src);
console.log({
  canvasBytes: fs.statSync(canvasPath).size,
  total,
  open,
  strong: by.strong || 0,
  sample: sample.length,
  sampleMode,
  lastWave,
  lastAdded,
  lastTheme,
  path: canvasPath,
  source: 'honest-catalog',
});
