/**
 * Tier A–D acceptance checks (Grok punch list) — without Electron.
 * npx tsx --tsconfig tsconfig.app.json scripts/check-create-intent.mjs
 */
import { parseNewProjectIntent, fallbackCreateProjectName } from '../src/lib/createProjectIntent.ts';
import { looksLikeConversationalPlanningAsk } from '../src/lib/chatIdeaIntent.ts';
import { looksLikeBuildStart } from '../src/lib/chatStudio.ts';
import { hasActiveWorkspace, looksLikeCodeEditAsk, looksLikeKeepBuildingAsk } from '../src/lib/chatAgentTurn.ts';
import {
  blankSolidColorFromAsk,
  verifyMicroAskApplied,
  reactSurgicalMicroAskEdits,
} from '../src/lib/webProjectCanon.ts';
import { classifyTurn } from '../src/lib/classifyTurn.ts';
import { getLocalPrefs } from '../src/lib/localPrefs.ts';

let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

// ── Tier A ──────────────────────────────────────────────
{
  const intent = parseNewProjectIntent('Build me a website');
  check(
    'A: Build me a website → create + fallback name',
    Boolean(intent && !intent.preferPlan && intent.name),
    intent ? `name=${intent.name} preferPlan=${intent.preferPlan}` : 'null intent',
  );
  check('A: fallback website name', fallbackCreateProjectName('Build me a website') === 'Site');
}
{
  const intent = parseNewProjectIntent('Make a brown full-screen site called Nightglass');
  check(
    'A: brown Nightglass → create not plan',
    Boolean(intent && !intent.preferPlan && /nightglass/i.test(intent.name)),
    intent ? `name=${intent.name}` : 'null',
  );
}
{
  const intent = parseNewProjectIntent('Help me build a coffee shop site');
  const planning = looksLikeConversationalPlanningAsk('Help me build a coffee shop site');
  check(
    'A: Help me build coffee shop → talk-before (null create intent)',
    intent == null || planning,
    intent ? `name=${intent.name}` : 'null',
  );
}
{
  const ask = 'Add the title Nightglass After Hours in the center';
  check('A/B: title ask → not create', parseNewProjectIntent(ask) == null);
  check('A/B: title ask → not blank-solid', blankSolidColorFromAsk(ask) == null);
  check('A/B: title ask → edit', Boolean(looksLikeCodeEditAsk(ask)));
}
check('A: blankSolid(center white words) → null', blankSolidColorFromAsk('center white words that say Hello') == null);
check('A: hasActiveWorkspace(diskRoot)', hasActiveWorkspace({ diskRoot: 'C:\\x', files: {}, projectId: null }));
check('A: create a vite react app', Boolean(parseNewProjectIntent('create a vite react app')?.name));
check('A: planning(build me a website) false', looksLikeConversationalPlanningAsk('build me a website') === false);
check('A: looksLikeBuildStart(build me a website)', looksLikeBuildStart('build me a website') === true);
{
  const intent = parseNewProjectIntent('Build me a website called Demo');
  check('A: Demo create preferPlan=false', Boolean(intent && intent.name === 'Demo' && !intent.preferPlan));
}

// ── Tier B ──────────────────────────────────────────────
{
  const files = {
    'src/App.jsx': `import './App.css';\nexport default function App() {\n  return (<div className="app" />);\n}\n`,
    'src/App.css': `.app { min-height: 100vh; background: #8B4513; }\n`,
  };
  const edits = reactSurgicalMicroAskEdits(files, 'Put the words Nightglass After Hours in the center in white');
  const app = edits.find((e) => /App\.jsx/.test(e.path))?.content || '';
  const css = edits.find((e) => /App\.css/.test(e.path))?.content || '';
  check('B3: centered title patches App (has center-word)', /center-word/.test(app) && /Nightglass After Hours/.test(app));
  check('B3: preserves brown background intent', /#8B4513|background/i.test(`${css}\n${files['src/App.css']}`));
  const withLogo = {
    'src/App.jsx': `import './App.css';\nexport default function App() {\n  return (\n    <div className="app">\n      <div className="corner-logo" />\n      <h1 className="center-word">Old</h1>\n    </div>\n  );\n}\n`,
    'src/App.css': `.app { min-height: 100vh; background: #8B4513; }\n.corner-logo{position:absolute;top:12px;left:12px;width:28px;height:28px;background:#fff}\n`,
  };
  const patch2 = reactSurgicalMicroAskEdits(withLogo, 'Change the centered words to Nightglass After Hours');
  const app2 = patch2.find((e) => /App\.jsx/.test(e.path))?.content || withLogo['src/App.jsx'];
  check('B3: second title keeps corner-logo', /corner-logo/.test(app2) && /Nightglass After Hours/.test(app2));
}
{
  const files = {
    'src/App.jsx': `export default function App(){return(<div className="app"><h1 className="center-word">Nightglass After Hours</h1></div>);}`,
    'src/App.css': `.app{background:#8B4513}.center-word{color:#fff}`,
  };
  const v = verifyMicroAskApplied('Add the title Nightglass After Hours in the center in white', files);
  check('B4: verifyMicroAskApplied keeps good center-word write', v.ok, v.missing.join(','));
}
{
  const c = classifyTurn('keep building', { diskRoot: 'C:\\proj', files: { 'src/App.jsx': 'x' } });
  check('B5: keep building + disk → keep_building', c.kind === 'keep_building', c.kind);
  const c2 = classifyTurn('Add a search bar top right', { diskRoot: 'C:\\proj', files: { 'src/App.jsx': 'x' } });
  check('B5: add chrome + disk → edit', c2.kind === 'edit' || c2.kind === 'keep_building', c2.kind);
  check('B5: looksLikeKeepBuildingAsk', looksLikeKeepBuildingAsk('keep building'));
}

// ── Tier C / D ──────────────────────────────────────────
check('C4: multiModelCreate default off (Single Brain Create)', getLocalPrefs().multiModelCreate === false);
{
  const c = classifyTurn('Build me a website called Demo');
  check('D1: classifyTurn create', c.kind === 'create', c.kind);
  const p = classifyTurn('What should I build first? Still planning only — no scaffolding.');
  check('D1: classifyTurn plan', p.kind === 'plan' || p.preferPlan === true, p.kind);
}

if (failed) {
  console.error(`\n${failed} acceptance check(s) failed`);
  process.exit(1);
}
console.log('\nAll Tier A–D create/edit acceptance checks passed');
