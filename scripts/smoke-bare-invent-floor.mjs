/**
 * Copper Loom Atelier iter-3: bare Vite / nav-only Acc must salvage invent floor.
 */
import assert from 'node:assert/strict';
import {
  isBareOrNavOnlyInventApp,
  seedCompositionalInventFloor,
  compositionalHeroNeedsPremiumFloor,
  compositionalSectionFileSubstantial,
  thinNeedsDepthPass,
  thinBlocksLivePreview,
  thinAskMatchDeficits,
} from '../src/lib/createThinPath.ts';

const brief = [
  'Create a new website project called Copper Loom Atelier on disk now.',
  'Professional premium leather-goods atelier site. Full-bleed quiet hero.',
  'Sticky top nav. A grid of 4 product cards. Story band. Skip Plan — get Live.',
].join(' ');

const bare = `import './App.css';

/** Bare Vite mount — craft owns the product UI (no phone-column title stub). */
export default function App() {
  return (
    <div className="app" id="root-app">
      <header className="sticky-nav" role="banner"><div className="nav-left"><img className="nav-logo" src="/logo.svg" alt="Copper Loom Atelier" width="36" height="36" /></div><div className="nav-right"></div></header>

    </div>
  );
}
`;

assert.equal(isBareOrNavOnlyInventApp(bare), true, 'nav-only root-app is bare');

const files = {
  'src/App.jsx': bare,
  'src/App.css': '.app{min-height:100vh;background:#f7f4ef}',
  'public/logo.svg': '<svg viewBox="0 0 64 64" data-nova-invent-logo="1"><text x="32" y="40">C</text></svg>',
};

assert.equal(thinNeedsDepthPass(files, brief), true, 'depth stays open on bare');
assert.equal(thinBlocksLivePreview(files, brief, 'Copper Loom Atelier'), true, 'Live blocked on bare');
assert.ok(
  thinAskMatchDeficits(files, brief, 'Copper Loom Atelier').some((m) => /bare Vite|nav-only/i.test(m)),
  'ask-match flags bare',
);

const next = seedCompositionalInventFloor(files, brief, 'Copper Loom Atelier');
assert.match(next['src/App.jsx'], /<HeroSection\b/, 'HeroSection mounts');
assert.match(next['src/App.jsx'], /CatalogSection|StorySection/, 'shop/story mount');
assert.ok(next['src/sections/HeroSection.jsx'], 'hero file');
assert.match(next['src/sections/HeroSection.jsx'], /Copper Loom Atelier/);
assert.match(String(next['src/sections/CatalogSection.jsx'] || ''), /Weekender/);
assert.doesNotMatch(String(next['src/sections/CatalogSection.jsx'] || ''), /Product One|Bag One|Book One/);
assert.equal(isBareOrNavOnlyInventApp(next['src/App.jsx']), false, 'salvaged App not bare');
assert.ok(
  next['src/sections/HeroSection.jsx'].replace(/\s+/g, '').length >= 280,
  'hero clears thin-hero floor',
);

// Pine Latch: invent overwrote floor hero with title+lede while shop/story landed —
// early-exit used to skip; premium top-up must still restore the hero.
const pineThinHero = `import './HeroSection.css';
export default function HeroSection() {
  return (
    <div className="hero" style={{ backgroundImage: 'url(/hero.jpg)' }}>
      <div className="hero-stage">
        <h1 className="hero-title">Pine Latch Atelier</h1>
        <p className="hero-lede">Handcrafted leather goods</p>
      </div>
    </div>
  );
}
`;
assert.equal(
  compositionalSectionFileSubstantial(pineThinHero),
  false,
  'title+lede hero is not premium-substantial',
);
assert.equal(
  compositionalHeroNeedsPremiumFloor({ 'src/sections/HeroSection.jsx': pineThinHero }),
  true,
  'thin hero needs premium floor',
);
const pineAcc = {
  'src/App.jsx': `import './App.css';
import NavHeaderSection from './sections/NavHeaderSection';
import HeroSection from './sections/HeroSection';
import CatalogSection from './sections/CatalogSection';
import StorySection from './sections/StorySection';
export default function App() {
  return (
    <div className="app">
      <NavHeaderSection />
      <HeroSection />
      <CatalogSection />
      <StorySection />
    </div>
  );
}
`,
  'src/App.css': '.app{min-height:100vh;background:#f4efe6}',
  'src/sections/HeroSection.jsx': pineThinHero,
  'src/sections/CatalogSection.jsx': `${next['src/sections/CatalogSection.jsx']}`,
  'src/sections/StorySection.jsx': `${next['src/sections/StorySection.jsx']}`,
  'src/sections/NavHeaderSection.jsx': `${next['src/sections/NavHeaderSection.jsx']}`,
};
const pineFixed = seedCompositionalInventFloor(pineAcc, brief, 'Pine Latch Atelier');
assert.ok(
  pineFixed['src/sections/HeroSection.jsx'].replace(/\s+/g, '').length >= 280,
  'overwrite thin hero gets premium top-up',
);
assert.match(pineFixed['src/sections/HeroSection.jsx'], /Pine Latch Atelier/);
assert.match(pineFixed['src/sections/HeroSection.jsx'], /hero-cta|Shop the collection/);
assert.equal(
  compositionalHeroNeedsPremiumFloor(pineFixed),
  false,
  'after top-up hero clears premium floor',
);

console.log('smoke-bare-invent-floor: ok');
