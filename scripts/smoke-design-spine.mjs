/**
 * Unit smoke: Nova Design Spine — grammar/shell/lint without Electron.
 * npx tsx --tsconfig tsconfig.app.json scripts/smoke-design-spine.mjs
 *
 * Prompts intentionally contain NO site-name recipes (no apple.com).
 */
import {
  buildDesignPlan,
  renderDesignShell,
  lintDesignSystem,
  healDesignShell,
  inferCompositionFamily,
  designPlanToLayoutContract,
  applyDesignSlots,
  STOCK_SPINE_CLONE_RE,
  QUALITY_FLOOR,
} from '../src/lib/createDesignSystem.ts';
import { inferBuildGenre } from '../src/lib/createLayoutContract.ts';
import { detectLayoutReference } from '../src/lib/layoutReference.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

check('QUALITY_FLOOR has rules', QUALITY_FLOOR.length >= 4);

const cases = [
  {
    name: 'skincare homepage (no keywords)',
    brief: 'Build a homepage for a skincare brand called Luna',
    product: 'Luna',
    family: 'marketing-bands',
  },
  {
    name: 'indie game studio landing',
    brief: 'Dark landing for an indie game studio called NeonForge',
    product: 'NeonForge',
    family: 'marketing-bands',
  },
  {
    name: 'tip calculator',
    brief: 'Simple tip calculator web app',
    product: 'TipWise',
    family: 'tool-panel',
  },
  {
    name: 'saas notes marketing',
    brief: 'SaaS marketing page for a notes app called LeafNote',
    product: 'LeafNote',
    family: 'marketing-bands',
  },
  {
    name: 'playable arcade',
    brief: 'Build a playable canvas arcade game called OrbitBounce',
    product: 'OrbitBounce',
    family: 'game-stage',
  },
];

for (const c of cases) {
  const fam = inferCompositionFamily(c.brief, c.product);
  check(`${c.name}: family=${c.family}`, fam === c.family, `got ${fam}`);
  const plan = buildDesignPlan({ brief: c.brief, productName: c.product });
  check(`${c.name}: plan family`, plan.family === c.family);
  check(`${c.name}: no reference required`, plan.referenceOverlay == null);
  const shell = renderDesignShell(plan);
  check(`${c.name}: has App+CSS`, Boolean(shell['src/App.tsx'] && shell['src/App.css']));
  const lint = lintDesignSystem(shell, plan);
  check(`${c.name}: lint ok`, lint.ok, lint.reasons.join('; '));
  const contract = designPlanToLayoutContract(plan);
  check(`${c.name}: contract genre`, Boolean(contract.genre && contract.palette?.bg));
}

// Default web ask without magic words → product-homepage (not apple.com gate)
const genre = inferBuildGenre('Build me a website for my boat brand Harbor', 'Harbor');
check('inferBuildGenre website → product-homepage', genre.genre === 'product-homepage', genre.genre);

// apple.com alone is not required for quality — detect stays optional overlay
const noRef = detectLayoutReference('Build a homepage for Harbor boats');
check('no false apple reference', !noRef.recipe, String(noRef.namedSite || ''));
const withRef = detectLayoutReference('Build a coffee brand site with composition like apple.com');
check('explicit apple overlay still works', withRef.recipe?.id === 'apple');

// Heal restores broken App
const plan = buildDesignPlan({
  brief: 'Build a homepage for a skincare brand called Luna',
  productName: 'Luna',
});
const broken = {
  'src/App.tsx': 'export default function App(){ return <div>hi</div> }',
  'src/App.css': 'body { margin: 0 }',
};
check('broken fails lint', lintDesignSystem(broken, plan).ok === false);
const healed = healDesignShell(broken, plan);
check('heal changed', healed.changed === true);
check('heal lint ok', lintDesignSystem(healed.files, plan).ok === true, lintDesignSystem(healed.files, plan).reasons.join('; '));

