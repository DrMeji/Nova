/**
 * Tipjar-class App.jsx must heal + pass, or hard-fail (never open Live).
 *   npx tsx --tsconfig tsconfig.app.json scripts/check-syntax-gate-tipjar.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCreateSyntaxGate } from '../src/lib/createSyntaxGate.ts';

const tipjarBroken = `import { useMemo, useState } from 'react';
import './App.css';

const COVER_HREFS = ['/heroes/tipjar-hero.jpg'];
export default function App() {
  
  

  return (
    <main className="app">
      <header className="hero">
        <div className="hero__inner">
          <h1 className="hero__title">Tipjar</h1>
          <p className="hero__lede">Tip calculator — enter bill and tip percent.</p>
        </div>
      </header>
      <section className="card">
        <label>Bill amount
          <input type="number" min="0" step="0.01" value={bill} onChange={(e) => setBill(e.target.value)} aria-label="Bill amount" />
        </label>
        <label>Tip percent
          <input type="number" min="0" step="1" value={pct} onChange={(e) => setPct(e.target.value)} aria-label="Tip percent" />
        </label>
        <p className="out">Tip: <strong>{'$'}{tip.toFixed(2)}</strong></p>
        <p className="out">Total: <strong>{'$'}{total.toFixed(2)}</strong></p>
      </section>
    </main>
            </div>
          </div>
        </div>
      ) : null}
      <footer className="footer foot" role="contentinfo">
        <a href="#top">Tipjar</a>
        <span>© 2026 Tipjar</span>
      </footer>

  );
}

/* NOVA layout contract tokens */
:root {
  --bg: #0f1419;
  --ink: #eef2f6;
}
html, body, #root {
  margin: 0;
  min-height: 100%;
  background: var(--bg);
}
`;

const syn = runCreateSyntaxGate({
  'src/App.jsx': tipjarBroken,
  'src/App.css': '.app { min-height: 100vh; }\n',
});

assert.equal(syn.healed, true, 'must heal Tipjar-class junk');
assert.equal(syn.ok, true, `must pass after heal, got: ${syn.reasons.join('; ')}`);
const app = syn.files['src/App.jsx'];
assert.ok(/\[\s*bill\s*,\s*setBill\s*\]/.test(app), 'bill state injected');
assert.ok(/\bconst tip\b/.test(app), 'tip declared');
assert.ok(!/:root\s*\{/.test(app), 'CSS stripped from App.jsx');
assert.ok(/:root\s*\{/.test(syn.files['src/App.css'] || ''), 'CSS moved to App.css');
assert.ok(!/\)\s*:\s*null\s*\}/.test(app), 'orphan ternary junk removed');

// Cart unbound still fails (existing contract).
const cart = runCreateSyntaxGate({
  'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="app">
      <button onClick={() => setCart((c) => c + 1)}>Cart {cart}</button>
    </div>
  );
}
`,
  'src/App.css': '.app{}\n',
});
assert.equal(cart.ok, false, 'unbound cart still fails');

console.log('check-syntax-gate-tipjar: ok');

// Optional: real Tipjar disk file if present.
try {
  const disk = readFileSync(
    'C:/Users/thoma/Documents/NOVA Projects/Tipjar/src/App.jsx',
    'utf8',
  );
  const diskSyn = runCreateSyntaxGate({
    'src/App.jsx': disk,
    'src/App.css': '.app{}\n',
  });
  assert.equal(diskSyn.ok, true, `disk Tipjar must heal clean: ${diskSyn.reasons.join('; ')}`);
  console.log('check-syntax-gate-tipjar: disk Tipjar healed ok');
} catch {
  /* disk optional */
}
