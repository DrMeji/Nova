/**
 * Item 3: ensureProductPremiumCraft uses real visual density — not CSS comment padding.
 */
import assert from 'node:assert/strict';
import {
  ensureProductPremiumCraft,
  gradeProductQuality,
} from '@/lib/createProductLadder';
import { accHasHardwareShell } from '@/lib/hardwareInventShells';

const brief = 'Build a website for La Strado — a gaming mouse brand.';

const thin = {
  'src/App.jsx': `export default function App() {
  return (
    <div className="app">
      <nav className="top"><span className="mark">La Strado</span><a href="#f">Features</a></nav>
      <h1>La Strado</h1>
      <p className="tag">Built for claw, tip, or palm — shape the flick.</p>
      <button type="button" className="cta">Shop mice</button>
      <section className="who" aria-label="Who it is for"><p>Players who care about click feel.</p></section>
      <section className="how" aria-label="How it works"><ol><li>Pick</li><li>Ship</li><li>Play</li></ol></section>
      <article className="band"><h3>Optical first</h3><p>Named sensors.</p></article>
      <article className="band"><h3>Light shells</h3><p>Weights posted.</p></article>
      <article className="band"><h3>USD on card</h3><p>Clear prices.</p></article>
      <section className="spec-strip" aria-label="Spec strip"><div className="spec-row"><span>Weight</span><span>58 g</span></div></section>
      <footer><span>© La Strado</span></footer>
    </div>
  );
}`,
  'src/App.css': `body{margin:0;background:#0b0f16;color:#e8eef7}
.app{padding:1rem}
.top{display:flex;gap:1rem}
h1{font-size:2rem}
.cta{background:#3dffc5;border:0;padding:.6rem 1rem}
.band{border:1px solid #333;padding:1rem;margin:.5rem 0}
`,
  'public/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" fill="#3dffc5"/></svg>',
};

const before = gradeProductQuality(thin, brief, 'La Strado');
assert.equal(before.okPremium, false, 'thin Acc starts below Premium');

const next = ensureProductPremiumCraft(thin, brief, 'La Strado');
const after = gradeProductQuality(next, brief, 'La Strado');
assert.ok(after.okPremium, `premium craft should reach Premium, got ${after.label}: ${after.reasons.join('; ')}`);
assert.equal(accHasHardwareShell(next), true, 'hardware brief lifts to hw shell');
assert.match(next['src/App.css'], /nova-premium-density|data-nova-hw-shell|mouse-orb/);
assert.equal(
  /premium-craft css depth/i.test(next['src/App.css']),
  false,
  'must not pad CSS with depth comments',
);
assert.match(next['src/App.jsx'], /aria-label=["']Trust["']/);

console.log(`PASS: premium craft density (${before.label} → ${after.label})`);
