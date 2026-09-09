/**
 * Removed product surfaces must stay off for retail builds.
 * Voice chat is intentionally live (dev always / Settings toggle).
 * node scripts/smoke-parked-features.mjs
 */
import {
  isVideoTabEnabled,
  isImageTabEnabled,
  isCallUiEnabled,
  isTestersSettingsEnabled,
  isBetaSettingsEnabled,
} from '../src/lib/featurePark.ts';

let failed = 0;

const checks = [
  ['Image tab', isImageTabEnabled(), false],
  ['Video tab', isVideoTabEnabled(), false],
  ['Call UI', isCallUiEnabled(), false],
  ['Testers settings', isTestersSettingsEnabled(), false],
  ['Beta settings', isBetaSettingsEnabled(), false],
];

for (const [name, actual, expected] of checks) {
  if (actual !== expected) {
    console.error(`FAIL ${name}: expected ${expected}, got ${actual}`);
    failed += 1;
  }
}

if (failed) {
  console.error(`\n${failed} removed-feature test(s) failed`);
  process.exit(1);
}
console.log('OK: Image, Video, Call, Testers, and Beta are removed');
