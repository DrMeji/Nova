/**
 * Unified studio answer engine. Chat (and later Code) sticky-folder replies.
 * One path: classify hint → optional local scan → fresh packed context → scan format and/or streamed model.
 * Never show system scaffolding in user-visible text. Never reuse prior prose as the next answer.
 */

import { arkRoute, routerProviderLabel } from '@/lib/arkRouter';
import { buildRouterHistory, looksLikePromptEcho } from '@/lib/chatHistory';
import { getLocalPrefs } from '@/lib/localPrefs';
import {
  STUDIO_FIX_ASK_RE,
  STUDIO_WIDER_RE,
} from '@/lib/chatStudio';
import {
  coerceCodingFileReply,
  flattenProjectFiles,
  rankFilesForTurnPack,
  classifyCodeTurnSize,
  type ProjectFileMap,
} from '@/lib/projectCodeEdit';
import {
  collectProjectFindings,
  describeProjectFromFiles,
  describeProjectInDetail,
  isBuildArtifactPath,
  reportProjectFocusAsk,
  reportProjectProblems,
  type InspectFinding,
} from '@/lib/projectInspect';
import { looksLikeProjectDebugAsk } from '@/lib/chatProjectDebug';
import { looksLikeProductCorrectionAsk } from '@/lib/chatBuildIntent';
import { shouldPreferCloudForCoding, countSourceFiles } from '@/lib/codingCloudPolicy';
import { estimateTokens } from '@/lib/tokenUsage';

export type StudioIntent =
  | 'overview'
  | 'debug'
  | 'security'
  | 'problems'
  | 'fix'
  | 'recommend'
  | 'wider'
  | 'ui'
  | 'security-ui'
  | 'file-detail'
  | 'freeform';

export type StudioAnswerInput = {
  userMessage: string;
  files: ProjectFileMap;
  projectName?: string;
  lastIntent?: StudioIntent | null;
  lastFindings?: InspectFinding[];
  mode?: 'chat' | 'code';
  preferredModelId?: string;
  preferredModelName?: string;
  preferredSource?: string;
  stickyModelId?: string;
  stickyModelName?: string;
  stickyPinnedSource?: string;
  /** Abort if returns true (e.g. genSeq changed / stop). */
  shouldAbort?: () => boolean;
  /** Plan-only turn. no file writes until user says go. */
  planOnly?: boolean;
  /** User asked to implement. model may emit @@@FILE blocks. */
  allowFileEdits?: boolean;
};

export type StudioAnswerResult = {
  text: string;
  intent: StudioIntent;
  findings?: InspectFinding[];
  meta?: string;
  streamed?: boolean;
  packedTokens?: number;
};

const SMALLTALK_RE =
  /^(hi|hello|hey|yo|sup|howdy|thanks|thank you|ok|okay|cool|nice|sure)[.!\s]*$/i;

const STUDIO_RECOMMEND_RE =
  /\b(i want (some |a )?recommendations?|recommendations?\b|what (do you |would you )?recommend|where (should|do|to) (we|i|you) start|where (do you think )?(we|i) should start|what (should|do) (we|i) (do )?first|recommend(ed)? (next|first)|priorit(y|ize)|next step)\b/i;

const PACK_BUDGET = 40_000;
const PACK_BUDGET_CODE = 10_000;
const PACK_FILE_CHARS = 4_500;
const PACK_FILE_CHARS_CODE = 2_600;
const PACK_MAX_FILES_CODE = 12;
const MODEL_TIMEOUT_MS = 90_000;
/** Debug/fix coding turns — keep snappy (under ~30–60s feel for small edits). */
const MODEL_TIMEOUT_CODE_MS = 120_000;
/** Full website / app / game creates — allow up to ~5 minutes per model pass. */
const MODEL_TIMEOUT_BUILD_MS = 300_000;
/** Micro follow-ups after surgical miss — never 300s. */
const MODEL_TIMEOUT_MICRO_MS = 45_000;

