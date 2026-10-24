/**
 * Assert all 90 unique coding-deep themes are Have + evidence files exist.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CODING_UNIQUE_CAPABILITIES, codingUniqueSummary } from '../src/lib/codingUniqueImplementations.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;

function check(ok, name, detail = '') {
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
  if (!ok) fail += 1;
}

const summary = codingUniqueSummary();
check(summary.total === 90, 'exactly 90 unique capabilities', String(summary.total));
check(summary.missing === 0, 'all unique caps Have', `missing=${summary.missing}`);

const requiredFiles = [
  'src/lib/codingUniqueImplementations.ts',
  'src/lib/codingCreatePipeline.ts',
  'src/lib/codingQualityWinPack.ts',
  'src/lib/codingCreateSeats.ts',
  'src/lib/codingFileVerify.ts',
  'src/lib/fileModelAttribution.ts',
  'src/lib/patchConfidence.ts',
  'src/lib/codingProvidersTestConnection.ts',
  'src/components/CodingPipelineChecklist.tsx',
  'src/components/CodingWorkerDagPanel.tsx',
  'src/components/ComposerModeSwitcher.tsx',
  'src/components/CreateKindPicker.tsx',
  'src/components/FileVerifyChips.tsx',
  'src/components/DiffReviewPanel.tsx',
  'src/components/CloudKeyMissingCta.tsx',
  'src/lib/chatTurnHandlers/create.ts',
  'src/lib/novaAgentLoop.ts',
  'src/lib/novaAgentPatch.ts',
  'src/lib/createInventDemo.ts',
  'src/views/AgentsView.tsx',
  'src/views/aichat/AIChatFrame.tsx',
];

for (const rel of requiredFiles) {
  check(fs.existsSync(path.join(root, rel)), `exists ${rel}`);
}

const createSrc = fs.readFileSync(path.join(root, 'src/lib/chatTurnHandlers/create.ts'), 'utf8');
const loopSrc = fs.readFileSync(path.join(root, 'src/lib/novaAgentLoop.ts'), 'utf8');
const frameSrc = fs.readFileSync(path.join(root, 'src/views/aichat/AIChatFrame.tsx'), 'utf8');
const agentsSrc = fs.readFileSync(path.join(root, 'src/views/AgentsView.tsx'), 'utf8');

check(/understandCreateBrief|readyBlockedByCodingQuality|bindBinderGuard/.test(createSrc), 'create pipeline wired');
check(/verifyCraftFile|doomLoopGuard|recordFileModelAttribution/.test(loopSrc), 'agent per-file verify+attribution');
check(/ComposerModeSwitcher|CreateKindPicker/.test(frameSrc), 'composer Ask/Plan/Act + kind picker');
check(/CodingWorkerDagPanel|DiffReviewPanel|CloudKeyMissingCta/.test(agentsSrc), 'agents DAG+diff+CTA');

for (const cap of CODING_UNIQUE_CAPABILITIES) {
  check(cap.status === 'Have', `cap ${cap.id}`, cap.why);
  check(Array.isArray(cap.evidence) && cap.evidence.length > 0, `evidence ${cap.id}`);
}

if (fail) {
  console.error('coding-unique-all failed', fail);
  process.exit(1);
}
console.log('ALL PASS coding-unique-all', summary);
