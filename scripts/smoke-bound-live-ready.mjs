import assert from 'node:assert/strict';
import { boundFolderLiveReady } from '../src/lib/createReady.ts';

const thinShell = {
  'package.json': '{"name":"x","dependencies":{"react":"^18","react-dom":"^18","vite":"^5"}}',
  'src/App.jsx': `import './App.css';
import NavHeaderSection from './sections/NavHeaderSection.jsx';
import HeroSection from './sections/HeroSection.jsx';
import CatalogSection from './sections/CatalogSection.jsx';
export default function App() {
  return (
    <div className="app">
      <NavHeaderSection />
      <HeroSection />
      <CatalogSection />
    </div>
  );
}
`,
  'src/sections/NavHeaderSection.jsx': 'export default function NavHeaderSection(){return <header className="nav">Nav</header>}',
  'src/sections/HeroSection.jsx': 'export default function HeroSection(){return <section className="hero"><h1>Brand</h1><p>Handcrafted bags on parchment grounds with warm brass for everyday carry.</p></section>}',
  'src/sections/CatalogSection.jsx': 'export default function CatalogSection(){return <section id="shop"><h2>Shop</h2><p>Four bags with real names.</p></section>}',
};

assert.equal(boundFolderLiveReady(thinShell), true, 'compositional short App must unlock Live');

const bare = {
  'package.json': '{"name":"x"}',
  'src/App.jsx': 'export default function App(){return <div className="app" />;}',
};
assert.equal(boundFolderLiveReady(bare), false, 'empty stub stays locked');

console.log('smoke-bound-live-ready: ok');
