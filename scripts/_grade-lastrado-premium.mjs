import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// Load via tsx register
const {
  briefWantsProductLadder,
  gradeProductQuality,
  ensureProductPremiumCraft,
} = await import('../src/lib/createProductLadder.ts');

const brief = 'Build a website for La Strado — a gaming mouse brand.';
console.log('ladder?', briefWantsProductLadder(brief));
console.log('premium wording?', /premium/i.test(brief));

const root = join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects', 'la-strado');
const files = {
  'src/App.jsx': readFileSync(join(root, 'src/App.jsx'), 'utf8'),
  'src/App.css': readFileSync(join(root, 'src/App.css'), 'utf8'),
  'src/index.css': existsSync(join(root, 'src/index.css'))
    ? readFileSync(join(root, 'src/index.css'), 'utf8')
    : '',
};
const before = gradeProductQuality(files, brief, 'La Strado');
console.log('before', before.label, { Q: before.okQuality, P: before.okPremium, reasons: before.reasons.slice(0, 8) });
const next = ensureProductPremiumCraft(files, brief, 'La Strado');
const after = gradeProductQuality(next, brief, 'La Strado');
console.log('after', after.label, { Q: after.okQuality, P: after.okPremium, reasons: after.reasons.slice(0, 8) });
writeFileSync(join(root, 'src/App.jsx'), next['src/App.jsx']);
writeFileSync(join(root, 'src/App.css'), next['src/App.css']);
if (!after.okPremium) {
  console.error('FAIL: still not premium');
  process.exit(2);
}
console.log('PASS: premium without wording gate');
void require;
