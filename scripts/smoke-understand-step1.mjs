/**
 * Step 1 (Parse / Understand) — peer bar vs Nova.
 * Re-run until zero FAIL before advancing to Prep.
 *
 * Peer bar (Replit / Devin / Claude / Cursor / v0 / Lovable / Bolt):
 *   goal · audience · must-haves · out-of-scope · Done checks · primary action · assumptions
 *   → feed into invent prompt before any write.
 */
import { understandCreateBrief } from '../src/lib/codingCreatePipeline.ts';
import { extractMustHaveFromBrief } from '../src/lib/createIdentity.ts';
import { formatGenericInventOwnLookPrompt } from '../src/lib/codingAgentPack.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

const PAPER_SHELF_BRIEF =
  'Create a new website project called Paper Shelf on disk now. Soft paper background, deep ink navy type, warm brass accent. Full-bleed quiet hero with the brand name, one short line about a reading shelf, and a grid of 4 book cards (title + author). Polished single page. Skip Plan — build it.';

const plan = understandCreateBrief({ brief: PAPER_SHELF_BRIEF, brand: 'Paper Shelf' });
const must = extractMustHaveFromBrief(PAPER_SHELF_BRIEF);

console.log('\n=== Paper Shelf understand plan ===');
console.log(JSON.stringify({
  goal: plan.goal,
  audience: plan.audience,
  primaryAction: plan.primaryAction,
  productKind: plan.productKind,
  genre: plan.genre,
  mustHave: plan.mustHave,
  outOfScope: plan.outOfScope,
  assumptions: plan.assumptions,
  verifyChecks: plan.verifyChecks.slice(0, 6),
  filePlan: plan.filePlan,
  hardGo: plan.hardGo,
  twinRisk: plan.twinRisk,
}, null, 2));

// ── Peer shape ──────────────────────────────────────────
check('goal present', Boolean(plan.goal) && /Paper Shelf|reading/i.test(plan.goal), plan.goal);
check('audience present', Boolean(plan.audience), plan.audience);
check('primaryAction present', Boolean(plan.primaryAction) && /book|hero|shelf/i.test(plan.primaryAction), plan.primaryAction);
check('hardGo true (Skip Plan / on disk now)', plan.hardGo === true);
check('productKind website', plan.productKind === 'website', plan.productKind);
check('genre editorial (not generic twin bucket)', plan.genre === 'editorial', plan.genre);
check('editorial filePlan (no products.ts catalog)', !plan.filePlan.includes('src/data/products.ts') && plan.filePlan.includes('README.md'), plan.filePlan.join(','));

// ── Must-haves from Paper Shelf brief ───────────────────
const need = [
  [/paper|soft paper/i, 'soft paper background'],
  [/navy/i, 'ink navy type'],
  [/brass/i, 'warm brass accent'],
  [/hero/i, 'full-bleed quiet hero'],
  [/book|shelf|reading/i, 'reading shelf / book grid'],
  [/exactly 4|4 cards/i, 'exactly 4 cards'],
  [/single[- ]?page/i, 'polished single-page'],
];
for (const [re, label] of need) {
  check(
    `mustHave: ${label}`,
    must.some((m) => re.test(m)) || plan.mustHave.some((m) => re.test(m)),
    `got: ${plan.mustHave.join(' | ')}`,
  );
}
check('mustHave count ≥ 5', plan.mustHave.length >= 5, String(plan.mustHave.length));
check(
  'mustHave does NOT invent sign-in from "author"',
  !plan.mustHave.some((m) => /sign-in|account UI/i.test(m)),
  plan.mustHave.join(' | '),
);
check(
  'mustHave does NOT invent tool-shed from "polished"',
  !plan.mustHave.some((m) => /tool \/ item list/i.test(m)),
  plan.mustHave.join(' | '),
);
check(
  'verifyChecks do not lead with false sign-in',
  !plan.verifyChecks.slice(0, 3).some((c) => /sign-in|account UI/i.test(c)),
  plan.verifyChecks.slice(0, 3).join(' | '),
);

// ── Out of scope / twin fences ──────────────────────────
check(
  'outOfScope blocks todo twin',
  plan.outOfScope.some((s) => /todo/i.test(s)),
  plan.outOfScope.join(', '),
);
check(
  'outOfScope blocks cart/commerce',
  plan.outOfScope.some((s) => /cart|commerce/i.test(s)),
  plan.outOfScope.join(', '),
);
check(
  'outOfScope or skip-plan fence',
  plan.outOfScope.some((s) => /plan/i.test(s)) || plan.hardGo,
  plan.outOfScope.join(', '),
);

