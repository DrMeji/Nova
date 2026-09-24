/**
 * Extract media IIFE from AIChat sendMessage into src/lib/chatMediaTurn.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const aichatPath = path.join(root, 'src/views/AIChat.tsx');
const outPath = path.join(root, 'src/lib/chatMediaTurn.ts');
const s = fs.readFileSync(aichatPath, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';
const lines = s.split(/\r?\n/);

// 1-based inclusive body: 4804..5892 (inside IIFE, excluding wrapper)
const bodyLines = lines.slice(4803, 5892);
const body = bodyLines.map((l) => (l.startsWith('  ') ? l.slice(2) : l)).join(nl);

const header = `/**
 * Media chat turn — image/video generation path after Wave 2 mid-ladder delete.
 * Extracted from AIChat sendMessage IIFE so the view stays smaller.
 */

import { saveChatMessage } from '@/lib/api';
import { getLocalPrefs, getProviderApiKeys, setLocalPrefs } from '@/lib/localPrefs';
import { isCloudProviderEnabled } from '@/lib/cloudSources';
import { honestNoLiveChatReply, probeLiveCapacity, type LiveCapacity } from '@/lib/novaCapacity';
import {
  chatThreadKey,
  mediaMessageMarkdown,
  extractVisionImages,
  rememberThumb,
  getMemoryThumb,
  slimChatContent,
  titleFromPrompt,
} from '@/lib/recentStore';
import { looksLikeCodeAsk, looksLikeCopyPasteCodeAsk, looksLikeImageAsk } from '@/lib/chatIntent';
import {
  rewriteImagePrompt,
  rewriteVideoPrompt,
  runMediaGenStages,
} from '@/lib/mediaPrompt';
import {
  buildImageBriefMessage,
  mergeImageBrief,
  needsImageBrief,
  parseImageRequest,
} from '@/lib/mediaBrief';
import { arkRoute, routerProviderLabel, type ArkRouterResult } from '@/lib/novaRouter';
import { looksLikeNsfwAsk, nsfwBlockedReply } from '@/lib/nsfwGate';
import { isVideoTabEnabled } from '@/lib/featurePark';
import { runPluginAction } from '@/lib/plugins';
import { engineGenerateCancel } from '@/lib/novaEngine';
import { getChatJobId } from '@/lib/chatInflight';
import { classifyErrorMessage } from '@/lib/errors';
import {
  buildRouterHistory,
  looksLikePromptEcho,
  looksLikeThreadSummaryAsk,
  threadSummarySystemHint,
  buildThreadSummaryFromMessages,
  usableAssistantText,
  isCannedGreetingReply,
} from '@/lib/chatHistory';
import { saveAutoThreadBrain, type ThreadBrain } from '@/lib/threadBrain';
import { setChatCodePill, getLastPendingGreenfield, studioPathBasename } from '@/lib/chatStudioStore';
import { hasActiveWorkspace, looksLikeKeepBuildingAsk, looksLikeCodeEditAsk } from '@/lib/chatAgentTurn';
import { finalizeCodingChatBubble } from '@/lib/chatCodeReply';
import { loadPreviewFilesFromDisk } from '@/lib/projectPreview';
import { looksLikeImplementGo, planningConversationHint, keepBuildingConversationHint } from '@/lib/chatPlanMode';
import {
  looksLikeConversationalPlanningAsk,
  looksLikeDirectJudgmentAsk,
  looksLikeGreenfieldStartWorkGo,
  shouldInjectPlanningConversation,
  wantsPlanningOnly,
} from '@/lib/chatIdeaIntent';
import {
  looksLikeWebGroundedAsk,
  looksLikeSideQuestAsk,
  looksLikeLyricsAsk,
  looksLikeInventedLyricsDump,
  looksLikeThinSideQuestReply,
  honestLyricsUnavailableReply,
  sideQuestAnswerHint,
  scrubSideQuestBleed,
  fallbackAnswerFromLookup,
  webSearchForChat,
  formatWebLookupForPrompt,
  webLookupUnavailableNote,
} from '@/lib/webSearch';
import type { ChatMessage } from '@/types';
import type { ChatMode } from '@/context/RouterContext';

export type MediaPinnedModel = {
  id: string;
  name: string;
  source: 'local' | 'cloud' | 'auto';
  detail?: string;
  kind?: 'chat' | 'image' | 'video';
};

