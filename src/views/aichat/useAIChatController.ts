/**
 * AIChat controller — state, effects, send wiring.
 */
// @ts-nocheck — large closure bag; Frame consumes returned props.
import { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback, type ClipboardEvent as ReactClipboardEvent, type WheelEvent as ReactWheelEvent } from 'react';
import 'react-dom';
import { useAuth } from '@/context/AuthContext';
import { useRouter, type ChatMode } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import '@/lib/api';
import { getLocalPrefs, setLocalPrefs } from '@/lib/localPrefs';
import '@/lib/cloudSources';
import { hasAnyCloudChatKey } from '@/lib/cloudChat';
import { probeLiveCapacity, type LiveCapacity } from '@/lib/novaCapacity';
import '@/lib/novaTips';
import '@/components/RotatingTip';
import '@/components/ParkedNotice';
import {
  BACKUP_DOWNLOAD_EVENT,
} from '@/lib/novaHuntBootstrap';
import {
  chatThreadKey,
  mediaMessageMarkdown,
  rememberThumb,
  resolveCreationDataUrl,
  slimChatContent,
  loadRecentChats,
  isChatDeleted,
} from '@/lib/recentStore';
import { looksLikeImageAsk } from '@/lib/chatIntent';
import '@/lib/chatStudio';
import {
  type StudioIntent,
} from '@/lib/studioAnswerEngine';
import { attachKey, encodeChatAttaches, type ChatAttachMeta } from '@/lib/chatAttach';
import { allowWindowFileDrop, dropHasFiles, imagesFromClipboardData, resolveChatDrop } from '@/lib/chatDrop';
import '@/components/AttachCard';
import { type InspectFinding } from '@/lib/projectInspect';
import '@/lib/projectThread';
import '@/components/GitHubRepoPicker';
import { gitClone, githubCloneUrl } from '@/lib/novaGitClient';
import { type GitHubRepo } from '@/lib/github';
import '@/lib/mediaPrompt';
import '@/lib/mediaBrief';
import '@/lib/novaRouter';
import '@/lib/agentExecution';
import '@/lib/folderPathAsk';
import '@/lib/folderCatalog';
import '@/lib/pcExplore';
import '@/lib/agentTrace';
import '@/lib/workspaceGrants';
import { saveChatStudio, loadChatStudio, clearChatStudio, clearLastListedFolder, setLastDiskTarget, clearLastDiskTarget, clearLastPendingGreenfield, setChatCodePill, hasChatCodePill, chatHasBuildWorkspace, resolveChatProjectRoot, studioPathBasename } from '@/lib/chatStudioStore';
import { hasChatPlanPill, saveChatPlan, setChatPlanPill } from '@/lib/chatPlanStore';
import type { PlanReport as PlanReportData } from '@/lib/planReport';
import '@/lib/studioCommands';
import '@/lib/chatAgentApply';
import '@/lib/novaMultiAgent';
import '@/lib/novaSkills';
import '@/lib/novaQuickEdit';
import {
  beginChatInflight,
  endChatInflight,
  hasChatInflight,
  isChatInflight,
  listInflightChatIds,
} from '@/lib/chatInflight';
import '@/lib/nsfwGate';
import { arkSelfHarmBlockedReply, looksLikeArkSelfHarmAsk } from '@/lib/novaSelfGuard';
import {
  harmfulContentBlockedReply,
  looksLikeHarmfulContentAsk,
} from '@/lib/novaContentSafety';
import { redactArkSelfLeak, looksLikeAgentToolLeak } from '@/lib/replySanitizer';
import { speakText, stopSpeaking, scrubVoiceConstraintEcho, speechRecognitionSupported, startLiveDictation, type LiveDictationHandle } from '@/lib/voiceSession';
import { voiceChatRoute } from '@/lib/voiceRoute';
import { syncAutoVoiceDevices } from '@/lib/voiceAudio';
import type { VoiceSessionPhase } from '@/lib/voiceMode';
import {
  looksLikeVoiceBuildOrEditAsk,
  voiceBuildEditRefuseReply,
} from '@/lib/voiceMode';
import '@/components/VoiceModeLayout';
import '@/lib/novaMcp';
import '@/lib/webProjectCanon';
import { deleteProjectFolderOnDisk } from '@/lib/deleteProjectFlow';
import '@/lib/chatDiskIntent';
import { deleteFileOnDisk } from '@/lib/chatDiskOps';
import '@/lib/chatPcTasks';
import '@/lib/chatProjectDebug';
import '@/lib/diskPathResolve';
import '@/lib/chatAgentExec';
import '@/lib/createProjectIntent';
import '@/lib/chatTurnHandlers';
import '@/lib/chatApplySnapshotStore';
import '@/lib/projectScaffolds';
import '@/lib/chatPlanMode';
import '@/lib/planReport';
import '@/lib/workQueue';
import '@/lib/chatBuildIntent';
import '@/lib/chatCreateBrief';
import '@/lib/chatIdeaIntent';
import { hasActiveWorkspace } from '@/lib/chatAgentTurn';

import {
  clearChatTurnStatus,
  forgetFinishedChatTurnStatus,
  getChatTurnStatus,
} from '@/lib/chatTurnStatusStore';
import { clearPendingStudioBind, writePendingStudioBind } from '@/lib/pendingStudioBind';
import { getCreateJobForChat } from '@/lib/createJobStore';
import { useCreateJob } from '@/hooks/useCreateJob';
import '@/lib/chatCodeReply';
import '@/lib/chatMultiModel';
import '@/lib/codeGitHubWorkflow';
import '@/lib/cloudKeyNudge';
import '@/components/DeleteProjectFolderModal';
import '@/components/DeleteFileModal';
import '@/components/DeleteFolderClarifyModal';
import { type ComposerPlusAction } from '@/components/ComposerPlusMenu';
import '@/components/TokenUsageRing';
import '@/components/NovaErrorInline';
import '@/components/NovaMark';
import '@/lib/chatMultiModelBuild';
import '@/lib/createProgressCopy';
import '@/lib/hybridRoleRouting';
import '@/lib/previewBrowserSmoke';
import '@/lib/createBuildQuality';
import '@/lib/enginePick';
import { shouldPaintStudioLive } from '@/lib/chatTurnIsolation';
import { liveOwnerKey } from '@/lib/liveOwnerKey';
import '@/lib/errors';
import { isVideoTabEnabled, isImageTabEnabled, isVoiceTabEnabled, isDebugComposerParked } from '@/lib/featurePark';
import { notifyChatDone } from '@/lib/activityIndicators';
import '@/lib/speedTest';

import { getTokenUsageRatio } from '@/lib/tokenUsage';
import { getModelHealthRatio } from '@/lib/modelHealth';
import '@/lib/modelRotation';
import '@/lib/chatHistory';
import '@/lib/webSearch';
import { autoPillLabel, brainKindForChatMode, clearThreadBrain, loadThreadBrain, type ThreadBrain } from '@/lib/threadBrain';
import '@/components/MediaMessage';
import '@/components/ChatCodeOverlay';
import { getChatEnabledPlugins, getPluginRuntime, loadPluginState, type PluginDef } from '@/lib/plugins';
import type { ChatMessage } from '@/types';
import 'lucide-react';
import { engineGenerateCancel, getEngineStatus, setEngineModel } from '@/lib/novaEngine';
import '@/lib/chatMediaTurn';
import { refreshLivePreview, ensureBoundFolderPreview, loadPreviewFilesFromDisk } from '@/lib/projectPreview';
import '@/lib/freshSpaFromBrief';
import { classifyMobileTarget, isNativeMobileTree } from '@/lib/mobileTarget';
import { classifyNamedDevice, defaultDeviceForTarget } from '@/lib/mobileDevices';
import '@/lib/siteHeroImages';
import '@/lib/brandAssets';

import { DEBUG_CLINIC_SEED, composerModeFromContent, previewFromText, kindForMode, defaultModelForKind, failoverChipText, PLACEHOLDERS, GREETINGS, pickVoiceGreeting, pickVoiceHoldLine, resolveStudioFiles, persistModeThread, focusComposerIfSafe, type ChatModelOption } from '@/views/aichat/aiChatHelpers';
import { runAIChatSend } from '@/views/aichat/useAIChatSend';

