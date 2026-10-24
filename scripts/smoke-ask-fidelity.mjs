/**
 * Ask-fidelity spine: multi-op plans must parse fully, merge surgically,
 * and never invent landing chrome on micro asks.
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/smoke-ask-fidelity.mjs
 */
import assert from 'node:assert/strict';
import {
  planUiAsk,
  verifyUiAskPlan,
  canonicalAskForOp,
  isMicroFidelityPlan,
} from '@/lib/uiAskPlan';
import { finalizeWebEdits } from '@/lib/webProjectCanon';

const blankCream = {
  'src/App.jsx': `import './App.css'\nexport default function App() {\n  return <div className="app" />\n}\n`,
  'src/App.css': `.app { min-height: 100vh; background: #f5f0e8; }\n`,
  'src/index.css': `html, body, #root { margin: 0; min-height: 100%; }\n`,
  'index.html': `<!doctype html><html><body><div id="root"></div></body></html>\n`,
};

// 1) Dual place → one dual-place op
{
  const plan = planUiAsk('Put Hello on the left and Goodbye on the right');
  assert.equal(plan.ops.length, 1, `dual ops: ${JSON.stringify(plan.ops)}`);
  assert.equal(plan.ops[0].kind, 'dual-place');
  assert.equal(plan.ops[0].left, 'Hello');
  assert.equal(plan.ops[0].right, 'Goodbye');
  assert.equal(isMicroFidelityPlan(plan), true);
}

// 2) Bg + sentence → two ops, neither dropped
{
  const plan = planUiAsk('Change the background to sky blue and show the sentence Welcome to my app on the screen');
  const kinds = plan.ops.map((o) => o.kind).sort();
  assert.ok(kinds.includes('solid-bg'), `missing solid-bg: ${JSON.stringify(plan.ops)}`);
  assert.ok(kinds.includes('place-word'), `missing place-word: ${JSON.stringify(plan.ops)}`);
  assert.equal(isMicroFidelityPlan(plan), true);
}

// 3) Multi-op finalize merges both into files
{
  const ask = 'Change the background to brown and put the words I LIKE PIZZA in the top left';
  const plan = planUiAsk(ask);
  assert.ok(plan.ops.length >= 2, JSON.stringify(plan.ops));
  const edits = finalizeWebEdits(blankCream, ask, [], { projectName: 'Smoke' });
  assert.ok(edits.length, 'expected surgical edits');
  const files = { ...blankCream };
  for (const e of edits) files[e.path] = e.content;
  const check = verifyUiAskPlan(plan, files);
  assert.equal(check.ok, true, `verify missing: ${check.missing.join('; ')}`);
  const blob = Object.values(files).join('\n');
  assert.ok(/I LIKE PIZZA|I like pizza/i.test(blob), 'pizza text missing');
  assert.ok(!/About Us/i.test(blob), 'must not invent About Us');
  assert.ok(!/Feature\s*1/i.test(blob), 'must not invent Features');
}

// 4) Canonical asks are surgical-shaped
{
  const ask = canonicalAskForOp({ kind: 'place-word', label: 'Hello', corner: 'center' });
  assert.match(ask, /Put the words Hello/i);
}

console.log('OK smoke-ask-fidelity');
