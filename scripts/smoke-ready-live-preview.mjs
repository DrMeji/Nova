/**
 * #1 Ready gate: Vite/npm creates must not say Ready without live Preview.
 * npx tsx --tsconfig tsconfig.app.json scripts/smoke-ready-live-preview.mjs
 */
import { formatCreateProjectReply } from '../src/lib/createProjectFlow.ts';

let failed = 0;
function check(name, cond) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('PASS', name);
  }
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
  { npmInstalled: true, previewLive: true, devServerUrl: 'http://127.0.0.1:5200/' },
);
check('live says Ready', /\*\*Ready\*\*/.test(live));
check('live includes URL', /5200/.test(live));

const dead = formatCreateProjectReply(
  { name: 'Cafe', kind: 'vite-react', summary: 'cafe site' },
  baseResult,
  { npmInstalled: true, previewLive: false, bootstrapNote: 'Dev server did not start' },
);
check('dead does not say Ready', !/\*\*Ready\*\*/.test(dead));
check('dead says Not Ready', /\*\*Not Ready yet\.\*\*/.test(dead));
check('dead has no Ready claim', !/\*\*Ready\*\*/.test(dead));

const npmFail = formatCreateProjectReply(
  { name: 'Cafe', kind: 'vite-react', summary: 'cafe site' },
  baseResult,
  { npmInstalled: false, previewLive: false, bootstrapNote: 'Could not install npm dependencies.' },
);
check('npm fail does not say Ready', !/\*\*Ready\*\*/.test(npmFail));
check('npm fail names install', /npm install failed/i.test(npmFail));
check('npm fail says Not Ready', /\*\*Not Ready yet\.\*\*/.test(npmFail));

const noUrl = formatCreateProjectReply(
  { name: 'Cafe', kind: 'vite-react', summary: 'cafe site' },
  baseResult,
  { npmInstalled: true },
);
check('missing previewLive does not say Ready', !/\*\*Ready\*\*/.test(noUrl));

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
check('static can say Ready', /\*\*Ready\*\*/.test(staticReply));

if (failed) {
  console.error(`\n${failed} ready-live check(s) failed`);
  process.exit(1);
}
console.log('OK: Ready requires live Preview for Vite projects');
