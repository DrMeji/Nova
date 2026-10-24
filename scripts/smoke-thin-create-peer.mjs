/**
 * B — Thin create peer bar (Bolt/Lovable/Cursor create path).
 * Order: hard-go→brief→disk→scaffold→floor→npm→craft→heal→syntax→live→prove→ready
 * Floors never unlock quality Ready. Static ≠ Live. Understand must-haves in craft rules.
 */
import assert from 'node:assert/strict';
import {
  THIN_CREATE,
  THIN_CREATE_STAGES,
  isThinCreatePath,
  formatThinCreateCraftRules,
  formatThinCreateStageProgress,
  formatThinCreateSpineStatus,
  thinCraftMayContinue,
  seedCompositionalSectionScaffolds,
} from '../src/lib/createThinPath.ts';
import { buildScaffoldFiles } from '../src/lib/projectScaffolds.ts';
import { runCreateSyntaxGate } from '../src/lib/createSyntaxGate.ts';
import { judgeCreateVerified } from '../src/lib/createPassSpine.ts';
import { emptyCreateEvidence, finalizeCreateEvidence } from '../src/lib/createEvidence.ts';
import { composeInventDemoSite } from '../src/lib/createInventDemo.ts';
import { understandCreateBrief } from '../src/lib/codingCreatePipeline.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n=== B Thin create · peer rescan ===');

check('THIN_CREATE on', THIN_CREATE === true);
check('isThinCreatePath()', isThinCreatePath() === true);
check('12 thin stages', THIN_CREATE_STAGES.length === 12, String(THIN_CREATE_STAGES.length));
check('stages start hard-go end ready', THIN_CREATE_STAGES[0] === 'hard-go' && THIN_CREATE_STAGES.at(-1) === 'ready');
check('npm before craft', THIN_CREATE_STAGES.indexOf('npm') < THIN_CREATE_STAGES.indexOf('craft'));
check('floor before npm', THIN_CREATE_STAGES.indexOf('floor') < THIN_CREATE_STAGES.indexOf('npm'));
check(
  'stage progress string',
  /Thin create · 7\/12 craft/.test(formatThinCreateStageProgress('craft')),
  formatThinCreateStageProgress('craft'),
);
check(
  'spine status labels',
  /Create · invent floor/.test(formatThinCreateSpineStatus('floor')),
  formatThinCreateSpineStatus('floor'),
);

// Scaffold bare
const scaffold = buildScaffoldFiles('vite-react', { name: 'Paper Shelf' });
const map = Object.fromEntries(scaffold.map((f) => [f.path, f.content]));
check('scaffold has package.json + App.jsx + main', Boolean(map['package.json'] && map['src/App.jsx'] && map['src/main.jsx']));
check('scaffold App bare (no twin)', map['src/App.jsx'].length < 400 && !/todo|Gyuto|data-nova-invent/i.test(map['src/App.jsx']));

// Craft rules include understand contract
const PAPER =
  'Create Paper Shelf on disk now. Soft paper background, deep ink navy type, warm brass accent. Full-bleed quiet hero, grid of 4 book cards (title + author). Polished single page. Skip Plan — build it.';
const rules = formatThinCreateCraftRules({ brief: PAPER, productName: 'Paper Shelf' }).join('\n');
const plan = understandCreateBrief({ brief: PAPER, brand: 'Paper Shelf' });
check('craft rules THIN CREATE', /THIN CREATE/i.test(rules));
check('craft rules stage progress', /Thin create · .* craft/i.test(rules));
check('craft rules GOAL or MUST-HAVES', /GOAL:|MUST-HAVES/i.test(rules));
check('craft rules paper/brass/navy or book', /paper|brass|navy|book/i.test(rules));
check('craft rules out of scope or todo fence', /OUT OF SCOPE|todo/i.test(rules));
check('craft rules Done checks', /DONE CHECKS/i.test(rules));
check('craft bans floor paste', /floor paste|never a tip\/todo/i.test(rules));
check('understand mustHave length ≥ 5', plan.mustHave.length >= 5, String(plan.mustHave.length));

// Syntax before continue
const broken = { 'src/App.jsx': 'export default function App(){ return (<div>', 'src/App.css': '.app{}' };
const synBroken = runCreateSyntaxGate(broken);
check('broken App fails syntax gate', synBroken.ok === false);

const goodApp = {
  'src/App.jsx': `import './App.css';

export default function App() {
  return (
    <div className="app" id="root-app">
      <header className="hero">
        <h1>Paper Shelf</h1>
        <p className="lede">A quiet reading shelf for titles worth keeping.</p>
      </header>
      <main className="shelf">
        <article className="book-card"><h2>Stilness</h2><p>Ada Wren</p></article>
        <article className="book-card"><h2>Margin Notes</h2><p>Leo Hart</p></article>
        <article className="book-card"><h2>Paper Hours</h2><p>Mira Cole</p></article>
        <article className="book-card"><h2>Shelf Light</h2><p>Jon Vale</p></article>
      </main>
    </div>
  );
}
`,
  'src/App.css': `.app{min-height:100vh;background:#f7f4ef;color:#1a2744}.hero{padding:3rem}.shelf{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;padding:2rem}`,
};
const synOk = runCreateSyntaxGate(goodApp);
check('complete App passes syntax', synOk.ok === true, (synOk.reasons || []).join(','));
check(
  'thinCraftMayContinue when syntax ok',
  thinCraftMayContinue(synOk.files || goodApp, synOk.ok === true) === true,
);

// Floor cannot unlock quality Ready
const ev = finalizeCreateEvidence(emptyCreateEvidence({
  npmInstalled: true,
  liveUrl: 'http://127.0.0.1:5173',
  httpOk: true,
  mounted: true,
  consoleClean: true,
  smokeOk: true,
  staticReady: true,
}));
const withFloor = judgeCreateVerified({
  evidence: ev,
  brief: PAPER,
  productName: 'Paper Shelf',
  files: goodApp,
  floorFallback: true,
});
check('floorFallback blocks qualityReady', withFloor.qualityReady === false, (withFloor.reasons || []).join(','));

const inventDemo = composeInventDemoSite({ brand: 'X', brief: 'knife' });
check('invent-demo empty (no floor rescue)', Object.keys(inventDemo.files || {}).length === 0);

// Section scaffolds must not stamp twin content (no-op / no twin)
const seeded = seedCompositionalSectionScaffolds(
  { 'src/App.jsx': map['src/App.jsx'] },
  PAPER,
  'Paper Shelf',
);
const seededApp = String(seeded['src/App.jsx'] || map['src/App.jsx']);
check('section scaffold does not invent twin chrome', !/todo|Gyuto|spk-bay|Quiet textiles/i.test(seededApp));

if (failed) {
  console.error(`\nB thin-create peer: ${failed} failed — stay on Thin create`);
  process.exit(1);
}
console.log('\nB thin-create peer: all checks passed');
