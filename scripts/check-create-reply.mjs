/**
 * Create reply / handler acceptance (Grok whole-app Sprint A).
 * npx tsx --tsconfig tsconfig.app.json scripts/check-create-reply.mjs
 */
import { pendingCreateBootstrap } from '../src/lib/chatTurnHandlers/createBootstrap.ts';
import { runCreateTurn, teachableCreateError, resolveCreateUiPolishCoder } from '../src/lib/chatTurnHandlers/create.ts';
import { shouldSkipWeakModelCodingHop } from '../src/lib/chatTurnHandlers/edit.ts';
import { classifyTurn } from '../src/lib/classifyTurn.ts';
import { FIRST_RUN_KIND_CHIPS, withExplicitTurnKind } from '../src/lib/chatTurnHandlers/kinds.ts';
import { formatCreateProjectReply } from '../src/lib/createProjectFlow.ts';
import { briefNeedsCreateUiPolish } from '../src/lib/createBuildQuality.ts';
import { pickReadyCreatePolishCoder } from '../src/lib/enginePick.ts';
import { codingFileEditTimeoutMs } from '../src/lib/studioAnswerEngine.ts';

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
  check('pending bootstrap invites Live', /click \*\*Live\*\*/i.test(reply), reply.slice(0, 200));
  check(
    'pending create is professional (no Ready stamp, no files dump)',
    /I've created/i.test(reply) && !/\*\*Ready\*\*/i.test(reply) && !/\*\*Files written/i.test(reply),
    reply.slice(0, 220),
  );
}
{
  const richNote = pendingCreateBootstrap('Product store UI is ready for Live.');
  const richReply = formatCreateProjectReply(
    {
      name: 'Ember Roast',
      slug: 'ember-roast',
      kind: 'react',
      summary: 'Premium coffee landing with hero, nav, menu, footer',
      preferPlan: false,
    },
    {
      ok: true,
      projectPath: 'C:\\\\Users\\\\x\\\\Documents\\\\NOVA Projects\\\\ember-roast',
      projectId: 'proj-ember',
      written: ['src/App.jsx', 'package.json'],
      files: { 'src/App.jsx': 'export default function App(){return <main/>}' },
    },
    richNote,
  );
  check(
    'rich create invites changes, not soft-sell make it richer',
    /I've created/i.test(richReply) && /Want anything changed/i.test(richReply) && !/make it richer/i.test(richReply),
    richReply.slice(0, 240),
  );
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
check(
  'logitech/keyboard brief needs UI polish',
  briefNeedsCreateUiPolish(
    'Build Pulse Pro Keyboard — Logitech-style gaming keyboard marketing landing with hero nav footer',
  ) === true,
);
check(
  'short keyboard landing needs polish',
  briefNeedsCreateUiPolish('keyboard landing page') === true,
);
check(
  'bare website stays scaffold-only',
  briefNeedsCreateUiPolish('Build me a website') === false,
);

check(
  'resolveCreateUiPolishCoder exported',
  typeof resolveCreateUiPolishCoder === 'function',
);
check(
  'pickReadyCreatePolishCoder prefers best (14B over 7B)',
  pickReadyCreatePolishCoder([
    { id: 'qwen25-coder-14b', status: 'ready' },
    { id: 'qwen25-coder-7b', status: 'ready' },
  ])?.id === 'qwen25-coder-14b',
);
{
  const polishAsk = 'Build the first real multi-section UI\n@@@FILE src/App.jsx\nfooter and product copy';
  check(
    'create polish ask uses ≥120s coding timeout',
    codingFileEditTimeoutMs(polishAsk) >= 120_000,
    String(codingFileEditTimeoutMs(polishAsk)),
  );
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll create-reply / handler checks passed');
