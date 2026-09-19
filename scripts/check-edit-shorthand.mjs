/**
 * Conversational edit shorthand: try orange / put it back / creamy white.
 */
import assert from 'node:assert/strict';
import {
  resolveConversationalEditAsk,
  rememberLastEditTopic,
  clearLastEditTopic,
  looksLikeColorTryAsk,
  looksLikeRevertEditAsk,
  looksLikeConversationalEditShorthand,
} from '../src/lib/editAskResolve.ts';
import { classifyTurn } from '../src/lib/classifyTurn.ts';
import { finalizeWebEdits } from '../src/lib/webProjectCanon.ts';

const chatId = 'test-shorthand-chat';
clearLastEditTopic(chatId);

assert.equal(looksLikeColorTryAsk('try orange color'), true);
assert.equal(looksLikeColorTryAsk('try orange'), true);
assert.equal(looksLikeColorTryAsk('creamy white background'), true);
assert.equal(looksLikeRevertEditAsk('put it back'), true);
assert.equal(looksLikeRevertEditAsk('I like the old one better'), true);
assert.equal(looksLikeConversationalEditShorthand('try 50 millimeter'), true);

{
  const r = resolveConversationalEditAsk({
    message: 'try orange color',
    chatId,
    workspaceBound: true,
    messages: [
      { role: 'user', content: 'Change the background color to pink.' },
      { role: 'assistant', content: 'Done.' },
    ],
  });
  assert.equal(r.expanded, true);
  assert.match(r.content, /background color to orange/i);
}

{
  const r = resolveConversationalEditAsk({
    message: 'try creamy white',
    chatId,
    workspaceBound: true,
  });
  assert.equal(r.expanded, true);
  assert.match(r.content, /background color to cream/i);
}

rememberLastEditTopic({
  chatId,
  kind: 'background',
  ask: 'Change the background color to orange.',
  value: 'orange',
  priorValue: 'pink',
  at: Date.now(),
});

{
  const r = resolveConversationalEditAsk({
    message: 'put it back',
    chatId,
    workspaceBound: true,
  });
  assert.equal(r.expanded, true);
  assert.match(r.content, /background color to pink/i);
}

{
  const r = classifyTurn('try orange color', {
    diskRoot: 'C:\\proj',
    files: { 'src/App.css': '.app{background:#fff}' },
  });
  assert.equal(r.kind, 'edit', r.reason);
}

{
  const files = {
    'src/App.jsx': `import './App.css';\nexport default function App(){return <div className="app" />}\n`,
    'src/App.css': `.app { min-height: 100vh; background: #ffffff; }\n`,
  };
  const expanded = resolveConversationalEditAsk({
    message: 'try orange color',
    chatId,
    workspaceBound: true,
  }).content;
  const next = { ...files };
  for (const e of finalizeWebEdits(files, expanded, [])) next[e.path] = e.content;
  assert.match(next['src/App.css'], /background:\s*#f97316/i);
}

clearLastEditTopic(chatId);
console.log('PASS  conversational edit shorthand');
