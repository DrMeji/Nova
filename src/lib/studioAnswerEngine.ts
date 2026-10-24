/**
 * Unified studio answer engine. Chat (and later Code) sticky-folder replies.
 * One path: classify hint → optional local scan → fresh packed context → scan format and/or streamed model.
 * Never show system scaffolding in user-visible text. Never reuse prior prose as the next answer.
 */

import { arkRoute, routerProviderLabel } from '@/lib/novaRouter';
import { engineGenerateCancel } from '@/lib/novaEngine';
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
import { looksLikeProjectDebugAsk, looksLikeProjectOverviewAsk } from '@/lib/chatProjectDebug';
import { wantsApplyFix, looksLikeFeatureMutateAsk, diagnoseProjectAsk, formatDiagnoseExplainReply, rankFindingsForAsk } from '@/lib/chatDiagnose';
import { looksLikeProductCorrectionAsk } from '@/lib/chatBuildIntent';
import {
  collectProjectFindings,
  describeProjectFromFiles,
  describeProjectInDetail,
  isBuildArtifactPath,
  reportProjectFocusAsk,
  reportProjectProblems,
  scanProjectFindings,
  type InspectFinding,
} from '@/lib/projectInspect';
import {
  looksLikeGreenfieldKeepPlanning,
  looksLikeRequirementsAsk,
  looksLikeTalkBeforeCreateAsk,
} from '@/lib/chatIdeaIntent';
import { shouldPreferCloudForCoding, countSourceFiles } from '@/lib/codingCloudPolicy';
import { estimateTokens } from '@/lib/tokenUsage';
import { hasRealStudioFiles, looksLikePlainChatAsk, scrubFalseProjectChatPreamble } from '@/lib/plainChatAsk';

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
  /** Override model wall (ms). createV2 passes a hard craft wall so 12-min build budget never applies. */
  timeoutMs?: number;
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
  /** Engine/router failure detail when text is empty (create polish surfaces this). */
  error?: string;
  streamed?: boolean;
  packedTokens?: number;
};

const SMALLTALK_RE =
  /^(hi|hello|heelo|helo|ehello|hell+o|hey|yo|sup|howdy|thanks|thank you|ok|okay|cool|nice|sure)[.!\s]*$/i;

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
/** Full website / app / game creates — allow up to ~12 minutes per model pass (quality over speed). */
const MODEL_TIMEOUT_BUILD_MS = 720_000;
/** Micro follow-ups after surgical miss — never 300s. */
const MODEL_TIMEOUT_MICRO_MS = 45_000;
/** createV2 single-write craft — hard wall so silent GGUF waits cannot hang for minutes. */
const MODEL_TIMEOUT_CREATE_V2_MS = 75_000;

/** Create polish / full App+CSS builds — must not use the 45s micro timeout. */
export function looksLikeFullUiBuildCodingAsk(message: string): boolean {
  const t = String(message || '');
  // Agent tool-loop steps only need a short TOOL: line — never the 8-minute create budget.
  if (looksLikeAgentToolLoopPrompt(t)) return false;
  if (/@@@FILE\b/i.test(t)) return true;
  if (/\brebuild\s+(?:the\s+)?ui\b/i.test(t)) return true;
  if (/\b(?:scrap|rebuild|redo|replace)\b[\s\S]{0,60}\b(?:ui|layout|app\.css|jsx|tsx)\b/i.test(t)) return true;
  if (/\b(?:make\s+it\s+richer|full\s+ui\s+polish|premium\s+(?:ui|look|polish))\b/i.test(t)) return true;
  if (t.length > 400 && /\b(?:footer|hero|nav|multi-?section|landing|App\.css)\b/i.test(t)) return true;
  return /\b(?:Build the first real|first real multi-section|from (?:your |this )?brief|Emit COMPLETE @@@FILE|product UI matching|fully built)\b/i.test(t);
}

/** True for Level-B agent loop prompts (expect TOOL: … not a full App dump). */
export function looksLikeAgentToolLoopPrompt(message: string): boolean {
  const t = String(message || '');
  if (/^\s*TOOL:\s*(?:list|read|grep|patch|write|run|ready|assets|mcp|done)\b/im.test(t)) return true;
  if (/\bRespond with the next tool only\b/i.test(t)) return true;
  if (/\bPrefer TOOL:\s*patch over full-file write\b/i.test(t)) return true;
  return /\bTOOL:\s*list\b[\s\S]{0,400}\bTOOL:\s*done\b/i.test(t)
    && /\b(?:Prefer grep\/read|next tool only|agent steps)\b/i.test(t);
}

