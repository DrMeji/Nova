import assert from 'node:assert/strict';
// Unit-only: exercise stamp machinery. Create Ready path keeps stamp OFF by default.
process.env.NOVA_ALLOW_INVENT_DEMO = '1';
import {
  composeInventDemoSite,
  applyInventDemoToFiles,
  appLooksLikeInventIncomplete,
} from '@/lib/createInventDemo';
import { evaluateBinaryCreateRubric } from '@/lib/agentHarness';
import { looksLikePlaceholderFloor } from '@/lib/codingAgentPack';
import { smokeCheckCreateFiles } from '@/lib/createEvidence';

const thin = {
  'src/App.jsx': `import NavHeaderSection from './sections/NavHeaderSection.jsx';
export default function App(){return <div className="app"><NavHeaderSection/></div>}`,
  'src/sections/HeroSection.jsx': `<section data-nova-scaffold="1">More authored detail for this band so the file clears the substantial floor. </section>`,
};
assert.equal(appLooksLikeInventIncomplete(thin), true);

const demo = composeInventDemoSite({
  brand: 'CedarLoom Test',
  brief: 'textile atelier landing with contact form',
});
assert.ok(demo.files['src/App.jsx'].length > 1200);
assert.match(demo.files['src/App.jsx'], /CedarLoom Test/);
assert.match(demo.files['src/App.jsx'], /useState/);
assert.match(demo.files['src/App.css'], /--accent/);

const applied = applyInventDemoToFiles(thin, 'CedarLoom Test', 'textile atelier landing with contact form');
assert.equal(applied.applied, true);
assert.equal(Object.keys(applied.files).some((k) => k.startsWith('src/sections/')), false);

const floor = looksLikePlaceholderFloor(applied.files);
assert.equal(floor.floor, false, floor.reasons.join('; '));

const smoke = smokeCheckCreateFiles(applied.files, 'textile atelier landing with contact form');
const rub = evaluateBinaryCreateRubric({
  files: applied.files,
  brief: 'Create textile atelier landing with contact form for CedarLoom Test',
  brand: 'CedarLoom Test',
  evidence: { mounted: true, consoleClean: true, smokeOk: smoke.ok, floor: false, axeCritical: 0 },
});
console.log({ smoke: smoke.ok, smokeDetail: smoke.detail, rubOk: rub.ok, failed: rub.failed, appLen: applied.files['src/App.jsx'].length });
assert.equal(rub.ok, true, rub.failed.join(','));
console.log('smoke-invent-demo: ok');
