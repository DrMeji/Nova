/**
 * Acceptance smoke for storefront genre + repair-before-floor + rich commerce floor.
 * Run: npm run smoke:storefront
 */
import { inferBuildGenre, scoreStorefrontContract, briefLooksLikeStorefront } from '../src/lib/createLayoutContract.ts';
import { formatOriginalCraftRules, lintOriginalCreateQuality, inferCompositionFamily } from '../src/lib/createDesignSystem.ts';
import {
  buildStorefrontCommerceFloor,
  catalogForStorefrontBrief,
  teaCatalog,
} from '../src/lib/createStorefrontFloor.ts';
import {
  buildStorefrontPlan,
  repairStorefrontToContract,
  scoreStorefrontDesignQuality,
  injectAppComponentState,
  collapseDuplicateStorefrontIslands,
} from '../src/lib/createStorefrontRepair.ts';
import { buildBriefInteractiveFloor, briefLooksLikeCommerceStore, appHasCommerceCart, previewReadyForBrief, ensureViteReactProjectFiles } from '../src/lib/createBuildQuality.ts';

const brief = 'Build a professional liquor bottle shop where people can browse, see origin/age/notes, add quantities to cart, and purchase.';
const name = 'Nightport Spirits';
const palette = {
  bg: '#120c0a',
  panel: '#1c1410',
  text: '#f4ebe3',
  muted: '#a89888',
  accent: '#d4a574',
  glow: '#d4a57466',
  btnInk: '#1a100c',
  font: '"Fraunces", "Iowan Old Style", serif',
  line: '#3a2a22',
};

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

assert(briefLooksLikeStorefront(brief, name), 'briefLooksLikeStorefront');
assert(briefLooksLikeCommerceStore(brief), 'briefLooksLikeCommerceStore');
assert(inferBuildGenre(brief, name).genre === 'storefront', 'inferBuildGenre → storefront');
assert(inferCompositionFamily(brief, name) === 'catalog-store', 'composition → catalog-store');

const plan = buildStorefrontPlan(brief, name);
assert(plan.requireProductsFile && plan.minProducts >= 8, 'storefront plan requires products.ts ≥8');
assert(plan.interactions.includes('qty-stepper'), 'plan includes qty-stepper');

const rules = formatOriginalCraftRules({ brief, productName: name, freshnessKey: 'smoke1' }).join('\n');
// Thin create: short invent-from-ask prompt (no STOREFRONT CONTRACT block).
assert(/THIN CREATE|@@@FILE/i.test(rules), 'thin craft rules present');
assert(new RegExp(name, 'i').test(rules) || /shop|liquor|cart/i.test(rules), 'craft rules mention shop ask');
assert(!/STOREFRONT CONTRACT/i.test(rules), 'thin craft must not paste STOREFRONT CONTRACT');

const floor = buildStorefrontCommerceFloor(name, brief, palette);
assert(Boolean(floor.files['src/data/products.ts']), 'floor emits src/data/products.ts');
assert(/Amber Reserve|North Rye|Casa Humo/i.test(floor.files['src/data/products.ts']), 'floor has rich liquor catalog');

const files = {
  'src/App.tsx': floor.app,
  'src/App.css': floor.css,
  ...floor.files,
};
const shop = scoreStorefrontContract(files, { brief });
assert(shop.ok, `scoreStorefrontContract ok (score=${shop.score}) reasons=${shop.reasons.join('; ')}`);
const design = scoreStorefrontDesignQuality(files);
assert(design.ok, `design quality ok (score=${design.score}) ${design.reasons.join('; ')}`);
assert(appHasCommerceCart(files), 'appHasCommerceCart');

