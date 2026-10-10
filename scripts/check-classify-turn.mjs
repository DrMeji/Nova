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
  check(
    'Help me build coffee shop → talk-before (not instant create)',
    r.kind === 'chat' && r.reason === 'talk-before-create',
    `${r.kind} ${r.reason}`,
  );
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
{
  const ask = 'i want to build a app like discord, what do i need to build it Like all the requirements and stuff. What do I actually need';
  const r = classifyTurn(ask);
  check('Discord requirements ask → chat (not create)', r.kind === 'chat', `${r.kind} ${r.reason}`);
  check('requirements reason', r.reason === 'requirements-advice' || r.reason === 'talk-before-create', r.reason);
}
{
  const ask = 'i want to build a app like twitch tv, Are you familiar with Twitch TV the Streaming platform app';
  const r = classifyTurn(ask);
  check('Twitch exploratory ask → chat (not create)', r.kind === 'chat', `${r.kind} ${r.reason}`);
}
{
  const ask =
    "Hey, I organize a weekend farmers market stalls and keep losing track of who's selling what. Think of a tiny phone page";
  const r = classifyTurn(ask);
  check('farmers market problem sketch → chat (not create)', r.kind === 'chat', `${r.kind} ${r.reason}`);
  check('farmers market talk-before-create', r.reason === 'talk-before-create', r.reason);
}
{
  const r = classifyTurn('Build me a Discord-like chat app called Nightcord');
  check('named Discord clone build → create', r.kind === 'create', `${r.kind} ${r.reason}`);
}
{
  const r = classifyTurn('scaffold a chat app now');
  check('scaffold now → create', r.kind === 'create', `${r.kind} ${r.reason}`);
}
{
  // Bare "ok start." with no pending brief must ask — not invent App.
  const bare = classifyTurn('ok start.');
  check('ok start. without pending → chat (needs brief)', bare.kind === 'chat', `${bare.kind} ${bare.reason}`);
  const withPending = classifyTurn('ok start.', {
    pendingBrief: 'Build a multi-restaurant booking marketplace with search and email confirmations for each venue.',
  });
  check('ok start. with pending brief → create', withPending.kind === 'create', `${withPending.kind} ${withPending.reason}`);
}
{
  const r = classifyTurn('Start building Nightcord first slice.');
  check('Start building after requirements → create', r.kind === 'create', `${r.kind} ${r.reason}`);
  check('create-go reason', r.reason === 'greenfield-create-go' || r.reason === 'hard-create-go', r.reason);
}
{
  const r = classifyTurn('ok start building', {
    pendingBrief: 'A Discord-like chat app called Nightcord with servers channels and a chat pane.',
  });
  check('ok start building with pending → create', r.kind === 'create', `${r.kind} ${r.reason}`);
}
{
  // Bare go-build with no pending store — rebuild brief from prior user turns.
  const prior =
    'I want a dive-log web app called ReefLog with a trip list, depth chart, and add-entry form for weekend dives.';
  const bare = classifyTurn('ok start building', { recentUserLines: [prior] });
  check('ok start building with thread brief → create', bare.kind === 'create', `${bare.kind} ${bare.reason}`);
  check('thread brief create name', /reef/i.test(String(bare.createName || '')), bare.createName);
}
{
  // Bound folder: "start building" without brand-new stays polish, not a second project.
  const r = classifyTurn('start building', { diskRoot: 'C:\\Ovenfold', files: { 'src/App.jsx': 'x' } });
  check('start building on bound → edit/keep (not create)', r.kind !== 'create', `${r.kind} ${r.reason}`);
}

{
  const ask =
    `hey i'm trying to put a little plant shop together — nothing fancy yet. can we just start with a creamy cream-white background for the page? call the project Garden Bed. skip the plan, just put it on disk and get Live going`;
  const r = classifyTurn(ask);
  check('Garden Bed hard-go first ask → create', r.kind === 'create', `${r.kind} ${r.reason}`);
  check('Garden Bed name', /garden\s*bed/i.test(String(r.createName || '')), r.createName);
}
{
  // Soft explore without disk/Live stays talk-first.
  const r = classifyTurn('Help me put a little plant shop together — what should it include?');
  check('plant shop explore → chat (not create)', r.kind === 'chat', `${r.kind} ${r.reason}`);
}
{
  const ask =
    'Build a website for a small-batch matcha brand called Verdigris Matcha Co. Include origin story, tin hero, tasting notes, and Shop + Steep guides CTAs. Skip the plan — put it on disk and open Live.';
  const r = classifyTurn(ask);
  check('Verdigris skip-plan on-disk Live → create', r.kind === 'create', `${r.kind} ${r.reason}`);
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll classifyTurn checks passed');
