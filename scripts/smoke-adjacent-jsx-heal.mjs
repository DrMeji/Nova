/**
 * Ensure wrong-family storefront bleed and adjacent JSX cannot ship to Live.
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/smoke-adjacent-jsx-heal.mjs
 */
import { repairToContract, buildProductPlan, stripWrongFamilyStorefrontBleed } from '../src/lib/createProductPlan.ts';
import { injectJsxInsideReturnRoot } from '../src/lib/createStorefrontRepair.ts';
import {
  hasAdjacentJsxOutsideRoot,
  healAdjacentJsxOutsideRoot,
  runCreateSyntaxGate,
} from '../src/lib/createSyntaxGate.ts';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const broken = `import { useState } from 'react';
import './App.css';
import { PRODUCTS, PRODUCT_TYPES } from './data/products';

export default function App() {
  /* NOVA_STOREFRONT_ISLAND */
  const [filter, setFilter] = useState('All');
  const [open, setOpen] = useState(false);
  return (
    <div className="app">
      <div className="app-shell"><main id="main"><h1>Streakly</h1></main></div>
      <h1 className="title">Streakly</h1>
    </div>
      
      <section className="band" id="shop" data-nova="storefront-island">
        <h2>Shop</h2>
      </section>
      <footer className="footer foot">© Streakly</footer>

  );
}
`;

assert(hasAdjacentJsxOutsideRoot(broken), 'detects adjacent JSX outside root');
const healed = healAdjacentJsxOutsideRoot(broken);
assert(!hasAdjacentJsxOutsideRoot(healed), 'heal pulls orphans inside root');
assert(/storefront-island[\s\S]*<\/div>\s*\)/.test(healed.replace(/\n/g, ' ')) || /<\/section>[\s\S]*<\/div>/.test(healed), 'island before root close');

const stripped = stripWrongFamilyStorefrontBleed(broken);
assert(!/NOVA_STOREFRONT_ISLAND/.test(stripped), 'strip removes island state');
assert(!/storefront-island/.test(stripped), 'strip removes island JSX');
assert(!/PRODUCTS/.test(stripped), 'strip removes products import');

const plan = buildProductPlan('Build a habit tracker app with streaks and daily check-in', 'Streakly');
assert(plan.compositionFamily !== 'catalog-store', `habit family is ${plan.compositionFamily}, not catalog-store`);
const repaired = repairToContract(
  {
    'src/App.tsx': broken,
    'src/App.css': '.app{}',
    'src/data/products.ts': 'export const PRODUCTS=[]; export const PRODUCT_TYPES=["All"];',
  },
  plan,
  'Build a habit tracker app with streaks',
);
assert(repaired.actions.includes('strip-wrong-family-storefront'), `repair strips bleed: ${repaired.actions.join(',')}`);
assert(!/storefront-island/.test(repaired.files['src/App.tsx'] || ''), 'repaired App has no storefront island');
assert(!repaired.files['src/data/products.ts'], 'products.ts deleted for non-shop');

const synBroken = runCreateSyntaxGate({ 'src/App.tsx': broken, 'src/App.css': '.app{}' });
assert(synBroken.healed || synBroken.ok, 'syntax gate heals or passes after heal');
assert(!hasAdjacentJsxOutsideRoot(synBroken.files['src/App.tsx'] || ''), 'gate output has no adjacent JSX');

const partial = `import { useState } from 'react';
import './App.css';
export default function App() {
  return (
    <div className="site">
      <header><nav><a href="#top">Shop</a></nav></header>
      <section className="hero"><h1>Shop</h1></section>
      <footer className="foot">© Shop</footer>
    </div>
  );
}
`;
const injected = injectJsxInsideReturnRoot(partial, '      <section data-nova="storefront-island">x</section>');
assert(Boolean(injected), 'inject returns app');
assert(!hasAdjacentJsxOutsideRoot(injected || ''), 'inject does not create adjacent JSX');
assert(/storefront-island[\s\S]*<footer/i.test(injected || ''), 'inject before footer inside root');

// brand-lockup </div> then hero <section> are siblings under .app — NOT orphans.
const lockupSibling = `import './App.css';
export default function App() {
  return (
    <div className="app">
      <div className="brand-lockup">
        <h1 className="center-word">Auralis</h1>
        <p className="tagline">Clear sound for everyday listening</p>
      </div>
      <section className="hero-copy" aria-label="Hero">
        <h2 className="hero-headline">Hear every detail</h2>
        <p className="hero-support">Studio clarity, light wear, ready to ship</p>
      </section>
    </div>
  );
}
`;
assert(!hasAdjacentJsxOutsideRoot(lockupSibling), 'lockup+hero siblings are inside root');
const lockupGate = runCreateSyntaxGate({ 'src/App.jsx': lockupSibling, 'src/App.css': '.app{}' });
const lockupOut = lockupGate.files['src/App.jsx'] || '';
assert(!hasAdjacentJsxOutsideRoot(lockupOut), 'gate keeps lockup+hero as siblings');
assert(
  /className=["']brand-lockup["'][\s\S]*?<\/div>\s*<section\b[^>]*className=["']hero-copy["']/i.test(lockupOut),
  'gate must not nest hero inside brand-lockup',
);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nadjacent-jsx heal smoke passed');
