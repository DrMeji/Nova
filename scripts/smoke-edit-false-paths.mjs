/**
 * Regression: edit false paths from the Aurel piecewise screenshots.
 * npx tsx --tsconfig tsconfig.app.json scripts/smoke-edit-false-paths.mjs
 */
import { looksLikeClinicFixAsk, extractClinicFixIds } from '../src/lib/workQueue.ts';
import { normalizeMessyUiEditAsk } from '../src/lib/editAskResolve.ts';
import { verifyAsk } from '../src/lib/verifyAsk.ts';
import { looksLikePromptInstructionLeak, healBasicUiLayout } from '../src/lib/webProjectCanon.ts';
import { isCreateRefusedAsk, parseNewProjectIntent } from '../src/lib/createProjectIntent.ts';
import { classifyTurn } from '../src/lib/classifyTurn.ts';
import { parseNamedUiIcons } from '../src/lib/brandAssets.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const landingAsk = [
  '<!-- nova-kind: edit -->',
  'Rewrite the entire src/App.tsx file on the bound Aurel project now.',
  'nav with brand text Aurel. and three buttons Discover, Sign in, Help;',
  'hero with p.eyebrow INTRODUCING AUREL ONE, h1 Air, distilled., button Meet Aurel One.',
  'Update App.css with Georgia, Times New Roman, serif on h1.',
].join(' ');

// 1) Debug clinic must NOT fire on “AUREL ONE” / rewrite asks
check('clinicFixAsk(landing rewrite) false', looksLikeClinicFixAsk(landingAsk) === false);
check('clinicFixAsk(fix DBG-001) true', looksLikeClinicFixAsk('fix DBG-001') === true);
check('extractClinicFixIds(AUREL ONE rewrite) empty', extractClinicFixIds(landingAsk).length === 0);
check('clinicFixAsk(fix low issues) true', looksLikeClinicFixAsk('fix the low issues') === true);

// 2) Messy normalize must NOT collapse rewrite → “Make the name look more serif”
const normalized = normalizeMessyUiEditAsk(landingAsk);
check(
  'normalize keeps rewrite (not serif collapse)',
  /rewrite/i.test(normalized) && !/^Make the name look more serif/i.test(normalized),
  `got: ${normalized.slice(0, 80)}`,
);

// 3) Already-applied must not false-pass via sans-serif
const filesSans = {
  'src/App.tsx': 'export default function App(){return <h1 className="title">Aurel</h1>}',
  'src/App.css': '.title{font-family:system-ui,sans-serif} body{background:#000}',
};
const serifAsk = 'Make the headline use a serif font';
const v = verifyAsk(serifAsk, filesSans);
check('verifyAsk(serif) fails on sans-serif only', v.ok === false && v.missing.includes('serif font'), JSON.stringify(v));

const filesSerif = {
  ...filesSans,
  'src/App.css': '.title{font-family:Georgia,"Times New Roman",serif} body{background:#000}',
};
const v2 = verifyAsk(serifAsk, filesSerif);
check('verifyAsk(serif) passes with Georgia', v2.ok === true, JSON.stringify(v2));

// 4) Instruction leak detector
check('leak: short support line', looksLikePromptInstructionLeak(', one short support line, and a sage pill CTA') === true);
check('leak: real headline false', looksLikePromptInstructionLeak('Air, distilled.') === false);

// 5) Heal strips leak titles
const healed = healBasicUiLayout({
  'src/App.tsx': `export default function App(){return <div className="app"><h1 className="title">, one short support line, and a sage pill CTA</h1></div>}`,
  'src/App.css': '.app{background:#000}',
}, { projectName: 'Aurel' });
const appHealed = healed.find((e) => /App\.tsx/.test(e.path))?.content || '';
check('heal replaces leak title', /Aurel/.test(appHealed) && !/short support line/i.test(appHealed), appHealed.slice(0, 120));

// 6) Create refuse / icon false positives
const createAsk = 'Build Aurel on disk now. Never ship a todo list. Skip Plan. Build the Vite React project on disk immediately.';
check('create not refused', isCreateRefusedAsk(createAsk) === false);
check('create classifies create', classifyTurn(createAsk).kind === 'create');
const orbAsk = 'Update Aurel. Keep dark background. Add soft sage orbs. Quiet-luxury atmosphere for a high-end scent brand.';
check('parseNamedUiIcons(orbs) empty', parseNamedUiIcons(orbAsk).length === 0, JSON.stringify(parseNamedUiIcons(orbAsk)));
check('parseNewProjectIntent(createAsk)', Boolean(parseNewProjectIntent(createAsk)));

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll edit false-path checks passed.');
