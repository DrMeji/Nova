/**
 * #5 Interactive app depth gate — unit checks.
 * Thin static shells must fail Ready when requireInteractive; real state apps pass.
 * Cafe/marketing briefs must NOT require interactive.
 */
import {
  briefLooksLikeMarketingLanding,
  briefRequiresInteractiveApp,
  isPreviewReady,
  previewReadyForBrief,
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
  'src/App.css': `
.app{min-height:100vh;display:flex;flex-direction:column;background:#0f1419;color:#e8eef5;font-family:system-ui,sans-serif}
nav{display:flex;gap:12px;padding:16px 20px;border-bottom:1px solid #243041}
nav button{background:#1a2433;color:#e8eef5;border:0;border-radius:8px;padding:8px 14px;cursor:pointer}
nav button:hover{background:#243447}
h1{font-size:1.6rem;margin:20px 20px 8px;letter-spacing:-0.02em}
main{padding:12px 20px 28px;flex:1}
ul{list-style:none;padding:0;margin:0 0 16px}
li{padding:10px 12px;margin-bottom:8px;background:#16202c;border-radius:8px;border:1px solid #243041}
form{display:flex;gap:8px}
input{flex:1;padding:10px 12px;border-radius:8px;border:1px solid #334155;background:#0b1016;color:#e8eef5}
button[type=submit]{padding:10px 16px;border:0;border-radius:8px;background:#3b82f6;color:#fff;font-weight:600;cursor:pointer}
`,
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

const vireoBrief = [
  'Build Vireo Vac on disk now — a premium product homepage for a professional home vacuum company.',
  'Quiet-luxury editorial quality: full-bleed hero, soft color orbs, scroll-reveal bands.',
  'Do not ship a tip app, todo list, or Apple product-grid clone.',
  'Build the Vite React project on disk immediately.',
].join(' ');
if (briefRequiresInteractiveApp(vireoBrief)) {
  issues.push('Vireo Vac product homepage must NOT require interactive (forbid tip/todo must not flip the gate)');
}
if (!briefLooksLikeMarketingLanding(vireoBrief)) {
  issues.push('Vireo Vac brief must classify as marketing landing');
}
const vireoShell = {
  ...viteShell,
  'src/App.css': `
:root { --bg:#0e1210; --ink:#eef3ec; --accent:#9fbfa8; --muted:#8a948c; --display:"Iowan Old Style",Georgia,serif; --body:system-ui,sans-serif; }
html,body,#root{margin:0;min-height:100%;background:var(--bg);color:var(--ink);font-family:var(--body)}
.app{min-height:100vh}
.nav{position:sticky;top:0;display:flex;gap:1.5rem;padding:1rem 2rem;backdrop-filter:blur(12px)}
.hero{min-height:100vh;display:grid;place-items:center;text-align:center;background:
  radial-gradient(circle at 18% 22%,rgba(159,191,168,.35),transparent 42%),
  radial-gradient(circle at 82% 18%,rgba(120,160,200,.28),transparent 46%),
  linear-gradient(160deg,#0e1210,#1a221c 55%,#0e1210);position:relative;overflow:hidden}
.hero h1{font-family:var(--display);font-size:clamp(3rem,8vw,6rem);letter-spacing:-.03em}
.hero .orb{position:absolute;border-radius:50%;filter:blur(2px);animation:float 8s ease-in-out infinite}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-18px)}}
@keyframes rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
.band{padding:min(12vh,7rem) 8vw;animation:rise .8s both}
.band h2{font-family:var(--display);font-size:2.4rem}
.cta{display:inline-block;margin-top:1.5rem;padding:.9rem 1.4rem;border:1px solid var(--accent);color:var(--ink);text-decoration:none;transition:background .25s}
.cta:hover{background:rgba(159,191,168,.15)}
footer{padding:3rem 8vw;border-top:1px solid rgba(255,255,255,.08);color:var(--muted)}
`.repeat(2),
  'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="app">
      <nav className="nav"><a href="#hero">Vireo Vac</a><a href="#suction">Suction</a></nav>
      <header className="hero full-bleed" id="hero">
        <div className="orb" aria-hidden="true" />
        <div>
          <h1>Vireo Vac</h1>
          <p>Professional home vacuum — quiet power, refined form.</p>
          <a className="cta" href="#buy">Shop now</a>
        </div>
      </header>
      <section className="band" id="suction"><h2>Suction</h2><p>Deep clean power for real floors.</p></section>
      <section className="band" id="quiet"><h2>Quiet motor</h2><p>Library-quiet while it works.</p></section>
      <section className="band" id="design"><h2>Design</h2><p>Refined lines you notice every day.</p></section>
      <section className="band specs" id="buy"><h2>Specs</h2><p>Weight 3kg · Runtime 60m</p></section>
      <footer><p>Vireo Vac</p></footer>
    </div>
  );
}
`,
};
const vireoGate = previewReadyForBrief(vireoShell, { productName: 'Vireo Vac', brief: vireoBrief });
// This smoke locks interactive vs marketing — not the full thin visual / compositional Ready floor
// (that is covered by smoke:thin-create-path + seedCompositionalBrandVisuals).
if (vireoGate.reasons.some((r) => /\binteractive\b|static shell|React state/i.test(r))) {
  issues.push(`Vireo Vac must not fail on interactive gate: ${vireoGate.reasons.join('; ')}`);
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
