import { inventFloorShellId, writeAtelierInventShell } from '../src/lib/atelierInventShells.ts';
import { looksLikeClassicFourBoxAtelierShell } from '../src/lib/atelierInventShells.ts';
import { seedCompositionalInventFloor, looksLikeInventFloorTwin } from '../src/lib/createThinPath.ts';

const brief =
  'Create a parchment atelier leather-goods website with soft paper grounds, espresso type, warm brass, unique layout. Premium. Skip Plan.';
const brands = [
  'Garnet Latch Atelier',
  'Ivory Latch Atelier',
  'Noir Latch Atelier',
  'Sable Latch Atelier',
  'Cobalt Latch Atelier',
  'Willow Latch Atelier',
  'Fox Latch Atelier',
  'Onyx Latch Atelier',
];
const rows = brands.map((brand) => {
  const shell = inventFloorShellId(brand);
  const acc = seedCompositionalInventFloor({}, brief, brand);
  const blob = Object.values(acc).join('\n');
  const nav = String(acc['src/sections/NavHeaderSection.jsx'] || '');
  const cat = String(acc['src/sections/CatalogSection.jsx'] || '');
  return {
    brand,
    shell,
    twin: looksLikeInventFloorTwin(acc),
    classic4: looksLikeClassicFourBoxAtelierShell(acc),
    navKind: /nav-centered/.test(nav) ? 'centered'
      : /nav-rail/.test(nav) ? 'rail'
        : /nav-under/.test(nav) ? 'under'
          : /nav-dock/.test(nav) ? 'dock'
            : /nav-minimal/.test(nav) ? 'minimal'
              : 'other',
    shopLabel: (cat.match(/aria-label="([^"]+)"/) || [])[1] || null,
    productCards: (cat.match(/product-card/g) || []).length,
    hasShell: /data-nova-shell=/.test(blob),
  };
});
const shells = new Set(rows.map((r) => r.shell));
console.log(JSON.stringify({ uniqueShells: shells.size, shells: [...shells], rows }, null, 2));
if (shells.size < 3) {
  console.error('FAIL: need at least 3 distinct shell families across brands');
  process.exit(1);
}
if (rows.some((r) => r.classic4 || r.twin || !r.hasShell)) {
  console.error('FAIL: twin or classic four-box still present');
  process.exit(1);
}
console.log('shell-diversity: ok');
