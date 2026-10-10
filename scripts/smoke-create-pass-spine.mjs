/**
 * Create acceptance ladder — family routing + plan/design gates + Ready definition.
 *   npm run smoke:create-pass-spine
 */
import assert from 'node:assert/strict';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

const {
  buildProductPlan,
  inferCreateCompositionFamily,
  scorePlanContract,
} = await import('../src/lib/createProductPlan.ts');
const { formatOriginalCraftRules } = await import('../src/lib/createDesignSystem.ts');
const {
  judgeCreateVerified,
  formatCreatePassSpineBlock,
  CREATE_PASS_ORDER,
} = await import('../src/lib/createPassSpine.ts');
const { emptyCreateEvidence, finalizeCreateEvidence, createEvidencePassDefinition } = await import('../src/lib/createEvidence.ts');

const CASES = [
  { brief: 'Build a habit tracker app with streaks', name: 'Streakly', family: 'app-chrome' },
  { brief: 'Build a habit tracker app with streaks — app chrome, not a marketing landing page', name: 'StreaklyNeg', family: 'app-chrome' },
  { brief: 'Build a simple todo list with add and delete', name: 'TaskNest', family: 'tool-panel' },
  { brief: 'Build an online liquor store with cart and checkout', name: 'Nightport', family: 'catalog-store' },
  { brief: 'Build a marketing landing page for a vacuum brand', name: 'Vireo', family: 'marketing-bands' },
  { brief: 'Build a tip calculator', name: 'TipWise', family: 'tool-panel' },
  { brief: 'Build a notes app with folders and empty state', name: 'LeafNote', family: 'app-chrome' },
  { brief: 'Make a small playable snake game', name: 'Noodle', family: 'game-stage' },
];

for (const c of CASES) {
  const fam = inferCreateCompositionFamily(c.brief, c.name);
  assert.equal(fam, c.family, `${c.name}: expected ${c.family}, got ${fam}`);
  const plan = buildProductPlan(c.brief, c.name);
  assert.equal(plan.compositionFamily, c.family);
  const rules = formatOriginalCraftRules({ brief: c.brief, productName: c.name }).join('\n');
  // Thin create (default): short Temp-Nova craft prompt — invent from ask, @@@FILE only.
  assert.match(rules, /THIN CREATE|@@@FILE/i, `${c.name}: thin craft rules missing`);
  assert.match(rules, new RegExp(c.name.slice(0, 4), 'i'), `${c.name}: craft rules should mention product`);
  assert.ok(formatCreatePassSpineBlock(plan).includes(c.family));
}

assert.deepEqual([...CREATE_PASS_ORDER], ['plan', 'structure', 'design', 'interact', 'verify', 'critic']);

// Thin marketing mush must not quality-Ready for a habit ask.
{
  const thinMarketing = {
    'src/App.tsx': `export default function App() {
  return (
    <div className="app site">
      <header className="topnav"><strong>Streakly</strong></header>
      <section className="area"><h1>Streakly</h1><p>Build better habits.</p><a className="cta" href="#main">Start</a></section>
      <section className="band">Story</section>
      <footer className="footer foot">Streakly</footer>
    </div>
  );
}`,
    'src/App.css': 'body{font-family:Georgia,serif}.app{display:flex;justify-content:center;align-items:center;min-height:100vh}',
  };
  const ev = finalizeCreateEvidence(emptyCreateEvidence({
    staticReady: true,
    npmInstalled: true,
    httpOk: true,
    mounted: true,
    consoleClean: true,
    smokeOk: true,
  }));
  const v = judgeCreateVerified({
    evidence: { ...ev, pass: false },
    files: {
      ...thinMarketing,
      'src/App.tsx': thinMarketing['src/App.tsx'].replace('<div className="app site">', '<div className="app-shell">'),
    },
    brief: 'Build a habit tracker app with streaks',
    productName: 'Streakly',
    floorFallback: false,
  });
  assert.equal(v.liveUnlock, true);
  assert.equal(v.qualityReady, false, 'habit ask must not quality-Ready on marketing mush');
  assert.ok(v.reasons.length > 0);
}

