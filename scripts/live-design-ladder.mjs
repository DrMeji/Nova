/**
 * Design ladder — prove Design Spine quality without keyword/site recipes.
 *
 * Default: deterministic unit checks (no Electron).
 * Optional live: set NOVA_DESIGN_LADDER_LIVE=1 and have Nova on CDP
 *   (same port pattern as other live-* scripts).
 *
 *   npx tsx --tsconfig tsconfig.app.json scripts/live-design-ladder.mjs
 *   $env:NOVA_DESIGN_LADDER_LIVE='1'; npx tsx --tsconfig tsconfig.app.json scripts/live-design-ladder.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildDesignPlan,
  renderDesignShell,
  lintDesignSystem,
  healDesignShell,
  inferCompositionFamily,
  applyDesignSlots,
  designPlanToLayoutContract,
} from '../src/lib/createDesignSystem.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'scripts', '_design-ladder-out.txt');
const RESULTS = path.join(ROOT, 'scripts', '_design-ladder-results.json');

const logLines = [];
function log(line) {
  const s = String(line);
  console.log(s);
  logLines.push(s);
}

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) log(`PASS  ${name}`);
  else {
    failed += 1;
    log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Normal tests — prompts must NOT say apple.com / use-this-recipe. */
const NORMAL = [
  {
    id: 'luna-skincare',
    brief: 'Build a homepage for a skincare brand called Luna',
    product: 'Luna',
    family: 'marketing-bands',
    landmarks: ['site-nav', 'site-hero', 'band-01', 'site-footer'],
  },
  {
    id: 'neonforge-dark',
    brief: 'Dark landing for an indie game studio called NeonForge',
    product: 'NeonForge',
    family: 'marketing-bands',
    landmarks: ['site-nav', 'site-hero', 'band-01'],
  },
  {
    id: 'tipwise',
    brief: 'Simple tip calculator web app called TipWise',
    product: 'TipWise',
    family: 'tool-panel',
    landmarks: ['tool-chrome', 'tool-panel'],
  },
  {
    id: 'leafnote-saas',
    brief: 'SaaS marketing page for a notes app called LeafNote',
    product: 'LeafNote',
    family: 'marketing-bands',
    landmarks: ['site-nav', 'site-hero', 'band-01', 'band-02', 'band-03'],
  },
];

