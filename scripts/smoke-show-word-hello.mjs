/**
 * Guard: "Show the word Hello on the screen" must paint Hello — not "Hello on the screen".
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/smoke-show-word-hello.mjs
 */
import assert from 'node:assert/strict';
import { extractShowWordLabel } from '@/lib/brandLabel';
import { looksLikeFunHangoutAsk } from '@/lib/plainChatAsk';
import { resolveAnswerContract } from '@/lib/answerContract';
import { reactSurgicalMicroAskEdits, looksLikePromptInstructionLeak } from '@/lib/webProjectCanon';

const ask = 'Show the word Hello on the screen.';
const label = extractShowWordLabel(ask);
assert.equal(label, 'Hello', `extractShowWordLabel → ${JSON.stringify(label)}`);
assert.equal(looksLikePromptInstructionLeak('Hello on the screen'), true);
assert.equal(looksLikePromptInstructionLeak('Hello'), false);

const files = {
  'src/App.jsx': `import './App.css';

export default function App() {
  return (
    <div className="app" aria-label="Blank page" />
  );
}
`,
  'src/App.css': '.app{min-height:100vh;background:#fff;margin:0}',
};

const edits = reactSurgicalMicroAskEdits(files, ask);
const app = edits.find((e) => /App\.(jsx|tsx)$/i.test(e.path))?.content || '';
assert.match(app, />Hello</, 'App should contain Hello');
assert.doesNotMatch(app, /Hello on the/i, 'App must not contain instruction residue');

const funAsk = "lets do some fun stuff, I want to see what you're capable of";
assert.equal(looksLikeFunHangoutAsk(funAsk), true, 'fun hangout ask should match');
const funContract = resolveAnswerContract({ message: funAsk, hasBoundFiles: false });
assert.equal(funContract.job, 'deterministic', 'fun hangout must be deterministic (instant NOVA)');
assert.equal(funContract.reason, 'fun-hangout', 'fun hangout contract reason');

console.log('OK smoke-show-word-hello');