function looksLikeMicroCodingAsk(message: string): boolean {
  const t = String(message || '');
  if (/\b(?:scrap|rebuild|from scratch|make it richer|redesign|entire)\b/i.test(t)) return false;
  return /\b(?:title|heading|h1|center|footer|color|background|button|text|label|copy|logo)\b/i.test(t)
    || (/^\s*(?:add|put|place|change|update|make|set|rename)\b/i.test(t) && t.length < 220);
}

function cleanAsk(message: string): string {
  return String(message || '')
    .replace(/<!--ark-attach:[\s\S]*?-->/g, '')
    .replace(/<!--ark-auto-read-->/g, '')
    .replace(/^[\[](?:Plan|Ask|Debug|Tasks)[\]]\s*/i, '')
    .trim();
}

/** Strip any leaked scaffolding if a model echoes instructions. */
export function stripStudioMeta(text: string): string {
  return String(text || '')
    .replace(/^ANSWER THE USER QUESTION FIRST\.?\s*/gim, '')
    .replace(/^User asked:\s*[\u201c"][^\u201d"]*[\u201d"]\s*/gim, '')
    .replace(/\(not a product overview\)\s*/gi, '')
    .replace(/^CRITICAL RULES[\s\S]*?User:\s*/i, '')
    .trim();
}

export function classifyStudioIntent(
  message: string,
  last?: StudioIntent | null,
): StudioIntent {
  const ask = cleanAsk(message);
  if (!ask) return 'freeform';
  if (SMALLTALK_RE.test(ask) && ask.length < 24) return 'freeform';

  // Product corrections must rebuild files — never become a Local scan.
  if (looksLikeProductCorrectionAsk(String(message || ''))) return 'freeform';

  if (looksLikeProjectDebugAsk(String(message || ''))) return 'debug';
  if (STUDIO_WIDER_RE.test(ask)) return 'wider';
  if (STUDIO_FIX_ASK_RE.test(ask) || /^(fix|how)\??$/i.test(ask) || /\bfix\s*#?\s*\d+\b/i.test(ask)) {
    return 'fix';
  }
  if (STUDIO_RECOMMEND_RE.test(ask)) return 'recommend';

  if (last && (last === 'security' || last === 'debug' || last === 'problems' || last === 'wider' || last === 'ui')) {
    if (/^(yes|ok|okay|go on|continue|go deeper)\b/i.test(ask)) return last === 'ui' ? 'debug' : last;
  }

  const hasSecurity = /\b(security|securit|vulnerab|xss|injection|secret|secrets|malware|eval\b|exploit|cve)\b/i.test(ask);
  if (
    /\b(?:ui|ux|user interface|layout|screen|button|design|looks?)\b/i.test(ask)
    && /\b(problem|issue|bug|broken|wrong|risk|fix|improve|bad)\b/i.test(ask)
    && !looksLikeProductCorrectionAsk(String(message || ''))
  ) {
    // keep hasUi false for product-type corrections handled above
  }
  const hasUi = /\b(ui|ux|user interface|layout|screen|button|design|looks?)\b/i.test(ask)
    && /\b(problem|issue|bug|broken|wrong|risk|fix|improve|bad)\b/i.test(ask)
    && !/\b(?:scrap|rebuild|actual\s+game|not\s+what\s+i\s+asked|turn\s+(?:this|it)\s+into)\b/i.test(ask);
  if (hasSecurity && hasUi) return 'security-ui';
  if (hasSecurity) return 'security';
  if (hasUi) return 'ui';

  if (
    /^go into more detail about this project/i.test(ask)
    || /\bwhat the main files do and how they connect\b/i.test(ask)
    || (
      /\b(more details?|go deeper|full details?)\b/i.test(ask)
      && !/\b(security|fix|problem|bug|issue|scan)\b/i.test(ask)
    )
  ) {
    return 'file-detail';
  }

  if (
    /\b(what (is|are) this (project|folder|app)|what.?s this (project|folder)|tell me about this (project|folder)|whole (folder|project)|all about)\b/i.test(ask)
    || /\bwhat (am i|i'?m|im) (trying to )?build\b/i.test(ask)
    || /\b(can you |do you )?see (exactly )?what (i'?m|im|i am|i) (trying to )?build\b/i.test(ask)
  ) {
    return 'overview';
  }

  if (
    /\bdebug\b/i.test(ask) && /\b(folder|project|this|code|app)\b/i.test(ask)
    || /\bdebug this\b/i.test(ask)
    || /^\[debug\]/i.test(String(message || '').trim())
    || /\bfind bugs, risky code\b/i.test(ask)
    || /\bpropose a concrete fix for each\b/i.test(ask)
  ) {
    return 'debug';
  }

  if (
    /\blist the most likely problems\b/i.test(ask)
    || /\bfind (the )?most likely problems\b/i.test(ask)
    || /\b(find (bugs|problems|issues)|any (bugs|problems|issues)|most likely problems|risky code|broken paths)\b/i.test(ask)
  ) {
    return 'problems';
  }

  return 'freeform';
}

function scanFocusForIntent(intent: StudioIntent): 'all' | 'security' | 'ui' | 'wider' {
  if (intent === 'security' || intent === 'security-ui') return 'security';
  if (intent === 'ui') return 'ui';
  if (intent === 'wider') return 'wider';
  return 'all';
}

function formatRecommend(
  findings: InspectFinding[],
  projectName: string | undefined,
  fileCount: number,
): string {
  const label = projectName && !/^code$/i.test(projectName) ? `**${projectName}**` : 'this folder';
  if (!findings.length) {
    return [
      `For ${label} (${fileCount} source files), I don\u2019t have prior scan hits to prioritize.`,
      '',
      '**Recommended first:** run **Find problems** or **Debug**, then ask again. I\u2019ll rank those findings.',
      '',
      'Or tell me a goal (ship safer, clean UI, finish stubs) and I\u2019ll pick a starting file.',
    ].join('\n');
  }
  const top = findings.slice(0, 5);
  const bits: string[] = [
    `Here\u2019s what I\u2019d tackle first in ${label}, based on the latest scan:`,
    '',
  ];
  top.forEach((f, i) => {
    const why = i === 0
      ? 'Highest leverage / risk. fix this before polishing elsewhere.'
      : i === 1
        ? 'Next most important after #1.'
        : 'Worth doing once the top items are clear.';
    bits.push(`${i + 1}. \`${f.path}\`. ${f.detail}`);
    bits.push(`   **Why first:** ${why}`);
    bits.push('');
  });
  bits.push('Say **how can we fix #1** (or Edit in Code) when you\u2019re ready.');
  return bits.join('\n');
}

export function packStudioContext(input: StudioAnswerInput): {
  system: string;
  user: string;
  findings: InspectFinding[];
  prompt: string;
  packedTokens: number;
} {
  const ask = cleanAsk(input.userMessage);
  const intent = classifyStudioIntent(input.userMessage, input.lastIntent);
  const flat = flattenProjectFiles(input.files);
  const sourceKeys = Object.keys(flat).filter(k => !isBuildArtifactPath(k));
  const focus = scanFocusForIntent(intent);
  const findings = (input.lastFindings && input.lastFindings.length && (intent === 'fix' || intent === 'recommend'))
    ? input.lastFindings
    : collectProjectFindings(input.files, focus === 'wider' ? 'wider' : focus === 'security' ? 'security' : focus === 'ui' ? 'ui' : 'all', ask);

  const handsFreeDebug = looksLikeProjectDebugAsk(input.userMessage);
  const turnSize = handsFreeDebug ? 'full' : classifyCodeTurnSize(ask, input.files);
  const maxFiles = input.mode === 'code'
    ? (handsFreeDebug ? 16 : PACK_MAX_FILES_CODE)
    : turnSize === 'micro' ? 6 : turnSize === 'small' ? 12 : 24;
  const picked = rankFilesForTurnPack(flat, ask, turnSize).slice(0, maxFiles);
  const packBudget = input.mode === 'code'
    ? (handsFreeDebug ? 16_000 : PACK_BUDGET_CODE)
    : PACK_BUDGET;
  const packFileChars = input.mode === 'code'
    ? (handsFreeDebug ? 3_600 : PACK_FILE_CHARS_CODE)
    : PACK_FILE_CHARS;
  let used = 0;
  const chunks: string[] = [];
  for (const path of picked) {
    const content = flat[path];
    if (!content) continue;
    const body = content.length > packFileChars
      ? `${content.slice(0, packFileChars)}\n/* …truncated… */`
      : content;
    const block = `--- ${path} ---\n${body}`;
    if (used + block.length > packBudget) break;
    chunks.push(block);
    used += block.length;
  }

  const tree = sourceKeys.sort().slice(0, input.mode === 'code' ? 48 : 100).join('\n');
  const findingsBlock = findings.length
    ? `Optional prior findings from local scan:\n${findings.map(f => `- ${f.path}: ${f.detail}`).join('\n')}`
    : 'Optional prior findings from local scan: (none yet)';

  const wantsFullUiBuild = input.allowFileEdits && (
    /\b(?:build|create|rewrite|first real ui|@@@file|scaffold|from this brief)\b/i.test(ask)
    || /\bsrc\/App\.(jsx|tsx)\b/i.test(ask)
  );
  const fileRule = input.planOnly
    ? 'PLAN ONLY. output a step-by-step plan. No @@@FILE blocks, no file writes. End with: Say "go implement" when you want me to build this.'
    : input.allowFileEdits
      ? handsFreeDebug
        ? 'Hands-free debug: start with 2-4 sentences naming the root cause (file in backticks + why it breaks). Then emit @@@FILE blocks with COMPLETE updated file contents for every file you change. Do not stop at a checklist. Keep edits surgical. After the files, add ONE short sentence on how to verify.'
        :         wantsFullUiBuild
          ? [
            'BUILD THE PRODUCT UI NOW. Do not describe it. Do not summarize the plan.',
            'Emit @@@FILE blocks with COMPLETE file contents for src/App.jsx (or App.tsx), src/App.css, and src/index.css at minimum.',
            'Every @@@FILE line must include a path (@@@FILE src/App.jsx). Never emit a bare @@@FILE.',
            'Prefer a single App.jsx with all sections inline. Do not import missing ./components/* files.',
            'App.jsx must be a real interactive UI matching the brief — never an empty <div className="app" />, never a single search box, never placeholder "Ask NOVA" copy.',
            'Take the time needed: aim for a substantial App (roughly 150+ lines / 2500+ characters of real JSX) with multiple sections, real controls, and polished CSS (hundreds of lines of CSS when the brief is a rich site).',
            'Do not stop early with a minimal form+list stub when the brief asks for a full product or marketing-quality site.',
            'After the files, add ONE short plain-English sentence only (no code fences).',
          ].join(' ')
          : 'The user wants you to CHANGE THE CODE NOW. Emit @@@FILE blocks with COMPLETE file contents for every file you change. Do not only describe the change. Keep edits surgical. only files that need to change. After the files, add ONE short plain-English sentence (no code fences, no file dumps). Example: "Added the logo centered on screen."'
      : 'Do NOT write @@@FILE blocks. Do not dump whole files.';

  const system = [
    'You can see the attached project files. Never say you cannot see them.',
    'Never ask the user to paste code.',
    'Answer ONLY about this codebase. No world news, climate, politics, or generic life advice.',
    'Answer the user\u2019s question directly and specifically.',
    'If unsure, say what you inspected. Do not invent issues.',
    fileRule,
    'Never output lines like \u201cANSWER THE USER QUESTION FIRST\u201d or \u201cUser asked:\u201d.',
  ].join(' ');

  const intentHint =
    intent === 'fix' ? 'They want concrete how-to-fix steps for the findings.'
      : intent === 'recommend' ? 'They want prioritized next steps grounded in findings and files.'
        : intent === 'debug' ? 'They want bugs/risks with file paths and brief fix hints.'
          : intent === 'overview' ? 'They want what this project is and who it is for.'
            : intent === 'freeform' ? 'Answer exactly what they asked using the files.'
              : 'Answer their ask from the files.';

  const user = [
    `Question: ${ask}`,
    '',
    `Project: ${input.projectName || 'Attached project'}`,
    `Intent hint: ${intent}. ${intentHint}`,
    '',
    'File tree (summary):',
    tree || '(empty)',
    '',
    findingsBlock,
    '',
    'Relevant file excerpts:',
    chunks.join('\n\n') || '(no excerpts. say re-attach the folder)',
  ].join('\n');

  const prompt = `${system}\n\n${user}`;
  return { system, user, findings, prompt, packedTokens: estimateTokens(prompt) };
}

function usesLocalScan(intent: StudioIntent): boolean {
  return intent === 'security' || intent === 'problems' || intent === 'wider'
    || intent === 'ui' || intent === 'security-ui';
}

function prefersModel(intent: StudioIntent): boolean {
  return intent === 'debug' || intent === 'fix' || intent === 'recommend'
    || intent === 'freeform' || intent === 'overview' || intent === 'file-detail';
}

function localScanAnswer(
  intent: StudioIntent,
  files: ProjectFileMap,
  projectName: string | undefined,
  findings: InspectFinding[],
  ask: string,
): string {
  if (intent === 'wider') {
    return reportProjectProblems(files, projectName, 'wider', { wider: true });
  }
  if (intent === 'security' || intent === 'ui' || intent === 'security-ui') {
    return reportProjectFocusAsk(files, projectName, intent === 'ui' ? 'ui' : intent === 'security-ui' ? 'security-ui' : 'security');
  }
  if (intent === 'fix') {
    return reportProjectProblems(files, projectName, 'debug', {
      focusFix: true,
      priorFindings: findings.length ? findings : undefined,
    });
  }
  if (intent === 'recommend') {
    const flat = flattenProjectFiles(files);
    const count = Object.keys(flat).filter(k => !isBuildArtifactPath(k)).length;
    return formatRecommend(findings, projectName, count || Object.keys(flat).length);
  }
  if (intent === 'problems') {
    return reportProjectProblems(files, projectName, 'all');
  }
  if (intent === 'debug') {
    const handsFree = looksLikeProjectDebugAsk(ask) || /\b(find why|root cause|fix it|fix this)\b/i.test(ask);
    return reportProjectProblems(files, projectName, 'debug', {
      focusFix: handsFree,
      userQuestion: ask,
    });
  }
  if (intent === 'file-detail') {
    return describeProjectInDetail(files, projectName);
  }
  let spoken = describeProjectFromFiles(files, projectName);
  if (/\b(can you |do you )?see\b/i.test(ask) || /\bwhat (am i|i'?m)/i.test(ask)) {
    const n = Object.keys(flattenProjectFiles(files)).length;
    spoken = `Yes. I can see **${n} file${n === 1 ? '' : 's'}** from **${projectName || 'this folder'}** in this chat.\n\n${spoken}`;
  }
  return spoken;
}

function hasFileEditBlocks(text: string): boolean {
  const raw = String(text || '');
  if (/@@@FILE\b/i.test(raw) || /<<<<<<< SEARCH/.test(raw) || /\bPATH:\s*\S+/i.test(raw)) return true;
  return /@@@FILE\b/i.test(coerceCodingFileReply(raw));
}

function preferFileBearingText(...candidates: string[]): string {
  for (const c of candidates) {
    const coerced = coerceCodingFileReply(String(c || '').trim());
    if (hasFileEditBlocks(coerced)) return coerced;
  }
  return String(candidates.find((c) => String(c || '').trim()) || '').trim();
}

export async function answerStudio(
  input: StudioAnswerInput,
  onDelta?: (text: string) => void,
): Promise<StudioAnswerResult> {
  const ask = cleanAsk(input.userMessage);
  // File-edit / create-UI turns must always hit the model — never Local scan.
  const intent = input.allowFileEdits
    ? 'freeform'
    : classifyStudioIntent(input.userMessage, input.lastIntent);
  const packed = packStudioContext({ ...input, userMessage: ask });
  let findings = packed.findings;
  const packedTokens = packed.packedTokens;

  if (!input.allowFileEdits && usesLocalScan(intent) && !prefersModel(intent)) {
    const text = stripStudioMeta(localScanAnswer(intent, input.files, input.projectName, findings, ask));
    return {
      text,
      intent,
      findings,
      meta: 'Local scan \u00b7 attached files',
      streamed: false,
      packedTokens,
    };
  }

  if (!input.allowFileEdits && (intent === 'fix' || intent === 'recommend') && findings.length) {
    const structured = stripStudioMeta(localScanAnswer(intent, input.files, input.projectName, findings, ask));
    return {
      text: structured,
      intent,
      findings,
      meta: 'Local scan \u00b7 attached files',
      streamed: false,
      packedTokens,
    };
  }

  if (!input.allowFileEdits && (intent === 'overview' || intent === 'file-detail')) {
    const text = stripStudioMeta(localScanAnswer(intent, input.files, input.projectName, findings, ask));
    return {
      text,
      intent,
      findings,
      meta: 'Local scan \u00b7 attached files',
      streamed: false,
      packedTokens,
    };
  }

  if (input.shouldAbort?.()) {
    return {
      text: input.allowFileEdits
        ? ''
        : stripStudioMeta(localScanAnswer(intent, input.files, input.projectName, findings, ask)),
      intent,
      findings,
      meta: 'Local scan \u00b7 attached files',
      streamed: false,
      packedTokens,
    };
  }

  const prefs = getLocalPrefs();
  let streamed = '';
  const history = buildRouterHistory([], packed.prompt, undefined, {
    keepContinuity: false,
    kind: 'coding',
  });

  try {
    const routeKind = (input.mode === 'code' || input.allowFileEdits) ? 'coding' : 'chat';
    const timeoutMs = input.allowFileEdits
      ? (looksLikeMicroCodingAsk(input.userMessage) ? MODEL_TIMEOUT_MICRO_MS : MODEL_TIMEOUT_CODE_MS)
      : routeKind === 'coding' && looksLikeProjectDebugAsk(input.userMessage)
        ? MODEL_TIMEOUT_CODE_MS
        : MODEL_TIMEOUT_MS;
    const routePromise = arkRoute({
      message: packed.prompt,
      kind: routeKind,
      preferCloudCoding: shouldPreferCloudForCoding({
        fileCount: countSourceFiles(input.files),
        message: input.userMessage,
        allowFileEdits: input.allowFileEdits,
      }),
      preferredModelId: input.preferredModelId,
      preferredModelName: input.preferredModelName,
      preferredSource: input.preferredSource as 'local' | 'cloud' | 'auto' | undefined,
      stickyModelId: input.stickyModelId,
      stickyModelName: input.stickyModelName,
      stickyPinnedSource: input.stickyPinnedSource as 'local' | 'cloud' | undefined,
      history,
      onChunk: prefs.streamResponses && onDelta
        ? (piece) => {
          if (input.shouldAbort?.()) return;
          streamed += piece;
          const live = stripStudioMeta(streamed);
          if (live.length < 2 || looksLikePromptEcho(live)) return;
          onDelta(live);
        }
        : undefined,
    });

    const timed = await Promise.race([
      routePromise.then(r => ({ ok: true as const, routed: r })),
      new Promise<{ ok: false }>((resolve) => {
        window.setTimeout(() => resolve({ ok: false }), timeoutMs);
      }),
    ]);

    if (input.shouldAbort?.()) {
      const partial = stripStudioMeta(streamed);
      return {
        text: input.allowFileEdits
          ? (hasFileEditBlocks(partial) ? partial : '')
          : (partial || stripStudioMeta(localScanAnswer(intent, input.files, input.projectName, findings, ask))),
        intent,
        findings,
        meta: 'Local model \u00b7 attached files',
        streamed: Boolean(streamed),
        packedTokens,
      };
    }

    if (!timed.ok) {
      const partial = stripStudioMeta(streamed);
      // Never replace a build turn with Local scan — that wipes @@@FILE blocks mid-stream.
      if (input.allowFileEdits) {
        return {
          text: hasFileEditBlocks(partial) ? partial : '',
          intent,
          findings,
          meta: 'Local model \u00b7 timed out',
          streamed: Boolean(streamed),
          packedTokens,
        };
      }
      const fallback = stripStudioMeta(localScanAnswer(
        intent === 'freeform' ? 'debug' : intent,
        input.files,
        input.projectName,
        findings.length ? findings : collectProjectFindings(input.files, 'all'),
        ask,
      ));
      findings = findings.length ? findings : collectProjectFindings(input.files, 'all');
      return {
        text: fallback,
        intent,
        findings,
        meta: 'Local scan \u00b7 attached files',
        streamed: false,
        packedTokens,
      };
    }

    const routedReply = stripStudioMeta(String(timed.routed.reply || '').trim());
    const fromStream = stripStudioMeta(streamed);
    // Prefer whichever still has file blocks — coerce bare App dumps; don't let prose hops win.
    let spoken = preferFileBearingText(routedReply, fromStream);
    const routerNoModel = /live model connected|install the default local brain|connect free capacity/i.test(spoken);
    const noAccess = routerNoModel || /don'?t have (specific |any )?details|without more context|could you please provide more|i can'?t (see|access|read)|no (access|visibility) to (the )?files|project with the id/i.test(spoken);
    if (noAccess || !spoken || looksLikePromptEcho(spoken)) {
      const partial = stripStudioMeta(streamed);
      if (input.allowFileEdits && hasFileEditBlocks(partial || spoken)) {
        return {
          text: hasFileEditBlocks(spoken) ? spoken : partial,
          intent,
          findings,
          meta: 'Local model \u00b7 attached files',
          streamed: Boolean(streamed),
          packedTokens,
        };
      }
      if (input.allowFileEdits) {
        // Do not invent Local scan. Keep any non-echo spoken text for the caller to retry.
        const keep = (!looksLikePromptEcho(spoken) && spoken && !routerNoModel) ? spoken : '';
        const fromStream = hasFileEditBlocks(partial) ? partial : '';
        spoken = fromStream || keep;
        if (!spoken) {
          // One hard re-ask: file blocks only.
          const retryPrompt = [
            'Output ONLY @@@FILE blocks. No preface. No plan. No questions.',
            'Start with this exact line:',
            '@@@FILE src/App.jsx',
            'Then the full React App source. Then @@@FILE src/App.css and @@@FILE src/index.css.',
            'Build what the user asked for.',
            '',
            ask.slice(0, 2500),
          ].join('\n');
          try {
            let retryStream = '';
            const retryRoute = await arkRoute({
              message: retryPrompt,
              kind: 'coding',
              preferCloudCoding: shouldPreferCloudForCoding({
                fileCount: countSourceFiles(input.files),
                message: ask,
                allowFileEdits: true,
              }),
              preferredModelId: input.preferredModelId,
              preferredModelName: input.preferredModelName,
              preferredSource: input.preferredSource as 'local' | 'cloud' | 'auto' | undefined,
              stickyModelId: input.stickyModelId,
              stickyModelName: input.stickyModelName,
              stickyPinnedSource: input.stickyPinnedSource as 'local' | 'cloud' | undefined,
              history: buildRouterHistory([], retryPrompt, undefined, { keepContinuity: false, kind: 'coding' }),
              onChunk: prefs.streamResponses && onDelta
                ? (piece) => {
                  if (input.shouldAbort?.()) return;
                  retryStream += piece;
                  const live = stripStudioMeta(retryStream);
                  if (live.length < 2) return;
                  onDelta(live);
                }
                : undefined,
            });
            const retryRouted = stripStudioMeta(String(retryRoute.reply || '').trim());
            const retryFromStream = stripStudioMeta(retryStream);
            const retryText = preferFileBearingText(retryRouted, retryFromStream);
            if (hasFileEditBlocks(retryText)) {
              return {
                text: retryText,
                intent,
                findings,
                meta: `${routerProviderLabel(retryRoute, 'Local model')} \u00b7 file retry`,
                streamed: Boolean(retryStream) || prefs.streamResponses,
                packedTokens,
              };
            }
            spoken = retryText;
          } catch {
            /* keep empty */
          }
        }
        return {
          text: hasFileEditBlocks(spoken) ? preferFileBearingText(spoken) : '',
          intent,
          findings,
          meta: hasFileEditBlocks(spoken) ? 'Local model \u00b7 attached files' : 'Local model \u00b7 no file blocks',
          streamed: Boolean(streamed),
          packedTokens,
        };
      }
      if (!findings.length) findings = collectProjectFindings(input.files, 'all');
      spoken = stripStudioMeta(localScanAnswer(
        intent === 'freeform' ? 'debug' : intent,
        input.files,
        input.projectName,
        findings,
        ask,
      ));
      return {
        text: spoken,
        intent,
        findings,
        meta: 'Local scan \u00b7 attached files',
        streamed: false,
        packedTokens,
      };
    }

    // Build turns that described UI but forgot @@@FILE — one hard re-ask.
    if (input.allowFileEdits && !hasFileEditBlocks(spoken)) {
      const retryPrompt = [
        'Your previous reply had no @@@FILE blocks. Try again.',
        'Output ONLY @@@FILE blocks. Start with: @@@FILE src/App.jsx',
        'Then full App source, then @@@FILE src/App.css and @@@FILE src/index.css.',
        '',
        ask.slice(0, 2500),
      ].join('\n');
      try {
        let retryStream = '';
        const retryRoute = await arkRoute({
          message: retryPrompt,
          kind: 'coding',
          preferCloudCoding: shouldPreferCloudForCoding({
            fileCount: countSourceFiles(input.files),
            message: ask,
            allowFileEdits: true,
          }),
          preferredModelId: input.preferredModelId,
          preferredModelName: input.preferredModelName,
          preferredSource: input.preferredSource as 'local' | 'cloud' | 'auto' | undefined,
          stickyModelId: input.stickyModelId,
          stickyModelName: input.stickyModelName,
          stickyPinnedSource: input.stickyPinnedSource as 'local' | 'cloud' | undefined,
          history: buildRouterHistory([], retryPrompt, undefined, { keepContinuity: false, kind: 'coding' }),
          onChunk: prefs.streamResponses && onDelta
            ? (piece) => {
              if (input.shouldAbort?.()) return;
              retryStream += piece;
              const live = stripStudioMeta(retryStream);
              if (live.length < 2) return;
              onDelta(live);
            }
            : undefined,
        });
        const retryRouted = stripStudioMeta(String(retryRoute.reply || '').trim());
        const retryFromStream = stripStudioMeta(retryStream);
        const retryText = preferFileBearingText(retryRouted, retryFromStream);
        if (hasFileEditBlocks(retryText)) {
          return {
            text: retryText,
            intent,
            findings,
            meta: `${routerProviderLabel(retryRoute, 'Local model')} \u00b7 file retry`,
            streamed: Boolean(retryStream) || prefs.streamResponses,
            packedTokens,
          };
        }
      } catch {
        /* keep spoken */
      }
    }

    const label = routerProviderLabel(timed.routed, 'Local model');
    return {
      text: preferFileBearingText(spoken),
      intent,
      findings: findings.length ? findings : collectProjectFindings(input.files, 'all'),
      meta: `${label} \u00b7 attached files`,
      streamed: Boolean(streamed) || prefs.streamResponses,
      packedTokens,
    };
  } catch {
    const partial = stripStudioMeta(streamed);
    if (input.allowFileEdits) {
      return {
        text: hasFileEditBlocks(partial) ? partial : '',
        intent,
        findings,
        meta: 'Local model \u00b7 error',
        streamed: Boolean(streamed),
        packedTokens,
      };
    }
    if (!findings.length) findings = collectProjectFindings(input.files, 'all');
    return {
      text: stripStudioMeta(localScanAnswer(
        intent === 'freeform' ? 'debug' : intent,
        input.files,
        input.projectName,
        findings,
        ask,
      )),
      intent,
      findings,
      meta: 'Local scan \u00b7 attached files',
      streamed: false,
      packedTokens,
    };
  }
}
