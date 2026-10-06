/**
 * Shop feature asks must not be micro; drop+heading must not say Removing.
 *   npx tsx --tsconfig tsconfig.app.json scripts/check-shop-feature-gate.mjs
 */
import assert from 'assert';
import {
  isWebMicroAsk,
  isShopFeatureStructureAsk,
} from '../src/lib/webProjectCanon.ts';
import { traceThoughtFromAsk } from '../src/lib/agentTrace.ts';
import { runCreateSyntaxGate } from '../src/lib/createSyntaxGate.ts';

const cartAsk = 'put a Cart button up in the top bar on the right. when i hit Add to cart, bump the count';
const filterAsk = 'put a simple filter row above the cards: All, Vegetables, Herbs, Leafy';
const cardsAsk = 'add a row of plant cards — tomatoes, peppers, herbs, leafy greens. each card needs a name, a little price, and an Add to cart button';
const createAsk = 'start with a warm cream page. call the project Garden Bed. skip the plan, just put it on disk and get Live going';
const headingAsk = 'now drop a big heading in the middle of the page saying something like Fresh vegetable plants';
const bgOnly = 'change the background to cream';

assert.equal(isShopFeatureStructureAsk(cartAsk), true, 'cart feature');
assert.equal(isShopFeatureStructureAsk(filterAsk), true, 'filter feature');
assert.equal(isShopFeatureStructureAsk(cardsAsk), true, 'cards feature');
assert.equal(isShopFeatureStructureAsk(createAsk), true, 'create hard-go');
assert.equal(isWebMicroAsk(cartAsk), false, 'cart not micro');
assert.equal(isWebMicroAsk(filterAsk), false, 'filter not micro');
assert.equal(isWebMicroAsk(cardsAsk), false, 'cards not micro');
assert.equal(isWebMicroAsk(createAsk), false, 'create not micro');
assert.equal(isWebMicroAsk(headingAsk), false, 'heading polish not micro');
assert.equal(isWebMicroAsk(bgOnly), true, 'solid bg still micro');

const thought = traceThoughtFromAsk(headingAsk);
assert.ok(!/Removing/i.test(thought), `heading thought should Add, got: ${thought}`);
assert.ok(/Adding/i.test(thought), `heading thought should Add, got: ${thought}`);

const broken = {
  'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="app">
      <button onClick={() => setCart((c) => c + 1)}>Cart {cart}</button>
    </div>
  );
}
`,
  'src/App.css': '.app { min-height: 100vh; }\n',
};
const syn = runCreateSyntaxGate(broken);
assert.equal(syn.ok, false, 'unbound cart must fail syntax gate');
assert.ok(syn.reasons.some((r) => /cart/i.test(r)), syn.reasons.join('; '));

const sibling = {
  'src/App.jsx': `export default function App() {
  return <div className="app" aria-label="Blank page" />
      <nav className="nav"><span className="brand">Garden Bed</span></nav>;
}
`,
  'src/App.css': '.app{}\n',
};
const syn2 = runCreateSyntaxGate(sibling);
assert.equal(syn2.ok, false, 'self-closing root + sibling must fail');
assert.ok(syn2.reasons.some((r) => /Self-closing|sibling/i.test(r)), syn2.reasons.join('; '));

console.log('check-shop-feature-gate: ok');
