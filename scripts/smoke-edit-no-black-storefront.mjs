/**
 * Micro bg edit must not strip a live storefront App (black Live).
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-edit-no-black-storefront.mjs
 */
import assert from 'node:assert/strict';
import {
  antiBleedForFamily,
  buildProductPlan,
  filesLookLikeLiveStorefront,
} from '@/lib/createProductPlan';
import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { finalizeWebEdits } from '@/lib/webProjectCanon';
import { planUiAsk } from '@/lib/uiAskPlan';

const app = `import { useMemo, useState } from 'react';
import './App.css';
import { PRODUCTS, PRODUCT_TYPES } from './data/products';

export default function App() {
  const [cart, setCart] = useState([]);
  const add = (p) => setCart((c) => [...c, p]);
  return (
    <div className="site">
      <button type="button" onClick={() => add(PRODUCTS[0])}>Add to cart</button>
      <button type="submit" className="purchase">Purchase</button>
      <p>{PRODUCT_TYPES.join(',')}</p>
    </div>
  );
}
`;
const products = `export const PRODUCTS = [
  { "id": "a", "name": "Trail", "type": "26 oz", "notes": "n", "price": 40 },
  { "id": "b", "name": "Summit", "type": "36 oz", "notes": "n", "price": 50 },
  { "id": "c", "name": "Ridge", "type": "18 oz", "notes": "n", "price": 32 },
  { "id": "d", "name": "Alpine", "type": "26 oz", "notes": "n", "price": 42 },
  { "id": "e", "name": "Dusk", "type": "30 oz", "notes": "n", "price": 46 },
  { "id": "f", "name": "Canyon", "type": "22 oz", "notes": "n", "price": 36 },
  { "id": "g", "name": "Frost", "type": "18 oz", "notes": "n", "price": 28 },
  { "id": "h", "name": "Ember", "type": "26 oz", "notes": "n", "price": 44 },
  { "id": "i", "name": "Mist", "type": "40 oz", "notes": "n", "price": 54 }
];
export const PRODUCT_TYPES = ['All'];
`;
const files = {
  'src/App.jsx': app,
  'src/App.css': ':root { --bg: #f7f3eb; }\n.site { min-height: 100vh; background: var(--bg); }\n',
  'src/index.css': 'html, body, #root { margin: 0; background: #f7f3eb; }\n',
  'src/data/products.ts': products,
};

assert.equal(filesLookLikeLiveStorefront(files), true, 'live storefront detect');

// Wrong-family plan must NOT strip a live shop.
const wrongPlan = buildProductPlan('change the background to cream brown', 'FreshFlask');
assert.notEqual(wrongPlan.compositionFamily, 'catalog-store', 'short ask is not catalog');
const bled = antiBleedForFamily(files, wrongPlan);
assert.equal(bled.changed, false, 'antiBleed leaves live shop alone');
assert.ok(/from\s+['"]\.\/data\/products['"]/i.test(bled.files['src/App.jsx']), 'PRODUCTS import kept');
assert.ok(bled.files['src/data/products.ts'], 'products.ts kept');

const plan = planUiAsk('Can you change the background to cream brown');
assert.ok(plan.ops.some((o) => o.kind === 'solid-bg' && /cream\s*brown/i.test(o.colorWord)), 'cream brown op');
assert.equal(plan.ops.find((o) => o.kind === 'solid-bg')?.hex, '#c4a882', 'cream brown hex');

const edits = finalizeWebEdits(files, 'Change the background color to cream brown.', [], { projectName: 'FreshFlask' });
assert.ok(edits.some((e) => /App\.css$/i.test(e.path)), 'paints App.css');
assert.ok(!edits.some((e) => /App\.(jsx|tsx)$/i.test(e.path)), 'does not rewrite App.jsx');
const css = edits.find((e) => /App\.css$/i.test(e.path))?.content || '';
assert.ok(/#c4a882/i.test(css) || /--bg:\s*#c4a882/i.test(css), 'css has cream brown');

const applied = await applyChatReplyEdits({
  reply: '',
  projectId: null,
  projectName: 'FreshFlask',
  files,
  userMessage: 'Change the background color to cream brown.',
  dryRun: true,
});
assert.ok(applied.ok, 'apply ok');
assert.ok(/from\s+['"]\.\/data\/products['"]/i.test(applied.files['src/App.jsx'] || ''), 'apply keeps PRODUCTS');
assert.ok(applied.files['src/data/products.ts'], 'apply keeps products.ts');

console.log('smoke-edit-no-black-storefront: ok');
