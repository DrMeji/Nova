/**
 * Step 2 (Prep) — peer bar vs Nova.
 * Re-run until zero FAIL before advancing to Scaffold.
 *
 * Peer bar (Cursor / Claude / Bolt / Replit / runready):
 *   provider keys · model seat · local-only honesty · Node/npm probe · write target · prefer-cloud
 */
import { prepCreateEnvironment, probePcCreateReady } from '../src/lib/codingCreatePipeline.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

const prep = prepCreateEnvironment({
  brief: 'Create Paper Shelf on disk now. Soft paper, navy, brass, grid of 4 book cards.',
  fileCount: 8,
});

console.log('\n=== Prep report ===');
console.log(JSON.stringify({
  ok: prep.ok,
  hasCloudKey: prep.hasCloudKey,
  preferCloud: prep.preferCloud,
  wantsCloud: prep.wantsCloud,
  localOnly: prep.localOnly,
  keyedProviders: prep.keyedProviders,
  createSeat: prep.createSeat,
  nodeVersion: prep.nodeVersion,
  warnings: prep.warnings,
  statusLines: prep.statusLines,
}, null, 2));

check('prep.ok is boolean true (soft — warnings only)', prep.ok === true);
check('statusLines include pipeline prep marker', prep.statusLines.some((l) => /Coding · 2\/|prep/i.test(l)), prep.statusLines[0]);
check('statusLines mention provider keys OR missing keys', prep.statusLines.some((l) => /provider keys/i.test(l)));
check('statusLines mention create seat', prep.statusLines.some((l) => /create seat/i.test(l)));
check('statusLines mention write target NOVA Projects', prep.statusLines.some((l) => /NOVA Projects/i.test(l)));
check('statusLines mention Node or npm', prep.statusLines.some((l) => /\bNode\b|\bnpm\b/i.test(l)));
check('keyedProviders is array', Array.isArray(prep.keyedProviders));
check('createSeat is string or null', prep.createSeat === null || typeof prep.createSeat === 'string');
check('nodeVersion is string or null', prep.nodeVersion === null || typeof prep.nodeVersion === 'string');
check('wantsCloud true for invent create', prep.wantsCloud === true);
check(
  'unkeyed invent surfaces local path honesty',
  prep.hasCloudKey
    || prep.statusLines.some((l) => /wants cloud craft but no key|local invent/i.test(l))
    || prep.warnings.some((w) => /cloud API key/i.test(w)),
  prep.statusLines.filter((l) => /cloud|local invent|key/i.test(l)).join(' | '),
);

// Prefer-cloud honesty for multi-file invent briefs.
check(
  'preferCloud or local-only or key warning path surfaced',
  prep.preferCloud === true
    || prep.localOnly === true
    || prep.wantsCloud === true
    || prep.warnings.some((w) => /cloud API key|local_only/i.test(w))
    || prep.statusLines.some((l) => /prefer cloud|local invent|provider keys/i.test(l)),
  `preferCloud=${prep.preferCloud} warnings=${prep.warnings.join('|')}`,
);

const probe = probePcCreateReady();
check('probe returns statusLines', probe.statusLines.length >= 2, String(probe.statusLines.length));
check('probe returns nodeVersion field', 'nodeVersion' in probe);

// Shape stability — emit consumers rely on these keys.
for (const k of ['ok', 'hasCloudKey', 'preferCloud', 'wantsCloud', 'localOnly', 'keyedProviders', 'createSeat', 'nodeVersion', 'warnings', 'statusLines']) {
  check(`prep has ${k}`, k in prep);
}

if (failed) {
  console.error(`\nStep 2 prep: ${failed} check(s) failed — stay on Prep`);
  process.exit(1);
}
console.log('\nStep 2 prep: all checks passed — peer bar met for Prep');
