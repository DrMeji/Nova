/**
 * Extract AIChat helpers + presentational frame.
 * Props = top-level component bindings (2-space indent) used in the UI region.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const aichatPath = path.join(root, 'src/views/AIChat.tsx');
const helpersPath = path.join(root, 'src/views/aichat/aiChatHelpers.tsx');
const framePath = path.join(root, 'src/views/aichat/AIChatFrame.tsx');

let s = fs.readFileSync(aichatPath, 'utf8');
s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const nl = '\n';
const lines = s.split('\n');

function findLine(pred, from = 0) {
  for (let i = from; i < lines.length; i++) if (pred(lines[i], i)) return i + 1; // 1-based
  return -1;
}

const STACKED_START = findLine((l) => l.includes('/** Stacked live timer'));
const STACKED_END = findLine((l, i) => i + 1 > STACKED_START && l === '}' && lines[i - 1]?.trim() === '};' ? false : (i + 1 >= STACKED_START && l === '}' && lines[STACKED_START]?.includes('Stacked')), STACKED_START);
// stacked function ends at first lone `}` after start that closes the function
let stackedEnd = STACKED_START;
for (let i = STACKED_START; i < STACKED_START + 30; i++) {
  if (lines[i - 1] === '}') { stackedEnd = i; break; }
}
const HELPERS_START = findLine((l) => l.startsWith('const COMPOSER_MODE_PREFIX'));
const HELPERS_END = findLine((l) => l.startsWith('function focusComposerIfSafe'));
// extend to closing brace of focusComposerIfSafe
let helpersEnd = HELPERS_END;
for (let i = HELPERS_END; i < HELPERS_END + 20; i++) {
  if (lines[i - 1] === '}') { helpersEnd = i; break; }
}
const COMPONENT_START = findLine((l) => l.startsWith('export function AIChat'));
const UI_START = findLine((l) => l.trim() === 'const applyIdea = (label: string) => {');
const UI_END = lines.length; // last line is `}` of AIChat — UI is through `);` of return
// UI ends at the `);` closing the main return, which is lines.length-2 (0-based: length-2)
// 1-based: lines.length - 1 is `}`, length-2 is `);` wait
// last lines: `  );` then `}`
let uiEnd = lines.length - 1; // 1-based line of `);`
for (let i = lines.length; i > UI_START; i--) {
  if (lines[i - 1].trim() === ');' && lines[i]?.trim() === '}') {
    uiEnd = i;
    break;
  }
}

console.log({ STACKED_START, stackedEnd, HELPERS_START, helpersEnd, COMPONENT_START, UI_START, uiEnd, total: lines.length });

function slice1(start, end) {
  return lines.slice(start - 1, end);
}

// Top-level bindings only (exactly 2 spaces)
const preUi = slice1(COMPONENT_START, UI_START - 1);
const declared = new Set();
for (const line of preUi) {
  let m = line.match(/^  (?:const|let|function|async function)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (m) declared.add(m[1]);
  m = line.match(/^  const\s*\[([^\]]+)\]/);
  if (m) {
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/\s*=.*/, '');
      if (/^[A-Za-z_]/.test(name)) declared.add(name);
    }
  }
  m = line.match(/^  const\s*\{([^}]+)\}\s*=/);
  if (m) {
    for (const part of m[1].split(',')) {
      const bit = part.trim();
      if (!bit) continue;
      // { a, b: c, a: b = 1 }
      const name = bit.includes(':') ? bit.split(':')[0].trim() : bit.split('=')[0].trim();
      if (/^[A-Za-z_]/.test(name)) declared.add(name);
    }
  }
}

const helperNames = new Set([
  'stackedLiveTurnParts', 'COMPOSER_MODE_PREFIX', 'COMPOSER_MODE_LABEL', 'COMPOSER_MODE_PILL',
  'composerModeFromContent', 'previewFromText', 'ChatModeTabs',
  'CHAT_MODELS', 'CLOUD_CHAT_WHEN_KEYED', 'kindForMode', 'defaultModelForKind',
  'failoverChipText', 'PLACEHOLDERS', 'GREETINGS', 'IMAGE_IDEAS', 'VIDEO_IDEAS', 'CODE_IDEAS',
  'isMediaOnlyContent', 'projectIdFromThread', 'folderNameFromThread', 'resolveStudioFiles',
  'persistModeThread', 'deletePrepareErrorReply', 'focusComposerIfSafe',
  'ModelSource', 'ModelKind', 'ChatModelOption',
]);

const uiText = slice1(UI_START, uiEnd).join('\n');
const used = new Set();
for (const mm of uiText.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) used.add(mm[1]);

