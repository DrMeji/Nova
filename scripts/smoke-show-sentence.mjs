/**
 * Guard: "Show the sentence Welcome to my app on the screen" → surgical center-word only.
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/smoke-show-sentence.mjs
 */
import assert from 'node:assert/strict';
import { extractShowWordLabel } from '@/lib/brandLabel';
import { normalizeMessyUiEditAsk } from '@/lib/editAskResolve';
import { isWebMicroAsk, reactSurgicalMicroAskEdits, blankSolidColorFromAsk } from '@/lib/webProjectCanon';

const ask = 'Show the sentence Welcome to my app on the screen.';
const normalized = normalizeMessyUiEditAsk(ask);
assert.match(normalized, /Put the words Welcome to my app in the center/i, `normalize → ${normalized}`);
assert.equal(extractShowWordLabel(ask), 'Welcome to my app');
assert.equal(extractShowWordLabel(normalized), 'Welcome to my app');
assert.equal(isWebMicroAsk(ask), true);

const sky = blankSolidColorFromAsk('Create a blank sky blue page with nothing on it.');
assert.equal(sky, '#87CEEB', `sky blue blank → ${sky}`);

const files = {
  'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="app" aria-label="Blank page" />
  );
}
`,
  'src/App.css': 'html, body, #root { margin:0; background:#87CEEB; }\n.app{min-height:100dvh;margin:0;background:#87CEEB;}\n',
  'src/index.css': 'html, body, #root { margin:0; background:#87CEEB; }\n',
};

const edits = reactSurgicalMicroAskEdits(files, ask);
const app = edits.find((e) => /App\.(jsx|tsx)$/i.test(e.path))?.content || '';
assert.match(app, />Welcome to my app</, 'must paint the sentence');
assert.doesNotMatch(app, /About Us|Features|Feature 1|©/i, 'must not invent landing chrome');

// Polluted page from a prior agent overbuild — still collapse to the sentence only.
const polluted = {
  ...files,
  'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="app">
      <header><h1>Welcome to my app</h1></header>
      <section><h2>About Us</h2><p>Sample</p></section>
      <footer>© 2023</footer>
    </div>
  );
}
`,
};
const clean = reactSurgicalMicroAskEdits(polluted, ask);
const cleanApp = clean.find((e) => /App\.(jsx|tsx)$/i.test(e.path))?.content || '';
assert.match(cleanApp, />Welcome to my app</);
assert.doesNotMatch(cleanApp, /About Us|Features|© 2023/i, 'polluted page must be wiped to sentence-only');

console.log('OK smoke-show-sentence');
