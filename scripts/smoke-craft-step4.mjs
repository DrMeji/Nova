/**
 * Step 4 (Craft) — peer bar vs Nova invent prompt + order.
 * Re-run until zero FAIL before advancing to Verify.
 *
 * Peer bar (Lovable / anti-slop / Claude design craft):
 *   tone commit · tokens · craft order layout→brand→sections→motion · must-haves · no floor twin
 */
import { understandCreateBrief } from '../src/lib/codingCreatePipeline.ts';
import {
  CODING_AGENT_PACK,
  formatGenericInventOwnLookPrompt,
  extractCraftTokensFromBrief,
  looksLikePlaceholderFloor,
} from '../src/lib/codingAgentPack.ts';
import { CODING_QUALITY_WIN } from '../src/lib/codingQualityWinPack.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

const BRIEF =
  'Create a new website project called Paper Shelf on disk now. Soft paper background, deep ink navy type, warm brass accent. Full-bleed quiet hero with the brand name, one short line about a reading shelf, and a grid of 4 book cards (title + author). Polished single page. Skip Plan — build it.';

const plan = understandCreateBrief({ brief: BRIEF, brand: 'Paper Shelf' });
const inventAsk = formatGenericInventOwnLookPrompt({
  brand: 'Paper Shelf',
  brief: BRIEF,
  salt: 'craft4',
  goal: plan.goal,
  audience: plan.audience,
  primaryAction: plan.primaryAction,
  assumptions: plan.assumptions,
  mustHave: plan.mustHave,
  outOfScope: plan.outOfScope,
  verifyChecks: plan.verifyChecks,
  craftOrder: plan.craftOrder,
});

console.log('\n=== Craft invent ask (head) ===');
console.log(inventAsk.slice(0, 900));
console.log('…');

check('CODING_AGENT_PACK.inventFirstCreate on', CODING_AGENT_PACK.inventFirstCreate === true);
check('CODING_QUALITY_WIN.craftOrderLayoutFirst on', CODING_QUALITY_WIN.craftOrderLayoutFirst === true);
check('plan.craftOrder starts with layout', /layout/i.test(plan.craftOrder[0] || ''), plan.craftOrder[0]);
check('plan.craftOrder ends with motion/icons', /motion|icon/i.test(plan.craftOrder[plan.craftOrder.length - 1] || ''), plan.craftOrder.at(-1));

check('invent ask has TONE', /TONE:/i.test(inventAsk));
check('invent ask has CRAFT ORDER', /CRAFT ORDER/i.test(inventAsk));
check('invent ask has DESIGN TOKENS', /DESIGN TOKENS/i.test(inventAsk));
check('invent ask has --paper / --ink / --accent', /--paper:/.test(inventAsk) && /--ink:/.test(inventAsk) && /--accent:/.test(inventAsk));
check('invent ask tokens mention paper or brass or navy', /paper|brass|navy/i.test(inventAsk));
check('invent ask has LAYOUT structural', /LAYOUT:/i.test(inventAsk));
check('invent ask has MOTION restrained', /MOTION:/i.test(inventAsk) && /reduced-motion/i.test(inventAsk));
check('invent ask has MUST-HAVES', /MUST-HAVES/i.test(inventAsk));
check('invent ask bans todo / floor', /todo|floor/i.test(inventAsk));
check('invent ask has DONE CHECKS', /DONE CHECKS/i.test(inventAsk));

const tokens = extractCraftTokensFromBrief(BRIEF);
check('tokens.paper soft paper', /paper|off-white/i.test(tokens.paper), tokens.paper);
check('tokens.ink navy', /navy/i.test(tokens.ink), tokens.ink);
check('tokens.accent brass', /brass/i.test(tokens.accent), tokens.accent);
check('tokens.tone quiet editorial', /editorial|quiet/i.test(tokens.tone), tokens.tone);
check('tokens.displayHint serif', /serif|editorial/i.test(tokens.displayHint), tokens.displayHint);

// Bare scaffold must not look like placeholder floor
const bare = {
  'src/App.jsx': `import './App.css';\nexport default function App(){return <div className="app" id="root-app"></div>;}\n`,
  'src/App.css': `.app{min-height:100vh;background:#f7f4ef;color:#1a1f2a}\n`,
};
const floor = looksLikePlaceholderFloor(bare);
check('bare scaffold is not placeholder floor', floor.floor === false, floor.reasons.join(','));

// Knife invent ask must not get paper reading-shelf tokens
const knifePlan = understandCreateBrief({
  brief: 'Build Gyuto Forge knife shop with cart and steel blades',
  brand: 'Gyuto Forge',
});
const knifeAsk = formatGenericInventOwnLookPrompt({
  brand: 'Gyuto Forge',
  brief: 'Build Gyuto Forge knife shop with cart and steel blades',
  salt: 'k1',
  mustHave: knifePlan.mustHave,
  craftOrder: knifePlan.craftOrder,
});
check('knife invent ask has CRAFT ORDER', /CRAFT ORDER/i.test(knifeAsk));
check('knife invent ask not quiet editorial paper shelf', !/quiet editorial/i.test(knifeAsk) || /shop|cart/i.test(knifeAsk));

if (failed) {
  console.error(`\nStep 4 craft: ${failed} check(s) failed — stay on Craft`);
  process.exit(1);
}
console.log('\nStep 4 craft: all checks passed — peer bar met for Craft invent contract');
