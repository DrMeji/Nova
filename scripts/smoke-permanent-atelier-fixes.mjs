/**
 * Permanent fixes: parchment dark-CSS stomp, Footer always mounts, App ../context heal.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-permanent-atelier-fixes.mjs
 */
import assert from 'node:assert/strict';
import {
  briefWantsLightPaperGround,
  detectHeroProductKind,
  svgHeroDataUrl,
} from '../src/lib/createIdentity.ts';
import { hasAtelierLeatherPlateArt } from '../src/lib/atelierLeatherPlate.ts';
import {
  inventFloorShellId,
  looksLikeClassicFourBoxAtelierShell,
} from '../src/lib/atelierInventShells.ts';
import { logoIconifyFor } from '../src/lib/brandAssets.ts';
import {
  healNearReadyCreateUi,
  healAtelierPaletteCss,
  cssHasDarkTechStomp,
  wireCreatePublicAssets,
} from '../src/lib/createBuildQuality.ts';
import {
  ensureLandedSectionsMountedInApp,
  healAppShellRelativeImports,
  healSectionRelativeImports,
  rewriteAppImportsForPageBody,
  thinAskMatchDeficits,
  looksLikeInventFloorTwin,
  inventFloorClearsLive,
  breakInventFloorTwin,
  ensureRelativeCssImportsExist,
  seedCompositionalInventFloor,
  ensureAtelierUniqueLayoutAcc,
  atelierAccMissingLayoutSalt,
  looksLikeHollowAtelierCraft,
  looksLikeEmptySwatchAtelier,
} from '../src/lib/createThinPath.ts';

const atelierBrief =
  'Create a parchment atelier leather-goods website for Fern Latch with soft paper grounds, espresso type, warm brass, hero, shop grid, story, and footer contact. Skip Plan.';

assert.equal(briefWantsLightPaperGround(atelierBrief), true, 'atelier brief wants light paper');
assert.equal(
  briefWantsLightPaperGround('Dark SaaS analytics dashboard charcoal UI'),
  false,
  'dark saas stays dark',
);

