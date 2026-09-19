import assert from 'node:assert/strict';
import { extractProjectName } from '../src/lib/createProjectIntent.ts';
import { extractMustHaveFromBrief } from '../src/lib/createIdentity.ts';
import { looksLikeModelProseLeak } from '../src/lib/createBuildQuality.ts';

const ask = 'ok go ahead and build QuietShelf for me — a simple phone-friendly shelf browser with borrow and return, soft paper tones and warm walnut. create the project on disk.';
assert.equal(extractProjectName(ask), 'QuietShelf');

const must = extractMustHaveFromBrief(ask);
assert.ok(must.some((m) => /borrow/i.test(m)), `borrow must-have missing: ${must.join('; ')}`);
assert.ok(must.some((m) => /return/i.test(m)), `return must-have missing: ${must.join('; ')}`);
assert.ok(!must.some((m) => /time\s*slot|booking flow/i.test(m)), `false booking must-have: ${must.join('; ')}`);

const sampleApp = "const items=[{title:'The Great Gatsby', description:'A classic novel by F. Scott Fitzgerald'}];";
assert.equal(looksLikeModelProseLeak(sampleApp), false);

console.log('PASS quiet-shelf identity');
