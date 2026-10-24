import {
  thinWantsCompositionalShell,
  listLandedCompositionalSections,
  compositionalSectionFileSubstantial,
  ensureLandedSectionsMountedInApp,
  THIN_COMPOSITIONAL_SECTION_MIN_CHARS,
} from '../src/lib/createThinPath.ts';

const brief = 'Create a website with full-bleed hero and a grid of 4 book cards for Amber Quill Atelier on disk. Skip Plan.';
const hero = `export default function HeroSection() {
  return (
    <section className="hero-section">
      <h1 className="hero-title">Amber Quill Atelier</h1>
      <p className="hero-lede">A quiet reading shelf.</p>
      <div className="hero-stage"><img className="hero-art" src="/logo.svg" alt="" /></div>
    </section>
  );
}
`;
const book = `export default function BookGridSection() {
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
`;
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
  'public/logo.svg': '<svg/>',
  'src/sections/HeroSection.jsx': hero,
  'src/sections/BookGridSection.jsx': book,
};
console.log('minChars', THIN_COMPOSITIONAL_SECTION_MIN_CHARS);
console.log('wants', thinWantsCompositionalShell(brief));
console.log('hero sub', compositionalSectionFileSubstantial(hero), hero.replace(/\s+/g, '').length);
console.log('book sub', compositionalSectionFileSubstantial(book), book.replace(/\s+/g, '').length);
console.log('landed', listLandedCompositionalSections(files, brief, 'Amber Quill Atelier').map((s) => s.componentName));
const next = ensureLandedSectionsMountedInApp(files, brief, 'Amber Quill Atelier');
console.log('app out', next['src/App.jsx']);
