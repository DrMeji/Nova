import assert from 'node:assert/strict';
import {
  extractNameRenameTarget,
  extractNameTextColorTarget,
  looksLikeNameTextColorAsk,
} from '../src/lib/brandLabel.ts';
import { finalizeWebEdits, reactSurgicalMicroAskEdits } from '../src/lib/webProjectCanon.ts';
import { verifyAsk } from '../src/lib/verifyAsk.ts';

const ask = 'Can you change the color of the name from white to black';
const ask2 = "Can you change the color on the name that's white to black";

assert.equal(looksLikeNameTextColorAsk(ask), true);
assert.equal(looksLikeNameTextColorAsk(ask2), true);
assert.equal(extractNameRenameTarget(ask), '');
assert.equal(extractNameRenameTarget(ask2), '');
assert.equal(extractNameTextColorTarget(ask), 'black');
assert.equal(extractNameTextColorTarget(ask2), 'black');

const files = {
  'src/App.tsx': `import './App.css';\nexport default function App(){return (<div className="app"><h1 className="center-word">SpaceX</h1></div>)}\n`,
  'src/App.css': '.app{min-height:100vh;background:#fef3c7;display:flex;align-items:center;justify-content:center}.center-word{color:#fff;font-weight:600}\n',
};

assert.equal(verifyAsk(ask, files).ok, false);

const edits = reactSurgicalMicroAskEdits(files, ask);
assert.ok(edits.some((e) => /App\.css/i.test(e.path)));
assert.ok(!edits.some((e) => /App\.tsx/i.test(e.path)), 'must not rename the word to black');

const after = { ...files };
for (const e of finalizeWebEdits(files, ask, [])) after[e.path] = e.content;

assert.match(after['src/App.tsx'], />SpaceX</);
assert.doesNotMatch(after['src/App.tsx'], />black</i);
assert.match(after['src/App.css'], /\.center-word\s*\{[^}]*color:\s*#000000/i);
assert.match(after['src/App.css'], /background:\s*#fef3c7/i);
assert.doesNotMatch(after['src/App.css'], /\.app\s*\{[^}]*background:\s*#fff/i);
const v = verifyAsk(ask, after);
if (!v.ok) {
  console.error('verify fail', v, after['src/App.css']);
}
assert.equal(v.ok, true);

const after2 = { ...files };
for (const e of finalizeWebEdits(files, ask2, [])) after2[e.path] = e.content;
assert.match(after2['src/App.tsx'], />SpaceX</);
assert.match(after2['src/App.css'], /color:\s*#000000/i);

console.log('PASS  name text color (not rename, not background)');
