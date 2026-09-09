/**
 * #6 Empty App twin cleanup — only one real App.* remains.
 */
import {
  cleanupAppTwins,
  ensureViteReactProjectFiles,
  scoreAppSource,
} from '../src/lib/createBuildQuality.ts';

const emptyJsx = `import './App.css';
export default function App() {
  return (
    <div className="app" />
  );
}
`;

const fatTsx = `import { useState } from 'react';
import './App.css';
export default function App() {
  const [tab, setTab] = useState('home');
  return (
    <div className="app">
      <header><h1>TwinForge</h1></header>
      <nav>
        <button type="button" onClick={() => setTab('home')}>Home</button>
        <button type="button" onClick={() => setTab('work')}>Work</button>
      </nav>
      <main>{tab === 'home' ? <p>Welcome</p> : <p>Workspace</p>}</main>
      <section className="cards"><div className="card">A</div><div className="card">B</div></section>
    </div>
  );
}
`;

const fatJsx = fatTsx.replace('TwinForge', 'TwinForge');
const thinTsx = emptyJsx;

const issues = [];

{
  const r = cleanupAppTwins({
    'src/App.jsx': emptyJsx,
    'src/App.tsx': fatTsx,
    'src/App.css': '.app{}',
  });
  if (r.kept !== 'src/App.tsx' || r.removed[0] !== 'src/App.jsx' || r.files['src/App.jsx'] != null) {
    issues.push(`empty jsx + fat tsx → keep tsx, got kept=${r.kept} removed=${r.removed}`);
  }
}

{
  const r = cleanupAppTwins({
    'src/App.jsx': fatJsx,
    'src/App.tsx': thinTsx,
    'src/App.css': '.app{}',
  });
  if (r.kept !== 'src/App.jsx' || r.removed[0] !== 'src/App.tsx' || r.files['src/App.tsx'] != null) {
    issues.push(`fat jsx + empty tsx → keep jsx, got kept=${r.kept} removed=${r.removed}`);
  }
}

{
  // Both real — prefer higher score; tie breaks to jsx
  const both = {
    'src/App.jsx': fatJsx + '\n' + 'x'.repeat(200),
    'src/App.tsx': fatTsx,
  };
  const r = cleanupAppTwins(both);
  const bothExist = r.files['src/App.jsx'] != null && r.files['src/App.tsx'] != null;
  if (bothExist || r.removed.length !== 1) {
    issues.push(`both real must collapse to one, got removed=${r.removed} keys=${Object.keys(r.files).filter(k=>/App\\.(jsx|tsx)/.test(k))}`);
  }
}

{
  const ensured = ensureViteReactProjectFiles({
    'src/App.jsx': emptyJsx,
    'src/App.tsx': fatTsx,
    'package.json': JSON.stringify({ dependencies: { vite: '5', react: '18' } }),
    'index.html': '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
    'src/main.jsx': "import App from './App'",
    'src/App.css': '.app{min-height:100vh}',
    'src/index.css': 'body{margin:0}',
  }, 'TwinForge');
  const hasJsx = ensured.files['src/App.jsx'] != null;
  const hasTsx = ensured.files['src/App.tsx'] != null;
  if (hasJsx && hasTsx) {
    issues.push('ensureViteReactProjectFiles left both App twins');
  }
  if (!ensured.repaired.some((r) => r.startsWith('removed:src/App.'))) {
    issues.push(`expected removed:src/App.* in repaired, got ${ensured.repaired.join(',')}`);
  }
  if (scoreAppSource(fatTsx) <= scoreAppSource(emptyJsx)) {
    issues.push('fat tsx should score higher than empty jsx');
  }
}

console.log(JSON.stringify({ issues }, null, 2));
if (issues.length) {
  console.error('FAIL', issues);
  process.exit(1);
}
console.log('OK #6 App twin cleanup');
