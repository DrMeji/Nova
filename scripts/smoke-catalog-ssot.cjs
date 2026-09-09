/**
 * Engine catalog ids must appear in the Local AI UI catalog.
 * node scripts/smoke-catalog-ssot.cjs
 */
const fs = require('fs');
const path = require('path');
const { CATALOG } = require('../electron/arkCatalog.cjs');

const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'engineCatalogUi.ts'), 'utf8');
let failed = 0;
const HIDDEN_UI_IDS = new Set([
  'sd15-local',
  'sdxl-turbo-local',
  'flux-schnell-local',
]);
for (const m of CATALOG) {
  if (m.builtin) continue;
  // Image / video weights stay in the engine catalog for future use, but are not shown in Local AI UI.
  if (
    HIDDEN_UI_IDS.has(m.id)
    || m.runtime === 'sd'
    || m.runtime === 'flux'
    || m.category === 'image'
    || m.category === 'video'
  ) continue;
  if (!ui.includes(`id: '${m.id}'`)) {
    console.error('FAIL: UI catalog missing', m.id);
    failed += 1;
  }
}
if (!failed) console.log('OK: engine catalog ids match Local AI UI catalog');
process.exit(failed ? 1 : 0);
