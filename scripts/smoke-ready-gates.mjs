import { extractProjectName } from '../src/lib/createProjectIntent.ts';
import { reactUiMicroAskEdits } from '../src/lib/webProjectCanon.ts';
import { isPreviewReady } from '../src/lib/createBuildQuality.ts';

const briefs = [
  'Create the project on disk called Copper Mug Roasters. Coffee shop site with hero, menu, and Order ahead CTA.',
  'Create the project on disk. Named Copper Mug Roasters — specialty coffee.',
  'Create a brand-new website project called Nightcord on disk. Live streaming layout.',
];
for (const b of briefs) {
  const name = extractProjectName(b);
  console.log(JSON.stringify({ name, brief: b.slice(0, 72) }));
  if (/on[\s-]?disk/i.test(String(name))) {
    console.error('FAIL: junk name', name);
    process.exit(2);
  }
}
if (extractProjectName(briefs[0]) !== 'Copper Mug Roasters') {
  console.error('FAIL expected Copper Mug Roasters got', extractProjectName(briefs[0]));
  process.exit(2);
}

const files = {
  'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="app">
      <header className="hero">
        <h1 className="hero-title">Nightcord</h1>
        <p>Live streams.</p>
        <button type="button">Watch now</button>
      </header>
    </div>
  );
}
`,
  'src/App.tsx': `import './App.css';
export default function App() {
  return (
    <div className="app">
      <header className="hero">
        <h1 className="hero-title">Nightcord</h1>
        <p>Live streams.</p>
        <button type="button">Watch now</button>
      </header>
    </div>
  );
}
`,
  'src/App.css': '.app{min-height:100vh}',
};

const ask = 'Change the hero headline to “Slow roast. City mornings.” and make the primary CTA say “Order ahead”. Apply on disk.';
const edits = reactUiMicroAskEdits(files, ask);
const byPath = Object.fromEntries(edits.map((e) => [e.path, e.content]));
const h1 = byPath['src/App.jsx']?.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
const btn = byPath['src/App.jsx']?.match(/<button[^>]*>([\s\S]*?)<\/button>/i)?.[1];
const h1t = byPath['src/App.tsx']?.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
console.log(JSON.stringify({ count: edits.length, paths: edits.map((e) => e.path), h1, btn, h1t }, null, 2));
if (!edits.length || !/Slow roast/i.test(String(h1)) || !/Order ahead/i.test(String(btn))) process.exit(3);
if (byPath['src/App.tsx'] && !/Slow roast/i.test(String(h1t))) process.exit(4);

const baseReady = {
  'src/App.jsx': files['src/App.jsx'] + '\n' + 'x'.repeat(80),
  'package.json': JSON.stringify({ dependencies: { vite: '5', react: '18' } }),
  'index.html': '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
  'src/main.jsx': 'import App from "./App.jsx"',
};
const miss = isPreviewReady(baseReady, { productName: 'Copper Mug Roasters' });
const hit = isPreviewReady({
  ...baseReady,
  'src/App.jsx': baseReady['src/App.jsx'].replace('Nightcord', 'Copper Mug Roasters'),
}, { productName: 'Copper Mug Roasters' });
console.log(JSON.stringify({ missOk: miss.ok, missReasons: miss.reasons, hitOk: hit.ok, hitReasons: hit.reasons }));
if (miss.ok || !hit.ok) process.exit(5);
console.log('OK');
