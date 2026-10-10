/**
 * Brief-first craft — invent from ask; anti-marketing sabotage only.
 *   npm run smoke:tool-craft-contract
 */
import assert from 'node:assert/strict';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
}

const {
  buildProductPlan,
  inferCreateCompositionFamily,
  scorePlanContract,
  repairToContract,
  antiBleedForFamily,
} = await import('../src/lib/createProductPlan.ts');
const {
  formatOriginalCraftRules,
  inferCompositionFamily,
} = await import('../src/lib/createDesignSystem.ts');
const { createBriefSpecFromAsk } = await import('../src/lib/createIdentity.ts');
const { layoutReferencePromptLines } = await import('../src/lib/layoutReference.ts');

assert.equal(
  inferCompositionFamily('Build a tip calculator called Tipjar', 'Tipjar'),
  inferCreateCompositionFamily('Build a tip calculator called Tipjar', 'Tipjar'),
);

const tipRules = formatOriginalCraftRules({
  brief: 'Build a tip calculator called Tipjar. Cream page.',
  productName: 'Tipjar',
}).join('\n');
// Thin create (default): short invent-from-ask prompt — no genre contracts.
assert.match(tipRules, /THIN CREATE|@@@FILE/i);
assert.match(tipRules, /Tipjar|tip calculator/i);
assert.doesNotMatch(tipRules, /TIP \/ TOOL CONTRACT/i);
assert.doesNotMatch(tipRules, /NOTES \/ APP CONTRACT/i);
assert.doesNotMatch(tipRules, /HABIT \/ APP CONTRACT/i);
assert.doesNotMatch(tipRules, /TODO \/ TOOL CONTRACT/i);
assert.doesNotMatch(tipRules, /STOREFRONT CONTRACT/i);

const notesRules = formatOriginalCraftRules({
  brief: 'Build a notes app called LeafNote',
  productName: 'LeafNote',
}).join('\n');
assert.match(notesRules, /THIN CREATE|@@@FILE|invent/i);
assert.doesNotMatch(notesRules, /NOTES \/ APP CONTRACT/i);

const tipPlan = buildProductPlan(
  'Build a tiny tip calculator called Tipjar. One cream page, big bill amount input, tip percent buttons.',
  'Tipjar',
);
assert.equal(tipPlan.compositionFamily, 'tool-panel');
assert.ok(tipPlan.checklist.some((c) => /brief asks for|preset genre/i.test(c)));

// Marketing hero Tipjar mush must FAIL (sabotage gate — not a tip recipe).
const mush = {
  'src/App.jsx': `import { useState } from 'react';
import './App.css';
const COVER_HREFS = ['/heroes/tipjar-hero.jpg'];
export default function App() {
  const [bill, setBill] = useState('0');
  const [pct, setPct] = useState('15');
  const tip = Number(bill) * Number(pct) / 100;
  const total = Number(bill) + tip;
  return (
    <main className="app">
      <header className="hero">
        <h1>Tipjar</h1>
        <button>Start calculating</button>
        <button>Learn more</button>
      </header>
      <section className="hero full-bleed">
        <img className="hero-photo" src="/heroes/tipjar-hero.jpg" alt="Tipjar hero" />
      </section>
      <section className="card">
        <input value={bill} onChange={(e) => setBill(e.target.value)} aria-label="Bill amount" />
        <input value={pct} onChange={(e) => setPct(e.target.value)} aria-label="Tip percent" />
        <p>Tip: {tip.toFixed(2)}</p>
        <p>Total: {total.toFixed(2)}</p>
      </section>
    </main>
  );
}
`,
  'src/App.css': '.app{min-height:100vh;font-family:Georgia,serif}.hero{padding:2rem}.card{padding:1rem}',
  'src/data/products.ts': 'export const PRODUCTS = [];\n',
};
const bad = scorePlanContract(mush, tipPlan);
assert.equal(bad.ok, false, `marketing mush must fail: ${bad.reasons.join('; ')}`);
assert.ok(bad.reasons.some((r) => /marketing hero|fake-marketing/i.test(r)), bad.reasons.join('; '));

// Repair strips only — does not paste a tip starter.
const repaired = repairToContract(mush, tipPlan, tipPlan.productName + ' tip calculator');
assert.ok(!repaired.files['src/data/products.ts'], 'orphan products.ts removed');
assert.ok(!/COVER_HREFS/.test(repaired.files['src/App.jsx'] || ''), 'COVER stripped');
assert.ok(!repaired.actions.some((a) => /^inject-/.test(a)), `no genre inject: ${repaired.actions.join(',')}`);
assert.equal(repaired.repairOwnedProduct, false);

const bled = antiBleedForFamily(mush, tipPlan);
assert.ok(bled.changed);
assert.ok(!bled.files['src/data/products.ts']);

const clean = {
  'src/App.jsx': `import { useState } from 'react';
import './App.css';
export default function App() {
  const [bill, setBill] = useState('0');
  const [pct, setPct] = useState('15');
  const tip = Number(bill || 0) * Number(pct || 0) / 100;
  const total = Number(bill || 0) + tip;
  return (
    <main className="app tool">
      <h1>Tipjar</h1>
      <label>Bill amount<input value={bill} onChange={(e) => setBill(e.target.value)} /></label>
      <div className="pcts">
        <button type="button" onClick={() => setPct('15')}>15%</button>
        <button type="button" onClick={() => setPct('18')}>18%</button>
        <button type="button" onClick={() => setPct('20')}>20%</button>
      </div>
      <p>Tip: {tip.toFixed(2)}</p>
      <p>Total: {total.toFixed(2)}</p>
    </main>
  );
}
`,
  'src/App.css': `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Source+Sans+3:wght@400;600&display=swap');
.app{min-height:100vh;padding:2rem;background:#f4efe6;color:#1a1510;font-family:"Source Sans 3",system-ui,sans-serif}
h1{font-family:Fraunces,Georgia,serif}
.tool{max-width:420px;margin:0 auto;display:flex;flex-direction:column;gap:.85rem}
.pcts{display:flex;gap:.5rem}
button{padding:.55rem .9rem;border-radius:10px;box-shadow:0 1px 0 rgba(0,0,0,.06)}
input{padding:.65rem;border-radius:10px}
`,
};
const good = scorePlanContract(clean, tipPlan);
assert.equal(good.ok, true, `clean tip must pass: ${good.reasons.join('; ')} score=${good.score}`);

// Thin craft: repair does not invent a product shell.
const thin = {
  'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="app">
      <h1>Tipjar</h1>
      <p>Coming soon tip calculator placeholder text for length.</p>
    </div>
  );
}
`,
  'src/App.css': '.app{min-height:100vh;padding:2rem}',
};
const owned = repairToContract(thin, tipPlan, 'tip calculator');
assert.ok(!owned.actions.some((a) => /^inject-/.test(a)), `thin must not inject: ${owned.actions.join(',')}`);
assert.equal(owned.repairOwnedProduct, false);

assert.deepEqual(layoutReferencePromptLines('make it like apple.com'), []);
const spec = createBriefSpecFromAsk('Brand', 'like apple.com landing page');
assert.equal(spec.referenceMode, 'none');

console.log('check-tool-craft-contract: ok');
