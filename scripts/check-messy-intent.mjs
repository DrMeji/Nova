import assert from 'node:assert/strict';
import {
  extractNameRenameTarget,
  extractNameTextColorTarget,
  looksLikeNameTextColorAsk,
} from '../src/lib/brandLabel.ts';
import {
  looksLikeNameFontStyleAsk,
  normalizeMessyUiEditAsk,
  resolveConversationalEditAsk,
} from '../src/lib/editAskResolve.ts';
import { finalizeWebEdits } from '../src/lib/webProjectCanon.ts';
import { verifyAsk } from '../src/lib/verifyAsk.ts';

{
  const n = normalizeMessyUiEditAsk('He changed the name to cursive instead of being bold');
  assert.match(n, /cursive/i);
  assert.doesNotMatch(n, /\bbold\b/i);
  assert.equal(extractNameRenameTarget(n), '');
  assert.equal(looksLikeNameFontStyleAsk(n), true);
}

{
  const n = normalizeMessyUiEditAsk('Change the name into cursive inside a bold');
  assert.match(n, /cursive/i);
  assert.equal(extractNameRenameTarget('Change the name into cursive inside a bold'), '');
}

{
  const n = normalizeMessyUiEditAsk('Change the color to black for the wording place');
  assert.match(n, /color of the name to black/i);
  assert.equal(looksLikeNameTextColorAsk(n), true);
  assert.equal(extractNameTextColorTarget(n), 'black');
  assert.equal(extractNameRenameTarget(n), '');
}

{
  const r = resolveConversationalEditAsk({
    message: 'He changed the name to cursive instead of being bold',
    workspaceBound: true,
  });
  assert.match(r.content, /cursive/i);
  assert.doesNotMatch(r.content, /background/i);
}

const files = {
  'src/App.tsx': `import './App.css';\nexport default function App(){return (<div className="app"><h1 className="center-word">SpaceX</h1></div>)}\n`,
  'src/App.css': '.app{min-height:100vh;background:#fef3c7}.center-word{color:#fff;font-weight:700}\n',
};

{
  const after = { ...files };
  for (const e of finalizeWebEdits(files, 'He changed the name to cursive instead of being bold', [])) {
    after[e.path] = e.content;
  }
  assert.match(after['src/App.tsx'], />SpaceX</);
  assert.doesNotMatch(after['src/App.tsx'], />cursive/i);
  assert.match(after['src/App.css'], /font-style:\s*italic|Georgia/i);
  assert.match(after['src/App.css'], /background:\s*#fef3c7/i);
  assert.equal(verifyAsk('Make the name look more cursive.', after).ok, true);
}

{
  const after = { ...files };
  for (const e of finalizeWebEdits(files, 'Change the color to black for the wording place', [])) {
    after[e.path] = e.content;
  }
  assert.match(after['src/App.tsx'], />SpaceX</);
  assert.match(after['src/App.css'], /color:\s*#000000/i);
  assert.match(after['src/App.css'], /background:\s*#fef3c7/i);
}

console.log('PASS  messy intent font + wording-place color');
