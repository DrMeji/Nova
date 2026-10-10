/**
 * Every marketing/brand create must ship public/logo.svg (from logoIconifyFor(brief),
 * offline) and wire <img src="/logo.svg"> in the nav — a hero image may never stand in
 * as the brand mark. Systemic (wireCreatePublicAssets chokepoint), not one-project.
 * Run: npm run smoke:brand-logo-wire
 */
import assert from 'node:assert/strict';
import { wireCreatePublicAssets } from '../src/lib/createBuildQuality.ts';
import { logoIconifyFor, brandLogoSvgFor } from '../src/lib/brandAssets.ts';

// No network in this smoke — the mark must come from the bundled Lucide map.
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error('network disabled in smoke');
};

const BRIEF = 'Build a website for a small-batch matcha brand called Verdigris Matcha Co. '
  + 'Invent an original brand page — do not copy apple.com. Include: mountain origin story, '
  + 'a tin hero, tasting notes, and Shop + Steep guides CTAs. Make it a full multi-section page.';

/** The exact failure shape from the live retest: hero <img> used as the nav logo. */
function verdigrisFiles() {
  return {
    'src/App.jsx': [
      "import React from 'react';",
      "import './App.css';",
      'const COVER_HREFS = ["/heroes/verdigris-matcha-co-hero.svg","/heroes/verdigris-matcha-co-story.svg"];',
      'const App = () => (',
      '  <div className="app">',
      '    <nav className="nav">',
      '      <img src="/heroes/verdigris-matcha-co-hero.svg" alt="Verdigris Matcha Co" className="nav-logo" />',
      '      <ul className="nav-links"><li>Shop</li></ul>',
      '    </nav>',
      '    <section className="section origin-story"><h2>Our Mountain Origin Story</h2></section>',
      '    <section className="section tin-hero">',
      '      <img src="/heroes/verdigris-matcha-co-hero.svg" alt="Verdigris Matcha Tin" />',
      '    </section>',
      '  </div>',
      ');',
      'export default App;',
      '',
    ].join('\n'),
    'src/App.css': `.app{background:#0f1419;color:#e8eef4}
.nav{display:flex;gap:1rem;align-items:center}
.nav-logo{width:36px;height:36px}
.section{padding:3rem 1.5rem}
${'/* padding */'.repeat(60)}`,
    'public/heroes/verdigris-matcha-co-hero.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'public/heroes/verdigris-matcha-co-story.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  };
}

// 1) Family mark comes from the brief, and the offline builder produces a real SVG.
assert.equal(logoIconifyFor('Verdigris Matcha Co', BRIEF), 'lucide:leaf', 'matcha brief → leaf mark');
{
  const mark = brandLogoSvgFor({ productName: 'Verdigris Matcha Co', brief: BRIEF });
  assert.ok(mark.includes('<svg'), 'brandLogoSvgFor returns SVG');
  assert.ok(mark.includes('stroke='), 'mark is a stroked Lucide glyph');
}

// 2) Missing public/logo.svg → synthesized + nav wired, hero image no longer the logo.
{
  const files = verdigrisFiles();
  const out = wireCreatePublicAssets(files, 'Verdigris Matcha Co', BRIEF);
  const app = out.files['src/App.jsx'];

  assert.ok(out.changed.includes('public/logo.svg'), 'public/logo.svg is materialized');
  assert.ok(out.files['public/logo.svg']?.includes('<svg'), 'logo.svg has a real body');
  assert.ok(/src=["']\/logo\.svg["']/.test(app), 'nav <img> points at /logo.svg');
  assert.ok(
    !/className="nav-logo"[^>]*src=["']\/heroes\//.test(app) && !/src=["']\/heroes\/[^"']*["'][^>]*className="nav-logo"/.test(app),
    'nav logo is never a hero image',
  );
  assert.ok(
    /className="nav-logo"[^>]*src=["']\/logo\.svg["']/.test(app) || /src=["']\/logo\.svg["'][^>]*className="nav-logo"/.test(app),
    'existing brand <img> is rewritten in place (no duplicate nav)',
  );
  // The content hero must stay a hero — only the brand mark moves to /logo.svg.
  assert.ok(/alt="Verdigris Matcha Tin"/.test(app), 'tin hero keeps its markup');
  assert.ok(
    /<img src=['"]\/heroes\/verdigris-matcha-co-hero\.svg['"] alt="Verdigris Matcha Tin"/.test(app),
    'non-brand hero <img> still points at /heroes/',
  );

  // 3) Idempotent — a second pass must not restamp or duplicate the mark.
  const again = wireCreatePublicAssets(out.files, 'Verdigris Matcha Co', BRIEF);
  assert.ok(!again.changed.includes('public/logo.svg'), 'logo.svg is written once');
  assert.equal(
    (again.files['src/App.jsx'].match(/\/logo\.svg/g) || []).length,
    (app.match(/\/logo\.svg/g) || []).length,
    'nav logo is not injected twice',
  );

  // 4) Public file participates in write-back (disk save filters keep public/*.svg).
  assert.ok(
    /\/logo\.svg/i.test('public/logo.svg'),
    'logo path is public/logo.svg → served as /logo.svg',
  );
}

// 5) Brand page with no logo reference at all → mark materialized AND injected in nav.
{
  const files = {
    'src/App.jsx': [
      "import React from 'react';",
      "import './App.css';",
      'const App = () => (',
      '  <div className="app">',
      '    <header className="header"><h1>Steepwell Tea</h1></header>',
      '    <section className="section"><h2>Our Story</h2></section>',
      '  </div>',
      ');',
      'export default App;',
      '',
    ].join('\n'),
    'src/App.css': '.app{background:#0f1419}.header{padding:2rem}',
  };
  const brief = 'Build a marketing website for a premium tea brand called Steepwell with hero and story sections.';
  const out = wireCreatePublicAssets(files, 'Steepwell', brief);
  const app = out.files['src/App.jsx'];
  assert.ok(out.files['public/logo.svg']?.includes('<svg'), 'logo.svg materializes for a fresh brand page');
  assert.ok(/src=["']\/logo\.svg["']/.test(app), 'nav logo injected when the model never referenced it');
}

// 6) Non-brand creates must not get a stamped mark (gate stays marketing/brand only).
{
  const files = {
    'src/App.jsx': [
      "import React from 'react';",
      "import './App.css';",
      'const App = () => (',
      '  <div className="app"><h1>Tip Jar</h1><input /></div>',
      ');',
      'export default App;',
      '',
    ].join('\n'),
    'src/App.css': '.app{background:#111}',
  };
  const out = wireCreatePublicAssets(files, 'TipJar', 'Add a tip calculator tool panel.');
  assert.ok(!out.files['public/logo.svg'], 'utility/tool creates stay logo-free');
}

assert.equal(fetchCalls, 0, 'no network calls — bundled Lucide only');
console.log('ok brand-logo-wire');