// Floor fallback never quality-Ready even with a solid app-chrome shell.
{
  const shell = {
    'src/App.tsx': `import { useState } from 'react';
import './App.css';
export default function App() {
  const [items, setItems] = useState([{ id: '1', title: 'Welcome', body: 'Ready' }]);
  const [draft, setDraft] = useState('');
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Sidebar"><strong>LeafNote</strong>
        <button type="button" onClick={() => setDraft('New note')}>New</button>
      </aside>
       <main className="workspace" id="main">
      <header className="workspace-head"><h1>LeafNote</h1>
          <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { setItems((p) => [...p, { id: String(Date.now()), title: draft, body: 'New item' }]); setDraft(''); } }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Add item" />
            <button type="submit">Add</button>
           </form>
          <div className="workspace-art" role="img" aria-label="LeafNote workspace preview"><span className="workspace-art-mark">LN</span><span className="workspace-cup" /><span className="art-caption">A quiet place for notes</span></div>
        </header>
        <ul className="item-list">{items.map((it) => <li key={it.id}><strong>{it.title}</strong><span>{it.body}</span></li>)}</ul>
      </main>
    </div>
  );
}`,
    'src/App.css': `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Source+Sans+3:wght@400;600&display=swap');
.app-shell{display:grid;grid-template-columns:240px 1fr;min-height:100vh;font-family:'Source Sans 3',sans-serif;background:radial-gradient(circle at 20% 20%,#1a2332,#0b1020)}
.sidebar{padding:1.25rem;border-right:1px solid rgba(255,255,255,.14);display:flex;flex-direction:column;gap:.75rem;color:#e8eef8}
.workspace{padding:1.5rem}
.workspace-art{width:5rem;height:5rem;display:grid;place-items:center;background:radial-gradient(circle,#203b39,#101820);box-shadow:0 10px 30px #0004}
.workspace-head{display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;justify-content:space-between}
.workspace-head h1{font-family:Fraunces,serif;font-size:clamp(2rem,4vw,3.2rem);margin:0;background:linear-gradient(120deg,#f8fafc,#93c5fd);-webkit-background-clip:text;color:transparent}
.item-list{list-style:none;padding:0;margin:1rem 0 0;display:grid;gap:.75rem}
.item-list li{padding:1rem;border:1px solid rgba(255,255,255,.12);border-radius:14px;display:flex;flex-direction:column;gap:.25rem}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.item-list li{animation:rise .4s ease both}
`,
  };
  const plan = buildProductPlan('Build a notes app with folders and empty state', 'LeafNote');
  const score = scorePlanContract(shell, plan);
  assert.equal(score.ok, true, score.reasons.join('; '));
  const ev = finalizeCreateEvidence(emptyCreateEvidence({
    staticReady: true,
    npmInstalled: true,
    httpOk: true,
    mounted: true,
    consoleClean: true,
    smokeOk: true,
  }));
  const floored = judgeCreateVerified({
    evidence: ev,
    files: shell,
    brief: 'Build a notes app with folders and empty state',
    productName: 'LeafNote',
    floorFallback: true,
  });
  assert.equal(floored.qualityReady, false, 'floor fallback must never quality-Ready');
  const good = judgeCreateVerified({
    evidence: ev,
    files: {
      ...shell,
      'src/App.tsx': shell['src/App.tsx'].replace(
        '<div className="workspace-art" role="img" aria-label="LeafNote workspace preview"><span className="workspace-art-mark">LN</span><span className="workspace-cup" /><span className="art-caption">A quiet place for notes</span></div>',
        '<div className="workspace-art" role="img" aria-label="LeafNote workspace preview"><span className="workspace-art-mark">LN</span><span className="workspace-cup" /><span className="art-caption">A quiet place for notes</span></div>',
      ),
    },
    brief: 'Build a notes app with folders and empty state',
    productName: 'LeafNote',
    floorFallback: false,
  });
  assert.equal(good.qualityReady, true, `expected quality Ready: ${good.reasons.join('; ')}`);
}

assert.match(createEvidencePassDefinition(), /Quality Ready/);

console.log('smoke-create-pass-spine: ok');
