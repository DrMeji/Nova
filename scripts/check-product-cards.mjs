import { reactSurgicalMicroAskEdits } from '../src/lib/webProjectCanon.ts';

const app0 = `import './App.css';
export default function App(){return (
  <div className="app">
    <section className="hero"><h1 className="center-word">PULSE Kit</h1></section>
    <section id="products" className="product-cards" aria-label="Products">
      <article className="product-card"><h2>Mouse</h2><p>Precision tracking.</p></article>
      <article className="product-card"><h2>Keyboard</h2><p>Fast switches.</p></article>
      <article className="product-card"><h2>Headset</h2><p>Clear audio.</p></article>
    </section>
  </div>
);}
`;
const files = { 'src/App.tsx': app0, 'src/App.css': '.app{background:#141414}\n' };
const removed = reactSurgicalMicroAskEdits(files, 'Remove the Headset card — keep only Mouse and Keyboard.');
const a = removed.find((e) => e.path.includes('App.tsx'))?.content || '';
if (!/<h2>Mouse<\/h2>/.test(a) || !/<h2>Keyboard<\/h2>/.test(a) || /<h2>Headset<\/h2>/.test(a)) {
  console.error('FAIL remove', a);
  process.exit(2);
}
const restored = reactSurgicalMicroAskEdits(
  { 'src/App.tsx': a, 'src/App.css': files['src/App.css'] },
  'Put the Headset card back, and add a real https product photo for a gaming headset under the cards.',
);
const b = restored.find((e) => e.path.includes('App.tsx'))?.content || a;
if (
  !/<h2>Mouse<\/h2>/.test(b)
  || !/<h2>Keyboard<\/h2>/.test(b)
  || !/<h2>Headset<\/h2>/.test(b)
  || !/alt=["'][^"']*headset/i.test(b)
) {
  console.error('FAIL restore', b);
  process.exit(2);
}
console.log('PASS card remove/restore');