export function useAIChatController() {
  const { user } = useAuth();
  const { route, navigate } = useRouter();
  const { addCreation, addChat, addRecent, touchRecentProject, creations, chats, renameChat } = useRecentProjects();

  // Requirement: each app launch starts on a fresh chat (no resume of last thread).
  // Only strip a chatId that was ALREADY present on first paint. never wipe a chat
  // the user just created in this session (that race left them stuck on New Chat).
  const forceNewChatOnLaunch = useMemo(() => {
    try {
      const key = 'NOVA:session-first-chat-launch';
      const had = sessionStorage.getItem(key);
      if (had) return false;
      sessionStorage.setItem(key, '1');
      return true;
    } catch {
      return true;
    }
  }, []);

  const launchHadChatIdRef = useRef(Boolean(
    route.name === 'chat' && route.chatId && !route.creationId,
  ));
  const didForceNewChatRef = useRef(false);
  const chatRoute = route.name === 'chat' ? route : null;
  const shouldForceNewChat = forceNewChatOnLaunch
    && !didForceNewChatRef.current
    && launchHadChatIdRef.current;

  const effectiveChatId = shouldForceNewChat ? undefined : chatRoute?.chatId;

  const [loading, setLoading] = useState(() => {
    // Blank New Chat must start ready — remount after History delete used to leave
    // loading=true and hide the composer until an effect raced clear.
    if (route.name === 'chat' && !effectiveChatId) return false;
    // Sync-load the active Recent thread so clicking Recent doesn't flash blank.
    if (route.name === 'chat' && effectiveChatId) {
      try {
        const raw = localStorage.getItem(chatThreadKey(effectiveChatId));
        if (raw) return false;
      } catch {
        /* ignore */
      }
    }
    return true;
  });
  const [threadSwitching, setThreadSwitching] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (route.name === 'chat' && effectiveChatId) {
      try {
        const raw = localStorage.getItem(chatThreadKey(effectiveChatId));
        if (raw) return JSON.parse(raw) as ChatMessage[];
      } catch {
        /* ignore */
      }
    }
    return [];
  });
  const [input, setInput] = useState('');
  /** Keep composer text per Chat / Image / Video / Voice — never bleed across tabs. */
  const inputRef = useRef('');
  const composerDraftByModeRef = useRef<Partial<Record<ChatMode, string>>>({});
  const composerModeRef = useRef<ChatMode>(
    route.name === 'chat' && route.mode && route.mode !== 'general' ? route.mode : 'general',
  );
  inputRef.current = input;
  const [mode, setMode] = useState<ChatMode>(() =>
    route.name === 'chat' && route.mode && route.mode !== 'general' ? route.mode : 'general',
  );
  const [activeModel, setActiveModel] = useState<ChatModelOption>(() => {
    const kind = kindForMode(
      route.name === 'chat' && route.mode && route.mode !== 'general' ? route.mode : 'general',
    );
    return defaultModelForKind(kind);
  });
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [chatPlugins, setChatPlugins] = useState<PluginDef[]>(() => getChatEnabledPlugins(loadPluginState()));
  const [ollamaModels, setOllamaModels] = useState<ChatModelOption[]>([]);
  const [engineLocalModels, setEngineLocalModels] = useState<ChatModelOption[]>([]);
  const [engineInstallingModels, setEngineInstallingModels] = useState<ChatModelOption[]>([]);
  const [engineReadyIds, setEngineReadyIds] = useState<Set<string>>(() => new Set());
  const [capacity, setCapacity] = useState<LiveCapacity | null>(null);
  const [generating, setGenerating] = useState(false);
  /** Live turn clock (ms) while generating — drives the stacked timer beside the model picker. */
  const [liveTurnMs, setLiveTurnMs] = useState(0);
  const liveTurnStartRef = useRef<number | null>(null);
  const [voicePhase, setVoicePhase] = useState<VoiceSessionPhase>('idle');
  const voiceGreetSessionRef = useRef(0);
  const lastVoiceGreetRef = useRef<string | null>(null);
  const voiceGreetBusyRef = useRef(false);
  const [dictating, setDictating] = useState(false);
  const [dictationHint, setDictationHint] = useState<string | null>(null);
  const dictationRef = useRef<LiveDictationHandle | null>(null);
  const dictationBaseRef = useRef('');
  /** Bumped to ignore late onInterim/onFinal after stop — otherwise speech overwrites typed keys. */
  const dictationGenRef = useRef(0);
  const stopComposerDictation = useCallback(() => {
    dictationGenRef.current += 1;
    dictationRef.current?.stop();
    dictationRef.current = null;
    setDictating(false);
  }, []);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  useEffect(() => {
    if (!generating) {
      liveTurnStartRef.current = null;
      setLiveTurnMs(0);
      return;
    }
    if (liveTurnStartRef.current == null) {
      liveTurnStartRef.current = Date.now();
    }
    const tick = () => {
      const start = liveTurnStartRef.current;
      if (start == null) return;
      setLiveTurnMs(Date.now() - start);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [generating]);
  const [queueLen, setQueueLen] = useState(0);
  /** Bumps when queue items are edited so the banner re-renders. */
  const [queueTick, setQueueTick] = useState(0);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [editingQueueText, setEditingQueueText] = useState('');
  const editingQueueIdRef = useRef<string | null>(null);
  const [pendingImages, setPendingImages] = useState<{ id: string; name: string; dataUrl: string }[]>([]);
  const [chatStudioFiles, setChatStudioFiles] = useState<Record<string, string>>({});
  const [chatStudioProjectId, setChatStudioProjectId] = useState<string | null>(null);
  const [chatStudioDiskRoot, setChatStudioDiskRoot] = useState<string | null>(null);
  /** Folder/file ready to send with the next message (Cursor-style pending chip). */
  const [pendingAttaches, setPendingAttaches] = useState<ChatAttachMeta[]>([]);
  const [dragOverChat, setDragOverChat] = useState(false);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const dropHintRef = useRef<string | null>(null);
  dropHintRef.current = dropHint;
  const [pathBindOpen, setPathBindOpen] = useState(false);
  const [pathBindDraft, setPathBindDraft] = useState('');
  const pathBindInputRef = useRef<HTMLInputElement>(null);
  const [attachUploading, setAttachUploading] = useState<string | null>(null);
  const [githubPickerOpen, setGithubPickerOpen] = useState(false);
  const [deleteProjectPrompt, setDeleteProjectPrompt] = useState<{ projectName: string; folderPath: string } | null>(null);
  const [deleteProjectBusy, setDeleteProjectBusy] = useState(false);
  const [deleteFilePrompt, setDeleteFilePrompt] = useState<{ fileName: string; filePath: string } | null>(null);
  const [deleteFolderClarifyPrompt, setDeleteFolderClarifyPrompt] = useState<{ folderName: string; folderPath: string } | null>(null);
  const [deleteFileBusy, setDeleteFileBusy] = useState(false);
  const pendingProjectDeleteRef = useRef<{
    assistantId: string;
    chatId: string;
    mode: ChatMode;
    replyStartedAt: number;
    folderPath: string;
    projectId: string | null;
    projectName: string;
    mySeq: number;
  } | null>(null);
  const pendingFileDeleteRef = useRef<{
    assistantId: string;
    chatId: string;
    mode: ChatMode;
    replyStartedAt: number;
    filePath: string;
    fileName: string;
    projectId: string | null;
    relPath: string | null;
    mySeq: number;
  } | null>(null);
  const pendingFolderClarifyRef = useRef<{
    assistantId: string;
    chatId: string;
    mode: ChatMode;
    replyStartedAt: number;
    folderPath: string;
    folderName: string;
    projectId: string | null;
    mySeq: number;
  } | null>(null);
  const [, ] = useState<string | null>(null);
  /** actions = what next; handoff = after inspect */
  const [, ] = useState<'actions' | 'handoff' | null>(null);
  const [githubOfferId, setGithubOfferId] = useState<string | null>(null);
  const [composerMode, setComposerModeState] = useState<'plan' | 'ask' | 'agent' | 'debug' | 'multitask' | null>(null);
  /** Sync pill mode immediately so Debug/Bind + Enter never race a stale closure. */
  const pillModeRef = useRef<'plan' | 'ask' | 'agent' | 'debug' | 'multitask' | null>(null);
  const setComposerMode = (
    next: 'plan' | 'ask' | 'agent' | 'debug' | 'multitask' | null
      | ((prev: 'plan' | 'ask' | 'agent' | 'debug' | 'multitask' | null) => 'plan' | 'ask' | 'agent' | 'debug' | 'multitask' | null),
  ) => {
    if (typeof next === 'function') {
      setComposerModeState((prev) => {
        const resolved = next(prev);
        pillModeRef.current = resolved;
        return resolved;
      });
      return;
    }
    pillModeRef.current = next;
    setComposerModeState(next);
  };
  const [videoDurationSec, setVideoDurationSec] = useState<10 | 20 | 30>(10);
  const [tokenRatio, setTokenRatio] = useState(0);
  const [modelRatio, setModelRatio] = useState(0);
  const [attachBusy, setAttachBusy] = useState(false);
  const stopRequestedRef = useRef(false);
  const generatingRef = useRef(false);
  /** Seed history/sticky for the send IIFE — must survive Rolldown DCE (outer consts were dropped). */
  const chatRouteSeedRef = useRef<{
    history: { role: 'user' | 'assistant'; content: string }[];
    sticky: ReturnType<typeof loadThreadBrain> | null;
  }>({ history: [], sticky: null });
  /**
   * Turn helpers for the send IIFE. Rolldown was leaving bare `clearGeneratingIfMine` /
   * `finalizeAssistant` identifiers inside the IIFE (unbound → ReferenceError), which left
   * Stop + queue stuck after the reply had already finished streaming.
   */
  const chatTurnCtlRef = useRef<{
    clearGenerating: () => void;
    finalizeAssistant: (finalText: string, provider: string, libraryId?: string) => void;
    pushStatus: (label: string) => void;
  }>({
    clearGenerating: () => {},
    finalizeAssistant: () => {},
    pushStatus: () => {},
  });
  /** Which chat id currently owns the in-flight generation (queue only for that chat). */
  const activeGenChatIdRef = useRef<string | null>(null);
  const pendingQueueRef = useRef<{ id: string; text: string; chatId: string }[]>([]);
  const persistChatIdRef = useRef<string | null>(null);
  /** Which chat owns the in-memory studio refs — never open Localhost from another thread's root. */
  const studioBoundChatIdRef = useRef<string | null>(null);
  /** Bumps whenever the visible chat resets — async folder binds must not paint onto a newer canvas. */
  const studioEpochRef = useRef(0);
  /** Always-current route chat id. avoid stale closures when flushing the queue. */
  const routeChatIdRef = useRef<string | undefined>(undefined);
  const ignoreEnterUntilRef = useRef(0);
  /** Blocks double Enter / click from queueing the same prompt on top of itself. */
  const lastSendGuardRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const sendMessageRef = useRef<(content: string) => Promise<void>>(async () => {});
  const tryStartTurn = (text: string) => {
    if (generatingRef.current) return;
    const t = String(text || '').trim();
    if (!t) return;
    void sendMessageRef.current(t);
  };
  /** Try again: replace the assistant reply in place — no new user bubble. */
  const regeneratePendingRef = useRef(false);
  const regenerateReply = (assistantId: string) => {
    if (generatingRef.current) return;
    const msgs = messagesRef.current;
    const aIdx = msgs.findIndex((m) => m.id === assistantId);
    if (aIdx < 0 || msgs[aIdx]?.role !== 'assistant') return;
    let uIdx = -1;
    for (let i = aIdx - 1; i >= 0; i -= 1) {
      if (msgs[i]?.role === 'user') {
        uIdx = i;
        break;
      }
    }
    if (uIdx < 0) return;
    const prompt = String(msgs[uIdx].content || '').replace(/<!--[\s\S]*?-->/g, '').trim();
    if (!prompt) return;
    try {
      forgetFinishedChatTurnStatus(assistantId);
    } catch { /* ignore */ }
    // Keep through the user ask; drop this assistant and anything after it.
    const kept = msgs.slice(0, uIdx + 1);
    messagesRef.current = kept;
    setMessages(kept);
    const chatId = routeChatIdRef.current || persistChatIdRef.current;
    if (chatId) {
      try {
        persistModeThread(mode, kept, { chatId });
      } catch { /* ignore */ }
    }
    regeneratePendingRef.current = true;
    void sendMessageRef.current(prompt);
  };
  /** Bumps on every new send/stop so late chunks from an old turn cannot stick Stop/queue. */
  const genSeqRef = useRef(0);
  /** Per-chat generation ids — sending in chat B must not abort chat A's create. */
  const genSeqByChatRef = useRef<Record<string, number>>({});
  const stopRequestedByChatRef = useRef<Record<string, boolean>>({});
  const persistTimerRef = useRef<number | undefined>(undefined);
  const activeModelRef = useRef(activeModel);
  const [failoverNote, setFailoverNote] = useState<string | null>(null);
  const [ipcFallbackDev, setIpcFallbackDev] = useState(false);
  /** Auto: equipped brain for this chat thread (sticky until failover). */
  const [threadBrain, setThreadBrain] = useState<ThreadBrain | null>(() => {
    if (route.name === 'chat' && effectiveChatId) {
      const m = route.mode && route.mode !== 'general' ? route.mode : 'general';
      return loadThreadBrain(effectiveChatId, brainKindForChatMode(m));
    }
    return null;
  });
  const threadBrainRef = useRef<ThreadBrain | null>(threadBrain);
  /** Live create hop label for the Multimodal pill (Craft · Qwen Coder…). */
  const [createLiveModelLabel, setCreateLiveModelLabel] = useState<string | null>(null);
  const [setupNote, setSetupNote] = useState<string | null>(() => {
    try {
      return localStorage.getItem('NOVA:setup-brain-note');
    } catch {
      return null;
    }
  });
  const [menuPos, setMenuPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  /** Once the user scrolls up during a turn, stay detached until they jump/send. */
  const userDetachScrollRef = useRef(false);
  /** Ignore scroll events briefly after chat switch / thread load (layout can falsely detach). */
  const ignoreScrollUntilRef = useRef(0);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const hydratedCreationRef = useRef<string | null>(null);
  /** Skip storage reload after we create a chat so Explore ideas doesn't flash back. */
  const skipChatLoadIdsRef = useRef<Set<string>>(new Set());
  /** Which chatId the in-memory messagesRef currently belongs to (prevents skip-load leaking another thread). */
  const messagesChatIdRef = useRef<string | null>(null);
  const messagesRef = useRef(messages);
  const imageBriefRef = useRef<{ chatId: string; original: string } | null>(null);
  useRef('');
  useState<string | null>(null);
  const [imageSwitchDismissed, setImageSwitchDismissed] = useState(false);
  const [codePillSticky, setCodePillSticky] = useState(false);
  const [codeOverlayOpen, setCodeOverlayOpen] = useState(false);
  /** Fake-code typing demo (Preview) — does not touch the real project files. */
  const [codeTypingDemo, setCodeTypingDemo] = useState(false);
  const [codeDemoFiles, setCodeDemoFiles] = useState<Record<string, string>>({});
  const codeDemoTimerRef = useRef<number | null>(null);
  const [planOverlayOpen, setPlanOverlayOpen] = useState(false);
  const [planPillSticky, setPlanPillSticky] = useState(false);
  const [planLiveDrafting, setPlanLiveDrafting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const activeChatId = route.name === 'chat' ? route.chatId : undefined;
  const createJobLive = useCreateJob(activeChatId);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const chatStudioFilesRef = useRef<Record<string, string>>({});
  const chatStudioProjectIdRef = useRef<string | null>(null);
  const chatStudioDiskRootRef = useRef<string | null>(null);
  useRef('');
  const lastStudioIntentRef = useRef<StudioIntent | null>(null);
  const lastFindingsRef = useRef<InspectFinding[]>([]);
  const lastFolderLocateNoteRef = useRef<string | null>(null);
  chatStudioFilesRef.current = chatStudioFiles;
  chatStudioProjectIdRef.current = chatStudioProjectId;
  chatStudioDiskRootRef.current = chatStudioDiskRoot;
  previewUrlRef.current = previewUrl;

  const persistStudioSnapshot = (
    chatId: string,
    patch?: {
      files?: Record<string, string>;
      projectId?: string | null;
      name?: string;
      diskRoot?: string | null;
      previewUrl?: string | null;
    },
  ) => {
    if (!chatId) return;
    // Refs belong to studioBoundChatIdRef only. If unbound / other chat, never
    // copy that disk root into this thread (that was the Localhost bleed).
    const boundHere = studioBoundChatIdRef.current === chatId;
    const existing = boundHere ? null : loadChatStudio(chatId);
    const files = patch?.files
      ?? (boundHere ? chatStudioFilesRef.current : (existing?.files || {}));
    const diskRoot = patch?.diskRoot !== undefined
      ? patch.diskRoot
      : (boundHere ? chatStudioDiskRootRef.current : (existing?.diskRoot || null));
    if (!Object.keys(files).length && !diskRoot) return;
    saveChatStudio(chatId, {
      files,
      projectId: patch?.projectId !== undefined
        ? patch.projectId
        : (boundHere ? chatStudioProjectIdRef.current : (existing?.projectId || null)),
      name: patch?.name ?? (boundHere ? undefined : existing?.name),
      diskRoot,
      previewUrl: patch?.previewUrl !== undefined
        ? patch.previewUrl
        : (boundHere ? previewUrlRef.current : (existing?.previewUrl || null)),
    });
  };

  const applyStudioBinding = (
    chatId: string,
    snap: {
      files?: Record<string, string>;
      projectId?: string | null;
      name?: string;
      diskRoot?: string | null;
      previewUrl?: string | null;
    } | null,
  ) => {
    studioBoundChatIdRef.current = chatId;
    const files = snap?.files || {};
    setChatStudioFiles(files);
    chatStudioFilesRef.current = files;
    setChatStudioProjectId(snap?.projectId || null);
    chatStudioProjectIdRef.current = snap?.projectId || null;
    setChatStudioDiskRoot(snap?.diskRoot || null);
    chatStudioDiskRootRef.current = snap?.diskRoot || null;
    setPreviewUrl(snap?.previewUrl || null);
    previewUrlRef.current = snap?.previewUrl || null;
  };

  /**
   * #7 — Persist studio to the owning chat always; only paint live UI when that chat is on screen.
   * Prevents mid-build switches from binding the wrong folder / Preview onto another thread.
   */
  const commitStudioForChat = (
    chatId: string,
    snap: {
      files?: Record<string, string>;
      projectId?: string | null;
      name?: string;
      diskRoot?: string | null;
      previewUrl?: string | null;
    },
    opts?: { paintLive?: boolean },
  ) => {
    if (!chatId) return;
    persistStudioSnapshot(chatId, snap);
    const paint = opts?.paintLive ?? shouldPaintStudioLive(routeChatIdRef.current, chatId);
    if (paint) {
      applyStudioBinding(chatId, {
        files: snap.files ?? {},
        projectId: snap.projectId ?? null,
        name: snap.name,
        diskRoot: snap.diskRoot ?? null,
        previewUrl: snap.previewUrl ?? null,
      });
    }
  };

  const rebindStudioForChat = async (chatId: string) => {
    const title = loadRecentChats().find(c => c.id === chatId)?.title || null;
    const resolved = await resolveChatProjectRoot({ chatId, chatTitle: title });
    if (routeChatIdRef.current && routeChatIdRef.current !== chatId) return;
    applyStudioBinding(chatId, {
      files: resolved.files,
      projectId: resolved.projectId,
      name: resolved.name,
      diskRoot: resolved.diskRoot,
      previewUrl: resolved.previewUrl,
    });
  };

  /** Preview window id is always this chat — never another thread's localhost. */
  const previewWindowIdForChat = (chatId?: string | null) =>
    liveOwnerKey(chatId || persistChatIdRef.current);

  const clearWorkspaceBinding = useCallback((chatId: string) => {
    if (studioBoundChatIdRef.current === chatId) {
      studioBoundChatIdRef.current = null;
    }
    setChatStudioFiles({});
    chatStudioFilesRef.current = {};
    setChatStudioProjectId(null);
    chatStudioProjectIdRef.current = null;
    setChatStudioDiskRoot(null);
    chatStudioDiskRootRef.current = null;
    setPreviewUrl(null);
    setCodePillSticky(false);
    clearChatStudio(chatId);
  }, []);

  const finishPendingDeleteReply = useCallback((
    assistantId: string,
    chatId: string,
    threadMode: ChatMode,
    replyText: string,
    replyStartedAt: number,
  ) => {
    const reply: ChatMessage = {
      id: assistantId,
      user_id: user?.id ?? 'guest',
      project_id: null,
      role: 'assistant',
      content: replyText,
      provider_used: 'NOVA',
      created_at: new Date().toISOString(),
      elapsed_ms: Date.now() - replyStartedAt,
    };
    const patch = (list: ChatMessage[]) => list.map(m => (m.id === assistantId ? reply : m));
    const viewingThis = Boolean(chatId && routeChatIdRef.current === chatId);
    let next = viewingThis
      ? patch(messagesRef.current)
      : (() => {
        try {
          const raw = localStorage.getItem(chatThreadKey(chatId));
          const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
          if (Array.isArray(stored) && stored.some(m => m.id === assistantId)) return patch(stored);
        } catch { /* ignore */ }
        return patch(messagesRef.current);
      })();
    if (!next.some(m => m.id === assistantId)) {
      try {
        const raw = localStorage.getItem(chatThreadKey(chatId));
        const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
        if (Array.isArray(stored) && stored.some(m => m.id === assistantId)) next = patch(stored);
      } catch { /* ignore */ }
    }
    if (viewingThis) {
      messagesRef.current = next;
      messagesChatIdRef.current = chatId;
      setMessages(next);
    } else {
      setMessages(prev => prev);
    }
    persistModeThread(threadMode, next, { chatId });
    generatingRef.current = false;
    if (activeGenChatIdRef.current === chatId) {
      activeGenChatIdRef.current = null;
    }
    setGenerating(false);
    notifyChatDone(chatId);
  }, [user?.id]);

  const handleDeleteProjectCancel = useCallback(() => {
    const pending = pendingProjectDeleteRef.current;
    pendingProjectDeleteRef.current = null;
    setDeleteProjectPrompt(null);
    if (!pending) return;
    finishPendingDeleteReply(
      pending.assistantId,
      pending.chatId,
      pending.mode,
      'Delete canceled.',
      pending.replyStartedAt,
    );
  }, [finishPendingDeleteReply]);

  const handleDeleteProjectConfirm = useCallback(async () => {
    const pending = pendingProjectDeleteRef.current;
    if (!pending || deleteProjectBusy) return;
    setDeleteProjectBusy(true);

    const {
      assistantId,
      chatId,
      mode: threadMode,
      folderPath,
      projectId,
      projectName,
      replyStartedAt,
      mySeq,
    } = pending;

    const statusContent = '__generating__:chat:Deleting project folder…';
    setMessages(prev => {
      const next = prev.map(m => (m.id === assistantId ? { ...m, content: statusContent } : m));
      messagesRef.current = next;
      return next;
    });

    try {
      const boundRoot = String(chatStudioDiskRootRef.current || '').replace(/[/\\]+$/, '').toLowerCase();
      const deletedRoot = String(folderPath || '').replace(/[/\\]+$/, '').toLowerCase();
      if (boundRoot && deletedRoot && boundRoot === deletedRoot) {
        clearWorkspaceBinding(chatId);
      }
      clearLastListedFolder(chatId);
      clearLastDiskTarget(chatId);
      const del = await deleteProjectFolderOnDisk({ folderPath, projectId });
      void mySeq;
      const text = del.ok
        ? `Deleted **${projectName}** from your PC.\n\n\`${del.path || folderPath}\``
        : (del.error || `Could not delete **${projectName}**. Close File Explorer if that folder is open, then try again.`);
      // Always finalize origin chat — genSeq bumps (Stop / New Chat) must not leave Deleting…
      finishPendingDeleteReply(assistantId, chatId, threadMode, text, replyStartedAt);
    } catch (err) {
      finishPendingDeleteReply(
        assistantId,
        chatId,
        threadMode,
        err instanceof Error ? err.message : 'Delete failed.',
        replyStartedAt,
      );
    } finally {
      setDeleteProjectBusy(false);
      setDeleteProjectPrompt(null);
      pendingProjectDeleteRef.current = null;
    }
  }, [clearWorkspaceBinding, deleteProjectBusy, finishPendingDeleteReply]);

  const handleDeleteFileCancel = useCallback(() => {
    const pending = pendingFileDeleteRef.current;
    pendingFileDeleteRef.current = null;
    setDeleteFilePrompt(null);
    if (!pending) return;
    finishPendingDeleteReply(
      pending.assistantId,
      pending.chatId,
      pending.mode,
      'Delete canceled.',
      pending.replyStartedAt,
    );
  }, [finishPendingDeleteReply]);

  const handleDeleteFileConfirm = useCallback(async () => {
    const pending = pendingFileDeleteRef.current;
    if (!pending || deleteFileBusy) return;
    setDeleteFileBusy(true);

    const {
      assistantId,
      chatId,
      mode: threadMode,
      filePath,
      fileName,
      projectId,
      relPath,
      replyStartedAt,
      mySeq,
    } = pending;

    const statusContent = '__generating__:chat:Deleting file…';
    setMessages(prev => {
      const next = prev.map(m => (m.id === assistantId ? { ...m, content: statusContent } : m));
      messagesRef.current = next;
      return next;
    });

    try {
      const del = await deleteFileOnDisk({ filePath, projectId, relPath });
      void mySeq;
      if (del.ok && relPath && projectId) {
        const nextFiles = { ...chatStudioFilesRef.current };
        delete nextFiles[relPath];
        setChatStudioFiles(nextFiles);
        chatStudioFilesRef.current = nextFiles;
        persistStudioSnapshot(chatId, {
          files: nextFiles,
          projectId,
          diskRoot: chatStudioDiskRootRef.current,
        });
      }
      if (del.ok) clearLastDiskTarget(chatId);
      const text = del.ok
        ? `Deleted **${fileName}**.\n\n\`${del.path || filePath}\``
        : (del.error || `Could not delete **${fileName}**. Close the app using that file, then try again.`);
      finishPendingDeleteReply(assistantId, chatId, threadMode, text, replyStartedAt);
    } catch (err) {
      finishPendingDeleteReply(
        assistantId,
        chatId,
        threadMode,
        err instanceof Error ? err.message : 'Delete failed.',
        replyStartedAt,
      );
    } finally {
      setDeleteFileBusy(false);
      setDeleteFilePrompt(null);
      pendingFileDeleteRef.current = null;
    }
  }, [deleteFileBusy, finishPendingDeleteReply]);

  const handleFolderClarifyCancel = useCallback(() => {
    const pending = pendingFolderClarifyRef.current;
    pendingFolderClarifyRef.current = null;
    setDeleteFolderClarifyPrompt(null);
    if (!pending) return;
    finishPendingDeleteReply(
      pending.assistantId,
      pending.chatId,
      pending.mode,
      'Delete canceled.',
      pending.replyStartedAt,
    );
  }, [finishPendingDeleteReply]);

  const handleFolderClarifyConfirm = useCallback(async () => {
    const pending = pendingFolderClarifyRef.current;
    if (!pending || deleteFileBusy) return;
    setDeleteFileBusy(true);

    const {
      assistantId,
      chatId,
      mode: threadMode,
      folderPath,
      folderName,
      projectId,
      replyStartedAt,
      mySeq,
    } = pending;

    const statusContent = '__generating__:chat:Deleting project folder…';
    setMessages(prev => {
      const next = prev.map(m => (m.id === assistantId ? { ...m, content: statusContent } : m));
      messagesRef.current = next;
      return next;
    });

    try {
      const boundRoot = String(chatStudioDiskRootRef.current || '').replace(/[/\\]+$/, '').toLowerCase();
      const deletedRoot = String(folderPath || '').replace(/[/\\]+$/, '').toLowerCase();
      if (boundRoot && deletedRoot && boundRoot === deletedRoot) {
        clearWorkspaceBinding(chatId);
      }
      clearLastListedFolder(chatId);
      clearLastDiskTarget(chatId);
      const del = await deleteProjectFolderOnDisk({ folderPath, projectId });
      void mySeq;
      const text = del.ok
        ? `Deleted **${folderName}** from your PC.\n\n\`${del.path || folderPath}\``
        : (del.error || `Could not delete **${folderName}**. Close File Explorer if that folder is open, then try again.`);
      finishPendingDeleteReply(assistantId, chatId, threadMode, text, replyStartedAt);
    } catch (err) {
      finishPendingDeleteReply(
        assistantId,
        chatId,
        threadMode,
        err instanceof Error ? err.message : 'Delete failed.',
        replyStartedAt,
      );
    } finally {
      setDeleteFileBusy(false);
      setDeleteFolderClarifyPrompt(null);
      pendingFolderClarifyRef.current = null;
    }
  }, [clearWorkspaceBinding, deleteFileBusy, finishPendingDeleteReply]);

  useEffect(() => {
    activeModelRef.current = activeModel;
  }, [activeModel]);

  useEffect(() => {
    threadBrainRef.current = threadBrain;
  }, [threadBrain]);

  useEffect(() => {
    const onBackup = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string }>).detail;
      if (detail?.name) setFailoverNote(`Downloading backup · ${detail.name}`);
    };
    window.addEventListener(BACKUP_DOWNLOAD_EVENT, onBackup);
    return () => window.removeEventListener(BACKUP_DOWNLOAD_EVENT, onBackup);
  }, []);

  // Agents Kanban → Retry in Chat: seed composer with the create brief.
  useEffect(() => {
    const applyBrief = (brief: string) => {
      const text = String(brief || '').trim();
      if (!text) return;
      setInput(text);
      inputRef.current = text;
      requestAnimationFrame(() => focusComposerIfSafe(textareaRef.current));
      setDropHint('Retry from Agents — press Enter to run create again.');
    };
    const onRetry = (event: Event) => {
      const detail = (event as CustomEvent<{ brief?: string }>).detail;
      if (detail?.brief) applyBrief(detail.brief);
    };
    try {
      const pending = sessionStorage.getItem('nova-agents-retry-brief');
      if (pending) {
        sessionStorage.removeItem('nova-agents-retry-brief');
        applyBrief(pending);
      }
    } catch { /* ignore */ }
    window.addEventListener('nova-agents-retry', onRetry as EventListener);
    return () => window.removeEventListener('nova-agents-retry', onRetry as EventListener);
  }, []);

  useEffect(() => {
    if (generatingRef.current && messagesRef.current.length > messages.length) return;
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!shouldForceNewChat) {
      // No launch-time thread to clear. never steal later navigations.
      if (forceNewChatOnLaunch) didForceNewChatRef.current = true;
      return;
    }
    didForceNewChatRef.current = true;
    const nextMode = chatRoute?.mode && chatRoute.mode !== 'general' ? chatRoute.mode : undefined;
    navigate({ name: 'chat', mode: nextMode });
  }, [shouldForceNewChat, forceNewChatOnLaunch, navigate, chatRoute?.mode]);

  useEffect(() => {
    if (route.name !== 'chat') {
      // Keep the active thread id while a gen is in flight (Settings / Local AI hops).
      if (!generatingRef.current && !hasChatInflight()) {
        routeChatIdRef.current = undefined;
      }
      return;
    }
    if (effectiveChatId) {
      routeChatIdRef.current = effectiveChatId;
      persistChatIdRef.current = effectiveChatId;
      return;
    }
    // Blank New Chat / Image / Video — always detach the view from the prior thread, even if
    // a background reply is still finishing. Keeping routeChatIdRef mid-gen painted the old
    // story onto the empty starter and left queue/Stop chrome looking "stuck on New Chat".
    routeChatIdRef.current = undefined;
    persistChatIdRef.current = null;
  }, [route, effectiveChatId]);

  const refreshChatPlugins = () => {
    setChatPlugins(getChatEnabledPlugins(loadPluginState()));
  };

  const greeting = useMemo(
    () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
    [],
  );

  const placeholder = useMemo(() => {
    const list = PLACEHOLDERS[mode];
    return list[Math.floor(Math.random() * list.length)];
  }, [mode]);

  const workspaceBadgeLabel = useMemo(() => {
    // Bound disk path always wins — never use chat title (that became "Add a one-line…").
    if (chatStudioDiskRoot) {
      return studioPathBasename(chatStudioDiskRoot) || chatStudioDiskRoot;
    }
    if (pendingAttaches[0]?.name) return pendingAttaches[0].name;
    const chatId = route.name === 'chat' ? route.chatId : undefined;
    if (chatId) {
      const snap = loadChatStudio(chatId);
      if (snap?.diskRoot) return studioPathBasename(snap.diskRoot) || snap.diskRoot;
      // No disk bind yet — do not show a fake folder pill from chat title / snap.name.
    }
    if (Object.keys(chatStudioFiles).length) return 'Attached project';
    return null;
  }, [pendingAttaches, chatStudioDiskRoot, chatStudioFiles, route]);

  const showStudioPills = useMemo(() => {
    const chatId = route.name === 'chat' ? route.chatId : undefined;
    if (codePillSticky) return true;
    if (!chatId) return false;
    if (!chatHasBuildWorkspace(chatId)) return false;
    return Boolean(
      chatStudioDiskRoot
      || previewUrl
      || Object.keys(chatStudioFiles).length > 0
      || chatStudioProjectId,
    );
  }, [
    route,
    codePillSticky,
    chatStudioDiskRoot,
    previewUrl,
    chatStudioFiles,
    chatStudioProjectId,
  ]);

  const autoModelLabel = useMemo(() => {
    if (createLiveModelLabel) return createLiveModelLabel;
    return autoPillLabel(threadBrain);
  }, [createLiveModelLabel, threadBrain]);
  const threadKind = useMemo(() => brainKindForChatMode(mode), [mode]);

  const unpickAutoSticky = () => {
    const chatId = routeChatIdRef.current ?? persistChatIdRef.current;
    if (chatId) clearThreadBrain(chatId, threadKind);
    setThreadBrain(null);
  };

  useEffect(() => {
    if (route.name !== 'chat') return;
    const next = route.mode && route.mode !== 'general' ? route.mode : 'general';
    const prev = composerModeRef.current;
    if (prev !== next) {
      // Stash outgoing tab text, restore the destination tab's own draft (or empty).
      composerDraftByModeRef.current[prev] = inputRef.current;
      let nextDraft = composerDraftByModeRef.current[next] ?? '';
      if (next === 'image' || next === 'video') {
        try {
          const handoff = localStorage.getItem(`NOVA:chat-draft:${next}`);
          if (handoff != null) {
            nextDraft = handoff;
            localStorage.removeItem(`NOVA:chat-draft:${next}`);
          }
        } catch {
          /* ignore */
        }
      }
      setInput(nextDraft);
      inputRef.current = nextDraft;
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      composerModeRef.current = next;
    }
    setMode(next);
    const kind = kindForMode(next);
    // Restore pinned Multimodal / local / cloud chat model from prefs (not force-Auto).
    setActiveModel(prevModel => {
      if (kind === 'chat') return defaultModelForKind('chat');
      return prevModel.kind === kind ? prevModel : defaultModelForKind(kind);
    });
  }, [route, navigate]);

  useEffect(() => {
    const onNew = () => {
      navigate({ name: 'chat' });
    };
    window.addEventListener('NOVA:new-chat', onNew);
    return () => window.removeEventListener('NOVA:new-chat', onNew);
  }, [navigate]);

  // Returning to Chat (e.g. after History delete → navigate) must never leave the
  // Loading shell or a deleted-thread busy flag covering the textarea.
  useEffect(() => {
    if (route.name !== 'chat') return;
    const chatId = route.chatId;
    if (chatId && isChatDeleted(chatId)) return; // handled by load effect → blank chat
    if (!chatId) {
      setLoading(false);
      setThreadSwitching(false);
      // Blank canvas: hide Stop unless a background non-view gen is intentionally live.
      const bgLive = Boolean(
        activeGenChatIdRef.current
        && (generatingRef.current || isChatInflight(activeGenChatIdRef.current)),
      );
      if (!bgLive) {
        setGenerating(false);
      }
      requestAnimationFrame(() => focusComposerIfSafe(textareaRef.current));
    }
  }, [route]);

  // After History/sidebar chat delete: permanently unlock the composer.
  // Prior bug: only unlocked when deleted id matched view/gen refs — stale inflight,
  // legacy beginChatInflight(), stuck loading, or deleted-chat re-navigation left the
  // textarea unusable ("timing out" / cannot type) after delete.
  useEffect(() => {
    const unlockComposerAfterDelete = (deletedIds: string[]) => {
      const deleted = new Set((deletedIds || []).map(String).filter(Boolean));
      const viewing = routeChatIdRef.current || persistChatIdRef.current || null;
      const genId = activeGenChatIdRef.current;
      const hitView = Boolean(viewing && deleted.has(viewing));
      const hitGen = Boolean(genId && deleted.has(genId));

      // Always end inflight slots for deleted chats (and drain legacy leftovers).
      for (const id of deleted) {
        try { endChatInflight(id); } catch { /* ignore */ }
      }
      try {
        const status = getChatTurnStatus();
        if (!status || (status.chatId && deleted.has(status.chatId)) || hitView || hitGen) {
          clearChatTurnStatus();
        }
      } catch { /* ignore */ }
      try {
        const rawInflight = sessionStorage.getItem('NOVA:inflight-media');
        if (rawInflight) {
          const inflight = JSON.parse(rawInflight) as { chatId?: string };
          if (!inflight?.chatId || deleted.has(String(inflight.chatId))) {
            sessionStorage.removeItem('NOVA:inflight-media');
          }
        }
      } catch { /* ignore */ }

      // Unlock whenever the deleted set touched this view/gen, OR there is no remaining
      // live work for a non-deleted chat (covers legacyCount / orphaned generatingRef).
      const otherLive = Boolean(
        genId
        && !deleted.has(genId)
        && (generatingRef.current || isChatInflight(genId)),
      ) || listInflightChatIds().some((id) => !deleted.has(id));

      if (hitGen || hitView || !otherLive) {
        generatingRef.current = false;
        activeGenChatIdRef.current = null;
        setGenerating(false);
        // Drain legacy beginChatInflight() counters that keep keepChatAlive / Stop stuck.
        if (!otherLive) {
          try {
            while (hasChatInflight()) endChatInflight();
          } catch { /* ignore */ }
        }
      }

      if (hitView || (viewing && deleted.has(viewing))) {
        setMessages([]);
        messagesRef.current = [];
        messagesChatIdRef.current = null;
        persistChatIdRef.current = null;
        routeChatIdRef.current = undefined;
      }

      // Never leave the Loading-chat shell up after a wipe (hides the composer).
      setLoading(false);
      setThreadSwitching(false);
      setDropHint(null);
      stopComposerDictation();

      // Focus after History→Chat paint; chat may still be aria-hidden for one frame.
      const focus = () => focusComposerIfSafe(textareaRef.current);
      requestAnimationFrame(() => {
        focus();
        window.setTimeout(focus, 50);
        window.setTimeout(focus, 200);
      });
    };

    const onBulkDeleted = (ev: Event) => {
      const detail = (ev as CustomEvent<{ chatIds?: string[] }>).detail;
      unlockComposerAfterDelete(detail?.chatIds || []);
    };
    window.addEventListener('NOVA:chats-bulk-deleted', onBulkDeleted);
    return () => window.removeEventListener('NOVA:chats-bulk-deleted', onBulkDeleted);
  }, [stopComposerDictation]);

  useEffect(() => {
    if (mode !== 'voice') {
      setVoicePhase('idle');
      stopSpeaking();
      voiceGreetBusyRef.current = false;
      voiceGreetSessionRef.current += 1;
      return;
    }
    setMessages([]);
    messagesRef.current = [];
    persistChatIdRef.current = null;
    routeChatIdRef.current = undefined;
    activeGenChatIdRef.current = null;
    setGenerating(false);
    generatingRef.current = false;
    const syncTimer = window.setTimeout(() => {
      void syncAutoVoiceDevices();
    }, 0);

    // One greeting only per Voice enter — never stack lines.
    const session = ++voiceGreetSessionRef.current;
    voiceGreetBusyRef.current = false;
    const greetTimer = window.setTimeout(() => {
      if (session !== voiceGreetSessionRef.current) return;
      if (voiceGreetBusyRef.current || generatingRef.current) return;
      voiceGreetBusyRef.current = true;
      stopSpeaking();
      const line = pickVoiceGreeting(lastVoiceGreetRef.current);
      lastVoiceGreetRef.current = line;
      void (async () => {
        try {
          await speakText(line, {
            onPlaybackStart: () => {
              if (session === voiceGreetSessionRef.current) setVoicePhase('speaking');
            },
          });
        } finally {
          if (session === voiceGreetSessionRef.current) {
            voiceGreetBusyRef.current = false;
            setVoicePhase('idle');
          }
        }
      })();
    }, 1100);

    return () => {
      window.clearTimeout(syncTimer);
      window.clearTimeout(greetTimer);
      // Invalidate this visit so a Strict Mode remount cannot double-speak.
      if (session === voiceGreetSessionRef.current) {
        voiceGreetSessionRef.current += 1;
      }
    };
  }, [mode]);

  // After Chat → Image handoff, auto-send the carried prompt once.
  useEffect(() => {
    if (route.name !== 'chat' || mode !== 'image') return;
    let prompt: string | null = null;
    try {
      if (sessionStorage.getItem('NOVA:image-handoff-send') === '1') {
        prompt = sessionStorage.getItem('NOVA:image-handoff-prompt');
        sessionStorage.removeItem('NOVA:image-handoff-send');
        sessionStorage.removeItem('NOVA:image-handoff-prompt');
      }
    } catch {
      /* ignore */
    }
    if (!prompt || generatingRef.current) return;
    const t = window.setTimeout(() => {
      if (!generatingRef.current && prompt) void sendMessageRef.current(prompt);
    }, 120);
    return () => window.clearTimeout(t);
  }, [mode, route.name]);

  // Open a Recent creation into a continuable Image/Video chat thread.
  useEffect(() => {
    if (route.name !== 'chat' || !route.creationId || route.chatId) {
      if (route.name === 'chat' && !route.creationId) {
        hydratedCreationRef.current = null;
      }
      return;
    }
    const creationId = route.creationId;
    if (hydratedCreationRef.current === creationId) return;
    const creation = creations.find(c => c.id === creationId);
    if (!creation) return;

    hydratedCreationRef.current = creationId;
    const tab = creation.kind === 'video'
      ? (isVideoTabEnabled() ? 'video' : 'general')
      : (isImageTabEnabled() ? 'image' : 'general');
    let cancelled = false;

    void (async () => {
      setLoading(true);
      const dataUrl = await resolveCreationDataUrl(creation);
      if (cancelled) return;
      if (dataUrl) rememberThumb(creation.id, dataUrl);
      const assistantContent = mediaMessageMarkdown(
        creation.title || creation.prompt,
        creation.id,
        dataUrl || undefined,
      );
      const seeded: ChatMessage[] = [
        {
          id: `seed-u-${creation.id}`,
          user_id: user?.id || 'guest',
          project_id: null,
          role: 'user',
          content: creation.prompt || creation.title,
          provider_used: null,
          created_at: creation.createdAt,
        },
        {
          id: `seed-a-${creation.id}`,
          user_id: user?.id || 'guest',
          project_id: null,
          role: 'assistant',
          content: slimChatContent(assistantContent, creation.id),
          provider_used: creation.modelName,
          created_at: creation.createdAt,
        },
      ];
      try {
        const raw = localStorage.getItem(`NOVA:chat-thread:creation:${creationId}`);
        if (raw) {
          const existing = JSON.parse(raw) as ChatMessage[];
          if (Array.isArray(existing) && existing.length > 0) {
            setMessages(existing);
            setMode(tab);
            setActiveModel(defaultModelForKind(
              tab === 'video' ? 'video' : tab === 'image' ? 'image' : 'chat',
            ));
            setLoading(false);
            return;
          }
        }
      } catch {
        /* ignore */
      }
      setMessages(seeded);
      try {
        localStorage.setItem(`NOVA:chat-thread:creation:${creationId}`, JSON.stringify(seeded));
      } catch {
        /* ignore */
      }
      setMode(tab);
      setActiveModel(defaultModelForKind(
        tab === 'video' ? 'video' : tab === 'image' ? 'image' : 'chat',
      ));
      setLoading(false);
      requestAnimationFrame(() => focusComposerIfSafe(textareaRef.current));
    })();

    return () => {
      cancelled = true;
    };
  }, [route, creations, navigate, user?.id]);

  // Load thread: Recent chatId, or empty New Chat / Image / Video starter.
  useEffect(() => {
    if (route.name !== 'chat') return;
    if (route.creationId && !route.chatId) return;

    const kind = brainKindForChatMode(
      route.mode && route.mode !== 'general' ? route.mode : mode,
    );

    if (route.chatId) {
      // Tombstoned chat (just deleted from History) — never restore busy chrome on it.
      if (isChatDeleted(route.chatId)) {
        try { endChatInflight(route.chatId); } catch { /* ignore */ }
        generatingRef.current = false;
        activeGenChatIdRef.current = null;
        setGenerating(false);
        setLoading(false);
        setThreadSwitching(false);
        setMessages([]);
        messagesRef.current = [];
        messagesChatIdRef.current = null;
        persistChatIdRef.current = null;
        routeChatIdRef.current = undefined;
        navigate({ name: 'chat', mode: route.mode && route.mode !== 'general' ? route.mode : undefined });
        requestAnimationFrame(() => focusComposerIfSafe(textareaRef.current));
        return;
      }
      const inFlight = Boolean(
        (generatingRef.current && activeGenChatIdRef.current === route.chatId)
        || isChatInflight(route.chatId),
      );
      // Never clobber an in-progress Image/Video (or chat) turn by reloading disk.
      if (inFlight) {
        activeGenChatIdRef.current = route.chatId;
        generatingRef.current = true;
        setLoading(false);
        setGenerating(true);
        return;
      }
      // We just created this chat and already have messages in state. don't wipe them.
      // Only skip when the in-memory thread actually belongs to this chatId — otherwise a
      // Recent switch can keep the previous chat's bubbles and later overwrite storage.
      if (
        skipChatLoadIdsRef.current.has(route.chatId)
        && messagesChatIdRef.current === route.chatId
        && messagesRef.current.length > 0
      ) {
        skipChatLoadIdsRef.current.delete(route.chatId);
        setLoading(false);
        setGenerating(Boolean(generatingRef.current && activeGenChatIdRef.current === route.chatId));
        // Still rebind studio — skipping this left Localhost on the previous chat's app.
        const liveGenSkip = Boolean(
          generatingRef.current && activeGenChatIdRef.current === route.chatId,
        );
        if (!liveGenSkip) {
          const switchChatId = route.chatId;
          void (async () => {
            // Always close Live on chat switch (hidden probes may exist without previewUrl).
            void window.novaDesktop?.previewCloseLive?.().catch(() => undefined);
            void window.novaDesktop?.previewSetActiveChat?.({
              projectId: previewWindowIdForChat(switchChatId),
            }).catch(() => undefined);
            await rebindStudioForChat(switchChatId);
            const root = chatStudioDiskRootRef.current;
            if (root && window.novaDesktop?.readTextFile) {
              try {
                const hydrated = await loadPreviewFilesFromDisk(root);
                if (Object.keys(hydrated).length) {
                  const merged = { ...chatStudioFilesRef.current, ...hydrated };
                  setChatStudioFiles(merged);
                  chatStudioFilesRef.current = merged;
                }
              } catch {
                /* ignore */
              }
            }
            // Never auto-open Localhost on Recent switch — user opens Preview when ready.
          })();
        }
        return;
      }
      // Stale skip flag from another view — drop it and load this thread from storage.
      if (skipChatLoadIdsRef.current.has(route.chatId)) {
        skipChatLoadIdsRef.current.delete(route.chatId);
      }

      // Switch loading: clear previous thread immediately so the old chat never paints over this one.
      const switchChatId = route.chatId;
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = undefined;
      }
      let nextMsgs: ChatMessage[] = [];
      const readThread = (): ChatMessage[] => {
        try {
          const raw = localStorage.getItem(chatThreadKey(switchChatId));
          if (!raw) return [];
          const loaded = JSON.parse(raw) as ChatMessage[];
          return Array.isArray(loaded) ? loaded : [];
        } catch {
          return [];
        }
      };
      nextMsgs = readThread();
      // One retry — rare race when History/Recent navigates before persist flush lands.
      if (!nextMsgs.length) {
        try {
          const sticky = sessionStorage.getItem(`NOVA:last-thread:${switchChatId}`);
          if (sticky) {
            const loaded = JSON.parse(sticky) as ChatMessage[];
            if (Array.isArray(loaded) && loaded.length) nextMsgs = loaded;
          }
        } catch { /* ignore */ }
      }
      // Queue is per-view: never show another chat's backlog here.
      pendingQueueRef.current = pendingQueueRef.current.filter(q => q.chatId === switchChatId);
      // Drop ghosts that were already committed to this thread.
      const sentOnSwitch = new Set(
        nextMsgs
          .filter(m => m.role === 'user')
          .map(m => String(m.content || '').trim())
          .filter(Boolean),
      );
      if (sentOnSwitch.size) {
        pendingQueueRef.current = pendingQueueRef.current.filter(
          q => !sentOnSwitch.has(String(q.text || '').trim()),
        );
      }
      setQueueLen(pendingQueueRef.current.length);
      setQueueTick(t => t + 1);
      setEditingQueueId(null);
      setEditingQueueText('');
      messagesRef.current = nextMsgs;
      messagesChatIdRef.current = switchChatId;
      setMessages(nextMsgs);
      setThreadBrain(loadThreadBrain(switchChatId, kind));
      setThreadSwitching(true);
      setLoading(false);
      stickToBottomRef.current = true;
      userDetachScrollRef.current = false;
      setShowJumpToBottom(false);
      ignoreScrollUntilRef.current = Date.now() + 600;
      studioEpochRef.current += 1;
      studioBoundChatIdRef.current = null;
      setChatStudioFiles({});
      chatStudioFilesRef.current = {};
      setChatStudioProjectId(null);
      chatStudioProjectIdRef.current = null;
      setChatStudioDiskRoot(null);
      chatStudioDiskRootRef.current = null;
      setPreviewUrl(null);
      previewUrlRef.current = null;
      setPendingAttaches([]);
      setCodePillSticky(false);
      setPlanPillSticky(false);
      setPlanOverlayOpen(false);
      setPlanLiveDrafting(false);
      setComposerMode(null);
      setDropHint(null);
      clearPendingStudioBind();
      stopComposerDictation();
      pinMessagesToBottom('auto');

      void (async () => {
        const abortSwitch = () => {
          setThreadSwitching(false);
          setLoading(false);
        };
        try {
          if (routeChatIdRef.current && routeChatIdRef.current !== switchChatId) {
            abortSwitch();
            return;
          }
        } catch {
          if (routeChatIdRef.current && routeChatIdRef.current !== switchChatId) {
            abortSwitch();
            return;
          }
        }

        const liveGenHere = Boolean(
          (generatingRef.current && activeGenChatIdRef.current === switchChatId)
          || isChatInflight(switchChatId),
        );
        if (liveGenHere) {
          // Mid-build return: restore this chat's saved studio — do not steal another thread's live refs.
          try {
            const snap = loadChatStudio(switchChatId);
            if (snap && (Object.keys(snap.files || {}).length || snap.diskRoot)) {
              applyStudioBinding(switchChatId, snap);
            }
          } catch {
            /* ignore */
          }
        } else {
          // Always close prior chat Live — never leave Tidepot/Calculator visible on another thread.
          void window.novaDesktop?.previewCloseLive?.().catch(() => undefined);
          void window.novaDesktop?.previewSetActiveChat?.({
            projectId: previewWindowIdForChat(switchChatId),
          }).catch(() => undefined);
          await rebindStudioForChat(switchChatId);
          // Warm file binding from disk so Preview/Code are ready — do not open Localhost.
          const root = chatStudioDiskRootRef.current;
          if (root && window.novaDesktop?.readTextFile) {
            try {
              const hydrated = await loadPreviewFilesFromDisk(root);
              if (Object.keys(hydrated).length && (!routeChatIdRef.current || routeChatIdRef.current === switchChatId)) {
                // Prefer fresher in-memory studio edits over thin/stale disk hydrate.
                const merged = { ...hydrated, ...chatStudioFilesRef.current };
                setChatStudioFiles(merged);
                chatStudioFilesRef.current = merged;
                persistStudioSnapshot(switchChatId, {
                  files: merged,
                  projectId: chatStudioProjectIdRef.current,
                  name: studioPathBasename(root) || undefined,
                  diskRoot: root,
                  previewUrl: null,
                });
              }
            } catch {
              /* ignore */
            }
          }
          setPreviewUrl(null);
          previewUrlRef.current = null;
        }
        if (routeChatIdRef.current && routeChatIdRef.current !== switchChatId) {
          abortSwitch();
          return;
        }
        setCodePillSticky(hasChatCodePill(switchChatId));
        setPlanPillSticky(hasChatPlanPill(switchChatId));
        // Clear stale generating placeholders from a crashed prior turn.
        try {
          const rawInflight = sessionStorage.getItem('NOVA:inflight-media');
          const inflight = rawInflight
            ? JSON.parse(rawInflight) as { chatId?: string; mode?: string; startedAt?: number }
            : null;
          const stale = Boolean(inflight?.startedAt && Date.now() - inflight.startedAt > 180_000);
          // Inflight map is source of truth across Chat↔Voice / Settings hops.
          const liveHere = Boolean(
            (generatingRef.current && activeGenChatIdRef.current === switchChatId)
            || isChatInflight(switchChatId),
          );
          if (liveHere) {
            const last = messagesRef.current[messagesRef.current.length - 1];
            if (last?.role === 'assistant' && String(last.content || '').startsWith('__generating__:')) {
              activeGenChatIdRef.current = switchChatId;
              generatingRef.current = true;
              setGenerating(true);
            } else if (isChatInflight(switchChatId)) {
              // Inflight create/chat without a visible placeholder — restore busy chrome.
              activeGenChatIdRef.current = switchChatId;
              generatingRef.current = true;
              setGenerating(true);
            }
          } else {
            const stuckChat = messagesRef.current.some(
              m => m.role === 'assistant' && String(m.content || '').startsWith('__generating__:chat:'),
            );
            if (stuckChat || stale || (inflight?.chatId && inflight.chatId !== switchChatId)) {
              if (stale || (inflight?.chatId && inflight.chatId !== switchChatId)) {
                sessionStorage.removeItem('NOVA:inflight-media');
              }
              // Clear stuck placeholders on THIS thread only. Never abort another chat's
              // in-flight create by clearing generatingRef / activeGenChatIdRef.
              if (!isChatInflight(switchChatId)) {
                setMessages(prev => {
                  const next = prev.map(m => (
                    m.role === 'assistant' && String(m.content || '').startsWith('__generating__:')
                      ? { ...m, content: '(interrupted. send again)' }
                      : m
                  ));
                  messagesRef.current = next;
                  persistModeThread(mode, next, { chatId: switchChatId });
                  return next;
                });
                const otherLive = Boolean(
                  (activeGenChatIdRef.current
                    && activeGenChatIdRef.current !== switchChatId
                    && (generatingRef.current || isChatInflight(activeGenChatIdRef.current)))
                  || hasChatInflight(),
                );
                if (!otherLive && activeGenChatIdRef.current === switchChatId) {
                  generatingRef.current = false;
                  activeGenChatIdRef.current = null;
                }
                // Hide Stop on this idle view; background work keeps generatingRef.
                setGenerating(false);
              }
            }
          }
        } catch {
          /* ignore */
        }
        setGenerating(Boolean(
          (generatingRef.current && activeGenChatIdRef.current === switchChatId)
          || isChatInflight(switchChatId),
        ));
        setLoading(false);
        setThreadSwitching(false);
        requestAnimationFrame(() => focusComposerIfSafe(textareaRef.current));
      })();
      return;
    }

    // Fresh New Chat / Image / Video — always empty canvas.
    // Never paint the previous recent thread here (that looked like "new chat shows old chat").
    // Background generation for another chatId can keep running via keepChatAlive; this route
    // must still show a blank starter.
    try {
      const raw = sessionStorage.getItem('NOVA:inflight-media');
      const inflight = raw ? JSON.parse(raw) as { chatId?: string; mode?: string } : null;
      if (inflight?.chatId && isChatDeleted(inflight.chatId)) {
        // Deleted chat leftover — never re-navigate into a tombstoned id (locks composer).
        sessionStorage.removeItem('NOVA:inflight-media');
        try { endChatInflight(inflight.chatId); } catch { /* ignore */ }
      } else if (
        inflight?.chatId
        && inflight.mode
        && (route.mode === inflight.mode || (!route.mode && inflight.mode === 'general'))
      ) {
        // Media mid-flight: jump back to that chat instead of a blank conflicting canvas.
        navigate({
          name: 'chat',
          mode: inflight.mode === 'general' ? undefined : (inflight.mode as 'image' | 'video'),
          chatId: inflight.chatId,
        });
        setLoading(false);
        return;
      }
    } catch {
      /* ignore */
    }
    setMessages([]);
    messagesRef.current = [];
    messagesChatIdRef.current = null;
    setThreadBrain(null);
    // New chat always starts on Multimodal — user can pin a single model later.
    // Thread memory stays with this chatId when they switch models mid-conversation.
    try {
      setLocalPrefs({
        lastChatModelId: 'NOVA-auto',
        defaultModelId: 'NOVA-auto',
        activeChatId: 'NOVA-auto',
      });
    } catch { /* ignore */ }
    setActiveModel(defaultModelForKind('chat'));
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = undefined;
    }
    // Invalidate any in-flight openFolderInChat / hydrate that started on the previous canvas.
    studioEpochRef.current += 1;
    studioBoundChatIdRef.current = null;
    setChatStudioFiles({});
    chatStudioFilesRef.current = {};
    setChatStudioProjectId(null);
    chatStudioProjectIdRef.current = null;
    setChatStudioDiskRoot(null);
    chatStudioDiskRootRef.current = null;
    setPreviewUrl(null);
    previewUrlRef.current = null;
    setPendingAttaches([]);
    setPendingImages([]);
    setCodePillSticky(false);
    setComposerMode(null);
    setDropHint(null);
    setPathBindOpen(false);
    setPathBindDraft('');
    clearPendingStudioBind();
    lastStudioIntentRef.current = null;
    lastFindingsRef.current = [];
    // New Chat: tear down every Live window so the prior project cannot bleed in.
    void window.novaDesktop?.previewCloseLive?.().catch(() => undefined);
    void window.novaDesktop?.previewSetActiveChat?.({}).catch(() => undefined);
    // Drop any pending create brief so a new chat cannot inherit the previous idea.
    try {
      const staleId = persistChatIdRef.current || routeChatIdRef.current;
      if (staleId) clearLastPendingGreenfield(staleId);
    } catch { /* ignore */ }
    persistChatIdRef.current = null;
    // Blank starter must not show another chat's Stop / queue UI.
    // Do NOT bump genSeq, stopRequested, generatingRef, or activeGenChatIdRef —
    // a prior thread may still be finishing and must keep writing to its own chatId.
    pendingQueueRef.current = [];
    setQueueLen(0);
    setQueueTick(t => t + 1);
    setEditingQueueId(null);
    setEditingQueueText('');
    stopComposerDictation();
    // Hide Stop on the blank canvas only — never abort background create/chat.
    setGenerating(false);
    setLoading(false);
  }, [route, mode, navigate, stopComposerDictation]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void probeLiveCapacity().then(cap => {
        if (!cancelled) {
          setCapacity(cap);
          // Provider keys are hydrated asynchronously from the desktop vault.
          // Re-resolve the picker after that event so a saved cloud preference
          // does not remain stuck on a blank/invalid model.
          setActiveModel((prev) => {
            // Do not clobber a create-craft pin (Coder) with chat Instruct on focus/capacity refresh.
            const id = String(prev?.id || '');
            if (/coder|starcoder|codestral|codellama|devstral|deepseek-coder|uigen/i.test(id)) {
              return prev;
            }
            if (String(prev?.detail || '').includes('create craft') || /·\s*(?:craft|verify|design|copy)/i.test(String(prev?.detail || ''))) {
              return prev;
            }
            return defaultModelForKind(activeModelRef.current.kind);
          });
        }
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('NOVA:ollama-changed', refresh);
    window.addEventListener('NOVA:provider-keys-changed', refresh);
    window.addEventListener('NOVA:cloud-sources-changed', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('NOVA:ollama-changed', refresh);
      window.removeEventListener('NOVA:provider-keys-changed', refresh);
      window.removeEventListener('NOVA:cloud-sources-changed', refresh);
    };
  }, []);

  useEffect(() => {
    const loadOllama = () => {
      void import('@/lib/ollamaOptional').then(async ({ isOllamaEnabled, probeOllamaOptional }) => {
        if (!isOllamaEnabled()) {
          setOllamaModels([]);
          return;
        }
        const res = await probeOllamaOptional();
        if (!res.online) {
          setOllamaModels([]);
          return;
        }
        setOllamaModels(
          res.models.slice(0, 20).map(m => ({
            id: `ollama:${m.name}`,
            name: m.name,
            source: 'local' as const,
            detail: 'Ollama · optional',
            kind: 'chat' as const,
          })),
        );
      });
    };
    loadOllama();
    window.addEventListener('NOVA:ollama-changed', loadOllama);
    window.addEventListener('focus', loadOllama);
    return () => {
      window.removeEventListener('NOVA:ollama-changed', loadOllama);
      window.removeEventListener('focus', loadOllama);
    };
  }, []);

  useEffect(() => {
    const loadEngine = () => {
      void getEngineStatus()
        .then(status => {
          const ready = status.models
            .filter(m =>
              m.status === 'ready'
              && m.id !== 'NOVA-core'
              && m.id !== 'NOVA-image-core'
              && m.id !== 'NOVA-video-core'
              // Vision projector companion — not a chat/create model.
              && !/mmproj/i.test(`${m.id || ''} ${m.name || ''}`),
            )
            .map(m => ({
              id: m.id,
              name: m.name,
              source: 'local' as const,
              detail: 'Ready',
              kind: 'chat' as const,
            }));
          const readyIds = new Set(ready.map(m => m.id));
          const installing = status.models
            .filter(m => m.status === 'downloading')
            .map(m => ({
              id: m.id,
              name: m.name,
              source: 'local' as const,
              detail: m.progress != null ? `Installing… ${Math.round(m.progress)}%` : 'Installing…',
              kind: 'chat' as const,
            }));
          setEngineLocalModels(ready);
          setEngineInstallingModels(installing);
          setEngineReadyIds(readyIds);
          // Hydrate a saved local chat pin once engines are ready — never force Multimodal.
          setActiveModel(prev => {
            if (prev.kind !== 'chat') return prev;
            if (prev.source === 'auto' || prev.source === 'cloud') return prev;
            if (prev.id.startsWith('ollama:')) return prev;
            if (readyIds.has(prev.id)) {
              const hit = ready.find(m => m.id === prev.id);
              return hit || prev;
            }
            // Saved engine id that just became ready
            const prefs = getLocalPrefs();
            const want = String(prefs.lastChatModelId || prefs.defaultModelId || '').trim();
            if (want && readyIds.has(want)) {
              return ready.find(m => m.id === want) || prev;
            }
            // Pinned local no longer installed — fall back via prefs resolver
            if (prev.source === 'local' && prev.id !== 'NOVA-auto' && !readyIds.has(prev.id)) {
              return defaultModelForKind('chat');
            }
            return prev;
          });
        })
        .catch(() => {
          setEngineLocalModels([]);
          setEngineInstallingModels([]);
          setEngineReadyIds(new Set());
        });
    };
    loadEngine();
    // Item 8: poll rarely — GGUF list is cached; refresh on focus / model events instead of 2.5s thrash.
    const t = window.setInterval(loadEngine, 15_000);
    const onEngineEvt = () => loadEngine();
    window.addEventListener('focus', loadEngine);
    window.addEventListener('NOVA:engine-changed', onEngineEvt);
    window.addEventListener('NOVA:models-changed', onEngineEvt);
    const onForceChatModel = (ev: Event) => {
      const detail = (ev as CustomEvent<{ id?: string; name?: string }>).detail || {};
      const id = String(detail.id || '').trim();
      if (!id || id === 'NOVA-auto') return;
      setActiveModel({
        id,
        name: String(detail.name || id),
        source: 'local',
        kind: 'chat',
      });
      try {
        setLocalPrefs({
          activeChatId: id,
          defaultModelId: id,
          lastChatModelId: id,
          activeCoderId: id,
          defaultCodeModelId: id,
        });
      } catch { /* ignore */ }
      void setEngineModel(id);
    };
    window.addEventListener('NOVA:force-chat-model', onForceChatModel);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', loadEngine);
      window.removeEventListener('NOVA:engine-changed', onEngineEvt);
      window.removeEventListener('NOVA:models-changed', onEngineEvt);
      window.removeEventListener('NOVA:force-chat-model', onForceChatModel);
    };
  }, []);

  useEffect(() => {
    refreshChatPlugins();
    const onFocus = () => refreshChatPlugins();
    const onPlugins = () => refreshChatPlugins();
    window.addEventListener('focus', onFocus);
    window.addEventListener('NOVA:plugins-changed', onPlugins);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('NOVA:plugins-changed', onPlugins);
    };
  }, [route]);

  useEffect(() => {
    if (route.name !== 'chat') return;
    let pending = '';
    try {
      pending = sessionStorage.getItem('NOVA:pending-chat-send') || '';
      if (pending) sessionStorage.removeItem('NOVA:pending-chat-send');
    } catch { /* ignore */ }
    if (!pending.trim()) return;
    const id = window.setTimeout(() => {
      void sendMessageRef.current(pending.trim());
    }, 120);
    return () => window.clearTimeout(id);
  }, [route]);

  const pinMessagesToBottom = (behavior: ScrollBehavior = 'auto') => {
    stickToBottomRef.current = true;
    userDetachScrollRef.current = false;
    setShowJumpToBottom(false);
    ignoreScrollUntilRef.current = Date.now() + 400;
    const el = messagesScrollRef.current;
    const run = () => {
      if (el) el.scrollTop = el.scrollHeight;
      else messagesEndRef.current?.scrollIntoView({ behavior });
    };
    run();
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
  };

  useEffect(() => {
    // Only pin to bottom when the user is already near the end. never yank scroll while reading history.
    if (!stickToBottomRef.current || userDetachScrollRef.current) {
      // Reading history while a reply finishes — keep them put; pulse the jump chip.
      if (userDetachScrollRef.current) setShowJumpToBottom(true);
      return;
    }
    const el = messagesScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  // While detached, pulse the jump button when streaming starts/stops so they know new text landed.
  useEffect(() => {
    if (!userDetachScrollRef.current) return;
    setShowJumpToBottom(true);
  }, [generating, messages.length]);

  const onMessagesScroll = () => {
    const el = messagesScrollRef.current;
    if (!el) return;
    if (Date.now() < ignoreScrollUntilRef.current) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (userDetachScrollRef.current) {
      // Re-attach only when the user clearly returns to the bottom.
      if (distFromBottom < 48) {
        userDetachScrollRef.current = false;
        stickToBottomRef.current = true;
        setShowJumpToBottom(false);
      } else {
        stickToBottomRef.current = false;
        setShowJumpToBottom(true);
      }
      return;
    }
    // Leave stick early when scrolling up — lock detach so stream growth cannot re-stick.
    if (distFromBottom > 80) {
      stickToBottomRef.current = false;
      userDetachScrollRef.current = true;
      setShowJumpToBottom(true);
      return;
    }
    if (distFromBottom < 48) stickToBottomRef.current = true;
    setShowJumpToBottom(false);
  };

  const onMessagesWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (Date.now() < ignoreScrollUntilRef.current) return;
    // File-change cards / nested lists own their wheel — never scroll the thread under them.
    const nested = (e.target as HTMLElement | null)?.closest?.('.nova-nested-scroll') as HTMLElement | null;
    if (nested && nested !== messagesScrollRef.current) {
      return;
    }
    if (e.deltaY < 0) {
      userDetachScrollRef.current = true;
      stickToBottomRef.current = false;
      setShowJumpToBottom(true);
    }
    // Nested .nova-msg-body-cap steals wheel; at its edge, keep scrolling the thread.
    const cap = (e.target as HTMLElement | null)?.closest?.('.nova-msg-body-cap') as HTMLElement | null;
    if (!cap) return;
    const parent = messagesScrollRef.current;
    if (!parent || cap === parent) return;
    const atTop = cap.scrollTop <= 0;
    const atBottom = cap.scrollTop + cap.clientHeight >= cap.scrollHeight - 1;
    const leavingCap = (e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom);
    if (!leavingCap) return;
    parent.scrollTop += e.deltaY;
    e.preventDefault();
  };

  const jumpToBottom = () => {
    pinMessagesToBottom('smooth');
  };
  useLayoutEffect(() => {
    if (!modelMenuOpen) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const btn = modelButtonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const shell = btn.closest('[data-ark-composer]') as HTMLElement | null;
      const shellRect = shell?.getBoundingClientRect();
      const menuW = 288; // w-72
      const gap = 12;
      // Right edge of menu lines up with the chat box right edge.
      const anchorRight = shellRect?.right ?? r.right;
      const left = Math.min(
        Math.max(12, anchorRight - menuW),
        window.innerWidth - menuW - 12,
      );
      const spaceAbove = (shellRect?.top ?? r.top);
      const spaceBelow = window.innerHeight - (shellRect?.bottom ?? r.bottom);
      const openUp = spaceBelow < 300 && spaceAbove > spaceBelow;
      if (openUp) {
        setMenuPos({
          left,
          bottom: Math.max(12, window.innerHeight - (shellRect?.top ?? r.top) + gap),
          top: undefined,
        });
      } else {
        setMenuPos({
          left,
          top: Math.min(window.innerHeight - 24, (shellRect?.bottom ?? r.bottom) + gap),
          bottom: undefined,
        });
      }
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (modelMenuRef.current?.contains(t)) return;
      if (modelButtonRef.current?.contains(t)) return;
      setModelMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [modelMenuOpen]);

  const handleStop = () => {
    stopSpeaking();
    setVoicePhase('idle');
    const originGenChatId = activeGenChatIdRef.current
      || routeChatIdRef.current
      || persistChatIdRef.current
      || null;
    if (originGenChatId) {
      const next = (genSeqByChatRef.current[originGenChatId] || 0) + 1;
      genSeqByChatRef.current[originGenChatId] = next;
      stopRequestedByChatRef.current[originGenChatId] = true;
      // Kill in-flight create immediately — otherwise craft/npm/verify keep going after "(stopped)".
      try {
        const job = getCreateJobForChat(originGenChatId);
        if (job && (job.status === 'queued' || job.status === 'writing' || job.status === 'npm' || job.status === 'verifying')) {
          void import('@/lib/createJobStore').then(({ markCreateJobFailed }) => {
            markCreateJobFailed(job.id, 'Stopped');
          }).catch(() => { /* ignore */ });
        }
      } catch { /* ignore */ }
    }
    genSeqRef.current += 1;
    stopRequestedRef.current = true;
    pendingQueueRef.current = [];
    setQueueLen(0);
    setQueueTick(t => t + 1);
    setEditingQueueId(null);
    setEditingQueueText('');
    // Cancel only this chat's infer job — never nuke the other Live create.
    void engineGenerateCancel(originGenChatId ? { chatId: originGenChatId } : undefined);
    generatingRef.current = false;
    activeGenChatIdRef.current = null;
    try {
      clearChatTurnStatus();
    } catch { /* ignore */ }
    try {
      sessionStorage.removeItem('NOVA:inflight-media');
    } catch {
      /* ignore */
    }
    // Pair every beginChatInflight — Stop used to leave App thinking Chat was busy forever.
    // Always end this chat only — never drain another thread's inflight.
    const stopChatId = originGenChatId || routeChatIdRef.current || persistChatIdRef.current;
    if (stopChatId) endChatInflight(stopChatId);
    else while (hasChatInflight()) endChatInflight();
    setGenerating(false);
    const stopPatch = (list: ChatMessage[]) => list.map(m => {
      if (m.role !== 'assistant') return m;
      const c = String(m.content || '');
      if (c.startsWith('__generating__:')) return { ...m, content: '(stopped)' };
      if (looksLikeAgentToolLeak(c)) return { ...m, content: '(stopped)' };
      return m;
    });
    setMessages(prev => {
      const next = stopPatch(prev);
      const viewedId = persistChatIdRef.current || routeChatIdRef.current;
      if (viewedId) persistModeThread(mode, next, { chatId: viewedId });
      return next;
    });
    // Also clear Generating on the origin chat if the user Stopped while viewing another thread.
    if (originGenChatId && originGenChatId !== (routeChatIdRef.current || persistChatIdRef.current)) {
      try {
        const raw = localStorage.getItem(chatThreadKey(originGenChatId));
        const stored = raw ? JSON.parse(raw) as ChatMessage[] : [];
        if (Array.isArray(stored) && stored.some(m => String(m.content || '').startsWith('__generating__:'))) {
          persistModeThread(mode, stopPatch(stored), { chatId: originGenChatId });
        }
      } catch {
        /* ignore */
      }
    }
  };

  const flushQueuedSend = () => {
    // Hold the queue while the user is editing a queued message.
    if (editingQueueIdRef.current) return;
    const viewingId = route.name === 'chat' ? (route.chatId || persistChatIdRef.current) : null;
    // Drop queued items that belong to another chat (switch leftover).
    if (viewingId) {
      pendingQueueRef.current = pendingQueueRef.current.filter(q => q.chatId === viewingId);
    }
    // Ghost prune: drop anything already sitting in the thread as a user message.
    const sentTexts = new Set(
      messagesRef.current
        .filter(m => m.role === 'user')
        .map(m => String(m.content || '').trim())
        .filter(Boolean),
    );
    if (sentTexts.size) {
      pendingQueueRef.current = pendingQueueRef.current.filter(
        q => !sentTexts.has(String(q.text || '').trim()),
      );
    }
    setQueueLen(pendingQueueRef.current.length);
    setQueueTick(t => t + 1);
    if (viewingId && (isChatInflight(viewingId) || (
      generatingRef.current && activeGenChatIdRef.current === viewingId
    ))) {
      return;
    }
    if (generatingRef.current && !viewingId) return;
    // Cue 1 = next to send (oldest). Hold while user is editing any cue in the composer.
    const next = pendingQueueRef.current.shift();
    setQueueLen(pendingQueueRef.current.length);
    setQueueTick(t => t + 1);
    if (next?.text) {
      lastSendGuardRef.current = { text: next.text, at: Date.now() };
      generatingRef.current = true;
      void sendMessageRef.current(next.text);
    }
  };

  const endTurnAndFlush = (mySeq: number, chatId?: string) => {
    window.setTimeout(() => {
      const id = chatId || activeGenChatIdRef.current || persistChatIdRef.current || undefined;
      if (id && genSeqByChatRef.current[id] != null) {
        if (mySeq !== genSeqByChatRef.current[id]) return;
      } else if (mySeq !== genSeqRef.current) {
        return;
      }
      if (id && isChatInflight(id)) return;
      if (generatingRef.current && activeGenChatIdRef.current === id) return;
      flushQueuedSend();
    }, 0);
  };

  

  const openCodeWorkspace = (_seedPrompt?: string, _seedFiles?: Record<string, string>) => {
    // Code pill overlay is the only code UI — old ProjectWorkspace tab is retired.
    if (codeDemoTimerRef.current != null) {
      window.clearInterval(codeDemoTimerRef.current);
      codeDemoTimerRef.current = null;
    }
    setCodeTypingDemo(false);
    setCodeDemoFiles({});
    if (_seedFiles && Object.keys(_seedFiles).length) {
      setChatStudioFiles(_seedFiles);
      chatStudioFilesRef.current = _seedFiles;
    }
    setCodeOverlayOpen(true);
    setCodePillSticky(true);
  };

  /** Preview: open Code beside chat and type fake lines so you can judge smoothness. */
  const startCodeTypingPreview = () => {
    if (codeDemoTimerRef.current != null) {
      window.clearInterval(codeDemoTimerRef.current);
      codeDemoTimerRef.current = null;
    }
    const demoTsx = [
      "import { useState } from 'react'",
      '',
      'export default function App() {',
      "  const [note, setNote] = useState('')",
      '  return (',
      '    <main className="page">',
      '      <h1>DemoPage</h1>',
      '      <p>Watch this type line by line — not paste chunks.</p>',
      '      <textarea',
      '        value={note}',
      '        onChange={(e) => setNote(e.target.value)}',
      '        placeholder="Type something…"',
      '      />',
      '    </main>',
      '  )',
      '}',
      '',
    ].join('\n');
    const demoCss = [
      'body {',
      '  margin: 0;',
      '  font-family: Georgia, serif;',
      '  background: #1a1410;',
      '  color: #f5f0e8;',
      '}',
      '.page {',
      '  max-width: 28rem;',
      '  margin: 3rem auto;',
      '  padding: 1.5rem;',
      '}',
      '',
    ].join('\n');
    setCodeTypingDemo(true);
    setCodeDemoFiles({ 'src/App.tsx': '', 'src/App.css': '' });
    setCodeOverlayOpen(true);
    setCodePillSticky(true);
    // Dump full targets after a beat — overlay typewriter reveals them smoothly.
    codeDemoTimerRef.current = window.setTimeout(() => {
      setCodeDemoFiles({ 'src/App.tsx': demoTsx, 'src/App.css': demoCss });
      codeDemoTimerRef.current = null;
    }, 120) as unknown as number;
  };

  const closeCodeOverlay = () => {
    if (codeDemoTimerRef.current != null) {
      window.clearTimeout(codeDemoTimerRef.current);
      codeDemoTimerRef.current = null;
    }
    setCodeTypingDemo(false);
    setCodeDemoFiles({});
    setCodeOverlayOpen(false);
  };

  const openPlanWorkspace = () => {
    setPlanOverlayOpen(true);
    setPlanPillSticky(true);
    setPlanLiveDrafting(false);
  };

  useEffect(() => {
    const onOpenCode = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        projectId?: string;
        diskPath?: string;
        name?: string;
        openOverlay?: boolean;
      }>).detail || {};
      const shouldOpenOverlay = detail.openOverlay !== false;
      void (async () => {
        try {
          if (detail.projectId && window.novaDesktop?.projectRead) {
            const read = await window.novaDesktop.projectRead(detail.projectId);
            if (read?.ok && read.files && Object.keys(read.files).length) {
              const files = read.files as Record<string, string>;
              setChatStudioFiles(files);
              chatStudioFilesRef.current = files;
              setChatStudioProjectId(detail.projectId);
              chatStudioProjectIdRef.current = detail.projectId;
              if (read.root) {
                setChatStudioDiskRoot(read.root);
                chatStudioDiskRootRef.current = read.root;
              }
              const chatId = routeChatIdRef.current || persistChatIdRef.current;
              if (chatId) {
                persistStudioSnapshot(chatId, {
                  files,
                  projectId: detail.projectId,
                  name: detail.name || studioPathBasename(read.root || '') || undefined,
                  diskRoot: read.root || null,
                });
                setChatCodePill(chatId, true);
              }
            }
          } else if (detail.diskPath) {
            const files = await loadPreviewFilesFromDisk(detail.diskPath);
            if (Object.keys(files).length) {
              setChatStudioFiles(files);
              chatStudioFilesRef.current = files;
              setChatStudioDiskRoot(detail.diskPath);
              chatStudioDiskRootRef.current = detail.diskPath;
              const chatId = routeChatIdRef.current || persistChatIdRef.current;
              if (chatId) {
                persistStudioSnapshot(chatId, {
                  files,
                  name: detail.name || studioPathBasename(detail.diskPath),
                  diskRoot: detail.diskPath,
                });
                setChatCodePill(chatId, true);
              }
            }
          }
        } catch {
          /* still open overlay with whatever is already bound */
        }
        setCodePillSticky(true);
        if (shouldOpenOverlay) setCodeOverlayOpen(true);
      })();
    };
    const onCloseCode = () => setCodeOverlayOpen(false);
    const onCodePill = (ev: Event) => {
      const detail = (ev as CustomEvent<{ chatId?: string; on?: boolean }>).detail || {};
      const chatId = String(detail.chatId || '').trim();
      const active = String(routeChatIdRef.current || persistChatIdRef.current || '').trim();
      if (!chatId || (active && chatId !== active)) return;
      // Pill visibility only — never open the overlay from this event.
      setCodePillSticky(detail.on !== false);
    };
    window.addEventListener('NOVA:open-code-overlay', onOpenCode);
    window.addEventListener('NOVA:close-code-overlay', onCloseCode);
    window.addEventListener('NOVA:chat-code-pill', onCodePill);
    return () => {
      window.removeEventListener('NOVA:open-code-overlay', onOpenCode);
      window.removeEventListener('NOVA:close-code-overlay', onCloseCode);
      window.removeEventListener('NOVA:chat-code-pill', onCodePill);
    };
  }, []);

  useEffect(() => {
    const onOpenPlan = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        openOverlay?: boolean;
        live?: boolean;
        chatId?: string;
        report?: PlanReportData;
      }>).detail || {};
      const shouldOpen = detail.openOverlay !== false;
      const chatId = String(detail.chatId || routeChatIdRef.current || persistChatIdRef.current || '').trim();
      if (detail.report?.steps?.length && chatId) {
        saveChatPlan(chatId, detail.report);
        setChatPlanPill(chatId, true);
      }
      setPlanPillSticky(true);
      setPlanLiveDrafting(Boolean(detail.live));
      if (shouldOpen) setPlanOverlayOpen(true);
      if (!detail.live) {
        // Allow a brief live pulse then settle once the outline is stored.
        window.setTimeout(() => setPlanLiveDrafting(false), 400);
      }
    };
    const onClosePlan = () => {
      setPlanOverlayOpen(false);
      setPlanLiveDrafting(false);
    };
    window.addEventListener('NOVA:open-plan-overlay', onOpenPlan);
    window.addEventListener('NOVA:close-plan-overlay', onClosePlan);
    return () => {
      window.removeEventListener('NOVA:open-plan-overlay', onOpenPlan);
      window.removeEventListener('NOVA:close-plan-overlay', onClosePlan);
    };
  }, []);

  // CDP / automation: bind a disk folder to the open chat without opening the code overlay.
  useEffect(() => {
    const onBind = (ev: Event) => {
      const detail = (ev as CustomEvent<{ diskPath?: string; name?: string }>).detail || {};
      const diskPath = String(detail.diskPath || '').trim();
      if (!diskPath) return;
      const bindEpoch = studioEpochRef.current;
      const bindChatAtStart = routeChatIdRef.current || persistChatIdRef.current || null;
      // Set disk root immediately so the next ask does not hit "No workspace yet"
      // while file hydration is still in flight.
      setChatStudioDiskRoot(diskPath);
      chatStudioDiskRootRef.current = diskPath;
      const chatId = bindChatAtStart;
      if (chatId) {
        studioBoundChatIdRef.current = chatId;
        persistStudioSnapshot(chatId, {
          files: chatStudioFilesRef.current,
          name: detail.name || studioPathBasename(diskPath),
          diskRoot: diskPath,
        });
        setChatCodePill(chatId, true);
        setCodePillSticky(true);
      } else {
        writePendingStudioBind({
          files: {},
          projectId: null,
          name: detail.name || studioPathBasename(diskPath),
          diskRoot: diskPath,
        });
      }
      void (async () => {
        try {
          const files = await loadPreviewFilesFromDisk(diskPath);
          if (studioEpochRef.current !== bindEpoch) return;
          const now = routeChatIdRef.current || persistChatIdRef.current || null;
          if (bindChatAtStart && now !== bindChatAtStart) return;
          if (!bindChatAtStart && now) return;
          if (!Object.keys(files).length) return;
          setChatStudioFiles(files);
          chatStudioFilesRef.current = files;
          if (chatId) {
            persistStudioSnapshot(chatId, {
              files,
              name: detail.name || studioPathBasename(diskPath),
              diskRoot: diskPath,
            });
          } else {
            writePendingStudioBind({
              files,
              projectId: null,
              name: detail.name || studioPathBasename(diskPath),
              diskRoot: diskPath,
            });
          }
        } catch { /* ignore */ }
      })();
    };
    window.addEventListener('NOVA:bind-studio-disk', onBind);
    return () => window.removeEventListener('NOVA:bind-studio-disk', onBind);
  }, []);

  const openProjectFolder = async () => {
    const root = chatStudioDiskRootRef.current;
    if (!root) {
      setDropHint('No folder path bound on this chat yet. Use + → Open folder.');
      return;
    }
    try {
      const res = await window.novaDesktop?.openPath?.(root);
      if (res === true || (res && typeof res === 'object' && res.ok)) {
        setDropHint(null);
        return;
      }
      const err = res && typeof res === 'object' && 'error' in res ? String(res.error || '') : '';
      setDropHint(err || `Could not open folder:\n${root}`);
    } catch (err) {
      setDropHint(err instanceof Error ? err.message : 'Could not open folder.');
    }
  };

  const openProjectPreview = async (): Promise<string | null> => {
    const chatId = routeChatIdRef.current || persistChatIdRef.current;
    if (!chatId) {
      setDropHint('Open or send a message in this chat first, then try Preview.');
      return null;
    }
    // Pin ownership before any open — blocks another chat's hidden probe from showing.
    const liveOwner = previewWindowIdForChat(chatId);
    void window.novaDesktop?.previewSetActiveChat?.({ projectId: liveOwner }).catch(() => undefined);

    // Trust the in-memory bind for this chat. Only re-resolve when unbound.
    let root = String(
      (studioBoundChatIdRef.current === chatId ? chatStudioDiskRootRef.current : null)
      || loadChatStudio(chatId)?.diskRoot
      || '',
    ).trim() || null;

    if (!root) {
      await rebindStudioForChat(chatId);
      root = chatStudioDiskRootRef.current;
    } else if (studioBoundChatIdRef.current !== chatId) {
      await rebindStudioForChat(chatId);
      root = chatStudioDiskRootRef.current || root;
    }

    // Never let a "heal" replace a good folder with a prompt-title path.
    if (root) {
      chatStudioDiskRootRef.current = root;
      setChatStudioDiskRoot(root);
      studioBoundChatIdRef.current = chatId;
    }

    if (!root) {
      setDropHint('No folder path on this chat. Use + → clip → Project folder…, then Preview.');
      return null;
    }

    // Never open a black Live window while create is still installing / writing.
    // Verifying with a known URL may open — blocking here made Live feel dead, then
    // auto-open later when verify finished (open/close thrash with probes).
    const createJob = getCreateJobForChat(chatId);
    if (createJob?.status === 'npm' || createJob?.status === 'writing') {
      setDropHint(
        createJob.status === 'npm'
          ? 'Still installing dependencies — Live unlocks when verified.'
          : 'Still writing project files — Live unlocks when verified.',
      );
      window.setTimeout(() => {
        setDropHint((prev) => (
          prev && /Still (installing|writing)/i.test(prev) ? null : prev
        ));
      }, 4500);
      return null;
    }
    if (createJob?.status === 'verifying') {
      const age = Date.now() - (Number(createJob.updatedAt) || 0);
      const urlReady = Boolean(
        String(createJob.previewUrl || previewUrlRef.current || '').trim()
        && !/127\.0\.0\.1:0|localhost:0|:\/\/0(?:\/|$)/.test(String(createJob.previewUrl || previewUrlRef.current || '')),
      );
      // Stale verifying (crash mid-CRL) — unlock recovery path instead of infinite wait.
      if (age > 8 * 60_000) {
        try {
          const { markCreateJobFailed } = await import('@/lib/createJobStore');
          markCreateJobFailed(createJob.id, 'Verify stalled — tell me what to fix, or open Live again');
        } catch { /* ignore */ }
      } else if (!urlReady) {
        setDropHint('Still verifying Live evidence — wait for Verified.');
        window.setTimeout(() => {
          setDropHint((prev) => (
            prev && /Still verifying/i.test(prev) ? null : prev
          ));
        }, 4500);
        return null;
      }
      // else: verifying but URL exists — fall through and open Live for the user.
    }

    if (createJob?.status === 'failed') {
      const why = String(createJob.error || 'Live evidence failed').slice(0, 120);
      if (createJob.craftBlocked) {
        setDropHint(`Unable to open preview — craft not Live-ready${why ? `: ${why}` : ''}`);
        window.setTimeout(() => {
          setDropHint((prev) => (prev && /Unable to open preview/i.test(prev || '') ? null : prev));
        }, 7000);
        return null;
      }
      setDropHint(`Live had a problem — ${why}. Opening anyway so you can see it.`);
      window.setTimeout(() => {
        setDropHint((prev) => (prev && /Live had a problem/i.test(prev || '') ? null : prev));
      }, 6000);
    }

    // Attach to create-job preview when Ready or verifying-with-URL (never during npm install).
    // User Live click: open immediately — skip hidden re-probe (that raced show/hide).
    if (
      createJob?.previewUrl
      && (createJob.status === 'ready' || createJob.status === 'verifying' || createJob.status === 'failed')
    ) {
      const existing = String(createJob.previewUrl).trim();
      if (existing && !/127\.0\.0\.1:0|localhost:0|:\/\/0(?:\/|$)/.test(existing)) {
        setPreviewUrl(existing);
        try {
          await window.novaDesktop?.previewOpenWindow?.({
            url: existing,
            title: studioPathBasename(root) || createJob.name || 'Preview',
            projectId: previewWindowIdForChat(chatId),
            show: true,
          });
        } catch { /* best-effort */ }
        return existing;
      }
    }

    // Attach-only when main already owns a session for this cwd — require mount, not HTTP alone.
    try {
      const { attachPreviewIfExists, isPlaceholderPreviewUrl, verifyLivePreviewUrl } = await import('@/lib/projectPreview');
      const attached = await attachPreviewIfExists({
        cwd: root,
        preferUrl: createJob?.previewUrl,
      });
      if (attached.ok && !isPlaceholderPreviewUrl(attached.url)) {
        const alive = await verifyLivePreviewUrl(attached.url);
        if (alive) {
          const probe = await window.novaDesktop?.previewProbeMounted?.({
            url: attached.url,
            title: studioPathBasename(root) || createJob?.name || 'Preview',
            waitMs: 2400,
            projectId: previewWindowIdForChat(chatId),
            show: false,
          }).catch(() => null);
          const mounted = Boolean(probe?.ok && probe?.mounted);
          // Only Vite/module compile failures block Live — not in-app runtime errors (e.g. calc).
          const consoleBad = Array.isArray(probe?.consoleErrors)
            && probe!.consoleErrors!.some((e: string) =>
              /plugin:vite|Transform failed|Failed to fetch dynamically imported module|does not provide an export named|Expected corresponding JSX|Failed to resolve import/i.test(String(e || '')));
          if (mounted && !consoleBad) {
            setPreviewUrl(attached.url);
            previewUrlRef.current = attached.url;
            // Never promote craft-blocked / failed jobs to evidence-ready via a click.
            // Record the URL only as an unverified open (status stays failed).
            if (createJob?.status === 'failed' && createJob.id && !createJob.craftBlocked) {
              try {
                const { updateCreateJob } = await import('@/lib/createJobStore');
                updateCreateJob(createJob.id, {
                  previewUrl: attached.url,
                  lastObservation: 'Preview opened (verify previously failed)',
                  evidencePass: false,
                });
              } catch { /* ignore */ }
            } else if (createJob?.craftBlocked && createJob.id) {
              try {
                const { updateCreateJob } = await import('@/lib/createJobStore');
                updateCreateJob(createJob.id, {
                  previewUrl: attached.url,
                  lastObservation: 'Preview opened (unverified — craft blocked)',
                  evidencePass: false,
                });
              } catch { /* ignore */ }
            }
            try {
              await window.novaDesktop?.previewOpenWindow?.({
                url: attached.url,
                title: studioPathBasename(root) || createJob?.name || 'Preview',
                projectId: previewWindowIdForChat(chatId),
                show: true,
              });
            } catch { /* best-effort */ }
            return attached.url;
          }
          if (consoleBad) {
            setDropHint('Live has console errors — tell me what to fix, or describe the errors in chat.');
          }
          // Dead / unmounted session — fall through and start a fresh preview.
        }
      }
    } catch { /* fall through to ensureBoundFolderPreview */ }

    const pid = previewWindowIdForChat(chatId);
    const snap = loadChatStudio(chatId);
    const folderName = studioPathBasename(root) || 'Preview';
    const title = folderName;
    const recentUserBrief = messagesRef.current
      .filter(m => m.role === 'user')
      .slice(-6)
      .map(m => m.content)
      .join('\n');
    const namedDevice = classifyNamedDevice(recentUserBrief);
    const mobileTarget = classifyMobileTarget(recentUserBrief);
    const filesForPreview = snap?.files && Object.keys(snap.files).length
      ? snap.files
      : (studioBoundChatIdRef.current === chatId ? chatStudioFilesRef.current : {});
    // Websites / Vite apps always open as a normal desktop window.
    // Phone chrome is only for native iOS/Android project trees (later on the stretch list).
    const nativeMobile = isNativeMobileTree(filesForPreview);
    const wantsPhoneFrame = nativeMobile && Boolean(
      namedDevice
      || mobileTarget
      || /\b(mobile\s+app|phone\s+app|for\s+(?:ios|android)|iphone|galaxy|pixel)\b/i.test(recentUserBrief),
    );
    const previewDevice = wantsPhoneFrame
      ? (namedDevice || defaultDeviceForTarget(mobileTarget || 'ios'))
      : null;
    const devicePayload = previewDevice
      ? {
        label: previewDevice.label,
        width: previewDevice.width,
        height: previewDevice.height,
        family: previewDevice.family,
      }
      : undefined;

    setDropHint(previewDevice ? `Opening ${previewDevice.label} preview…` : 'Opening preview…');
    try {
      const result = await ensureBoundFolderPreview({
        root,
        projectId: pid,
        title,
        files: snap?.files && Object.keys(snap.files).length
          ? snap.files
          : (studioBoundChatIdRef.current === chatId ? chatStudioFilesRef.current : {}),
        device: devicePayload,
      });
      if (!result.ok) {
        // One more try with a fresh disk hydrate (static/, index.html, run.bat).
        const hydrated = await loadPreviewFilesFromDisk(root);
        if (Object.keys(hydrated).length) {
          const merged = { ...chatStudioFilesRef.current, ...hydrated };
          setChatStudioFiles(merged);
          chatStudioFilesRef.current = merged;
          const retry = await ensureBoundFolderPreview({
            root,
            projectId: pid,
            title,
            files: merged,
            device: devicePayload,
          });
          if (retry.ok) {
            setPreviewUrl(retry.url);
            previewUrlRef.current = retry.url;
            persistStudioSnapshot(chatId, {
              files: hydrated,
              projectId: chatStudioProjectIdRef.current,
              name: folderName,
              diskRoot: root,
              previewUrl: retry.url,
            });
            setDropHint(null);
            return retry.url;
          }
        }
        setDropHint(result.error);
        window.setTimeout(() => {
          setDropHint(prev => (prev === result.error ? null : prev));
        }, 8000);
        return null;
      }
      setPreviewUrl(result.url);
      previewUrlRef.current = result.url;
      persistStudioSnapshot(chatId, {
        files: chatStudioFilesRef.current,
        projectId: chatStudioProjectIdRef.current,
        name: folderName,
        diskRoot: root,
        previewUrl: result.url,
      });
      // Do not call markCreateJobReady from the click path — that lied Tidepot into "Live"
      // after craft preflight failed. Keep failed/craftBlocked; store URL as unverified only.
      if (createJob?.status === 'failed' && createJob.id) {
        try {
          const { updateCreateJob } = await import('@/lib/createJobStore');
          updateCreateJob(createJob.id, {
            previewUrl: result.url,
            evidencePass: false,
            lastObservation: createJob.craftBlocked
              ? 'Preview opened (unverified — craft blocked)'
              : 'Preview opened (verify previously failed)',
          });
        } catch { /* ignore */ }
      }
      setDropHint(null);
      return result.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Preview failed to open.';
      setDropHint(msg);
      window.setTimeout(() => {
        setDropHint(prev => (prev === msg ? null : prev));
      }, 8000);
      return null;
    }
  };

  const pushLivePreview = async (files: Record<string, string>, openIfClosed = false) => {
    const chatId = persistChatIdRef.current;
    const pid = previewWindowIdForChat(chatId);
    const title = workspaceBadgeLabel || 'Preview';
    const url = await refreshLivePreview({
      projectId: pid,
      title,
      files,
      previewUrl,
      openIfClosed,
    });
    if (url) {
      setPreviewUrl(url);
      if (chatId) {
        persistStudioSnapshot(chatId, {
          files,
          projectId: chatStudioProjectIdRef.current,
          diskRoot: chatStudioDiskRootRef.current,
          previewUrl: url,
        });
      }
    }
  };

  const clonePickedRepo = async (repo: GitHubRepo) => {
    setGithubPickerOpen(false);
    setGithubOfferId(null);
    const token = getPluginRuntime('github', loadPluginState()).token?.trim();
    const project = addRecent(repo.name);
    const [owner, name] = repo.full_name.split('/');
    const cloned = await gitClone(project.id, githubCloneUrl(owner, name), token);
    if (!cloned.ok) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        user_id: user?.id ?? 'guest',
        project_id: null,
        role: 'assistant',
        content: cloned.error || `Could not clone ${repo.full_name}.`,
        provider_used: 'GitHub',
        created_at: new Date().toISOString(),
      }]);
      return;
    }
    const read = await window.novaDesktop?.projectRead?.(project.id);
    if (read?.ok && read.files && Object.keys(read.files || {}).length) {
      setChatStudioFiles(read.files as Record<string, string>);
      chatStudioFilesRef.current = read.files as Record<string, string>;
      setChatStudioProjectId(project.id);
      chatStudioProjectIdRef.current = project.id;
      if (read.root) {
        setChatStudioDiskRoot(read.root);
        chatStudioDiskRootRef.current = read.root;
      }
      const chatId = routeChatIdRef.current || persistChatIdRef.current;
      if (chatId) {
        persistStudioSnapshot(chatId, {
          files: read.files as Record<string, string>,
          projectId: project.id,
          name: repo.name,
          diskRoot: read.root || null,
        });
      }
      setPendingAttaches(prev => [
        ...prev.filter(a => a.kind !== 'folder'),
        { kind: 'folder' as const, name: repo.name, count: Object.keys(read.files || {}).length, projectId: project.id, id: project.id },
      ].slice(0, 12));
    }
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      user_id: user?.id ?? 'guest',
      project_id: null,
      role: 'assistant',
      content: `Cloned **${repo.full_name}** into this chat. Ask what it is or say **go implement** to edit.`,
      provider_used: 'GitHub',
      created_at: new Date().toISOString(),
    }]);
  };

  const addPendingImages = async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name));
    if (!images.length) return;
    const next: { id: string; name: string; dataUrl: string }[] = [];
    for (const f of images.slice(0, 4)) {
      if (f.size > 6_000_000) continue;
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(f);
        });
        if (!dataUrl.startsWith('data:image/')) continue;
        const id = `attach-${crypto.randomUUID().slice(0, 10)}`;
        rememberThumb(id, dataUrl);
        next.push({ id, name: f.name, dataUrl });
      } catch {
        /* skip unreadable */
      }
    }
    if (!next.length) return;
    // Stay pending on the composer until Send (lands in the thread with the message).
    setPendingImages(prev => [...prev, ...next].slice(0, 4));
    setDropHint(null);
    ignoreEnterUntilRef.current = Date.now() + 250;
    requestAnimationFrame(() => focusComposerIfSafe(textareaRef.current));
  };

  const applyDropResult = (result: Awaited<ReturnType<typeof resolveChatDrop>>) => {
    // Only explicit image drops go in the preview strip. never folder contents.
    if (result.images.length && !result.attaches.some(a => a.kind === 'folder')) {
      for (const img of result.images) rememberThumb(img.id, img.dataUrl);
      setPendingImages(prev => {
        const names = new Set(prev.map(p => p.name.toLowerCase()));
        const merged = [...prev];
        for (const img of result.images) {
          if (names.has(img.name.toLowerCase())) continue;
          names.add(img.name.toLowerCase());
          merged.push(img);
        }
        return merged.slice(0, 4);
      });
    }
    const fileCount = Object.keys(result.files).length;
    if (fileCount) {
      setChatStudioFiles(prev => ({ ...prev, ...result.files }));
    }
    if (result.projectId) setChatStudioProjectId(result.projectId);
    const nextAttaches = (result.attaches?.length
      ? result.attaches
      : (result.attach ? [result.attach] : [])
    )
      .filter(a => a.kind !== 'image')
      .map(a => ({
        ...a,
        id: a.id || a.projectId || `att-${crypto.randomUUID().slice(0, 8)}`,
      }));
    if (nextAttaches.length) {
      setPendingAttaches(prev => {
        const seen = new Set(prev.map(attachKey));
        const merged = [...prev];
        for (const a of nextAttaches) {
          const k = attachKey(a);
          if (seen.has(k)) continue;
          seen.add(k);
          merged.push(a);
        }
        return merged.slice(0, 12);
      });
      setDropHint(null);
    } else if (result.images.length && !result.attaches.some(a => a.kind === 'folder')) {
      setDropHint(null);
    } else if (result.note) {
      setDropHint(result.note);
    } else if (!fileCount && !result.images.length) {
      setDropHint('Nothing readable in that drop. try another folder or file.');
    }
    ignoreEnterUntilRef.current = Date.now() + 250;
  };

  const removePendingAttach = (meta: ChatAttachMeta) => {
    setPendingAttaches(prev => prev.filter(a => attachKey(a) !== attachKey(meta)));
    if (meta.kind === 'folder') {
      const prefix = `${meta.name}/`;
      setChatStudioFiles(prev => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (k.startsWith(prefix)) delete next[k];
        }
        return next;
      });
      // Folder X must not leave stray image chips behind.
      setPendingImages([]);
    } else if (meta.kind === 'file' || meta.kind === 'files') {
      setChatStudioFiles(prev => {
        const next = { ...prev };
        if (meta.name && next[meta.name] != null) delete next[meta.name];
        return next;
      });
    }
  };

  const onPickCodeFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setAttachUploading('Reading files…');
    try {
      const result = await resolveChatDrop(list);
      applyDropResult(result);
    } finally {
      setAttachUploading(null);
    }
  };

  const dragActiveRef = useRef(false);
  const setDragActive = (on: boolean) => {
    if (dragActiveRef.current === on) return;
    dragActiveRef.current = on;
    setDragOverChat(on);
  };

  // Capture-phase only. avoid React+window double handlers that flicker the overlay.
  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      allowWindowFileDrop(e);
      // Only show overlay for real file drags — empty types (focus/tooling) used to stick the overlay open.
      if (dropHasFiles(e.dataTransfer)) {
        setDragActive(true);
      }
    };
    const onOver = (e: DragEvent) => {
      allowWindowFileDrop(e);
    };
    const onLeave = (e: DragEvent) => {
      if (e.relatedTarget == null) setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      allowWindowFileDrop(e);
      setDragActive(false);
      const list = e.dataTransfer?.files;
      if (!list?.length) return;
      const snapshot = [...list];
      if (mode === 'image') {
        const imagesOnly = snapshot.filter(f =>
          f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name),
        );
        if (!imagesOnly.length) {
          setDropHint('Image mode only accepts photos (PNG, JPG, WebP, …).');
          return;
        }
        setAttachUploading('Uploading photos…');
        void (async () => {
          try {
            await addPendingImages(imagesOnly);
            setDropHint(null);
          } finally {
            setAttachUploading(null);
          }
        })();
        return;
      }
      setAttachUploading('Uploading…');
      void (async () => {
        try {
          const result = await resolveChatDrop(snapshot);
          applyDropResult(result);
          requestAnimationFrame(() => focusComposerIfSafe(textareaRef.current));
        } finally {
          setAttachUploading(null);
        }
      })();
    };
    window.addEventListener('dragenter', onEnter, true);
    window.addEventListener('dragover', onOver, true);
    window.addEventListener('dragleave', onLeave, true);
    window.addEventListener('drop', onDrop, true);
    return () => {
      window.removeEventListener('dragenter', onEnter, true);
      window.removeEventListener('dragover', onOver, true);
      window.removeEventListener('dragleave', onLeave, true);
      window.removeEventListener('drop', onDrop, true);
    };
  }, [mode]);

  const openFolderInChat = async (sourceDir?: string, opts?: {
    mode?: 'path' | 'import';
  }): Promise<{
    ok: boolean;
    files?: Record<string, string>;
    projectId?: string;
    name?: string;
    root?: string;
    error?: string;
    catalogOnly?: boolean;
  }> => {
    if (!window.novaDesktop?.projectImportFolder && !window.novaDesktop?.workspaceOpenRoot) {
      attachInputRef.current?.click();
      return { ok: false, error: 'Folder open is only available in the desktop app.' };
    }
    const pid = `proj-${crypto.randomUUID().slice(0, 8)}`;
    const wantImport = opts?.mode === 'import';
    // Prefer path bind: keep context light until Agent/tools need a file.
    const useInPlace = !wantImport && Boolean(window.novaDesktop?.workspaceOpenRoot);
    const bindEpoch = studioEpochRef.current;
    const bindChatAtStart = routeChatIdRef.current || persistChatIdRef.current || null;
    const stillOnBindCanvas = () => {
      if (studioEpochRef.current !== bindEpoch) return false;
      const now = routeChatIdRef.current || persistChatIdRef.current || null;
      // Blank→blank is ok only if epoch matches; blank→named chat means we left the starter.
      if (bindChatAtStart && now !== bindChatAtStart) return false;
      if (!bindChatAtStart && now) return false;
      return true;
    };
    setAttachUploading(useInPlace ? 'Binding folder path…' : 'Opening folder…');
    setAttachBusy(true);
    // Keep grant-access / pick-folder hints visible under the composer while Explorer is open
    // (attachUploading hides them temporarily; restore on cancel).
    const hintBeforeOpen = dropHintRef.current;
    const onProg = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { label?: string; done?: number; total?: number } | undefined;
      if (d?.label) setAttachUploading(d.label);
      else if (d?.total) setAttachUploading(`Reading ${d.done || 0}/${d.total}`);
    };
    window.addEventListener('NOVA:project-import-progress', onProg);
    try {
      const res = useInPlace
        ? await window.novaDesktop?.workspaceOpenRoot?.({
          projectId: pid,
          ...(sourceDir ? { sourceDir } : {}),
          catalogOnly: true,
        })
        : await window.novaDesktop?.projectImportFolder?.({
          projectId: pid,
          ...(sourceDir ? { sourceDir } : {}),
        });
      if (res?.canceled) {
        if (stillOnBindCanvas() && hintBeforeOpen) setDropHint(hintBeforeOpen);
        return { ok: false, error: 'canceled' };
      }
      if (!stillOnBindCanvas()) {
        return { ok: false, error: 'stale bind' };
      }
      if (!res?.ok) {
        if ((res as { error?: string })?.error === 'file' && (res as { path?: string })?.path) {
          const filePath = String((res as { path: string }).path);
          const base = (res as { name?: string }).name || filePath.split(/[/\\]/).pop() || 'file';
          if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(base)) {
            const data = await window.novaDesktop.readDataUrl?.(filePath);
            if (data?.ok && data.dataUrl) {
              const id = `attach-${crypto.randomUUID().slice(0, 10)}`;
              rememberThumb(id, data.dataUrl);
              setPendingImages([{ id, name: base, dataUrl: data.dataUrl! }]);
              return { ok: true };
            }
          }
          const read = await window.novaDesktop.readTextFile?.({ path: filePath });
          const text = read?.ok && read.text != null ? read.text : `[Attached file: ${base}]`;
          setChatStudioFiles({ [base]: text });
          chatStudioFilesRef.current = { [base]: text };
          setPendingAttaches([{ kind: 'file' as const, name: base, count: 1, id: `file-${pid}` }]);
          return { ok: true };
        }
        const err = res?.error || 'Could not open that folder.';
        setDropHint(err);
        return { ok: false, error: err };
      }
      if (!stillOnBindCanvas()) {
        return { ok: false, error: 'stale bind' };
      }
      const catalogOnly = Boolean((res as { catalogOnly?: boolean }).catalogOnly) || useInPlace;
      const folderName = res.name || 'folder';
      const files: Record<string, string> = {};
      const inPlaceRoot = Boolean(res.root && res.inPlace !== false);
      if (!catalogOnly) {
        const rawFiles = res.files || {};
        for (const [rel, text] of Object.entries(rawFiles)) {
          const pathKey = String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
          if (!pathKey) continue;
          if (inPlaceRoot) {
            const stripped = pathKey.startsWith(`${folderName}/`)
              ? pathKey.slice(folderName.length + 1)
              : pathKey;
            files[stripped || pathKey] = text;
          } else {
            files[pathKey.startsWith(`${folderName}/`) ? pathKey : `${folderName}/${pathKey}`] = text;
          }
        }
      }
      const listed = Number((res as { listed?: number }).listed || 0);
      const count = catalogOnly ? listed : Object.keys(files).length;
      if (!catalogOnly && !count) {
        setDropHint(`Opened “${folderName}” but it looks empty.`);
        return { ok: false, error: 'empty folder' };
      }
      if (catalogOnly && !res.root) {
        setDropHint('Could not bind that folder path.');
        return { ok: false, error: 'no root' };
      }
      if (!stillOnBindCanvas()) {
        return { ok: false, error: 'stale bind' };
      }
      setChatStudioFiles(catalogOnly ? {} : files);
      chatStudioFilesRef.current = catalogOnly ? {} : files;
      setChatStudioProjectId(pid);
      chatStudioProjectIdRef.current = pid;
      if (res.root) {
        setChatStudioDiskRoot(res.root);
        chatStudioDiskRootRef.current = res.root;
      }
      // Catalog binds return files:{} — hydrate a real previewable map so Ready/edit see the tree.
      if (catalogOnly && res.root) {
        try {
          const hydrated = await loadPreviewFilesFromDisk(res.root);
          if (!stillOnBindCanvas()) {
            return { ok: false, error: 'stale bind' };
          }
          if (Object.keys(hydrated).length) {
            setChatStudioFiles(hydrated);
            chatStudioFilesRef.current = hydrated;
            Object.assign(files, hydrated);
          }
        } catch {
          /* keep empty map; Preview can still use diskRoot */
        }
      }
      if (!stillOnBindCanvas()) {
        return { ok: false, error: 'stale bind' };
      }
      // New folder bind must not reuse another chat's localhost URL.
      setPreviewUrl(null);
      previewUrlRef.current = null;
      const scopeChat = routeChatIdRef.current || persistChatIdRef.current;
      if (scopeChat) studioBoundChatIdRef.current = scopeChat;
      // Path binds stay in the composer pill — never as chat attachment cards.
      setPendingAttaches([]);
      setPathBindOpen(false);
      setPathBindDraft('');
      if (pillModeRef.current === 'debug') {
        const readyCount = Object.keys(chatStudioFilesRef.current || {})
          .filter((p) => !/(^|\/)(node_modules|dist|build|release|\.git)(\/|$)/i.test(p.replace(/\\/g, '/')))
          .length;
        setDropHint(`${folderName} · ${readyCount} files · Press Enter to scan.`);
        if (!String(inputRef.current || '').trim()) {
          setInput(DEBUG_CLINIC_SEED);
          inputRef.current = DEBUG_CLINIC_SEED;
        }
      } else {
        setDropHint(null);
      }
      if (!catalogOnly || Object.keys(chatStudioFilesRef.current).length) {
        try {
          localStorage.setItem(`NOVA:chat-studio-files:${pid}`, JSON.stringify({
            name: folderName,
            files: chatStudioFilesRef.current,
          }));
        } catch { /* ignore */ }
      }
      if (scopeChat) {
        persistStudioSnapshot(scopeChat, {
          files: chatStudioFilesRef.current,
          projectId: pid,
          name: folderName,
          diskRoot: res.root || null,
          previewUrl: null,
        });
        if (res.root) {
          setLastDiskTarget(scopeChat, {
            path: res.root,
            name: folderName,
            kind: 'folder',
          });
        }
      } else {
        // New chat not id'd yet — keep disk root until first send persists it.
        writePendingStudioBind({
          files: chatStudioFilesRef.current,
          projectId: pid,
          name: folderName,
          diskRoot: res.root || null,
        });
      }
      ignoreEnterUntilRef.current = Date.now() + 600;
      requestAnimationFrame(() => focusComposerIfSafe(textareaRef.current));
      return {
        ok: true,
        files: chatStudioFilesRef.current,
        projectId: pid,
        name: folderName,
        root: res.root,
        catalogOnly,
      };
    } finally {
      window.removeEventListener('NOVA:project-import-progress', onProg);
      setAttachUploading(null);
      setAttachBusy(false);
    }
  };

  

  const bindTypedPath = async () => {
    const typed = pathBindDraft.trim().replace(/^["']|["']$/g, '');
    if (!typed) {
      setDropHint('Paste a folder path, or choose Browse…');
      return;
    }
    const stat = await window.novaDesktop?.workspaceStatPath?.(typed);
    if (!stat?.ok || !stat.path) {
      setDropHint(stat?.error || 'That path was not found.');
      return;
    }
    if (!stat.isDirectory) {
      // Single file: bind its parent folder, keep the file as a light attach.
      const parent = typed.replace(/[/\\][^/\\]+$/, '');
      const parentStat = await window.novaDesktop?.workspaceStatPath?.(parent);
      if (parentStat?.ok && parentStat.isDirectory && parentStat.path) {
        await openFolderInChat(parentStat.path, { mode: 'path' });
        setPathBindOpen(false);
        setPathBindDraft('');
        setDropHint(null);
        return;
      }
      setDropHint('Pick a folder path (or a file inside a project folder).');
      return;
    }
    await openFolderInChat(stat.path, { mode: 'path' });
    setPathBindOpen(false);
    setPathBindDraft('');
    setDropHint(null);
  };

  const browseBindFolder = async () => {
    setPathBindOpen(false);
    setPathBindDraft('');
    await openFolderInChat(undefined, { mode: 'path' });
  };

  useEffect(() => {
    const scope = route.name === 'chat' ? (route.chatId || 'new-chat') : 'new-chat';
    setTokenRatio(getTokenUsageRatio(scope));
    setModelRatio(getModelHealthRatio(scope));
  }, [route]);

  const attachImagesFromPaths = async (paths: string[]) => {
    const next: { id: string; name: string; dataUrl: string }[] = [];
    for (const abs of paths.slice(0, 4)) {
      const data = await window.novaDesktop?.readDataUrl?.(abs);
      if (data?.ok && data.dataUrl?.startsWith('data:image/')) {
        const id = `attach-${crypto.randomUUID().slice(0, 10)}`;
        rememberThumb(id, data.dataUrl);
        next.push({ id, name: data.name || abs.split(/[/\\]/).pop() || 'image', dataUrl: data.dataUrl });
      }
    }
    if (next.length) {
      setPendingImages(prev => [...prev, ...next].slice(0, 4));
      setDropHint(null);
      ignoreEnterUntilRef.current = Date.now() + 250;
      requestAnimationFrame(() => focusComposerIfSafe(textareaRef.current));
    } else {
      setDropHint('Could not read those images.');
    }
  };

  const attachFilesFromPaths = async (paths: string[]) => {
    if (!paths.length) return;
    const imagePaths = paths.filter(p => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(p));
    const filePaths = paths.filter(p => !/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(p));
    if (imagePaths.length) {
      await attachImagesFromPaths(imagePaths);
    }
    if (!filePaths.length) return;
    if (filePaths.length > 4) {
      setDropHint('Up to 4 files per attach. Prefer + → clip → Project folder for whole folders.');
    }
    const nextFiles: Record<string, string> = {};
    const metas: ChatAttachMeta[] = [];
    for (const abs of filePaths.slice(0, 4)) {
      const base = abs.split(/[/\\]/).pop() || 'file';
      const read = await window.novaDesktop?.readTextFile?.({ path: abs });
      const text = read?.ok && read.text != null
        ? read.text
        : `[Attached file: ${base}]`;
      nextFiles[base] = text;
      metas.push({
        kind: 'file' as const,
        name: base,
        count: 1,
        id: `file-${crypto.randomUUID().slice(0, 8)}`,
      });
    }
    setChatStudioFiles(prev => ({ ...prev, ...nextFiles }));
    chatStudioFilesRef.current = { ...chatStudioFilesRef.current, ...nextFiles };
    setPendingAttaches(prev => {
      const seen = new Set(prev.map(attachKey));
      const merged = [...prev];
      for (const m of metas) {
        const k = attachKey(m);
        if (seen.has(k)) continue;
        seen.add(k);
        merged.push(m);
      }
      return merged.slice(0, 12);
    });
    setDropHint(null);
    ignoreEnterUntilRef.current = Date.now() + 250;
    requestAnimationFrame(() => focusComposerIfSafe(textareaRef.current));
  };

  const handlePlusAction = (action: ComposerPlusAction) => {
    if (mode === 'image') {
      if (action === 'attach' || action === 'image' || action === 'file') {
        void pickPhotosIntoChat();
      }
      return;
    }
    // Combined paperclip Attach — photos, PDFs, notes, any file.
    if (action === 'attach') {
      void pickFilesIntoChat();
      return;
    }
    if (action === 'image') {
      void pickPhotosIntoChat();
      return;
    }
    if (action === 'file') {
      void pickFilesIntoChat();
      return;
    }
    if (action === 'bind-path' || action === 'folder' || action === 'enter-path') {
      // Native Explorer immediately — no typed-path strip.
      setPathBindOpen(false);
      setPathBindDraft('');
      setDropHint('Pick the project folder to bind.');
      void openFolderInChat(undefined, { mode: 'path' });
      return;
    }
    if (action === 'import-folder') {
      void openFolderInChat(undefined, { mode: 'import' });
      return;
    }
    if (action === 'models-brain') {
      setDropHint('Models · pick a brain or enable Ollama · not a plugin');
      navigate({ name: 'models' });
      return;
    }
    // Ask / Plan / Act (agent) live under + ; Debug stays parked until clinic ships.
    if (action === 'ask') {
      setComposerMode('ask');
      setDropHint(null);
      return;
    }
    if (action === 'plan') {
      setComposerMode('plan');
      setDropHint(null);
      return;
    }
    if (action === 'agent') {
      setComposerMode('agent');
      setDropHint(null);
      return;
    }
    if (action === 'multitask') {
      setComposerMode('multitask');
      setDropHint(null);
      return;
    }
    if (action === 'debug') {
      if (isDebugComposerParked()) return;
      setComposerMode('debug');
      setDropHint(null);
    }
  };

  /** Native OS photo picker (Windows File Explorer). */
  const pickPhotosIntoChat = async () => {
    if (!window.novaDesktop?.pickFiles) {
      imageInputRef.current?.click();
      return;
    }
    const res = await window.novaDesktop.pickFiles({ imagesOnly: true });
    if (res?.canceled || !res?.ok || !res.paths?.length) return;
    await attachImagesFromPaths(res.paths);
    // Soft guard against dialog-close Enter on an empty box — payload Enter still sends.
    ignoreEnterUntilRef.current = Date.now() + 250;
  };

  /** Native OS file picker (notes, PDF, code, anything readable). */
  const pickFilesIntoChat = async () => {
    if (!window.novaDesktop?.pickFiles) {
      attachInputRef.current?.click();
      return;
    }
    const res = await window.novaDesktop.pickFiles();
    if (res?.canceled || !res?.ok || !res.paths?.length) return;
    await attachFilesFromPaths(res.paths);
    ignoreEnterUntilRef.current = Date.now() + 250;
  };

  const runEphemeralVoiceTurn = async (rawContent: string) => {
    const pinnedModel = activeModelRef.current;
    const isTap = !rawContent.trim() || rawContent === '<!--nova-voice-turn-->';
    const typed = isTap ? '' : rawContent.trim();

    const finishVoice = async (phase: VoiceSessionPhase, speak?: string) => {
      if (stopRequestedRef.current) {
        stopSpeaking();
        setVoicePhase('idle');
        return;
      }
      if (speak) {
        await speakText(speak.replace(/\*\*/g, '').replace(/[#*`]/g, ''), {
          onPlaybackStart: () => {
            if (!stopRequestedRef.current) setVoicePhase('speaking');
          },
        });
      }
      if (stopRequestedRef.current) {
        stopSpeaking();
        setVoicePhase('idle');
        return;
      }
      setVoicePhase(phase);
    };

    if (!typed) {
      setDictationHint('Type your message, or tap the mic to fill the box — then press Enter.');
      setVoicePhase('idle');
      return;
    }

    if (looksLikeHarmfulContentAsk(typed)) {
      await finishVoice('idle', harmfulContentBlockedReply(true));
      return;
    }

    if (looksLikeArkSelfHarmAsk(typed)) {
      await finishVoice('idle', arkSelfHarmBlockedReply());
      return;
    }

    if (looksLikeVoiceBuildOrEditAsk(typed)) {
      // Voice stays conversation-only — refuse builds/edits (avoid re-entry loop into Voice).
      await finishVoice('idle', voiceBuildEditRefuseReply());
      return;
    }

    // Typed / mic-filled turns only need TTS (STT is mic → box only).
    if (typeof window === 'undefined'
      || (!('speechSynthesis' in window) && !window.novaDesktop?.voiceNeuralSpeak)) {
      await finishVoice('idle', 'Voice needs text-to-speech in this build.');
      return;
    }

    const liveCap = await probeLiveCapacity();
    // Capacity can lag; trust stored keys directly so Voice doesn't false-block.
    if (!liveCap.liveChat && !hasAnyCloudChatKey()) {
      await finishVoice(
        'idle',
        'To use Voice, connect a free API key in Models, or install a local brain in Local AI.',
      );
      return;
    }

    if (generatingRef.current) return;
    generatingRef.current = true;
    beginChatInflight();
    setGenerating(true);
    stopRequestedRef.current = false;

    try {
      const voiceMsg = typed;

      setVoicePhase('thinking');
      // Hold line while we think / look up — then answer aloud.
      if (!stopRequestedRef.current) {
        await speakText(pickVoiceHoldLine(voiceMsg), {
          onPlaybackStart: () => {
            if (!stopRequestedRef.current) setVoicePhase('speaking');
          },
        });
        if (stopRequestedRef.current) {
          setVoicePhase('idle');
          return;
        }
        setVoicePhase('thinking');
      }
      if (stopRequestedRef.current) {
        setVoicePhase('idle');
        return;
      }
      const routed = await voiceChatRoute(voiceMsg, {
        id: pinnedModel.id,
        name: pinnedModel.name,
        source: pinnedModel.source,
      });
      if (stopRequestedRef.current) {
        stopSpeaking();
        setVoicePhase('idle');
        return;
      }
      const spoken = scrubVoiceConstraintEcho(
        redactArkSelfLeak(String(routed.reply || '').trim()),
      ) || 'I did not have a reply for that.';
      await finishVoice('idle', spoken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      await finishVoice('idle', msg);
    } finally {
      generatingRef.current = false;
      setGenerating(false);
      endChatInflight();
    }
  };

  const handleVoiceActivate = useCallback(() => {
    if (!user || mode !== 'voice' || !isVoiceTabEnabled()) return;
    const busy = generating
      || voicePhase === 'listening'
      || voicePhase === 'thinking'
      || voicePhase === 'speaking';
    if (busy) return;
    void sendMessageRef.current('<!--nova-voice-turn-->');
  }, [user, mode, generating, voicePhase]);

  const handleSend = () => {
    if (dictating || dictationRef.current) {
      stopComposerDictation();
    }
    if (mode === 'voice') {
      if (!user) {
        /* guest voice still allowed via hydrate */
      }
      const busy = generating
        || voicePhase === 'listening'
        || voicePhase === 'thinking'
        || voicePhase === 'speaking';
      if (busy) return;
      void sendMessageRef.current(input.trim() || '<!--nova-voice-turn-->');
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }
    let content = input.trim();
    const images = pendingImages;
    const attaches = pendingAttaches;
    const hasStudio = Object.keys(chatStudioFilesRef.current).length > 0
      || Boolean(chatStudioDiskRootRef.current)
      || Boolean(chatStudioProjectIdRef.current);
    const chatIdForBind = route.name === 'chat' ? route.chatId : undefined;
    const workspaceBoundForSend = hasActiveWorkspace({
      files: chatStudioFilesRef.current,
      projectId: chatStudioProjectIdRef.current,
      diskRoot: chatStudioDiskRootRef.current,
      chatId: chatIdForBind,
    });

    // Debug/Plan/Agent pills removed — clear any sticky mode before send.
    if (pillModeRef.current) {
      setComposerMode(null);
    }

    if (!content && !images.length && !attaches.length && !hasStudio) return;
    if (pillModeRef.current === 'debug' && !content && !images.length && !attaches.length && workspaceBoundForSend) {
      content = DEBUG_CLINIC_SEED;
    }
    // Plan/Agent/Multi-agent/Debug pills removed — never soft-arm or inject mode markers.
    if (pillModeRef.current || composerMode) {
      setComposerMode(null);
      setDropHint(null);
    }
    // Strip leftover mode markers from pasted/old-thread content so they cannot steal the turn.
    content = String(content || '')
      .replace(/<!--nova-(?:plan-mode|agent-mode|multi-agent|debug-clinic)-->\s*/gi, '')
      .replace(/^\[(?:Plan|Ask|Agent|Debug|Tasks|Multi-agent)\]\s*/i, '');
    const userTyped = Boolean(content.trim());
    const parts: string[] = [];
    // Folder binds stay as composer pills only — never dump into the chat transcript.
    // Photos go in as markdown thumbs only (ChatGPT-style) — not a filename attach chip.
    const chatAttaches = [
      ...attaches.filter(a => a.kind === 'file' || a.kind === 'files'),
    ];
    if (chatAttaches.length) {
      parts.push(encodeChatAttaches(chatAttaches));
    }
    if (userTyped) {
      parts.push(content);
    } else if (chatAttaches.length) {
      parts.push('<!--nova-auto-read-->');
    } else if (hasStudio && !userTyped && !images.length) {
      // Bound path with Enter and no text — nudge them to type an ask.
      setDropHint('Path is bound. Type what you want changed, then press Enter.');
      return;
    } else if (images.length) {
      const hasStudio = Object.keys(chatStudioFilesRef.current).length > 0
        || Boolean(chatStudioDiskRootRef.current);
      content = mode === 'image'
        ? 'Recreate and improve this image'
        : hasStudio
          ? 'I attached a screenshot of the project UI. Look at it carefully and wait for my fix ask. or tell me what stands out.'
          : 'What is in this image?';
      parts.push(content);
    }
    if (images.length) {
      // Neutral alt — never the filename (models invent from misleading names like cat-portrait.jpg).
      parts.push(...images.map(img => `![photo](nova-media:${img.id})`));
    }
    content = parts.join('\n\n');
    setPendingImages([]);
    setPendingAttaches([]);
    // Modes stripped — always clear composer mode after Enter.
    setComposerMode(null);
    // Queue only when THIS thread is already answering. Other chats / blank New Chat
    // can still start a send — per-chat seq keeps the background create alive.
    const viewingChatId = route.name === 'chat' ? route.chatId : undefined;
    const genId = activeGenChatIdRef.current;
    const inflightHere = Boolean(
      (viewingChatId && isChatInflight(viewingChatId))
      || (generatingRef.current && genId && viewingChatId && viewingChatId === genId),
    );
    const busyOnThisChat = inflightHere;
    const sameAsLast = lastSendGuardRef.current.text === content
      && (Date.now() - lastSendGuardRef.current.at) < 4000;
    const alreadySentInThread = messagesRef.current.some(
      m => m.role === 'user' && String(m.content || '').trim() === content.trim(),
    );
    if (busyOnThisChat) {
      const qChat = viewingChatId || genId || persistChatIdRef.current || 'pending';
      const dupQueued = pendingQueueRef.current.some(q => q.chatId === qChat && q.text === content);
      // Never re-queue the identical prompt that just started (double Enter / CDP click+Enter)
      // or a prompt already sitting in this thread (ghost queue after switch).
      if (sameAsLast || dupQueued || alreadySentInThread) {
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        return;
      }
      // Cap at 3 — newest stays; drop the oldest waiting item.
      const MAX_QUEUE = 3;
      const nextQueue = [
        ...pendingQueueRef.current.filter(q => q.chatId === qChat),
        {
          id: `q-${crypto.randomUUID().slice(0, 8)}`,
          text: content,
          chatId: qChat,
        },
      ];
      const trimmed = nextQueue.length > MAX_QUEUE
        ? nextQueue.slice(nextQueue.length - MAX_QUEUE)
        : nextQueue;
      pendingQueueRef.current = [
        ...pendingQueueRef.current.filter(q => q.chatId !== qChat),
        ...trimmed,
      ];
      // Mid-turn STEER — stash on studio Acc so invent craft can apply at next checkpoint.
      if (/^\s*STEER\b/i.test(content) || /\b(?:steer|nudge)\b/i.test(content.slice(0, 48))) {
        try {
          const cur = { ...(chatStudioFilesRef.current || {}) };
          cur['.__novaSteer'] = content.slice(0, 500);
          setChatStudioFiles(cur);
          chatStudioFilesRef.current = cur;
        } catch { /* optional */ }
      }
      try {
        void import('@/lib/inventHarnessPack').then((m) => {
          m.enqueueCraftPrompt(qChat, content);
        });
      } catch { /* optional */ }
      setQueueLen(pendingQueueRef.current.filter(q => !viewingChatId || q.chatId === viewingChatId).length);
      setQueueTick(t => t + 1);
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }
    if (sameAsLast) {
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }
    lastSendGuardRef.current = { text: content, at: Date.now() };
    // Mark busy before the async send so a second Enter in the same tick queues/dedupes.
    generatingRef.current = true;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    void sendMessageRef.current(content);
  };

  const sendMessage = async (content: string) => runAIChatSend(content, {
    activeGenChatIdRef,
    activeModelRef,
    addChat,
    addCreation,
    capacity,
    chatPlugins,
    chatRouteSeedRef,
    chatStudioDiskRoot,
    chatStudioDiskRootRef,
    chatStudioFilesRef,
    chatStudioProjectIdRef,
    chatTurnCtlRef,
    chats,
    commitStudioForChat,
    composerMode,
    composerModeFromContent,
    endTurnAndFlush,
    engineInstallingModels,
    failoverChipText,
    flushQueuedSend,
    genSeqRef,
    genSeqByChatRef,
    stopRequestedByChatRef,
    generating,
    generatingRef,
    handleSend,
    imageBriefRef,
    lastFolderLocateNoteRef,
    lastStudioIntentRef,
    messages,
    messagesChatIdRef,
    messagesRef,
    mode,
    navigate,
    openFolderInChat,
    pendingFileDeleteRef,
    pendingFolderClarifyRef,
    pendingProjectDeleteRef,
    regeneratePendingRef,
    persistChatIdRef,
    persistModeThread,
    persistStudioSnapshot,
    persistTimerRef,
    placeholder,
    previewFromText,
    previewUrlRef,
    pushLivePreview,
    renameChat,
    touchRecentProject,
    resolveStudioFiles,
    route,
    routeChatIdRef,
    runEphemeralVoiceTurn,
    setCapacity,
    setChatStudioDiskRoot,
    setChatStudioFiles,
    setChatStudioProjectId,
    setCodePillSticky,
    setDeleteFilePrompt,
    setDeleteFolderClarifyPrompt,
    setDeleteProjectPrompt,
    setFailoverNote,
    setGenerating,
    setIpcFallbackDev,
    setMessages,
    setModelRatio,
    setActiveModel,
    setPreviewUrl,
    setThreadBrain,
    setCreateLiveModelLabel,
    setDropHint,
    setTokenRatio,
    skipChatLoadIdsRef,
    stickToBottomRef,
    stopRequestedRef,
    studioBoundChatIdRef,
    threadBrainRef,
    threadKind,
    user,
    userDetachScrollRef,
    videoDurationSec,
    setComposerMode,
  });

  sendMessageRef.current = sendMessage;

  useEffect(() => {
    const onContinue = () => {
      setComposerMode('agent');
      const lastUser = [...messagesRef.current].reverse().find((m) => m.role === 'user');
      const text = String(lastUser?.content || '').replace(/<!--[\s\S]*?-->/g, '').trim();
      if (!text || /^continue$/i.test(text)) return;
      setInput(text);
      tryStartTurn(text);
    };
    window.addEventListener('NOVA:agent-continue', onContinue);
    return () => window.removeEventListener('NOVA:agent-continue', onContinue);
  }, []);

  /** Grow textarea up to ~4 lines, then scroll inside the box (thread stays put). */
  const resizeComposer = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    // 15px font × 1.55 line-height × 4 lines + vertical padding ≈ 6.2rem
    const max = Math.round(6.2 * 16);
    const minPx = 44;
    const prevHeight = el.style.height;
    const locked = el.offsetHeight;
    el.style.height = `${minPx}px`;
    const raw = el.scrollHeight;
    const next = Math.max(minPx, Math.min(raw, max));
    if (Math.abs(next - locked) <= 1 && prevHeight) {
      el.style.height = prevHeight;
    } else {
      el.style.height = `${next}px`;
    }
    el.style.overflowY = 'auto';
  }, []);

  const onComposerPaste = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const dt = e.clipboardData;
    if (!dt) return;
    // Prefer image paste (Snipping Tool / screenshot). let plain text use default.
    const hasImage = [...(dt.items || [])].some(it => /^image\//i.test(it.type))
      || [...(dt.files || [])].some(f => /^image\//i.test(f.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name));
    if (!hasImage) return;
    e.preventDefault();
    void (async () => {
      const imgs = await imagesFromClipboardData(dt);
      if (!imgs.length) {
        setDropHint('Could not read that screenshot from the clipboard. Try + → Image, or drag the file in.');
        return;
      }
      for (const img of imgs) rememberThumb(img.id, img.dataUrl);
      setPendingImages(prev => [...prev, ...imgs].slice(0, 4));
      setDropHint(null);
      ignoreEnterUntilRef.current = Date.now() + 600;
      if (getLocalPrefs().clearClipboardAfterPaste && navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(''); } catch { /* permission */ }
      }
    })();
  };

  const onInput = (value: string) => {
    // Keyboard wins over live speech — otherwise interim results keep wiping keystrokes.
    if (dictationRef.current || dictating) {
      stopComposerDictation();
    }
    setInput(value);
    if (dictationHint) setDictationHint(null);
    if (imageSwitchDismissed && !looksLikeImageAsk(value)) setImageSwitchDismissed(false);
  };

  const toggleComposerDictation = useCallback(() => {
    if (dictating) {
      stopComposerDictation();
      return;
    }
    if (!speechRecognitionSupported()) {
      setDictationHint('Speech-to-text is not available in this build.');
      return;
    }
    if (generating) return;

    dictationBaseRef.current = inputRef.current.trim();
    setDictationHint(null);
    setDictating(true);
    const myGen = ++dictationGenRef.current;
    dictationRef.current = startLiveDictation({
      onInterim: (text) => {
        if (myGen !== dictationGenRef.current) return;
        const base = dictationBaseRef.current;
        const next = base ? `${base} ${text}`.trim() : text;
        setInput(next);
        inputRef.current = next;
        requestAnimationFrame(() => resizeComposer());
      },
      onFinal: (text) => {
        if (myGen !== dictationGenRef.current) return;
        const base = dictationBaseRef.current;
        const next = base ? `${base} ${text}`.trim() : text;
        setInput(next);
        inputRef.current = next;
        dictationBaseRef.current = next;
        requestAnimationFrame(() => {
          resizeComposer();
          focusComposerIfSafe(textareaRef.current);
        });
      },
      onError: (error) => {
        if (myGen !== dictationGenRef.current) return;
        setDictationHint(error);
      },
      onEnd: () => {
        if (myGen !== dictationGenRef.current) return;
        dictationRef.current = null;
        setDictating(false);
      },
    });
  }, [dictating, generating, resizeComposer, stopComposerDictation]);

  useEffect(() => () => {
    dictationGenRef.current += 1;
    dictationRef.current?.stop();
    dictationRef.current = null;
  }, []);

  useLayoutEffect(() => {
    resizeComposer();
  }, [input, resizeComposer]);

  // Live/CDP helper: stage disk paths into pending attaches (images + files) without the OS dialog.
  const attachFilesFromPathsRef = useRef(attachFilesFromPaths);
  attachFilesFromPathsRef.current = attachFilesFromPaths;
  useEffect(() => {
    const w = window as Window & {
      __novaLiveAttach?: (paths: string[]) => Promise<{ ok: boolean; error?: string }>;
      __novaStressWrite?: (opts: {
        path: string;
        content: string;
        projectId?: string;
        projectName?: string;
        diskRoot?: string;
      }) => Promise<{ ok: boolean; error?: string; bytes?: number; lines?: number }>;
      __novaStressOpenCode?: () => boolean;
    };
    w.__novaLiveAttach = async (paths: string[]) => {
      try {
        const list = (paths || []).map(String).filter(Boolean);
        if (!list.length) return { ok: false, error: 'no paths' };
        await attachFilesFromPathsRef.current(list);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    };
    w.__novaStressWrite = async (opts) => {
      try {
        const rel = String(opts?.path || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
        const content = String(opts?.content || '');
        if (!rel || !content) return { ok: false, error: 'path/content required' };
        const diskRoot = String(opts?.diskRoot || chatStudioDiskRootRef.current || '').trim();
        const projectId = String(opts?.projectId || chatStudioProjectIdRef.current || 'stress').trim();
        if (!diskRoot) return { ok: false, error: 'diskRoot required' };
        if (!window.novaDesktop?.workspaceWriteFile) {
          return { ok: false, error: 'workspaceWriteFile unavailable' };
        }
        const targetPath = `${diskRoot.replace(/[\\/]+$/, '')}/${rel}`.replace(/\//g, '\\');
        const started = Date.now();
        const written = await window.novaDesktop.workspaceWriteFile({
          targetPath,
          content,
        });
        if (!written?.ok) {
          return { ok: false, error: written?.error || 'write failed', elapsedMs: Date.now() - started };
        }
        // Verify from disk
        let got = content;
        if (window.novaDesktop.readTextFile) {
          const check = await window.novaDesktop.readTextFile({ path: targetPath });
          if (check?.ok && typeof check.text === 'string') got = check.text;
        }
        const next = { ...chatStudioFilesRef.current, [rel]: got };
        setChatStudioFiles(next);
        chatStudioFilesRef.current = next;
        setChatStudioDiskRoot(diskRoot);
        chatStudioDiskRootRef.current = diskRoot;
        setChatStudioProjectId(projectId);
        chatStudioProjectIdRef.current = projectId;
        return {
          ok: true,
          bytes: got.length,
          lines: got.split(/\r?\n/).length,
          elapsedMs: Date.now() - started,
        };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    };
    w.__novaStressOpenCode = () => {
      try {
        setCodeOverlayOpen(true);
        return true;
      } catch {
        return false;
      }
    };
    return () => {
      try { delete w.__novaLiveAttach; } catch { /* ignore */ }
      try { delete w.__novaStressWrite; } catch { /* ignore */ }
      try { delete w.__novaStressOpenCode; } catch { /* ignore */ }
    };
  }, []);

  return {
    activeModel,
    addPendingImages,
    attachBusy,
    attachInputRef,
    attachUploading,
    autoModelLabel,
    bindTypedPath,
    browseBindFolder,
    capacity,
    chatPlugins,
    chatStudioDiskRoot,
    chatStudioDiskRootRef,
    chatStudioFiles,
    chatStudioFilesRef,
    chatStudioProjectIdRef,
    chats,
    clonePickedRepo,
    codeOverlayOpen,
    codeTypingDemo,
    codeDemoFiles,
    startCodeTypingPreview,
    closeCodeOverlay,
    codePillSticky,
    planOverlayOpen,
    planPillSticky,
    planLiveDrafting,
    composerMode,
    copiedMsgId,
    createJobLive,
    creations,
    deleteFileBusy,
    deleteFilePrompt,
    deleteFolderClarifyPrompt,
    deleteProjectBusy,
    deleteProjectPrompt,
    dictating,
    dictationHint,
    dragOverChat,
    dropHint,
    editingQueueId,
    editingQueueIdRef,
    editingQueueText,
    engineInstallingModels,
    engineLocalModels,
    engineReadyIds,
    failoverNote,
    flushQueuedSend,
    generating,
    generatingRef,
    githubOfferId,
    githubPickerOpen,
    greeting,
    handleDeleteFileCancel,
    handleDeleteFileConfirm,
    handleDeleteProjectCancel,
    handleDeleteProjectConfirm,
    handleFolderClarifyCancel,
    handleFolderClarifyConfirm,
    handlePlusAction,
    handleSend,
    handleStop,
    handleVoiceActivate,
    ignoreEnterUntilRef,
    imageInputRef,
    input,
    ipcFallbackDev,
    jumpToBottom,
    liveTurnMs,
    loading,
    menuPos,
    messages,
    messagesEndRef,
    messagesScrollRef,
    mode,
    modelButtonRef,
    modelMenuOpen,
    modelMenuRef,
    modelRatio,
    navigate,
    ollamaModels,
    onComposerPaste,
    onInput,
    onMessagesScroll,
    onMessagesWheel,
    onPickCodeFiles,
    openCodeWorkspace,
    openPlanWorkspace,
    setPlanOverlayOpen,
    openProjectFolder,
    openProjectPreview,
    pathBindDraft,
    pathBindInputRef,
    pathBindOpen,
    pendingAttaches,
    pendingImages,
    pendingQueueRef,
    persistChatIdRef,
    persistStudioSnapshot,
    pickPhotosIntoChat,
    placeholder,
    previewUrl,
    queueLen,
    queueTick,
    removePendingAttach,
    route,
    routeChatIdRef,
    sendMessage,
    setActiveModel,
    setCapacity,
    setChatStudioFiles,
    setChatStudioProjectId,
    setCodeOverlayOpen,
    setComposerMode,
    setCopiedMsgId,
    setDropHint,
    setEditingQueueId,
    setEditingQueueText,
    setFailoverNote,
    setGithubPickerOpen,
    setInput,
    setModelMenuOpen,
    setPathBindDraft,
    setPathBindOpen,
    setPendingAttaches,
    setPendingImages,
    setQueueLen,
    setQueueTick,
    setSetupNote,
    setVideoDurationSec,
    setupNote,
    showJumpToBottom,
    showStudioPills,
    textareaRef,
    threadBrain,
    threadKind,
    threadSwitching,
    toggleComposerDictation,
    tokenRatio,
    tryStartTurn,
    regenerateReply,
    unpickAutoSticky,
    user,
    videoDurationSec,
    voicePhase,
    workspaceBadgeLabel,
  };
}
