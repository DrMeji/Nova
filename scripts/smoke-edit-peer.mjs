/**
 * H — Edit / keep_building peer bar (Claude Code / Cursor).
 * read → propose → apply → anti-bleed → syntax → done
 * Surgical micro edits must not rewrite App; keep_building stays on bound project.
 */
import { classifyTurn } from '../src/lib/classifyTurn.ts';
import { looksLikeKeepBuildingAsk, looksLikeCodeEditAsk, hasActiveWorkspace } from '../src/lib/chatAgentTurn.ts';
import {
  CODING_AGENT_PACK,
  EDIT_PIPELINE_STAGES,
  formatEditPipelineProgress,
  askIsSurgicalMicroOnly,
  surgicalMicroEditGuardMessage,
  readBeforeEditAllowed,
} from '../src/lib/codingAgentPack.ts';
import { buildProductPlan, antiBleedForFamily } from '../src/lib/createProductPlan.ts';
import { HANDLER_OWNED_KINDS } from '../src/lib/chatTurnHandlers/dispatch.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n=== H Edit / keep_building · peer rescan ===');

check('CODING_AGENT_PACK.readBeforeEdit', CODING_AGENT_PACK.readBeforeEdit === true);
check('CODING_AGENT_PACK.surgicalMicroEdit', CODING_AGENT_PACK.surgicalMicroEdit === true);
check('EDIT_PIPELINE_STAGES length 6', EDIT_PIPELINE_STAGES.length === 6);
check('stages start read end done', EDIT_PIPELINE_STAGES[0] === 'read' && EDIT_PIPELINE_STAGES.at(-1) === 'done');
check('progress string', /Edit · 1\/6 read/.test(formatEditPipelineProgress('read')));

// Classify
check('keep building ask', looksLikeKeepBuildingAsk('keep building') === true);
check(
  'keep_building with disk → keep_building kind',
  classifyTurn('keep building', { diskRoot: 'C:\\proj', files: { 'src/App.jsx': 'x' } }).kind === 'keep_building',
);
check('add title → edit ask', looksLikeCodeEditAsk('Add the title Nightglass in the center') === true);
check(
  'edit kind with disk',
  classifyTurn('Add a search bar top right', { diskRoot: 'C:\\proj', files: { 'src/App.jsx': 'x' } }).kind === 'edit'
    || classifyTurn('Add a search bar top right', { diskRoot: 'C:\\proj', files: { 'src/App.jsx': 'x' } }).kind === 'keep_building',
);
check('dispatch owns edit', HANDLER_OWNED_KINDS.includes('edit'));
check(
  'hasActiveWorkspace disk',
  hasActiveWorkspace({ diskRoot: 'C:\\x', files: {}, projectId: null }) === true,
);

// Surgical micro
check('bg cream is surgical micro', askIsSurgicalMicroOnly('change background to cream') === true);
check('rebuild is NOT surgical', askIsSurgicalMicroOnly('rebuild the whole website') === false);
check('guard mentions CSS only', /App\.css|never rewrite App/i.test(surgicalMicroEditGuardMessage()));

// Read before edit
const files = {
  'src/App.jsx': `import './App.css';\nexport default function App(){return <div className="app"><h1>Harbor Roast</h1></div>;}\n`,
  'src/App.css': `.app{background:#111}`,
};
const reads = new Set();
const deny = readBeforeEditAllowed('src/App.jsx', reads, files);
check('edit without read denied (peer)', deny.ok === false, deny.reason);
reads.add('src/App.jsx');
const allow = readBeforeEditAllowed('src/App.jsx', reads, files);
check('edit after read allowed', allow.ok === true);
const greenfield = readBeforeEditAllowed('src/App.jsx', new Set(), { 'src/App.jsx': '' }, { createCraft: true });
check('create craft thin write allowed without read', greenfield.ok === true);

// Anti-bleed: tip/tool family must not keep wrong storefront catalog
const tipPlan = buildProductPlan('Build a tip calculator called TipWise', 'TipWise');
const bledIn = {
  'src/App.jsx': `${files['src/App.jsx']}\nimport { PRODUCTS } from './data/products';\n/* NOVA_STOREFRONT_ISLAND */\n`,
  'src/data/products.ts': 'export const PRODUCTS = [{id:1}];\n',
  'src/App.css': files['src/App.css'],
};
const bled = antiBleedForFamily(bledIn, tipPlan);
check(
  'antiBleed strips wrong-family storefront on tip',
  tipPlan.compositionFamily !== 'catalog-store'
    ? (bled.changed === true || !bled.files['src/data/products.ts'] || !/NOVA_STOREFRONT_ISLAND/.test(bled.files['src/App.jsx'] || ''))
    : true,
  `family=${tipPlan.compositionFamily} actions=${(bled.actions || []).join(',')}`,
);

// Brand preserved on micro CSS bleed path — App still has Harbor if we only touch CSS family
const cafePlan = buildProductPlan('Harbor Roast cafe menu hours', 'Harbor Roast');
const cafeFiles = { ...files };
const cafeBled = antiBleedForFamily(cafeFiles, cafePlan);
check(
  'antiBleed keeps brand name in App',
  /Harbor Roast/i.test(cafeBled.files['src/App.jsx'] || cafeFiles['src/App.jsx']),
);

if (failed) {
  console.error(`\nH edit peer: ${failed} failed — stay on Edit`);
  process.exit(1);
}
console.log('\nH edit peer: all checks passed');