const STRESS = [
  {
    id: 'heal-after-trash',
    brief: 'Build a homepage for a skincare brand called Luna',
    product: 'Luna',
    run: (plan) => {
      const broken = {
        'src/App.tsx': 'export default function App(){return <div className="junk">x</div>}',
        'src/App.css': 'body{background:#fff}',
      };
      check('stress broken fails lint', lintDesignSystem(broken, plan).ok === false);
      const healed = healDesignShell(broken, plan);
      check('stress heal restores', healed.changed === true);
      const lint = lintDesignSystem(healed.files, plan);
      check('stress heal lint ok', lint.ok, lint.reasons.join('; '));
    },
  },
  {
    id: 'token-pivot-darker',
    brief: 'Build a homepage for Harbor boats',
    product: 'Harbor',
    run: (plan) => {
      const darker = buildDesignPlan({
        brief: 'make the homepage feel darker and more product-forward for Harbor boats',
        productName: 'Harbor',
      });
      check('stress pivot keeps marketing-bands', darker.family === 'marketing-bands');
      check('stress pivot still no apple recipe', darker.referenceOverlay == null);
      const shell = renderDesignShell(darker);
      check('stress pivot lint', lintDesignSystem(shell, darker).ok);
      // Same grammar, different tokens acceptable
      check('stress pivot has shell', Boolean(shell['src/App.tsx'] && shell['src/App.css']));
      void plan;
    },
  },
  {
    id: 'explicit-reference-overlay',
    brief: 'Build a coffee brand site called Ember Roast with composition like apple.com',
    product: 'Ember Roast',
    run: () => {
      const plan = buildDesignPlan({
        brief: 'Build a coffee brand site called Ember Roast with composition like apple.com',
        productName: 'Ember Roast',
      });
      check('stress overlay id apple', plan.referenceOverlay === 'apple');
      check('stress overlay still marketing-bands', plan.family === 'marketing-bands');
      const shell = renderDesignShell(plan);
      check('stress overlay brand Ember', /Ember Roast/i.test(shell['src/App.tsx']));
      check('stress overlay no Apple marks', !/\b(?:iPhone|MacBook|AirPods)\b/i.test(shell['src/App.tsx']));
      check('stress overlay lint', lintDesignSystem(shell, plan).ok);
    },
  },
  {
    id: 'slot-bake-from-hops',
    brief: 'Build a homepage for a skincare brand called Luna',
    product: 'Luna',
    run: (plan) => {
      const slotted = applyDesignSlots(plan, {
        contract: {
          ...designPlanToLayoutContract(plan),
          palette: { bg: '#040506', ink: '#f4efe6', accent: '#d2b48c', muted: '#8a8580' },
        },
        copy: {
          headline: 'Skin, moonlight.',
          support: 'A quiet ritual.',
          ctas: ['Begin'],
        },
      });
      check('slot-bake keeps landmarks', slotted.landmarks.join() === plan.landmarks.join());
      const shell = renderDesignShell(slotted);
      check('slot-bake headline in App', /Skin, moonlight/i.test(shell['src/App.tsx']));
      check('slot-bake accent in CSS', /#d2b48c/i.test(shell['src/App.css']));
      check('slot-bake lint', lintDesignSystem(shell, slotted).ok, lintDesignSystem(shell, slotted).reasons.join('; '));
    },
  },
];

log('=== Design ladder (deterministic) ===');
log('Prompts avoid site-name cookbooks; quality comes from Design Spine.\n');

for (const c of NORMAL) {
  log(`-- normal: ${c.id}`);
  const fam = inferCompositionFamily(c.brief, c.product);
  check(`${c.id} family`, fam === c.family, `got ${fam}`);
  const plan = buildDesignPlan({ brief: c.brief, productName: c.product });
  check(`${c.id} no magic reference`, plan.referenceOverlay == null);
  const shell = renderDesignShell(plan);
  const lint = lintDesignSystem(shell, plan);
  check(`${c.id} lint`, lint.ok, lint.reasons.join('; '));
  for (const lm of c.landmarks) {
    check(`${c.id} landmark ${lm}`, new RegExp(`\\b${lm}\\b`).test(shell['src/App.tsx']));
  }
  check(`${c.id} brand in App`, new RegExp(c.product.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(shell['src/App.tsx']));
  check(`${c.id} has motion`, /@keyframes/i.test(shell['src/App.css']) || c.family === 'tool-panel');
}

log('\n-- stress --');
for (const s of STRESS) {
  log(`-- stress: ${s.id}`);
  const plan = buildDesignPlan({ brief: s.brief, productName: s.product });
  s.run(plan);
}

const results = {
  at: new Date().toISOString(),
  failed,
  live: process.env.NOVA_DESIGN_LADDER_LIVE === '1' ? 'requested' : 'skipped',
  note: 'Live CDP create passes are optional; unit spine is the permanent gate.',
};

if (process.env.NOVA_DESIGN_LADDER_LIVE === '1') {
  log('\nNOVA_DESIGN_LADDER_LIVE=1 set — run a Create in Nova with the NORMAL prompts and confirm Live landmarks.');
  log('Automated CDP create is covered by live-create-ladder / live-create-to-live; this script owns Design Spine gates.');
  results.live = 'manual-prompt-list';
  results.prompts = NORMAL.map((c) => c.brief);
}

fs.writeFileSync(OUT, `${logLines.join('\n')}\n`, 'utf8');
fs.writeFileSync(RESULTS, `${JSON.stringify(results, null, 2)}\n`, 'utf8');

if (failed) {
  log(`\n${failed} failure(s) — see ${OUT}`);
  process.exit(1);
}
log(`\nDesign ladder passed. Wrote ${OUT}`);
