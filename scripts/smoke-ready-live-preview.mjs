/**
 * #1 Ready gate: Vite/npm creates must not claim finished Live without preview.
 * npx tsx --tsconfig tsconfig.app.json scripts/smoke-ready-live-preview.mjs
 */
import { formatCreateProjectReply } from '../src/lib/createProjectFlow.ts';
import { formatCodeChatReply } from '../src/lib/projectCodeEdit.ts';
import { finalizeCodingChatBubble } from '../src/lib/chatCodeReply.ts';
import { formatCreateHandback, formatEditHandback, coerceHandbackParagraph } from '../src/lib/taskHandbackReply.ts';

let failed = 0;
function check(name, cond) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('PASS', name);
  }
}

function isOneParagraph(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/^[-*•]\s/m.test(t) || /\n-\s/.test(t)) return false;
  // Allow at most soft wraps — no bullet dumps / multi-block changelogs.
  return t.split(/\n\n+/).length <= 1;
}

const baseResult = {
  ok: true,
  projectPath: 'C:\\\\Projects\\\\Cafe',
  written: ['package.json', 'src/App.jsx'],
  files: {
    'package.json': '{"dependencies":{"vite":"^5"}}',
    'src/App.jsx': 'export default function App(){return <div/>}',
  },
};

const live = formatCreateProjectReply(
  { name: 'Cafe', kind: 'vite-react', summary: 'cafe site' },
  baseResult,
  { npmInstalled: true, previewLive: true, codeVerified: true, devServerUrl: 'http://127.0.0.1:5200/' },
);
check('live invites Live button', /\*\*Live\*\*/i.test(live));
check('live claims ready (finished)', /finished building|Live is ready/i.test(live));
check('live is one paragraph', isOneParagraph(live));
check('live does not dump Path/Files written', !/\*\*Path:\*\*/i.test(live) && !/\*\*Files written/i.test(live));
check('live does not use bullet list', !/^[-*•]\s/m.test(live));

const dead = formatCreateProjectReply(
  { name: 'Cafe', kind: 'vite-react', summary: 'cafe site' },
  baseResult,
  { npmInstalled: true, previewLive: false, bootstrapNote: 'Dev server did not start' },
);
check('dead still invites Live when ready', /\*\*Live\*\*/i.test(dead));
check('dead does not claim Live is ready', !/Live is ready/i.test(dead));
check('dead is one paragraph', isOneParagraph(dead));

const npmFail = formatCreateProjectReply(
  { name: 'Cafe', kind: 'vite-react', summary: 'cafe site' },
  baseResult,
  { npmInstalled: false, previewLive: false, bootstrapNote: 'Could not install npm dependencies.' },
);
check('npm fail names install', /npm/i.test(npmFail));
check('npm fail invites retry', /install npm dependencies/i.test(npmFail));
check('npm fail is one paragraph', isOneParagraph(npmFail));

const noUrl = formatCreateProjectReply(
  { name: 'Cafe', kind: 'vite-react', summary: 'cafe site' },
  baseResult,
  { npmInstalled: true },
);
check('missing previewLive still professional', /I've put|on disk/i.test(noUrl));
check('missing previewLive is one paragraph', isOneParagraph(noUrl));

const staticReply = formatCreateProjectReply(
  { name: 'Landing', kind: 'static-web', summary: 'html landing' },
  {
    ok: true,
    projectPath: 'C:\\\\Projects\\\\Landing',
    written: ['index.html'],
    files: { 'index.html': '<html></html>' },
  },
  { npmInstalled: true },
);
check('static invites Live / changes', /I've created/i.test(staticReply) && /\*\*Live\*\*|change next/i.test(staticReply));
check('static is one paragraph', isOneParagraph(staticReply));

const softLive = formatCreateProjectReply(
  { name: 'Cafe', kind: 'vite-react', summary: 'cafe site' },
  baseResult,
  { npmInstalled: true, previewLive: true, codeVerified: false, devServerUrl: 'http://127.0.0.1:5200/' },
);
check('soft live does not claim full success', !/finished building/i.test(softLive) && /doesn'?t fully match|not call this done/i.test(softLive));
check('soft live is one paragraph', isOneParagraph(softLive));

// Edit / small-fix handbacks
const sticky = formatCodeChatReply('make the nav sticky with Products Specs Buy', ['src/App.css'], '', { surface: 'chat' });
check('sticky edit is polished paragraph', isOneParagraph(sticky) && /sticky nav/i.test(sticky) && !/^Done\./i.test(sticky));
check('sticky invites Live', /\*\*Live\*\*/i.test(sticky));

const bg = formatCodeChatReply('change the background to charcoal', ['src/App.css'], '', { surface: 'chat' });
check('background edit is polished', isOneParagraph(bg) && /charcoal|background/i.test(bg) && !/^Done\./i.test(bg));

const bubbled = finalizeCodingChatBubble({
  userMessage: 'make the logo larger',
  rawReply: 'css',
  changedPaths: ['src/App.css'],
  applied: true,
});
check('finalize falls back to polished handback', isOneParagraph(bubbled) && !/^Done\./i.test(bubbled));

const coerced = coerceHandbackParagraph('- Wrote App.css\n- Updated nav\n- Done');
check('coerce collapses bullets', isOneParagraph(coerced) && !/^[-*•]/.test(coerced));

const editOk = formatEditHandback({ ask: 'fix the cart button', outcome: 'edit-ok', surface: 'chat' });
check('edit-ok mentions fix naturally', /fix/i.test(editOk) && isOneParagraph(editOk));

const createReady = formatCreateHandback({ productName: 'Willow', outcome: 'ready' });
check('create ready handback', /Willow/i.test(createReady) && isOneParagraph(createReady) && /\*\*Live\*\*/i.test(createReady));

if (failed) {
  console.error(`\n${failed} ready-live / handback check(s) failed`);
  process.exit(1);
}
console.log('OK: create + edit replies are polished single paragraphs with Live CTAs');
