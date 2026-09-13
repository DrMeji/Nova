/**
 * classifyTurn acceptance (Grok post-fix audit).
 * npx tsx --tsconfig tsconfig.app.json scripts/check-classify-turn.mjs
 */
import { classifyTurn } from '../src/lib/classifyTurn.ts';
import { looksLikeConversationalPlanningAsk } from '../src/lib/chatIdeaIntent.ts';
import { looksLikeBuildStart } from '../src/lib/chatStudio.ts';
import { hasActiveWorkspace } from '../src/lib/chatAgentTurn.ts';
import { blankSolidColorFromAsk } from '../src/lib/webProjectCanon.ts';
import { fallbackCreateProjectName } from '../src/lib/createProjectIntent.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

{
  const r = classifyTurn('Build me a website');
  check('Build me a website → create', r.kind === 'create', `${r.kind} ${r.reason}`);
  check('create name fallback', Boolean(r.createName || fallbackCreateProjectName('Build me a website')));
}
{
  const r = classifyTurn('Make a brown site called Nightglass');
  check('brown Nightglass → create', r.kind === 'create', `${r.kind} ${r.createName}`);
}
{
  const r = classifyTurn('Help me build a coffee shop site');
  check('Help me build coffee shop → create', r.kind === 'create', `${r.kind} ${r.reason}`);
}
{
  const r = classifyTurn('Add Nightglass After Hours in the center', { diskRoot: 'X', files: { 'src/App.jsx': 'x' } });
  check('center title + disk → edit', r.kind === 'edit', `${r.kind} ${r.reason}`);
}
check('blankSolid center white words → null', blankSolidColorFromAsk('center white words that say Hello') == null);
check('hasActiveWorkspace diskRoot', hasActiveWorkspace({ diskRoot: 'C:\\x', files: {}, projectId: null }));
check('planning(build me a website) false', looksLikeConversationalPlanningAsk('build me a website') === false);
check('looksLikeBuildStart(build me a website)', looksLikeBuildStart('build me a website') === true);
{
  const r = classifyTurn('What should I build first? Still planning only — no scaffolding.');
  check('explicit plan-only → plan', r.kind === 'plan', `${r.kind} ${r.reason}`);
}
{
  const r = classifyTurn('keep building', { diskRoot: 'C:\\p', files: { a: '1' } });
  check('keep building bound → keep_building', r.kind === 'keep_building', r.kind);
}
{
  const r = classifyTurn('add a footer to my new project', { diskRoot: 'C:\\p', files: { 'src/App.jsx': 'x' } });
  check('footer on my new project → edit (not create)', r.kind === 'edit', `${r.kind} ${r.reason}`);
}
{
  const r = classifyTurn('keep building');
  check('unbound keep building → create', r.kind === 'create', `${r.kind} ${r.reason}`);
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll classifyTurn checks passed');
