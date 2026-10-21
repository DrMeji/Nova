/**
 * Product create system-wide: understand → info map → Normal Accept.
 * Reject frozen twin; seed must clear Normal (not Basic stub Ready).
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-product-ladder.mjs
 */
import assert from 'node:assert/strict';
import {
  briefWantsProductLadder,
  runProductCreateLadder,
  appLooksLikeCannedProductTwin,
  appLooksLikeWrongGenreForProductBrief,
  appLooksLikeDeskSpineTemplate,
  materializeProductSpineFiles,
  formatProductCraftFailHelp,
  parseProductBriefSlots,
  buildProductInfoMap,
  gradeProductQuality,
  productMeetsQualityLock,
  formatProductQualityReport,
  pickProductComposeRecipe,
  brandShellClass,
  appLooksLikeProductSeedFloor,
  appLooksLikeRenamedSeedTwin,
  liftProductSeedPastFloor,
  PRODUCT_INVENT_FIRST_TOKEN_MS,
  PRODUCT_INVENT_IDLE_MS,
  PRODUCT_INVENT_ATTEMPT_WALL_MS,
  PRODUCT_INVENT_TOTAL_WALL_MS,
} from '@/lib/createProductLadder';
import { finalizeWebEdits } from '@/lib/webProjectCanon';
import { brandLogoSvgFor } from '@/lib/brandAssets';

const blank = {
  'src/App.jsx': `import './App.css'\nexport default function App() {\n  return <div className="app"><h1>Hello</h1></div>\n}\n`,
  'src/App.css': `.app { min-height: 100vh; background: #fff; }\n`,
  'src/index.css': `html, body, #root { margin: 0; min-height: 100%; }\n`,
  'index.html': `<!doctype html><html><body><div id="root"></div></body></html>\n`,
};

const createBrief = [
  'Create a new website project called RaidDesk xy9k on disk now.',
  'Brand-new project — do not edit any open folder.',
  'Product landing page for a premium gaming desk brand (not SaaS, not dashboard, not auth shell).',
  'Deep charcoal canvas, electric cyan accent.',
  'Full-bleed hero: brand name "RaidDesk xy9k" large, line "Built for all-night raids.", button "Shop the desk".',
  'Feature strip: Cable Chaos Solved, RGB Edge Glow, Height Memory. Footer free shipping + email.',
].join(' ');

assert.equal(briefWantsProductLadder(createBrief), true, 'wants product ladder');
assert.equal(briefWantsProductLadder('Build a full landing page: hero, logos, features, pricing, FAQ.'), false);

