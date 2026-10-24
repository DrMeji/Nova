/**
 * Step 5 (Verify) — peer Done checks against Acc files.
 * Re-run until zero FAIL before advancing to Premium.
 *
 * Peer bar (Replit plan success criteria / Devin Result / Claude acceptance):
 *   brand visible · must-haves present · out-of-scope not shipped · todo twin blocked
 */
import {
  understandCreateBrief,
  verifyCreateBriefAgainstFiles,
  readyBlockedByCodingQuality,
} from '../src/lib/codingCreatePipeline.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

const BRIEF =
  'Create Paper Shelf on disk now. Soft paper background, deep ink navy type, warm brass accent. Full-bleed quiet hero with the brand name, grid of 4 book cards (title + author). Polished single page.';

const plan = understandCreateBrief({ brief: BRIEF, brand: 'Paper Shelf' });

// Good editorial invent (minimal peer-shaped App)
const good = {
  'src/App.jsx': `
import './App.css';
/* Editorial invent fixture — long enough to clear thin-App Ready floor. */
const BOOKS = [
  { title: 'Stilness', author: 'Ada Wren' },
  { title: 'Margin Notes', author: 'Leo Hart' },
  { title: 'Paper Hours', author: 'Mira Cole' },
  { title: 'Shelf Light', author: 'Jon Vale' },
];
export default function App() {
  return (
    <div className="app" data-nova-layout="editorial">
      <header className="hero">
        <p className="eyebrow">Quiet reading</p>
        <h1>Paper Shelf</h1>
        <p className="lede">A soft paper shelf for titles worth keeping close.</p>
      </header>
      <section className="shelf-grid" aria-label="Reading shelf">
        {BOOKS.map((b) => (
          <article className="book-card" key={b.title}>
            <h2 className="title">{b.title}</h2>
            <p className="author">{b.author}</p>
            <p className="blurb">A short line that belongs on this shelf alone.</p>
          </article>
        ))}
      </section>
      <footer className="foot">
        <p>Paper Shelf — editorial landing, single page, no cart chrome.</p>
      </footer>
    </div>
  );
}
`,
  'src/App.css': `
:root {
  --paper: #f4efe6;
  --ink: #1a2744;
  --accent: #b08d57;
  --line: color-mix(in srgb, var(--accent) 35%, transparent);
}
.app {
  min-height: 100vh;
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
}
.hero { padding: 4.5rem 8vw 2rem; max-width: 40rem; }
.eyebrow { letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); font-size: 0.75rem; }
.hero h1 { font-size: clamp(2.4rem, 5vw, 3.6rem); margin: 0.4rem 0 0.75rem; }
.lede { font-size: 1.15rem; line-height: 1.55; opacity: 0.9; }
.shelf-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.25rem;
  padding: 2rem 8vw 4rem;
}
.book-card {
  border: 1px solid var(--line);
  padding: 1.1rem 1rem 1.25rem;
  background: color-mix(in srgb, var(--paper) 88%, white);
}
.title { font-size: 1.05rem; margin: 0 0 0.35rem; }
.author { color: var(--accent); margin: 0 0 0.5rem; font-size: 0.92rem; }
.blurb { margin: 0; font-size: 0.85rem; line-height: 1.45; opacity: 0.8; }
.foot { padding: 1.5rem 8vw 3rem; border-top: 1px solid var(--line); font-size: 0.85rem; }
@media (max-width: 900px) {
  .shelf-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`,
}

const goodV = verifyCreateBriefAgainstFiles({
  files: good,
  brand: 'Paper Shelf',
  mustHave: plan.mustHave,
  verifyChecks: plan.verifyChecks,
  outOfScope: plan.outOfScope,
});
console.log('\n=== good verify ===', goodV);
check('good App passes verify', goodV.ok === true, [...goodV.missing, ...goodV.violations].join(' | '));
check(
  'good not blocked by Ready gate',
  readyBlockedByCodingQuality(good, {
    brand: 'Paper Shelf',
    mustHave: plan.mustHave,
    outOfScope: plan.outOfScope,
  }).blocked === false,
);

// Todo twin — the Paper Shelf live failure
const todoTwin = {
  'src/App.jsx': `
import { useState } from 'react';
import './App.css';
export default function App() {
  const [todos, setTodos] = useState([{ id: 1, text: 'New todo', done: false }]);
  return (
    <div className="app">
      <h1>Tasks</h1>
      <button onClick={() => setTodos((t) => [...t, { id: Date.now(), text: 'Add todo', done: false }])}>Add</button>
      <ul>{todos.map((t) => <li key={t.id}>{t.text}</li>)}</ul>
    </div>
  );
}
`,
  'src/App.css': `.app{min-height:100vh;background:#111;color:#eee}`,
};
const badV = verifyCreateBriefAgainstFiles({
  files: todoTwin,
  brand: 'Paper Shelf',
  mustHave: plan.mustHave,
  outOfScope: plan.outOfScope,
});
console.log('\n=== todo twin verify ===', badV);
check('todo twin fails verify', badV.ok === false);
check(
  'todo twin reports violation or missing must-haves',
  badV.violations.length > 0 || badV.missing.length >= 3,
  `missing=${badV.missing.length} viol=${badV.violations.join(',')}`,
);
check(
  'todo twin blocks Ready',
  readyBlockedByCodingQuality(todoTwin, {
    brand: 'Paper Shelf',
    mustHave: plan.mustHave,
    outOfScope: plan.outOfScope,
  }).blocked === true,
);

// Brand missing — explicit fixture (no rename tricks).
const noBrand = {
  'src/App.jsx': `
import './App.css';
const BOOKS = [
  { title: 'Stilness', author: 'Ada Wren' },
  { title: 'Margin Notes', author: 'Leo Hart' },
  { title: 'Paper Hours', author: 'Mira Cole' },
  { title: 'Shelf Light', author: 'Jon Vale' },
];
export default function App() {
  return (
    <div className="app">
      <header className="hero"><h1>Untitled Shelf</h1><p className="lede">A quiet reading shelf.</p></header>
      <section className="shelf-grid">
        {BOOKS.map((b) => (
          <article className="book-card" key={b.title}>
            <h2 className="title">{b.title}</h2>
            <p className="author">{b.author}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
`,
  'src/App.css': good['src/App.css'],
};
check('noBrand fixture has no Paper Shelf string', !/Paper Shelf/i.test(noBrand['src/App.jsx']));
const nb = verifyCreateBriefAgainstFiles({
  files: noBrand,
  brand: 'Paper Shelf',
  mustHave: ['full-bleed quiet hero with the brand name in first viewport'],
  outOfScope: plan.outOfScope,
});
check(
  'missing brand fails',
  nb.missing.some((m) => /brand name visible/i.test(m)),
  `ok=${nb.ok} missing=${nb.missing.join(' | ')}`,
);

if (failed) {
  console.error(`\nStep 5 verify: ${failed} check(s) failed — stay on Verify`);
  process.exit(1);
}
console.log('\nStep 5 verify: all checks passed — peer bar met for Verify');
