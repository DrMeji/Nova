/**
 * K — Invent packs peer bar (hot path vs Acc noise).
 * invent-demo dead; craft/coding/harness packs export without re-enabling twin.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  composeInventDemoSite,
  inventDemoHostStampAllowed,
} from '../src/lib/createInventDemo.ts';
import { inventLayoutSalt, assertInventLogoLock } from '../src/lib/inventCraftPack.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n=== K Invent packs · peer rescan ===');

check('host stamp off', inventDemoHostStampAllowed() === false);
check('compose empty', Object.keys(composeInventDemoSite({ brand: 'X', brief: 'Y' }).files).length === 0);
check('layout salt', typeof inventLayoutSalt('Oak', 'portfolio') === 'number');
const lucide = '<svg viewBox="0 0 24 24"><path d="M9.937 15.5"/></svg>';
check(
  'no-demo logo lock allows model mark',
  assertInventLogoLock({ 'public/logo.svg': lucide }, lucide).ok === true,
);
check(
  'leftover invent-demo logo blocks Lucide',
  assertInventLogoLock(
    {
      'src/App.jsx': '<div data-nova-invent-demo="1"/>',
      'public/logo.svg': '<svg data-nova-invent-logo="1" viewBox="0 0 64 64"/>',
    },
    lucide,
  ).ok === false,
);

const packs = [
  'inventCraftPack.ts',
  'inventCodingPack.ts',
  'inventFieldPack.ts',
  'inventCloseAllPack.ts',
  'inventHarnessPack.ts',
  'inventBriefFidelity.ts',
];
for (const p of packs) {
  const src = readFileSync(join(root, 'src/lib', p), 'utf8');
  check(`${p} exists`, src.length > 100);
  check(
    `${p} does not re-enable invent-demo stamp`,
    !/inventDemoHostStampAllowed\s*=\s*\(\)\s*=>\s*true|NOVA_ALLOW_INVENT_DEMO\s*=\s*['"]1['"]/.test(src),
  );
}

const demoSrc = readFileSync(join(root, 'src/lib/createInventDemo.ts'), 'utf8');
check('createInventDemo documents removed', /Invent-demo REMOVED|permanently removed/i.test(demoSrc));
check('compose returns empty object literal path', /files:\s*\{\s*\}/.test(demoSrc));

if (failed) {
  console.error(`\nK invent packs peer: ${failed} failed`);
  process.exit(1);
}
console.log('\nK invent packs peer: all checks passed');
