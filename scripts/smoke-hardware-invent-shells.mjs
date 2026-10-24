/**
 * Item 2: hardware invent shells — unique Acc families for mice/keyboards.
 * No “premium” wording required.
 */
import assert from 'node:assert/strict';
import {
  briefWantsHardwareShell,
  hardwareInventShellId,
  writeHardwareInventShell,
  accHasHardwareShell,
  readHardwareShellId,
} from '@/lib/hardwareInventShells';
import {
  briefWantsProductLadder,
  gradeProductQuality,
  materializeProductSpineFiles,
} from '@/lib/createProductLadder';

const brief = 'Build a website for La Strado — a gaming mouse brand.';
assert.equal(/premium/i.test(brief), false);
assert.equal(briefWantsHardwareShell(brief), true);
assert.equal(briefWantsProductLadder(brief), true);
assert.equal(briefWantsHardwareShell('leather atelier bags website'), false);

const shells = new Set();
for (const brand of ['La Strado', 'Coil Forge', 'Drift Labs', 'Apex Click', 'Pulse Desk']) {
  shells.add(hardwareInventShellId(brand));
}
assert.ok(shells.size >= 2, 'shell id rotates across brands');

const files = writeHardwareInventShell({}, brief, 'La Strado', 'spine');
assert.equal(accHasHardwareShell(files), true);
assert.equal(readHardwareShellId(files), 'spine');
assert.match(files['src/App.jsx'], /data-nova-hw-shell=["']spine["']/);
assert.match(files['src/App.jsx'], /mouse-orb|spotlight|spine-mark/);
assert.match(files['src/App.jsx'], /La Strado/);
assert.match(files['src/App.css'], /@keyframes/);
assert.ok(!Object.keys(files).some((k) => /sections\/HeroSection/i.test(k)), 'no leather sections');

const graded = gradeProductQuality(files, brief, 'La Strado');
assert.ok(graded.okQuality, `hardware spine should clear Quality, got ${graded.label}: ${graded.reasons.join('; ')}`);
assert.ok(
  graded.okPremium || graded.checks.trust,
  `hardware spine should be Premium-ready or have trust: ${graded.label} ${graded.reasons.join('; ')}`,
);

const viaMaterialize = materializeProductSpineFiles(brief, 'La Strado', 'abc123');
assert.equal(accHasHardwareShell(viaMaterialize), true, 'materialize routes hardware briefs to hw shells');
assert.match(viaMaterialize['src/App.jsx'], /data-nova-hw-shell=/);

const desk = materializeProductSpineFiles(
  'Build a landing page for RidgeDesk — a standing desk brand.',
  'RidgeDesk',
  'desk1',
);
assert.equal(accHasHardwareShell(desk), false, 'desk brand stays on product spine, not hw mouse shell');

console.log('PASS: hardware invent shells (spine/spotlight/strip/feature)');
console.log(`  La Strado spine grade: ${graded.label} (premium=${graded.okPremium})`);
