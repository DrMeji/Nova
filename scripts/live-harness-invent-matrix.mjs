/**
 * Multi-brief Nova invent Live gate — Cursor only drives CDP; Nova builds.
 *
 *   npx tsx --tsconfig tsconfig.app.json scripts/live-harness-invent-matrix.mjs
 */
import { spawnSync } from 'child_process';

const ROOT = process.cwd();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = [
  {
    brand: `WarpAtelier ${Date.now().toString(36).slice(-4)}`,
    prompt: (b) => [
      `Create a new website on disk for **${b}** — a small textile atelier landing page.`,
      'Hero with the brand name large, short craft story, one materials section, one contact form with name/email state.',
      'Unique textile atelier look — brand-first hero, warm natural materials, no utility-app chrome.',
      'Skip Plan. Start building now — invent App + CSS and open Live when ready.',
    ].join(' '),
  },
  {
    brand: `NorthCup ${Date.now().toString(36).slice(-3)}a`,
    prompt: (b) => [
      `Create a new website on disk for **${b}** — a neighborhood coffee café landing page.`,
      'Hero with brand name, short café story, menu highlights section, and a contact form with name/email state.',
      'Warm café atmosphere — not a utility app. Skip Plan. Start building now — invent App + CSS and open Live when ready.',
    ].join(' '),
  },
  {
    brand: `LensRoom ${Date.now().toString(36).slice(-3)}b`,
    prompt: (b) => [
      `Create a new website on disk for **${b}** — a photographer portfolio landing page.`,
      'Hero with brand name, short practice story, selected work section, and a contact form with name/email state.',
      'Editorial portfolio look. Skip Plan. Start building now — invent App + CSS and open Live when ready.',
    ].join(' '),
  },
];

const results = [];
console.log('Starting invent Live matrix —', CASES.length, 'briefs (Nova builds only)');

for (let i = 0; i < CASES.length; i++) {
  const c = CASES[i];
  const brand = c.brand;
  const prompt = c.prompt(brand);
  console.log(`\n======== RUN ${i + 1}/${CASES.length} · ${brand} ========`);
  const g = spawnSync(
    'npx',
    ['tsx', '--tsconfig', 'tsconfig.app.json', 'scripts/live-harness-invent-once.mjs'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      shell: true,
      env: {
        ...process.env,
        NOVA_CREATE_BRAND: brand,
        NOVA_CREATE_PROMPT: prompt,
        NOVA_CREATE_TIMEOUT_MS: String(22 * 60_000),
      },
      stdio: 'inherit',
    },
  );
  const ok = g.status === 0;
  results.push({ brand, ok, status: g.status });
  console.log(`RUN ${i + 1} =>`, ok ? 'PASS' : 'FAIL');
  if (!ok) {
    console.error('Matrix stopped on Live fail — inspect Nova craft reply / blockedReasons.');
    break;
  }
  await sleep(2500);
}

console.log('\n=== MATRIX SUMMARY ===');
console.log(results);
const allOk = results.length === CASES.length && results.every((r) => r.ok);
if (!allOk) process.exit(1);
console.log('PASS invent Live matrix — all briefs unlocked Live in Nova');
process.exit(0);
