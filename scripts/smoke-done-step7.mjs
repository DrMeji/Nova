/**
 * Step 7 (Done) — peer bar: evidence before done; pipeline exposes done step.
 */
import {
  CODING_PIPELINE_STEPS,
  CODING_QUALITY_WIN,
  formatCodingPipelineProgress,
} from '../src/lib/codingQualityWinPack.ts';
import { CODING_AGENT_PACK } from '../src/lib/codingAgentPack.ts';
import { codingPipelineChecklist } from '../src/lib/codingCreatePipeline.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

check('pipeline ends with done', CODING_PIPELINE_STEPS[CODING_PIPELINE_STEPS.length - 1] === 'done');
check('evidenceBeforeDone quality win on', CODING_QUALITY_WIN.evidenceBeforeDone === true);
check('evidenceBeforeDone agent pack on', CODING_AGENT_PACK.evidenceBeforeDone === true);
check('format done progress', /done/i.test(formatCodingPipelineProgress('done')));
const list = codingPipelineChecklist();
check('checklist has 7 steps', list.length === 7);
check('checklist includes verify+premium+done', list.some((x) => x.id === 'verify') && list.some((x) => x.id === 'premium') && list.some((x) => x.id === 'done'));

if (failed) {
  console.error(`\nStep 7 done: ${failed} failed`);
  process.exit(1);
}
console.log('\nStep 7 done: all checks passed');
