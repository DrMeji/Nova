/**
 * Smoke: LayoutContract gates must fail AppleHome-class layouts and pass clean product bands.
 * npx tsx --tsconfig tsconfig.app.json scripts/smoke-layout-contract.mjs
 */
import {
  buildProductSpec,
  briefForbidsAbsoluteRails,
  genreFloor,
  scoreLayoutQuality,
  scoreFunctionalReady,
  formatEnsembleBriefBlock,
  defaultCopyPack,
} from '../src/lib/createLayoutContract.ts';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const appleBrief = 'Build an apple.com style homepage for Apple with MacBook iPad Apple Watch AirPods full-bleed product bands';
assert(briefForbidsAbsoluteRails(appleBrief), 'apple brief should forbid absolute rails');

const spec = buildProductSpec({ brief: appleBrief, productName: 'Apple Home' });
assert(spec.genre === 'product-homepage', `expected product-homepage got ${spec.genre}`);
const contract = genreFloor(spec.genre);
assert(contract.hero.fullBleed === true, 'product homepage hero must be fullBleed');
assert(contract.forbid.includes('absolute-icon-rail'), 'floor must forbid icon rails');

const badFiles = {
  'package.json': '{"dependencies":{"react":"18","vite":"5"}}',
  'index.html': '<!DOCTYPE html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
  'src/main.jsx': "import React from 'react'; import { createRoot } from 'react-dom/client'; import App from './App.jsx'; createRoot(document.getElementById('root')).render(<App />);",
  'src/App.jsx': `export default function App() {
  return (
    <div className="app">
      <div className="icon-rail icon-rail--top-left"><img src="/icons/search.svg" /></div>
      <div className="brand-rail"><img src="/logos/x.svg" /></div>
      <div className="product-card">MacBook</div>
      <div className="product-card">iPad</div>
    </div>
  );
}`,
  'src/App.css': `.app{background:#f4f1ea;position:relative}
.icon-rail{position:absolute;left:0;top:0;width:64px;background:#000}
.brand-rail{position:absolute;top:1rem;left:1rem}
.product-card{background:#222;color:#1a1a1a;padding:2rem}`,
};

const bad = scoreLayoutQuality(badFiles, { brief: appleBrief, spec, contract });
assert(!bad.ok, `bad layout should fail Ready, got score=${bad.score} reasons=${bad.reasons.join('; ')}`);
assert(bad.reasons.some((r) => /icon-rail/i.test(r)), 'should flag icon-rail');

const goodFiles = {
  ...badFiles,
  'src/App.jsx': `export default function App() {
  return (
    <div className="app">
      <nav className="nav"><strong className="wordmark">Apple</strong></nav>
      <section className="hero product-band full-bleed"><h1>iPhone</h1><p>Super Retina</p><button>Learn more</button></section>
      <section className="product-band full-bleed"><h2>MacBook</h2></section>
      <section className="product-band full-bleed"><h2>iPad</h2></section>
      <footer className="footer">Copyright</footer>
    </div>
  );
}`,
  'src/App.css': `:root{--bg:#f5f5f7;--ink:#1d1d1f;--accent:#0071e3}
.app{background:var(--bg);color:var(--ink)}
.hero,.product-band{min-height:90vh;width:100%;display:grid;place-items:center}
.nav{display:flex;gap:1rem}
button{background:var(--accent);color:#fff}`,
};

const good = scoreLayoutQuality(goodFiles, { brief: appleBrief, spec, contract });
assert(good.ok, `good layout should pass, reasons=${good.reasons.join('; ')}`);

const func = scoreFunctionalReady(goodFiles, { brief: appleBrief, spec });
assert(func.ok, `functional should pass, reasons=${func.reasons.join('; ')}`);

const copy = defaultCopyPack(spec, contract);
const block = formatEnsembleBriefBlock(spec, contract, copy);
assert(/LayoutContract/.test(block) && /CopyPack/.test(block), 'brief block must include contracts');

console.log('smoke-layout-contract: OK', { genre: spec.genre, badScore: bad.score, goodScore: good.score });
