/**
 * Smoke: createV2 redesign spine — router, firewall, single-coder, loop off.
 */
import { classifyTurn } from '../src/lib/classifyTurn.ts';
import { brainRoleAllowsId } from '../src/lib/brainRoles.ts';
import { resolveCreateEnsembleTeam } from '../src/lib/createEnsemble.ts';
import { briefLooksLikeTodoList } from '../src/lib/createBuildQuality.ts';
import { createWallBudgetMs } from '../src/lib/createRuntime.ts';
import { isCreateV2Active, CREATE_V2_AUTO_OPEN_CODE, CREATE_V2_STREAM_PAINT_FILES } from '../src/lib/createV2.ts';
import { shouldUseNovaCreateBuildLoop } from '../src/lib/novaBuildLoop.ts';
import { getLocalPrefs } from '../src/lib/localPrefs.ts';

const prefs = (() => {
  try { return getLocalPrefs(); } catch { return { agentLoopOnCreate: false, multiModelCreate: false }; }
})();

const todoAsk = 'Build a simple to-do list: add items, check them off, delete them.';
const timerAsk = 'Build a simple timer with start pause reset.';
const twitchAsk = 'I want to build a Twitch clone — are you familiar with that kind of app?';
const cls = classifyTurn(todoAsk, { diskRoot: 'C:\\Users\\thoma\\Documents\\NOVA Projects\\click-counter' });
const timerCls = classifyTurn(timerAsk, {});
const twitchCls = classifyTurn(twitchAsk, {});
const team = resolveCreateEnsembleTeam(
  [
    { id: 'qwen25-coder-7b', status: 'ready', name: 'Coder 7B' },
    { id: 'qwen25-7b', status: 'ready', name: 'Chat 7B' },
    { id: 'qwen2-vl-7b', status: 'ready', name: 'VL 7B' },
    { id: 'uigen-fx-4b', status: 'ready', name: 'UIGEN' },
  ],
  { craftId: 'qwen25-coder-7b', allowMultiHop: false, ramGb: 16 },
);

const report = {
  todoClassify: cls,
  timerClassify: timerCls,
  twitchClassify: twitchCls,
  createV2: isCreateV2Active(),
  agentLoopOnCreate: prefs.agentLoopOnCreate,
  shouldUseLoop: shouldUseNovaCreateBuildLoop(),
  autoOpenCode: CREATE_V2_AUTO_OPEN_CODE,
  streamPaint: CREATE_V2_STREAM_PAINT_FILES,
  ensembleOff: { multiHop: team.multiHop, roles: team.members.map((m) => m.role) },
  wallInf: !Number.isFinite(createWallBudgetMs(todoAsk)),
};

const ok = cls.kind === 'create'
  && timerCls.kind === 'create'
  && twitchCls.kind === 'chat'
  && briefLooksLikeTodoList(todoAsk)
  && brainRoleAllowsId('chat', 'qwen2-vl-7b') === false
  && brainRoleAllowsId('vision', 'qwen2-vl-7b') === true
  && team.multiHop === false
  && team.members.some((m) => m.role === 'craft')
  && CREATE_V2_AUTO_OPEN_CODE === false
  && CREATE_V2_STREAM_PAINT_FILES === false
  && prefs.agentLoopOnCreate === false
  && shouldUseNovaCreateBuildLoop() === false
  && isCreateV2Active() === true;

console.log(JSON.stringify(report, null, 2));
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
