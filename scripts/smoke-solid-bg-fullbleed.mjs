/**
 * Guard: "change the background to brown" paints ONE full-bleed color.
 * index.css must match App.css (main often loads index last).
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/smoke-solid-bg-fullbleed.mjs
 */
import assert from 'node:assert/strict';
import { reactSurgicalMicroAskEdits } from '@/lib/webProjectCanon';

const files = {
  'src/main.tsx': `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
`,
  'src/App.jsx': `import './App.css';

export default function App() {
  return (
    <div className="app">
      <h1 className="center-word">I LIKE APPLEZ</h1>
    </div>
  );
}
`,
  'src/App.css': `.app {
  min-height: 100vh;
  margin: 0;
  background: #faf7f2;
  color: #111;
}
.center-word { margin: 0; }
`,
  'src/index.css': `html, body, #root { height: 100%; margin: 0; background: #ffffff; }
`,
};

const edits = reactSurgicalMicroAskEdits(files, 'change the background color to brown');
assert.ok(edits.length >= 2, 'must edit App.css + index.css');

const appCss = edits.find((e) => /App\.css$/i.test(e.path))?.content || '';
const indexCss = edits.find((e) => /index\.css$/i.test(e.path))?.content || '';
const main = edits.find((e) => /main\.(tsx|jsx)$/i.test(e.path))?.content || '';

assert.match(appCss, /background:\s*#8B4513/i, 'App.css should be brown');
assert.match(indexCss, /background:\s*#8B4513/i, 'index.css must match brown (not stay white)');
assert.doesNotMatch(indexCss, /background:\s*#ffffff/i, 'index must not keep white');
assert.match(appCss, /min-height:\s*100dvh/i, 'App root/app should full-bleed');
assert.match(indexCss, /min-height:\s*100dvh/i, 'index root should full-bleed');

if (main) {
  const indexAt = main.search(/import\s+['"]\.\/index\.css['"]/);
  const appAt = main.search(/import\s+App\s+from/);
  assert.ok(indexAt >= 0 && appAt >= 0 && indexAt < appAt, 'index.css import must precede App');
}

console.log('OK smoke-solid-bg-fullbleed');
