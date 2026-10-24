import assert from 'node:assert/strict';
import {
  isWebMicroAsk,
  reactSurgicalMicroAskEdits,
  askLooksLikeMarketingOrProductHomepage,
} from '../src/lib/webProjectCanon.ts';

const brief = `Create a new website project called Moss Quill Library on disk now. Soft paper background, deep ink navy type, warm brass accent. Full-bleed quiet hero with the brand name, one short line about a reading shelf, and a grid of 4 book cards (title + author). Polished single page. Skip Plan — build it.`;

assert.equal(askLooksLikeMarketingOrProductHomepage(brief), true, 'marketing');
assert.equal(isWebMicroAsk(brief), false, 'invent create must not be micro');
const surgical = reactSurgicalMicroAskEdits(
  { 'src/App.jsx': 'export default function App(){return null}\n', 'src/App.css': '.app{}' },
  brief,
);
assert.equal(surgical.length, 0, 'no Card-one surgical stamp');
assert.ok(!surgical.some((e) => /Card one/i.test(e.content || '')), 'no Card one');

console.log('smoke-invent-not-card-ladder: ok');
