/**
 * Guard: "Create a blank lightred page" paints light red — not white.
 * Follow-up "I asked for light red" becomes a background edit, not a tutorial.
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/smoke-blank-lightred.mjs
 */
import assert from 'node:assert/strict';
import { blankSolidColorFromAsk, finalizeWebEdits, viteSolidShellEdits } from '@/lib/webProjectCanon';
import {
  looksLikeConversationalEditShorthand,
  normalizeMessyUiEditAsk,
  resolveConversationalEditAsk,
} from '@/lib/editAskResolve';
import { classifyTurn } from '@/lib/classifyTurn';
import { planUiAsk, verifyUiAskPlan } from '@/lib/uiAskPlan';

const createAsk = 'Create a blank lightred page with nothing on it.';
const hex = blankSolidColorFromAsk(createAsk);
assert.equal(hex, '#fca5a5', `blankSolid → ${hex}`);

const shell = viteSolidShellEdits(hex);
const css = shell.find((e) => /App\.css$/i.test(e.path))?.content || '';
assert.match(css, /#fca5a5/i, 'shell css must be light red');

const spaced = blankSolidColorFromAsk('Create a blank light red page with nothing on it.');
assert.equal(spaced, '#fca5a5', `spaced light red → ${spaced}`);

const whiteOnly = blankSolidColorFromAsk('Create a blank white page with nothing on it.');
assert.equal(whiteOnly, '#ffffff');

// Follow-up correction → surgical bg ask
const fixed = normalizeMessyUiEditAsk('I asked for light red');
assert.match(fixed, /Change the background color to light red/i, `normalize → ${fixed}`);
assert.equal(looksLikeConversationalEditShorthand('I asked for light red'), true);

const resolved = resolveConversationalEditAsk({
  message: 'I asked for light red',
  workspaceBound: true,
  messages: [{ role: 'user', content: createAsk }],
});
assert.match(resolved.content, /Change the background color to light red/i, `resolve → ${resolved.content}`);

const classified = classifyTurn('I asked for light red', {
  workspaceBound: true,
  files: {
    'src/App.jsx': `import './App.css'\nexport default function App(){return <div className="app"/>}\n`,
    'src/App.css': '.app{min-height:100vh;background:#ffffff}\n',
  },
});
assert.equal(classified.kind, 'edit', `classify → ${classified.kind} (${classified.reason})`);

// Apply follow-up on white blank
const whiteFiles = {
  'src/App.jsx': `import './App.css'\nexport default function App(){return <div className="app" aria-label="Blank page"/>}\n`,
  'src/App.css': '.app{min-height:100vh;background:#ffffff}\n',
  'src/index.css': 'html,body,#root{margin:0}\n',
};
const edits = finalizeWebEdits(whiteFiles, resolved.content, [], { projectName: 'Site' });
assert.ok(edits.length, 'expected bg edits');
const next = { ...whiteFiles };
for (const e of edits) next[e.path] = e.content;
const plan = planUiAsk(resolved.content);
const check = verifyUiAskPlan(plan, next);
assert.equal(check.ok, true, `verify: ${check.missing.join('; ')}`);
const blob = Object.values(next).join('\n');
assert.match(blob, /#fca5a5/i);
assert.ok(!/About Us/i.test(blob));

console.log('OK smoke-blank-lightred');
