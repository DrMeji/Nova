/**
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
import { saveAutoThreadBrain, type ThreadBrain, type ThreadBrainKind } from '@/lib/threadBrain';
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
  detail: string;
  kind: 'chat' | 'image' | 'video';
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
  threadKind: ThreadBrainKind;
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
  persistModeThread: (
    mode: ChatMode,
    messages: ChatMessage[],
    opts?: { chatId?: string; creationId?: string; libraryId?: string; assistantId?: string },
  ) => void;
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

    const routeHistory = chatRouteSeedRef.current.history;
    const stickyBrain = chatRouteSeedRef.current.sticky;
    let response = 'NOVA Router could not complete this request.';
    let usedPlugin = false;
    let skipReplySanitize = false;
    let lastLibraryId: string | undefined;
    let resolvedProvider = providerLabel;
    let streamedPartial = '';
    let lastGoodLive = '';
    let abandoned = false;
    let idleTimer: number | undefined;
    let sideQuestLookup: { text: string; sources: { title: string; url: string }[]; ok: boolean } | null = null;
    let earlyResolve: ((value: { reply: string }) => void) | null = null;
    const earlyDone = new Promise<{ reply: string }>((resolve) => {
      earlyResolve = resolve;
    });

    const armStreamIdleFinish = () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      const draftNow = String(streamedPartial || '').trim();
      // Do NOT cut local models off after a short sentence — rushed finishes looked "done"
      // in a few seconds with thin answers. Prefer waiting; 1+ minute thinks are OK.
      const substantial = draftNow.length >= 1400;
      const solidEnd = /[.!?…]["')\]]*\s*$/.test(draftNow);
      // Longer idle = more think time. Sub-minute answers were often incomplete.
      const idleMs = substantial && solidEnd
        ? 18_000
        : draftNow.length >= 400
          ? 35_000
          : 55_000;
      idleTimer = window.setTimeout(() => {
        if (mySeq !== genSeqRef.current || abandoned || stopRequestedRef.current) return;
        const cleaned = usableAssistantText(streamedPartial, content, previousAssistant);
        const draft = (cleaned || streamedPartial).trim();
        if (draft.length < 8) return;
        // Too thin still: keep waiting for more tokens instead of cancelling the engine.
        if (draft.length < 500 && !/^(hi|hello|hey|thanks|thank you)\b/i.test(draft)) {
          idleTimer = window.setTimeout(() => {
            if (mySeq !== genSeqRef.current || abandoned || stopRequestedRef.current) return;
            abandoned = true;
            void engineGenerateCancel({
              chatId: activeChatId,
              jobId: getChatJobId(activeChatId) || genJobId || undefined,
            });
            chatTurnCtlRef.current.clearGenerating();
            earlyResolve?.({ reply: usableAssistantText(streamedPartial, content, previousAssistant) || draft });
          }, 40_000);
          return;
        }
        // Echo-only garbage: fail closed. Long streamed answers always settle.
        if (looksLikePromptEcho(draft) && draft.length < 200) {
          abandoned = true;
          void engineGenerateCancel({
              chatId: activeChatId,
              jobId: getChatJobId(activeChatId) || genJobId || undefined,
            });
          chatTurnCtlRef.current.clearGenerating();
          earlyResolve?.({
            reply: 'Model echoed its system prompt. Try switching models and send again.',
          });
          return;
        }
        if (looksLikePromptEcho(draft) && draft.length < 400) {
          // Keep waiting for a better chunk once; do not soft-lock Stop.
          idleTimer = window.setTimeout(() => {
            if (mySeq !== genSeqRef.current || abandoned || stopRequestedRef.current) return;
            abandoned = true;
            void engineGenerateCancel({
              chatId: activeChatId,
              jobId: getChatJobId(activeChatId) || genJobId || undefined,
            });
            chatTurnCtlRef.current.clearGenerating();
            const again = usableAssistantText(streamedPartial, content, previousAssistant);
            earlyResolve?.({
              reply: (again || streamedPartial).trim()
                || 'Model echoed its system prompt. Try switching models and send again.',
            });
          }, 8_000);
          return;
        }
        const incomplete = /[:;,—–-]\s*$/.test(draft)
          || /\n\s*(?:\d+\.|[-*])\s+[^\n]{0,80}:\s*$/.test(draft)
          || /\b(and|or|the|to|of|for|with|a|an)\s*$/i.test(draft);
        // Incomplete drafts: wait longer before releasing Stop.
        if (incomplete && draft.length < 900) {
          idleTimer = window.setTimeout(() => {
            if (mySeq !== genSeqRef.current || abandoned || stopRequestedRef.current) return;
            abandoned = true;
            void engineGenerateCancel({
              chatId: activeChatId,
              jobId: getChatJobId(activeChatId) || genJobId || undefined,
            });
            chatTurnCtlRef.current.clearGenerating();
            earlyResolve?.({ reply: cleaned || draft });
          }, 12_000);
          return;
        }
        abandoned = true;
        void engineGenerateCancel({
              chatId: activeChatId,
              jobId: getChatJobId(activeChatId) || genJobId || undefined,
            });
        chatTurnCtlRef.current.clearGenerating();
        earlyResolve?.({ reply: cleaned || draft });
      }, idleMs);
    };

    try {
    // Prefer sticky map from resolveStudioFiles.
    const studioFiles = Object.keys(resolvedStudio.files).length
      ? resolvedStudio.files
      : chatStudioFilesRef.current;
    const hasStudioFiles = Object.keys(studioFiles).length > 0;
    if (hasStudioFiles) {
      chatStudioFilesRef.current = studioFiles;
    }

    // WAVE 2: studio micro/inspect owned by early dispatch — deleted from media IIFE.
    if (!usedPlugin && pluginId) {
      const pluginReply = await runPluginAction(
        pluginId,
        content,
        pluginState?.token,
        pluginState?.permissions,
      );
      if (pluginReply) {
        response = pluginReply;
        usedPlugin = true;
      }
    } else if (
      !usedPlugin
      && (
        mode === 'image'
        || (
          (mode === 'general' || mode === 'code')
          && !hasStudioFiles
          && composerMode !== 'ask'
          && looksLikeImageAsk(content)
        )
      )
    ) {
      try {
        const setAssistantContent = (text: string) => {
          if (abandoned || stopRequestedRef.current || mySeq !== genSeqRef.current) return;
          const threadChatId = activeChatId;
          const patch = (list: ChatMessage[]) =>
            list.map(m => (m.id === assistantId ? { ...m, content: text } : m));
          const viewing = Boolean(routeChatIdRef.current && routeChatIdRef.current === threadChatId);
          if (viewing) {
            setMessages(prev => {
              const next = patch(prev.some(m => m.id === assistantId) ? prev : messagesRef.current);
              messagesRef.current = next;
              persistModeThread(mode, next, { chatId: threadChatId });
              return next;
            });
            return;
          }
          try {
            const raw = localStorage.getItem(chatThreadKey(threadChatId));
            const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
            const base = Array.isArray(stored) && stored.some(m => m.id === assistantId)
              ? stored
              : [...normalized, userMsg, { ...assistantMsg, content: text }];
            persistModeThread(mode, patch(base), { chatId: threadChatId });
          } catch {
            /* ignore */
          }
        };

        const { text: imageText, referenceId } = parseImageRequest(content);
        const referenceDataUrl = referenceId ? getMemoryThumb(referenceId) : undefined;
        let promptForGen = imageText || content;
        // Strip accidental empty-state chip text glued onto the prompt.
        promptForGen = promptForGen
          .replace(/^(Studio headshot|Create a caricature|Anime style|Underwater)\s*/i, '')
          .replace(/^(Studio headshot|Create a caricature|Anime style|Underwater)/i, '')
          .trim() || promptForGen;

        if (!getLocalPrefs().allowNsfw && looksLikeNsfwAsk(promptForGen)) {
          response = nsfwBlockedReply();
          setAssistantContent(response);
          usedPlugin = true;
        } else {
          const mergedFromBrief = Boolean(imageBriefRef.current?.chatId === activeChatId);
          if (mergedFromBrief) {
            promptForGen = mergeImageBrief(imageBriefRef.current!.original, imageText);
            imageBriefRef.current = null;
          }
          if (
            !mergedFromBrief
            && !referenceDataUrl
            && needsImageBrief(promptForGen)
          ) {
            imageBriefRef.current = { chatId: activeChatId!, original: promptForGen };
            response = buildImageBriefMessage(promptForGen);
            setAssistantContent(response);
            usedPlugin = true;
          } else if (!usedPlugin) {
        const imagePinned: MediaPinnedModel = mode === 'image'
          ? pinnedModel
          : {
            id: 'NOVA-image-core',
            name: 'NOVA Image Core',
            source: 'local',
            detail: '',
            kind: 'image',
          };
        const rewritten = rewriteImagePrompt(promptForGen);
        const sticky = mode === 'image' ? stickyBrain : undefined;
        let routed: Awaited<ReturnType<typeof arkRoute>> | undefined;
        await runMediaGenStages('image', label => {
          setAssistantContent(`__generating__:image:${label}`);
        }, async () => {
          // Free hosts (Flux + Horde cascade) often need 2–3 minutes; keep UI timeout above media budget.
          const IMAGE_TIMEOUT_MS = 210_000;
          routed = await Promise.race([
            arkRoute({
              message: rewritten,
              kind: 'image',
              preferredModelId: imagePinned.id,
              preferredModelName: imagePinned.name,
              preferredSource: imagePinned.source,
              stickyModelId: sticky?.modelId,
              stickyModelName: sticky?.modelName,
              stickyPinnedSource: sticky?.pinnedSource,
              referenceImageDataUrl: referenceDataUrl,
            }),
            new Promise<never>((_, reject) => {
              window.setTimeout(() => reject(new Error('Image timed out. Try again or pick another model.')), IMAGE_TIMEOUT_MS);
            }),
          ]);
        });

        if (!routed) {
          response = 'Image generation failed. Try again in a moment.';
          usedPlugin = true;
        } else {
          resolvedProvider = routerProviderLabel(routed, 'NOVA Image Core');
          const hopNote = failoverChipText(routed, imagePinned);
          if (hopNote) setFailoverNote(hopNote);
          if (mode === 'image' && pinnedModel.source === 'auto' && routed.source !== 'none') {
            const nextBrain = saveAutoThreadBrain(
              activeChatId,
              'image',
              routed,
              threadBrainRef.current,
              routed.attempted?.length ?? 0,
            );
            if (nextBrain) setThreadBrain(nextBrain);
          }
          const libraryId = routed.media?.libraryId || `local-${Date.now()}`;
          lastLibraryId = libraryId;
          const dataUrl = routed.media?.dataUrl;
          const isSvg = Boolean(dataUrl?.startsWith('data:image/svg'));
          const isReal = Boolean(routed.media?.real) && Boolean(dataUrl) && !isSvg;

          if (isReal && dataUrl) {
            rememberThumb(libraryId, dataUrl);
            addCreation({
              id: libraryId,
              kind: 'image',
              title: content.slice(0, 80),
              prompt: content,
              modelName: routed.modelName || imagePinned.name,
              dataUrl,
              createdAt: new Date().toISOString(),
              real: true,
              source: routed.source,
              chatId: activeChatId!,
            });
            response = mediaMessageMarkdown(content, libraryId, dataUrl, {
              real: true,
              kind: 'image',
              source: routed.source,
            });
            addChat({
              id: activeChatId!,
              mode: mode === 'image' ? 'image' : mode,
              title: titleFromPrompt(content),
              updatedAt: new Date().toISOString(),
              creationId: libraryId,
              preview: previewFromText(content),
            });
          } else {
            const failText = String(routed.reply || '').replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
            response = failText || [
              'Couldn\'t generate image. try again.',
              '',
              'Try again in a minute, or connect a Hugging Face / OpenAI key in Models → Cloud.',
            ].join('\n');
          }
          usedPlugin = true;
        }
          }
        }
      } catch (err) {
        void engineGenerateCancel({
              chatId: activeChatId,
              jobId: getChatJobId(activeChatId) || genJobId || undefined,
            });
        response = classifyErrorMessage(err instanceof Error ? err.message : 'Image generation failed').message;
        usedPlugin = true;
      }
    } else if (!usedPlugin && mode === 'video') {
      if (!isVideoTabEnabled()) {
        response = 'Video generation is coming soon. Use **Chat** for now.';
        usedPlugin = true;
      } else {
      try {
        const setAssistantContent = (text: string) => {
          if (abandoned || stopRequestedRef.current || mySeq !== genSeqRef.current) return;
          const threadChatId = activeChatId;
          const patch = (list: ChatMessage[]) =>
            list.map(m => (m.id === assistantId ? { ...m, content: text } : m));
          const viewing = Boolean(routeChatIdRef.current && routeChatIdRef.current === threadChatId);
          if (viewing) {
            setMessages(prev => {
              const next = patch(prev.some(m => m.id === assistantId) ? prev : messagesRef.current);
              messagesRef.current = next;
              persistModeThread(mode, next, { chatId: threadChatId });
              return next;
            });
            return;
          }
          try {
            const raw = localStorage.getItem(chatThreadKey(threadChatId));
            const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
            const base = Array.isArray(stored) && stored.some(m => m.id === assistantId)
              ? stored
              : [...normalized, userMsg, { ...assistantMsg, content: text }];
            persistModeThread(mode, patch(base), { chatId: threadChatId });
          } catch {
            /* ignore */
          }
        };

        const rewritten = rewriteVideoPrompt(content);
        const sticky = stickyBrain;
        let routed: Awaited<ReturnType<typeof arkRoute>> | undefined;
        await runMediaGenStages('video', label => {
          setAssistantContent(`__generating__:video:${label}`);
        }, async () => {
          const VIDEO_TIMEOUT_MS = 150_000;
          routed = await Promise.race([
            arkRoute({
              message: rewritten,
              kind: 'video',
              preferredModelId: pinnedModel.id,
              preferredModelName: pinnedModel.name,
              preferredSource: pinnedModel.source,
              stickyModelId: sticky?.modelId,
              stickyModelName: sticky?.modelName,
              stickyPinnedSource: sticky?.pinnedSource,
              mediaDurationSec: videoDurationSec,
            }),
            new Promise<never>((_, reject) => {
              window.setTimeout(() => reject(new Error('Video timed out. Try again or pick another model.')), VIDEO_TIMEOUT_MS);
            }),
          ]);
        });

        if (!routed) {
          response = 'Video generation failed. Try again in a moment.';
          usedPlugin = true;
        } else {
          resolvedProvider = routerProviderLabel(routed, providerLabel);
          const hopNote = failoverChipText(routed, pinnedModel);
          if (hopNote) setFailoverNote(hopNote);
          if (pinnedModel.source === 'auto' && routed.source !== 'none') {
            const nextBrain = saveAutoThreadBrain(
              activeChatId,
              'video',
              routed,
              threadBrainRef.current,
              routed.attempted?.length ?? 0,
            );
            if (nextBrain) setThreadBrain(nextBrain);
          }
          const libraryId = routed.media?.libraryId || `local-${Date.now()}`;
          lastLibraryId = libraryId;
          const dataUrl = routed.media?.dataUrl;
          const isSvg = Boolean(
            dataUrl?.startsWith('data:image/svg')
            || dataUrl?.includes('image/svg'),
          );
          const isMp4 = Boolean(dataUrl?.startsWith('data:video/'));
          const isMotionStill = (routed.source || '').includes('motion-still');

          if (dataUrl && isMp4 && !isSvg) {
            const isReal = Boolean(routed.media?.real) && isMp4 && !isMotionStill;
            rememberThumb(libraryId, dataUrl);
            addCreation({
              id: libraryId,
              kind: 'video',
              title: content.slice(0, 80),
              prompt: content,
              modelName: routed.modelName || pinnedModel.name,
              dataUrl,
              createdAt: new Date().toISOString(),
              real: isReal,
              source: routed.source,
              chatId: activeChatId!,
            });
            if (routed.reply && (routed.reply.includes('![') || isMotionStill || !isReal)) {
              response = routed.reply.includes('![')
                ? routed.reply
                : `${routed.reply}\n\n${mediaMessageMarkdown(content, libraryId, dataUrl, {
                    real: isReal,
                    kind: 'video',
                    source: routed.source,
                  })}`;
            } else {
              response = mediaMessageMarkdown(content, libraryId, dataUrl, {
                real: isReal,
                kind: 'video',
                source: routed.source,
              });
            }
            addChat({
              id: activeChatId!,
              mode,
              title: titleFromPrompt(content),
              updatedAt: new Date().toISOString(),
              creationId: libraryId,
              preview: previewFromText(content),
            });
          } else {
            const failText = String(routed.reply || '').replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
            response = failText || [
              'Couldn\'t generate video. try again.',
              '',
              'Free video hosts did not return a playable MP4.',
            ].join('\n');
          }
          usedPlugin = true;
        }
      } catch (err) {
        void engineGenerateCancel({
              chatId: activeChatId,
              jobId: getChatJobId(activeChatId) || genJobId || undefined,
            });
        response = classifyErrorMessage(err instanceof Error ? err.message : 'Video generation failed').message;
        usedPlugin = true;
      }
      }
    } else if (!usedPlugin) {
      try {
        const prefs = getLocalPrefs();
        const vision = extractVisionImages(content);
        const pendingIdea = getLastPendingGreenfield(activeChatId);
        const sideQuest = looksLikeSideQuestAsk(content);
        const planningTalk = !sideQuest && shouldInjectPlanningConversation(content, {
          pendingIdea: Boolean(pendingIdea),
          diskRoot: chatStudioDiskRootRef.current || chatStudioDiskRoot || null,
        });
        const keepBuildingTalk = !sideQuest && looksLikeKeepBuildingAsk(content)
          && !hasActiveWorkspace({
            files: chatStudioFilesRef.current,
            projectId: chatStudioProjectIdRef.current,
            diskRoot: chatStudioDiskRootRef.current,
          });
        let routeMessage = content;
        const historyKeep = !sideQuest;
        let history = prefs.rememberContext
          ? (routeHistory.length && historyKeep
            ? routeHistory
            : buildRouterHistory(priorForHistory, content, vision, {
              keepContinuity: historyKeep,
              kind: 'chat',
            }))
          : buildRouterHistory([], content, vision);
        // Side quests must not reuse a packed build history that still contains the marketplace brief.
        if (sideQuest) {
          history = buildRouterHistory(priorForHistory, content, vision, {
            keepContinuity: false,
            kind: 'chat',
          });
        }
        if (sideQuest) {
          chatTurnCtlRef.current.pushStatus(looksLikeLyricsAsk(content) ? 'Checking lyrics…' : 'Thinking…');
          // Copyrighted lyrics: never let the local model invent a full paste.
          if (looksLikeLyricsAsk(content)) {
            response = honestLyricsUnavailableReply(content);
            usedPlugin = true;
          } else {
            history = [
              { role: 'user' as const, content: sideQuestAnswerHint(content) },
              {
                role: 'assistant' as const,
                content: 'Understood. I will answer only this question, refuse to invent live facts, and not continue any prior build/product advice.',
              },
              ...history,
            ];
          }
        }
        if (!usedPlugin) {
        if (planningTalk || keepBuildingTalk) {
          // Single status only — no multi-second delay that thrash-replaces the bubble before tokens arrive.
          chatTurnCtlRef.current.pushStatus('Thinking…');
          const hint = keepBuildingTalk
            ? keepBuildingConversationHint(pendingIdea?.summary || chats.find(c => c.id === activeChatId)?.title || undefined)
            : planningConversationHint(pendingIdea?.summary || undefined);
          history = [
            { role: 'user' as const, content: hint },
            { role: 'assistant' as const, content: keepBuildingTalk
              ? 'Understood. I will recommend concrete next polish steps and ask what they want next — no full rebuild, no file dumps.'
              : 'Understood. I will stay on their topic, give a thorough answer, and not invent a random product.' },
            ...history,
          ];
          routeMessage = content;
        }
        let preferPerplexityForTurn = false;
        if (looksLikeWebGroundedAsk(content) && !looksLikeLyricsAsk(content)) {
          chatTurnCtlRef.current.pushStatus('Thinking…');
          try {
            const hit = await webSearchForChat(content);
            if (mySeq !== genSeqRef.current || stopRequestedRef.current) return;
            const keys = getProviderApiKeys();
            preferPerplexityForTurn = Boolean(keys.perplexity) && isCloudProviderEnabled('perplexity');
            sideQuestLookup = {
              ok: Boolean(hit.ok),
              text: String(hit.text || ''),
              sources: Array.isArray(hit.sources) ? hit.sources : [],
            };
            const note = hit.ok ? formatWebLookupForPrompt(hit) : '';
            if (note) {
              history = [
                ...history,
                {
                  role: 'user' as const,
                  content: `${note}\n\nUser question (answer this now, facts first): ${String(content || '').trim()}`,
                },
              ];
            } else {
              history = [
                ...history,
                { role: 'user' as const, content: webLookupUnavailableNote() },
                {
                  role: 'assistant' as const,
                  content: preferPerplexityForTurn
                    ? 'Understood — built-in lookup was empty; I will answer with a live search model when available and clearly say when facts are uncertain — never a link directory.'
                    : 'Understood — I will tell the user I lack live web results for this question and recommend Models → Cloud (Perplexity) or Exa, instead of inventing current events or listing random websites.',
                },
              ];
            }
          } catch {
            /* offline / blocked — answer from local knowledge */
          }
        }
        if (looksLikeDirectJudgmentAsk(content)) {
          history = [
            {
              role: 'user' as const,
              content:
                'Answer the latest user message directly. If they asked how fast AND whether it is worth building, cover both: (1) a realistic timeline to a usable beta, (2) a clear yes/no-with-reasons on worth. Do not greet. Do not dump a fresh multi-week plan template.',
            },
            {
              role: 'assistant' as const,
              content: 'Understood. I will answer the timeline and the worth-it judgment first, briefly.',
            },
            ...history,
          ];
        }
        if (looksLikeThreadSummaryAsk(content)) {
          history = [
            { role: 'user' as const, content: threadSummarySystemHint() },
            {
              role: 'assistant' as const,
              content: 'Understood. I will summarize only this chat thread from the prior turns.',
            },
            ...history,
          ];
        }
        const sticky = stickyBrain;
        const pinnedIsCoder = /coder|starcoder/i.test(`${pinnedModel.id || ''} ${pinnedModel.name || ''}`);
        const judgmentAsk = looksLikeDirectJudgmentAsk(content);
        const summaryAsk = looksLikeThreadSummaryAsk(content);
        const useChatBrain = (planningTalk || judgmentAsk || summaryAsk) && (pinnedIsCoder || /1\.5b|1.5B|0\.5b/i.test(`${pinnedModel.id || ''} ${pinnedModel.name || ''}`));
        const timeoutMs = 250_000;
        const firstTokenMs = planningTalk ? 55_000 : 35_000;
        let sawToken = false;
        const routePromise = arkRoute({
          message: routeMessage,
          kind: 'chat',
          preferredModelId: preferPerplexityForTurn
            ? 'perplexity'
            : (useChatBrain ? undefined : pinnedModel.id),
          preferredModelName: preferPerplexityForTurn
            ? 'Perplexity Sonar'
            : (useChatBrain ? undefined : pinnedModel.name),
          preferredSource: preferPerplexityForTurn
            ? 'cloud'
            : (useChatBrain ? undefined : pinnedModel.source),
          stickyModelId: useChatBrain ? undefined : sticky?.modelId,
          stickyModelName: useChatBrain ? undefined : sticky?.modelName,
          stickyPinnedSource: useChatBrain ? undefined : sticky?.pinnedSource,
          history,
          onAttemptReset: () => {
            // Reset stream buffers for the next attempt, but keep the last good
            // visible reply so deepen/retry does not wipe the bubble (flicker).
            streamedPartial = '';
            sawToken = Boolean(lastGoodLive);
            if (idleTimer) window.clearTimeout(idleTimer);
            if (!lastGoodLive) {
              setMessages(prev => {
                if (routeChatIdRef.current !== activeChatId) return prev;
                const next = prev.map(m => (
                  m.id === assistantId
                    ? { ...m, content: `__generating__:chat:${statusLabel}` }
                    : m
                ));
                messagesRef.current = next;
                return next;
              });
            }
          },
          onChunk: prefs.streamResponses
            ? (piece) => {
            if (abandoned || stopRequestedRef.current || mySeq !== genSeqRef.current) return;
            if (!piece) return;
            streamedPartial += piece;
            const usable = usableAssistantText(streamedPartial, content, previousAssistant);
            const rawTrim = streamedPartial.trim();
            // Never fall back to a canned greeting flash on a non-greeting ask.
            const live = usable
              || (
                rawTrim
                && !isCannedGreetingReply(rawTrim, content)
                && !looksLikePromptEcho(rawTrim)
                  ? rawTrim
                  : ''
              );
            const liveClean = live && !looksLikePromptEcho(live) ? live : '';
            if (liveClean) {
              // Keep the first solid streamed answer stable across failover hops.
              // Only grow lastGoodLive when the new text continues the same reply.
              if (!lastGoodLive) {
                lastGoodLive = liveClean;
              } else if (liveClean.startsWith(lastGoodLive.slice(0, Math.min(40, lastGoodLive.length)))) {
                lastGoodLive = liveClean;
              }
              sawToken = true;
            }
            // Fast-fail when the model is only re-emitting the system prompt.
            if (
              !liveClean
              && !lastGoodLive
              && looksLikePromptEcho(streamedPartial)
              && streamedPartial.trim().length > 140
              && !abandoned
            ) {
              abandoned = true;
              void engineGenerateCancel({
              chatId: activeChatId,
              jobId: getChatJobId(activeChatId) || genJobId || undefined,
            });
              chatTurnCtlRef.current.clearGenerating();
              earlyResolve?.({
                reply: 'Model echoed its system prompt. Try switching models and send again.',
              });
              return;
            }
            const display = lastGoodLive || liveClean || `__generating__:chat:${statusLabel}`;
            setMessages(prev => {
              // Don't stream another thread onto a blank New Chat / different recent.
              if (routeChatIdRef.current !== activeChatId) {
                if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
                persistTimerRef.current = window.setTimeout(() => {
                  const liveMsg = {
                    ...assistantMsg,
                    content: display,
                  };
                  persistModeThread(mode, [...normalized, userMsg, liveMsg], {
                    chatId: activeChatId,
                  });
                }, 220);
                return prev;
              }
              const next = prev.map(m => {
                if (m.id !== assistantId) return m;
                // Never flip back to a status label once real answer text has landed (stops flicker).
                return { ...m, content: display };
              });
              messagesRef.current = next;
              messagesChatIdRef.current = activeChatId;
              if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
              const snapshot = next;
              const persistTo = activeChatId;
              persistTimerRef.current = window.setTimeout(() => {
                persistModeThread(mode, snapshot, {
                  chatId: persistTo,
                });
              }, 220);
              return next;
            });
            armStreamIdleFinish();
          }
            : undefined,
        });
        const races: Promise<{ reply: string; full: Awaited<typeof routePromise> | null }>[] = [
          routePromise.then(r => ({ reply: r.reply, full: r as Awaited<typeof routePromise> })),
          earlyDone.then(r => ({ reply: r.reply, full: null })),
          new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('Response timed out. Try again or pick another model.')), timeoutMs);
          }),
        ];
        if (prefs.streamResponses) {
          races.push(new Promise((_, reject) => {
            window.setTimeout(() => {
              if (mySeq !== genSeqRef.current) {
                reject(new Error('superseded'));
                return;
              }
              if (abandoned || stopRequestedRef.current) {
                reject(new Error('Generation stopped'));
                return;
              }
              if (!sawToken) {
                if (streamedPartial.trim() && looksLikePromptEcho(streamedPartial)) {
                  reject(new Error('Model echoed its system prompt. Try again or pick another model.'));
                } else {
                  reject(new Error('No response yet. Try again or pick another model.'));
                }
              }
            }, firstTokenMs);
          }));
        }
        const routed = await Promise.race(races);
        if (idleTimer) window.clearTimeout(idleTimer);
        // Release Stop as soon as we have a usable reply. don't wait on trailing work.
        chatTurnCtlRef.current.clearGenerating();
        const rawReply = stopRequestedRef.current && streamedPartial
          ? streamedPartial
          : routed.reply;
        const routedClean = usableAssistantText(rawReply, content, previousAssistant);
        const streamClean = usableAssistantText(streamedPartial, content, previousAssistant);
        // Prefer the longest usable draft so silent retries cannot retract a solid outline.
        const candidates = [routedClean, streamClean, lastGoodLive, String(rawReply || '').trim(), streamedPartial.trim()]
          .map(s => String(s || '').trim())
          .filter(s => s && !looksLikePromptEcho(s));
        candidates.sort((a, b) => b.length - a.length);
        response = candidates[0] || '';
        const candidate = String(rawReply || streamedPartial || lastGoodLive || '').trim();
        if (!response && candidate && !looksLikePromptEcho(candidate)) {
          response = candidate;
        }
        // Continuity: if the user already read a solid streamed reply, don't swap it for an
        // unrelated failover/sanitize draft (that is the hello→wipe→different-hello flicker).
        {
          const live = String(lastGoodLive || '').trim();
          const final = String(response || '').trim();
          if (live.length >= 24 && final && final !== live && !looksLikePromptEcho(live)) {
            const prefixLen = Math.min(48, live.length, final.length);
            const sameFamily = prefixLen >= 12
              && (final.startsWith(live.slice(0, prefixLen)) || live.startsWith(final.slice(0, prefixLen)));
            if (!sameFamily) {
              response = live;
            }
          }
        }
        if (looksLikeThreadSummaryAsk(content)) {
          // Prefer persisted thread for THIS chat — messagesRef can lag right after a Recent switch.
          let threadMsgs = messagesRef.current.filter(m => m.id !== assistantId);
          if (activeChatId) {
            try {
              const raw = localStorage.getItem(chatThreadKey(activeChatId));
              if (raw) {
                const parsed = JSON.parse(raw);
                const list = Array.isArray(parsed) ? parsed : [];
                if (list.length >= threadMsgs.length) {
                  threadMsgs = list.filter((m: ChatMessage) => m.id !== assistantId);
                }
              }
            } catch { /* keep threadMsgs */ }
          }
          let localSummary = buildThreadSummaryFromMessages([
            ...threadMsgs,
            { role: 'user', content },
          ]);
          // If the in-memory thread is empty after a Recent switch, rebuild from persisted mode thread.
          if (/still short/i.test(localSummary) && activeChatId) {
            try {
              const raw = localStorage.getItem(chatThreadKey(activeChatId));
              if (raw) {
                const parsed = JSON.parse(raw);
                const list = Array.isArray(parsed) ? parsed : (parsed?.messages || []);
                if (Array.isArray(list) && list.length) {
                  localSummary = buildThreadSummaryFromMessages([
                    ...list.filter((m: ChatMessage) => m.id !== assistantId),
                    { role: 'user', content },
                  ]);
                }
              }
            } catch { /* keep localSummary */ }
          }
          const userBits = [
            ...threadMsgs.filter(m => m.role === 'user').map(m => String(m.content || '')),
          ]
            .map(t => t.replace(/<!--[\s\S]*?-->/g, '').trim())
            .filter(Boolean)
            .slice(-8);
          const mentionsThread = userBits.some((u) => {
            const tokens = u.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4).slice(0, 10);
            return tokens.some((w) => response.toLowerCase().includes(w));
          });
          const thin = !response.trim()
            || response.trim().length < 48
            || looksLikePromptEcho(response)
            || /Would you like more information on any of these steps/i.test(response);
          if (thin || !mentionsThread) {
            response = localSummary;
          }
        }
        if (
          looksLikeCopyPasteCodeAsk(content)
          && mode !== 'image'
          && mode !== 'video'
          && (!response.trim() || (!/```[\s\S]+```/.test(response) && response.length < 100))
        ) {
          response = 'No copy-pasteable code yet. Try a stronger model in **Models** or **Local AI**, then ask again.';
        }
        if (routed.full) {
          resolvedProvider = routerProviderLabel(routed.full, providerLabel);
          const hopNote = failoverChipText(routed.full, pinnedModel);
          if (hopNote) setFailoverNote(hopNote);
          if (routed.full.ipcFallback) setIpcFallbackDev(true);
          if (pinnedModel.source === 'auto' && routed.full.source !== 'none') {
            const saveKind =
              mode === 'code' || looksLikeCodeAsk(content) ? 'coding' : threadKind;
            const nextBrain = saveAutoThreadBrain(
              activeChatId,
              saveKind,
              routed.full,
              threadBrainRef.current,
              routed.full.attempted?.length ?? 0,
            );
            if (nextBrain) setThreadBrain(nextBrain);
          }
          if (pinnedModel.source === 'local' && pinnedModel.id !== 'NOVA-auto') {
            setLocalPrefs({ lastChatModelId: pinnedModel.id });
          }
        }
        usedPlugin = true;
        }
      } catch (err) {
        if (idleTimer) window.clearTimeout(idleTimer);
        abandoned = true;
        void engineGenerateCancel({
              chatId: activeChatId,
              jobId: getChatJobId(activeChatId) || genJobId || undefined,
            });
        chatTurnCtlRef.current.clearGenerating();
        const timedOut = err instanceof Error && /timed out/i.test(err.message);
        const rawErr = stopRequestedRef.current && streamedPartial
          ? usableAssistantText(streamedPartial, content, previousAssistant) || ''
          : streamedPartial.trim().length > 8
            ? usableAssistantText(streamedPartial, content, previousAssistant)
              || (looksLikePromptEcho(streamedPartial) ? '' : '')
            : (timedOut
              ? 'Response timed out. Try again or pick another model.'
              : (err instanceof Error ? err.message : 'NOVA Router failed'));
        response = classifyErrorMessage(rawErr || (timedOut
          ? 'Response timed out. Try again or pick another model.'
          : 'Stopped.')).message;
        usedPlugin = true;
      }
    }
    } finally {
      if (idleTimer) window.clearTimeout(idleTimer);
      chatTurnCtlRef.current.clearGenerating();
    }

    // Prefer applying UI/build patches from the RAW reply even if a newer send bumped genSeq
    // (New Chat) — otherwise Preview stays stale while the bubble says done.
    // Always apply to THIS turn's captured folder — never live refs after a chat switch.
    const rawReplyForDiskEarly = String(response || '');
    const diskBoundEarly = Boolean(turnDiskRoot || turnProjectId);
    const keepBuildingDiskEarly = looksLikeKeepBuildingAsk(content) && diskBoundEarly;
    const isUiEditAskEarly = looksLikeCodeEditAsk(content)
      || looksLikeImplementGo(content)
      || looksLikeGreenfieldStartWorkGo(content)
      || keepBuildingDiskEarly;
    const wantsDiskPatchEarly = isUiEditAskEarly || keepBuildingDiskEarly;
    if (
      wantsDiskPatchEarly
      && diskBoundEarly
      && !isMediaMode
      && !pluginId
      && rawReplyForDiskEarly.trim().length > 8
    ) {
      try {
        const { applyChatReplyEdits } = await import('@/lib/chatAgentApply');
        let filesForPatch = { ...turnStudioFiles };
        const root = turnDiskRoot;
        if (root) {
          const hydrated = await loadPreviewFilesFromDisk(root);
          if (Object.keys(hydrated).length) {
            filesForPatch = { ...hydrated, ...filesForPatch };
          }
        }
        const applied = await applyChatReplyEdits({
          reply: rawReplyForDiskEarly,
          projectId: turnProjectId,
          projectName: studioPathBasename(root || '') || undefined,
          files: filesForPatch,
          userMessage: content,
          diskRoot: root,
        });
        if (applied.ok && applied.updated.length) {
          // Only mutate live studio if still bound to this turn's chat/folder.
          const stillSameRoot = String(chatStudioDiskRootRef.current || '') === String(root || '')
            && (!routeChatIdRef.current || routeChatIdRef.current === activeChatId);
          if (stillSameRoot) {
            setChatStudioFiles(applied.files);
            chatStudioFilesRef.current = applied.files;
          }
          if (activeChatId) {
            setChatCodePill(activeChatId, true);
            persistStudioSnapshot(activeChatId, {
              files: applied.files,
              projectId: turnProjectId,
              name: studioPathBasename(root || '') || undefined,
              diskRoot: root,
              previewUrl: stillSameRoot ? previewUrlRef.current : null,
            });
          }
          if (stillSameRoot) void pushLivePreview(applied.files, false);
          response = finalizeCodingChatBubble({
            userMessage: content,
            rawReply: rawReplyForDiskEarly,
            changedPaths: applied.updated,
            applied: true,
            editMode: true,
          });
        } else if (applied.error && applied.error !== 'no_edits') {
          response = [
            String(response || '').trim(),
            '',
            `Could not apply file changes: ${applied.error || applied.reply || 'write failed'}.`,
          ].filter(Boolean).join('\n').trim();
        }
      } catch {
        /* fall through */
      }
    }

    // Newer send/New Chat bumped genSeq — still commit this turn into the origin chat.
    if (mySeq !== genSeqRef.current) {
      const orphan = String(response || '').trim()
        || (stopRequestedRef.current ? '(stopped)' : '');
      if (orphan) {
        chatTurnCtlRef.current.finalizeAssistant(orphan, resolvedProvider, lastLibraryId);
      }
      return;
    }

    if (!isMediaMode && !pluginId && !skipReplySanitize) {
      // Disk apply already attempted above; sanitize for the bubble only.
      const cleaned = usableAssistantText(response, content, previousAssistant);
      const candidate = String(cleaned || response || '').trim();
      response = looksLikePromptEcho(candidate) ? '' : (cleaned || candidate);
      const diskBoundNow = Boolean(chatStudioDiskRootRef.current || chatStudioProjectIdRef.current);
      const pendingIdeaNow = getLastPendingGreenfield(activeChatId);
      const keepBuildingDisk = looksLikeKeepBuildingAsk(content) && diskBoundNow;
      const isUiEditAsk = looksLikeCodeEditAsk(content)
        || looksLikeImplementGo(content)
        || looksLikeGreenfieldStartWorkGo(content)
        || keepBuildingDisk;
      const planningTurn = !isUiEditAsk && !looksLikeSideQuestAsk(content) && (
        shouldInjectPlanningConversation(content, {
          pendingIdea: Boolean(pendingIdeaNow),
          diskRoot: chatStudioDiskRootRef.current || null,
        }) || wantsPlanningOnly(content) || looksLikeConversationalPlanningAsk(content)
      );
      const wantsDiskPatch = isUiEditAsk || keepBuildingDisk;
      const looksLikeDump = /@@@FILE|<!DOCTYPE\b|<html[\s>]|```|export\s+default\s+function|className=|^\s*return\s*\(/im.test(response)
        || ((response.match(/[{};]/g) || []).length >= 10)
        || /\bstruct\s+ContentView\b|\bimport\s+SwiftUI\b/i.test(response);
      const mostlyPlanOutline = response.length > 200
        && ((response.match(/^\s*(?:\d+\.|[-*•])/gm) || []).length >= 2)
        && !/@@@FILE|export\s+default\s+function|className=/i.test(response);
      if (looksLikeDump && !looksLikeCopyPasteCodeAsk(content) && !mostlyPlanOutline) {
        response = finalizeCodingChatBubble({
          userMessage: content,
          rawReply: response,
          // Build/edit: keep work-oriented copy. Planning: prose only.
          editMode: Boolean(isUiEditAsk || (!planningTurn && (diskBoundNow || looksLikeCodeAsk(content) || wantsDiskPatch))),
        });
      }
      if (planningTurn) {
        const { scrubPlanningReply } = await import('@/lib/chatPlanMode');
        response = scrubPlanningReply(response);
      }
      if (looksLikeSideQuestAsk(content)) {
        response = scrubSideQuestBleed(response, content);
        if (looksLikeLyricsAsk(content) && looksLikeInventedLyricsDump(response)) {
          response = honestLyricsUnavailableReply(content);
        } else if (
          looksLikeThinSideQuestReply(response, content)
          || !String(response || '').trim()
        ) {
          response = fallbackAnswerFromLookup(content, sideQuestLookup || { text: '', sources: [], ok: false });
        }
      }
    }
    if (
      !String(response || '').trim()
      && looksLikeDirectJudgmentAsk(content)
    ) {
      // #8 — Never invent MVP advice when there is no live model.
      let liveCap = capacity;
      try {
        liveCap = await probeLiveCapacity();
      } catch { /* keep */ }
      if (liveCap && !liveCap.liveChat) {
        response = honestNoLiveChatReply();
      } else {
      const mapsAsk = /\b(?:google\s*maps|maps?\s+app|map\s+app|navigation\s+app)\b/i.test(content);
      response = mapsAsk
        ? [
          '**How fast:** for a focused MVP (core map view + a couple of layers), a usable beta is often about **3–8 weeks** of steady work — longer if you need heavy offline data, turn-by-turn, or polished mobile releases.',
          '',
          '**Worth building?** **Yes as a personal / niche project** if you care about the craft or a specific use case Google Maps does not cover. As a broad public “Google Maps competitor,” it is harder — the market already has strong apps, so you need a clear niche (private property maps, specialty layers, offline-first, etc.) and real testers.',
          '',
          'Want to lock the niche and a one-month beta scope next?',
        ].join('\n')
        : [
          '**How fast:** a focused MVP is often a few steady weeks; polish and edge cases take longer.',
          '',
          '**Worth building?** Yes if you have a clear niche and real users in mind — not if you are only chasing a crowded generic market.',
          '',
          'Want to lock scope for a one-month beta next?',
        ].join('\n');
      }
    }
    if (stopRequestedRef.current && !response.trim()) {
      response = '(stopped)';
    }
    if (!String(response || '').trim()) {
      if (isMediaMode) {
        response = 'Generation did not finish. Try sending again.';
      } else {
        let liveCap = capacity;
        try {
          liveCap = await probeLiveCapacity();
        } catch { /* keep */ }
        response = (liveCap && !liveCap.liveChat)
          ? honestNoLiveChatReply()
          : 'I couldn’t finish that answer. Check **Models** for a local brain or cloud key, then send again.';
      }
    }

    // Final continuity lock: never flash a different paragraph over what already streamed
    // unless this turn deliberately rewrote for disk apply / coding dump cleanup.
    {
      const live = String(lastGoodLive || '').trim();
      const final = String(response || '').trim();
      const intentionalRewrite = /I applied those updates on disk|Updating your project files on disk|I updated the project files/i.test(final);
      if (
        !isMediaMode
        && !pluginId
        && !intentionalRewrite
        && live.length >= 24
        && final
        && final !== live
        && !looksLikePromptEcho(live)
      ) {
        const prefixLen = Math.min(48, live.length, final.length);
        const sameFamily = prefixLen >= 12
          && (final.startsWith(live.slice(0, prefixLen)) || live.startsWith(final.slice(0, prefixLen)));
        if (!sameFamily) response = live;
      }
    }

    chatTurnCtlRef.current.finalizeAssistant(response, resolvedProvider, lastLibraryId);

    if (mode === 'general') {
      try {
        await saveChatMessage(null, 'user', content);
        await saveChatMessage(null, 'assistant', slimChatContent(response, lastLibraryId), resolvedProvider);
      } catch {
        // offline / guest ok
      }
    }

    // Flush the next queued prompt immediately once Stop is cleared.
    window.setTimeout(() => {
      if (mySeq === genSeqRef.current) flushQueuedSend();
    }, 0);
}