// Partial craft: hero+nav+footer but no cart — repair must close contract without full floor wipe.
const partial = {
  'src/App.tsx': `import { useState } from 'react';
import './App.css';
export default function App() {
  return (
    <div className="site">
      <header><nav><a href="#top">${name}</a></nav></header>
      <section className="hero"><h1>${name}</h1><p>Browse bottles.</p></section>
      <section className="story"><h2>Our cellar</h2></section>
      <footer className="foot">© ${name}</footer>
    </div>
  );
}
`,
  'src/App.css': `.site{width:100%;min-height:100vh;background:#120c0a;color:#f4ebe3;font-family:Georgia,serif}
.hero{min-height:70vh;display:grid;place-items:center;background:radial-gradient(circle at 30% 20%,#5a3a22,transparent 55%),#120c0a}
.foot{padding:2rem;text-align:center}
`,
};
const repaired = repairStorefrontToContract(partial, { productName: name, brief });
assert(repaired.changed, `repair changed: ${repaired.actions.join(',')}`);
assert(!repaired.needFloor, 'salvageable partial does not needFloor');
assert(repaired.contractOk, `repair closes contract: ${repaired.reasons.join('; ')}`);
assert(Boolean(repaired.files['src/data/products.ts']), 'repair emits products.ts');
assert(/NOVA_STOREFRONT_ISLAND|Add to cart/i.test(repaired.files['src/App.tsx'] || ''), 'repair injects commerce without full floor replace');
assert(!/Amber Reserve Bourbon[\s\S]*export default function App/i.test(repaired.files['src/App.tsx'] || ''), 'repair did not replace App with full floor source');

const viaBrief = buildBriefInteractiveFloor(name, brief);
assert(Boolean(viaBrief.files?.['src/data/products.ts']), 'buildBriefInteractiveFloor returns products.ts');

const wired = ensureViteReactProjectFiles(files, name).files;
const orig = lintOriginalCreateQuality(wired, { brief, productName: name });
assert(orig.ok || orig.reasons.every((r) => !/storefront/i.test(r)), `orig lint storefront-clean: ${orig.reasons.join('; ')}`);

const ready = previewReadyForBrief(wired, { productName: name, brief });
assert(ready.ok || ready.reasons.filter((r) => /storefront|cart|purchase|priced products/i.test(r)).length === 0,
  `Ready storefront gates: ${ready.ok ? 'ok' : ready.reasons.join('; ')}`);

// Non-liquor specialty retail still classifies storefront
const hwBrief = 'Build an online boutique hardware shop where people browse tools, filter by type, add quantities to cart, and purchase.';
assert(inferBuildGenre(hwBrief, 'Forge & Bit').genre === 'storefront', 'non-liquor shop → storefront');

