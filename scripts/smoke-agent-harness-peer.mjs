/**
 * J — Agent harness peer bar (OpenHands / Devin / Cursor Agent).
 * Flags Have + Ready gate rejects floor + hot-path imports wired.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HARNESS_PACK,
  harnessGapStatus,
  harnessQualityReadyGate,
  constrainToolDecode,
  r7r10GapStatus,
} from '../src/lib/agentHarness/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n=== J Agent harness · peer rescan ===');

const status = harnessGapStatus();
const caps = Object.keys(status);
check('P0–P2 caps ≥30', caps.length >= 30, String(caps.length));
check('all Have', Object.values(status).every((v) => v === 'Have'));
check('binaryRubric on', HARNESS_PACK.binaryRubric === true);
check('generator≠evaluator on', HARNESS_PACK.generatorNeEvaluator === true);
check('failToPassSmoke on', HARNESS_PACK.failToPassSmoke === true);
check('constrainedToolDecode on', HARNESS_PACK.constrainedToolDecode === true);
check('hooksBus on', HARNESS_PACK.hooksBus === true);

const r7 = r7r10GapStatus();
check('R7–R10 Have', Object.values(r7).every((v) => v === 'Have'), JSON.stringify(r7));

const floorFiles = {
  'src/App.jsx': 'export default function App(){return <div className="app">Shop</div>}',
  'src/data/products.ts': '// nova-storefront-spine:test\nexport const PRODUCTS = []',
  'src/App.css': '.app{}',
};
const floorGate = harnessQualityReadyGate({
  files: floorFiles,
  brief: 'Create Oak furniture shop',
  brand: 'Oak',
  evidence: { mounted: true, consoleClean: true, smokeOk: true, floor: true },
  smoke: { ok: true, detail: 'ok' },
});
check('Ready rejects floor evidence', floorGate.ok === false, floorGate.reasons.join('; '));

const decoded = constrainToolDecode('TOOL: read\nPATH: src/App.jsx');
check('constrainToolDecode read', decoded?.tool === 'read' && decoded?.valid === true);

const loopSrc = readFileSync(join(root, 'src/lib/novaAgentLoop.ts'), 'utf8');
check('loop wires constrainToolDecode', /constrainToolDecode/.test(loopSrc));
check('loop wires runHooks', /runHooks/.test(loopSrc));

const jobSrc = readFileSync(join(root, 'src/lib/createJobStore.ts'), 'utf8');
check('createJobStore wires harnessQualityReadyGate', /harnessQualityReadyGate/.test(jobSrc));

const createSrc = readFileSync(join(root, 'src/lib/chatTurnHandlers/create.ts'), 'utf8');
check('create wires routeMetaHarness / ears / progress', /routeMetaHarness|earsSpec|progressMd/.test(createSrc));

if (failed) {
  console.error(`\nJ harness peer: ${failed} failed`);
  process.exit(1);
}
console.log('\nJ harness peer: all checks passed');
