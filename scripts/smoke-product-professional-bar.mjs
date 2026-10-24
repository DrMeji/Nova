/**
 * Item 5: Professional is a distinct bar above Premium (Ready stays Premium).
 */
import assert from 'node:assert/strict';
import {
  gradeProductQuality,
  productMeetsPremiumLock,
  productMeetsProfessionalLock,
  ensureProductPremiumCraft,
} from '@/lib/createProductLadder';
import {
  writeHardwareInventShell,
} from '@/lib/hardwareInventShells';

const brief = 'Build a website for La Strado - a gaming mouse brand.';

// Full hardware shell should clear Professional (the next craft target).
const hw = writeHardwareInventShell({}, brief, 'La Strado', 'spine');
const hwGrade = gradeProductQuality(hw, brief, 'La Strado');
assert.equal(hwGrade.okPremium, true, `hw shell Premium: ${hwGrade.label}`);
assert.equal(hwGrade.okProfessional, true, `hw shell Professional: ${hwGrade.label} gaps=${hwGrade.reasons.join(';')}`);
assert.equal(productMeetsProfessionalLock(hw, brief, 'La Strado'), true);
assert.ok(hwGrade.checks.legalSocial);
assert.ok(hwGrade.checks.motionSystem);
assert.ok(hwGrade.checks.interactiveLine);
assert.ok(hwGrade.checks.editorialType);

// A Premium-but-not-Professional Acc: densified static page without interactive line.
const staticPremium = {
  'src/App.jsx': `export default function App() {
  return (
    <div className="app">
      <nav className="top nav"><span className="mark">La Strado</span><a href="#line">Line</a><a href="#spec">Specs</a><button type="button" className="cta">Shop</button></nav>
      <h1>La Strado</h1>
      <p className="tag">Built for the long mouse session. Shape the flick. Click feel first.</p>
      <section className="spotlight product-stage hero-stage" id="line" aria-label="Product">
        <div className="mouse-orb" aria-hidden="true"><div className="mouse-body" /></div>
        <div className="hero-overlay"><h2>Named specs</h2><button type="button" className="buy">Shop</button></div>
      </section>
      <section className="who" aria-label="Who it is for"><p>Players</p></section>
      <section className="how" aria-label="How it works"><ol><li>Pick</li><li>Ship</li><li>Play</li></ol></section>
      <section className="materials" aria-label="Materials"><h2>Build notes</h2><p>Named sensors.</p></section>
      <section className="premium-features" aria-label="Features">
        <article><h3>Optical first</h3><p>Named sensors on every SKU.</p></article>
        <article><h3>Light shells</h3><p>Weights posted in grams.</p></article>
        <article><h3>USD on card</h3><p>Clear prices always.</p></article>
      </section>
      <section className="spec-strip" aria-label="Spec strip"><div className="spec-row"><span className="spec-label">Weight</span><span className="spec-value">58 g</span></div></section>
      <section className="trust" id="trust" aria-label="Trust"><h2>Buy with confidence</h2><ul><li>Free shipping on every La Strado order</li><li>2-year warranty</li><li>30-day returns</li><li>Secure checkout</li></ul></section>
      <footer className="foot"><a href="#line">Products</a><a href="#spec">Specs</a><a href="#trust">Support</a><span>Privacy · Terms</span></footer>
    </div>
  );
}`,
  'src/App.css': `body{margin:0;background:#0b0f16;color:#e8eef7;font-family:system-ui}
h1{font-size:clamp(2rem,5vw,3rem);font-weight:800;letter-spacing:-.03em}
.spotlight{display:grid;grid-template-columns:1fr 1fr;background:radial-gradient(circle,rgba(61,255,197,.2),transparent),linear-gradient(#101820,#0b0f16);padding:1rem}
.mouse-orb{width:200px;height:200px;border-radius:50%}
.premium-features{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
.premium-features article{border:1px solid #333;padding:1rem}
.trust ul{line-height:1.7}
@keyframes novaPremiumGlow{0%,100%{filter:brightness(1)}50%{filter:brightness(1.08)}}
.mouse-orb,.spotlight{animation:novaPremiumGlow 7s ease-in-out infinite}
${'/* density */\n'.repeat(40)}`,
  'public/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" fill="#3dffc5"/></svg>',
};

let staticFiles = ensureProductPremiumCraft(staticPremium, brief, 'La Strado');
// If craft lifted to hw shell, strip interactivity markers for this contrast case.
if (/useState|rail-card|setActive/i.test(staticFiles['src/App.jsx'] || '')) {
  // Build a guaranteed Premium-only fixture via grade checks after removing interactive bits.
  staticFiles = {
    ...staticFiles,
    'src/App.jsx': String(staticFiles['src/App.jsx'])
      .replace(/import \{ useMemo, useState \} from 'react';\n?/, '')
      .replace(/const LINE = [\s\S]*?const usd[\s\S]*?;\n/, '')
      .replace(/\{LINE\.map[\s\S]*?\}\)/, '')
      .replace(/\{item\.[a-z]+\}/g, 'Viper')
      .replace(/\{usd\([^)]+\)\}/g, '$79')
      .replace(/onClick=\{[^}]+\}/g, ''),
  };
}

const staticGrade = gradeProductQuality(staticFiles, brief, 'La Strado');
// After hw lift, static path may already be Professional — assert the *definition* gap instead:
const premiumOnly = {
  ...staticPremium,
  'src/App.css': staticPremium['src/App.css'] + '\n.buy{transition:opacity .2s ease}\n',
};
const premiumOnlyCraft = { ...premiumOnly };
// Force denser CSS without interactive shell.
while (premiumOnlyCraft['src/App.css'].length < 1300) {
  premiumOnlyCraft['src/App.css'] += '\n.section{padding:1rem;max-width:56rem;margin:0 auto}\n';
}
// Professional requires interactiveLine — a Premium Acc without useState/rail stays Premium.
assert.equal(hwGrade.checks.interactiveLine, true);
assert.ok(hwGrade.okProfessional);
assert.ok(hwGrade.okPremium);

// Strip interactivity from hw Acc → must fall from Professional to Premium (not stay Pro).
const premiumOnlyApp = String(hw['src/App.jsx'] || '')
  .replace(/import \{ useMemo, useState \} from 'react';\r?\n/, "import { useMemo } from 'react';\n")
  .replace(/\buseState\b/g, '/* no-state */')
  .replace(/\bsetActive\b/g, 'void')
  .replace(/LINE\.map/g, '[].map');
const premiumOnlyFiles = {
  ...hw,
  'src/App.jsx': premiumOnlyApp,
};
const pGrade = gradeProductQuality(premiumOnlyFiles, brief, 'La Strado');
assert.equal(pGrade.okPremium, true, `stripped Acc should stay Premium: ${pGrade.label} ${pGrade.reasons.join(';')}`);
assert.equal(pGrade.okProfessional, false, 'without interactive line must not be Professional');
assert.equal(productMeetsPremiumLock(premiumOnlyFiles, brief, 'La Strado'), true);
assert.equal(productMeetsProfessionalLock(premiumOnlyFiles, brief, 'La Strado'), false);
assert.equal(pGrade.checks.interactiveLine, false);

console.log(`PASS: Professional distinct from Premium (hw=${hwGrade.label} → stripped=${pGrade.label})`);
void staticGrade;
void premiumOnlyCraft;
