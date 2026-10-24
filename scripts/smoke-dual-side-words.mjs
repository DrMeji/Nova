/**
 * Guard: "Put Hello on the left and Goodbye on the right" paints BOTH words.
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/smoke-dual-side-words.mjs
 */
import assert from 'node:assert/strict';
import { extractDualSideLabels } from '@/lib/brandLabel';
import { reactSurgicalMicroAskEdits } from '@/lib/webProjectCanon';

const ask = 'Put Hello on the left and Goodbye on the right.';
const dual = extractDualSideLabels(ask);
assert.equal(dual.length, 2, `dual extract → ${JSON.stringify(dual)}`);
assert.equal(dual[0].label, 'Hello');
assert.equal(dual[0].side, 'left');
assert.equal(dual[1].label, 'Goodbye');
assert.equal(dual[1].side, 'right');

const files = {
  'src/App.jsx': `import './App.css';
export default function App() {
  return (<div className="app" aria-label="Blank page" />);
}
`,
  'src/App.css': '.app{min-height:100dvh;margin:0;background:#faf7f2;}\n',
  'src/index.css': 'html,body,#root{margin:0;background:#faf7f2;}\n',
};

const edits = reactSurgicalMicroAskEdits(files, ask);
const app = edits.find((e) => /App\.(jsx|tsx)$/i.test(e.path))?.content || '';
const css = edits.find((e) => /App\.css$/i.test(e.path))?.content || '';
assert.match(app, />Hello</, 'must include Hello');
assert.match(app, />Goodbye</, 'must include Goodbye');
assert.match(css, /corner-word--left/i, 'left pin CSS');
assert.match(css, /corner-word--right/i, 'right pin CSS');
assert.match(css, /left\s*:\s*1\.25rem/i);
assert.match(css, /right\s*:\s*1\.25rem/i);

console.log('OK smoke-dual-side-words');
