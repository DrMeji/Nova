/**
 * Engine catalog ids must appear in the Local AI UI catalog.
 * node scripts/smoke-catalog-ssot.cjs
 */
const fs = require('fs');
const path = require('path');
const { CATALOG } = require('../electron/arkCatalog.cjs');

const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'engineCatalogUi.ts'), 'utf8');
let failed = 0;
for (const m of CATALOG) {
  if (m.builtin) continue;
  if (!ui.includes(`id: '${m.id}'`)) {
    console.error('FAIL: UI catalog missing', m.id);
    failed += 1;
  }
}
if (!failed) console.log('OK: engine catalog ids match Local AI UI catalog');
process.exit(failed ? 1 : 0);
