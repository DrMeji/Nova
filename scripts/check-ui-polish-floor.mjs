/**
 * Smoke: thin product shells must clear Preview Ready via heal/floor (app-wide).
 *   npx tsx --tsconfig tsconfig.app.json scripts/check-ui-polish-floor.mjs
 */
import assert from 'assert';
import {
  isThinProductMarketingShell,
  healProductMarketingStructure,
  healNearReadyCreateUi,
  buildBriefInteractiveFloor,
  previewReadyForBrief,
  hasPhoneColumnShell,
} from '../src/lib/createBuildQuality.ts';
import { lintOriginalCreateQuality } from '../src/lib/createDesignSystem.ts';
import { askLooksLikeMarketingOrProductHomepage } from '../src/lib/webProjectCanon.ts';

function thinFixture(brand, briefExtra = '') {
  const slug = brand.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const brief = `Build a brand-new one-page Vite + React website for ${brand}. ${briefExtra} Sticky nav, full-bleed hero, footer. Get it Live.`;
  const files = {
    'src/App.tsx': `import './App.css';
const COVER_HREFS = ['/heroes/${slug}-hero.jpg'];
export default function App() {
  return (
    <div className="app">
      <header className="sticky-nav"><span>${brand}</span></header>
      <h1 className="title">${brand}</h1>
    </div>
  );
}
`,
    'src/App.css': `.app {
  min-height: 100vh;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f1419;
}
.title { font-size: 2rem; }
`,
    [`public/heroes/${slug}-hero.jpg`]: 'x',
    'package.json': '{"name":"x","dependencies":{"react":"^18.0.0","react-dom":"^18.0.0"}}',
    'index.html': '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
    'src/main.tsx': 'import {createRoot} from "react-dom/client"; import App from "./App"; createRoot(document.getElementById("root")).render(<App/>);',
  };
  return { brand, brief, files };
}

const cases = [
  thinFixture('Sahara Honey Dates', 'Premium dried-dates fruit brand Medjool Deglet Noor varieties shop.'),
  thinFixture('Maskline Viper X', 'Gaming mouse product homepage DPI polling charcoal acid-lime.'),
  thinFixture('Harbor Loom Shop', 'Specialty shop landing featured pieces story visit hours.'),
];

let failed = 0;
for (const c of cases) {
  assert.equal(askLooksLikeMarketingOrProductHomepage(c.brief), true, `${c.brand}: marketing ask`);
  assert.equal(hasPhoneColumnShell(c.files['src/App.css'], c.files['src/App.tsx']), true, `${c.brand}: phone`);
  assert.equal(isThinProductMarketingShell(c.files, c.brief), true, `${c.brand}: thin shell`);

  const before = lintOriginalCreateQuality(c.files, { brief: c.brief, productName: c.brand });
  assert.equal(before.ok, false, `${c.brand}: lint should fail before heal`);

  let files = c.files;
  const near = healNearReadyCreateUi(files, c.brand, c.brief);
  files = near.files;
  let lint = lintOriginalCreateQuality(files, { brief: c.brief, productName: c.brand });
  let ready = previewReadyForBrief(files, { brief: c.brief, productName: c.brand });

  if (!lint.ok || !ready.ok) {
    const struct = healProductMarketingStructure(files, c.brand, c.brief);
    files = struct.files;
    lint = lintOriginalCreateQuality(files, { brief: c.brief, productName: c.brand });
    ready = previewReadyForBrief(files, { brief: c.brief, productName: c.brand });
  }

  if (!lint.ok || !ready.ok) {
    const floor = buildBriefInteractiveFloor(c.brand, c.brief);
    const appKey = files['src/App.tsx'] ? 'src/App.tsx' : 'src/App.jsx';
    files = { ...files, [appKey]: floor.app, 'src/App.css': floor.css };
    // Must never ship booking Core/Day/Reserve for food/shop/hardware product briefs.
    assert.equal(
      /Core["']|Day["']|Reserve["']|ready when you are|Browse what is open/i.test(floor.app),
      false,
      `${c.brand}: must not be booking stub floor`,
    );
    assert.equal(
      /hero-photo|className=["']site["']|full-bleed/i.test(floor.app),
      true,
      `${c.brand}: must be shop/marketing floor`,
    );
    lint = lintOriginalCreateQuality(files, { brief: c.brief, productName: c.brand });
    ready = previewReadyForBrief(files, { brief: c.brief, productName: c.brand });
  }

  const phoneGone = !hasPhoneColumnShell(files['src/App.css'] || '', files['src/App.tsx'] || files['src/App.jsx'] || '');
  const hasFoot = /<footer\b|className=["'][^"']*\bfoot/i.test(files['src/App.tsx'] || files['src/App.jsx'] || '');
  // Originality must clear — that is the UI polish fail class we fix permanently.
  const ok = phoneGone && hasFoot && lint.ok;
  if (!ok) {
    failed += 1;
    console.error('FAIL', c.brand, { lint, ready, phoneGone, hasFoot });
  } else {
    console.log('OK', c.brand, { lintOk: lint.ok, readyOk: ready.ok, phoneGone, hasFoot });
  }
}

// Direct floor shape proof (even when heal alone clears Ready).
{
  const datesFloor = buildBriefInteractiveFloor(
    'Sahara Honey Dates',
    'Premium dried-dates fruit brand Medjool Deglet Noor varieties shop website.',
  );
  assert.equal(/ready when you are|Browse what is open|Core["']/i.test(datesFloor.app), false, 'dates floor not booking');
  assert.equal(/Varieties|Shop varieties|hero-photo/i.test(datesFloor.app), true, 'dates floor is food shop');
}

// Surgical must refuse marketing
assert.equal(askLooksLikeMarketingOrProductHomepage('Build a gaming mouse website with sticky nav and hero'), true);
assert.equal(askLooksLikeMarketingOrProductHomepage('rename the centered word to Hello'), false);

if (failed) {
  console.error(`\n${failed}/${cases.length} failed`);
  process.exit(1);
}
console.log(`\nPASS  ui-polish floor · ${cases.length} briefs`);
process.exit(0);
