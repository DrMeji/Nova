/**
 * Parked surfaces must stay off for retail builds.
 * node scripts/smoke-parked-features.mjs
 */
import {
  isVideoTabEnabled,
  isTestersSettingsEnabled,
  isBetaSettingsEnabled,
} from '../src/lib/featurePark.ts';
import { isVoiceTabEnabled } from '../src/lib/voiceMode.ts';

let failed = 0;

const checks = [
  ['Video tab', isVideoTabEnabled(), false],
  ['Voice tab', isVoiceTabEnabled(), false],
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
  console.error(`\n${failed} parked-feature test(s) failed`);
  process.exit(1);
}
console.log('OK: Video, Voice, Testers, and Beta are parked');
