/**
 * D — Create runtime stages peer alignment with thin create + quality spine.
 * plan → scaffold → craft → preflight → install → live → fix → verified
 */
import { CREATE_RUNTIME_STAGES, createRuntimeStageLabel } from '../src/lib/createEvidence.ts';
import { THIN_CREATE_STAGES } from '../src/lib/createThinPath.ts';
import { CODING_PIPELINE_STEPS } from '../src/lib/codingQualityWinPack.ts';
import { CREATE_PASS_ORDER } from '../src/lib/createPassSpine.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n=== D Runtime stages · peer rescan ===');

check('8 runtime stages', CREATE_RUNTIME_STAGES.length === 8);
check('starts plan', CREATE_RUNTIME_STAGES[0] === 'plan');
check('ends verified', CREATE_RUNTIME_STAGES.at(-1) === 'verified');
check(
  'order plan→scaffold→craft→preflight→install→live→fix→verified',
  CREATE_RUNTIME_STAGES.join('→') === 'plan→scaffold→craft→preflight→install→live→fix→verified',
);
check('live before verified', CREATE_RUNTIME_STAGES.indexOf('live') < CREATE_RUNTIME_STAGES.indexOf('verified'));
check('install before live', CREATE_RUNTIME_STAGES.indexOf('install') < CREATE_RUNTIME_STAGES.indexOf('live'));
check('label live', createRuntimeStageLabel('live') === 'Live verify');

// Align with thin create: scaffold/craft/syntax≈preflight/npm≈install/live/ready≈verified
check('thin has scaffold', THIN_CREATE_STAGES.includes('scaffold'));
check('thin has craft', THIN_CREATE_STAGES.includes('craft'));
check('thin has live', THIN_CREATE_STAGES.includes('live'));
check('thin has ready', THIN_CREATE_STAGES.includes('ready'));

// Quality spine craft/verify/done map onto craft/live|fix/verified
check('quality has craft', CODING_PIPELINE_STEPS.includes('craft'));
check('quality has verify', CODING_PIPELINE_STEPS.includes('verify'));
check('quality has done', CODING_PIPELINE_STEPS.includes('done'));

// Pass spine verify sits with live/verified
check('pass has verify', CREATE_PASS_ORDER.includes('verify'));
check('pass has critic', CREATE_PASS_ORDER.includes('critic'));

if (failed) {
  console.error(`\nD runtime peer: ${failed} failed`);
  process.exit(1);
}
console.log('\nD runtime peer: all checks passed');
