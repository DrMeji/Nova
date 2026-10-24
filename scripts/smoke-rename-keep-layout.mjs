/**
 * Ladder bugs: rename must not move layout; "put it back in the middle" is not undo;
 * "it ned to say pizza" must be a fast rename.
 * Run: npx tsx --tsconfig tsconfig.app.json scripts/smoke-rename-keep-layout.mjs
 */
import assert from 'node:assert/strict';
import {
  normalizeMessyUiEditAsk,
  looksLikeRevertEditAsk,
} from '@/lib/editAskResolve';
import { extractNameRenameTarget } from '@/lib/brandLabel';
import { reactSurgicalMicroAskEdits } from '@/lib/webProjectCanon';

const centeredCss = `
.app{min-height:100vh;margin:0;background:#fff;display:flex;align-items:center;justify-content:center}
.center-word{margin:0;color:#1a1a1a;font-size:2rem;position:relative}
`;

const files = {
  'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="app">
      <h1 className="center-word">pezza</h1>
    </div>
  );
}
`,
  'src/App.css': centeredCss,
};

// 1) Typo → rename
const typo = normalizeMessyUiEditAsk('it ned to say pizza');
assert.match(typo, /Change the name to pizza/i, `typo normalize → ${typo}`);
assert.equal(extractNameRenameTarget('it ned to say pizza'), 'pizza');

// 2) put it back in the middle ≠ undo
assert.equal(looksLikeRevertEditAsk('put it back in the middle'), false);
assert.equal(looksLikeRevertEditAsk('put it back'), true);
const mid = normalizeMessyUiEditAsk('put it back in the middle');
assert.match(mid, /Move the name to the center/i, `middle normalize → ${mid}`);

// 3) Rename keeps flex-center (no absolute top-right)
const renamed = reactSurgicalMicroAskEdits(files, 'change the name to pizza');
const css = renamed.find((e) => /App\.css$/i.test(e.path))?.content || files['src/App.css'];
const app = renamed.find((e) => /App\.jsx$/i.test(e.path))?.content || '';
assert.match(app, />pizza</i, 'App shows pizza');
assert.doesNotMatch(app, /pezza/i, 'App dropped pezza');
assert.doesNotMatch(css, /position\s*:\s*absolute/i, 'rename must not absolute-pin the word');
assert.match(css, /justify-content\s*:\s*center/i, 'rename keeps centered flex');

// 4) Move to center after a corner pin — keep pizza text
const cornered = {
  ...files,
  'src/App.jsx': app.includes('pizza')
    ? app
    : files['src/App.jsx'].replace('pezza', 'pizza'),
  'src/App.css': `
.app{min-height:100vh;margin:0;background:#fff;position:relative}
.center-word{margin:0;color:#1a1a1a;position:absolute;top:1.25rem;right:1.25rem}
`,
};
const centered = reactSurgicalMicroAskEdits(cornered, 'put it back in the middle');
const css2 = centered.find((e) => /App\.css$/i.test(e.path))?.content || '';
const app2 = centered.find((e) => /App\.jsx$/i.test(e.path))?.content || cornered['src/App.jsx'];
assert.match(app2, />pizza</i, 'recenter keeps pizza');
assert.doesNotMatch(app2, /pezza/i, 'recenter must not restore pezza');
assert.match(css2, /justify-content\s*:\s*center/i, 'recenter uses flex center');

console.log('OK smoke-rename-keep-layout');