// ── Done checks ─────────────────────────────────────────
check('verifyChecks include brand viewport', plan.verifyChecks.some((c) => /brand/i.test(c)));
check('verifyChecks include grid of 4', plan.verifyChecks.some((c) => /4/.test(c)), plan.verifyChecks.join(' | '));
check('verifyChecks include palette', plan.verifyChecks.some((c) => /palette|paper|brass|navy/i.test(c)));

// ── Assumptions ─────────────────────────────────────────
check('assumptions non-empty', plan.assumptions.length >= 1, String(plan.assumptions.length));
check(
  'assumption: hard-go / single page / editorial',
  plan.assumptions.some((a) => /hard-go|single|editorial|cardinality/i.test(a)),
  plan.assumptions.join(' | '),
);

// ── Invent prompt receives understand plan ──────────────
const inventAsk = formatGenericInventOwnLookPrompt({
  brand: 'Paper Shelf',
  brief: PAPER_SHELF_BRIEF,
  salt: 'smoke1',
  goal: plan.goal,
  audience: plan.audience,
  primaryAction: plan.primaryAction,
  assumptions: plan.assumptions,
  mustHave: plan.mustHave,
  outOfScope: plan.outOfScope,
  verifyChecks: plan.verifyChecks,
});
check('invent ask has GOAL', /GOAL:/i.test(inventAsk));
check('invent ask has MUST-HAVES', /MUST-HAVES/i.test(inventAsk));
check('invent ask has OUT OF SCOPE', /OUT OF SCOPE/i.test(inventAsk));
check('invent ask has DONE CHECKS', /DONE CHECKS/i.test(inventAsk));
check('invent ask has PRIMARY ACTION', /PRIMARY ACTION:/i.test(inventAsk));
check('invent ask mentions paper or brass', /paper|brass|navy/i.test(inventAsk));
check('invent ask bans todo twin language', /todo/i.test(inventAsk));

// ── Negative: vague brief still yields something usable ─
const vague = understandCreateBrief({ brief: 'Build me a website called Glow', brand: 'Glow' });
check('vague brief still has goal', Boolean(vague.goal));
check('vague brief hardGo when Build', vague.hardGo === true);
check('vague brief does not invent paper must-haves', !vague.mustHave.some((m) => /paper|brass/i.test(m)));

// ── Negative: knife brief must not pick book shelf must-haves ─
const knife = understandCreateBrief({
  brief: 'Build Gyuto Forge knife shop with cart and steel blades on disk now',
  brand: 'Gyuto Forge',
});
check('knife brief not editorial reading shelf', !knife.mustHave.some((m) => /reading shelf|book grid/i.test(m)), knife.mustHave.join(' | '));
check('knife brief has cart must-have', knife.mustHave.some((m) => /cart|purchase/i.test(m)), knife.mustHave.join(' | '));
check('knife genre not editorial', knife.genre !== 'editorial', knife.genre);

// ── Utility / cafe peers ────────────────────────────────
const todo = understandCreateBrief({
  brief: 'Build a todo list app called ClearList with add complete delete and localStorage',
  brand: 'ClearList',
});
check('todo productKind utility', todo.productKind === 'utility', todo.productKind);
check('todo outOfScope or twinRisk', todo.twinRisk === true || todo.productKind === 'utility');
check('todo no paper palette must-haves', !todo.mustHave.some((m) => /paper|brass|book grid/i.test(m)), todo.mustHave.join(' | '));

const cafe = understandCreateBrief({
  brief: 'Build Harbor Roast cafe site with menu and hours — not a todo app',
  brand: 'Harbor Roast',
});
check('cafe outOfScope todo', cafe.outOfScope.some((s) => /todo/i.test(s)), cafe.outOfScope.join(', '));
check('cafe genre cafe', cafe.genre === 'cafe', cafe.genre);

// ── Plan JSON shape (persisted to .__novaCreateBriefPlan) ─
const keys = ['goal', 'audience', 'primaryAction', 'mustHave', 'outOfScope', 'verifyChecks', 'assumptions', 'filePlan', 'hardGo'];
for (const k of keys) {
  check(`plan has ${k}`, k in plan && plan[k] != null, typeof plan[k]);
}

if (failed) {
  console.error(`\nStep 1 understand: ${failed} check(s) failed — stay on Parse intent`);
  process.exit(1);
}
console.log('\nStep 1 understand: all checks passed — peer bar met for Parse intent');
