import fs from 'fs';
import { finalizeWebEdits } from '../src/lib/webProjectCanon.ts';
import { verifyAsk } from '../src/lib/verifyAsk.ts';

const root = 'C:/Users/thoma/Documents/NOVA Projects/word-lab-vava/src';
const files = {
  'src/App.tsx': fs.readFileSync(`${root}/App.tsx`, 'utf8'),
  'src/App.css': fs.readFileSync(`${root}/App.css`, 'utf8'),
};
console.log('BEFORE center', files['src/App.css'].match(/\.center-word\s*\{[^}]*\}/i)?.[0]);
const moved = finalizeWebEdits(files, 'Move the name to the top left', []);
const css = moved.find((e) => /css/i.test(e.path))?.content || '';
console.log('AFTER center', css.match(/\.center-word\s*\{[^}]*\}/i)?.[0]);
const next = { ...files, 'src/App.css': css };
console.log('verify after move', verifyAsk('Move the name to the top left', next));
