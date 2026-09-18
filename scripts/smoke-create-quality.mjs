import { prefersReactAppScaffold } from '../src/lib/webLandingFromBrief.ts';
import { detectProjectKind } from '../src/lib/projectKind.ts';
import {
  briefNeedsCreateUiPolish,
  briefLooksLikeChatApp,
  buildLastResortChatApp,
  ensureViteReactProjectFiles,
  isPreviewReady,
  stripModelProseFromSource,
} from '../src/lib/createBuildQuality.ts';
import { formatMultiModelAttribution } from '../src/lib/chatMultiModelBuild.ts';
import {
  codingFileEditTimeoutMs,
  looksLikeFullUiBuildCodingAsk,
} from '../src/lib/studioAnswerEngine.ts';
import { pickReadyCreatePolishCoder } from '../src/lib/enginePick.ts';

const brief = 'Create DualBrainCafe warm cafe landing page hero menu. Use src/App.jsx + App.css. Full desktop layout.';
console.log('prefersReact', prefersReactAppScaffold(brief));
console.log('kind', detectProjectKind(brief));
console.log('footer', formatMultiModelAttribution([]));
if (!briefNeedsCreateUiPolish(brief)) {
  console.error('FAIL: rich cafe landing brief should need create UI polish');
  process.exit(2);
}
if (briefNeedsCreateUiPolish('Build me a website')) {
  console.error('FAIL: bare build-me-a-website must stay scaffold-only');
  process.exit(2);
}
const keyboardBriefs = [
  'Logitech-style pulse-pro-keyboard hero nav footer premium gaming keyboard marketing landing',
  'Create a premium gaming keyboard product website like Logitech',
  'keyboard landing page',
  'pulse-pro-keyboard gaming site',
];
for (const kb of keyboardBriefs) {
  if (!briefNeedsCreateUiPolish(kb)) {
    console.error(`FAIL: keyboard/product brief should need UI polish: ${kb}`);
    process.exit(2);
  }
}
const discordBrief = 'ok lets build this out now — create a Discord-like chat web app called NovaCord with servers, channels, and a chat pane';
if (!briefNeedsCreateUiPolish(discordBrief)) {
  console.error('FAIL: Discord-like chat app brief must need UI polish');
  process.exit(2);
}
if (!briefLooksLikeChatApp(discordBrief)) {
  console.error('FAIL: Discord brief should look like chat app');
  process.exit(2);
}
{
  const shell = buildLastResortChatApp('NovaCord');
  const ready = isPreviewReady(
    {
      'package.json': JSON.stringify({ dependencies: { vite: '5.0.0', react: '18.0.0' } }),
      'index.html': '<!DOCTYPE html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
      'src/main.tsx': "import App from './App'\n",
      'src/App.tsx': shell.app,
      'src/App.css': shell.css,
    },
    { productName: 'NovaCord', brief: discordBrief, requireInteractive: true },
  );
  if (!ready.ok) {
    console.error('FAIL: reference chat shell must still be Preview-ready (helper only — create no longer auto-applies it)', ready.reasons);
    process.exit(2);
  }
  console.log('discordChatShellReady', true);
}
const phonesBrief = 'Build a premium headphones website like AirPods and Beats with search, prices, and purchase buttons';
if (!briefNeedsCreateUiPolish(phonesBrief)) {
  console.error('FAIL: headphones store brief must need UI polish');
  process.exit(2);
}
console.log('headphonesPolishGate', true);

const polishPrompt = [
  'Build the first real multi-section UI for this new project from the brief.',
  'Output ONLY @@@FILE blocks — no preface, no plan.',
  'Start with @@@FILE src/App.jsx, then @@@FILE src/App.css (and src/index.css if needed).',
  'Include hero, navigation, main sections, and footer with real product copy — not a filler/stub shell.',
].join('\n');
if (!looksLikeFullUiBuildCodingAsk(polishPrompt)) {
  console.error('FAIL: create polish prompt must classify as full UI build');
  process.exit(2);
}
if (codingFileEditTimeoutMs(polishPrompt) < 120_000) {
  console.error('FAIL: create polish must use build/code timeout (≥120s), not 45s micro');
  process.exit(2);
}
console.log('polishTimeoutMs', codingFileEditTimeoutMs(polishPrompt));

const modelsBoth = [
  { id: 'qwen25-coder-14b', status: 'ready' },
  { id: 'qwen25-coder-7b', status: 'ready' },
  { id: 'qwen25-coder-32b', status: 'ready' },
];
// Mid PC (cap 7B): snappy 7B polish — not stuck forcing 32B.
const picked7 = pickReadyCreatePolishCoder(modelsBoth, { ramGb: 16, maxParamsB: 7 });
if (picked7?.id !== 'qwen25-coder-7b') {
  console.error('FAIL: mid PC polish must pick 7B when capped at 7', picked7);
  process.exit(2);
}
// Strong PC (cap 32B): use largest ready coder for quality.
const pickedStrong = pickReadyCreatePolishCoder(modelsBoth, { ramGb: 64, maxParamsB: 32 });
if (pickedStrong?.id !== 'qwen25-coder-32b') {
  console.error('FAIL: strong PC polish must pick 32B when allowed', pickedStrong);
  process.exit(2);
}
const picked14 = pickReadyCreatePolishCoder(modelsBoth, {
  preferSelectedId: 'qwen25-coder-14b',
  ramGb: 32,
  maxParamsB: 32,
});
if (picked14?.id !== 'qwen25-coder-14b') {
  console.error('FAIL: already-selected 14B must win for create polish', picked14);
  process.exit(2);
}
console.log('polishCoderAdaptive', { mid: picked7.id, strong: pickedStrong.id, pinned: picked14.id });

const css = stripModelProseFromSource(
  'src/App.css',
  ".a{color:red}\n\nThe updated file should now contain the necessary styles.\n",
);
console.log('stripCleared', !/updated file/i.test(css), css.trim().slice(0, 40));

const cssAdded = stripModelProseFromSource(
  'src/App.css',
  ".app { background: #000; }\nAdded the logo centered on screen.\n",
);
if (/Added the logo/i.test(cssAdded)) {
  console.error('FAIL: trailing Added… prose must strip from CSS', cssAdded);
  process.exit(2);
}
const jsxAdded = stripModelProseFromSource(
  'src/App.jsx',
  "export default function App(){return <div className='app' />}\nexport default App;\nAdded the logo centered on screen.\n",
);
if (/Added the logo/i.test(jsxAdded)) {
  console.error('FAIL: trailing Added… prose must strip from JSX', jsxAdded);
  process.exit(2);
}
console.log('stripAddedProse', true);

const bad = {
  'index.html': 'To link to the updated src/App.css file…',
  'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="App">
      <h1>Cafe</h1>
      <nav><a href="#menu">Menu</a></nav>
      <main className="hero"><p>Welcome</p></main>
      <footer>© Cafe</footer>
    </div>
  );
}
`,
  'src/App.css': '.App{min-height:100vh}\n.hero{padding:2rem}\n',
};
const fixed = ensureViteReactProjectFiles(bad, 'Cafe');
console.log({
  pkg: Boolean(fixed.files['package.json']),
  idxRoot: /id=["']root["']/.test(fixed.files['index.html'] || ''),
  ready: isPreviewReady(fixed.files),
  repaired: fixed.repaired,
});
