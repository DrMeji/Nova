/**
 * App.jsx harden — TS strip, thin craft rules lock jsx, finish prompt, no floor.
 *   npm run smoke:app-jsx-harden
 */
import assert from 'node:assert/strict';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
}

const {
  isThinCreatePath,
  formatThinCreateCraftRules,
  formatFinishAppPrompt,
  thinAppNeedsFinishPass,
  thinCraftMayContinue,
  THIN_CREATE_APP_PATH,
} = await import('../src/lib/createThinPath.ts');
const { runCreateSyntaxGate } = await import('../src/lib/createSyntaxGate.ts');
const { jsxSourceHasTypeScriptOnlySyntax } = await import('../src/lib/freshSpaFromBrief.ts');
const { stripToolMarketingBleed } = await import('../src/lib/createProductPlan.ts');

assert.equal(isThinCreatePath(), true);
assert.equal(THIN_CREATE_APP_PATH, 'src/App.jsx');

const rules = formatThinCreateCraftRules({
  brief: 'Build Mossmeter plant tracker',
  productName: 'Mossmeter',
  preferTs: true, // ignored — always jsx
}).join('\n');
assert.match(rules, /src\/App\.jsx/);
assert.doesNotMatch(rules, /src\/App\.tsx/);
assert.match(rules, /NO TypeScript|plain JavaScript/i);

const brokenTs = {
  'src/App.jsx': `import './App.css';
import React, { useState } from 'react';
const COVER_HREFS = ["/heroes/x.svg"];
const App = () => {
  const [plants, setPlants] = useState<Array<{ id: string; name: string }>>([
    { id: 'p1', name: 'Fern' },
  ]);
  return (
    <div className="app">
      <h1>Mossmeter</h1>
      <ul>{plants.map(p => <li key={p.id}>{p.name}</li>)}</ul>
      <button type="button" onClick={() => setPlants([])}>Clear</button>
    </div>
  );
};
export default App;
`,
  'src/App.css': '.app{padding:2rem}',
};

assert.equal(jsxSourceHasTypeScriptOnlySyntax(brokenTs['src/App.jsx']), true);
const syn = runCreateSyntaxGate(brokenTs);
assert.equal(syn.healed, true, 'TS strip should heal');
assert.equal(jsxSourceHasTypeScriptOnlySyntax(syn.files['src/App.jsx']), false, 'TS should be gone');
assert.ok(!/<Array/.test(syn.files['src/App.jsx']), 'generics stripped');
assert.equal(syn.ok, true, `syntax should pass after strip: ${syn.reasons.join('; ')}`);

const trunc = {
  'src/App.jsx': `import './App.css';
export default function App() {
  const allIds = new Set(plants.map(p => p.id
`,
  'src/App.css': '.app{}',
};
const synTrunc = runCreateSyntaxGate(trunc);
assert.equal(synTrunc.ok, false);
assert.ok(thinAppNeedsFinishPass(trunc, synTrunc.reasons));

const finish = formatFinishAppPrompt({
  brief: 'plant watering tracker',
  productName: 'Mossmeter',
  brokenApp: trunc['src/App.jsx'],
});
assert.match(finish, /FINISH APP/i);
assert.match(finish, /@@@FILE src\/App\.jsx/);
assert.match(finish, /NO TypeScript/i);

const cleaned = stripToolMarketingBleed(brokenTs['src/App.jsx']);
assert.ok(!/COVER_HREFS/.test(cleaned), 'COVER stripped');

// CSS-only gate fails must not block a complete App under thin.
const goodAppThinCss = {
  'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="app">
      <h1>Dewledger</h1>
      <button type="button">Log watering</button>
    </div>
  );
}
`,
  'src/App.css': '.app{',
};
assert.equal(
  thinCraftMayContinue(goodAppThinCss, false, ['App.css looks truncated mid-write']),
  true,
  'CSS-only trunc must continue',
);
assert.equal(
  thinCraftMayContinue(goodAppThinCss, false, ['App.jsx looks truncated mid-write']),
  false,
  'App trunc must still fail',
);

// Near-complete App missing only root </div> — heal + continue (Rainkeep shape).
const missingRootClose = {
  'src/App.jsx': `import React, { useState } from 'react';
const App = () => {
  const [plants, setPlants] = useState([]);
  return (
    <div className="app">
      <header><h1>Rainkeep</h1></header>
      <main>
        <ul>{plants.map(p => (
          <li key={p}>{p}</li>
        ))}</ul>
      </main>

  );
};
export default App;
`,
  'src/App.css': '.app{padding:1rem}',
};
const synMissing = runCreateSyntaxGate(missingRootClose);
assert.equal(synMissing.healed, true, 'should heal missing root close');
assert.equal(synMissing.ok, true, `healed App should pass: ${synMissing.reasons.join('; ')}`);
assert.match(synMissing.files['src/App.jsx'], /<\/main>\s*<\/div>\s*\);/s);
assert.equal(thinCraftMayContinue(synMissing.files, synMissing.ok, synMissing.reasons), true);

console.log('smoke-app-jsx-harden: ok');
