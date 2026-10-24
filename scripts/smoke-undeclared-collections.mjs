import assert from 'node:assert/strict';
import { undeclaredCollectionReasons, runCreateSyntaxGate } from '../src/lib/createSyntaxGate.ts';

const broken = `import './App.css';
export default function App() {
  return (
    <div className="app">
      <div className="card-grid">
        {cards.map((c) => (
          <article key={c.title} className="card">
            <h2>{c.title}</h2>
          </article>
        ))}
      </div>
    </div>
  );
}
`;
const reasons = undeclaredCollectionReasons(broken);
assert.ok(reasons.some((r) => /cards/.test(r)), reasons.join('; '));
const gate = runCreateSyntaxGate({ 'src/App.jsx': broken, 'src/App.css': '.app{}' });
assert.equal(gate.ok, false, 'syntax gate must fail undeclared cards');
assert.ok(gate.reasons.some((r) => /cards/.test(r)), gate.reasons.join('; '));

const ok = `import './App.css';
const cards = [{ title: 'A' }, { title: 'B' }];
export default function App() {
  return <div className="app">{cards.map((c) => <h2 key={c.title}>{c.title}</h2>)}</div>;
}
`;
assert.equal(undeclaredCollectionReasons(ok).length, 0);
console.log('smoke-undeclared-collections: ok');
