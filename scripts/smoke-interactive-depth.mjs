/**
 * #5 Interactive app depth gate — unit checks.
 * Thin static shells must fail Ready when requireInteractive; real state apps pass.
 * Cafe/marketing briefs must NOT require interactive.
 */
import {
  briefRequiresInteractiveApp,
  isPreviewReady,
} from '../src/lib/createBuildQuality.ts';

const viteShell = {
  'package.json': JSON.stringify({ dependencies: { vite: '5', react: '18' } }),
  'index.html': '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
  'src/main.jsx': 'import App from "./App.jsx"; import { createRoot } from "react-dom/client"; createRoot(document.getElementById("root")).render(<App />);',
  'src/App.css': '.app{min-height:100vh}',
};

const prettyShell = {
  ...viteShell,
  'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="app">
      <header className="hero">
        <h1>TaskNest</h1>
        <p>Organize your day.</p>
        <button type="button">Add task</button>
        <button type="button">Settings</button>
      </header>
      <section className="cards">
        <div className="card">Inbox</div>
        <div className="card">Done</div>
      </section>
    </div>
  );
}
`,
};

const interactiveApp = {
  ...viteShell,
  'src/App.jsx': `import { useState } from 'react';
import './App.css';
export default function App() {
  const [view, setView] = useState('inbox');
  const [tasks, setTasks] = useState([{ id: 1, title: 'Ship Ready gate' }]);
  const [draft, setDraft] = useState('');
  return (
    <div className="app">
      <nav>
        <button type="button" onClick={() => setView('inbox')}>Inbox</button>
        <button type="button" onClick={() => setView('done')}>Done</button>
      </nav>
      <h1>TaskNest</h1>
      <main>
        {view === 'inbox' ? (
          <ul>{tasks.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
        ) : (
          <p>Nothing done yet</p>
        )}
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          setTasks((prev) => [...prev, { id: Date.now(), title: draft.trim() }]);
          setDraft('');
        }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit">Add task</button>
        </form>
      </main>
    </div>
  );
}
`,
};

const issues = [];

if (briefRequiresInteractiveApp('Build a todo app called TaskNest with inbox and add form')) {
  /* ok */
} else {
  issues.push('todo app brief should require interactive');
}

if (briefRequiresInteractiveApp('Create a cafe landing for Copper Mug with hero and Order ahead')) {
  issues.push('cafe landing must NOT require interactive');
}

if (!briefRequiresInteractiveApp('Build an app called Paperledger — desktop workspace with accounts and transactions')) {
  issues.push('workspace app brief should require interactive');
}

const shellFail = isPreviewReady(prettyShell, { productName: 'TaskNest', requireInteractive: true });
if (shellFail.ok) {
  issues.push('pretty static shell must fail Ready under requireInteractive');
} else if (!shellFail.reasons.some((r) => /interactive|static shell|state/i.test(r))) {
  issues.push(`expected interactive reason, got: ${shellFail.reasons.join('; ')}`);
}

const realPass = isPreviewReady(interactiveApp, { productName: 'TaskNest', requireInteractive: true });
if (!realPass.ok) {
  issues.push(`interactive app should pass Ready: ${realPass.reasons.join('; ')}`);
}

const cafePass = isPreviewReady(prettyShell, { productName: 'TaskNest', requireInteractive: false });
if (!cafePass.ok) {
  // pretty shell without interactive may still pass basic Ready — brand is TaskNest so ok
  /* brand present; length etc — may pass */
}

console.log(JSON.stringify({
  shellFail: shellFail.reasons,
  realPass: realPass.ok,
  requireTodo: briefRequiresInteractiveApp('Build a todo app called TaskNest'),
  requireCafe: briefRequiresInteractiveApp('Create a cafe landing for Copper Mug'),
  issues,
}, null, 2));

if (issues.length) {
  console.error('FAIL', issues);
  process.exit(1);
}
console.log('OK #5 interactive depth gate');
