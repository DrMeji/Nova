import assert from 'node:assert/strict';
import { verifyAsk } from '../src/lib/verifyAsk.ts';
import { finalizeWebEdits } from '../src/lib/webProjectCanon.ts';

const files = {
  'src/App.tsx': `import './App.css';\nexport default function App(){return (<div className="app"><h1 className="center-word">Tesla</h1></div>)}\n`,
  'src/App.css': '.app{min-height:100vh;background:#fef3c7;display:flex;align-items:center;justify-content:center}.center-word{color:#fff;font-weight:600}\n',
};

const before = verifyAsk('Move the name to the top left.', files);
assert.equal(before.ok, false, 'centered flex must not count as top-left');
assert.ok(before.checked > 0);

const after = { ...files };
for (const e of finalizeWebEdits(files, 'Move the name to the top left.', [])) {
  after[e.path] = e.content;
}
assert.match(after['src/App.css'], /position:\s*absolute/i);
assert.match(after['src/App.css'], /top:\s*1\.25rem/i);
assert.match(after['src/App.css'], /left:\s*1\.25rem/i);
assert.equal(verifyAsk('Move the name to the top left.', after).ok, true);

console.log('PASS  move name position verify + surgical');
