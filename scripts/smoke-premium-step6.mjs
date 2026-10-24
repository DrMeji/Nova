/**
 * Step 6 (Premium) — peer bar: Ready must reject floor / twin / thin.
 */
import { readyBlockedByCodingQuality } from '../src/lib/codingCreatePipeline.ts';
import { looksLikePlaceholderFloor } from '../src/lib/codingAgentPack.ts';
import { CODING_QUALITY_WIN, codingQualityFloorHit } from '../src/lib/codingQualityWinPack.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

check('premiumRejectFloor flag on', CODING_QUALITY_WIN.premiumRejectFloor === true);

const thin = {
  'src/App.jsx': `export default function App(){return <div className="app"/>}`,
  'src/App.css': `.app{min-height:100vh}`,
};
const thinHit = codingQualityFloorHit(thin);
check('thin App hits floor', thinHit.hit === true && thinHit.reasons.some((r) => /thin/i.test(r)), thinHit.reasons.join(','));
check('thin blocks Ready', readyBlockedByCodingQuality(thin).blocked === true);

const floor = {
  'src/App.jsx': `export default function App(){return <div className="storefront-floor nova-storefront-spine">${'x'.repeat(1000)}</div>}`,
  'src/App.css': `.app{min-height:100vh}`,
};
check('storefront floor detected', looksLikePlaceholderFloor(floor).floor === true || codingQualityFloorHit(floor).hit);
check('storefront floor blocks Ready', readyBlockedByCodingQuality(floor).blocked === true);

const ok = {
  'src/App.jsx': `import './App.css';\nexport default function App(){\n  return (\n    <div className="app">\n      <h1>Harbor Roast</h1>\n      <p className="lede">${'Rich coffee copy for the harbor. '.repeat(80)}</p>\n      <section className="menu"><h2>Menu</h2><ul><li>Espresso</li><li>Pour over</li><li>House pastry</li></ul></section>\n    </div>\n  );\n}\n`,
  'src/App.css': `.app{min-height:100vh;background:#faf7f2;color:#1a1510}.lede{max-width:36rem;line-height:1.5}`,
};
const okGate = readyBlockedByCodingQuality(ok);
check('honest App not blocked by floor alone', okGate.blocked === false, okGate.reasons.join(','));

if (failed) {
  console.error(`\nStep 6 premium: ${failed} failed`);
  process.exit(1);
}
console.log('\nStep 6 premium: all checks passed');
