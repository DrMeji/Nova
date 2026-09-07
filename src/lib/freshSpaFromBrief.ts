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
    .replace(/\n*##\s*NOVA design skills[\s\S]*/i, '')
    .replace(/\n*NOVA design skills\s*\(follow these\)[\s\S]*/i, '')
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
  if (/\b(book|shelf|reading|paper|ink|ledger|invoice)\b/.test(t)) {
    return { bg: '#f4f1ea', accent: '#1f3d2b', card: '#ffffff', text: '#1c1917' };
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
  if (looksLikeChromeDinoGame(cleanSummary, title)) return buildChromeDinoSpa(title, cleanSummary);
  if (looksLikeSpatialApp(cleanSummary, title)) return buildSpatialEditorSpa(title, cleanSummary);
  if (looksLikeReefLogger(cleanSummary)) return buildReefLoggerSpa(title, cleanSummary);
  if (looksLikeTrailJournal(cleanSummary)) return buildTrailJournalSpa(title, cleanSummary);
  if (looksLikeOpsDashboard(cleanSummary)) return buildOpsDashboardSpa(title, cleanSummary);
  if (looksLikeBookClub(cleanSummary)) return buildBookClubSpa(title, cleanSummary);
  if (looksLikeInvoiceApp(cleanSummary)) return buildInvoiceSpa(title, cleanSummary);
  if (looksLikeAppleHome(cleanSummary, title)) return buildAppleHomeSpa(title, cleanSummary);
  if (looksLikeMarketingSite(cleanSummary, title)) return buildMarketingLandingSpa(title, cleanSummary);
  return buildProductWorkspaceSpa(title, cleanSummary);
}

/** Chrome offline T-Rex runner style. */
export function looksLikeChromeDinoGame(summary: string, title = ''): boolean {
  const t = `${stripSkillNoise(summary)} ${title}`.toLowerCase();
  return /\b(chrome\s+dino|dinosaur\s+game|t-?rex\s+(?:runner|game)|offline\s+dinosaur|dino\s+runner|no\s+internet\s+dinosaur)\b/.test(t)
    || (/\bdinosaur\b/.test(t) && /\b(game|runner|jump|space\s*bar|cactus|offline)\b/.test(t));
}

/** Interactive 3D / viewport modeling tool — not a marketing site. */
export function looksLikeSpatialApp(summary: string, title = ''): boolean {
  const t = `${stripSkillNoise(summary)} ${title}`.toLowerCase();
  if (/\b(3d|three\.?js|webgl|babylon|modeling\s+app|modeler|viewport|blender[-\s]?like|mesh\s+editor)\b/.test(t)) {
    return /\b(app|editor|tool|scene|cube|sphere|mesh|viewport|canvas|orbit|model)\b/.test(t) || /\b3d\b/.test(t);
  }
  return false;
}

function looksLikeAppleHome(summary: string, title: string): boolean {
  const t = `${stripSkillNoise(summary)} ${title}`.toLowerCase();
  return /\bapple\.com\b/.test(t)
    || /\bapple[\s-]?like\b/.test(t)
    || /\bidentical\s+to\s+apple\b/.test(t)
    || (/\b(flagship|product\s+homepage|storefront)\b/.test(t) && /\b(iphone|macbook|ipad|apple)\b/.test(t));
}

function looksLikeMarketingSite(summary: string, title: string): boolean {
  const t = `${stripSkillNoise(summary)} ${title}`.toLowerCase();
  if (looksLikeSpatialApp(summary, title) || looksLikeChromeDinoGame(summary, title)) return false;
  return /\b(landing|marketing|homepage|home\s+page|storefront|product\s+site|brand\s+site|premium\s+(?:site|website)|animated\s+(?:site|website)|welcome\s+page)\b/.test(t)
    || /\b(?:orchard|lumen|nova|pulse|glint|aurora)\.(?:com|io|app)\b/.test(t)
    || (/\b(?:website|web\s+site|site)\b/.test(t) && /\b(?:professional|animated|scroll|hero|polished|beautiful|premium)\b/.test(t));
}

function looksLikeBookClub(summary: string): boolean {
  const t = stripSkillNoise(summary).toLowerCase();
  return /\bbook\s*club\b/.test(t)
    || /\bshelf\s*circle\b/.test(t)
    || (/\b(reading|bookshelf|shelf)\b/.test(t) && /\b(finished|members|current\s+book|notes|losing|loosing|track)\b/.test(t));
}

function looksLikeInvoiceApp(summary: string): boolean {
  const t = stripSkillNoise(summary).toLowerCase();
  return /\binvoice/.test(t)
    || (/\bfreelance\b/.test(t) && /\b(pay|paid|draft|client)\b/.test(t));
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
  if (s.length >= 2 && s.length <= 48) {
    // "My App" → strip "App" → "My" — keep a real product label instead.
    if (/^(my|the|a|an|new|app|project|site)$/i.test(s)) {
      const raw = String(name || '').trim();
      if (raw.length >= 2 && raw.length <= 48 && !/^(my|the|a|an)$/i.test(raw)) return raw;
      return 'New App';
    }
    return s;
  }
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
const KEY = ${JSON.stringify(`NOVA-reef:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)};

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
const KEY = ${JSON.stringify(`NOVA-trail:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)};

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

/** Book club tracker — current title, members, notes, finished toggle. */
function buildBookClubSpa(title: string, summary: string): { appJsx: string; appCss: string; indexCss: string } {
  const theme = themeFromBrief(summary);
  const sub = escapeJsx(extractSubtitle(summary, 'Who finished what - whats next'));
  const appJsx = `import { useMemo, useState } from 'react';
import './App.css';

const KEY = ${JSON.stringify(`NOVA-shelf:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)};

const seed = [
  { id: '1', title: 'The Night Circus', member: 'Ava', status: 'reading' },
  { id: '2', title: 'Piranesi', member: 'Jordan', status: 'finished' },
  { id: '3', title: 'Klara and the Sun', member: 'Sam', status: 'queued' },
];

export default function App() {
  const [books, setBooks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') || seed; } catch { return seed; }
  });
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState([]);
  const current = useMemo(() => books.find((b) => b.status === 'reading') || books[0], [books]);

  const persist = (next) => {
    setBooks(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const markFinished = (id) => {
    persist(books.map((b) => b.id === id ? { ...b, status: 'finished' } : b));
  };

  const addNote = () => {
    const t = note.trim();
    if (!t) return;
    setNotes((n) => [{ id: String(Date.now()), text: t }, ...n]);
    setNote('');
  };

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
        <nav className="nav">
          <a href="#home">Home</a>
          <a href="#current">Current book</a>
          <a href="#members">Members</a>
        </nav>
      </header>
      <section id="home" className="cards">
        <article className="card"><p className="card-label">Reading now</p><p className="card-value">{current?.title || '-'}</p></article>
        <article className="card"><p className="card-label">Finished</p><p className="card-value">{books.filter((b) => b.status === 'finished').length}</p></article>
        <article className="card"><p className="card-label">In queue</p><p className="card-value">{books.filter((b) => b.status === 'queued').length}</p></article>
        <article className="card"><p className="card-label">Members</p><p className="card-value">{new Set(books.map((b) => b.member)).size}</p></article>
      </section>
      <div className="main-grid">
        <section id="current" className="panel">
          <h2>Current book</h2>
          <p className="lead">{current?.title}</p>
          <p className="muted">With {current?.member}</p>
          <button type="button" className="primary" onClick={() => current && markFinished(current.id)}>Mark as finished</button>
          <h2 style={{ marginTop: '1.25rem' }}>Spoiler-safe notes</h2>
          <textarea className="field" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Quote or question…" />
          <button type="button" className="primary" onClick={addNote}>Save note</button>
          <ul className="check" style={{ marginTop: '0.75rem' }}>
            {notes.map((n) => <li key={n.id}><button type="button">{n.text}</button></li>)}
          </ul>
        </section>
        <section id="members" className="panel">
          <h2>Club shelf</h2>
          <ul className="check">
            {books.map((b) => (
              <li key={b.id}>
                <button type="button" className={b.status === 'finished' ? 'on' : ''} onClick={() => markFinished(b.id)}>
                  <span>{b.title}</span>
                  <span className="badge">{b.member} - {b.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
`;
  const appCss = `${shellCss(theme)}
.nav { display: flex; gap: 0.85rem; flex-wrap: wrap; }
.nav a { color: inherit; text-decoration: none; opacity: 0.75; font-size: 0.85rem; }
.nav a:hover { opacity: 1; }
.lead { margin: 0 0 0.35rem; font-size: 1.35rem; font-weight: 650; letter-spacing: -0.02em; }
.muted { margin: 0 0 1rem; opacity: 0.65; }
.app { background: linear-gradient(180deg, #f7f3eb 0%, #ebe4d8 100%); color: #1c1917; }
.mark { background: #1f3d2b; color: #f4f1ea; border: 0; }
.primary { background: #1f3d2b; color: #f4f1ea; }
.badge { color: #1f3d2b; border-color: rgba(31,61,43,0.25); background: rgba(31,61,43,0.08); }
`;
  return {
    appJsx,
    appCss,
    indexCss: `body { margin: 0; background: ${theme.bg}; color: ${theme.text}; font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; }\n`,
  };
}

/** Freelance invoice list — add rows + mark paid. */
function buildInvoiceSpa(title: string, summary: string): { appJsx: string; appCss: string; indexCss: string } {
  const theme = themeFromBrief(summary);
  const sub = escapeJsx(extractSubtitle(summary, 'Draft / Sent / Paid'));
  const appJsx = `import { useState } from 'react';
import './App.css';

const KEY = ${JSON.stringify(`NOVA-ink:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)};

export default function App() {
  const [rows, setRows] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || 'null') || [
        { id: '1', client: 'North Studio', amount: 1200, status: 'sent' },
        { id: '2', client: 'Beacon Co', amount: 840, status: 'draft' },
      ];
    } catch {
      return [];
    }
  });
  const [client, setClient] = useState('');
  const [amount, setAmount] = useState('500');

  const save = (next) => {
    setRows(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const addInvoice = () => {
    const name = client.trim() || 'New client';
    const amt = Number(amount) || 0;
    save([{ id: String(Date.now()), client: name, amount: amt, status: 'draft' }, ...rows]);
    setClient('');
    setAmount('500');
  };

  const setStatus = (id, status) => save(rows.map((r) => r.id === id ? { ...r, status } : r));

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
        <div className="badge">{rows.filter((r) => r.status === 'paid').length} paid</div>
      </header>
      <section className="panel" style={{ marginBottom: '1rem' }}>
        <h2>Add invoice</h2>
        <input className="field" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Client name" />
        <input className="field" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" inputMode="decimal" />
        <button type="button" className="primary" onClick={addInvoice}>Add invoice</button>
      </section>
      <section className="panel">
        <h2>Invoices</h2>
        <ul className="check">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" className={r.status === 'paid' ? 'on' : ''} onClick={() => setStatus(r.id, r.status === 'paid' ? 'sent' : 'paid')}>
                <span>{r.client} - {'$' + r.amount.toLocaleString()}</span>
                <span className="badge">{r.status}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
`;
  return {
    appJsx,
    appCss: shellCss(theme),
    indexCss: `body { margin: 0; background: ${theme.bg}; color: ${theme.text}; font-family: "Segoe UI", system-ui, sans-serif; }\n`,
  };
}

/** Chrome offline dinosaur runner — Space to jump, cacti, score, restart. */
function buildChromeDinoSpa(title: string, _summary: string): { appJsx: string; appCss: string; indexCss: string } {
  const brand = escapeJsx(title);
  const appJsx = `import { useEffect, useRef, useState } from 'react';
import './App.css';

export default function App() {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [status, setStatus] = useState('ready');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 800;
    const H = 240;
    canvas.width = W;
    canvas.height = H;

    const groundY = 190;
    const dino = { x: 60, y: groundY, w: 36, h: 40, vy: 0, onGround: true };
    let obstacles = [];
    let clouds = [{ x: 200, y: 50 }, { x: 480, y: 36 }, { x: 700, y: 60 }];
    let speed = 6;
    let frame = 0;
    let running = false;
    let dead = false;
    let points = 0;
    let hi = Number(localStorage.getItem('ark-dino-best') || 0) || 0;
    setBest(hi);
    let raf = 0;

    const reset = () => {
      dino.y = groundY;
      dino.vy = 0;
      dino.onGround = true;
      obstacles = [];
      speed = 6;
      frame = 0;
      points = 0;
      dead = false;
      running = true;
      setStatus('run');
      setScore(0);
    };

    const jump = () => {
      if (dead) {
        reset();
        return;
      }
      if (!running) {
        reset();
        return;
      }
      if (dino.onGround) {
        dino.vy = -11.5;
        dino.onGround = false;
      }
    };

    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        jump();
      }
    };
    const onClick = () => jump();
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onClick);

    const spawn = () => {
      const tall = Math.random() > 0.55;
      obstacles.push({
        x: W + 20,
        y: groundY - (tall ? 42 : 28),
        w: tall ? 18 : 14,
        h: tall ? 42 : 28,
      });
    };

    const hit = (a, b) => (
      a.x < b.x + b.w - 6
      && a.x + a.w - 6 > b.x
      && a.y < b.y + b.h
      && a.y + a.h > b.y + 4
    );

    const drawDino = () => {
      ctx.fillStyle = '#535353';
      ctx.fillRect(dino.x, dino.y - dino.h, dino.w, dino.h);
      ctx.fillRect(dino.x + 22, dino.y - dino.h - 10, 16, 12);
      ctx.fillStyle = '#f7f7f7';
      ctx.fillRect(dino.x + 30, dino.y - dino.h - 6, 3, 3);
      if (running && !dead && dino.onGround) {
        const leg = Math.floor(frame / 6) % 2;
        ctx.fillStyle = '#535353';
        ctx.fillRect(dino.x + 6, dino.y - 2, 8, 10 + (leg ? 2 : -2));
        ctx.fillRect(dino.x + 22, dino.y - 2, 8, 10 + (leg ? -2 : 2));
      }
    };

    const drawCactus = (o) => {
      ctx.fillStyle = '#535353';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillRect(o.x - 8, o.y + o.h * 0.35, 8, 8);
      ctx.fillRect(o.x + o.w, o.y + o.h * 0.2, 8, 8);
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      ctx.fillStyle = '#f7f7f7';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#535353';
      ctx.beginPath();
      ctx.moveTo(0, groundY + 1);
      ctx.lineTo(W, groundY + 1);
      ctx.stroke();

      clouds.forEach((c) => {
        if (running && !dead) c.x -= speed * 0.25;
        if (c.x < -60) c.x = W + Math.random() * 200;
        ctx.fillStyle = '#dadada';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 28, 10, 0, 0, Math.PI * 2);
        ctx.fill();
      });

      if (running && !dead) {
        frame += 1;
        if (frame % Math.max(40, 90 - Math.floor(speed * 4)) === 0) spawn();
        dino.vy += 0.55;
        dino.y += dino.vy;
        if (dino.y >= groundY) {
          dino.y = groundY;
          dino.vy = 0;
          dino.onGround = true;
        }
        obstacles.forEach((o) => { o.x -= speed; });
        obstacles = obstacles.filter((o) => o.x > -40);
        for (const o of obstacles) {
          if (hit({ x: dino.x, y: dino.y - dino.h, w: dino.w, h: dino.h }, o)) {
            dead = true;
            running = false;
            setStatus('gameover');
            if (points > hi) {
              hi = points;
              localStorage.setItem('ark-dino-best', String(hi));
              setBest(hi);
            }
          }
        }
        if (frame % 6 === 0) {
          points += 1;
          setScore(points);
          if (points % 100 === 0) speed = Math.min(13, speed + 0.35);
        }
      }

      obstacles.forEach(drawCactus);
      drawDino();

      ctx.fillStyle = '#535353';
      ctx.font = '16px monospace';
      ctx.fillText('HI ' + String(hi).padStart(5, '0'), W - 200, 28);
      ctx.fillText(String(points).padStart(5, '0'), W - 90, 28);
      if (!running && !dead) {
        ctx.fillText('Press Space to start', W / 2 - 90, 80);
      }
      if (dead) {
        ctx.fillText('GAME OVER', W / 2 - 50, 80);
        ctx.fillText('Press Space to retry', W / 2 - 90, 108);
      }
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onClick);
    };
  }, []);

  return (
    <div className="dino">
      <header>
        <h1>${brand}</h1>
        <p>Chrome-style runner · Space / click to jump · Score {score} · Best {best} · {status}</p>
      </header>
      <canvas ref={canvasRef} tabIndex={0} aria-label="Dinosaur runner" />
    </div>
  );
}
`;

  const appCss = `.dino {
  min-height: 100vh; display: grid; place-content: start center; gap: 1rem;
  padding: 1.5rem 1rem 2rem; background: #f7f7f7; color: #535353;
  font-family: "Segoe UI", system-ui, sans-serif;
}
header { text-align: center; }
h1 { margin: 0; font-size: 1.25rem; letter-spacing: -0.02em; color: #222; }
p { margin: 0.35rem 0 0; font-size: 0.85rem; }
canvas {
  width: min(800px, 100%); height: auto; background: #f7f7f7;
  border: 1px solid #e0e0e0; border-radius: 0.5rem; outline: none;
  image-rendering: pixelated;
}
`;

  return {
    appJsx,
    appCss,
    indexCss: `html, body, #root { margin: 0; min-height: 100%; background: #f7f7f7; color: #535353; }\n* { box-sizing: border-box; }\n`,
  };
}

/** Basic interactive spatial editor: grid, add shapes, orbit, drag selected. */
function buildSpatialEditorSpa(title: string, summary: string): { appJsx: string; appCss: string; indexCss: string } {
  const brand = escapeJsx(title);
  const hint = escapeJsx(extractSubtitle(summary, 'Drag to orbit · click a mesh · drag to move'));
  const appJsx = `import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import './App.css';

let nextId = 1;

export default function App() {
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState('—');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1c1f);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
    camera.position.set(6, 5, 8);
    camera.lookAt(0, 0.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 1.1);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(5, 10, 4);
    scene.add(dir);

    const grid = new THREE.GridHelper(20, 20, 0x5a6570, 0x2e3540);
    scene.add(grid);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.9, metalness: 0.05 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.001;
    ground.receiveShadow = true;
    scene.add(ground);

    const meshes = new Map();
    let selectedId = null;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const dragOffset = new THREE.Vector3();
    let dragging = false;
    let orbiting = false;
    let lastX = 0;
    let lastY = 0;
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(new THREE.Vector3(0, 0.5, 0)));

    const colors = [0x4ea1ff, 0xf0a05a, 0x6dd3a0, 0xe27c9a, 0xc9b6ff];

    const setSelectedVisual = (id) => {
      selectedId = id;
      for (const [mid, mesh] of meshes) {
        mesh.material.emissive?.setHex(mid === id ? 0x223344 : 0x000000);
      }
      setSelected(id ? String(id) : '—');
    };

    const addShape = (kind) => {
      const id = 'obj-' + (nextId++);
      let geo;
      if (kind === 'sphere') geo = new THREE.SphereGeometry(0.55, 32, 24);
      else if (kind === 'cone') geo = new THREE.ConeGeometry(0.55, 1.1, 24);
      else geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: colors[meshes.size % colors.length],
        roughness: 0.45,
        metalness: 0.15,
        emissive: 0x000000,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((Math.random() - 0.5) * 4, kind === 'cone' ? 0.55 : 0.5, (Math.random() - 0.5) * 4);
      mesh.userData.id = id;
      scene.add(mesh);
      meshes.set(id, mesh);
      setSelectedVisual(id);
      setCount(meshes.size);
      return id;
    };

    const removeSelected = () => {
      if (!selectedId || !meshes.has(selectedId)) return;
      const mesh = meshes.get(selectedId);
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      meshes.delete(selectedId);
      setSelectedVisual(null);
      setCount(meshes.size);
    };

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const toNDC = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e) => {
      toNDC(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...meshes.values()], false);
      if (hits.length) {
        const mesh = hits[0].object;
        setSelectedVisual(mesh.userData.id);
        dragging = true;
        plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), mesh.position);
        if (raycaster.ray.intersectPlane(plane, hit)) dragOffset.copy(mesh.position).sub(hit);
        renderer.domElement.setPointerCapture(e.pointerId);
      } else {
        orbiting = true;
        lastX = e.clientX;
        lastY = e.clientY;
        renderer.domElement.setPointerCapture(e.pointerId);
      }
    };

    const onPointerMove = (e) => {
      if (dragging && selectedId) {
        toNDC(e);
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(plane, hit)) {
          const mesh = meshes.get(selectedId);
          if (mesh) mesh.position.set(hit.x + dragOffset.x, mesh.position.y, hit.z + dragOffset.z);
        }
        return;
      }
      if (!orbiting) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      spherical.theta -= dx * 0.008;
      spherical.phi = Math.min(Math.max(0.15, spherical.phi + dy * 0.008), Math.PI - 0.15);
      const target = new THREE.Vector3(0, 0.5, 0);
      camera.position.setFromSpherical(spherical).add(target);
      camera.lookAt(target);
    };

    const onPointerUp = (e) => {
      dragging = false;
      orbiting = false;
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
    };

    const onWheel = (e) => {
      e.preventDefault();
      spherical.radius = Math.min(30, Math.max(3, spherical.radius + e.deltaY * 0.01));
      const target = new THREE.Vector3(0, 0.5, 0);
      camera.position.setFromSpherical(spherical).add(target);
      camera.lookAt(target);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      renderer.render(scene, camera);
    };
    tick();

    addShape('box');
    apiRef.current = { addShape, removeSelected };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      for (const mesh of meshes.values()) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      apiRef.current = null;
    };
  }, []);

  return (
    <div className="forge">
      <header className="bar">
        <div className="brand">
          <strong>${brand}</strong>
          <span>${hint}</span>
        </div>
        <div className="tools">
          <button type="button" onClick={() => apiRef.current?.addShape('box')}>Cube</button>
          <button type="button" onClick={() => apiRef.current?.addShape('sphere')}>Sphere</button>
          <button type="button" onClick={() => apiRef.current?.addShape('cone')}>Cone</button>
          <button type="button" className="danger" onClick={() => apiRef.current?.removeSelected()}>Delete</button>
        </div>
        <div className="meta">Objects {count} · Selected {selected}</div>
      </header>
      <div className="viewport" ref={mountRef} />
    </div>
  );
}
`;

  const appCss = `.forge {
  height: 100vh; display: grid; grid-template-rows: auto 1fr;
  background: #121417; color: #e8eaed;
  font-family: "Segoe UI", system-ui, sans-serif;
}
.bar {
  display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
  padding: 0.65rem 0.9rem; border-bottom: 1px solid #2a3038;
  background: rgba(18,20,23,0.94); backdrop-filter: blur(10px);
}
.brand { display: grid; gap: 0.1rem; min-width: 10rem; }
.brand strong { font-size: 0.95rem; letter-spacing: -0.02em; }
.brand span { font-size: 0.72rem; color: #9aa3ad; }
.tools { display: flex; gap: 0.45rem; flex-wrap: wrap; }
.tools button {
  border: 1px solid #3a424d; background: #1c2128; color: #e8eaed;
  border-radius: 0.55rem; padding: 0.4rem 0.75rem; font: inherit; cursor: pointer;
}
.tools button:hover { border-color: #5b6b7c; background: #242b34; }
.tools .danger { border-color: #6b3340; color: #ffb4c0; }
.meta { margin-left: auto; font-size: 0.75rem; color: #9aa3ad; }
.viewport { position: relative; min-height: 0; }
.viewport canvas { display: block; width: 100% !important; height: 100% !important; }
`;

  return {
    appJsx,
    appCss,
    indexCss: `html, body, #root { height: 100%; margin: 0; background: #121417; color: #e8eaed; }\n* { box-sizing: border-box; }\n`,
  };
}

/** Flagship product homepage — apple.com-style light/dark bands, frosted nav, working CTAs. */
function buildAppleHomeSpa(title: string, summary: string): { appJsx: string; appCss: string; indexCss: string } {
  const brand = escapeJsx(title);
  const tag = escapeJsx(extractSubtitle(summary, 'Designed for the next chapter.'));
  const appJsx = `import { useEffect, useState } from 'react';
import './App.css';

const TILES = [
  { id: 'pro', name: '${brand} Pro', blurb: 'Our most capable. Push what is possible.', tone: 'dark' },
  { id: 'air', name: '${brand} Air', blurb: 'Impossibly light. Ready when you are.', tone: 'light' },
  { id: 'studio', name: '${brand} Studio', blurb: 'A new kind of creative surface.', tone: 'blue' },
];

export default function App() {
  const [bagOpen, setBagOpen] = useState(false);
  const [learn, setLearn] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const [picked, setPicked] = useState(TILES[0].id);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const active = TILES.find((t) => t.id === picked) || TILES[0];

  return (
    <div className="apple">
      <header className={'topnav' + (scrolled ? ' solid' : '')}>
        <button type="button" className="logo" onClick={() => go('hero')} aria-label="${brand} home">
          <span className="mark" />
        </button>
        <nav className="links" aria-label="Primary">
          <button type="button" onClick={() => go('store')}>Store</button>
          <button type="button" onClick={() => go('mac')}>Mac</button>
          <button type="button" onClick={() => go('iphone')}>iPhone</button>
          <button type="button" onClick={() => go('watch')}>Watch</button>
          <button type="button" onClick={() => go('buy')}>Accessories</button>
        </nav>
        <button type="button" className="bag" onClick={() => setBagOpen((v) => !v)} aria-label="Bag">
          <span className="bag-icon" />
          {bagOpen ? <span className="dot" /> : null}
        </button>
      </header>

      {bagOpen && (
        <aside className="bag-panel" role="dialog" aria-label="Bag">
          <h2>Your Bag</h2>
          <p>1x {active.name} - configured in silver.</p>
          <button type="button" className="btn blue" onClick={() => setBagOpen(false)}>Check Out</button>
          <button type="button" className="btn ghost" onClick={() => setBagOpen(false)}>Continue Shopping</button>
        </aside>
      )}

      <section id="hero" className="hero band dark">
        <p className="eyebrow">${brand}</p>
        <h1>${tag}</h1>
        <p className="sub">A welcoming first screen with motion that guides the eye - not noise that fights it.</p>
        <div className="cta">
          <button type="button" className="link" onClick={() => { setLearn('hero'); go('story'); }}>Learn more</button>
          <button type="button" className="link" onClick={() => go('buy')}>Buy</button>
        </div>
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-device" aria-hidden="true">
          <div className="bezel"><div className="screen"><span>${brand}</span></div></div>
        </div>
      </section>

      <section id="store" className="band light product">
        <h2>{TILES[0].name}</h2>
        <p>{TILES[0].blurb}</p>
        <div className="cta">
          <button type="button" className="link dark" onClick={() => { setPicked('pro'); setLearn('pro'); }}>Learn more</button>
          <button type="button" className="link dark" onClick={() => { setPicked('pro'); setBagOpen(true); }}>Buy</button>
        </div>
        <div className="slab dark-slab" />
      </section>

      <section id="mac" className="band soft product">
        <h2>{TILES[1].name}</h2>
        <p>{TILES[1].blurb}</p>
        <div className="cta">
          <button type="button" className="link dark" onClick={() => { setPicked('air'); setLearn('air'); }}>Learn more</button>
          <button type="button" className="link dark" onClick={() => { setPicked('air'); setBagOpen(true); }}>Buy</button>
        </div>
        <div className="slab soft-slab" />
      </section>

      <section id="iphone" className="band blue product">
        <h2>{TILES[2].name}</h2>
        <p>{TILES[2].blurb}</p>
        <div className="cta">
          <button type="button" className="link" onClick={() => { setPicked('studio'); setLearn('studio'); }}>Learn more</button>
          <button type="button" className="link" onClick={() => { setPicked('studio'); setBagOpen(true); }}>Buy</button>
        </div>
        <div className="slab blue-slab" />
      </section>

      <section id="watch" className="band light story" >
        <div id="story" />
        <h2>Built around how people look.</h2>
        <p>Scroll stays smooth. Buttons do real work. Color and type stay confident without shouting.</p>
        {learn && (
          <p className="learn-card">You opened Learn more on <strong>{learn === 'hero' ? brand : active.name}</strong>. Explore finishes below, then add to bag when you are ready.</p>
        )}
        <div className="chip-row">
          {TILES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={'chip' + (picked === t.id ? ' on' : '')}
              onClick={() => setPicked(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
      </section>

      <section id="buy" className="band buy">
        <h2>Get {active.name}</h2>
        <p>Pick a finish. The preview updates instantly.</p>
        <div className="finishes">
          {['Silver', 'Black', 'Gold'].map((c) => (
            <button key={c} type="button" className={'finish ' + c.toLowerCase()} onClick={() => setBagOpen(true)}>
              {c}
            </button>
          ))}
        </div>
        <button type="button" className="btn blue wide" onClick={() => setBagOpen(true)}>Add to Bag</button>
      </section>

      <footer className="foot">
        <button type="button" className="link dark" onClick={() => go('hero')}>Back to top</button>
        <span>Copyright {new Date().getFullYear()} ${brand} Inc.</span>
      </footer>
    </div>
  );
}
`;

  const appCss = `.apple {
  --bg: #000;
  --fg: #f5f5f7;
  --muted: #a1a1a6;
  --link: #2997ff;
  --line: rgba(255,255,255,0.12);
  min-height: 100vh;
  color: var(--fg);
  background: #000;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  letter-spacing: -0.01em;
}
.topnav {
  position: sticky; top: 0; z-index: 40;
  display: flex; align-items: center; justify-content: center; gap: 1.25rem;
  height: 2.75rem; padding: 0 1rem;
  background: rgba(0,0,0,0.8);
  backdrop-filter: saturate(180%) blur(20px);
  transition: background 0.25s ease;
}
.topnav.solid { background: rgba(22,22,23,0.92); }
.logo, .links button, .bag, .link, .btn, .chip, .finish, .foot button {
  font: inherit; color: inherit; background: transparent; border: 0; cursor: pointer;
}
.logo { position: absolute; left: 1rem; display: grid; place-items: center; width: 2rem; height: 2rem; }
.mark {
  width: 1.05rem; height: 1.2rem;
  background: linear-gradient(180deg, #fff, #d2d2d7);
  border-radius: 36% 36% 42% 42%;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.2);
}
.links { display: flex; gap: 1.4rem; font-size: 0.75rem; color: var(--fg); }
.links button { opacity: 0.92; }
.links button:hover { opacity: 1; }
.bag { position: absolute; right: 1rem; width: 2rem; height: 2rem; display: grid; place-items: center; }
.bag-icon {
  width: 0.95rem; height: 0.95rem; border: 1.5px solid var(--fg); border-radius: 0.2rem 0.2rem 0.35rem 0.35rem;
  position: relative;
}
.bag-icon::before {
  content: ''; position: absolute; left: 0.15rem; right: 0.15rem; top: -0.28rem; height: 0.35rem;
  border: 1.5px solid var(--fg); border-bottom: 0; border-radius: 0.4rem 0.4rem 0 0;
}
.dot {
  position: absolute; top: 0.35rem; right: 0.35rem; width: 0.35rem; height: 0.35rem;
  border-radius: 50%; background: var(--link);
}
.bag-panel {
  position: fixed; right: 0.75rem; top: 3.25rem; z-index: 50;
  width: min(22rem, calc(100vw - 1.5rem));
  padding: 1.1rem 1.15rem 1.2rem; border-radius: 1.1rem;
  background: rgba(29,29,31,0.96); border: 1px solid var(--line);
  display: grid; gap: 0.7rem; animation: fadeUp 0.28s ease both;
}
.bag-panel h2 { margin: 0; font-size: 1.15rem; }
.bag-panel p { margin: 0; color: var(--muted); font-size: 0.92rem; }
.band { position: relative; overflow: hidden; text-align: center; padding: 4.5rem 1.25rem 3.5rem; }
.band.dark { background: #000; color: #f5f5f7; }
.band.light { background: #f5f5f7; color: #1d1d1f; }
.band.soft { background: #fafafc; color: #1d1d1f; }
.band.blue { background: linear-gradient(180deg, #0b1c3f, #061026); color: #f5f5f7; }
.eyebrow { margin: 0 0 0.5rem; color: var(--muted); font-size: 1.05rem; font-weight: 600; }
.hero h1, .product h2, .story h2, .buy h2 {
  margin: 0 auto 0.65rem; max-width: 12ch;
  font-size: clamp(2.4rem, 7vw, 4.2rem); line-height: 1.05; font-weight: 620; letter-spacing: -0.03em;
  animation: fadeUp 0.8s ease both;
}
.sub, .product p, .story > p, .buy > p {
  margin: 0 auto 1.1rem; max-width: 34rem; color: inherit; opacity: 0.82;
  font-size: 1.15rem; line-height: 1.45; animation: fadeUp 0.9s ease 0.05s both;
}
.cta { display: flex; justify-content: center; gap: 1.35rem; flex-wrap: wrap; animation: fadeUp 0.95s ease 0.1s both; }
.link { color: var(--link); font-size: 1.05rem; }
.link:hover { text-decoration: underline; }
.link.dark { color: #0066cc; }
.btn {
  border-radius: 980px; padding: 0.7rem 1.25rem; font-weight: 560;
  transition: transform 0.2s ease, filter 0.2s ease;
}
.btn:hover { transform: scale(1.02); }
.btn.blue { background: var(--link); color: #fff; }
.btn.ghost { color: var(--fg); border: 1px solid var(--line); }
.btn.wide { width: min(18rem, 100%); margin-top: 0.35rem; }
.hero-glow {
  position: absolute; left: 50%; top: 42%; width: min(70vw, 40rem); height: min(50vw, 28rem);
  transform: translate(-50%, -20%);
  background: radial-gradient(circle, rgba(41,151,255,0.28), transparent 65%);
  filter: blur(8px); pointer-events: none; animation: pulse 6s ease-in-out infinite;
}
.hero-device { position: relative; margin: 2.75rem auto 0; width: min(72vw, 28rem); height: min(58vw, 22rem); }
.bezel {
  position: absolute; inset: 0; border-radius: 2rem;
  background: linear-gradient(160deg, #2c2c2e, #0b0b0c);
  border: 1px solid rgba(255,255,255,0.14);
  box-shadow: 0 40px 90px rgba(0,0,0,0.55);
  animation: fadeUp 1s ease 0.15s both;
}
.screen {
  position: absolute; inset: 6%; border-radius: 1.35rem;
  display: grid; place-items: center;
  background:
    radial-gradient(circle at 50% 0%, rgba(41,151,255,0.35), transparent 55%),
    linear-gradient(180deg, #141416, #050506);
  font-size: clamp(1.4rem, 3vw, 2rem); font-weight: 620; letter-spacing: -0.03em;
}
.slab {
  margin: 2.2rem auto 0; width: min(70vw, 42rem); height: min(36vw, 16rem);
  border-radius: 1.5rem; animation: fadeUp 0.9s ease 0.12s both;
}
.dark-slab { background: linear-gradient(160deg, #3a3a3c, #111); box-shadow: 0 30px 60px rgba(0,0,0,0.25); }
.soft-slab { background: linear-gradient(160deg, #ffffff, #d7d7dc); box-shadow: 0 24px 50px rgba(0,0,0,0.12); }
.blue-slab { background: linear-gradient(160deg, #3b82f6, #0b1c3f); box-shadow: 0 30px 60px rgba(0,20,60,0.35); }
.learn-card {
  margin: 0 auto 1.25rem !important; max-width: 36rem; padding: 0.9rem 1rem; border-radius: 1rem;
  background: rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.08); color: #1d1d1f !important; opacity: 1 !important;
}
.chip-row { display: flex; justify-content: center; gap: 0.5rem; flex-wrap: wrap; }
.chip {
  padding: 0.55rem 0.95rem; border-radius: 980px; border: 1px solid rgba(0,0,0,0.12);
  color: #1d1d1f; background: #fff;
}
.chip.on, .chip:hover { background: #1d1d1f; color: #fff; }
.buy { background: #f5f5f7; color: #1d1d1f; }
.finishes { display: flex; justify-content: center; gap: 0.65rem; flex-wrap: wrap; margin-bottom: 1rem; }
.finish {
  min-width: 5.5rem; padding: 0.85rem 1rem; border-radius: 0.95rem; font-weight: 600;
  border: 1px solid rgba(0,0,0,0.1);
}
.finish.silver { background: linear-gradient(160deg, #f3f3f5, #b9b9bf); }
.finish.black { background: #1d1d1f; color: #f5f5f7; }
.finish.gold { background: linear-gradient(160deg, #f4e0b5, #c49a4c); color: #2a210f; }
.foot {
  display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
  padding: 1.75rem 1.25rem 2.5rem; color: #6e6e73; background: #f5f5f7;
  border-top: 1px solid rgba(0,0,0,0.08); font-size: 0.85rem;
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulse {
  0%, 100% { opacity: 0.55; transform: translate(-50%, -20%) scale(1); }
  50% { opacity: 0.9; transform: translate(-50%, -22%) scale(1.04); }
}
@media (max-width: 820px) {
  .links { display: none; }
  .hero-device { height: 16rem; }
}
`;

  return {
    appJsx,
    appCss,
    indexCss: `html { scroll-behavior: smooth; }\nbody { margin: 0; background: #000; color: #f5f5f7; }\n* { box-sizing: border-box; }\n`,
  };
}

/** Premium product marketing landing — animated hero, working CTAs, scroll sections. */
function buildMarketingLandingSpa(title: string, summary: string): { appJsx: string; appCss: string; indexCss: string } {
  const brand = escapeJsx(title);
  const tag = escapeJsx(extractSubtitle(summary, 'Designed to feel effortless'));
  const appJsx = `import { useEffect, useState } from 'react';
import './App.css';

const FEATURES = [
  { id: 'craft', title: 'Crafted detail', body: 'Every surface is tuned for clarity, depth, and calm motion.' },
  { id: 'speed', title: 'Instant feel', body: 'Interactions respond in a breath so the product stays out of the way.' },
  { id: 'focus', title: 'Quiet focus', body: 'One job per section. Nothing competes with the story you came for.' },
];

export default function App() {
  const [open, setOpen] = useState(null);
  const [picked, setPicked] = useState(FEATURES[0].id);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const active = FEATURES.find((f) => f.id === picked) || FEATURES[0];

  return (
    <div className="site">
      <header className={'nav' + (scrolled ? ' nav-solid' : '')}>
        <button type="button" className="brand" onClick={() => go('top')}>
          <span className="logo" aria-hidden="true" />
          <span>${brand}</span>
        </button>
        <nav className="links">
          <button type="button" onClick={() => go('story')}>Story</button>
          <button type="button" onClick={() => go('gallery')}>Gallery</button>
          <button type="button" onClick={() => go('buy')}>Buy</button>
        </nav>
        <button type="button" className="pill" onClick={() => setOpen(open === 'bag' ? null : 'bag')}>
          Bag {open === 'bag' ? '(1)' : ''}
        </button>
      </header>

      <main id="top" className="hero">
        <p className="eyebrow">${brand}</p>
        <h1>${tag}</h1>
        <p className="lede">A welcoming first screen with motion that guides the eye, not noise that fights it.</p>
        <div className="cta-row">
          <button type="button" className="cta primary" onClick={() => go('buy')}>Buy now</button>
          <button type="button" className="cta ghost" onClick={() => { setOpen('learn'); go('story'); }}>Learn more</button>
        </div>
        <div className="hero-stage" aria-hidden="true">
          <div className="orb orb-a" />
          <div className="orb orb-b" />
          <div className="device">
            <div className="device-shine" />
            <div className="device-screen">
              <span>${brand}</span>
            </div>
          </div>
        </div>
      </main>

      {open === 'bag' && (
        <aside className="drawer" role="dialog" aria-label="Bag">
          <h2>Your bag</h2>
          <p>1x ${brand} Starter - ready when you are.</p>
          <button type="button" className="cta primary" onClick={() => setOpen(null)}>Checkout</button>
          <button type="button" className="cta ghost" onClick={() => setOpen(null)}>Keep browsing</button>
        </aside>
      )}

      <section id="story" className="panel story">
        <h2>Built around how people actually look.</h2>
        <p>Scroll stays smooth. Buttons do real work. Color and type stay confident without shouting.</p>
        {open === 'learn' && (
          <p className="learn-note">You asked to learn more - ${brand} pairs a full-bleed hero with quiet sections so the brand stays first.</p>
        )}
        <div className="feature-tabs">
          {FEATURES.map((f) => (
            <button
              key={f.id}
              type="button"
              className={'tab' + (picked === f.id ? ' on' : '')}
              onClick={() => setPicked(f.id)}
            >
              {f.title}
            </button>
          ))}
        </div>
        <article className="feature-card">
          <h3>{active.title}</h3>
          <p>{active.body}</p>
        </article>
      </section>

      <section id="gallery" className="panel gallery">
        <h2>In motion</h2>
        <div className="rail">
          {['Dawn', 'Studio', 'Night'].map((label, i) => (
            <button
              key={label}
              type="button"
              className={'shot shot-' + (i + 1)}
              onClick={() => setPicked(FEATURES[i % FEATURES.length].id)}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      <section id="buy" className="panel buy">
        <h2>Ready when you are</h2>
        <p>Pick a finish. The preview updates instantly.</p>
        <div className="swatches">
          {['Sand', 'Ink', 'Mist'].map((c) => (
            <button key={c} type="button" className={'swatch ' + c.toLowerCase()} onClick={() => setOpen('bag')}>
              {c}
            </button>
          ))}
        </div>
        <button type="button" className="cta primary wide" onClick={() => setOpen('bag')}>Add to bag</button>
      </section>

      <footer className="foot">
        <button type="button" onClick={() => go('top')}>Back to top</button>
        <span>Copyright {new Date().getFullYear()} ${brand}</span>
      </footer>
    </div>
  );
}
`;

  const appCss = `@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap');

.site {
  --bg: #0b0d10;
  --fg: #f4f1ea;
  --muted: #b7b1a6;
  --accent: #e8a87c;
  --line: rgba(244, 241, 234, 0.12);
  min-height: 100vh;
  color: var(--fg);
  background:
    radial-gradient(1200px 700px at 70% -10%, rgba(232, 168, 124, 0.22), transparent 55%),
    radial-gradient(900px 500px at 0% 20%, rgba(120, 160, 200, 0.12), transparent 50%),
    linear-gradient(180deg, #101318 0%, var(--bg) 40%, #08090b 100%);
  font-family: "Instrument Sans", system-ui, sans-serif;
}
.nav {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; gap: 1rem;
  padding: 0.85rem 1.5rem;
  transition: background 0.35s ease, backdrop-filter 0.35s ease, border-color 0.35s ease;
  border-bottom: 1px solid transparent;
}
.nav-solid {
  background: rgba(11, 13, 16, 0.72);
  backdrop-filter: blur(16px);
  border-bottom-color: var(--line);
}
.brand, .links button, .pill, .cta, .tab, .shot, .swatch, .foot button {
  font: inherit; color: inherit; background: transparent; border: 0; cursor: pointer;
}
.brand { display: inline-flex; align-items: center; gap: 0.55rem; font-weight: 600; letter-spacing: -0.02em; }
.logo {
  width: 1.15rem; height: 1.15rem; border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, #fff6, var(--accent));
  box-shadow: 0 0 0 1px rgba(255,255,255,0.15);
}
.links { display: flex; gap: 0.35rem; margin-left: auto; }
.links button, .pill {
  padding: 0.4rem 0.75rem; border-radius: 999px; color: var(--muted);
}
.links button:hover, .pill:hover { color: var(--fg); background: rgba(255,255,255,0.06); }
.pill { border: 1px solid var(--line); }
.hero {
  position: relative; overflow: hidden;
  padding: 4.5rem 1.5rem 5rem;
  max-width: 68rem; margin: 0 auto;
  text-align: center;
}
.eyebrow {
  margin: 0 0 0.75rem; text-transform: uppercase; letter-spacing: 0.18em;
  font-size: 0.72rem; color: var(--accent);
}
.hero h1 {
  margin: 0 auto 0.85rem; max-width: 14ch;
  font-family: "Newsreader", Georgia, serif;
  font-size: clamp(2.6rem, 7vw, 4.6rem);
  line-height: 1.05; letter-spacing: -0.03em; font-weight: 600;
  animation: rise 0.9s ease both;
}
.lede {
  margin: 0 auto 1.5rem; max-width: 34rem; color: var(--muted); font-size: 1.05rem; line-height: 1.55;
  animation: rise 1s ease 0.08s both;
}
.cta-row { display: flex; justify-content: center; gap: 0.65rem; flex-wrap: wrap; animation: rise 1s ease 0.14s both; }
.cta {
  border-radius: 999px; padding: 0.75rem 1.25rem; font-weight: 600;
  transition: transform 0.2s ease, background 0.2s ease, color 0.2s ease;
}
.cta:hover { transform: translateY(-1px); }
.cta.primary { background: var(--fg); color: #111; }
.cta.ghost { border: 1px solid var(--line); color: var(--fg); }
.cta.wide { width: min(20rem, 100%); }
.hero-stage {
  position: relative; margin: 3.5rem auto 0; height: min(52vw, 28rem); max-width: 44rem;
}
.orb {
  position: absolute; border-radius: 50%; filter: blur(2px);
  animation: float 7s ease-in-out infinite;
}
.orb-a { width: 42%; height: 42%; left: 8%; top: 18%; background: rgba(232,168,124,0.35); }
.orb-b { width: 34%; height: 34%; right: 10%; top: 8%; background: rgba(140,180,220,0.28); animation-delay: -2s; }
.device {
  position: absolute; inset: 12% 22% 0; border-radius: 1.6rem;
  background: linear-gradient(160deg, #2a2f38, #12151a 55%, #0a0c0f);
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 40px 80px rgba(0,0,0,0.45);
  animation: rise 1.1s ease 0.2s both;
  overflow: hidden;
}
.device-shine {
  position: absolute; inset: -20% auto auto -10%; width: 60%; height: 40%;
  background: linear-gradient(120deg, transparent, rgba(255,255,255,0.18), transparent);
  transform: rotate(18deg); animation: sheen 5s ease-in-out infinite;
}
.device-screen {
  position: absolute; inset: 8%; border-radius: 1rem;
  display: grid; place-items: center;
  background:
    radial-gradient(circle at 50% 20%, rgba(232,168,124,0.35), transparent 50%),
    linear-gradient(180deg, #1a1f27, #0d1014);
  font-family: "Newsreader", Georgia, serif; font-size: 1.6rem; letter-spacing: -0.02em;
}
.drawer {
  position: fixed; right: 1rem; top: 4.5rem; z-index: 30; width: min(20rem, calc(100vw - 2rem));
  padding: 1rem 1.1rem 1.15rem; border-radius: 1rem;
  background: rgba(18, 20, 24, 0.94); border: 1px solid var(--line);
  backdrop-filter: blur(12px);
  display: grid; gap: 0.65rem;
  animation: rise 0.25s ease both;
}
.drawer h2 { margin: 0; font-size: 1.05rem; }
.drawer p { margin: 0; color: var(--muted); font-size: 0.92rem; }
.panel { max-width: 68rem; margin: 0 auto; padding: 4rem 1.5rem; }
.panel h2 {
  margin: 0 0 0.75rem; font-family: "Newsreader", Georgia, serif;
  font-size: clamp(1.8rem, 4vw, 2.6rem); letter-spacing: -0.02em;
}
.panel > p { margin: 0 0 1.5rem; color: var(--muted); max-width: 36rem; line-height: 1.55; }
.learn-note {
  margin: 0 0 1.25rem !important; padding: 0.85rem 1rem; border-radius: 0.85rem;
  background: rgba(232,168,124,0.1); border: 1px solid rgba(232,168,124,0.25); color: var(--fg) !important;
}
.feature-tabs { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 1rem; }
.tab {
  padding: 0.55rem 0.9rem; border-radius: 999px; border: 1px solid var(--line); color: var(--muted);
}
.tab.on, .tab:hover { color: var(--fg); background: rgba(255,255,255,0.06); }
.feature-card {
  padding: 1.25rem 1.35rem; border-radius: 1.1rem; border: 1px solid var(--line);
  background: rgba(255,255,255,0.03); min-height: 7rem;
  animation: rise 0.35s ease both;
}
.feature-card h3 { margin: 0 0 0.4rem; font-size: 1.15rem; }
.feature-card p { margin: 0; color: var(--muted); line-height: 1.5; }
.rail { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.85rem; }
.shot {
  aspect-ratio: 4 / 5; border-radius: 1.2rem; border: 1px solid var(--line);
  display: flex; align-items: flex-end; padding: 1rem;
  font-weight: 600; letter-spacing: -0.02em;
  transition: transform 0.25s ease, filter 0.25s ease;
}
.shot:hover { transform: translateY(-4px) scale(1.01); }
.shot-1 { background: linear-gradient(160deg, #f0d2b0, #8a5a3a 70%); color: #1a120c; }
.shot-2 { background: linear-gradient(160deg, #d7dee8, #3d4a5c 70%); color: #0d1218; }
.shot-3 { background: linear-gradient(160deg, #2a2430, #0b0d10 70%); color: #f4f1ea; }
.swatches { display: flex; gap: 0.65rem; flex-wrap: wrap; margin-bottom: 1rem; }
.swatch {
  min-width: 5.5rem; padding: 0.85rem 1rem; border-radius: 0.9rem; border: 1px solid var(--line);
  font-weight: 600;
}
.swatch.sand { background: #e8c9a8; color: #2a1c12; }
.swatch.ink { background: #1c222c; color: #f4f1ea; }
.swatch.mist { background: #c9d3de; color: #15202b; }
.foot {
  display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
  padding: 2rem 1.5rem 2.5rem; color: var(--muted); border-top: 1px solid var(--line);
  max-width: 68rem; margin: 0 auto;
}
@keyframes rise {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-14px); }
}
@keyframes sheen {
  0%, 100% { transform: translateX(-10%) rotate(18deg); opacity: 0.35; }
  50% { transform: translateX(40%) rotate(18deg); opacity: 0.7; }
}
@media (max-width: 720px) {
  .links { display: none; }
  .rail { grid-template-columns: 1fr; }
  .hero { padding-top: 3rem; }
}
`;

  return {
    appJsx,
    appCss,
    indexCss: `html { scroll-behavior: smooth; }\nbody { margin: 0; background: #0b0d10; color: #f4f1ea; }\n* { box-sizing: border-box; }\n`,
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
          <p className="sub" style={{ marginBottom: '0.75rem' }}>Ask NOVA in chat to add pages, widgets, or data for this product.</p>
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
