/**
 * Unit smoke: Single Brain Create + originality (no Multimodal relay / no template floors).
 * npx tsx --tsconfig tsconfig.app.json scripts/smoke-single-brain-create.mjs
 */
import {
  formatOriginalCraftRules,
  lintOriginalCreateQuality,
  QUALITY_FLOOR,
} from '../src/lib/createDesignSystem.ts';
import { premiumWebCraftRules } from '../src/lib/createEnsemble.ts';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

check('QUALITY_FLOOR present', QUALITY_FLOOR.length >= 4);

const rules = formatOriginalCraftRules({
  brief: 'Build a professional vacuum website for ApexClean',
  productName: 'ApexClean',
  freshnessKey: 'test-salt-abc',
});
const rulesText = rules.join('\n');
// Thin create (default): short Temp-Nova craft prompt.
check('thin craft rules present', /THIN CREATE|@@@FILE/i.test(rulesText));
check('thin craft mentions product', /ApexClean|vacuum/i.test(rulesText));
check('thin craft invents from ask', /unique working UI|invent THIS ask/i.test(rulesText));
check('original rules do not say fill slots only', !/fill slots only|SLOT FILL ONLY/i.test(rulesText));

const premium = premiumWebCraftRules('vacuum website', null).join('\n');
check('premiumWebCraftRules is originality-based', /THIN CREATE|@@@FILE|ONE-OF-ONE|original/i.test(premium));
check('premiumWebCraftRules no fill-slots law', !/Fill CopyPack slots only/i.test(premium));

const thin = lintOriginalCreateQuality({
  'src/App.jsx': 'export default function App(){return <div>Hi</div>}',
  'src/App.css': 'body{background:#fff}',
}, { brief: 'vacuum website', productName: 'ApexClean' });
check('thin App fails originality', !thin.ok, thin.reasons.join('; '));

const clone = lintOriginalCreateQuality({
  'src/App.jsx': `${'x'.repeat(500)}\nA singular ritual for how you actually live\n`,
  'src/App.css': `${'y'.repeat(500)}\n@font-face{font-family:Test}\nradial-gradient(#000,#111)\n@keyframes fade{from{opacity:0}}`,
}, { brief: 'vacuum website' });
check('stock ritual clone fails', !clone.ok && clone.reasons.some((r) => /clone|Stock/i.test(r)), clone.reasons.join('; '));

const prefsSrc = readFileSync(join(root, 'src/lib/localPrefs.ts'), 'utf8');
check('prefs default multiModelCreate false', /multiModelCreate:\s*false/.test(prefsSrc));
check('prefs v12 migrate present', /prefsVersion \|\| 0\) < 12/.test(prefsSrc) || /< 12\)/.test(prefsSrc));
check('agentLoopOnEdit default false', /agentLoopOnEdit:\s*false/.test(prefsSrc));

const plusSrc = readFileSync(join(root, 'src/components/ComposerPlusMenu.tsx'), 'utf8');
check('ComposerPlusMenu has no Plan mode item', !/label:\s*'Plan'/.test(plusSrc));
check('ComposerPlusMenu has no Multi-agent item', !/label:\s*'Multi-agent'/.test(plusSrc));
check('ComposerPlusMenu has no Agent item', !/\{ id: 'agent', label: 'Agent' \}/.test(plusSrc));
check('ComposerPlusMenu shows Debug (parked)', /label:\s*'Debug'/.test(plusSrc));
check('Debug parked via isDebugComposerParked', /isDebugComposerParked/.test(plusSrc));
const parkSrc = readFileSync(join(root, 'src/lib/featurePark.ts'), 'utf8');
check('isDebugComposerParked defaults true', /function isDebugComposerParked[\s\S]*?return true/.test(parkSrc));

const createSrc = readFileSync(join(root, 'src/lib/chatTurnHandlers/create.ts'), 'utf8');
check('create has no allowRelay multi-hop', !/allowRelay\s*=\s*getLocalPrefs\(\)\.multiModelCreate/.test(createSrc));
check('create skips Design Spine shell pre-write', /Bare Vite wiring only/.test(createSrc));
check('create uses lintOriginalCreateQuality', /lintOriginalCreateQuality/.test(createSrc));
check('create does not call healDesignShell', !/healDesignShell\(/.test(createSrc));

const qualitySrc = readFileSync(join(root, 'src/lib/createBuildQuality.ts'), 'utf8');
check('createBuildQuality never restore-design-shell', !/restore-design-shell/.test(qualitySrc));
check('createBuildQuality never healDesignShell(', !/healDesignShell\(/.test(qualitySrc));
check('Ready uses lintOriginalCreateQuality', /lintOriginalCreateQuality/.test(qualitySrc));

const identitySrc = readFileSync(join(root, 'src/lib/createIdentity.ts'), 'utf8');
check('craft prompts have no SLOT FILL law', !/DESIGN SPINE SLOT FILL|Fill copy slots/i.test(identitySrc));
check('craft prompts say original one-of-one', /ORIGINAL ONE-OF-ONE/i.test(identitySrc));

const settingsSrc = readFileSync(join(root, 'src/components/SettingsPrivacy.tsx'), 'utf8');
check('Settings has no Create relay toggle', !/Create relay \(Plan/.test(settingsSrc));
check('Settings has no Create tool loop toggle', !/Create with Nova tool loop/.test(settingsSrc));

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll single-brain create checks passed.');
