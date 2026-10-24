/**
 * Smoke: create evidence helpers (no Electron).
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-create-evidence.mjs
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
  smokeCheckCreateFiles,
  emptyCreateEvidence,
  finalizeCreateEvidence,
  formatEvidenceForAgent,
  createRuntimeStageLabel,
  formatCreateProjectMap,
  createEvidencePassDefinition,
  rollbackCreateCheckpoint,
} = await import('../src/lib/createEvidence.ts').then(async (ev) => {
  const cp = await import('../src/lib/createCheckpoint.ts');
  return { ...ev, ...cp };
});
const { generatedSectionSyntaxProblems } = await import('../src/lib/chatAgentApply.ts');

const todoApp = `import { useState } from 'react';
export default function App() {
  const [todos, setTodos] = useState([]);
  const [v, setV] = useState('');
  return (
    <div className="app">
      <h1>TaskNest</h1>
      <input value={v} onChange={(e) => setV(e.target.value)} />
      <button onClick={() => { setTodos([...todos, v]); setV(''); }}>Add</button>
      <ul>{todos.map((t, i) => (
        <li key={i}>{t}<button onClick={() => setTodos(todos.filter((_, j) => j !== i))}>Delete</button></li>
      ))}</ul>
    </div>
  );
}
`;

const thin = `export default function App() { return <div />; }`;

{
  const incomplete = `export default function NavHeaderSection() {\n  return (<nav><a href="#shop">Shop</a></nav>);`;
  const complete = `${incomplete}\n}`;
  assert.match(generatedSectionSyntaxProblems({ 'src/sections/NavHeaderSection.jsx': incomplete }).join('; '), /unbalanced JSX braces/);
  assert.deepEqual(generatedSectionSyntaxProblems({ 'src/sections/NavHeaderSection.jsx': complete }), []);
}

{
  const s = smokeCheckCreateFiles({ 'src/App.jsx': todoApp }, 'Build a simple todo app with add and delete');
  assert.equal(s.ok, true, s.detail);
}
{
  const s = smokeCheckCreateFiles({ 'src/App.jsx': thin }, 'Build a simple todo app with add and delete');
  assert.equal(s.ok, false);
}
{
  const ev = finalizeCreateEvidence(emptyCreateEvidence({
    staticReady: true,
    npmInstalled: true,
    httpOk: true,
    mounted: true,
    consoleClean: true,
    smokeOk: true,
  }));
  assert.equal(ev.pass, true);
}
{
  const ev = finalizeCreateEvidence(emptyCreateEvidence({
    staticReady: true,
    npmInstalled: true,
    httpOk: true,
    mounted: false,
    consoleClean: true,
    smokeOk: true,
  }));
  assert.equal(ev.pass, false, 'HTTP without mount must not PASS');
}
{
  const ev = finalizeCreateEvidence(emptyCreateEvidence({
    staticReady: true,
    npmInstalled: true,
    httpOk: true,
    mounted: true,
    consoleClean: true,
    smokeOk: true,
    buildOk: false,
    buildErrors: ['missing export'],
  }));
  assert.equal(ev.pass, true, 'a mounted preview can remain inspectable after a build failure');
  assert.equal(ev.qualityOk, false, 'a failed package build cannot be quality-ready');
  assert.match(formatEvidenceForAgent(ev), /buildErrors:[\s\S]*missing export/);
}
{
  const text = formatEvidenceForAgent(emptyCreateEvidence({ pass: false, mounted: false }));
  assert.match(text, /Create evidence/);
  assert.match(createRuntimeStageLabel('live'), /Live/);
  assert.match(formatCreateProjectMap({ 'src/App.jsx': todoApp, 'package.json': '{"scripts":{"dev":"vite"}}' }), /Project map/);
  assert.match(createEvidencePassDefinition(), /mounted/);
}
{
  const { snapshotCreateCheckpoint } = await import('../src/lib/createCheckpoint.ts');
  const snap = snapshotCreateCheckpoint({ 'src/App.jsx': 'A', 'src/App.css': 'B' }, 'Demo');
  const rolled = rollbackCreateCheckpoint({ 'src/App.jsx': 'BROKEN' }, snap);
  assert.equal(rolled.files['src/App.jsx'], 'A');
}

{
  const s = smokeCheckCreateFiles({ 'src/App.jsx': 'export default function App(){return <div/>}' }, 'anything');
  assert.equal(s.ok, false, 'vacuous smoke must fail');
}
{
  const { judgeCreateEvidence } = await import('../src/lib/createHostJudge.ts');
  const bad = judgeCreateEvidence({
    evidence: emptyCreateEvidence({
      staticReady: true, npmInstalled: true, httpOk: true, mounted: true, consoleClean: true, smokeOk: true, pass: true,
    }),
    files: { 'src/App.jsx': 'export default function App(){return <div/>}' },
    brief: 'todo app',
    productName: 'TaskNest',
  });
  assert.equal(bad.ok, false, 'judge must fail thin App');
  const badBuild = judgeCreateEvidence({
    evidence: emptyCreateEvidence({
      staticReady: true, npmInstalled: true, httpOk: true, mounted: true,
      consoleClean: true, smokeOk: true, pass: true, buildOk: false,
      buildErrors: ['missing export'],
    }),
    files: { 'src/App.jsx': todoApp },
    brief: 'Build a simple todo app with add and delete',
    productName: 'TaskNest',
    requirePlanDesign: false,
  });
  assert.equal(badBuild.ok, false, 'a failed package build must fail the host judge');
  const goodBrand = judgeCreateEvidence({
    evidence: emptyCreateEvidence({
      staticReady: true, npmInstalled: true, httpOk: true, mounted: true, consoleClean: true, smokeOk: true, pass: true,
    }),
    files: {
      'src/App.jsx': `${todoApp}`,
    },
    brief: 'Build a simple todo app with add and delete',
    productName: 'Task Nest',
    // Brand soft-match only — plan/design gates covered by smoke:create-pass-spine.
    requirePlanDesign: false,
  });
  assert.equal(goodBrand.ok, true, `soft brand match should pass: ${goodBrand.reasons.join('; ')}`);

  const composedApp = `import NavHeaderSection from './sections/NavHeaderSection.jsx';
import './App.css';
export default function App() { return <main className="app"><NavHeaderSection /><section>Welcome</section></main>; }`;
  const composedFiles = {
    'src/App.jsx': composedApp,
    'src/App.css': '.app { min-height: 100vh; }',
    'src/sections/NavHeaderSection.jsx': 'export default function NavHeaderSection(){ return <nav><span>Moss &amp; Morning</span></nav>; }',
  };
  const composed = judgeCreateEvidence({
    evidence: emptyCreateEvidence({
      staticReady: true, npmInstalled: true, httpOk: true, mounted: true,
      consoleClean: true, consoleErrors: [], smokeOk: true, pass: true,
      renderedSample: 'Moss & Morning Collection Care Tips Store Hours Location',
    }),
    files: composedFiles,
    brief: 'Build a polished neighborhood plant shop website with a featured collection, care tips, store hours, and location.',
    productName: 'Moss & Morning',
    requirePlanDesign: false,
  });
  assert.equal(composed.ok, true, `composed brand in a section must pass: ${composed.reasons.join('; ')}`);

  const missingVisibleBrand = judgeCreateEvidence({
    evidence: emptyCreateEvidence({
      staticReady: true, npmInstalled: true, httpOk: true, mounted: true,
      consoleClean: true, consoleErrors: [], smokeOk: true, pass: true,
      renderedSample: 'Collection Care Tips Store Hours Location',
    }),
    files: composedFiles,
    brief: 'Build a polished neighborhood plant shop website with a featured collection, care tips, store hours, and location.',
    productName: 'Moss & Morning',
    requirePlanDesign: false,
  });
  assert.ok(missingVisibleBrand.reasons.some((reason) => /product brand not visible in Live sample/i.test(reason)));
}
{
  const { looksLikeRollbackAsk } = await import('../src/lib/createCheckpoint.ts');
  assert.equal(looksLikeRollbackAsk('rollback'), true);
  assert.equal(looksLikeRollbackAsk('what is a todo'), false);
}

console.log('smoke-create-evidence: ok');
