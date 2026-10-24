/**
 * E + G — Pass spine + Ready gates peer bar.
 * Live unlock ≠ quality Ready. Floors / repair / brief miss block quality only.
 */
import { CREATE_PASS_ORDER, judgeCreateVerified, createPassStatusLabel } from '../src/lib/createPassSpine.ts';
import { emptyCreateEvidence, finalizeCreateEvidence, CREATE_RUNTIME_STAGES } from '../src/lib/createEvidence.ts';
import { canUnlockCreateLive } from '../src/lib/createReady.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n=== E/G Pass spine + Ready · peer rescan ===');

check('CREATE_PASS_ORDER 6', CREATE_PASS_ORDER.length === 6);
check('pass order plan→critic', CREATE_PASS_ORDER[0] === 'plan' && CREATE_PASS_ORDER.at(-1) === 'critic');
check('CREATE_RUNTIME_STAGES includes live+verified', CREATE_RUNTIME_STAGES.includes('live') && CREATE_RUNTIME_STAGES.includes('verified'));
check('pass label', /Plan/.test(createPassStatusLabel('plan')));

const evidence = finalizeCreateEvidence(emptyCreateEvidence({
  staticReady: true,
  npmInstalled: true,
  httpOk: true,
  mounted: true,
  consoleClean: true,
  smokeOk: true,
  liveUrl: 'http://127.0.0.1:5173/',
}));

const PAPER =
  'Create Paper Shelf soft paper navy brass hero grid of 4 book cards title author single page';

const todoTwin = {
  'src/App.jsx': `
import { useState } from 'react';
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
  'src/App.css': '.app{min-height:100vh;background:#111;color:#eee}',
};

const twinVerdict = judgeCreateVerified({
  evidence,
  files: todoTwin,
  brief: PAPER,
  productName: 'Paper Shelf',
  floorFallback: false,
});
check('todo twin liveUnlock may be true (mount)', twinVerdict.liveUnlock === true);
check('todo twin qualityReady false', twinVerdict.qualityReady === false);
check(
  'todo twin reasons cite brief or composition or ask',
  twinVerdict.reasons.some((r) => /brief|todo|composition|ask|plan|design/i.test(r)),
  twinVerdict.reasons.slice(0, 4).join(' | '),
);

const floorVerdict = judgeCreateVerified({
  evidence,
  files: todoTwin,
  brief: PAPER,
  productName: 'Paper Shelf',
  floorFallback: true,
});
check('floorFallback qualityReady false', floorVerdict.qualityReady === false);
check('floorFallback reason', floorVerdict.reasons.some((r) => /floor/i.test(r)));

// Live unlock requires preview URL
const noUrl = canUnlockCreateLive(
  {
    id: 'j1',
    chatId: 'c',
    path: '',
    projectId: 'p',
    name: 'Paper Shelf',
    files: todoTwin,
    status: 'verifying',
    previewUrl: '',
    craftBlocked: false,
    blockedReasons: [],
    updatedAt: Date.now(),
  },
  todoTwin,
  PAPER,
);
check('missing preview URL blocks Live unlock', noUrl.ok === false);

const withUrl = canUnlockCreateLive(
  {
    id: 'j2',
    chatId: 'c',
    path: '',
    projectId: 'p',
    name: 'Paper Shelf',
    files: todoTwin,
    status: 'verifying',
    previewUrl: 'http://127.0.0.1:5173/',
    craftBlocked: false,
    blockedReasons: [],
    updatedAt: Date.now(),
  },
  todoTwin,
  PAPER,
);
check('preview URL allows Live unlock (soft notes ok)', withUrl.ok === true);

if (failed) {
  console.error(`\nE/G peer: ${failed} failed`);
  process.exit(1);
}
console.log('\nE/G pass-spine peer: all checks passed');