export type MediaTurnHost = {
  content: string;
  mode: ChatMode;
  composerMode: string | null | undefined;
  providerLabel: string;
  mySeq: number;
  activeChatId: string;
  genJobId: string;
  previousAssistant: string;
  statusLabel: string;
  isMediaMode: boolean;
  videoDurationSec: number;
  pluginId: string | null | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pluginState: { token?: string; permissions?: any; accountLabel?: string } | null | undefined;
  pinnedModel: MediaPinnedModel;
  normalized: ChatMessage[];
  userMsg: ChatMessage;
  assistantMsg: ChatMessage;
  assistantId: string;
  priorForHistory: ChatMessage[];
  resolvedStudio: { files: Record<string, string>; diskRoot?: string | null; projectId?: string | null; name?: string };
  turnDiskRoot: string | null;
  turnProjectId: string | null;
  turnStudioFiles: Record<string, string>;
  chatStudioDiskRoot: string | null;
  threadKind: string;
  capacity: LiveCapacity | null | undefined;
  chats: { id: string; title?: string }[];
  chatRouteSeedRef: { current: { history: { role: 'user' | 'assistant'; content: string }[]; sticky: ThreadBrain | null } };
  genSeqRef: { current: number };
  stopRequestedRef: { current: boolean };
  chatTurnCtlRef: {
    current: {
      clearGenerating: () => void;
      finalizeAssistant: (finalText: string, provider: string, libraryId?: string) => void;
      pushStatus: (label: string) => void;
    };
  };
  chatStudioFilesRef: { current: Record<string, string> };
  chatStudioDiskRootRef: { current: string | null };
  chatStudioProjectIdRef: { current: string | null };
  imageBriefRef: { current: { chatId: string; original: string } | null };
  routeChatIdRef: { current: string | null | undefined };
  messagesRef: { current: ChatMessage[] };
  messagesChatIdRef: { current: string | null };
  persistTimerRef: { current: number | undefined };
  threadBrainRef: { current: ThreadBrain | null };
  previewUrlRef: { current: string | null };
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  persistModeThread: (mode: ChatMode, messages: ChatMessage[], opts?: { chatId?: string | null }) => void;
  setFailoverNote: (note: string | null) => void;
  setThreadBrain: (brain: ThreadBrain | null) => void;
  setIpcFallbackDev: (v: boolean) => void;
  setChatStudioFiles: (files: Record<string, string>) => void;
  persistStudioSnapshot: (
    chatId: string,
    patch?: {
      files?: Record<string, string>;
      projectId?: string | null;
      name?: string;
      diskRoot?: string | null;
      previewUrl?: string | null;
    },
  ) => void;
  pushLivePreview: (files: Record<string, string>, openIfClosed?: boolean) => void | Promise<void>;
  flushQueuedSend: () => void;
  addCreation: (c: Record<string, unknown>) => void;
  addChat: (c: Record<string, unknown>) => void;
  failoverChipText: (routed: ArkRouterResult, pinned: MediaPinnedModel) => string | null;
  previewFromText: (text: string) => string | undefined;
};

export async function runMediaChatTurn(host: MediaTurnHost): Promise<void> {
  const {
    content,
    mode,
    composerMode,
    providerLabel,
    mySeq,
    activeChatId,
    genJobId,
    previousAssistant,
    statusLabel,
    isMediaMode,
    videoDurationSec,
    pluginId,
    pluginState,
    pinnedModel,
    normalized,
    userMsg,
    assistantMsg,
    assistantId,
    priorForHistory,
    resolvedStudio,
    turnDiskRoot,
    turnProjectId,
    turnStudioFiles,
    chatStudioDiskRoot,
    threadKind,
    capacity,
    chats,
    chatRouteSeedRef,
    genSeqRef,
    stopRequestedRef,
    chatTurnCtlRef,
    chatStudioFilesRef,
    chatStudioDiskRootRef,
    chatStudioProjectIdRef,
    imageBriefRef,
    routeChatIdRef,
    messagesRef,
    messagesChatIdRef,
    persistTimerRef,
    threadBrainRef,
    previewUrlRef,
    setMessages,
    persistModeThread,
    setFailoverNote,
    setThreadBrain,
    setIpcFallbackDev,
    setChatStudioFiles,
    persistStudioSnapshot,
    pushLivePreview,
    flushQueuedSend,
    addCreation,
    addChat,
    failoverChipText,
    previewFromText,
  } = host;

`;

const file = header + body + `${nl}}${nl}`;
fs.writeFileSync(outPath, file);
console.log('wrote', outPath, 'lines', file.split(/\r?\n/).length);

const catchFatal = '    } catch (fatal) {';
const catchIdx = s.lastIndexOf(catchFatal);
if (catchIdx < 0) throw new Error('catch(fatal) not found');
const startMarker = '    void (async () => {';
const endMarker = '    })();';
const startIdx = s.indexOf(startMarker, catchIdx);
if (startIdx < 0) throw new Error('IIFE start not found after catch');
const endIdx = s.indexOf(endMarker, startIdx);
if (endIdx < 0) throw new Error('IIFE end not found');
const endAt = endIdx + endMarker.length;

const replacement = `    void runMediaChatTurn({
      content,
      mode,
      composerMode,
      providerLabel,
      mySeq,
      activeChatId: activeChatId!,
      genJobId,
      previousAssistant,
      statusLabel,
      isMediaMode,
      videoDurationSec,
      pluginId,
      pluginState,
      pinnedModel,
      normalized,
      userMsg,
      assistantMsg,
      assistantId,
      priorForHistory,
      resolvedStudio,
      turnDiskRoot,
      turnProjectId,
      turnStudioFiles,
      chatStudioDiskRoot,
      threadKind,
      capacity,
      chats,
      chatRouteSeedRef,
      genSeqRef,
      stopRequestedRef,
      chatTurnCtlRef,
      chatStudioFilesRef,
      chatStudioDiskRootRef,
      chatStudioProjectIdRef,
      imageBriefRef,
      routeChatIdRef,
      messagesRef,
      messagesChatIdRef,
      persistTimerRef,
      threadBrainRef,
      previewUrlRef,
      setMessages,
      persistModeThread,
      setFailoverNote,
      setThreadBrain,
      setIpcFallbackDev,
      setChatStudioFiles,
      persistStudioSnapshot,
      pushLivePreview,
      flushQueuedSend,
      addCreation: (c) => addCreation(c as never),
      addChat: (c) => addChat(c as never),
      failoverChipText,
      previewFromText,
    });
    return;`;

let out = s.slice(0, startIdx) + replacement + s.slice(endAt);

const importLine = "import { runMediaChatTurn } from '@/lib/chatMediaTurn';";
if (!out.includes(importLine)) {
  const anchor = "import { engineGenerateCancel, getEngineStatus, setEngineModel } from '@/lib/novaEngine';";
  if (!out.includes(anchor)) throw new Error('arkEngine import anchor missing');
  out = out.replace(anchor, `${anchor}${nl}${importLine}`);
}

fs.writeFileSync(aichatPath, out);
console.log('patched AIChat', s.split(/\r?\n/).length, '→', out.split(/\r?\n/).length);