// Mistveil regression: `const App = () =>` + island JSX without state → blank Live ReferenceError.
const arrowBroken = {
  'src/App.jsx': `import React, { useState } from 'react';
import './App.css';
import { PRODUCTS, PRODUCT_TYPES } from './data/products';
const App = () => {
  const [showHero, setShowHero] = useState(true);
  return (
    <div className="app">
      <header><nav>Mistveil</nav></header>
      <section className="hero"><h1>Mistveil Leaves</h1></section>
      <section className="band" id="shop" data-nova="storefront-island">
        <div className="filter-bar">{(PRODUCT_TYPES || ['All']).map((t) => (
          <button key={t} type="button" className={filter === t ? 'chip chip-on' : 'chip'} onClick={() => setFilter(t)}>{t}</button>
        ))}</div>
        <div className="product-grid">{visible.map((p) => (
          <article key={p.id} className="product-card"><h3>{p.name}</h3><p className="price">\${p.price}</p>
          <button type="button" className="add-to-cart" onClick={() => add(p)}>Add to cart</button></article>
        ))}</div>
      </section>
      {open ? (<div className="cart-drawer"><button onClick={() => setOpen(false)}>Close</button></div>) : null}
      <section className="band" id="shop" data-nova="storefront-island">
        <div className="product-grid"><article className="product-card">dup</article></div>
      </section>
      {open ? (<div className="cart-drawer">dup cart</div>) : null}
      <footer>© Mistveil</footer>
    </div>
  );
};
export default App;
`,
  'src/App.css': `.app{min-height:100vh}.product-grid{display:grid}.product-card{padding:1rem}`,
};
const arrowFixed = repairStorefrontToContract(arrowBroken, { productName: 'Mistveil Leaves', brief: 'jasmine green tea shop cart purchase' });
const arrowApp = arrowFixed.files['src/App.jsx'] || '';
assert(/NOVA_STOREFRONT_ISLAND/.test(arrowApp), 'arrow App gets commerce state');
assert(/useMemo/.test(arrowApp), 'arrow App import gains useMemo');
assert((arrowApp.match(/data-nova=["']storefront-island["']/g) || []).length === 1, 'duplicate storefront islands collapsed to 1');
assert(/\bconst \[filter, setFilter\]/.test(arrowApp), 'filter state present for island JSX');
const stateOnly = injectAppComponentState('const App = () => {\n  return null;\n};', '/* MARK */\n  const x = 1;');
assert(stateOnly && stateOnly.includes('/* MARK */'), 'injectAppComponentState supports const App = () =>');
assert(collapseDuplicateStorefrontIslands(arrowBroken['src/App.jsx']).match(/storefront-island/g).length === 1, 'collapse helper keeps one island');

// Tea brand must never get whiskey/abv/proof/bottle catalog copy.
const teaBrief = 'Build a jasmine green tea brand shop with cart, checkout, and purchase.';
const teaProducts = catalogForStorefrontBrief('Mistveil Leaves', teaBrief);
assert(teaProducts.length >= 8, 'tea catalog ≥8');
const teaBlob = JSON.stringify(teaProducts);
assert(!/abv|whiskey|bourbon|proof|cask|tasting pours|bottle for the road/i.test(teaBlob), 'tea catalog has no spirits copy');
assert(/Tin|Pouch|Steep|tea|Sampler/i.test(teaBlob), 'tea catalog uses tea SKUs');
assert(teaCatalog('X').every((p) => !p.abv), 'teaCatalog products omit abv');
const teaFloor = buildStorefrontCommerceFloor('Mistveil Leaves', teaBrief, palette);
const teaProductsSrc = teaFloor.files['src/data/products.ts'] || '';
assert(!/whiskey|bourbon|Cask Strength|tasting pours|"abv"\s*:/i.test(teaProductsSrc), 'tea floor products.ts clean');
assert(!/Browse bottles|open a bottle/i.test(teaFloor.app || ''), 'tea floor App has no bottle CTA copy');
assert(/Browse tins|open a tin/i.test(teaFloor.app || ''), 'tea floor App uses tin CTAs');
assert(
  !/#2c1b14|#100b09|#322018|#2a1b15|#18100d/i.test(teaFloor.css || ''),
  'tea floor CSS has no liquor-brown hex surfaces',
);
assert(/#0f1a15|#15241d|#7dba8c|#1a2e24/i.test(teaFloor.css || ''), 'tea floor CSS uses matcha/green surfaces');
// Brand landing with Shop CTA alone is NOT storefront (no cart/checkout).
assert(!briefLooksLikeStorefront(
  'Build a jasmine tea brand page with origin story, tasting notes, and Shop + Steep guides CTAs.',
  'Mistveil Leaves',
), 'Shop CTA brand page ≠ storefront');
assert(briefLooksLikeStorefront(teaBrief, 'Mistveil Leaves'), 'explicit cart/checkout still storefront');
// TS-annotated arrow App still gets state.
const tsArrow = injectAppComponentState(
  'const App: React.FC = () => {\n  return <div />;\n};',
  '/* NOVA_STOREFRONT_ISLAND */\n  const x = 1;',
);
assert(tsArrow && /NOVA_STOREFRONT_ISLAND/.test(tsArrow), 'injectAppComponentState supports const App: React.FC');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nstorefront contract smoke passed');