const propsNeeded = [...used]
  .filter((id) => declared.has(id))
  .filter((id) => !helperNames.has(id))
  .sort();

console.log('props', propsNeeded.length, propsNeeded.join(', '));

// --- helpers file (.tsx for ChatModeTabs JSX) ---
const helpersHeader = `/**
 * Pure helpers / constants for AIChat — extracted to shrink the view.
 */
import { useRouter, type ChatMode } from '@/context/RouterContext';
import { getLocalPrefs, hasProviderApiKey } from '@/lib/localPrefs';
import { isCloudProviderEnabled } from '@/lib/cloudSources';
import { resolvePreferredCloudProvider } from '@/lib/cloudChat';
import { stopSpeaking } from '@/lib/voiceSession';
import { isVoiceTabEnabled } from '@/lib/featurePark';
import type { ArkRouterResult } from '@/lib/novaRouter';
import {
  chatThreadKey,
  slimChatContent,
} from '@/lib/recentStore';
import {
  parseChatAttaches,
} from '@/lib/chatAttach';
import {
  loadChatStudio,
  studioPathBasename,
} from '@/lib/chatStudioStore';
import type { ChatMessage } from '@/types';

`;

let helpersBody =
  slice1(STACKED_START, stackedEnd).join(nl) + nl + nl +
  slice1(HELPERS_START, helpersEnd).join(nl) + nl;

helpersBody = helpersBody
  .replace(/^function stackedLiveTurnParts/m, 'export function stackedLiveTurnParts')
  .replace(/^const COMPOSER_MODE_PREFIX/m, 'export const COMPOSER_MODE_PREFIX')
  .replace(/^const COMPOSER_MODE_LABEL/m, 'export const COMPOSER_MODE_LABEL')
  .replace(/^const COMPOSER_MODE_PILL/m, 'export const COMPOSER_MODE_PILL')
  .replace(/^function composerModeFromContent/m, 'export function composerModeFromContent')
  .replace(/^function previewFromText/m, 'export function previewFromText')
  .replace(/^function ChatModeTabs/m, 'export function ChatModeTabs')
  .replace(/^type ModelSource =/m, 'export type ModelSource =')
  .replace(/^type ModelKind =/m, 'export type ModelKind =')
  .replace(/^type ChatModelOption =/m, 'export type ChatModelOption =')
  .replace(/^const CHAT_MODELS/m, 'export const CHAT_MODELS')
  .replace(/^const CLOUD_CHAT_WHEN_KEYED/m, 'export const CLOUD_CHAT_WHEN_KEYED')
  .replace(/^function kindForMode/m, 'export function kindForMode')
  .replace(/^function defaultModelForKind/m, 'export function defaultModelForKind')
  .replace(/^function failoverChipText/m, 'export function failoverChipText')
  .replace(/^const PLACEHOLDERS/m, 'export const PLACEHOLDERS')
  .replace(/^const GREETINGS/m, 'export const GREETINGS')
  .replace(/^const IMAGE_IDEAS/m, 'export const IMAGE_IDEAS')
  .replace(/^const VIDEO_IDEAS/m, 'export const VIDEO_IDEAS')
  .replace(/^const CODE_IDEAS/m, 'export const CODE_IDEAS')
  .replace(/^function isMediaOnlyContent/m, 'export function isMediaOnlyContent')
  .replace(/^function projectIdFromThread/m, 'export function projectIdFromThread')
  .replace(/^function folderNameFromThread/m, 'export function folderNameFromThread')
  .replace(/^async function resolveStudioFiles/m, 'export async function resolveStudioFiles')
  .replace(/^function persistModeThread/m, 'export function persistModeThread')
  .replace(/^function deletePrepareErrorReply/m, 'export function deletePrepareErrorReply')
  .replace(/^function focusComposerIfSafe/m, 'export function focusComposerIfSafe');

fs.mkdirSync(path.dirname(helpersPath), { recursive: true });
fs.writeFileSync(helpersPath, helpersHeader + helpersBody, 'utf8');
console.log('helpers', helpersPath, (helpersHeader + helpersBody).split('\n').length);

