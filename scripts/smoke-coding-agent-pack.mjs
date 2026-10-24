/**
 * Coding-agent pack — every gap-research capability must report Have.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-coding-agent-pack.mjs
 */
import assert from 'node:assert/strict';
import {
  CODING_AGENT_PACK,
  codingAgentGapStatus,
  looksLikePlaceholderFloor,
  formatGenericInventOwnLookPrompt,
  briefWantsInventFirstCreate,
  formatAgentRepoMapBlock,
  parseArchitectPlan,
  formatArchitectSystemPrompt,
  formatEditorFromArchitectPrompt,
  askIsSurgicalMicroOnly,
  surgicalMicroEditGuardMessage,
  localCreateHonestMissRules,
  readBeforeEditAllowed,
  doneEvidenceGate,
} from '@/lib/codingAgentPack';

assert.equal(CODING_AGENT_PACK.inventFirstCreate, true);
assert.equal(CODING_AGENT_PACK.evidenceBeforeDone, true);
assert.equal(CODING_AGENT_PACK.readBeforeEdit, true);
assert.equal(CODING_AGENT_PACK.repoMapEveryStep, true);
assert.equal(CODING_AGENT_PACK.architectEditorSplit, true);
assert.equal(CODING_AGENT_PACK.surgicalMicroEdit, true);
assert.equal(CODING_AGENT_PACK.rejectFloorAsReady, true);
assert.equal(CODING_AGENT_PACK.localModelHonestMiss, true);

const status = codingAgentGapStatus();
for (const [cap, gap] of Object.entries(status)) {
  assert.equal(gap, 'Have', `${cap} must be Have`);
}
assert.equal(Object.keys(status).length, 10, '10 capabilities');

assert.equal(
  briefWantsInventFirstCreate('Create a new portfolio website for Oak Studio on disk'),
  true,
  'portfolio invent-first',
);
assert.equal(
  briefWantsInventFirstCreate('make the background cream brown'),
  false,
  'micro edit is not invent-first create',
);
assert.equal(
  briefWantsInventFirstCreate('Build a Node CLI that renames files'),
  false,
  'CLI must not invent-first',
);
assert.equal(
  briefWantsInventFirstCreate('Build an Express API for todos'),
  false,
  'API must not invent-first',
);
assert.equal(
  briefWantsInventFirstCreate('Build a TypeScript library for date math'),
  false,
  'library must not invent-first',
);

const invent = formatGenericInventOwnLookPrompt({
  brand: 'OakStudio',
  brief: 'Create a photography portfolio website with gallery and contact.',
  salt: 'abc123',
});
assert.ok(/one-of-one|Invent/i.test(invent));
assert.ok(/fails Ready/i.test(invent));

const floorFiles = {
  'src/App.jsx': 'export default function App(){return <div className="site">Shop</div>}',
  'src/data/products.ts': '// nova-storefront-spine:test\nexport const PRODUCTS = []',
};
assert.equal(looksLikePlaceholderFloor(floorFiles).floor, true, 'spine is floor');
assert.equal(
  looksLikePlaceholderFloor({
    'src/App.jsx': 'export default function App(){return <main className="oak-portfolio">Oak</main>}',
  }).floor,
  false,
  'unique site not floor',
);

const map = formatAgentRepoMapBlock(
  {
    'src/App.jsx': 'export default function App(){ return null }\nexport function Hero(){}',
    'src/App.css': '.app{}',
    'package.json': '{"scripts":{"dev":"vite"}}',
  },
  'portfolio gallery',
  { limit: 8 },
);
assert.ok(/Ranked project map/i.test(map));
assert.ok(/Hero|App/i.test(map), 'symbols in map');

const plan = parseArchitectPlan(`
Build a clean portfolio.
- src/App.jsx
- src/App.css
1. Write hero with brand
2. Add gallery grid
3. Contact form
`);
assert.ok(plan);
assert.ok(plan.files.includes('src/App.jsx'));
assert.ok(plan.steps.length >= 2);
assert.ok(formatArchitectSystemPrompt('brief', map).includes('ARCHITECT'));
assert.ok(formatEditorFromArchitectPrompt(plan, 'brief', 'src/App.jsx').includes('EDITOR'));

assert.equal(askIsSurgicalMicroOnly('make the background cream brown'), true);
assert.equal(askIsSurgicalMicroOnly('Create a new e-commerce website with cart'), false);
assert.ok(surgicalMicroEditGuardMessage().includes('SURGICAL'));
assert.ok(localCreateHonestMissRules().includes('LOCAL MODEL'));

const reads = new Set();
assert.equal(
  readBeforeEditAllowed('src/App.jsx', reads, { 'src/App.jsx': 'x'.repeat(500) }).ok,
  false,
  'must read first',
);
reads.add('src/App.jsx');
assert.equal(
  readBeforeEditAllowed('src/App.jsx', reads, { 'src/App.jsx': 'x'.repeat(500) }).ok,
  true,
  'read ok',
);
assert.equal(
  readBeforeEditAllowed('src/App.jsx', new Set(), { 'src/App.jsx': 'thin' }, { createCraft: true }).ok,
  true,
  'thin create write ok',
);

assert.equal(doneEvidenceGate({ createCraft: true, floorShipped: true }).ok, false);
assert.equal(doneEvidenceGate({ createCraft: true, sawLivePass: true, verifyOk: true }).ok, true);
assert.equal(doneEvidenceGate({ verifyOk: false }).ok, false);

console.log('smoke-coding-agent-pack: ok — all 10 capabilities Have');
