/**
 * Build a fresh React SPA from the user's brief — product UI, not a meta checklist.
 * Used when create would otherwise leave an empty <div className="app" /> shell.
 */

export function isEmptyReactAppShell(appSource: string | undefined | null): boolean {
  const s = String(appSource || '');
  if (!s.trim()) return true;
  if (/return\s*\(\s*<div\s+className=["']app["']\s*\/>\s*\)/i.test(s)) return true;
  if (/return\s*\(\s*<div\s+className=["']app["']\s*>\s*<\/div>\s*\)/i.test(s)) return true;
  const withoutImports = s.replace(/^[\s\S]*?export\s+default\s+function\s+App\s*\(/i, '');
  const tags = withoutImports.match(/<[A-Za-z][\w.-]*/g) || [];
  return tags.length <= 1;
}

/** True when App.jsx is the old meta "What you asked for" checklist shell. */
export function isChecklistMetaSpa(appSource: string | undefined | null): boolean {
  const s = String(appSource || '');
  return /What you asked for/i.test(s) && /Quick note/i.test(s) && /FEATURES\s*=/.test(s);
}

/** Drop injected skill playbooks so they never become UI copy. */
export function stripSkillNoise(summary: string): string {
  return String(summary || '')
    .replace(/\n*##\s*ARK design skills[\s\S]*/i, '')
    .replace(/\n*ARK design skills\s*\(follow these\)[\s\S]*/i, '')
    .replace(/\n*Infer a distinct design language[\s\S]*/i, '')
    .trim();
}

function escapeJsx(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractSubtitle(summary: string, fallback: string): string {
  const clean = stripSkillNoise(summary);
  const quoted = clean.match(/["“]([^"”]{3,48})["”]/);
  if (quoted) return quoted[1].trim();
  const studio = clean.match(/\bstudio\s+name\s+["']?([^"',.\n]{3,48})/i);
  if (studio) return studio[1].trim();
  return fallback;
}

function themeFromBrief(summary: string): { bg: string; accent: string; card: string; text: string } {
  const t = String(summary || '').toLowerCase();
  if (/\b(copper|charcoal|workshop|loom|textile|weave|yarn|warp|pick)\b/.test(t)) {
    return { bg: '#12100e', accent: '#d97757', card: '#1c1814', text: '#f3ebe3' };
  }
  if (/\b(ocean|reef|aqua|teal|navy|marine|coral|aquarium|salinity)\b/.test(t)) {
    return { bg: '#071a1f', accent: '#2dd4bf', card: '#0f2f36', text: '#e8f4f2' };
  }
  if (/\b(forest|garden|plant|botanic|green|trail|hiking|elevation)\b/.test(t)) {
    return { bg: '#0b1410', accent: '#86efac', card: '#14241a', text: '#ecfdf3' };
  }
  if (/\b(sunset|warm|amber|orange)\b/.test(t)) {
    return { bg: '#140e0a', accent: '#fb923c', card: '#241810', text: '#fff7ed' };
  }
  if (/\b(night|dark|space|indigo|violet)\b/.test(t)) {
    return { bg: '#0a0b14', accent: '#a78bfa', card: '#15162a', text: '#eef0ff' };
  }
  return { bg: '#0c1118', accent: '#38bdf8', card: '#151c27', text: '#e8eef8' };
}

function looksLikeReefLogger(summary: string): boolean {
  const t = stripSkillNoise(summary).toLowerCase();
  return /\b(reef|aquarium|tank)\b/.test(t)
    && /\b(salinity|alk(?:alinity)?|calcium|dosing|parameter|temp(?:erature)?)\b/.test(t);
}

function looksLikeTrailJournal(summary: string): boolean {
  const t = stripSkillNoise(summary).toLowerCase();
  return /\b(trail|hiking|hike|backpack|waypoint)\b/.test(t)
    && /\b(elevation|sparkline|gear|checklist|journal)\b/.test(t);
}

function looksLikeOpsDashboard(summary: string): boolean {
  const t = stripSkillNoise(summary).toLowerCase();
  const signals = [
    /\bdashboard\b/,
    /\b(floor\s+)?grid\b/,
    /\butilization\b/,
    /\bmaintenance\b/,
    /\binventory\b/,
    /\b(loom|berth|slip|kiln|station|bay|warp|pick\s*count|yarn)\b/,
    /\bstatus\b.*\b(running|idle|maintenance)\b/,
    /\bpattern\s+library\b/,
    /\bwork\s+orders?\b/,
  ];
  return signals.filter(r => r.test(t)).length >= 2;
}

/**
 * Deterministic but brief-driven SPA so Preview is a real product UI — never a prompt checklist.
 */
export function buildFreshSpaFromBrief(name: string, summary: string): { appJsx: string; appCss: string; indexCss: string } {
  const title = cleanProductTitle(name);
  const cleanSummary = stripSkillNoise(summary);
  if (looksLikeReefLogger(cleanSummary)) return buildReefLoggerSpa(title, cleanSummary);
  if (looksLikeTrailJournal(cleanSummary)) return buildTrailJournalSpa(title, cleanSummary);
  if (looksLikeOpsDashboard(cleanSummary)) return buildOpsDashboardSpa(title, cleanSummary);
  return buildProductWorkspaceSpa(title, cleanSummary);
}

/** Prefer a short product name for the UI header (not the whole create sentence). */
export function cleanProductTitle(name: string): string {
  let s = String(name || '').trim();
  if (!s) return 'New App';
  // Prefer an explicit product name inside a long prompt.
  const called = s.match(/\b(?:called|named|name\s+it|call\s+it)\s+["“']?([A-Z][A-Za-z0-9][A-Za-z0-9 _-]{0,40})/i);
  if (called?.[1]) s = called[1].trim();
  const createProject = s.match(/\bcreate\s+(?:the\s+)?(?:project\s+)?["“']?([A-Z][A-Za-z0-9][A-Za-z0-9 _-]{1,40})(?:["”']|\s+on\s+disk|\s+project|\s*$)/i);
  if (createProject?.[1] && !/^(the|a|an|new|this)$/i.test(createProject[1])) {
    s = createProject[1].trim();
  }
  // "ReefLog and build a reef…" → ReefLog
  s = s.replace(/\s+(?:and|with|that|which|where|when|so|for|but|featuring|including|—|–|-)\b.*$/i, '').trim();
  s = s.replace(/\s+(?:app|application|project|product|platform|website|site)\b.*$/i, '').trim();
  // Reject sentence-like titles ("Bigger pass", "Make Harbor feel…", "Add a Create Channel…").
  if (
    /^(add|make|fix|update|bigger|please|help|create\s+the|scaffold|build\s+me)\b/i.test(s)
    || s.split(/\s+/).length > 4
    || /[,:!?]/.test(s)
  ) {
    const token = s.split(/\s+/).find(w => /^[A-Z][a-zA-Z0-9_-]{2,32}$/.test(w) && !/^(Add|Make|Fix|Update|Bigger|Please|Create|Build|Help)$/.test(w));
    if (token) return token;
  }
  if (s.length >= 2 && s.length <= 48) return s;
  const first = String(name || '').trim().split(/\s+/).find(w => /^[A-Za-z][A-Za-z0-9_-]{1,40}$/.test(w));
  return first && first.length >= 2 ? first : 'New App';
}

function shellCss(theme: { bg: string; accent: string; card: string; text: string }): string {
  return `:root {
  --bg: ${theme.bg};
  --card: ${theme.card};
  --accent: ${theme.accent};
  --text: ${theme.text};
}
.app {
  min-height: 100vh;
  background: radial-gradient(900px 480px at 10% -10%, color-mix(in srgb, var(--accent) 22%, transparent), var(--bg));
  color: var(--text);
  padding: 1.25rem 1.5rem 2rem;
  font-family: "Segoe UI", system-ui, sans-serif;
}
.top {
  display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1.1rem;
}
.brand { display: flex; gap: 0.85rem; align-items: center; }
.mark {
  width: 2.5rem; height: 2.5rem; border-radius: 0.75rem; display: grid; place-items: center;
  background: color-mix(in srgb, var(--accent) 18%, #000); color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); font-weight: 700; font-size: 0.95rem;
}
h1 { margin: 0; font-size: 1.35rem; letter-spacing: -0.02em; }
.sub { margin: 0.15rem 0 0; opacity: 0.7; font-size: 0.8rem; }
.badge {
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent); border-radius: 999px; padding: 0.35rem 0.75rem; font-size: 0.75rem; font-weight: 600;
}
.cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
@media (max-width: 900px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.card {
  background: color-mix(in srgb, var(--card) 92%, #000);
  border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
  border-radius: 0.9rem; padding: 0.85rem 1rem;
}
.card-label { margin: 0; opacity: 0.7; font-size: 0.75rem; }
.card-value { margin: 0.25rem 0 0; font-size: 1.45rem; font-weight: 700; }
.card-unit { font-size: 0.85rem; opacity: 0.7; margin-left: 0.2rem; }
.panel {
  background: color-mix(in srgb, var(--card) 92%, #000);
  border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
  border-radius: 1rem; padding: 1rem 1.1rem 1.15rem;
}
.panel h2 { margin: 0 0 0.75rem; font-size: 0.95rem; }
.main-grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 1rem; }
@media (max-width: 860px) { .main-grid { grid-template-columns: 1fr; } }
.check { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
.check button {
  width: 100%; text-align: left; display: flex; gap: 0.55rem; align-items: center;
  background: color-mix(in srgb, var(--bg) 55%, transparent);
  border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
  color: inherit; border-radius: 0.7rem; padding: 0.65rem 0.75rem; cursor: pointer;
}
.check button.on { border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
.spark {
  height: 48px; display: flex; align-items: flex-end; gap: 3px; margin-top: 0.45rem;
}
.spark span {
  flex: 1; border-radius: 2px 2px 0 0;
  background: color-mix(in srgb, var(--accent) 70%, transparent); min-height: 4px;
}
.field {
  width: 100%; box-sizing: border-box; border-radius: 0.65rem;
  border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
  background: color-mix(in srgb, var(--bg) 70%, transparent); color: inherit;
  padding: 0.55rem 0.7rem; margin-bottom: 0.65rem;
}
.primary {
  display: inline-flex; align-items: center; gap: 0.35rem; border: 0; border-radius: 0.65rem;
  padding: 0.55rem 0.8rem; cursor: pointer; background: var(--accent); color: #041018; font-weight: 600;
}
`;
}

function buildReefLoggerSpa(title: string, summary: string): { appJsx: string; appCss: string; indexCss: string } {
  const theme = themeFromBrief(summary);
  const tank = escapeJsx(extractSubtitle(summary, `${title} · Main display`));
  const dosing = JSON.stringify(
    [
      { id: 'alk', label: 'Alkalinity buffer', dose: '12 ml' },
      { id: 'ca', label: 'Calcium additive', dose: '8 ml' },
      { id: 'mg', label: 'Magnesium', dose: '5 ml' },
      { id: 'trace', label: 'Trace elements', dose: '2 ml' },
    ],
    null,
    2,
  );
  const appJsx = `import { useEffect, useState } from 'react';
import './App.css';

const DOSE = ${dosing};
const KEY = ${JSON.stringify(`ark-reef:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)};

export default function App() {
  const [tankName, setTankName] = useState(${JSON.stringify(tank)});
  const [params] = useState({ temp: 78.2, salinity: 1.025, alk: 8.4, calcium: 420 });
  const [done, setDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* ignore */ }
  }, [done]);

  const checked = DOSE.filter(d => done[d.id]).length;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true">R</span>
          <div>
            <input className="field" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }} value={tankName} onChange={(e) => setTankName(e.target.value)} aria-label="Tank name" />
            <p className="sub">${escapeJsx(title)} · water parameters · local demo</p>
          </div>
        </div>
        <div className="badge">{checked}/{DOSE.length} dosed</div>
      </header>

      <section className="cards">
        <article className="card"><p className="card-label">Temp</p><p className="card-value">{params.temp}<span className="card-unit">°F</span></p></article>
        <article className="card"><p className="card-label">Salinity</p><p className="card-value">{params.salinity}</p></article>
        <article className="card"><p className="card-label">Alk</p><p className="card-value">{params.alk}<span className="card-unit">dKH</span></p></article>
        <article className="card"><p className="card-label">Calcium</p><p className="card-value">{params.calcium}<span className="card-unit">ppm</span></p></article>
      </section>

      <main className="main-grid">
        <section className="panel">
          <h2>Dosing checklist</h2>
          <ul className="check">
            {DOSE.map(d => (
              <li key={d.id}>
                <button type="button" className={done[d.id] ? 'on' : ''} onClick={() => setDone(x => ({ ...x, [d.id]: !x[d.id] }))}>
                  <span>{done[d.id] ? '✓' : '○'}</span>
                  <span style={{ flex: 1 }}>{d.label}</span>
                  <em style={{ opacity: 0.65 }}>{d.dose}</em>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2>Today</h2>
          <p className="sub" style={{ marginBottom: '0.75rem' }}>Log readings after lights-on. Demo data stays in this browser.</p>
          <button type="button" className="primary" onClick={() => setDone({})}>Reset checklist</button>
        </section>
      </main>
    </div>
  );
}
`;
  return {
    appJsx,
    appCss: shellCss(theme),
    indexCss: `body { margin: 0; background: ${theme.bg}; color: ${theme.text}; font-family: system-ui, sans-serif; }\n`,
  };
}

function buildTrailJournalSpa(title: string, summary: string): { appJsx: string; appCss: string; indexCss: string } {
  const theme = themeFromBrief(summary);
  const trail = escapeJsx(extractSubtitle(summary, 'Cascade Crest · Day hike'));
  const elev = JSON.stringify(
    [
      { id: 'gain', label: 'Elevation gain', value: '1,240', unit: 'ft', spark: [12, 18, 22, 30, 28, 40, 36, 48] },
      { id: 'peak', label: 'Peak elev.', value: '4,820', unit: 'ft', spark: [20, 24, 28, 35, 42, 50, 48, 55] },
      { id: 'miles', label: 'Distance', value: '7.4', unit: 'mi', spark: [8, 12, 18, 22, 30, 36, 44, 50] },
      { id: 'time', label: 'Moving time', value: '3:42', unit: '', spark: [10, 14, 16, 20, 24, 28, 32, 38] },
    ],
    null,
    2,
  );
  const gear = JSON.stringify(
    [
      { id: 'pack', label: 'Daypack + rain shell' },
      { id: 'water', label: '2L water + filter' },
      { id: 'nav', label: 'Map / offline GPS' },
      { id: 'food', label: 'Snacks + lunch' },
      { id: 'first', label: 'First-aid kit' },
      { id: 'light', label: 'Headlamp' },
    ],
    null,
    2,
  );
  const appJsx = `import { useEffect, useState } from 'react';
import './App.css';

const ELEV = ${elev};
const GEAR = ${gear};
const KEY = ${JSON.stringify(`ark-trail:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)};

export default function App() {
  const [trailName, setTrailName] = useState(${JSON.stringify(trail)});
  const [done, setDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* ignore */ }
  }, [done]);

  const packed = GEAR.filter(g => done[g.id]).length;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true">C</span>
          <div>
            <input className="field" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }} value={trailName} onChange={(e) => setTrailName(e.target.value)} aria-label="Trail name" />
            <p className="sub">${escapeJsx(title)} · hiking journal · local demo</p>
          </div>
        </div>
        <div className="badge">{packed}/{GEAR.length} packed</div>
      </header>

      <section className="cards">
        {ELEV.map(c => (
          <article key={c.id} className="card">
            <p className="card-label">{c.label}</p>
            <p className="card-value">{c.value}{c.unit ? <span className="card-unit">{c.unit}</span> : null}</p>
            <div className="spark" aria-hidden="true">
              {c.spark.map((h, i) => <span key={i} style={{ height: \`\${h}%\` }} />)}
            </div>
          </article>
        ))}
      </section>

      <main className="main-grid">
        <section className="panel">
          <h2>Gear checklist</h2>
          <ul className="check">
            {GEAR.map(g => (
              <li key={g.id}>
                <button type="button" className={done[g.id] ? 'on' : ''} onClick={() => setDone(x => ({ ...x, [g.id]: !x[g.id] }))}>
                  <span>{done[g.id] ? '✓' : '○'}</span>
                  <span>{g.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2>Journal</h2>
          <p className="sub" style={{ marginBottom: '0.75rem' }}>Trail notes stay on this device for the demo.</p>
          <textarea className="field" rows={6} placeholder="Conditions, wildlife, next time…" defaultValue="" />
        </section>
      </main>
    </div>
  );
}
`;
  return {
    appJsx,
    appCss: shellCss(theme),
    indexCss: `body { margin: 0; background: ${theme.bg}; color: ${theme.text}; font-family: system-ui, sans-serif; }\n`,
  };
}

function buildOpsDashboardSpa(title: string, summary: string): { appJsx: string; appCss: string; indexCss: string } {
  const theme = themeFromBrief(summary);
  const loom = /\b(loom|warp|pick|yarn|textile|weave)\b/i.test(summary);
  const subtitle = escapeJsx(extractSubtitle(summary, loom ? `${title} operations` : `${title} dashboard`));
  const cards = loom
    ? [
        { id: 'c0', label: 'Warp tension', value: 42, unit: 'N' },
        { id: 'c1', label: 'Pick count', value: 318, unit: '' },
        { id: 'c2', label: 'Yarn shortage', value: 3, unit: '' },
        { id: 'c3', label: 'Utilization', value: 78, unit: '%' },
      ]
    : [
        { id: 'c0', label: 'Throughput', value: 92, unit: '' },
        { id: 'c1', label: 'Alerts', value: 3, unit: '' },
        { id: 'c2', label: 'Utilization', value: 78, unit: '%' },
        { id: 'c3', label: 'Open tasks', value: 11, unit: '' },
      ];
  const cardJson = JSON.stringify(cards, null, 2);
  const units = JSON.stringify(
    Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      name: loom ? `Loom ${i + 1}` : `Unit ${i + 1}`,
      status: (['running', 'running', 'idle', 'maintenance', 'running', 'idle'] as const)[i],
      owner: ['Alex', 'Sam', 'Riley', 'Jordan', 'Casey', 'Morgan'][i],
      sku: `SKU-${100 + i}`,
    })),
    null,
    2,
  );
  const stock = JSON.stringify(
    loom
      ? [
          { name: 'Warp yarn A', qty: 12, low: true },
          { name: 'Weft cotton', qty: 48, low: false },
          { name: 'Copper accent', qty: 7, low: true },
          { name: 'Binder', qty: 30, low: false },
        ]
      : [
          { name: 'Primary feed', qty: 12, low: true },
          { name: 'Secondary feed', qty: 48, low: false },
          { name: 'Accent stock', qty: 7, low: true },
          { name: 'Binder', qty: 30, low: false },
        ],
    null,
    2,
  );
  const appJsx = `import { useMemo, useState } from 'react';
import './App.css';

const CARDS = ${cardJson};
const UNITS = ${units};
const STOCK = ${stock};

export default function App() {
  const [shift, setShift] = useState('AM');
  const util = useMemo(() => Math.round((UNITS.filter(u => u.status === 'running').length / UNITS.length) * 100), []);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true">${escapeJsx(title.slice(0, 1).toUpperCase())}</span>
          <div>
            <h1>${escapeJsx(title)}</h1>
            <p className="sub">${subtitle}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
          <button type="button" className="primary" style={{ opacity: shift === 'AM' ? 1 : 0.55 }} onClick={() => setShift('AM')}>AM</button>
          <button type="button" className="primary" style={{ opacity: shift === 'PM' ? 1 : 0.55 }} onClick={() => setShift('PM')}>PM</button>
          <span className="badge">{util}% live</span>
        </div>
      </header>

      <section className="cards">
        {CARDS.map(c => (
          <article key={c.id} className="card">
            <p className="card-label">{c.label}</p>
            <p className="card-value">{c.value}{c.unit ? <span className="card-unit">{c.unit}</span> : null}</p>
          </article>
        ))}
      </section>

      <main className="main-grid">
        <section className="panel">
          <h2>Floor grid</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.55rem' }}>
            {UNITS.map(u => (
              <article key={u.id} className="card" style={{ borderColor: u.status === 'running' ? 'color-mix(in srgb, #34d399 50%, transparent)' : u.status === 'maintenance' ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : undefined }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <strong>{u.name}</strong><span>{u.status}</span>
                </header>
                <p style={{ margin: '0.35rem 0 0', opacity: 0.8 }}>{u.owner}</p>
                <p style={{ margin: '0.15rem 0 0', opacity: 0.55, fontSize: '0.75rem' }}>{u.sku}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>Inventory</h2>
          <ul className="check">
            {STOCK.map(s => (
              <li key={s.name}>
                <button type="button" className={s.low ? 'on' : ''} style={{ cursor: 'default' }}>
                  <span>{s.low ? '!' : '·'}</span>
                  <span style={{ flex: 1 }}>{s.name}</span>
                  <strong>{s.qty}</strong>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
`;
  return {
    appJsx,
    appCss: shellCss(theme),
    indexCss: `body { margin: 0; background: ${theme.bg}; color: ${theme.text}; font-family: system-ui, sans-serif; }\n`,
  };
}

/** Generic product workspace — real app chrome from the brief, never a prompt checklist. */
function buildProductWorkspaceSpa(title: string, summary: string): { appJsx: string; appCss: string; indexCss: string } {
  const theme = themeFromBrief(summary);
  const sub = escapeJsx(extractSubtitle(summary, 'Local demo from your brief'));
  const appJsx = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [note, setNote] = useState('');
  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true">${escapeJsx(title.slice(0, 1).toUpperCase())}</span>
          <div>
            <h1>${escapeJsx(title)}</h1>
            <p className="sub">${sub}</p>
          </div>
        </div>
        <div className="badge">Live demo</div>
      </header>
      <section className="cards">
        <article className="card"><p className="card-label">Workspace</p><p className="card-value">Ready</p></article>
        <article className="card"><p className="card-label">Theme</p><p className="card-value" style={{ fontSize: '1rem' }}>From brief</p></article>
        <article className="card"><p className="card-label">Data</p><p className="card-value" style={{ fontSize: '1rem' }}>Local</p></article>
        <article className="card"><p className="card-label">Status</p><p className="card-value" style={{ fontSize: '1rem' }}>Editable</p></article>
      </section>
      <main className="main-grid">
        <section className="panel">
          <h2>Main view</h2>
          <p className="sub" style={{ marginBottom: '0.75rem' }}>Ask ARK in chat to add pages, widgets, or data for this product.</p>
          <button type="button" className="primary">Primary action</button>
        </section>
        <section className="panel">
          <h2>Notes</h2>
          <textarea className="field" rows={6} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tweaks for the next edit…" />
        </section>
      </main>
    </div>
  );
}
`;
  return {
    appJsx,
    appCss: shellCss(theme),
    indexCss: `body { margin: 0; background: ${theme.bg}; color: ${theme.text}; font-family: system-ui, sans-serif; }\n`,
  };
}
