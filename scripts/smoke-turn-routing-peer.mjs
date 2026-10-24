/**
 * A — Turn routing peer bar (Cursor/Claude Composer modes).
 * Explicit nova-kind wins; talk-before-create; hard-go create; micro → edit.
 */
import { classifyTurn } from '../src/lib/classifyTurn.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n=== A Turn routing · peer rescan ===');

check('empty → chat', classifyTurn('').kind === 'chat');
check(
  'talk-before-create',
  classifyTurn('can you help me create a portfolio website?').kind === 'chat',
);
check(
  'feasibility stays chat',
  classifyTurn('how long would it take to build a shop website?').kind === 'chat',
);
const hard = classifyTurn(
  'Create a new portfolio website for Oak Studio on disk and get it Live — skip the plan.',
);
check('hard-go → create', hard.kind === 'create', hard.reason);
check(
  'explicit nova-kind create',
  classifyTurn('<!--nova-kind:create--> whatever soft wording').kind === 'create',
);
check(
  'explicit nova-kind plan',
  classifyTurn('<!--nova-kind:plan--> Build a shop later').kind === 'plan',
);
check(
  'explicit nova-kind edit',
  classifyTurn('<!--nova-kind:edit--> make the title bigger').kind === 'edit',
);
const micro = classifyTurn('make the background cream brown');
check('micro UI → edit', micro.kind === 'edit', micro.reason);
check(
  'delete kind',
  classifyTurn('<!--nova-kind:delete--> remove the project').kind === 'delete',
);

if (failed) {
  console.error(`\nA routing peer: ${failed} failed`);
  process.exit(1);
}
console.log('\nA routing peer: all checks passed');
