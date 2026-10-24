import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  gradeProductQuality,
  briefWantsProductLadder,
  appLooksLikeCannedProductTwin,
  formatProductQualityReport,
} from '@/lib/createProductLadder';

const root = path.join(os.homedir(), 'Documents', 'NOVA Projects', 'RidgeDesk');
const files = {
  'src/App.jsx': fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8'),
  'src/App.css': fs.readFileSync(path.join(root, 'src/App.css'), 'utf8'),
  'public/logo.svg': fs.existsSync(path.join(root, 'public/logo.svg'))
    ? fs.readFileSync(path.join(root, 'public/logo.svg'), 'utf8')
    : '',
};
const brief = [
  'hey — can you make me a new website for a gaming desk brand called RidgeDesk?',
  'just a landing page, dark vibe, with a shop button and a few features.',
  'new project on disk please, not editing whatever i have open.',
].join(' ');
console.log('wantsLadder', briefWantsProductLadder(brief));
console.log('cannedTwin', appLooksLikeCannedProductTwin(files['src/App.jsx']));
console.log(formatProductQualityReport(files, brief, 'RidgeDesk'));
console.log(JSON.stringify(gradeProductQuality(files, brief, 'RidgeDesk'), null, 2));
console.log('appHead', files['src/App.jsx'].slice(0, 400));