// 1) Dark tech atmosphere must not land on parchment briefs.
{
  const files = {
    'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="app">
      <header className="sticky-nav"><span>Fern Latch</span></header>
      <section className="hero"><h1>Fern Latch</h1></section>
      <section className="band"><h2>Story</h2></section>
      <footer className="footer">Visit</footer>
    </div>
  );
}
`,
    'src/App.css': `:root{--paper:#f4efe6;--ink:#142033}
.app{min-height:100vh;background:var(--paper);color:var(--ink)}
.hero{padding:4rem 8vw}
.band{padding:3rem 8vw}
.footer{padding:2rem 8vw}
`,
    'package.json': '{"name":"fern","dependencies":{"react":"^18","react-dom":"^18"}}',
    'index.html': '<div id="root"></div><script type="module" src="/src/main.jsx"></script>',
    'src/main.jsx': 'import {createRoot} from "react-dom/client";import App from "./App";createRoot(document.getElementById("root")).render(<App/>);',
  };
  const near = healNearReadyCreateUi(files, 'Fern Latch', atelierBrief);
  assert.equal(cssHasDarkTechStomp(near.files['src/App.css']), false, 'no dark stomp after heal');
  assert.doesNotMatch(near.files['src/App.css'], /#0c0f14/, 'no #0c0f14 on parchment');
  if (near.actions.includes('css-atmosphere')) {
    assert.match(near.files['src/App.css'], /#f4efe6|#efe8dc|#f7f2ea/, 'light atmosphere');
  }
}

// 2) Prior dark stomp is stripped.
{
  const stomped = `
:root{--paper:#f4efe6;--bg:#0f1419;--panel:#1a222c}
.app, .hero {
  background-image:
    radial-gradient(ellipse 55% 45% at 18% 22%, rgba(126,184,255,0.22), transparent 60%),
    linear-gradient(165deg, #0c0f14, #141a22 55%, #0c0f14);
}
`;
  const healed = healAtelierPaletteCss(stomped, atelierBrief);
  assert.equal(cssHasDarkTechStomp(healed), false, 'heal clears stomp');
  assert.match(healed, /--bg:\s*#f4efe6/, 'restores --bg paper');
}

// 3) wireCreatePublicAssets must not cream→dark on atelier briefs.
{
  const files = {
    'src/App.jsx': `import './App.css';
export default function App() {
  return <div className="app"><header className="sticky-nav">Fern</header></div>;
}
`,
    'src/App.css': ':root{--bg:#f3eee4;--panel:#faf7f0;--paper:#f4efe6}\n.app{background:var(--bg)}\n',
    'public/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  };
  const wired = wireCreatePublicAssets(files, 'Fern Latch', atelierBrief);
  assert.match(String(wired.files['src/App.css']), /--bg:\s*#f3eee4/, 'keeps cream --bg');
  assert.doesNotMatch(String(wired.files['src/App.css']), /--bg:\s*#0f1419/, 'no forced dark --bg');
}

// 4) Footer alone omitted → always remount.
{
  const files = {
    'src/App.jsx': `import './App.css';
import NavHeaderSection from './sections/NavHeaderSection.jsx';
import HeroSection from './sections/HeroSection.jsx';
export default function App() {
  return (
    <div className="app">
      <NavHeaderSection />
      <HeroSection />
    </div>
  );
}
`,
    'src/App.css': '.app{min-height:100vh;background:#f4efe6}',
    'public/logo.svg': '<svg viewBox="0 0 64 64"><text>F</text></svg>',
    'src/sections/NavHeaderSection.jsx': `export default function NavHeaderSection() {
  return <header className="nav-header sticky-nav" role="banner"><span>Fern Latch</span></header>;
}
`,
    'src/sections/HeroSection.jsx': `export default function HeroSection() {
  return (
    <section className="hero-section" id="hero">
      <div className="hero-stage"><img className="hero-art" src="/logo.svg" alt="" /></div>
      <h1 className="hero-title">Fern Latch</h1>
      <p className="hero-lede">Handcrafted bags on parchment grounds with warm brass.</p>
      <a className="hero-cta" href="#shop">Shop</a>
    </section>
  );
}
`,
    'src/sections/FooterSection.jsx': `export default function FooterSection() {
  return (
    <footer className="footer-section" id="contact" role="contentinfo">
      <p className="footer-brand">Fern Latch</p>
      <p>Visit the atelier · Write us for commissions</p>
    </footer>
  );
}
`,
  };
  const misses = thinAskMatchDeficits(files, atelierBrief, 'Fern Latch');
  assert.ok(
    misses.some((m) => /Footer\/Contact landed but App does not mount/i.test(m)),
    `expected footer deficit, got: ${misses.join('; ')}`,
  );
  const next = ensureLandedSectionsMountedInApp(files, atelierBrief, 'Fern Latch');
  assert.match(next['src/App.jsx'], /<FooterSection\b/, 'Footer mounts after ensureLanded');
  assert.match(next['src/App.jsx'], /<HeroSection\b/, 'Hero still mounts');
}

// 5) App.jsx ../context heal (PageBody rewrite must not leak onto shell).
{
  const badApp = `import './App.css';
import { Session } from '../context/session';
import HeroSection from './sections/HeroSection.jsx';
export default function App() {
  return <div className="app"><HeroSection /></div>;
}
`;
  assert.match(healAppShellRelativeImports(badApp), /from '\.\/context\/session'/);
  assert.doesNotMatch(healAppShellRelativeImports(badApp), /from '\.\.\/context\//);

  const sectionBroken = `import { Session } from './context/session';
export default function PageBodySection() {
  return <main>body</main>;
}
`;
  const rewritten = rewriteAppImportsForPageBody(sectionBroken);
  assert.match(rewritten, /from '\.\.\/context\/session'/);

  const tree = healSectionRelativeImports({
    'src/App.jsx': badApp,
    'src/sections/PageBodySection.jsx': sectionBroken,
    'src/context/session.js': 'export const Session = {};',
  });
  assert.match(tree['src/App.jsx'], /from '\.\/context\/session'/);
  assert.match(tree['src/sections/PageBodySection.jsx'], /from '\.\.\/context\/session'/);
}

// 6) Invent-floor twin must not clear Live / Ready on premium unique atelier asks.
{
  const twin = {
    'src/App.jsx': `import './App.css';
import NavHeaderSection from './sections/NavHeaderSection.jsx';
import HeroSection from './sections/HeroSection.jsx';
import CatalogSection from './sections/CatalogSection.jsx';
import StorySection from './sections/StorySection.jsx';
import FooterSection from './sections/FooterSection.jsx';
export default function App() {
  return (
    <div className="app">
      <NavHeaderSection /><HeroSection /><CatalogSection /><StorySection /><FooterSection />
    </div>
  );
}
`,
    'src/App.css': 'body{background:#f4efe6;color:#142033}'.repeat(80),
    'src/sections/HeroSection.jsx': `<section><h1>Willow Latch Atelier</h1><p>Handcrafted bags in quiet leather — cut, stitched, and finished by hand on a small atelier bench, not a factory line.</p><p>Parchment grounds, espresso type, warm brass hardware — a calm shop for everyday carry.</p></section>`,
    'src/sections/CatalogSection.jsx': `const PRODUCTS=[{name:'Willow Latch Weekender',material:'Full-grain vegetable-tanned leather'},{name:'Willow Latch Crossbody',material:'Bridle leather, brass hardware'},{name:'Willow Latch Tote',material:'Saddle leather'},{name:'Willow Latch Belt Bag',material:'Soft calfskin'}]; export default function CatalogSection(){return <section><h2>Shop</h2><p>Four everyday bags with honest materials and real names for this atelier.</p>{PRODUCTS.map(p=><article key={p.name}><h3>{p.name}</h3><p>{p.material}</p></article>)}</section>}`,
    'src/sections/StorySection.jsx': '<section><h2>Story</h2><p>craft</p></section>',
    'src/sections/FooterSection.jsx': '<footer><p>Visit the atelier · Write us for commissions · Open by appointment</p></footer>',
    'src/sections/NavHeaderSection.jsx': '<header><span>Willow Latch Atelier</span><nav><a href="#shop">Shop</a></nav></header>',
  };
  assert.equal(looksLikeInventFloorTwin(twin), true, 'detect Weekender twin');
  assert.equal(
    inventFloorClearsLive(twin, atelierBrief, 'Willow Latch Atelier'),
    false,
    'twin must not clear Live on atelier brief',
  );
  const deficits = thinAskMatchDeficits(twin, atelierBrief, 'Willow Latch Atelier');
  assert.ok(
    deficits.some((d) => /invent-floor twin/i.test(d)),
    `expected twin deficit, got: ${deficits.join(' | ')}`,
  );

  const seeded = seedCompositionalInventFloor({}, atelierBrief, 'Willow Latch Atelier');
  // Permanent floor: modern shell family — not classic four-box Latch stamp.
  assert.equal(
    looksLikeInventFloorTwin(seeded),
    false,
    'modern shell floor must not count as invent-floor twin',
  );
  assert.equal(
    looksLikeClassicFourBoxAtelierShell(seeded),
    false,
    'seed must not be classic sticky-nav + 4 equal cards',
  );
  assert.match(
    Object.values(seeded).join('\n'),
    /data-nova-shell="(?:lookbook|rail|feature|strip|commission)"/,
    'seed ships a modern shell family marker',
  );
  assert.doesNotMatch(
    String(seeded['src/sections/CatalogSection.jsx'] || ''),
    /Weekender[\s\S]{0,200}Crossbody[\s\S]{0,200}Tote[\s\S]{0,200}Belt Bag/,
    'seed must not use Weekender stamp SKUs',
  );
  const catSeed = String(seeded['src/sections/CatalogSection.jsx'] || '');
  if (/product-art|art:\s*["']data:image\/svg\+xml/.test(catSeed)) {
    assert.equal(hasAtelierLeatherPlateArt(catSeed), true, 'catalog art is v2 leather plate');
  }

  // Two brands must land different shell families or different catalog CSS.
  const seededB = seedCompositionalInventFloor({}, atelierBrief, 'Fox Latch Atelier');
  const shellA = inventFloorShellId('Willow Latch Atelier');
  const shellB = inventFloorShellId('Fox Latch Atelier');
  const cssA = String(seeded['src/sections/CatalogSection.css'] || '');
  const cssB = String(seededB['src/sections/CatalogSection.css'] || '');
  const navA = String(seeded['src/sections/NavHeaderSection.jsx'] || '');
  const navB = String(seededB['src/sections/NavHeaderSection.jsx'] || '');
  assert.ok(
    shellA !== shellB || cssA !== cssB || navA !== navB,
    `expected different shells/CSS/nav across brands, got ${shellA}/${shellB}`,
  );

  // Hazel Latch: Overnight/Shopper/Messenger/Card Sleeve salt set must count as twin.
  // Use pre-shell twin Acc (no data-nova-shell) so stamped catalog still detects.
  const overnightTwin = {
    ...twin,
    'src/sections/CatalogSection.jsx': `const PRODUCTS=[{name:'Hazel Latch Overnight'},{name:'Hazel Latch Shopper'},{name:'Hazel Latch Messenger'},{name:'Hazel Latch Card Sleeve'}];
export default function CatalogSection(){return <section><p>named for this bench, not a catalog filler</p>{PRODUCTS.map(p=>p.name)}</section>}`,
    'src/sections/StorySection.jsx': '<section><h2>Craft on a quiet bench</h2></section>',
  };
  assert.equal(looksLikeInventFloorTwin(overnightTwin), true, 'Overnight salt set is invent-floor twin');

  // Soft chrome alone (footer + hero class) must NOT block invent as a twin.
  const softChromeOnly = {
    'src/App.jsx': twin['src/App.jsx'],
    'src/sections/HeroSection.jsx': '<section className="hero-fullbleed"><h1>Northline Goods</h1><p>Custom lede about travel kits cut for city winters.</p></section>',
    'src/sections/CatalogSection.jsx': `const PRODUCTS=[{name:'Northline Duffle'},{name:'Northline Brief'},{name:'Northline Clutch'},{name:'Northline Strap'}];
export default function CatalogSection(){return <section>{PRODUCTS.map(p=><h3 key={p.name}>{p.name}</h3>)}</section>}`,
    'src/sections/FooterSection.jsx': '<footer><p>Visit the atelier · Write us for commissions · Open by appointment</p></footer>',
  };
  assert.equal(
    looksLikeInventFloorTwin(softChromeOnly),
    false,
    'shared footer/hero class alone is not an invent-floor twin',
  );

  // Fox Latch Travel Kit craft set must count as twin (Ready was clearing on it).
  const travelTwin = {
    ...twin,
    'src/sections/HeroSection.jsx': `<section className="hero-fullbleed"><h1>Fox Latch</h1><p>Cuts and finishes leather carry for people who notice the grain — quiet work, honest hardware, bags that earn their patina.</p></section>`,
    'src/sections/CatalogSection.jsx': `const PRODUCTS=[{name:'Fox Latch Travel Kit'},{name:'Fox Latch Daypack'},{name:'Fox Latch Envelope Clutch'},{name:'Fox Latch Key Folio'}];
export default function CatalogSection(){return <section className="catalog-grid"><div className="product-swatch"/><p>pieces cut for daily carry — materials named on the card</p></section>}`,
  };
  assert.equal(looksLikeInventFloorTwin(travelTwin), true, 'Travel Kit craft set is invent-floor twin');

  // Deterministic break: Overnight twin → brand-owned SKUs + different layout salt.
  const broken = breakInventFloorTwin(overnightTwin, atelierBrief, 'Hazel Latch Atelier');
  assert.equal(looksLikeInventFloorTwin(broken), false, 'breakInventFloorTwin clears twin');
  assert.doesNotMatch(
    String(broken['src/sections/CatalogSection.jsx'] || ''),
    /Overnight[\s\S]{0,200}Shopper[\s\S]{0,200}Messenger[\s\S]{0,200}Card Sleeve/,
  );
  assert.doesNotMatch(
    String(broken['src/sections/CatalogSection.jsx'] || ''),
    /Arc Duffle[\s\S]{0,200}Loom Brief[\s\S]{0,200}Ridge Pouch[\s\S]{0,200}Quill Case/,
  );
  assert.match(String(broken['src/sections/HeroSection.jsx'] || ''), /data-nova-layout-salt/);
  assert.match(String(broken['src/sections/CatalogSection.jsx'] || ''), /Hazel Latch \w+/);
  // Two brands must not share the same break SKU set (Arc Duffle stamp regression).
  const brokenB = breakInventFloorTwin(overnightTwin, atelierBrief, 'Velvet Latch Atelier');
  const skusA = String(broken['src/sections/CatalogSection.jsx'] || '');
  const skusB = String(brokenB['src/sections/CatalogSection.jsx'] || '');
  assert.notEqual(
    skusA.replace(/Hazel Latch/g, 'BRAND'),
    skusB.replace(/Velvet Latch/g, 'BRAND'),
    'break SKUs must be brand-owned, not one Arc Duffle stamp',
  );

  // Onyx Latch: hollow craft without layout salt must be forced unique.
  const hollow = {
    'src/App.jsx': twin['src/App.jsx'],
    'src/sections/HeroSection.jsx': `<section className="hero-fullbleed"><h1>Onyx Latch Atelier</h1><p>Handcrafted premium leather goods</p></section>`,
    'src/sections/CatalogSection.jsx': `<section><h2>Our Products</h2><h3>Espresso Briefcase</h3><h3>Brass Tote</h3></section>`,
    'src/sections/StorySection.jsx': '<section><h2>Our Craft</h2><p>craft</p></section>',
    'src/sections/FooterSection.jsx': '<footer><p>Contact us at info@onyxlatchatelier.com</p></footer>',
  };
  assert.equal(looksLikeHollowAtelierCraft(hollow, atelierBrief), true, 'detect hollow atelier craft');
  assert.equal(atelierAccMissingLayoutSalt(hollow, atelierBrief), true, 'hollow missing layout salt');
  const forced = ensureAtelierUniqueLayoutAcc(hollow, atelierBrief, 'Onyx Latch Atelier');
  assert.equal(atelierAccMissingLayoutSalt(forced, atelierBrief), false, 'ensure writes layout salt');
  assert.equal(looksLikeInventFloorTwin(forced), false, 'ensure clears twin after break');
  assert.equal(looksLikeClassicFourBoxAtelierShell(forced), false, 'ensure leaves classic four-box');
  assert.match(
    Object.values(forced).join('\n'),
    /data-nova-shell="(?:lookbook|rail|feature|strip|commission)"/,
    'ensure lands a modern shell',
  );
  assert.equal(
    looksLikeEmptySwatchAtelier(forced, atelierBrief),
    false,
    'forced Acc must not keep empty gradient swatches',
  );

  // Noir Latch stamp: empty product-swatch divs must block / be detected.
  const emptySwatch = {
    'src/sections/HeroSection.jsx': '<section className="hero-center hero-layout-3" data-nova-layout-salt="3"><div className="hero-stage"/><img className="hero-art"/><h1>Noir</h1></section>',
    'src/sections/CatalogSection.jsx': `export default function CatalogSection(){return <section data-nova-layout-salt="2">{[
      <div className="product-swatch"/>,<div className="product-swatch"/>,
      <div className="product-swatch"/>,<div className="product-swatch"/>
    ]}</section>}`,
  };
  assert.equal(looksLikeEmptySwatchAtelier(emptySwatch, atelierBrief), true, 'detect empty swatch stamp');
}

// 7) "espresso type" leather atelier must not become coffee mug / whole-bean bag.
{
  const leatherBrief =
    'Professional premium leather-goods atelier site. Soft parchment paper background, deep espresso navy type, warm brass accent. Handcrafted bags.';
  assert.equal(
    detectHeroProductKind('Oak Latch Atelier', leatherBrief),
    'bag',
    'leather + espresso type → bag, not coffee',
  );
  assert.equal(
    logoIconifyFor('Oak Latch Atelier', leatherBrief),
    'lucide:shopping-bag',
    'logo is shopping-bag not coffee',
  );
  const heroUrl = svgHeroDataUrl({
    name: 'Oak Latch Atelier',
    brief: leatherBrief,
  });
  assert.doesNotMatch(heroUrl, /whole%20bean|whole bean/i, 'hero art is not coffee roast bag');
  // Permanent v2 leather plate — grain + form, parchment ground, no baked brand copy.
  assert.match(heroUrl, /data-nova-atelier-plate|feTurbulence/i, 'hero art is v2 leather plate');
  assert.match(heroUrl, /c4a574|8b6914|efe6d6|f3ebe0|a8895c/i, 'hero art reads as leather on parchment');
  assert.doesNotMatch(heroUrl, /hand-stitched|Juniper|Oak Latch/i, 'bag SVG does not bake brand copy onto the art');
}

// 8) Section JSX that imports ./Foo.css must get a companion CSS file (Live Vite resolve).
{
  const healed = ensureRelativeCssImportsExist({
    'src/sections/CatalogSection.jsx': "import './CatalogSection.css';\nexport default function CatalogSection(){return <section/>}\n",
    'src/sections/HeroSection.jsx': "import './HeroSection.css';\nexport default function HeroSection(){return <section/>}\n",
    'src/App.jsx': "import './App.css';\nexport default function App(){return <div/>}\n",
    'src/App.css': '.app{min-height:100vh}',
  });
  assert.ok(String(healed['src/sections/CatalogSection.css'] || '').trim(), 'CatalogSection.css stubbed');
  assert.ok(String(healed['src/sections/HeroSection.css'] || '').trim(), 'HeroSection.css stubbed');
  assert.match(String(healed['src/sections/HeroSection.css'] || ''), /hero-fullbleed|hero-copy/, 'hero CSS is invent-floor quality');
  assert.equal(healed['src/App.css'], '.app{min-height:100vh}', 'existing App.css preserved');
  const bagUrl = svgHeroDataUrl({
    name: 'Cedar Latch Atelier',
    brief: 'Professional premium leather-goods atelier site. Soft parchment. Handcrafted bags.',
  });
  assert.doesNotMatch(bagUrl, /data-frame|5b9fd4/, 'bag hero has no UI chrome plate');
}

console.log('smoke-permanent-atelier-fixes: ok');