const surgical = finalizeWebEdits(blank, createBrief, [], { projectName: 'RaidDesk' });
const surgApp = surgical.find((e) => /App\.(jsx|tsx)$/i.test(e.path))?.content || '';
assert.ok(!/className=["'][^"']*\bapp\s+product\b/i.test(surgApp), 'no product twin paste on create');

// Human phrasing must also skip the canned twin (RidgeDesk live miss).
const humanBrief = [
  'hey — can you make me a new website for a gaming desk brand called RidgeDesk?',
  'just a landing page, dark vibe, with a shop button and a few features.',
  'new project on disk please, not editing whatever i have open.',
].join(' ');
assert.equal(briefWantsProductLadder(humanBrief), true, 'human brief wants product ladder');
const humanSurg = finalizeWebEdits(blank, humanBrief, [], { projectName: 'RidgeDesk' });
const humanApp = humanSurg.find((e) => /App\.(jsx|tsx)$/i.test(e.path))?.content || '';
assert.ok(!/className=["'][^"']*\bapp\s+product\b/i.test(humanApp), 'no twin on human make-me create');
assert.ok(!/you@raid\.mail/i.test(humanApp), 'no you@raid.mail on human create');

const todoApp = `export default function App() {
  return (
    <div className="app">
      <form className="todo-form"><input placeholder="New todo" /><button type="submit">Add</button></form>
      <ul className="todo-list"><li>iPhone</li><li>Mac</li><li>AirPods</li></ul>
    </div>
  );
}`;
assert.equal(appLooksLikeWrongGenreForProductBrief(todoApp, createBrief), true, 'todo/Apple is wrong genre');

const logo = brandLogoSvgFor({ productName: 'RaidDesk', brief: createBrief, css: 'background:#0b0f14' });
assert.ok(logo.length > 40, 'desk logo svg');
assert.ok(!/M9\.937 15\.5/i.test(logo), 'not sparkles');
assert.ok(!/M9 18V5l12-2v13/i.test(logo), 'not music note');
assert.ok(/viewBox="0 0 64 64"[\s\S]*width="48" height="8"/i.test(logo), 'desk mark not gamepad');

// Frozen twin fingerprints must still fail.
const frozenTwin = `export default function App() {
  return (
    <div className="app desk-6240f0">
      <section className="hero" aria-label="Hero"><h1>PulseDesk</h1><button type="button" className="cta">Shop the desk</button></section>
      <section className="features" aria-label="Features">
        <article className="card"><h3>Cable Chaos Solved</h3><p>Tray routes keep power bricks off the floor (6240f0).</p></article>
        <article className="card"><h3>RGB Edge Glow</h3><p>Edge light stays dim enough for focus (6240f0).</p></article>
        <article className="card"><h3>Height Memory</h3><p>Two height presets: sit deep, stand clear (6240f0).</p></article>
      </section>
      <footer className="foot"><p>Free shipping on every desk.</p>
        <form className="mail"><label>Drop alerts<input placeholder="you@desk.mail" /></label><button type="submit">Notify me</button></form>
      </footer>
    </div>
  );
}`;
assert.equal(appLooksLikeDeskSpineTemplate(frozenTwin), true, 'frozen twin detected');

const spine = materializeProductSpineFiles(createBrief, 'RaidDesk', 'ab12cd');
const slots = parseProductBriefSlots(createBrief, 'RaidDesk', 'ab12cd');
assert.equal(slots.brand, 'RaidDesk');
assert.ok(/RaidDesk/i.test(spine['src/App.jsx']));
assert.ok(!appLooksLikeDeskSpineTemplate(spine['src/App.jsx']), 'rotated brand shell is not frozen twin');
assert.ok(!/Tray routes keep power bricks off the floor\s*\(/i.test(spine['src/App.jsx']), 'no salt-in-blurb');
assert.ok(!/you@desk\.mail/i.test(spine['src/App.jsx']), 'no you@desk.mail twin');
assert.ok(spine['src/App.jsx'].includes(brandShellClass('RaidDesk', slots.recipe, 'ab12cd').slice(0, 8)), 'brand shell class');

const recipes = new Set([
  pickProductComposeRecipe('RaidDesk', 'a1'),
  pickProductComposeRecipe('RaidDesk', 'b2'),
  pickProductComposeRecipe('PulseDesk', 'c3'),
  pickProductComposeRecipe('ForgeDesk', 'd4'),
]);
assert.ok(recipes.size >= 2, 'recipes rotate');

const withLogo = { ...blank, ...spine, 'public/logo.svg': logo };
assert.ok(appLooksLikeProductSeedFloor(spine['src/App.jsx']), 'spine is seed floor');
const seedGrade = gradeProductQuality(withLogo, createBrief, 'RaidDesk');
assert.equal(seedGrade.okNormal, true, `seed Normal: ${seedGrade.reasons.join(',')}`);
assert.equal(seedGrade.okQuality, false, 'seed alone is never Quality/Ready');
assert.ok(seedGrade.checks.notSeedFloor === false, 'seed fails notSeedFloor');

// Invented page: same info map, but left seed class markers behind.
const inventedApp = String(spine['src/App.jsx'] || '')
  .replace(/hero-stage/g, 'hero-frame')
  .replace(/hero-overlay/g, 'hero-copy')
  .replace(/Built to feel finished/g, 'Materials that hold up');
const invented = {
  ...withLogo,
  'src/App.jsx': inventedApp,
};
assert.ok(!appLooksLikeProductSeedFloor(inventedApp), 'invent left seed floor');
const inventGrade = gradeProductQuality(invented, createBrief, 'RaidDesk');
assert.equal(inventGrade.okQuality, true, `invent Quality: ${inventGrade.reasons.join(',')}`);

const res = await runProductCreateLadder({
  brief: createBrief,
  productName: 'RaidDesk',
  files: invented,
  host: { pushStatus: () => {} },
  allowSpineMaterialize: false,
  salt: 'ab12cd',
});
assert.equal(res.ok, true, `recipe verify: ${res.reason || ''}`);

const fromTodo = await runProductCreateLadder({
  brief: createBrief,
  productName: 'RaidDesk',
  files: { ...blank, 'src/App.jsx': todoApp, 'public/logo.svg': logo },
  host: { pushStatus: () => {} },
  allowSpineMaterialize: true,
  salt: 'zz99aa',
});
// Spine recoveries land Normal floor — Quality Accept needs invent (not seed Ready).
assert.equal(fromTodo.usedSpine, true, 'used seed once');
assert.ok(!/nova-todos|New todo/i.test(fromTodo.files['src/App.jsx'] || ''));
assert.ok(!appLooksLikeDeskSpineTemplate(fromTodo.files['src/App.jsx'] || ''), 'not frozen twin');
assert.equal(fromTodo.ok, false, 'seed recovery alone is not Ready');
assert.equal(fromTodo.failedBeat, 'quality', `failedBeat=${fromTodo.failedBeat}`);

const help = formatProductCraftFailHelp({
  brand: 'RaidDesk',
  brief: createBrief,
  reasons: ['Invent never left the desk seed template', 'failed beat: not-template'],
  failedBeat: 'not-template',
});
assert.ok(help.pastePrompts[0].includes('RaidDesk'), 'paste prompt has brand');

// System-wide: a different brand brief must understand its own info map (not copy prior projects).
const oakBrief = [
  'Create a new website project called OakRail q7m2 on disk now.',
  'Product landing page for a premium standing desk brand (not SaaS, not dashboard, not auth shell).',
  'Deep charcoal canvas, electric cyan accent.',
  'Full-bleed hero: brand name "OakRail q7m2" large, line "Stand taller through ranked nights.", button "Shop the desk".',
  'Feature strip: Quiet Lift, Cable Nest, Focus Glow. Free shipping + 5-year warranty.',
].join(' ');
assert.equal(briefWantsProductLadder(oakBrief), true, 'oak wants product ladder');
const oakMap = buildProductInfoMap(oakBrief, 'OakRail');
assert.equal(oakMap.brand, 'OakRail');
assert.equal(oakMap.productNoun, 'desk');
assert.match(oakMap.heroLine, /Stand taller|Built for/i);
assert.ok(oakMap.whoFor.length > 20, 'whoFor filled');
assert.equal(oakMap.features.length, 3);
assert.ok(oakMap.features.some((f) => /Quiet Lift/i.test(f.title)), 'brief features win');
assert.ok(oakMap.trust.some((t) => /shipping|warranty/i.test(t)), 'trust from brief');

const oakSpine = materializeProductSpineFiles(oakBrief, 'OakRail', 'q7m2zz');
const oakLogo = brandLogoSvgFor({ productName: 'OakRail', brief: oakBrief, css: 'background:#0b0f14' });
const oakFiles = { ...blank, ...oakSpine, 'public/logo.svg': oakLogo };
const oakGrade = gradeProductQuality(oakFiles, oakBrief, 'OakRail');
assert.equal(oakGrade.okNormal, true, `OakRail Normal: ${oakGrade.reasons.join(',')}`);
assert.equal(oakGrade.okQuality, false, 'OakRail seed is Normal floor only');
assert.ok(!productMeetsQualityLock(oakFiles, oakBrief, 'OakRail'), 'seed not Quality lock');
assert.ok(appLooksLikeProductSeedFloor(oakSpine['src/App.jsx']), 'oak seed floor');
assert.ok(/Who it is for/i.test(oakSpine['src/App.jsx']), 'who band written');
assert.ok(/How it works/i.test(oakSpine['src/App.jsx']), 'how-it-works written');
assert.ok(/product-presence/i.test(oakSpine['src/App.jsx']), 'product presence written');
assert.ok(/hero-overlay|hero-stage/i.test(oakSpine['src/App.jsx']), 'full-bleed hero overlay');
assert.ok(/Built to feel finished|aria-label="Materials"/i.test(oakSpine['src/App.jsx']), 'materials band');
assert.ok(/\/heroes\/desk\.svg/i.test(oakSpine['src/App.jsx']), 'hero desk image referenced');
assert.ok((oakSpine['public/heroes/desk.svg'] || '').length > 200, 'desk hero svg shipped');
assert.ok((oakSpine['public/logo.svg'] || '').length > 40, 'spine ships desk logo');
assert.ok(/Why buy with confidence|trust/i.test(oakSpine['src/App.jsx']), 'trust band written');
assert.ok(!/ForgeRail|RaidDesk|PulseDesk/i.test(oakSpine['src/App.jsx']), 'no prior brand paste');
assert.match(formatProductQualityReport(oakFiles, oakBrief, 'OakRail'), /Normal/);

// Real invent-rescue (not cosmetic class rename) clears Quality.
const oakInvented = liftProductSeedPastFloor(oakFiles, oakBrief, 'OakRail', 'q7m2zz');
const oakInventGrade = gradeProductQuality(oakInvented, oakBrief, 'OakRail');
assert.equal(oakInventGrade.okQuality, true, `OakRail invent Quality: ${oakInventGrade.reasons.join(',')}`);
assert.ok(productMeetsQualityLock(oakInvented, oakBrief, 'OakRail'), 'invent Quality lock');
assert.ok(oakInventGrade.score >= 3, `score ${oakInventGrade.score}`);
assert.ok(!appLooksLikeRenamedSeedTwin(oakInvented['src/App.jsx'] || ''), 'invent not renamed twin');

const thinStub = {
  ...blank,
  'src/App.jsx': `export default function App(){return <div className="app"><h1>OakRail</h1><button>Shop</button></div>}`,
  'public/logo.svg': oakLogo,
};
const thinGrade = gradeProductQuality(thinStub, oakBrief, 'OakRail');
assert.equal(thinGrade.okNormal, false, 'thin stub not Normal');
assert.equal(thinGrade.okQuality, false, 'thin stub not Quality');
assert.ok(thinGrade.score <= 1, `thin score ${thinGrade.score}`);

const oakLadder = await runProductCreateLadder({
  brief: oakBrief,
  productName: 'OakRail',
  files: oakInvented,
  host: { pushStatus: () => {} },
  allowSpineMaterialize: false,
  salt: 'q7m2zz',
});
assert.equal(oakLadder.ok, true, `OakRail ladder: ${oakLadder.reason || ''}`);
assert.ok(oakLadder.beatsDone.includes('normal'), 'normal beat ran');
assert.ok(oakLadder.beatsDone.includes('quality'), 'quality Accept beat ran');

// Food delivery brand — distinct seed (not desk twin), still Normal-only until invent.
const foodBrief = [
  'hey — can you make me a new website for a food delivery company called BiteLane?',
  'landing page for the brand — order food fast, show how it works, a few highlights, dark modern vibe.',
  'new project on disk please, not editing whatever i have open.',
].join(' ');
assert.equal(briefWantsProductLadder(foodBrief), true, 'food delivery wants product ladder');
const foodMap = buildProductInfoMap(foodBrief, 'BiteLane');
assert.equal(foodMap.productNoun, 'delivery');
assert.match(foodMap.cta, /Order|Get/i);
const foodSpine = materializeProductSpineFiles(foodBrief, 'BiteLane', 'food01');
assert.ok(/\/heroes\/delivery\.svg/i.test(foodSpine['src/App.jsx']), 'delivery hero path');
assert.ok((foodSpine['public/heroes/delivery.svg'] || '').length > 200, 'delivery hero shipped');
assert.ok(!/\/heroes\/desk\.svg/i.test(foodSpine['src/App.jsx']), 'no desk hero on delivery');
assert.ok(!/Shop the desk/i.test(foodSpine['src/App.jsx']), 'no desk CTA on delivery');
assert.ok(appLooksLikeProductSeedFloor(foodSpine['src/App.jsx']), 'delivery seed floor');
const foodSeedGrade = gradeProductQuality(
  { ...blank, ...foodSpine },
  foodBrief,
  'BiteLane',
);
assert.equal(foodSeedGrade.okNormal, true, `food Normal: ${foodSeedGrade.reasons.join(',')}`);
assert.equal(foodSeedGrade.okQuality, false, 'food seed not Ready');
// Cosmetic class rename alone must NOT unlock Quality (OakForge twin miss).
const cosmeticLift = {
  ...blank,
  ...foodSpine,
  'src/App.jsx': String(foodSpine['src/App.jsx'] || '')
    .replace(/hero-stage/g, 'hero-frame')
    .replace(/hero-overlay/g, 'hero-copy')
    .replace(/Built to feel finished/g, 'Built for the handoff'),
};
assert.ok(appLooksLikeRenamedSeedTwin(cosmeticLift['src/App.jsx']), 'cosmetic rename is still seed twin');
assert.ok(appLooksLikeProductSeedFloor(cosmeticLift['src/App.jsx']), 'cosmetic rename still seed floor');
assert.equal(
  gradeProductQuality(cosmeticLift, foodBrief, 'BiteLane').okQuality,
  false,
  'cosmetic rename must not Accept Quality',
);
// Invent-rescue rematerialize → unique composition + Quality (any brand).
const foodLifted = liftProductSeedPastFloor({ ...blank, ...foodSpine }, foodBrief, 'BiteLane', 'food01');
assert.ok(!appLooksLikeProductSeedFloor(foodLifted['src/App.jsx'] || ''), 'rescue left seed floor');
assert.ok(!appLooksLikeRenamedSeedTwin(foodLifted['src/App.jsx'] || ''), 'rescue not renamed twin');
assert.ok(/Overview|Guarantee|invent-rescue/i.test(
  `${foodLifted['src/App.jsx']}\n${foodLifted['src/App.css']}`,
), 'rescue has distinct skeleton');
const foodLiftGrade = gradeProductQuality(foodLifted, foodBrief, 'BiteLane');
assert.equal(foodLiftGrade.okQuality, true, `food rescue Quality: ${foodLiftGrade.reasons.join(',')}`);
assert.ok(PRODUCT_INVENT_FIRST_TOKEN_MS <= 120_000, 'invent first-token wall bounded');
assert.ok(PRODUCT_INVENT_IDLE_MS <= 60_000, 'invent idle wall bounded');
assert.ok(PRODUCT_INVENT_ATTEMPT_WALL_MS <= 3 * 60_000, 'invent attempt wall bounded');
assert.ok(PRODUCT_INVENT_TOTAL_WALL_MS <= 4 * 60_000, 'invent total wall bounded');
assert.ok(PRODUCT_INVENT_TOTAL_WALL_MS >= PRODUCT_INVENT_ATTEMPT_WALL_MS, 'total >= attempt');
// Desk invent-rescue → Quality with ultrawide hero (not dual-monitor twin).
const deskLifted = liftProductSeedPastFloor(oakFiles, oakBrief, 'OakRail', 'q7m2zz');
assert.ok(!appLooksLikeProductSeedFloor(deskLifted['src/App.jsx'] || ''), 'desk rescue left seed floor');
assert.ok(!/Who it is for\s*<\/h2>/i.test(deskLifted['src/App.jsx'] || ''), 'desk rescue rewrote who heading');
assert.equal(
  gradeProductQuality(deskLifted, oakBrief, 'OakRail').okQuality,
  true,
  'desk invent-rescue Quality Accept',
);
const foodFormStub = `export default function App(){return <div className="app"><label className="field"><span>Input</span><input className="field__input" placeholder="Type here" /></label></div>}`;
assert.equal(
  appLooksLikeWrongGenreForProductBrief(foodFormStub, foodBrief),
  true,
  'form stub wrong genre for delivery',
);

console.log(
  `OK smoke-product-ladder (seed≠Ready · invent Quality · ${res.beatsDone.join(' → ')} · recipe=${slots.recipe} · oak=${oakInventGrade.label} · food=delivery)`,
);
