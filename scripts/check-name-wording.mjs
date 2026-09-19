import assert from 'node:assert/strict';
import { extractBrandLabel, extractNameRenameTarget } from '../src/lib/brandLabel.ts';
import { reactSurgicalMicroAskEdits, finalizeWebEdits } from '../src/lib/webProjectCanon.ts';

assert.equal(extractNameRenameTarget("Can you change the name that's in the middle to local only"), 'local only');
assert.equal(extractNameRenameTarget("Can you change the name that's in the middle to logo only"), 'logo only');
assert.equal(extractBrandLabel("Can you change the name that's in the middle to local only"), 'local only');
assert.notEqual(extractBrandLabel("the name that's in the middle"), 'that');

import { classifyDiskIntent } from '../src/lib/chatDiskIntent.ts';
assert.equal(classifyDiskIntent('Change the name to Tesla').type, 'none');
assert.equal(classifyDiskIntent("Can you change the name that's in the middle to local only").type, 'none');
assert.equal(classifyDiskIntent('rename draft-notes.md to inventory-core.md').type, 'rename_file');
assert.equal(classifyDiskIntent('change the file name of notes.md to todo.md').type, 'rename_file');

const files = {
  'src/App.jsx': `import './App.css';\nexport default function App(){return (<div className="app"><h1 className="center-word">Cursor</h1></div>)}\n`,
  'src/App.css': '.app{min-height:100vh;background:#fef3c7;display:flex;align-items:center;justify-content:center;position:relative}.center-word{color:#fff;font-weight:600}\n',
};

{
  const next = { ...files };
  for (const e of finalizeWebEdits(files, "Can you change the name that's in the middle to local only", [])) {
    next[e.path] = e.content;
  }
  assert.match(next['src/App.jsx'], />local only</i);
  assert.doesNotMatch(next['src/App.jsx'], />that</i);
  assert.doesNotMatch(next['src/App.jsx'], /corner-logo|logo\.svg/i);
}

{
  let cur = { ...files };
  for (const ask of [
    'Put the brand name Cursor in the center',
    'Change the name to Tesla',
    'Move the name to the top left',
    'Make the Tesla word look more cursive',
    'Change the name to SpaceX',
    'Make it bold',
  ]) {
    const next = { ...cur };
    for (const e of finalizeWebEdits(cur, ask, [])) next[e.path] = e.content;
    cur = next;
  }
  assert.match(cur['src/App.jsx'], />SpaceX</i);
  assert.match(cur['src/App.css'], /font-weight:\s*700/i);
  assert.match(cur['src/App.css'], /Georgia|italic|font-style:\s*italic|font-weight:\s*700/i);
}

{
  const moved = reactSurgicalMicroAskEdits(files, 'Move the name to the top right');
  const css = moved.find((e) => /App\.css/i.test(e.path))?.content || '';
  assert.match(css, /position:\s*absolute/i);
  assert.match(css, /top:\s*1\.25rem/i);
  assert.match(css, /right:\s*1\.25rem/i);
}

console.log('PASS  name rename + position + font surgical');
