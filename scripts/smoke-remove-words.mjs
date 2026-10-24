/**
 * Guard: remove Welcome / dual place on blank cream.
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/smoke-remove-words.mjs
 */
import assert from 'node:assert/strict';
import { finalizeWebEdits } from '@/lib/webProjectCanon';
import { planUiAsk, verifyUiAskPlan } from '@/lib/uiAskPlan';
import { looksLikeCodeEditAsk } from '@/lib/chatAgentTurn';
import { classifyTurn } from '@/lib/classifyTurn';

const blank = {
  'src/App.jsx': `import './App.css'\nexport default function App(){return <div className="app" aria-label="Blank page"/>}\n`,
  'src/App.css': '.app{min-height:100dvh;background:#ffffff}\n',
  'src/index.css': 'html,body,#root{margin:0;background:#ffffff}\n',
};

// Dual
{
  const ask = 'Put Hi on the left and Bye on the right.';
  const plan = planUiAsk(ask);
  assert.equal(plan.ops[0]?.kind, 'dual-place');
  const edits = finalizeWebEdits(blank, ask, [], { projectName: 'App' });
  const files = { ...blank };
  for (const e of edits) files[e.path] = e.content;
  assert.equal(verifyUiAskPlan(plan, files).ok, true, 'dual verify');
  assert.match(Object.values(files).join('\n'), />Hi</);
  assert.match(Object.values(files).join('\n'), />Bye</);

  // Remove
  const rm = 'Okay, can you remove what you just added? The Hi and Bye words.';
  assert.equal(looksLikeCodeEditAsk('Can you remove the Welcome to my app text?'), true);
  const rmWelcome = 'Can you remove Welcome to my app?';
  const withWelcome = {
    ...files,
    'src/App.jsx': `import './App.css'\nexport default function App(){return (<div className="app"><h1 className="center-word">Welcome to my app</h1></div>)}\n`,
  };
  const planRm = planUiAsk(rmWelcome);
  assert.ok(planRm.ops.some((o) => o.kind === 'remove-label'), JSON.stringify(planRm.ops));
  const rmEdits = finalizeWebEdits(withWelcome, 'Remove the words Welcome to my app from the page.', [], { projectName: 'App' });
  const after = { ...withWelcome };
  for (const e of rmEdits) after[e.path] = e.content;
  assert.ok(!/Welcome to my app/i.test(after['src/App.jsx'] || ''), after['src/App.jsx']);
  assert.equal(classifyTurn(rmWelcome, { workspaceBound: true, files: withWelcome }).kind, 'edit');
  void rm;
}

console.log('OK smoke-remove-words');
