/**
 * Blank-Live crash: React.useState without import React must fail Ready + heal.
 * npx tsx --tsconfig tsconfig.app.json scripts/smoke-react-import-heal.mjs
 */
import assert from 'node:assert/strict';
import {
  appUsesReactNamespaceWithoutImport,
  ensureReactImportForNamespace,
  isEmptyOrStubAppSource,
  isPreviewReady,
} from '../src/lib/createBuildQuality.ts';

const broken = `import './App.css';
const App = () => {
  const [q, setQ] = React.useState('');
  return (
    <div className="app">
      <nav className="navbar"><h1>Brand</h1></nav>
      <div className="hero"><img src="/heroes/brand-hero.jpg" alt="" /></div>
      <div className="product-grid"><div className="product-card"><h2>Item</h2><p>Blurb</p><button>Buy</button></div></div>
    </div>
  );
};
export default App;`;

assert.equal(appUsesReactNamespaceWithoutImport(broken), true);
assert.equal(isEmptyOrStubAppSource(broken), true);

const healed = ensureReactImportForNamespace(broken);
assert.equal(appUsesReactNamespaceWithoutImport(healed), false);
assert.match(healed, /^import React from 'react';/);

const filesBroken = {
  'src/App.tsx': broken,
  'src/App.css': ':root { --bg: #111; } .app { min-height: 100vh; }',
  'src/main.tsx': "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);",
  'index.html': '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  'package.json': '{"dependencies":{"react":"18"},"devDependencies":{"vite":"5"}}',
};
const readyBroken = isPreviewReady(filesBroken, { productName: 'Brand' });
assert.equal(readyBroken.ok, false, readyBroken.reasons.join('; '));
assert.ok(readyBroken.reasons.some((r) => /React\.\*|importing React/i.test(r)), readyBroken.reasons.join('; '));

const filesHealed = { ...filesBroken, 'src/App.tsx': healed };
// May still fail other reasons (thin css) — but not React import
const readyHealed = isPreviewReady(filesHealed, { productName: 'Brand' });
assert.ok(!readyHealed.reasons.some((r) => /importing React/i.test(r)), readyHealed.reasons.join('; '));

console.log('smoke:react-import-heal ok');
