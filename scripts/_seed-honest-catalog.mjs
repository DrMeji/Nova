/**
 * Seed nova-capability-catalog.jsonl from OPEN_ALL_CAPS (unique stems).
 * Does not wipe existing Strong grades — merges append-only.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appendStems, loadCatalogMap, catalogStats, CATALOG_PATH } from './lib/honestCatalog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const capsPath = path.join(root, '../src/lib/inventOpenAllCaps.generated.ts');
const src = fs.readFileSync(capsPath, 'utf8');
const m = src.match(/export const OPEN_ALL_CAPS: string\[\] = (\[.*\]);/s);
if (!m) {
  console.error('OPEN_ALL_CAPS not found');
  process.exit(1);
}
const caps = JSON.parse(m[1]);
const before = loadCatalogMap().size;
const meta = appendStems(caps.map((stem) => ({ stem, peerNote: 'seeded from OPEN_ALL_CAPS' })));
const stats = catalogStats();
console.log(JSON.stringify({
  catalogPath: CATALOG_PATH,
  before,
  ...meta,
  stats,
}, null, 2));
