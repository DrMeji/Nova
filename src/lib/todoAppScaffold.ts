/**
 * @deprecated LOOKBOOK — never call from create.
 */
export function buildTodoAppScaffold(projectName: string): { app: string; css: string; indexCss: string } {
  const title = String(projectName || 'PulseBoard').replace(/[`$\\]/g, '').trim() || 'PulseBoard';
  const storageKey = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-todos`;

  const app = `import { useEffect, useMemo, useState } from 'react';
import './App.css';

const STORAGE_KEY = '${storageKey}';

const seed = [
  { id: '1', text: 'Map out the week ahead', done: true },
  { id: '2', text: 'Send the project update', done: false },
  { id: '3', text: 'Take a proper lunch break', done: false },
];

function loadTodos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : seed;
  } catch {
    return seed;
  }
}

export default function App() {
  const [todos, setTodos] = useState(loadTodos);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  const visible = useMemo(() => {
    if (filter === 'active') return todos.filter((t) => !t.done);
    if (filter === 'done') return todos.filter((t) => t.done);
    return todos;
  }, [todos, filter]);

  const remaining = todos.filter((t) => !t.done).length;

  function addTodo(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setTodos((prev) => [{ id: String(Date.now()), text, done: false }, ...prev]);
    setDraft('');
  }

  function toggleTodo(id) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function deleteTodo(id) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <main className="app">
      <header className="hero">
        <p className="eyebrow">Daily focus board</p>
        <h1>${title}</h1>
        <p className="lede">Capture what matters, clear what is done, keep the pulse steady.</p>
      </header>

      <section className="board" aria-label="Todo board">
        <form className="composer" onSubmit={addTodo}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a task…"
            aria-label="New todo"
          />
          <button type="submit">Add</button>
        </form>

        <div className="filters" role="tablist" aria-label="Filter todos">
          {[
            ['all', 'All'],
            ['active', 'Active'],
            ['done', 'Done'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={filter === id ? 'chip chip--on' : 'chip'}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <ul className="list">
          {visible.map((todo) => (
            <li key={todo.id} className={todo.done ? 'item item--done' : 'item'}>
              <button type="button" className="check" onClick={() => toggleTodo(todo.id)} aria-label="Toggle complete">
                {todo.done ? '✓' : ''}
              </button>
              <span>{todo.text}</span>
              <button type="button" className="delete" onClick={() => deleteTodo(todo.id)} aria-label="Delete">
                Delete
              </button>
            </li>
          ))}
        </ul>

        <footer className="meta">
          <span>{remaining} active</span>
          <span>{todos.length} total</span>
        </footer>
      </section>
    </main>
  );
}
`;

  const css = `:root {
  --bg: #12151c;
  --panel: #1a2030;
  --ink: #eef2f7;
  --muted: #9aa6b8;
  --accent: #6ee0c4;
  --line: rgba(238, 242, 247, 0.1);
  --danger: #ff8f8f;
  --display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --body: "Segoe UI", "Helvetica Neue", sans-serif;
}
* { box-sizing: border-box; }
.app {
  min-height: 100vh;
  padding: 2.4rem 1.4rem 3rem;
  background:
    radial-gradient(800px 420px at 12% -10%, #2a3b55 0%, transparent 55%),
    radial-gradient(700px 380px at 90% 0%, #1f3d36 0%, transparent 50%),
    var(--bg);
  color: var(--ink);
  font-family: var(--body);
}
.hero { max-width: 40rem; margin: 0 auto 1.6rem; }
.eyebrow {
  margin: 0 0 0.55rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
  font-size: 0.72rem;
}
.hero h1 {
  margin: 0 0 0.55rem;
  font-family: var(--display);
  font-size: clamp(2.4rem, 6vw, 3.8rem);
  line-height: 1;
}
.lede { margin: 0; color: var(--muted); max-width: 34rem; }
.board {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1.2rem;
  border: 1px solid var(--line);
  border-radius: 1.1rem;
  background: rgba(26, 32, 48, 0.88);
  backdrop-filter: blur(8px);
}
.composer { display: grid; grid-template-columns: 1fr auto; gap: 0.6rem; }
.composer input {
  border: 1px solid var(--line);
  background: #121722;
  color: var(--ink);
  border-radius: 0.7rem;
  padding: 0.85rem 0.95rem;
  font: inherit;
}
.composer button, .chip, .delete, .check {
  font: inherit;
  cursor: pointer;
}
.composer button {
  border: 0;
  border-radius: 0.7rem;
  padding: 0.85rem 1.1rem;
  background: var(--accent);
  color: #10221c;
  font-weight: 700;
}
.filters { display: flex; gap: 0.45rem; margin: 1rem 0; flex-wrap: wrap; }
.chip {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  border-radius: 999px;
  padding: 0.4rem 0.8rem;
}
.chip--on {
  background: rgba(110, 224, 196, 0.16);
  color: var(--accent);
  border-color: rgba(110, 224, 196, 0.35);
}
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.45rem; }
.item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem 0.8rem;
  border-radius: 0.8rem;
  background: rgba(18, 21, 28, 0.65);
  border: 1px solid var(--line);
}
.item--done span { color: var(--muted); text-decoration: line-through; }
.check {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.4rem;
  border: 1px solid var(--line);
  background: #10141d;
  color: var(--accent);
}
.delete {
  border: 0;
  background: transparent;
  color: var(--danger);
  font-size: 0.85rem;
}
.meta {
  display: flex;
  justify-content: space-between;
  margin-top: 1rem;
  color: var(--muted);
  font-size: 0.9rem;
}
`;

  const indexCss = `* { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; }
body {
  font-family: "Segoe UI", "Helvetica Neue", sans-serif;
  background: #12151c;
  color: #eef2f7;
}
`;

  return { app, css, indexCss };
}

export function briefLooksLikeTodoApp(brief: string): boolean {
  const t = String(brief || '');
  return /\b(?:todo|to-?do|task\s*list|tasks?\b|checklist|kanban)\b/i.test(t)
    && !/\b(?:restaurant|landing\s+page|cafe|coffee\s*shop|bistro)\b/i.test(t);
}