// Design/Copy hop slots bake into shell without changing family/landmarks
const slotted = applyDesignSlots(plan, {
  contract: {
    ...designPlanToLayoutContract(plan),
    palette: { bg: '#050608', ink: '#f7f2ea', accent: '#c9a98a', muted: '#8a8580' },
    typography: { display: 'Georgia, serif', body: 'Segoe UI, sans-serif', scale: 'product' },
  },
  copy: {
    brand: 'Luna',
    headline: 'Moonlit skin.',
    support: 'A quiet ritual for real mornings.',
    ctas: ['Begin', 'Discover'],
    sections: {
      'band-01': { title: 'Clarify.', body: 'Soft light, honest texture.' },
    },
  },
});
check('slots keep family', slotted.family === 'marketing-bands');
check('slots keep landmarks', slotted.landmarks.join(',') === plan.landmarks.join(','));
check('slots bake accent', slotted.tokens.accent === '#c9a98a');
check('slots bake headline', slotted.copy.headline === 'Moonlit skin.');
const slottedShell = renderDesignShell(slotted);
check('slotted shell has headline', /Moonlit skin/i.test(slottedShell['src/App.tsx']));
check('slotted shell has accent', /#c9a98a/i.test(slottedShell['src/App.css']));
check('slotted shell lint', lintDesignSystem(slottedShell, slotted).ok, lintDesignSystem(slottedShell, slotted).reasons.join('; '));

// Contract override on buildDesignPlan
const fromContract = buildDesignPlan({
  brief: 'Build a homepage for a skincare brand called Luna',
  productName: 'Luna',
  contract: {
    ...designPlanToLayoutContract(plan),
    palette: { ...designPlanToLayoutContract(plan).palette, accent: '#aabbcc' },
  },
});
check('buildDesignPlan contract accent', fromContract.tokens.accent === '#aabbcc');

// Story Band N / Band N titles from copy hop must never bake into the shell
const stubbed = buildDesignPlan({
  brief: 'Build a homepage for a skincare brand called Luna',
  productName: 'Luna',
  copy: {
    brand: 'Luna',
    headline: 'Moonlit skin.',
    support: 'A quiet ritual.',
    ctas: ['Begin'],
    sections: {
      'band-01': { title: 'Story Band 1', body: 'ok body' },
      'band-02': { title: 'Band 2', body: 'ok body' },
    },
  },
});
check('scrub Story Band 1 title', stubbed.copy.bands[0].title !== 'Story Band 1');
check('scrub Band 2 title', stubbed.copy.bands[1].title !== 'Band 2');
const stubShell = renderDesignShell(stubbed);
check('shell has no Story Band N', !/\bStory\s+Band\s*[1-4]\b/i.test(stubShell['src/App.tsx']));
check('stub-scrub lint', lintDesignSystem(stubShell, stubbed).ok, lintDesignSystem(stubShell, stubbed).reasons.join('; '));

// Two different brands must not share stock clone copy / identical default look
const luna = buildDesignPlan({ brief: 'Skincare homepage for Luna', productName: 'Luna' });
const harbor = buildDesignPlan({ brief: 'Boat brand homepage for Harbor', productName: 'Harbor' });
const lunaShell = renderDesignShell(luna)['src/App.tsx'];
const harborShell = renderDesignShell(harbor)['src/App.tsx'];
check('luna no stock clone', !STOCK_SPINE_CLONE_RE.test(lunaShell));
check('harbor no stock clone', !STOCK_SPINE_CLONE_RE.test(harborShell));
check('brands differ accents', luna.tokens.accent !== harbor.tokens.accent || luna.shellVariant !== harbor.shellVariant);
check('brands differ headlines', luna.copy.headline !== harbor.copy.headline || luna.copy.bands[0].title !== harbor.copy.bands[0].title);
check('luna lint unique', lintDesignSystem(renderDesignShell(luna), luna).ok, lintDesignSystem(renderDesignShell(luna), luna).reasons.join('; '));
check('harbor lint unique', lintDesignSystem(renderDesignShell(harbor), harbor).ok, lintDesignSystem(renderDesignShell(harbor), harbor).reasons.join('; '));

const tipFam = inferCompositionFamily('Build a complete tip calculator web app called TipWise.', 'TipWise');
check('TipWise → tool-panel', tipFam === 'tool-panel', tipFam);
const tipVsFluff = inferCompositionFamily(
  'Build a tip calculator called TipWise.\n\n## Plan checklist\nMake a premium website homepage for TipWise',
  'TipWise',
);
check('TipWise wins over plan website fluff', tipVsFluff === 'tool-panel', tipVsFluff);
const tipPlan = buildDesignPlan({ brief: 'Build a complete tip calculator web app called TipWise.', productName: 'TipWise' });
const tipShell = renderDesignShell(tipPlan);
check('TipWise shell is tool', /tool-panel|tool-chrome/.test(tipShell['src/App.tsx']));
check('TipWise not marketing', !/site-hero/.test(tipShell['src/App.tsx']));
const noteFam = inferCompositionFamily('Build a notes app called LeafNote with sidebar and Settings', 'LeafNote');
check('LeafNote → app-chrome', noteFam === 'app-chrome', noteFam);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll Design Spine smoke checks passed.');
