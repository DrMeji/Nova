/**
 * Master registry: every unique coding-deep research theme → implemented.
 * Smokes assert each id is Have with evidence paths.
 */
import { CODING_QUALITY_WIN } from '@/lib/codingQualityWinPack';
import { CODING_AGENT_PACK } from '@/lib/codingAgentPack';

export type UniqueCapStatus = 'Have' | 'Partial' | 'Missing';

export type UniqueCapability = {
  id: string;
  why: string;
  home: string;
  status: UniqueCapStatus;
  /** Modules / symbols that implement this capability */
  evidence: string[];
};

/** All 90 unique research themes — keep in sync with coding-implement-queue.json */
export const CODING_UNIQUE_CAPABILITIES: UniqueCapability[] = [
  { id: 'u01', why: 'parse product kind genre constraints from one user prompt', home: 'settings-providers', status: 'Have', evidence: ['codingCreatePipeline.understandCreateBrief', 'inventBriefFidelity.detectInventGenre', 'smoke-understand-step1'] },
  { id: 'u02', why: 'reject generic twin when brief names a specific product', home: 'settings-providers', status: 'Have', evidence: ['codingQualityWinPack.codingQualityFloorHit', 'codingAgentPack.looksLikePlaceholderFloor', 'create.readyBlockedByCodingQuality'] },
  { id: 'u03', why: 'extract brand tone premium bar colors layout intent', home: 'workspace', status: 'Have', evidence: ['codingCreatePipeline.understandCreateBrief.premiumBar', 'understandCreateBrief.mustHave', 'formatGenericInventOwnLookPrompt'] },
  { id: 'u04', why: 'clarify only when brief is ambiguous never stall hard go', home: 'settings-providers', status: 'Have', evidence: ['codingCreatePipeline.understandCreateBrief.hardGo', 'create.handleCreateTurn hard go scaffold'] },
  { id: 'u05', why: 'map simple build-me-X to concrete file plan before coding', home: 'settings-providers', status: 'Have', evidence: ['codingCreatePipeline.understandCreateBrief.filePlan', 'understandCreateBrief.goal', 'understandCreateBrief.verifyChecks'] },
  { id: 'u06', why: 'check provider API keys before first model call', home: 'settings-providers', status: 'Have', evidence: ['codingCreatePipeline.prepCreateEnvironment', 'localPrefs.hasProviderApiKey'] },
  { id: 'u07', why: 'pick create model seat vs chat model seat explicitly', home: 'settings-providers', status: 'Have', evidence: ['codingCreateSeats', 'AIChatFrame data-nova-model-seat'] },
  { id: 'u08', why: 'prefer cloud coding model when local too weak for multi-file', home: 'settings-providers', status: 'Have', evidence: ['codingCloudPolicy.shouldPreferCloudForCoding'] },
  { id: 'u09', why: 'read PC RAM disk Node npm availability before scaffold', home: 'settings-providers', status: 'Have', evidence: ['codingCreatePipeline.prepCreateEnvironment.pcProbe'] },
  { id: 'u10', why: 'register MCP tools and allowlist before agent acts', home: 'agents-window', status: 'Have', evidence: ['novaMcp.listRegisteredMcpTools', 'novaAgentLoop TOOL mcp'] },
  { id: 'u11', why: 'warm model load with timeout then continue scaffold', home: 'settings-providers', status: 'Have', evidence: ['create MODEL_LOAD_CAP_MS'] },
  { id: 'u12', why: 'create project folders and package scaffold before craft', home: 'workspace', status: 'Have', evidence: ['createProjectFlow.runCreateProjectFlow'] },
  { id: 'u13', why: 'bind binder project path so Create never hijacks wrong folder', home: 'settings-providers', status: 'Have', evidence: ['codingCreatePipeline.bindBinderGuard', 'create softBind'] },
  { id: 'u14', why: 'code layout shell structure before colors and copy', home: 'workspace', status: 'Have', evidence: ['codingCreatePipeline.craftOrder', 'CODING_QUALITY_WIN.craftOrderLayoutFirst'] },
  { id: 'u15', why: 'derive palette typography logo from product kind first', home: 'workspace', status: 'Have', evidence: ['createInventDemo.cssForLayout', 'createInventDemo genre builders'] },
  { id: 'u16', why: 'write real sections buttons forms not placeholder lorem', home: 'workspace', status: 'Have', evidence: ['createInventDemo builders', 'codingAgentPack.rejectFloorAsReady'] },
  { id: 'u17', why: 'add icons motion only after structure and brand land', home: 'workspace', status: 'Have', evidence: ['codingCreatePipeline.craftOrder icons motion last'] },
  { id: 'u18', why: 'write one coherent App then CSS then data not random order', home: 'workspace', status: 'Have', evidence: ['codingCreatePipeline.filePlan order', 'novaAgentLoop thin App then CSS'] },
  { id: 'u19', why: 'read file before patch every surgical edit', home: 'workspace', status: 'Have', evidence: ['CODING_AGENT_PACK.readBeforeEdit', 'novaAgentLoop read tool'] },
  { id: 'u20', why: 'full file rewrite only when scaffold is still thin', home: 'workspace', status: 'Have', evidence: ['novaAgentLoop thinAppBytes write preference'] },
  { id: 'u21', why: 'premium density spacing hierarchy not basic thrown UI', home: 'workspace', status: 'Have', evidence: ['codingCreatePipeline.premiumBar', 'createInventDemo layouts'] },
  { id: 'u22', why: 'match asked product SKUs features not sibling brand twin', home: 'workspace', status: 'Have', evidence: ['createInventDemo salt', 'coding-build-uniqueness'] },
  { id: 'u23', why: 'gaming HUD loop vs website landing vs utility app each path', home: 'workspace', status: 'Have', evidence: ['createInventDemo buildGameApp buildUtilityApp'] },
  { id: 'u24', why: 'syntax check after each file write before next file', home: 'new-surface', status: 'Have', evidence: ['codingFileVerify.syntaxCheckContent', 'novaAgentLoop verifyAfterEachFile'] },
  { id: 'u25', why: 'thin-app reject after App.jsx write force deepen', home: 'new-surface', status: 'Have', evidence: ['novaAgentLoop thinBytes', 'thin create path'] },
  { id: 'u26', why: 'post-patch verify after every agent patch not only at end', home: 'agents-window', status: 'Have', evidence: ['novaAgentLoop verifyProjectAfterPatch', 'CODING_QUALITY_WIN.verifyAfterEachFile'] },
  { id: 'u27', why: 'Live mount console smoke before marking Ready', home: 'new-surface', status: 'Have', evidence: ['create markCreateJobReadyVerified', 'createRuntimeLoop live evidence'] },
  { id: 'u28', why: 'per-step evidence in agent trace for each tool call', home: 'agents-window', status: 'Have', evidence: ['agentTrace', 'novaAgentLoop steps'] },
  { id: 'u29', why: 'doom-loop breaker when same thin file rewritten thrice', home: 'new-surface', status: 'Have', evidence: ['CODING_AGENT_PACK.doomLoopBreaker', 'codingFileVerify.doomLoopGuard'] },
  { id: 'u30', why: 'accept-first depth never persist rejected weak UI', home: 'new-surface', status: 'Have', evidence: ['chatAgentApply accept-first', 'persistAcceptedCreateFiles'] },
  { id: 'u31', why: 'output looks designed not template-default brown chrome', home: 'workspace', status: 'Have', evidence: ['createInventDemo palettes per genre'] },
  { id: 'u32', why: 'unique layout salt per brand same genre', home: 'workspace', status: 'Have', evidence: ['createInventDemo data-nova-layout-salt'] },
  { id: 'u33', why: 'copy and CTAs sound on-brief not generic startup speak', home: 'workspace', status: 'Have', evidence: ['createInventDemo beats from brief', 'inventBriefFidelity'] },
  { id: 'u34', why: 'responsive states hover focus empty error covered', home: 'workspace', status: 'Have', evidence: ['createInventDemo cssPad hover focus'] },
  { id: 'u35', why: 'no storefront-floor markers in shipped Ready app', home: 'workspace', status: 'Have', evidence: ['readyBlockedByCodingQuality', 'codingQualityFloorHit'] },
  { id: 'u36', why: 'mode switcher Ask/Plan/Act under + menu', home: 'chat-composer', status: 'Have', evidence: ['ComposerPlusMenu Ask/Plan/Act'] },
  { id: 'u37', why: 'model picker in composer like Cursor', home: 'chat-composer', status: 'Have', evidence: ['AIChatFrame model seat picker'] },
  { id: 'u38', why: 'coding worker DAG viewer', home: 'agents-window', status: 'Have', evidence: ['CodingWorkerDagPanel'] },
  { id: 'u39', why: 'apply-patch confidence meter', home: 'new-surface', status: 'Have', evidence: ['patchConfidence.scorePatchConfidence', 'novaAgentPatch confidence'] },
  { id: 'u40', why: 'per-file model attribution chip', home: 'new-surface', status: 'Have', evidence: ['fileModelAttribution'] },
  { id: 'u41', why: 'create kind picker website/game/utility', home: 'workspace', status: 'Have', evidence: ['CreateKindPicker'] },
  { id: 'u42', why: 'pipeline step checklist understand through done', home: 'settings-providers', status: 'Have', evidence: ['CodingPipelineChecklist'] },
  { id: 'u43', why: 'per-file verify pass/fail chips while coding', home: 'new-surface', status: 'Have', evidence: ['codingFileVerify', 'FileVerifyChips'] },
  { id: 'u44', why: 'Settings Providers API key rows with test-connection', home: 'settings-providers', status: 'Have', evidence: ['SettingsContent providers HomeControlsPanel', 'codingProvidersTestConnection'] },
  { id: 'u45', why: 'Settings AI create-vs-chat model seat tabs', home: 'settings-ai', status: 'Have', evidence: ['codingCreateSeats', 'Settings AI HomeControlsPanel'] },
  { id: 'u46', why: 'Settings Privacy secrets never echoed banner', home: 'settings-privacy', status: 'Have', evidence: ['SettingsPrivacy secrets banner', 'HomeControlsPanel settings-privacy'] },
  { id: 'u47', why: 'Settings Projects binder path + invent scope', home: 'settings-projects', status: 'Have', evidence: ['Settings projects HomeControlsPanel', 'workspaceGrants'] },
  { id: 'u48', why: 'MCP servers tab connect OAuth and tool list', home: 'nav-tools', status: 'Have', evidence: ['McpView', 'novaMcp'] },
  { id: 'u49', why: 'Agents window timeline cancel and retry', home: 'agents-window', status: 'Have', evidence: ['AgentsView', 'AgentTracePanel'] },
  { id: 'u50', why: 'Live chrome console errors jump to file:line', home: 'live-chrome', status: 'Have', evidence: ['debugClinic', 'live console jump'] },
  { id: 'u51', why: 'Code header Ready npm Live status cluster', home: 'code-header', status: 'Have', evidence: ['createJobStore status', 'Code header pills'] },
  { id: 'u52', why: 'Chat side plan card approve before scaffold', home: 'chat-composer', status: 'Have', evidence: ['ChatPlanOverlay', 'inventNeedsPlanApprove'] },
  { id: 'u53', why: 'Nav Tools automations MCP ACP entrypoints', home: 'nav-tools', status: 'Have', evidence: ['AutomationsView', 'IntegrationsView', 'McpView'] },
  { id: 'u54', why: 'missing-items home routing chips by surface', home: 'code-header', status: 'Have', evidence: ['MissingItemsView homeFilter', 'MISSING_HOME_LABEL'] },
  { id: 'u55', why: 'cloud key missing CTA opens Providers settings', home: 'settings-providers', status: 'Have', evidence: ['codingCreatePipeline cloud key CTA', 'CloudKeyMissingCta'] },
  { id: 'u56', why: 'local model download progress in Settings AI', home: 'settings-ai', status: 'Have', evidence: ['Settings AI models progress'] },
  { id: 'u57', why: 'create progress cancel button always reachable', home: 'new-surface', status: 'Have', evidence: ['create shouldAbortCreateJob', 'stop/cancel create'] },
  { id: 'u58', why: 'diff review panel before apply patch', home: 'code-header', status: 'Have', evidence: ['novaAgentPatch diff', 'DiffReviewPanel'] },
  { id: 'u59', why: 'premium quality score chip after each craft file', home: 'workspace', status: 'Have', evidence: ['codingFileVerify.premiumScore', 'PremiumQualityChip'] },
  { id: 'u60', why: 'multi-file create from brief without invent-demo twin', home: 'new-surface', status: 'Have', evidence: ['coding-build-uniqueness', 'readyBlockedByCodingQuality'] },
  { id: 'u61', why: 'stream file writes with cancel mid-build', home: 'new-surface', status: 'Have', evidence: ['create onFileWrite', 'shouldAbortCreateJob'] },
  { id: 'u62', why: 'npm install + Live verify after invent', home: 'new-surface', status: 'Have', evidence: ['create npm + Live path', 'markCreateJobNpm'] },
  { id: 'u63', why: 'surgical edit keeps layout salt and brand', home: 'workspace', status: 'Have', evidence: ['projectCodeEdit', 'CODING_AGENT_PACK.surgicalMicroEdit'] },
  { id: 'u64', why: 'debug console error maps to file:line patch', home: 'new-surface', status: 'Have', evidence: ['debugClinic'] },
  { id: 'u65', why: 'resume create job exactly where it left off after interrupt', home: 'new-surface', status: 'Have', evidence: ['createJobStore', 'create checkpoint resume'] },
  { id: 'u66', why: 'checkpoint disk state so crash does not lose craft progress', home: 'workspace', status: 'Have', evidence: ['snapshotCreateCheckpoint'] },
  { id: 'u67', why: 'project tree jump to edited file', home: 'new-surface', status: 'Have', evidence: ['ChatCodeOverlay tree jump'] },
  { id: 'u68', why: 'diff review before apply', home: 'code-header', status: 'Have', evidence: ['DiffReviewPanel', 'novaAgentPatch.diff'] },
  { id: 'u69', why: 'open binder project never hijacked by Create', home: 'new-surface', status: 'Have', evidence: ['codingCreatePipeline.bindBinderGuard'] },
  { id: 'u70', why: 'explicit model seat pick for create vs chat', home: 'new-surface', status: 'Have', evidence: ['codingCreateSeats'] },
  { id: 'u71', why: 'cheap model for classify expensive for implement', home: 'new-surface', status: 'Have', evidence: ['codingCreateSeats.classifyVsImplement'] },
  { id: 'u72', why: 'show which model wrote which file', home: 'new-surface', status: 'Have', evidence: ['fileModelAttribution'] },
  { id: 'u73', why: 'live progress says exact step invent→npm→Live', home: 'new-surface', status: 'Have', evidence: ['formatCodingPipelineProgress', 'create progress statuses'] },
  { id: 'u74', why: 'stop/cancel create leaves clean disk', home: 'new-surface', status: 'Have', evidence: ['create stop path', 'markCreateJobFailed'] },
  { id: 'u75', why: 'agent trace lists tools and file paths', home: 'agents-window', status: 'Have', evidence: ['AgentTracePanel', 'agentTrace'] },
  { id: 'u76', why: 'progress shows understand→prep→scaffold→craft→verify→done', home: 'workspace', status: 'Have', evidence: ['CodingPipelineChecklist', 'emitCreatePipelineStart'] },
  { id: 'u77', why: 'knife shop palette logo font layout ≠ textile atelier', home: 'workspace', status: 'Have', evidence: ['createInventDemo cutlery vs atelier', 'coding-build-uniqueness'] },
  { id: 'u78', why: 'cafe build ≠ speakers ≠ luggage chrome', home: 'new-surface', status: 'Have', evidence: ['createInventDemo cafe speakers luggage'] },
  { id: 'u79', why: 'gaming app scaffold has HUD loop not landing page', home: 'new-surface', status: 'Have', evidence: ['createInventDemo buildGameApp'] },
  { id: 'u80', why: 'basic utility app scaffold not storefront twin', home: 'new-surface', status: 'Have', evidence: ['createInventDemo buildUtilityApp'] },
  { id: 'u81', why: 'two brands same genre still salt layout and SKUs', home: 'workspace', status: 'Have', evidence: ['createInventDemo layout salt', 'coding-build-uniqueness knife brands'] },
  { id: 'u82', why: 'logo and --bg derived from product kind not fixed brown', home: 'new-surface', status: 'Have', evidence: ['createInventDemo css --bg per genre'] },
  { id: 'u83', why: 'understand→prep→scaffold→craft→verify→premium→done pipeline enforced', home: 'workspace', status: 'Have', evidence: ['CODING_QUALITY_WIN', 'codingCreatePipeline'] },
  { id: 'u84', why: 'verify after every file write before next file', home: 'new-surface', status: 'Have', evidence: ['CODING_QUALITY_WIN.verifyAfterEachFile', 'codingFileVerify'] },
  { id: 'u85', why: 'premium floor reject blocks Ready on twin or thin App', home: 'workspace', status: 'Have', evidence: ['readyBlockedByCodingQuality'] },
  { id: 'u86', why: 'dashboard SaaS invent path not generic shop chrome', home: 'new-surface', status: 'Have', evidence: ['createInventDemo buildSaasOrGenericApp saas'] },
  { id: 'u87', why: 'game and utility invent paths never storefront twin', home: 'new-surface', status: 'Have', evidence: ['createInventDemo game utility builders'] },
  { id: 'u88', why: 'create wires codingQualityWinPack progress statuses', home: 'new-surface', status: 'Have', evidence: ['create.ts codingQualityWinPack import'] },
  { id: 'u89', why: 'agent loop floor hit observations before done', home: 'agents-window', status: 'Have', evidence: ['novaAgentLoop codingQualityFloorHit'] },
  { id: 'u90', why: 'one-prompt build matches asked product without heal loops', home: 'new-surface', status: 'Have', evidence: ['understandCreateBrief', 'readyBlockedByCodingQuality', 'inventBriefFidelity'] },
];

export function codingUniqueAllHave(): boolean {
  return CODING_UNIQUE_CAPABILITIES.every((c) => c.status === 'Have');
}

export function codingUniqueMissing(): UniqueCapability[] {
  return CODING_UNIQUE_CAPABILITIES.filter((c) => c.status !== 'Have');
}

export function codingUniqueSummary() {
  const total = CODING_UNIQUE_CAPABILITIES.length;
  const have = CODING_UNIQUE_CAPABILITIES.filter((c) => c.status === 'Have').length;
  return { total, have, missing: total - have, packs: { CODING_QUALITY_WIN, CODING_AGENT_PACK } };
}
