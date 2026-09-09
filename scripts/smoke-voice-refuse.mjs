/**
 * Voice must refuse builds/edits (#22).
 * npm run smoke:voice-refuse
 */
import {
  looksLikeVoiceBuildOrEditAsk,
  voiceBuildEditRefuseReply,
  VOICE_MODE_CONSTRAINTS,
} from '../src/lib/voiceMode.ts';

let failed = 0;
function check(name, ok) {
  if (!ok) {
    console.error(`FAIL ${name}`);
    failed += 1;
  } else {
    console.log(`OK ${name}`);
  }
}

check('constraints block builds', VOICE_MODE_CONSTRAINTS.allowProjectBuilds === false);
check('constraints block edits', VOICE_MODE_CONSTRAINTS.allowCodeEdits === false);
check('constraints block disk', VOICE_MODE_CONSTRAINTS.allowDiskWrites === false);

const shouldRefuse = [
  'Build me a coffee shop website',
  'Create a landing page for my cafe',
  'Edit the App.tsx file to make the button blue',
  'Delete the project folder',
  'Install npm packages for me',
  'Take over my PC and open terminal',
];
for (const t of shouldRefuse) {
  check(`refuse: ${t.slice(0, 40)}`, looksLikeVoiceBuildOrEditAsk(t) === true);
}

const shouldAllow = [
  'What is a React component?',
  'How do I deploy a site?',
  'Tell me a joke',
  'What time is it in Tokyo?',
];
for (const t of shouldAllow) {
  check(`allow: ${t}`, looksLikeVoiceBuildOrEditAsk(t) === false);
}

check('refuse copy mentions Chat or Code', /Chat|Code/i.test(voiceBuildEditRefuseReply()));

if (failed) {
  console.error(`\n${failed} voice-refuse check(s) failed`);
  process.exit(1);
}
console.log('\nOK: Voice build/edit refuse gate');