function looksLikeMicroCodingAsk(message: string): boolean {
  const t = String(message || '');
  // Create polish prompts mention footer/copy/hero — those are full builds, not micro edits.
  if (looksLikeFullUiBuildCodingAsk(t)) return false;
  if (looksLikeAgentToolLoopPrompt(t)) return false;
  if (/\b(?:scrap|rebuild|from scratch|make it richer|redesign|entire)\b/i.test(t)) return false;
  if (t.length > 400) return false;
  return /\b(?:title|heading|h1|center|footer|color|background|button|text|label|copy|logo)\b/i.test(t)
    || (/^\s*(?:add|put|place|change|update|make|set|rename)\b/i.test(t) && t.length < 220);
}

/** Timeout used by answerStudio for coding/file-edit turns (exported for smoke). */
export function codingFileEditTimeoutMs(userMessage: string): number {
  // createV2 craft — never use the 12-minute legacy build budget.
  if (/createV2\s+RULES|FRESH BUILD RULES/i.test(String(userMessage || ''))) {
    return MODEL_TIMEOUT_CREATE_V2_MS;
  }
  // Tool-loop steps must stay snappy — hanging on "Thinking (step N/24)" for 8 minutes each froze creates.
  if (looksLikeAgentToolLoopPrompt(userMessage)) return MODEL_TIMEOUT_CODE_MS;
  // Short "rebuild the UI" nudges used to inherit the 12‑minute build budget and look frozen.
  if (/\brebuild\s+(?:the\s+)?ui\b/i.test(String(userMessage || ''))
    && String(userMessage || '').length < 280) {
    return 240_000;
  }
  if (looksLikeFullUiBuildCodingAsk(userMessage)) return MODEL_TIMEOUT_BUILD_MS;
  if (looksLikeMicroCodingAsk(userMessage)) return MODEL_TIMEOUT_MICRO_MS;
  return MODEL_TIMEOUT_CODE_MS;
}

