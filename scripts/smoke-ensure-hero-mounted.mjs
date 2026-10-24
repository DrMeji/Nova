import assert from 'node:assert/strict';
import { ensureLandedSectionsMountedInApp, thinAskMatchDeficits } from '../src/lib/createThinPath.ts';

const brief = 'Create a website with full-bleed hero and a grid of 4 book cards for Amber Quill Atelier on disk. Skip Plan.';
const files = {
  'src/App.jsx': `import './App.css';
import BookGridSection from './sections/BookGridSection.jsx';
export default function App() {
  return (
    <div className="app">
      <header className="sticky-nav"><img src="/logo.svg" alt="Amber Quill Atelier" /></header>
      <BookGridSection />
    </div>
  );
}
`,
  'src/App.css': '.app{min-height:100vh}',
  'public/logo.svg': '<svg viewBox="0 0 64 64"/>',
  'src/sections/HeroSection.jsx': `import './HeroSection.css';
export default function HeroSection() {
  return (
    <section className="hero-section">
      <div className="hero-stage" aria-hidden="true">
        <img className="hero-art" src="/logo.svg" alt="" />
      </div>
      <h1 className="hero-title">Amber Quill Atelier</h1>
      <p className="hero-lede">A quiet reading shelf for long evenings.</p>
    </section>
  );
}
`,
  'src/sections/BookGridSection.jsx': `export default function BookGridSection() {
  const books = [
    { title: 'Book One', author: 'Author A' },
    { title: 'Book Two', author: 'Author B' },
    { title: 'Book Three', author: 'Author C' },
    { title: 'Book Four', author: 'Author D' },
  ];
  return (
    <section className="book-grid-section">
      <div className="book-grid">{books.map((b) => <article key={b.title}><h2>{b.title}</h2><p>{b.author}</p></article>)}</div>
    </section>
  );
}
`,
};

const next = ensureLandedSectionsMountedInApp(files, brief, 'Amber Quill Atelier');
assert.match(next['src/App.jsx'], /<HeroSection\b/, 'Hero must mount');
assert.match(next['src/App.jsx'], /BookGridSection/, 'books stay');

const misses = thinAskMatchDeficits(files, brief, 'Amber Quill Atelier');
assert.ok(misses.some((m) => /HeroSection/.test(m)), misses.join('; '));
assert.ok(misses.some((m) => /placeholder.*(?:book|bag|product)\s*one/i.test(m)), misses.join('; '));

console.log('smoke-ensure-hero-mounted: ok');
