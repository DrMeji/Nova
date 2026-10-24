/**
 * I — Agent loop peer bar (SWE-agent / Claude Code / OpenHands).
 * map → read → write → verify-each → evidence → done
 */
import {
  CODING_AGENT_PACK,
  AGENT_LOOP_STAGES,
  formatAgentLoopProgress,
  readBeforeEditAllowed,
  doneEvidenceGate,
} from '../src/lib/codingAgentPack.ts';
import { CODING_QUALITY_WIN } from '../src/lib/codingQualityWinPack.ts';
import { doomLoopGuard, resetDoomLoopGuards } from '../src/lib/codingFileVerify.ts';
import {
  isBrokenReactAppSource,
  isAgentLoopWritableAppSource,
} from '../src/lib/freshSpaFromBrief.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n=== I Agent loop · peer rescan ===');

check('AGENT_LOOP_STAGES 6', AGENT_LOOP_STAGES.length === 6);
check('stages map→done', AGENT_LOOP_STAGES[0] === 'map' && AGENT_LOOP_STAGES.at(-1) === 'done');
check('progress', /Agent · 4\/6 verify/.test(formatAgentLoopProgress('verify')));
check('verifyAfterEachFile on', CODING_QUALITY_WIN.verifyAfterEachFile === true);
check('readBeforeEdit on', CODING_AGENT_PACK.readBeforeEdit === true);
check('doomLoopBreaker on', CODING_AGENT_PACK.doomLoopBreaker === true);
check('evidenceBeforeDone on', CODING_AGENT_PACK.evidenceBeforeDone === true);
check('repoMapEveryStep on', CODING_AGENT_PACK.repoMapEveryStep === true);

const files = { 'src/App.jsx': 'export default function App(){return null}\n'.repeat(20) };
const reads = new Set();
check('patch without read blocked', readBeforeEditAllowed('src/App.jsx', reads, files).ok === false);
reads.add('src/App.jsx');
check('patch after read ok', readBeforeEditAllowed('src/App.jsx', reads, files).ok === true);

resetDoomLoopGuards();
const thin = 'export default function App(){return <div/>}\n';
let doom = { break: false, count: 0 };
for (let i = 0; i < 3; i++) doom = doomLoopGuard('src/App.jsx', thin);
check('doom loop trips on thin thrice', doom.break === true && doom.count >= 3, JSON.stringify(doom));

check(
  'done evidence create needs ready/live',
  doneEvidenceGate({ createCraft: true, sawLivePass: true, verifyOk: true }).ok === true,
);
check(
  'done blocked without ready/live',
  doneEvidenceGate({ createCraft: true }).ok === false,
);
check(
  'done blocked on floor',
  doneEvidenceGate({ createCraft: true, floorShipped: true, sawLivePass: true }).ok === false,
);
check('done blocked on verify fail', doneEvidenceGate({ verifyOk: false }).ok === false);

const thinValid = 'export const hello = "world"\nexport default function App(){ return null }\n';
check('invent gate still flags thin App', isBrokenReactAppSource(thinValid) === true);
check('agent loop accepts thin valid App', isAgentLoopWritableAppSource(thinValid) === true);
check(
  'agent rejects truncated',
  isAgentLoopWritableAppSource(
    'export default function App(){\n  return (\n    <main className="page">\n      <h1>Hello\n',
  ) === false,
);

if (failed) {
  console.error(`\nI agent-loop peer: ${failed} failed`);
  process.exit(1);
}
console.log('\nI agent-loop peer: all checks passed');
