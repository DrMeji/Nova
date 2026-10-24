/**
 * HARD coding-quality gate — must FAIL until Nova’s create/agent path
 * actually runs understand→prep→craft→verify-each→premium→done.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  composeInventDemoSite,
  detectInventGenre,
} from '../src/lib/createInventDemo.ts';
import {
  CODING_QUALITY_WIN,
  CODING_PIPELINE_STEPS,
  formatCodingPipelineProgress,
  codingQualityFloorHit,
} from '../src/lib/codingQualityWinPack.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
function check(ok, name, detail = '') {
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
  if (!ok) fail += 1;
}

const packPath = path.join(root, 'src/lib/codingQualityWinPack.ts');
const pipePath = path.join(root, 'src/lib/codingCreatePipeline.ts');
check(fs.existsSync(packPath), 'codingQualityWinPack exists');
check(fs.existsSync(pipePath), 'codingCreatePipeline exists');

const createSrc = fs.readFileSync(path.join(root, 'src/lib/chatTurnHandlers/create.ts'), 'utf8');
const loopSrc = fs.readFileSync(path.join(root, 'src/lib/novaAgentLoop.ts'), 'utf8');
const agentPack = fs.readFileSync(path.join(root, 'src/lib/codingAgentPack.ts'), 'utf8');
const progressSrc = fs.existsSync(path.join(root, 'src/components/AgentProgressStatus.tsx'))
  ? fs.readFileSync(path.join(root, 'src/components/AgentProgressStatus.tsx'), 'utf8')
  : '';
const pipeSrc = fs.readFileSync(pipePath, 'utf8');

check(
  /codingQualityWinPack|CODING_QUALITY_WIN|formatCodingPipelineProgress/i.test(createSrc),
  'create.ts wires codingQualityWinPack',
);
check(
  /understandCreateBrief|prepCreateEnvironment|readyBlockedByCodingQuality|emitCreatePipelineStart/i.test(createSrc),
  'create.ts wires codingCreatePipeline',
);
check(
  /understandCreateBrief|prepCreateEnvironment|readyBlockedByCodingQuality/i.test(pipeSrc),
  'pipeline exports understand/prep/ready gate',
);
check(
  /CODING_QUALITY_WIN|verifyAfterEachFile|codingQualityFloorHit/i.test(loopSrc),
  'novaAgentLoop wires quality verify/floor',
);
check(
  /formatCodingPipelineProgress|understand→prep→scaffold→craft→verify/i.test(
    `${createSrc}\n${progressSrc}\n${loopSrc}`,
  ),
  'pipeline progress string understand→prep→…→done exposed',
);
check(CODING_PIPELINE_STEPS.length >= 7, 'pipeline has 7 steps', String(CODING_PIPELINE_STEPS.length));
check(
  CODING_QUALITY_WIN.verifyAfterEachFile && CODING_QUALITY_WIN.premiumRejectFloor,
  'quality win flags on',
);
check(
  /verifyProjectAfterPatch/i.test(loopSrc) && /TOOL:\s*write/i.test(loopSrc),
  'agent verify+write path present',
);
check(/looksLikePlaceholderFloor|codingQualityFloorHit|rejectFloor/i.test(`${agentPack}\n${loopSrc}\n${createSrc}`), 'floor reject helpers reachable');

// Invent-demo is REMOVED — scaffold stays bare; craft invents from brief.
// Genre detect + empty compose still must prove no host twin can ship.
check(detectInventGenre('Japanese knife shop gyuto') === 'cutlery', 'genre cutlery');
const knife = composeInventDemoSite({
  brand: 'Harbor Blade Co',
  brief: 'premium Japanese knife shop gyuto santoku with forge story',
});
check(Object.keys(knife.files || {}).length === 0, 'knife invent-demo empty (no host twin)', knife.note);
check(/removed|invent from brief/i.test(knife.note || ''), 'knife invent-demo removed note');

const game = composeInventDemoSite({
  brand: 'Neon Circuit',
  brief: 'browser arcade game canvas score HUD lives start button game loop',
});
check(Object.keys(game.files || {}).length === 0, 'game invent-demo empty (craft owns UI)', game.note);
const gameFloor = codingQualityFloorHit(game.files);
check(!gameFloor.hit, 'empty invent-demo not storefront floor', gameFloor.reasons.join(','));

const util = composeInventDemoSite({
  brand: 'TaskLite',
  brief: 'todo utility app localStorage add complete delete — not a storefront',
});
check(Object.keys(util.files || {}).length === 0, 'utility invent-demo empty (no twin)', util.note);

const dash = composeInventDemoSite({
  brand: 'Northwind Ops',
  brief: 'B2B SaaS analytics dashboard with charts sidebar and KPI cards',
});
check(Object.keys(dash.files || {}).length === 0, 'dashboard invent-demo empty (no shop twin)', dash.note);
check(detectInventGenre('browser arcade game canvas score HUD') === 'game', 'genre game');
check(detectInventGenre('todo utility app localStorage') === 'utility', 'genre utility');
check(detectInventGenre('B2B SaaS analytics dashboard KPI') === 'saas', 'genre saas');

// Pipeline formatter must be stable for UI.
const sample = formatCodingPipelineProgress('craft');
check(/craft/i.test(sample) && /understand→prep/i.test(sample), 'formatCodingPipelineProgress', sample);

if (fail) {
  console.error('coding-quality-win failed', fail);
  process.exit(1);
}
console.log('ALL PASS coding-quality-win');
