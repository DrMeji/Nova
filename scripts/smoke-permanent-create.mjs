/**
 * Permanent create/chat ownership smoke checks.
 * npx tsx --tsconfig tsconfig.app.json scripts/smoke-permanent-create.mjs
 */
import assert from 'assert';
import {
  scrubTalkFirstCodeBleed,
  collapseDuplicateSentences,
} from '../src/lib/plainChatAsk.ts';
import {
  briefLooksLikeAppleStyleHomepage,
  briefLooksLikeMarketingLanding,
  previewReadyForBrief,
} from '../src/lib/createBuildQuality.ts';
import { looksLikeSpatialApp } from '../src/lib/freshSpaFromBrief.ts';
import {
  isCreateCraftReadablePath,
  isCreateCraftWritablePath,
} from '../src/lib/createCraftPolicy.ts';
import { createPhaseStatusLabel } from '../src/lib/createStatus.ts';
import { resolveCreateEnsembleTeam, ensembleMember } from '../src/lib/createEnsemble.ts';

// --- Talk scrub: CSS dump + duplicate lead-ins ---
{
  const raw = [
    'Sure, we can build a homepage like apple.com.',
    "Here's a basic structure for the homepage: Here's a basic structure for the homepage:",
    '.nav-links li { margin-left: 1rem; }',
    '.hero h1 { margin-bottom: 1rem; }',
  ].join('\n');
  const scrubbed = scrubTalkFirstCodeBleed(raw);
  assert.ok(!/\.nav-links|margin-left|\{/.test(scrubbed), `CSS must scrub: ${scrubbed}`);
  assert.ok(!/Here's a basic structure for the homepage:\s*Here's/i.test(scrubbed), `dup lead-in: ${scrubbed}`);
  console.log('ok talk scrub');
}

{
  const dup = collapseDuplicateSentences("Here's the basic HTML structure: Here's the basic HTML structure:");
  assert.ok((dup.match(/Here's the basic HTML structure:/gi) || []).length <= 1, dup);
  console.log('ok collapse dup');
}

// --- Apple Ready: not spatial, not orb premium ---
{
  const brief =
    'ok start building Apple now — exact apple.com-style product homepage with Mac iPad Watch AirPods full-bleed bands, thin nav, and premium typography. First viewport: brand-scale headline.';
  assert.strictEqual(looksLikeSpatialApp(brief), false, 'viewport must not trip spatial');
  assert.strictEqual(briefLooksLikeAppleStyleHomepage(brief), true);
  assert.strictEqual(briefLooksLikeMarketingLanding(brief), true);
  console.log('ok apple heuristics');
}

{
  const files = {
    'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="site">
      <nav className="nav"><a href="#mac">Mac</a><a href="#ipad">iPad</a><a href="#watch">Watch</a><a href="#airpods">AirPods</a></nav>
      <section className="hero"><h1>Apple</h1><p>Built for what matters.</p><button>Learn more</button></section>
      <section className="band"><h2>Band 1</h2><p>Explore.</p></section>
      <section className="band"><h2>Band 2</h2><p>Explore.</p></section>
      <section className="band"><h2>Band 3</h2><p>Explore.</p></section>
      <footer className="foot"><a href="#top">Support</a></footer>
    </div>
  );
}`,
    'src/App.css': `:root{--ink:#111}.site{min-height:100vh}.nav{display:flex;gap:1rem}.hero{min-height:70vh;background:#000;color:#fff}.band{padding:4rem 1rem}.foot{padding:2rem}`,
    'package.json': '{"name":"apple","dependencies":{"react":"18"},"devDependencies":{"vite":"5"}}',
    'index.html': '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
    'src/main.jsx': 'import App from "./App.jsx"',
  };
  files['src/App.jsx'] = files['src/App.jsx'] + '\n/* ' + 'x'.repeat(800) + ' */\n';
  const gate = previewReadyForBrief(files, {
    productName: 'Apple',
    brief: 'apple.com-style product homepage Mac iPad Watch AirPods full-bleed premium typography',
  });
  assert.ok(
    gate.reasons.some((r) => /missing product bands/i.test(r)),
    `nav-only Mac/iPad must fail Ready: ${gate.reasons.join('; ')}`,
  );
  console.log('ok apple ready rejects nav-only bands');
}

{
  const files = {
    'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="site">
      <nav className="nav"><a href="#mac">Mac</a><a href="#ipad">iPad</a></nav>
      <section className="hero"><h1>Apple</h1><p>Built for what matters.</p><button>Learn more</button></section>
      <section className="band"><h2>Mac</h2><p>Power.</p></section>
      <section className="band"><h2>iPad</h2><p>Canvas.</p></section>
      <section className="band"><h2>Watch</h2><p>Time.</p></section>
      <section className="band"><h2>AirPods</h2><p>Sound.</p></section>
      <footer className="foot"><a href="#top">Support</a></footer>
    </div>
  );
}`.repeat(1),
    'src/App.css': `:root{--ink:#111}.site{min-height:100vh}.nav{display:flex;gap:1rem}.hero{min-height:70vh;background:#000;color:#fff}.band{padding:4rem 1rem}.foot{padding:2rem}`,
    'package.json': '{"name":"apple","dependencies":{"react":"18"},"devDependencies":{"vite":"5"}}',
    'index.html': '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
    'src/main.jsx': 'import App from "./App.jsx"',
  };
  // Pad app to clear thin gates
  files['src/App.jsx'] = files['src/App.jsx'] + '\n/* ' + 'x'.repeat(800) + ' */\n';
  const gate = previewReadyForBrief(files, {
    productName: 'Apple',
    brief: 'apple.com-style product homepage Mac iPad Watch AirPods full-bleed premium typography',
  });
  assert.ok(!gate.reasons.some((r) => /orb|atmospheric light/i.test(r)), gate.reasons.join('; '));
  console.log('ok apple ready no-orb', gate.ok, gate.reasons.slice(0, 3));
}

// --- Create craft tool allowlist ---
{
  assert.strictEqual(isCreateCraftReadablePath('.gitignore'), false);
  assert.strictEqual(isCreateCraftReadablePath('package-lock.json'), false);
  assert.strictEqual(isCreateCraftReadablePath('src/App.jsx'), true);
  assert.strictEqual(isCreateCraftWritablePath('src/App.css'), true);
  assert.strictEqual(isCreateCraftWritablePath('.gitignore'), false);
  console.log('ok craft allowlist');
}

// --- Verify uses craft coder ---
{
  const models = [
    { id: 'qwen25-7b', name: 'Qwen2.5 7B Instruct', status: 'ready' },
    { id: 'qwen25-coder-14b', name: 'Qwen2.5-Coder 14B', status: 'ready' },
    { id: 'uigen-fx-4b', name: 'UIGEN-FX 4B', status: 'ready' },
  ];
  const team = resolveCreateEnsembleTeam(models, {
    ramGb: 32,
    maxCoderParamsB: 14,
    craftId: 'qwen25-coder-14b',
  });
  assert.strictEqual(ensembleMember(team, 'craft')?.id, 'qwen25-coder-14b');
  assert.strictEqual(ensembleMember(team, 'verify')?.id, 'qwen25-coder-14b');
  assert.ok(/Copy/.test(createPhaseStatusLabel('copy', 'Qwen2.5 7B Instruct')));
  assert.ok(/Craft/.test(createPhaseStatusLabel('craft', 'Qwen2.5-Coder 14B')));
  console.log('ok ensemble verify=coder');
}

// --- Apple floor: generic Band 1 shell → Mac/iPad/Watch/AirPods ---
{
  const { realizeBriefUi } = await import('../src/lib/createRealize.ts');
  const stub = {
    'src/App.tsx': `import './App.css';
export default function App() {
  return (
    <div className="app">
      <nav className="nav"><div>Apple</div></nav>
      <section className="hero"><h1>Apple</h1></section>
      <section className="band"><h2>Band 1</h2></section>
      <section className="band"><h2>Band 2</h2></section>
      <section className="band"><h2>Band 3</h2></section>
    </div>
  );
}
`,
    'src/App.css': '.app{min-height:100vh}.hero{min-height:70vh}.band{padding:3rem}',
    'public/heroes/apple-hero.svg': '<svg/>',
  };
  const out = realizeBriefUi(
    stub,
    'Apple',
    'apple.com-style product homepage Mac iPad Watch AirPods full-bleed bands',
  );
  assert.ok(out.changed, 'must floor Band-N stub');
  assert.ok(/\bMac\b/.test(out.files['src/App.tsx'] || ''), 'must name Mac');
  assert.ok(/\biPad\b/.test(out.files['src/App.tsx'] || ''), 'must name iPad');
  assert.ok(/\bWatch\b/.test(out.files['src/App.tsx'] || ''), 'must name Watch');
  assert.ok(/\bAirPods\b/.test(out.files['src/App.tsx'] || ''), 'must name AirPods');
  assert.ok(!/\bBand\s*[123]\b/i.test(out.files['src/App.tsx'] || ''), 'no Band N labels');
  assert.ok(!/\bBuilt for general users\b/i.test(out.files['src/App.tsx'] || ''), 'no general users');
  assert.ok(!/cy="210"|home.?button/i.test(out.files['src/App.tsx'] || ''), 'no toy tablet home button');
  console.log('ok apple floor from Band-N stub');
}

// --- Arcade: "Not a landing page" must not trigger hero slots; stub → breakout floor ---
{
  const { planBrandAssets } = await import('../src/lib/brandAssets.ts');
  const brief =
    'ok start building Sparkbug now — a tiny playable browser arcade game on disk. One canvas, keyboard left/right to move a paddle, bounce a ball, break bricks, score HUD, restart button. Not a website landing page.';
  const plan = planBrandAssets(brief, 'Sparkbug');
  assert.ok(!plan.slots.some((s) => s.role === 'hero'), `game must skip heroes: ${plan.slots.map((s) => s.role + ':' + s.id)}`);
  console.log('ok game skips hero assets');
}

{
  const { realizeBriefUi } = await import('../src/lib/createRealize.ts');
  const stub = {
    'src/App.tsx': `import './App.css';
export default function App() {
  return (
    <div className="app">
      <h1 className="title">Sparkbug</h1>
    </div>
  );
}
`,
    'src/App.css': '.app{min-height:100vh}',
    'package.json': '{"name":"sparkbug","dependencies":{"react":"18"},"devDependencies":{"vite":"5"}}',
    'index.html': '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
    'src/main.tsx': 'import App from "./App.tsx"',
  };
  const brief =
    'tiny playable browser arcade game. canvas paddle bounce ball break bricks score HUD restart. Not a website landing page.';
  const out = realizeBriefUi(stub, 'Sparkbug', brief);
  assert.ok(out.changed, 'must floor title stub to game');
  const app = out.files['src/App.tsx'] || '';
  assert.ok(/<canvas\b/i.test(app), 'must have canvas');
  assert.ok(/requestAnimationFrame/i.test(app), 'must have RAF');
  assert.ok(/keydown|ArrowLeft|KeyA/i.test(app), 'must have keys');
  assert.ok(/paddle|brick/i.test(app), 'must be breakout-style');
  const gate = previewReadyForBrief(out.files, { productName: 'Sparkbug', brief });
  assert.ok(gate.ok, `arcade Ready: ${gate.reasons.join('; ')}`);
  console.log('ok arcade breakout floor + Ready');
}

{
  const { genreFloor, defaultCopyPack, buildProductSpec } = await import('../src/lib/createLayoutContract.ts');
  const spec = buildProductSpec({
    brief: 'apple.com-style product homepage Mac iPad Watch AirPods full-bleed',
    productName: 'Northfield',
  });
  const floor = genreFloor(spec.genre);
  assert.ok(floor.sections.some((s) => s.id === 'mac'), `sections ${floor.sections.map((s) => s.id)}`);
  assert.ok(!floor.sections.some((s) => /^band-\d+$/i.test(s.id)), 'no band-N section ids');
  const copy = defaultCopyPack(spec, floor);
  assert.ok(!/general users/i.test(copy.support), copy.support);
  assert.ok(copy.sections.mac?.title === 'Mac', JSON.stringify(copy.sections.mac));
  console.log('ok apple contract sections + copy');
}

console.log('smoke-permanent-create passed');
