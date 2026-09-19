import assert from 'node:assert/strict';
import { finalizeWebEdits } from '../src/lib/webProjectCanon.ts';
import { minEditPaceMs, looksLikeHeavyImageAsk } from '../src/lib/editPace.ts';

assert.equal(looksLikeHeavyImageAsk('Build a premium movie-like cinematic background only.'), true);
assert.ok(minEditPaceMs('add a menu icon') >= 1600);
assert.ok(minEditPaceMs('cinematic background image') >= 60000);

const files = {
  'src/App.tsx': `import './App.css';\nexport default function App(){return <div className="app" />}\n`,
  'src/App.css': '.app{min-height:100vh;background:#111}\n',
};
const next = { ...files };
for (const e of finalizeWebEdits(files, 'Build a premium movie-like cinematic background only. Soft overlapping light orbs. No text, no icons, no logos.', [])) {
  next[e.path] = e.content;
}
assert.match(next['src/App.css'], /background-image:\s*url\('\/heroes\/cinema\.jpg'\)/);
assert.match(next['src/App.css'], /\.orb-a/);
assert.match(next['src/App.tsx'], /orb orb-a/);
assert.doesNotMatch(next['src/App.tsx'], /center-word|brand-rail|icon-rail|nav-icon/);
console.log('PASS cinema surgical + pace');
