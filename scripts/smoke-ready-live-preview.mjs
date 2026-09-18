/**
 * #1 Ready gate: Vite/npm creates must not claim finished Live without preview.
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
check('live invites Live button', /click \*\*Live\*\*/i.test(live));
check('live says Preview is live', /Preview is live/i.test(live));
check('live does not dump Path/Files written', !/\*\*Path:\*\*/i.test(live) && !/\*\*Files written/i.test(live));

const dead = formatCreateProjectReply(
  { name: 'Cafe', kind: 'vite-react', summary: 'cafe site' },
  baseResult,
  { npmInstalled: true, previewLive: false, bootstrapNote: 'Dev server did not start' },
);
check('dead still invites Live when ready', /click \*\*Live\*\*/i.test(dead));
check('dead does not claim Preview is live', !/Preview is live/i.test(dead));

const npmFail = formatCreateProjectReply(
  { name: 'Cafe', kind: 'vite-react', summary: 'cafe site' },
  baseResult,
  { npmInstalled: false, previewLive: false, bootstrapNote: 'Could not install npm dependencies.' },
);
check('npm fail names install', /npm install/i.test(npmFail));
check('npm fail invites retry', /install npm dependencies/i.test(npmFail));

const noUrl = formatCreateProjectReply(
  { name: 'Cafe', kind: 'vite-react', summary: 'cafe site' },
  baseResult,
  { npmInstalled: true },
);
check('missing previewLive still professional', /I've created/i.test(noUrl));

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
check('static invites Live / changes', /I've created/i.test(staticReply) && /Want anything changed/i.test(staticReply));

if (failed) {
  console.error(`\n${failed} ready-live check(s) failed`);
  process.exit(1);
}
console.log('OK: create replies are professional + Live CTA');
