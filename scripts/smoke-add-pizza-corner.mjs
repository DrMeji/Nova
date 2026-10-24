/**
 * Guard: messy "add i like pizza on top left in all caps" must surgical-place
 * I LIKE PIZZA top-left — never miss into the agent write-retry loop.
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/smoke-add-pizza-corner.mjs
 */
import assert from 'node:assert/strict';
import { normalizeMessyUiEditAsk } from '@/lib/editAskResolve';
import { extractShowWordLabel } from '@/lib/brandLabel';
import { isWebMicroAsk, reactSurgicalMicroAskEdits } from '@/lib/webProjectCanon';

const raw = 'add i like pizza on top left in all caps';
const normalized = normalizeMessyUiEditAsk(raw);
assert.match(normalized, /Put the words I LIKE PIZZA in the top left/i, `normalize → ${JSON.stringify(normalized)}`);
assert.equal(extractShowWordLabel(normalized), 'I LIKE PIZZA');
assert.equal(isWebMicroAsk(raw), true, 'raw ask must count as micro');
assert.equal(isWebMicroAsk(normalized), true, 'normalized ask must count as micro');

const typo = 'add a like pizza on top left in all caps';
assert.match(
  normalizeMessyUiEditAsk(typo),
  /I LIKE PIZZA/i,
  'speech typo "a like" should still land pizza',
);

const files = {
  'src/App.jsx': `import './App.css';

export default function App() {
  return (
    <div className="app" aria-label="Blank page" />
  );
}
`,
  'src/App.css': '.app{min-height:100vh;margin:0;background:#faf7f2;}',
};

const edits = reactSurgicalMicroAskEdits(files, raw);
assert.ok(edits.length >= 1, 'surgical must return edits');
const app = edits.find((e) => /App\.(jsx|tsx)$/i.test(e.path))?.content || '';
const css = edits.find((e) => /App\.css$/i.test(e.path))?.content || '';
assert.match(app, />I LIKE PIZZA</, 'App should show I LIKE PIZZA');
assert.doesNotMatch(app, /aria-label=["']Blank page["']/i, 'blank aria should be gone');
assert.match(css, /top\s*:\s*1\.25rem/i, 'CSS should pin top');
assert.match(css, /left\s*:\s*1\.25rem/i, 'CSS should pin left');
assert.doesNotMatch(css, /right\s*:\s*1\.25rem/i, 'must not pin top-right');

console.log('OK smoke-add-pizza-corner');