function cleanAsk(message: string): string {
  return String(message || '')
    .replace(/<!--nova-attach:[\s\S]*?-->/g, '')
    .replace(/<!--nova-auto-read-->/g, '')
    .replace(/^[[](?:Plan|Ask|Debug|Tasks)[\]]\s*/i, '')
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

  // Planning / fold-into-plan / extras talk — never Local scan (even if they say "button" or "wrong stall").
  if (
    looksLikeGreenfieldKeepPlanning(String(message || ''))
    || looksLikeTalkBeforeCreateAsk(String(message || ''))
    || looksLikeRequirementsAsk(String(message || ''))
    || /\bfold\s+(?:those|these|them|it|that)\s+into\s+the\s+plan\b/i.test(ask)
    || /\b(?:add|want)\s+(?:three|3|two|2|more)\s+extras?\b/i.test(ask)
    || /\b(?:soft\s+sage|save-?a-?bag|terracotta|cream\s+colors?)\b/i.test(ask)
  ) {
    return 'freeform';
  }

  // Overview / “what is this about” / “more info on this project” before any debug intent.
  if (looksLikeProjectOverviewAsk(String(message || ''))) {
    if (/\b(?:more|full|deeper|detail|report|closer)\b/i.test(ask)) return 'file-detail';
    return 'overview';
  }
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

  // Create/craft whole-file writes: never pack the long “you can see the files” system —
  // local GGUFs echo those lines into App.jsx and Preview Ready fails.
  const craftFileWrite = Boolean(input.allowFileEdits)
    && (
      /\b@@@FILE\b/i.test(ask)
      || /\bcreateV2 RULES\b/i.test(ask)
      || /\bWrite ONLY @@@FILE\b/i.test(ask)
      || /\bOutput ONLY (?:one )?file block/i.test(ask)
      || /\bFRESH BUILD RULES\b/i.test(ask)
    );
  if (craftFileWrite) {
    const system = 'Output @@@FILE code only. Complete file bodies. Do not echo instructions.';
    const user = ask;
    const prompt = `${system}\n\n${user}`;
    return { system, user, findings, prompt, packedTokens: estimateTokens(prompt) };
  }

  const handsFreeDebug = looksLikeProjectDebugAsk(input.userMessage);
  const applyNow = handsFreeDebug && (wantsApplyFix(input.userMessage) || looksLikeFeatureMutateAsk(input.userMessage) || input.allowFileEdits);
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
      ? handsFreeDebug && applyNow
        ? 'Hands-free fix: start with 2-4 sentences in this shape — "Okay, I see the problem…", then **Cause:** `file` — why it breaks, then **How to fix it:** one short sentence. Then emit @@@FILE blocks with COMPLETE updated file contents for every file you change. Do not stop at a checklist. Keep edits surgical. After the files, add ONE short sentence on how to verify.'
        : wantsFullUiBuild
          ? [
            'BUILD THE PRODUCT UI NOW. Do not describe it. Do not summarize the plan.',
            'Emit @@@FILE blocks with COMPLETE file contents for src/App.jsx (or App.tsx), src/App.css, and src/index.css at minimum.',
            'Every @@@FILE line must include a path (@@@FILE src/App.jsx). Never emit a bare @@@FILE.',
            'Prefer a single App.jsx with all sections inline. Do not import missing ./components/* files.',
            'App.jsx must be a real interactive UI matching the brief — never an empty <div className="app" />, never a single search box, never placeholder "Ask NOVA" copy.',
            'Build what the user asked for from the brief — invent the UI. Do not force tip/todo/notes/marketing/shop presets. No COVER_HREFS / storefront products.ts unless the brief needs them.',
            'Take the time needed: aim for a substantial App (roughly 150+ lines / 2500+ characters of real JSX) with multiple sections, real controls, and polished CSS (hundreds of lines of CSS when the brief is a rich site).',
            'Do not stop early with a minimal form+list stub when the brief asks for a full product or marketing-quality site.',
            'After the files, add ONE short plain-English sentence only (no code fences).',
          ].join(' ')
          : [
            'The user wants you to CHANGE THE CODE NOW. Emit @@@FILE blocks with COMPLETE file contents for every file you change. Do not only describe the change. Keep edits surgical. only files that need to change.',
            'Do not invent COVER_HREFS, marketing heroes, or src/data/products.ts unless the ask needs them. After the files, add ONE short plain-English sentence (no code fences, no file dumps). Example: "Added the logo centered on screen."',
          ].join(' ')
      : handsFreeDebug
        ? 'Diagnose only. Reply in this exact shape: (1) "Okay — I see the problem you’re describing." (2) **What’s going wrong:** restate their symptom in one line. (3) **Cause:** `path` — why it breaks. (4) **How to fix it:** one concrete step. (5) Offer to apply with "Say fix it when you’re ready." Do NOT write @@@FILE blocks. Do not dump whole files.'
        : 'Do NOT write @@@FILE blocks. Do not dump whole files.';

  const emptyProject = sourceKeys.length === 0;
  const plainSocial = !input.allowFileEdits
    && looksLikePlainChatAsk(ask)
    && emptyProject;

  // Never claim “attached project files” for a story / hello when the tree is empty.
  if (plainSocial) {
    const system = [
      'You are NOVA, a helpful chat assistant.',
      'Answer exactly what the user asked (story, joke, greeting, question).',
      'Do NOT mention project files, file trees, attached folders, or empty projects unless the user asked about them.',
      'Do NOT invent that the user attached a project.',
      'Never output lines like “ANSWER THE USER QUESTION FIRST” or “User asked:”.',
    ].join(' ');
    const user = `Question: ${ask}`;
    const prompt = `${system}\n\n${user}`;
    return { system, user, findings, prompt, packedTokens: estimateTokens(prompt) };
  }

  const system = [
    emptyProject
      ? 'If no project files are present, answer the user’s question normally. Do not invent an attached empty project.'
      : 'You can see the attached project files. Never say you cannot see them.',
    'Never ask the user to paste code.',
    emptyProject
      ? 'Answer the user’s question directly. For stories, jokes, and casual chat, just respond — no codebase framing.'
      : 'Answer ONLY about this codebase when the ask is about the project. For pure social/story asks, answer the ask without codebase framing.',
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
            : intent === 'freeform'
              ? (emptyProject
                ? 'Answer exactly what they asked. Do not mention project files unless they asked.'
                : 'Answer exactly what they asked using the files.')
              : 'Answer their ask from the files.';

  const user = emptyProject
    ? [
      `Question: ${ask}`,
      '',
      `Intent hint: ${intent}. ${intentHint}`,
    ].join('\n')
    : [
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
      chunks.join('\n\n') || '(no excerpts)',
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
    if (handsFree) {
      const base = findings.length ? findings : scanProjectFindings(files, ask);
      const ranked = rankFindingsForAsk(base, ask);
      const flat = flattenProjectFiles(files);
      const count = Object.keys(flat).filter(k => !isBuildArtifactPath(k)).length;
      return formatDiagnoseExplainReply({
        ask,
        findings: ranked,
        projectName,
        fileCount: count || Object.keys(flat).length,
        offerApply: true,
      });
    }
    return reportProjectProblems(files, projectName, 'debug', {
      focusFix: false,
      userQuestion: ask,
    });
  }
  if (intent === 'file-detail') {
    const detail = describeProjectInDetail(files, projectName);
    return [
      detail.trim(),
      '',
      'If you want a deep scan for bugs and risks, press **+ → Debug** and say **find problems**.',
      'If you want to change this project — add, remove, or fix something — just say what you need.',
    ].join('\n');
  }
  let spoken = describeProjectFromFiles(files, projectName);
  if (/\b(can you |do you )?see\b/i.test(ask) || /\bwhat (am i|i'?m)/i.test(ask)) {
    const n = Object.keys(flattenProjectFiles(files)).length;
    spoken = `Yes. I can see **${n} file${n === 1 ? '' : 's'}** from **${projectName || 'this folder'}** in this chat.\n\n${spoken}`;
  }
  if (intent === 'overview' || looksLikeProjectOverviewAsk(ask)) {
    spoken = [
      spoken.trim(),
      '',
      'If you want a deep scan for bugs and risks, press **+ → Debug** and say **find problems**.',
      'If you want to change this project — add, remove, or fix something — just say what you need and we can start.',
    ].join('\n');
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
  // Pure social ask with no real files — never enter project packing / Local scan.
  if (!input.allowFileEdits
    && looksLikePlainChatAsk(input.userMessage)
    && !hasRealStudioFiles(input.files)
  ) {
    const prefs = getLocalPrefs();
    let streamed = '';
    let lastGood = '';
    const { scrubCannedGreetingFlash, isCannedGreetingReply } = await import('@/lib/chatHistory');
    const routed = await arkRoute({
      message: input.userMessage,
      kind: 'chat',
      preferredModelId: input.preferredModelId,
      preferredModelName: input.preferredModelName,
      preferredSource: input.preferredSource as 'local' | 'cloud' | 'auto' | undefined,
      stickyModelId: input.stickyModelId,
      stickyModelName: input.stickyModelName,
      stickyPinnedSource: input.stickyPinnedSource as 'local' | 'cloud' | undefined,
      history: buildRouterHistory([], input.userMessage, undefined, {
        keepContinuity: false,
        kind: 'chat',
      }),
      onAttemptReset: () => {
        streamed = '';
        if (lastGood.length >= 2) onDelta?.(lastGood);
      },
      onChunk: prefs.streamResponses && onDelta
        ? (piece) => {
          if (input.shouldAbort?.()) return;
          const delta = String(piece || '');
          if (!delta) return;
          if (streamed.length === 0 && delta.length >= 80) streamed = delta;
          else if (delta.length > streamed.length + 40 && delta.length >= 80) streamed = delta;
          else streamed += delta;
          const live = scrubCannedGreetingFlash(scrubFalseProjectChatPreamble(streamed));
          if (live.length < 2 || isCannedGreetingReply(live, input.userMessage)) {
            if (lastGood.length >= 2) onDelta(lastGood);
            return;
          }
          if (
            lastGood.length >= 48
            && live.length < Math.floor(lastGood.length * 0.55)
            && !live.startsWith(lastGood.slice(0, Math.min(40, lastGood.length)))
          ) {
            return;
          }
          lastGood = live;
          onDelta(live);
        }
        : undefined,
    });
    const text = scrubCannedGreetingFlash(scrubFalseProjectChatPreamble(
      String(routed.reply || lastGood || streamed || '').trim(),
    )) || lastGood || 'Sure — what would you like to talk about?';
    return {
      text,
      intent: 'freeform',
      meta: routerProviderLabel(routed, 'NOVA'),
      streamed: Boolean(streamed || lastGood),
      packedTokens: 0,
    };
  }

  // File-edit / create-UI turns must always hit the model — never Local scan.
  const intent = input.allowFileEdits
    ? 'freeform'
    : classifyStudioIntent(input.userMessage, input.lastIntent);
  const packed = packStudioContext({ ...input, userMessage: ask });
  let findings = packed.findings;
  const packedTokens = packed.packedTokens;

  // Natural-language diagnose (no apply yet): only for real problem asks — never overview.
  if (
    !input.allowFileEdits
    && looksLikeProjectDebugAsk(input.userMessage)
    && !looksLikeProjectOverviewAsk(input.userMessage)
    && hasRealStudioFiles(input.files)
  ) {
    const diagnosed = diagnoseProjectAsk(input.files, ask, input.projectName);
    findings = diagnosed.findings.length ? diagnosed.findings : findings;
    return {
      text: stripStudioMeta(diagnosed.text),
      intent: 'debug',
      findings,
      meta: 'Diagnose \u00b7 attached files',
      streamed: false,
      packedTokens,
    };
  }

  // Empty folder + planning language must never dump "I scanned 0 source files".
  const planningTalk = !input.allowFileEdits && (
    looksLikePlainChatAsk(input.userMessage)
    || looksLikeGreenfieldKeepPlanning(input.userMessage)
    || looksLikeTalkBeforeCreateAsk(input.userMessage)
    || !hasRealStudioFiles(input.files)
  );
  if (planningTalk && !hasRealStudioFiles(input.files) && usesLocalScan(intent)) {
    // Fall through to the model as freeform instead of Local scan.
  } else if (!input.allowFileEdits && usesLocalScan(intent) && !prefersModel(intent)) {
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
    void engineGenerateCancel();
    return {
      text: input.allowFileEdits
        ? ''
        : stripStudioMeta(localScanAnswer(intent, input.files, input.projectName, findings, ask)),
      intent,
      findings,
      meta: 'Local scan \u00b7 attached files',
      error: input.allowFileEdits ? 'UI polish aborted before the model started' : undefined,
      streamed: false,
      packedTokens,
    };
  }

  const prefs = getLocalPrefs();
  let streamed = '';
  let cancelSent = false;
  const killLocalInfer = () => {
    if (cancelSent) return;
    cancelSent = true;
    void engineGenerateCancel();
  };
  const history = buildRouterHistory([], packed.prompt, undefined, {
    keepContinuity: false,
    kind: 'coding',
  });

  try {
    const routeKind = (input.mode === 'code' || input.allowFileEdits) ? 'coding' : 'chat';

    // Wave 2 / threadBrain: gate weak local coder before generate (assertCoderAllowed).
    // Full sticky-brain wiring stays in AIChat; this is the shared soft-miss fence.
    if (routeKind === 'coding' && input.allowFileEdits) {
      try {
        const { getBrainProfile, assertCoderAllowed } = await import('@/lib/brainProfile');
        const profile = await getBrainProfile();
        const gate = assertCoderAllowed(
          profile,
          input.stickyModelId || input.preferredModelId,
          input.stickyModelName || input.preferredModelName,
        );
        if (!gate.ok && profile.maxCoderParamsB <= 0) {
          return {
            text: [
              gate.reason,
              '',
              'Skip the coding hop on this PC — use surgical one-line edits, scaffold, or a cloud coder.',
            ].join('\n'),
            intent,
            findings,
            meta: 'Brain gate · soft miss',
            streamed: false,
            packedTokens,
          };
        }
      } catch {
        /* continue */
      }
    }

    const timeoutMs = typeof input.timeoutMs === 'number' && input.timeoutMs > 0
      ? input.timeoutMs
      : (input.allowFileEdits
        ? codingFileEditTimeoutMs(input.userMessage)
        : routeKind === 'coding' && looksLikeProjectDebugAsk(input.userMessage)
          ? MODEL_TIMEOUT_CODE_MS
          : MODEL_TIMEOUT_MS);
    // Poll shouldAbort while waiting — stream callbacks never fire during silent GGUF load.
    let abortPollId: number | null = null;
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
      onAttemptReset: () => {
        streamed = '';
      },
      onChunk: prefs.streamResponses && onDelta
        ? (() => {
          let paintTimer: number | null = null;
          let pendingLive = '';
          const flushPaint = () => {
            paintTimer = null;
            if (!pendingLive || pendingLive.length < 2 || looksLikePromptEcho(pendingLive)) return;
            onDelta(pendingLive);
          };
          return (piece: string) => {
            if (input.shouldAbort?.()) {
              killLocalInfer();
              return;
            }
            const delta = String(piece || '');
            if (!delta) return;
            if (streamed.length === 0 && delta.length >= 80) streamed = delta;
            else if (delta.length > streamed.length + 40 && delta.length >= 80) streamed = delta;
            else streamed += delta;
            pendingLive = stripStudioMeta(streamed);
            // ~50ms paint coalesce — avoid per-chunk React setState storms.
            if (paintTimer == null) {
              paintTimer = window.setTimeout(flushPaint, 50);
            }
          };
        })()
        : undefined,
    });

    const abortRace = new Promise<{ ok: false; aborted: true }>((resolve) => {
      // 100ms poll — Stop must reach GGUF cancel within ~1s, not wait on a 400ms cadence.
      abortPollId = window.setInterval(() => {
        if (input.shouldAbort?.()) {
          killLocalInfer();
          resolve({ ok: false, aborted: true });
        }
      }, 100);
    });

    const timed = await Promise.race([
      routePromise.then(r => ({ ok: true as const, routed: r })),
      new Promise<{ ok: false; aborted?: false }>((resolve) => {
        window.setTimeout(() => resolve({ ok: false }), timeoutMs);
      }),
      abortRace,
    ]);
    if (abortPollId != null) window.clearInterval(abortPollId);

    if (input.shouldAbort?.()) {
      killLocalInfer();
      const partial = stripStudioMeta(streamed);
      return {
        text: input.allowFileEdits
          ? (hasFileEditBlocks(partial) ? partial : '')
          : (partial || stripStudioMeta(localScanAnswer(intent, input.files, input.projectName, findings, ask))),
        intent,
        findings,
        meta: 'Local model \u00b7 attached files',
        error: input.allowFileEdits && !hasFileEditBlocks(partial)
          ? 'UI polish aborted before the model finished (stop or timeout)'
          : undefined,
        streamed: Boolean(streamed),
        packedTokens,
      };
    }

    if (!timed.ok) {
      killLocalInfer();
      const partial = stripStudioMeta(streamed);
      // Never replace a build turn with Local scan — that wipes @@@FILE blocks mid-stream.
      if (input.allowFileEdits) {
        return {
          text: hasFileEditBlocks(partial) ? partial : '',
          intent,
          findings,
          meta: 'Local model \u00b7 timed out',
          error: hasFileEditBlocks(partial)
            ? undefined
            : `Local coder timed out after ~${Math.round(timeoutMs / 1000)}s with no @@@FILE blocks`,
          streamed: Boolean(streamed),
          packedTokens,
        };
      }
      // Freeform / social: keep what streamed — never swap in a project Local scan.
      if (intent === 'freeform' || !hasRealStudioFiles(input.files)) {
        const keep = stripStudioMeta(streamed);
        return {
          text: scrubFalseProjectChatPreamble(keep)
            || 'I started answering but ran out of time. Ask again and I will continue.',
          intent,
          findings,
          meta: 'Local model · timed out',
          streamed: Boolean(streamed),
          packedTokens,
        };
      }
      const fallback = stripStudioMeta(localScanAnswer(
        intent,
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
          error: hasFileEditBlocks(spoken)
            ? undefined
            : (spoken
              ? `Model replied without @@@FILE blocks: ${spoken.slice(0, 240)}`
              : (routerNoModel
                ? 'No live local coder connected'
                : 'UI model returned an empty reply')),
          streamed: Boolean(streamed),
          packedTokens,
        };
      }
      if (!findings.length) findings = collectProjectFindings(input.files, 'all');
      // Freeform with no real files: keep spoken/stream text, never invent project scan.
      if (intent === 'freeform' && !hasRealStudioFiles(input.files)) {
        const keep = scrubFalseProjectChatPreamble(partial || spoken)
          || 'I could not finish that answer. Try asking again in one short sentence.';
        return {
          text: keep,
          intent,
          findings,
          meta: 'Local model',
          streamed: Boolean(streamed),
          packedTokens,
        };
      }
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
    const spokenText = preferFileBearingText(spoken);
    const attached = input.allowFileEdits && hasFileEditBlocks(spokenText);
    return {
      text: spokenText,
      intent,
      findings: findings.length ? findings : collectProjectFindings(input.files, 'all'),
      meta: attached ? `${label} \u00b7 attached files` : label,
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
        error: hasFileEditBlocks(partial)
          ? undefined
          : (partial ? `Model error with partial text: ${partial.slice(0, 240)}` : 'Local model threw before returning file blocks'),
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
