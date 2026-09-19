/**
 * Stepwise solid background colors: verifyAsk + surgical patch.
 */
import assert from 'node:assert/strict';
import { verifyAsk } from '../src/lib/verifyAsk.ts';
import {
  finalizeWebEdits,
  reactSurgicalMicroAskEdits,
  isWebMicroAsk,
} from '../src/lib/webProjectCanon.ts';

const black = {
  'src/App.jsx': `import './App.css';\nexport default function App(){return <div className="app" />}\n`,
  'src/App.css': `.app {\n  min-height: 100vh;\n  margin: 0;\n  background: #000000;\n}\n`,
  'src/index.css': `html, body, #root { height: 100%; margin: 0; background: #000000; }\n`,
};

assert.equal(isWebMicroAsk('change the background to brown'), true);
assert.equal(isWebMicroAsk('add Brown background color'), true);
assert.equal(isWebMicroAsk('change it to pink'), true);
assert.equal(verifyAsk('add Brown background color', black).ok, false);

const brownEdits = reactSurgicalMicroAskEdits(black, 'add Brown background color');
assert.ok(brownEdits.some((e) => /App\.css/i.test(e.path)));
const brownCss = brownEdits.find((e) => /App\.css/i.test(e.path))?.content || '';
assert.match(brownCss, /background:\s*#8B4513/i);

const afterBrown = { ...black };
for (const e of finalizeWebEdits(black, 'add Brown background color', [])) {
  afterBrown[e.path] = e.content;
}
assert.equal(verifyAsk('make the background brown', afterBrown).ok, true);
assert.equal(verifyAsk('change the background to pink', afterBrown).ok, false);

const afterPink = { ...afterBrown };
for (const e of finalizeWebEdits(afterBrown, 'change the background to pink', [])) {
  afterPink[e.path] = e.content;
}
assert.match(afterPink['src/App.css'] || '', /background:\s*#ec4899/i);
assert.equal(verifyAsk('change the background to pink', afterPink).ok, true);

const afterBlue = { ...afterPink };
for (const e of finalizeWebEdits(afterPink, 'change the background to blue', [])) {
  afterBlue[e.path] = e.content;
}
assert.match(afterBlue['src/App.css'] || '', /background:\s*#2563eb/i);

const afterWhite = { ...afterBlue };
for (const e of finalizeWebEdits(afterBlue, 'change the background to white', [])) {
  afterWhite[e.path] = e.content;
}
assert.match(afterWhite['src/App.css'] || '', /background:\s*#ffffff/i);

console.log('PASS  stepwise background color surgical + verifyAsk');
