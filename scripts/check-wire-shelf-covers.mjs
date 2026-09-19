/**
 * Smoke: wireCreatePublicAssets rewrites /heroes/${item.id}.jpg to on-disk covers.
 */
import assert from 'node:assert/strict';
import { wireCreatePublicAssets, isPreviewReady } from '../src/lib/createBuildQuality.ts';
import { wireBrandAssetsIntoSource, planBrandAssets } from '../src/lib/brandAssets.ts';

const brief = 'build QuietShelf — phone shelf browser with borrow and return, soft paper tones and warm walnut.';
const plan = planBrandAssets(brief, 'QuietShelf');
assert.ok(plan.slots.some((s) => s.role === 'logo' && /library|book/i.test(String(s.iconify || ''))), `expected library/book logo, got ${plan.slots.find((s) => s.role === 'logo')?.iconify}`);

const appBefore = `import './App.css';
import React, { useState } from 'react';
const items = [{ id: 1, title: 'Gatsby', description: 'Jazz age.' }, { id: 2, title: '1984', description: 'Dystopia.' }];
export default function App() {
  const [itemsState, setItems] = useState(items);
  const borrowItem = (id) => setItems(itemsState.map((item) => item.id === id ? { ...item, borrower: 'Ada' } : item));
  const returnItem = (id) => setItems(itemsState.map((item) => item.id === id ? { ...item, borrower: null } : item));
  return (
    <div className="app">
      <header><img src="/logo.svg" alt="QuietShelf" /><h1>QuietShelf</h1></header>
      <main className="shelf">
      {itemsState.map(item => (
        <div key={item.id} className="item">
          <img src={\`/heroes/\${item.id}.jpg\`} alt={item.title} className="cover" />
          <h2>{item.title}</h2>
          <p>{item.description}</p>
          <button type="button" onClick={() => item.borrower ? returnItem(item.id) : borrowItem(item.id)}>
            {item.borrower ? 'Return' : 'Borrow'}
          </button>
        </div>
      ))}
      </main>
    </div>
  );
}
`;

const richCss = `
.app { display: flex; flex-direction: column; gap: 1rem; min-height: 100vh; background: linear-gradient(180deg,#f7f1e8,#ebe2d4); }
.shelf { display: flex; flex-wrap: wrap; gap: 1.25rem; padding: 1.5rem; justify-content: center; }
.item { display: flex; flex-direction: column; width: 220px; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 24px rgba(40,24,8,0.08); }
.cover { width: 100%; aspect-ratio: 3/4; object-fit: cover; background: #d9cbb8; }
button { margin: 0.75rem; padding: 0.55rem 0.9rem; border: 0; border-radius: 8px; background: #5c4033; color: #fff; }
`.repeat(2);
const files = {
  'src/App.tsx': appBefore,
  'src/App.css': richCss,
  'src/main.tsx': "import React from 'react'\nimport { createRoot } from 'react-dom/client'\nimport App from './App'\ncreateRoot(document.getElementById('root')).render(<App />)\n",
  'index.html': '<!DOCTYPE html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  'package.json': '{"name":"quietshelf","dependencies":{"react":"^18","react-dom":"^18"},"devDependencies":{"vite":"^5","@vitejs/plugin-react":"^4"}}',
  'public/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  'public/heroes/quietshelf-hero.jpg': '/* asset */',
  'public/heroes/quietshelf-story.jpg': '/* asset */',
};

const wired = wireCreatePublicAssets(files, 'QuietShelf');
assert.ok(/COVER_HREFS/.test(wired.files['src/App.tsx']), 'COVER_HREFS missing');
assert.ok(!/\/heroes\/\$\{item\.id\}/.test(wired.files['src/App.tsx']), 'template hero path remains');
assert.ok(/quietshelf-hero\.jpg/.test(wired.files['src/App.tsx']), 'real hero not wired');

const fromPlan = wireBrandAssetsIntoSource(appBefore, {
  projectName: 'QuietShelf',
  slots: [
    { role: 'hero', id: 'quietshelf-hero', rel: 'public/heroes/quietshelf-hero.jpg', href: '/heroes/quietshelf-hero.jpg' },
    { role: 'hero', id: 'quietshelf-story', rel: 'public/heroes/quietshelf-story.jpg', href: '/heroes/quietshelf-story.jpg' },
  ],
}, 'src/App.tsx');
assert.ok(/COVER_HREFS/.test(fromPlan), 'plan wire missing COVER_HREFS');
assert.ok(!/\/heroes\/\$\{item\.id\}/.test(fromPlan), 'plan wire left template path');

const brokenReady = isPreviewReady({
  ...files,
  'src/App.tsx': appBefore,
  'public/heroes/quietshelf-hero.jpg': '/* asset */',
  'public/heroes/quietshelf-story.jpg': '/* asset */',
}, { productName: 'QuietShelf', brief, requireInteractive: true });
assert.ok(
  brokenReady.reasons.some((r) => /dynamic \/heroes|missing on disk/i.test(r)),
  `expected broken-cover Ready reason, got: ${brokenReady.reasons.join('; ')}`,
);

console.log('PASS wire-shelf-covers');
