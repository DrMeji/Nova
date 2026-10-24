/**
 * Syntax-invalid create output must be rejected before it can enter project state.
 * Run with: npx tsx --tsconfig tsconfig.app.json scripts/smoke-create-file-acceptance.mjs
 */
import assert from 'node:assert/strict';
import ts from 'typescript';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    get length() { return store.size; },
  };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const { applyChatReplyEdits } = await import('../src/lib/chatAgentApply.ts');

const replayBrief = 'Build a polished neighborhood plant shop website with a featured collection, care tips, store hours, and location.';
const baseFiles = {
  'src/App.jsx': `import NavHeaderSection from './sections/NavHeaderSection.jsx';
import './App.css';
export default function App() {
  return (
    <main className="app">
      <NavHeaderSection />
      <section><h1>Welcome to Moss &amp; Morning</h1><p>Find a plant for every corner.</p></section>
    </main>
  );
}
`,
  'src/App.css': '.app { min-height: 100vh; }\n',
  'src/sections/NavHeaderSection.jsx': `const COVER_HREFS = ["/heroes/moss-hero.svg","/heroes/moss-story.svg"];
export default function NavHeaderSection() {
  return (
    <nav className="nav-header">
      <img className="nav-logo" src="/logo.svg" alt="Moss" width="36" height="36" />
      <div className="nav-logo">Moss &amp; Morning</div>
      <ul className="nav-links">
        <li><a href="#collection">Collection</a></li>
        <li><a href="#care-tips">Care Tips</a></li>
        <li><a href="#store-hours">Store Hours</a></li>
        <li><a href="#location">Location</a></li>
      </ul>
    </nav>
  );
}
`,
};
const truncatedSection = `const COVER_HREFS = ["/heroes/moss-hero.svg","/heroes/moss-story.svg"];
export default function NavHeaderSection() {
  return (
    <nav className="nav-header">
      <img className="nav-logo" src="/logo.svg" alt="Moss" width="36" height="36" />
      <div className="nav-logo">Moss &amp; Morning</div>
      <ul className="nav-links">
        <li><a href="#collection">Collection</a></li>
        <li><a href="#care-tips">Care Tips</a></li>
        <li><a href="#store-hours">Store Hours</a></li>
        <li><a href="#location">Location</a></li>
      </ul>
    </nav>
  );
`;

const parseJsx = (source) => ts.createSourceFile(
  'NavHeaderSection.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX,
).parseDiagnostics;
assert.ok(parseJsx(truncatedSection).length, 'the saved Moss section must reproduce a JSX parser failure');
assert.equal(parseJsx(baseFiles['src/sections/NavHeaderSection.jsx']).length, 0, 'the repaired Moss section must parse');

const rejected = await applyChatReplyEdits({
  reply: `@@@FILE src/sections/NavHeaderSection.jsx\n${truncatedSection}`,
  projectId: null,
  projectName: 'Moss & Morning',
  files: baseFiles,
  userMessage: replayBrief,
  dryRun: true,
});
assert.equal(rejected.ok, false, 'truncated section must fail acceptance');
assert.equal(rejected.syntaxFailed, true, 'failure must be identified as syntax failure');
assert.ok(rejected.syntaxReasons?.some((reason) => /unbalanced JSX braces/i.test(reason)));
assert.equal(
  rejected.files['src/sections/NavHeaderSection.jsx'],
  baseFiles['src/sections/NavHeaderSection.jsx'],
  'rejection must preserve the last known-good section',
);
assert.deepEqual(rejected.updated, [], 'rejected files must not be marked updated');

const accepted = await applyChatReplyEdits({
  reply: `@@@FILE src/sections/NavHeaderSection.jsx\n${baseFiles['src/sections/NavHeaderSection.jsx']}`,
  projectId: null,
  projectName: 'Moss & Morning',
  files: baseFiles,
  userMessage: replayBrief,
  dryRun: true,
});
assert.equal(accepted.ok, true, `complete section must pass acceptance: ${accepted.syntaxReasons?.join('; ') || 'no syntax reason returned'}`);
assert.equal(
  accepted.files['src/sections/NavHeaderSection.jsx']?.trimEnd(),
  baseFiles['src/sections/NavHeaderSection.jsx'].trimEnd(),
);

console.log('smoke-create-file-acceptance: ok');
