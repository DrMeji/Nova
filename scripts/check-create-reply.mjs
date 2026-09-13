/**
 * Create reply / handler acceptance (Grok whole-app Sprint A).
 * npx tsx --tsconfig tsconfig.app.json scripts/check-create-reply.mjs
 */
import { pendingCreateBootstrap } from '../src/lib/chatTurnHandlers/createBootstrap.ts';
import { runCreateTurn, teachableCreateError } from '../src/lib/chatTurnHandlers/create.ts';
import { shouldSkipWeakModelCodingHop } from '../src/lib/chatTurnHandlers/edit.ts';
import { classifyTurn } from '../src/lib/classifyTurn.ts';
import { FIRST_RUN_KIND_CHIPS, withExplicitTurnKind } from '../src/lib/chatTurnHandlers/kinds.ts';
import { formatCreateProjectReply } from '../src/lib/createProjectFlow.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

{
  const bootstrap = pendingCreateBootstrap();
  const reply = formatCreateProjectReply(
    {
      name: 'Nightglass',
      slug: 'nightglass',
      kind: 'react',
      summary: 'Build me a website',
      preferPlan: false,
    },
    {
      ok: true,
      projectPath: 'C:\\\\Users\\\\x\\\\Documents\\\\NOVA Projects\\\\nightglass',
      projectId: 'proj-test',
      written: ['src/App.jsx', 'package.json'],
      files: { 'src/App.jsx': 'export default function App(){return null}' },
    },
    bootstrap,
  );
  check('pending bootstrap not npm-failed', !/npm install failed/i.test(reply), reply.slice(0, 200));
  check('pending bootstrap says files written / background', /files written|background/i.test(reply), reply.slice(0, 200));
}

{
  const r = classifyTurn(withExplicitTurnKind('create', 'Build me a website'));
  check('ark-kind create chip → create', r.kind === 'create' && r.reason === 'explicit-ark-kind', `${r.kind} ${r.reason}`);
}
{
  const r = classifyTurn(FIRST_RUN_KIND_CHIPS[1].prompt, { diskRoot: 'C:\\\\p', files: { a: '1' } });
  check('Edit this chip → edit', r.kind === 'edit', `${r.kind} ${r.reason}`);
}
{
  const r = classifyTurn(FIRST_RUN_KIND_CHIPS[2].prompt);
  check('Plan only chip → plan', r.kind === 'plan', `${r.kind} ${r.reason}`);
}

check(
  'weak 1.5B + add title skips answerStudio hop',
  shouldSkipWeakModelCodingHop({
    userMessage: 'add a title',
    modelId: 'qwen2.5-1.5b-instruct',
    modelName: 'Qwen 1.5B',
    surgicalMissed: true,
  }) === true,
);

check('teachable grant error', /folder access/i.test(teachableCreateError('Documents grant required', 'Ember')));
check('runCreateTurn exported', typeof runCreateTurn === 'function');
check('first-run chips are 3', FIRST_RUN_KIND_CHIPS.length === 3);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll create-reply / handler checks passed');
