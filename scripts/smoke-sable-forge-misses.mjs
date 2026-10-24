/**
 * Regression for Sable Forge Atelier premium fail-loop iter-2 misses:
 * thin Hero must mount; PageBody ./sections/ imports rewrite; missing data/products heals.
 */
import assert from 'node:assert/strict';
import {
  compositionalHeroFileMountable,
  compositionalSectionFileSubstantial,
  ensureLandedSectionsMountedInApp,
  assembleCompositionalAppShell,
  rewriteAppImportsForPageBody,
  healMissingSectionDataImports,
  unresolvedRelativeImportReasons,
  listLandedCompositionalSections,
} from '../src/lib/createThinPath.ts';
import { runCreateSyntaxGate } from '../src/lib/createSyntaxGate.ts';

const brief = [
  'Create a new website project called Sable Forge Atelier on disk now.',
  'Professional premium leather-goods atelier site. Full-bleed quiet hero.',
  'Sticky top nav. A grid of 4 product cards. Story band. Skip Plan — build it and get Live.',
].join(' ');

const thinHero = `import React from 'react';
import './Hero.css';
const Hero = () => {
  return (
    <section className="hero">
      <h1>Sable Forge Atelier</h1>
      <p>Handcrafted bags</p>
    </section>
  );
};
export default Hero;
`;

assert.equal(compositionalHeroFileMountable(thinHero), true, 'thin hero mountable');
assert.equal(
  compositionalSectionFileSubstantial(thinHero),
  false,
  'thin hero still not depth-substantial (top-up continues)',
);

const productGrid = `import React from 'react';
import './ProductGrid.css';
import { products } from '../data/products';
const ProductGrid = () => {
  return (
    <section className="product-grid">
      {products.map((product) => (
        <div key={product.id} className="product-card">
          <h2>{product.name}</h2>
          <p>{product.material}</p>
        </div>
      ))}
    </section>
  );
};
export default ProductGrid;
`;

const story = `import React from 'react';
import './Story.css';
const Story = () => {
  return (
    <section className="story">
      <h2>About Our Craft</h2>
      <p>At Sable Forge Atelier, we take pride in crafting each bag by hand, ensuring that every piece is unique and crafted with the finest materials. Our commitment to quality and attention to detail is reflected in every bag we create.</p>
    </section>
  );
};
export default Story;
`;

const brokenBody = `import Hero from './sections/Hero';
import ProductGrid from './sections/ProductGrid';
import Story from './sections/Story';
export default function PageBodySection() {
  return (
    <div className="app">
      <Hero />
      <ProductGrid />
      <Story />
    </div>
  );
}
`;

const files = {
  'src/App.jsx': `import './App.css';
import ProductGrid from './sections/ProductGrid.jsx';
import Story from './sections/Story.jsx';
import PageBodySection from './sections/PageBodySection.jsx';
export default function App() {
  return (
    <div className="app">
      <header className="sticky-nav" role="banner"><img src="/logo.svg" alt="Sable Forge Atelier" /></header>
      <ProductGrid />
      <Story />
      <PageBodySection />
    </div>
  );
}
`,
  'src/App.css': '.app{min-height:100vh;background:#f5f0e8}.hero{min-height:70vh}.story{padding:3rem}',
  'public/logo.svg': '<svg viewBox="0 0 64 64" data-nova-invent-logo="1"><text x="32" y="40">S</text></svg>',
  'src/sections/Hero.jsx': thinHero,
  'src/sections/Hero.css': '.hero{padding:4rem}',
  'src/sections/ProductGrid.jsx': productGrid,
  'src/sections/ProductGrid.css': '.product-grid{display:grid}',
  'src/sections/Story.jsx': story,
  'src/sections/Story.css': '.story{padding:2rem}',
  'src/sections/PageBodySection.jsx': brokenBody,
};

assert.match(
  rewriteAppImportsForPageBody(brokenBody),
  /from '\.\/Hero'/,
  'PageBody ./sections/Hero → ./Hero',
);
assert.doesNotMatch(
  rewriteAppImportsForPageBody(brokenBody),
  /from '\.\/sections\//,
  'no leftover ./sections/ after rewrite',
);

const missing = unresolvedRelativeImportReasons(files);
assert.ok(missing.some((r) => /data\/products/.test(r)), missing.join('; '));

const healedData = healMissingSectionDataImports(files, 'Sable Forge Atelier');
assert.ok(healedData['src/data/products.js'], 'seeds products.js');
assert.match(healedData['src/data/products.js'], /Weekender/);
assert.doesNotMatch(healedData['src/data/products.js'], /Product One|Bag One/);

const landed = listLandedCompositionalSections(files, brief, 'Sable Forge Atelier')
  .map((s) => s.componentName);
assert.ok(landed.includes('Hero'), `Hero mountable in landed: ${landed.join(',')}`);

const mounted = ensureLandedSectionsMountedInApp(files, brief, 'Sable Forge Atelier');
assert.match(mounted['src/App.jsx'], /<Hero\b/, 'Hero mounts after ensureLanded');
assert.doesNotMatch(
  String(mounted['src/sections/PageBodySection.jsx'] || ''),
  /from '\.\/sections\//,
  'assembled/healed PageBody has no ./sections/ imports',
);

const assembled = assembleCompositionalAppShell(files, brief, 'Sable Forge Atelier');
assert.ok(assembled['src/data/products.js'], 'assemble seeds products');
assert.match(assembled['src/App.jsx'], /<Hero\b/, 'assemble mounts Hero');
// Duped PageBody should drop once Hero+grid+story landed.
assert.equal(
  assembled['src/sections/PageBodySection.jsx'] == null
    || !/<PageBodySection\b/.test(assembled['src/App.jsx']),
  true,
  'PageBody dropped or unmounted when sections already cover the page',
);

const gate = runCreateSyntaxGate(files);
assert.ok(gate.files['src/data/products.js'], 'syntax gate seeds products');
assert.ok(
  !gate.reasons.some((r) => /data\/products/.test(r)),
  `gate should heal products before fail: ${gate.reasons.join('; ')}`,
);

console.log('smoke-sable-forge-misses: ok');
