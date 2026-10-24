/**
 * Trust rebuild: set every catalog grade back to ungraded, keep stems.
 * Next _grade-catalog-from-tests.mjs must re-earn Strong from evidence.
 */
import {
  loadCatalogMap,
  writeCatalog,
  catalogStats,
  CATALOG_META_PATH,
} from './lib/honestCatalog.mjs';
import fs from 'fs';

const map = loadCatalogMap();
const now = new Date().toISOString();
for (const [k, row] of map) {
  map.set(k, {
    ...row,
    grade: 'ungraded',
    evidenceAt: null,
    lastFail: 'trust-reset — must re-pass tests',
    trustResetAt: now,
  });
}
writeCatalog(map.values());
const stats = catalogStats(map.values());
fs.writeFileSync(
  CATALOG_META_PATH,
  `${JSON.stringify({
    updatedAt: now,
    trustResetAt: now,
    total: stats.total,
    note: 'All grades cleared. Strong only via evidence tests.',
    stats,
  }, null, 2)}\n`,
);
console.log(JSON.stringify({ trustReset: true, stats }, null, 2));