// --- frame ---
const frameHeader = `/**
 * AIChat presentational shell — composer, message list, dialogs.
 */
import { createPortal } from 'react-dom';
import { RotatingTip } from '@/components/RotatingTip';
import { ParkedNotice } from '@/components/ParkedNotice';
import { AttachCard } from '@/components/AttachCard';
import { GitHubRepoPicker } from '@/components/GitHubRepoPicker';
import { VoiceModeLayout } from '@/components/VoiceModeLayout';
import { FreeKeyWizard } from '@/components/FreeKeyWizard';
import { DeleteProjectFolderModal } from '@/components/DeleteProjectFolderModal';
import { DeleteFileModal } from '@/components/DeleteFileModal';
import { DeleteFolderClarifyModal } from '@/components/DeleteFolderClarifyModal';
import { ComposerPlusMenu } from '@/components/ComposerPlusMenu';
import { TokenUsageRing } from '@/components/TokenUsageRing';
import { ArkErrorInline } from '@/components/ArkErrorInline';
import { MessageContent, GeneratingPlaceholder } from '@/components/MediaMessage';
import { ChatCodeOverlay } from '@/components/ChatCodeOverlay';
import { FIRST_RUN_KIND_CHIPS } from '@/lib/chatTurnHandlers';
import { isTraceMessage } from '@/lib/agentTrace';
import { classifyErrorMessage, isLikelyErrorMessage } from '@/lib/errors';
import { isVoiceTabEnabled } from '@/lib/featurePark';
import { formatReplyElapsed } from '@/lib/speedTest';
import { attachKey } from '@/lib/chatAttach';
import { loadChatStudio, studioPathBasename } from '@/lib/chatStudioStore';
import { getApplySnapshot, clearApplySnapshot, snapshotToRevertBlocks } from '@/lib/chatApplySnapshotStore';
import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { setLocalPrefs, hasProviderApiKey } from '@/lib/localPrefs';
import { isCloudProviderEnabled } from '@/lib/cloudSources';
import { syncWorkspaceGrantsFromPrefs } from '@/lib/workspaceGrants';
import { autoEquippedCaption, autoRingDetail } from '@/lib/threadBrain';
import {
  Loader2, ImageIcon, Video, Code2,
  Upload, Cpu, Cloud, ChevronDown, Check,
  Folder, Square, X, ImagePlus,
  Puzzle, Briefcase, Github, Globe, Copy, Plus, Mic, MicOff,
} from 'lucide-react';
import {
  ChatModeTabs,
  COMPOSER_MODE_LABEL,
  COMPOSER_MODE_PILL,
  CHAT_MODELS,
  CLOUD_CHAT_WHEN_KEYED,
  IMAGE_IDEAS,
  VIDEO_IDEAS,
  CODE_IDEAS,
  kindForMode,
  isMediaOnlyContent,
  stackedLiveTurnParts,
} from './aiChatHelpers';

// Loose props bag — AIChat owns the logic; this file is presentational.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AIChatFrameProps = Record<string, any>;

export function AIChatFrame(props: AIChatFrameProps) {
${propsNeeded.map((id) => `  const ${id} = props.${id};`).join(nl)}
`;

const uiBody = slice1(UI_START, uiEnd).join(nl);
fs.writeFileSync(framePath, frameHeader + nl + uiBody + nl + '}' + nl, 'utf8');
console.log('frame', framePath, fs.readFileSync(framePath, 'utf8').split('\n').length);

// --- patch AIChat from bottom to top ---
let next = lines.slice();

const frameCallLines = [
  '  return (',
  '    <AIChatFrame',
  ...propsNeeded.map((id) => `      ${id}={${id}}`),
  '    />',
  '  );',
];
next.splice(UI_START - 1, uiEnd - UI_START + 1, ...frameCallLines);

next.splice(HELPERS_START - 1, helpersEnd - HELPERS_START + 1);
next.splice(STACKED_START - 1, stackedEnd - STACKED_START + 1);

const helperImport = [
  `import {`,
  `  COMPOSER_MODE_PREFIX,`,
  `  composerModeFromContent,`,
  `  previewFromText,`,
  `  CHAT_MODELS,`,
  `  CLOUD_CHAT_WHEN_KEYED,`,
  `  kindForMode,`,
  `  defaultModelForKind,`,
  `  failoverChipText,`,
  `  PLACEHOLDERS,`,
  `  GREETINGS,`,
  `  resolveStudioFiles,`,
  `  persistModeThread,`,
  `  deletePrepareErrorReply,`,
  `  focusComposerIfSafe,`,
  `  type ChatModelOption,`,
  `} from '@/views/aichat/aiChatHelpers';`,
  `import { AIChatFrame } from '@/views/aichat/AIChatFrame';`,
];

let brandIdx = next.findIndex((l) => l.includes("from '@/lib/brandAssets'"));
if (brandIdx < 0) throw new Error('brandAssets import not found');
next.splice(brandIdx + 1, 0, '', ...helperImport);

fs.writeFileSync(aichatPath, next.join(nl) + nl, 'utf8');
console.log('AIChat lines', next.length);
