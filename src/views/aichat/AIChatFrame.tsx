/**
 * AIChat presentational shell — composer, message list, dialogs.
 */
import { useEffect, useState } from 'react';
import type { useAIChatController } from '@/views/aichat/useAIChatController';
import type { ChatAttachMeta } from '@/lib/chatAttach';
import type { LiveCapacity } from '@/lib/novaCapacity';
import type { RecentCreation } from '@/lib/recentStore';
import type { ArkEngineModel } from '@/lib/novaEngine';
import type { ChatMessage } from '@/types';
import { createPortal } from 'react-dom';
import { ParkedNotice } from '@/components/ParkedNotice';
import { AttachCard } from '@/components/AttachCard';
import { GitHubRepoPicker } from '@/components/GitHubRepoPicker';
import { VoiceModeLayout } from '@/components/VoiceModeLayout';
import { DeleteProjectFolderModal } from '@/components/DeleteProjectFolderModal';
import { DeleteFileModal } from '@/components/DeleteFileModal';
import { DeleteFolderClarifyModal } from '@/components/DeleteFolderClarifyModal';
import { ComposerPlusMenu } from '@/components/ComposerPlusMenu';
import { TokenUsageRing } from '@/components/TokenUsageRing';
import { NovaErrorInline } from '@/components/NovaErrorInline';
import { NovaMark } from '@/components/NovaMark';
import { MessageContent, GeneratingPlaceholder } from '@/components/MediaMessage';
import { ChatCodeOverlay } from '@/components/ChatCodeOverlay';
import { StudioControlsOverlay } from '@/components/StudioControlsOverlay';
import { ChatPlanOverlay } from '@/components/ChatPlanOverlay';
import { useChatTurnStatus } from '@/hooks/useChatTurnStatus';
import { FIRST_RUN_KIND_CHIPS } from '@/lib/chatTurnHandlers';
import { classifyErrorMessage, isLikelyErrorMessage } from '@/lib/errors';
import { isVoiceTabEnabled } from '@/lib/featurePark';
import { formatReplyElapsed, shortReplyModelLabel } from '@/lib/speedTest';
import { attachKey } from '@/lib/chatAttach';
import { stripComposerPrefix } from '@/lib/chatAgentTurn';
import { stripAgentTrace } from '@/lib/agentTrace';
import { loadChatStudio, studioPathBasename } from '@/lib/chatStudioStore';
import { getApplySnapshot, clearApplySnapshot, snapshotToRevertBlocks } from '@/lib/chatApplySnapshotStore';
import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { setLocalPrefs, hasProviderApiKey } from '@/lib/localPrefs';
import { isCloudProviderEnabled } from '@/lib/cloudSources';
import { syncWorkspaceGrantsFromPrefs } from '@/lib/workspaceGrants';
import { autoEquippedCaption, autoRingDetail } from '@/lib/threadBrain';
import { setEngineModel } from '@/lib/novaEngine';
import { githubToken } from '@/lib/codeGitHubWorkflow';
import {
  Loader2, ImageIcon, Video, Code2, Map,
  Upload, Laptop, Cloud, ChevronDown, Check,
  Folder, Square, X, ImagePlus, Download,
  Github, Globe, Copy, Plus, Mic, MicOff, RotateCcw, RefreshCw, Share2,
} from 'lucide-react';
import { resolveMediaRef } from '@/lib/recentStore';
import { boundFolderLiveReady, canUnlockCreateLive } from '@/lib/createReady';
import { pushDownloadCompleteToast } from '@/lib/sidebarToast';
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
  focusComposerIfSafe,
  type ChatModelOption,
} from './aiChatHelpers';

export type AIChatFrameProps = Pick<ReturnType<typeof useAIChatController>,
  'activeModel' |
  'addPendingImages' |
  'attachBusy' |
  'attachInputRef' |
  'attachUploading' |
  'autoModelLabel' |
  'browseBindFolder' |
  'capacity' |
  'chatPlugins' |
  'chatStudioDiskRoot' |
  'chatStudioDiskRootRef' |
  'chatStudioFiles' |
  'chatStudioFilesRef' |
  'chatStudioProjectIdRef' |
  'chats' |
  'clonePickedRepo' |
  'codeOverlayOpen' |
  'codePillSticky' |
  'planOverlayOpen' |
  'planPillSticky' |
  'planLiveDrafting' |
  'composerMode' |
  'copiedMsgId' |
  'createJobLive' |
  'creations' |
  'deleteFileBusy' |
  'deleteFilePrompt' |
  'deleteFolderClarifyPrompt' |
  'deleteProjectBusy' |
  'deleteProjectPrompt' |
  'dictating' |
  'dictationHint' |
  'dragOverChat' |
  'dropHint' |
  'editingQueueId' |
  'editingQueueIdRef' |
  'editingQueueText' |
  'engineInstallingModels' |
  'engineLocalModels' |
  'engineReadyIds' |
  'failoverNote' |
  'flushQueuedSend' |
  'generating' |
  'generatingRef' |
  'githubOfferId' |
  'githubPickerOpen' |
  'greeting' |
  'handleDeleteFileCancel' |
  'handleDeleteFileConfirm' |
  'handleDeleteProjectCancel' |
  'handleDeleteProjectConfirm' |
  'handleFolderClarifyCancel' |
  'handleFolderClarifyConfirm' |
  'handlePlusAction' |
  'handleSend' |
  'handleStop' |
  'handleVoiceActivate' |
  'ignoreEnterUntilRef' |
  'imageInputRef' |
  'input' |
  'ipcFallbackDev' |
  'jumpToBottom' |
  'liveTurnMs' |
  'loading' |
  'menuPos' |
  'messages' |
  'messagesEndRef' |
  'messagesScrollRef' |
  'mode' |
  'modelButtonRef' |
  'modelMenuOpen' |
  'modelMenuRef' |
  'modelRatio' |
  'navigate' |
  'ollamaModels' |
  'onComposerPaste' |
  'onInput' |
  'onMessagesScroll' |
  'onMessagesWheel' |
  'onPickCodeFiles' |
  'openCodeWorkspace' |
  'closeCodeOverlay' |
  'openPlanWorkspace' |
  'setPlanOverlayOpen' |
  'openProjectFolder' |
  'openProjectPreview' |
  'pendingAttaches' |
  'pendingImages' |
  'pendingQueueRef' |
  'persistChatIdRef' |
  'persistStudioSnapshot' |
  'pickPhotosIntoChat' |
  'placeholder' |
  'previewUrl' |
  'queueLen' |
  'queueTick' |
  'removePendingAttach' |
  'route' |
  'routeChatIdRef' |
  'sendMessage' |
  'setActiveModel' |
  'setCapacity' |
  'setChatStudioFiles' |
  'setChatStudioProjectId' |
  'setCodeOverlayOpen' |
  'setComposerMode' |
  'setCopiedMsgId' |
  'setDropHint' |
  'setEditingQueueId' |
  'setEditingQueueText' |
  'setFailoverNote' |
  'setGithubPickerOpen' |
  'setInput' |
  'setModelMenuOpen' |
  'setPendingAttaches' |
  'setPendingImages' |
  'setQueueLen' |
  'setQueueTick' |
  'setSetupNote' |
  'setVideoDurationSec' |
  'setupNote' |
  'showJumpToBottom' |
  'showStudioPills' |
  'textareaRef' |
  'threadBrain' |
  'threadKind' |
  'threadSwitching' |
  'toggleComposerDictation' |
  'tokenRatio' |
  'tryStartTurn' |
  'regenerateReply' |
  'unpickAutoSticky' |
  'user' |
  'videoDurationSec' |
  'voicePhase' |
  'workspaceBadgeLabel'
>;

type QueueItem = { id: string; text: string };
type PendingImage = { id: string; name: string; dataUrl: string };

export function AIChatFrame(props: AIChatFrameProps) {
  const activeModel = props.activeModel;
  const addPendingImages = props.addPendingImages;
  const attachBusy = props.attachBusy;
  const attachInputRef = props.attachInputRef;
  const attachUploading = props.attachUploading;
  const autoModelLabel = props.autoModelLabel;
  const browseBindFolder = props.browseBindFolder;
  const capacity = props.capacity as LiveCapacity;
  
  const chatStudioDiskRoot = props.chatStudioDiskRoot;
  const chatStudioDiskRootRef = props.chatStudioDiskRootRef;
  const chatStudioFiles = props.chatStudioFiles;
  const chatStudioFilesRef = props.chatStudioFilesRef;
  const chatStudioProjectIdRef = props.chatStudioProjectIdRef;
  
  const clonePickedRepo = props.clonePickedRepo;
  const codeOverlayOpen = props.codeOverlayOpen;
  const planOverlayOpen = props.planOverlayOpen;
  const planPillSticky = props.planPillSticky;
  const planLiveDrafting = props.planLiveDrafting;
  const openPlanWorkspace = props.openPlanWorkspace;
  const setPlanOverlayOpen = props.setPlanOverlayOpen;
  const liveTurnStatus = useChatTurnStatus();
  const liveWritingPath = liveTurnStatus?.writingPath || null;
  const codePillSticky = props.codePillSticky;
  const composerMode = props.composerMode as keyof typeof COMPOSER_MODE_PILL | null;
  const copiedMsgId = props.copiedMsgId;
  const createJobLive = props.createJobLive;
  const createLiveUnlock = createJobLive
    ? canUnlockCreateLive(
      createJobLive,
      createJobLive.files || {},
      String(createJobLive.originalBrief || createJobLive.generationBrief || ''),
    )
    : { ok: true, reasons: [] };
  const creations = props.creations as RecentCreation[];
  const deleteFileBusy = props.deleteFileBusy;
  const deleteFilePrompt = props.deleteFilePrompt;
  const deleteFolderClarifyPrompt = props.deleteFolderClarifyPrompt;
  const deleteProjectBusy = props.deleteProjectBusy;
  const deleteProjectPrompt = props.deleteProjectPrompt;
  const dictating = props.dictating;
  const dictationHint = props.dictationHint;
  const dragOverChat = props.dragOverChat;
  const dropHint = props.dropHint;
  const editingQueueId = props.editingQueueId;
  const editingQueueIdRef = props.editingQueueIdRef;
  
  const engineInstallingModels = props.engineInstallingModels as Pick<ArkEngineModel, 'id' | 'name' | 'detail'>[];
  const engineLocalModels = props.engineLocalModels;
  const engineReadyIds = props.engineReadyIds;
  const failoverNote = props.failoverNote;
  const flushQueuedSend = props.flushQueuedSend;
  const generating = props.generating;
  const generatingRef = props.generatingRef;
  const githubOfferId = props.githubOfferId;
  const githubPickerOpen = props.githubPickerOpen;
  const [githubConnected, setGithubConnected] = useState(() => Boolean(githubToken()));
  useEffect(() => {
    const sync = () => setGithubConnected(Boolean(githubToken()));
    sync();
    window.addEventListener('focus', sync);
    window.addEventListener('NOVA:plugins-changed', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('NOVA:plugins-changed', sync);
    };
  }, [githubPickerOpen]);
  const greeting = props.greeting;
  const handleDeleteFileCancel = props.handleDeleteFileCancel;
  const handleDeleteFileConfirm = props.handleDeleteFileConfirm;
  const handleDeleteProjectCancel = props.handleDeleteProjectCancel;
  const handleDeleteProjectConfirm = props.handleDeleteProjectConfirm;
  const handleFolderClarifyCancel = props.handleFolderClarifyCancel;
  const handleFolderClarifyConfirm = props.handleFolderClarifyConfirm;
  const handlePlusAction = props.handlePlusAction;
  const handleSend = props.handleSend;
  const handleStop = props.handleStop;
  const handleVoiceActivate = props.handleVoiceActivate;
  const regenerateReply = props.regenerateReply;
  const ignoreEnterUntilRef = props.ignoreEnterUntilRef;
  const imageInputRef = props.imageInputRef;
  const input = props.input;
  const ipcFallbackDev = props.ipcFallbackDev;
  const jumpToBottom = props.jumpToBottom;
  const liveTurnMs = props.liveTurnMs;
  const loading = props.loading;
  const menuPos = props.menuPos;
  const messages = props.messages as ChatMessage[];
  const messagesEndRef = props.messagesEndRef;
  const messagesScrollRef = props.messagesScrollRef;
  const mode = props.mode;
  const modelButtonRef = props.modelButtonRef;
  const modelMenuOpen = props.modelMenuOpen;
  const modelMenuRef = props.modelMenuRef;
  const modelRatio = props.modelRatio;
  const navigate = props.navigate;
  const ollamaModels = props.ollamaModels;
  const onComposerPaste = props.onComposerPaste;
  const onInput = props.onInput;
  const onMessagesScroll = props.onMessagesScroll;
  const onMessagesWheel = props.onMessagesWheel;
  const onPickCodeFiles = props.onPickCodeFiles;
  const openCodeWorkspace = props.openCodeWorkspace;
  const closeCodeOverlay = props.closeCodeOverlay;
  const openProjectFolder = props.openProjectFolder;
  const openProjectPreview = props.openProjectPreview;
  const pendingAttaches = props.pendingAttaches as ChatAttachMeta[];
  const pendingImages = props.pendingImages as PendingImage[];
  const pendingQueueRef = props.pendingQueueRef as { current: QueueItem[] };
  const persistChatIdRef = props.persistChatIdRef;
  const persistStudioSnapshot = props.persistStudioSnapshot;
  const pickPhotosIntoChat = props.pickPhotosIntoChat;
  const placeholder = props.placeholder;
  const previewUrl = props.previewUrl;
  // Bound folder / new chat: show Live when the tree can paint — even if verify failed
  // ("Click Live to try once more"). Compositional App shells are short; boundFolderLiveReady
  // counts sections. Never hide Live solely because the create job status is failed.
  const filesLiveReady = boundFolderLiveReady(chatStudioFiles);
  const showBoundLive = Boolean(
    chatStudioDiskRoot
    && (
      filesLiveReady
      || (createLiveUnlock.ok && !createJobLive?.craftBlocked)
      || (Boolean(previewUrl) && filesLiveReady)
    ),
  );
  const queueLen = props.queueLen;
  const queueTick = props.queueTick;
  const removePendingAttach = props.removePendingAttach;
  const route = props.route;
  const routeChatIdRef = props.routeChatIdRef;
  const sendMessage = props.sendMessage;
  const setActiveModel = props.setActiveModel;
  
  const setChatStudioFiles = props.setChatStudioFiles;
  const setChatStudioProjectId = props.setChatStudioProjectId;
  const setCodeOverlayOpen = props.setCodeOverlayOpen;
  const setComposerMode = props.setComposerMode;
  const setCopiedMsgId = props.setCopiedMsgId as (value: string | null | ((previous: string | null) => string | null)) => void;
  const setDropHint = props.setDropHint;
  // Undo toast: gray (via text-content-tertiary) and auto-dismiss once.
  useEffect(() => {
    if (dropHint !== 'Undid the last file apply.') return;
    const id = window.setTimeout(() => setDropHint(null), 2200);
    return () => window.clearTimeout(id);
  }, [dropHint, setDropHint]);
  // Which queued layer is selected for Edit / Delete (defaults to newest).
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  useEffect(() => {
    const all = pendingQueueRef.current || [];
    if (!all.length) {
      setSelectedQueueId(null);
      return;
    }
    if (!selectedQueueId || !all.some(q => q.id === selectedQueueId)) {
      setSelectedQueueId(all[all.length - 1]?.id || null);
    }
  }, [queueLen, queueTick, selectedQueueId, pendingQueueRef]);
  // Keep ambient orbs moving while a reply generates (do not freeze the shell animation).
  const setEditingQueueId = props.setEditingQueueId;
  const setEditingQueueText = props.setEditingQueueText;
  const setFailoverNote = props.setFailoverNote;
  const setGithubPickerOpen = props.setGithubPickerOpen;
  const setInput = props.setInput;
  const setModelMenuOpen = props.setModelMenuOpen as (value: boolean | ((previous: boolean) => boolean)) => void;
  const setPendingAttaches = props.setPendingAttaches;
  const setPendingImages = props.setPendingImages as (updater: PendingImage[] | ((previous: PendingImage[]) => PendingImage[])) => void;
  const setQueueLen = props.setQueueLen;
  const setQueueTick = props.setQueueTick as (updater: (previous: number) => number) => void;
  const setSetupNote = props.setSetupNote;
  const setVideoDurationSec = props.setVideoDurationSec;
  const setupNote = props.setupNote;
  const showJumpToBottom = props.showJumpToBottom;
  const showStudioPills = props.showStudioPills;
  const textareaRef = props.textareaRef;
  const threadBrain = props.threadBrain;
  const threadKind = props.threadKind;
  const threadSwitching = props.threadSwitching;
  const toggleComposerDictation = props.toggleComposerDictation;
  const tokenRatio = props.tokenRatio;
  const tryStartTurn = props.tryStartTurn;
  const unpickAutoSticky = props.unpickAutoSticky;
  
  const videoDurationSec = props.videoDurationSec;
  const voicePhase = props.voicePhase;
  const workspaceBadgeLabel = props.workspaceBadgeLabel;

  // Code overlay opens only via the Code pill (manual). Create never auto-dispatches open-code-overlay.

  const applyIdea = (label: string) => {
    setInput(label);
    focusComposerIfSafe(textareaRef.current);
  };

  const viewingChatId = route.name === 'chat' ? route.chatId : undefined;
  /** Tick while status-store is live but React generating is false — keeps rail timer moving. */
  const [statusRailNow, setStatusRailNow] = useState(() => Date.now());
  useEffect(() => {
    const busy = Boolean(
      liveTurnStatus
      && viewingChatId
      && liveTurnStatus.chatId === viewingChatId
      && !/^done$/i.test(String(liveTurnStatus.label || '')),
    );
    if (!busy || generating) return;
    const id = window.setInterval(() => setStatusRailNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [liveTurnStatus, viewingChatId, generating]);
  // Explore / idea grid only for brand-new chats. never when a Recent thread is open.
  const showEmpty = !loading && messages.length === 0 && !viewingChatId;

  const voiceBusy = generating
    || voicePhase === 'listening'
    || voicePhase === 'thinking'
    || voicePhase === 'speaking';
  const showOpenThread = !loading && Boolean(viewingChatId);
  
  const kind = kindForMode(mode);
  const keyedCloud = CLOUD_CHAT_WHEN_KEYED.filter(
    m => hasProviderApiKey(m.keyId) && isCloudProviderEnabled(m.keyId),
  );
  const modelsForTab: ChatModelOption[] = kind === 'chat'
    ? [
        ...CHAT_MODELS.filter(m => m.kind === 'chat'),
        ...engineLocalModels,
        ...keyedCloud,
        ...ollamaModels,
      ]
    : kind === 'image'
      ? CHAT_MODELS.filter(m => {
          if (m.kind !== 'image') return false;
          if (m.id === 'dall-e-3') return hasProviderApiKey('openai');
          return true;
        })
      : CHAT_MODELS.filter(m => m.kind === 'video');
  const autoModels = modelsForTab.filter(m => m.source === 'auto');
  const localModels = modelsForTab.filter(m => m.source === 'local' && !engineInstallingModels.some(i => i.id === m.id));
  const installingModels = kind === 'chat' ? engineInstallingModels : [];
  const cloudModels = modelsForTab.filter(m => m.source === 'cloud');

  const modelMenu = modelMenuOpen && menuPos
    ? createPortal(
      <div
        ref={modelMenuRef}
        className="w-72 max-h-[min(22rem,calc(100vh-6rem))] overflow-y-auto rounded-xl border border-surface-border bg-nova-navy-900 shadow-2xl shadow-black/50 py-1.5"
        style={{
          position: 'fixed',
          left: menuPos.left,
          ...(menuPos.top != null ? { top: menuPos.top } : { bottom: menuPos.bottom }),
          zIndex: 99999,
        }}
      >
        {autoModels.length > 0 && (
          <>
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">
              Recommended
            </p>
            {autoModels.map(model => (
              <button
                key={model.id}
                type="button"
                onClick={() => {
                  setActiveModel(model);
                  if (model.kind === 'chat') {
                    setLocalPrefs({
                      defaultModelId: 'NOVA-auto',
                      lastChatModelId: undefined,
                      aiMode: 'automatic',
                      autoFailover: true,
                    });
                  }
                  setModelMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover"
              >
                <span className="w-7 h-7 flex items-center justify-center shrink-0 text-content-primary">
                  <NovaMark className="w-6 h-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content-primary truncate">
                    {autoEquippedCaption(threadBrain) || 'Best available'}
                  </span>
                  <span className="block text-[11px] text-content-tertiary truncate">
                    One model for this chat — no hopping
                  </span>
                </span>
                {activeModel.id === model.id && <Check className="w-4 h-4 text-nova-accent-green shrink-0" />}
              </button>
            ))}
            <div className="my-1.5 border-t border-surface-border" />
          </>
        )}
        {localModels.length > 0 && (
          <>
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">
              {mode === 'image' ? 'Image models' : mode === 'video' ? 'Video models' : 'Ready'}
            </p>
            {localModels.map(model => (
              <button
                key={model.id}
                type="button"
                onClick={() => {
                  setActiveModel(model);
                  if (model.kind === 'chat') {
                    unpickAutoSticky();
                    if (!model.id.startsWith('ollama:')) {
                      void setEngineModel(model.id).catch(() => undefined);
                    }
                    setLocalPrefs({ lastChatModelId: model.id, defaultModelId: model.id });
                  } else if (model.source !== 'auto') {
                    unpickAutoSticky();
                  }
                  setModelMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content-primary truncate">{model.name}</span>
                  {model.detail ? <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span> : null}
                </span>
                {activeModel.id === model.id && <Check className="w-4 h-4 text-nova-accent-green shrink-0" />}
                <Laptop className="w-3.5 h-3.5 text-content-tertiary shrink-0" aria-hidden />
              </button>
            ))}
          </>
        )}
        {installingModels.length > 0 && (
          <>
            <div className="my-1.5 border-t border-surface-border" />
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">
              Installing
            </p>
            {installingModels.map(model => (
              <div
                key={model.id}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left opacity-80"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content-primary truncate">{model.name}</span>
                  {model.detail ? <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span> : null}
                </span>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" aria-hidden />
                <Laptop className="w-3.5 h-3.5 text-content-tertiary shrink-0" aria-hidden />
              </div>
            ))}
          </>
        )}
        {(() => {
          const notReadyLocal = modelsForTab.filter(m =>
            m.source === 'local'
            && m.id !== 'NOVA-auto'
            && !engineReadyIds.has(m.id)
            && !installingModels.some(i => i.id === m.id)
            && !localModels.some(l => l.id === m.id),
          );
          if (!notReadyLocal.length) return null;
          return (
            <>
              <div className="my-1.5 border-t border-surface-border" />
              <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">
                Not installed
              </p>
              {notReadyLocal.map(model => (
                <div
                  key={model.id}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left opacity-90"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-content-primary truncate">{model.name}</span>
                    {model.detail ? <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setModelMenuOpen(false);
                      navigate({ name: 'local-ai' });
                    }}
                    className="text-[10px] text-sky-400 hover:text-sky-300 shrink-0"
                  >
                    Install
                  </button>
                  <Laptop className="w-3.5 h-3.5 text-content-tertiary shrink-0" aria-hidden />
                </div>
              ))}
            </>
          );
        })()}
        {cloudModels.length > 0 && (
          <>
            {(autoModels.length > 0 || localModels.length > 0 || installingModels.length > 0) && (
              <div className="my-1.5 border-t border-surface-border" />
            )}
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">Cloud</p>
            {cloudModels.map(model => (
              <button
                key={model.id}
                type="button"
                onClick={() => {
                  setActiveModel(model);
                  if (model.kind === 'chat') {
                    unpickAutoSticky();
                    setLocalPrefs({
                      lastChatModelId: model.id,
                      // Keep the menu on this cloud pick across remounts / new chats.
                      defaultModelId: model.id,
                    });
                  } else if (model.source !== 'auto') {
                    unpickAutoSticky();
                  }
                  setModelMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content-primary truncate">{model.name}</span>
                  {model.detail ? <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span> : null}
                </span>
                {activeModel.id === model.id && <Check className="w-4 h-4 text-nova-accent-green shrink-0" />}
                <Cloud className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden />
              </button>
            ))}
          </>
        )}
        {kind === 'chat' && keyedCloud.length === 0 && (
          <p className="px-3 py-2 text-[11px] text-content-tertiary leading-snug">
            Keys unlock Cloud rows here. Add them in Settings → Providers, then pick Hugging Face, OpenRouter, Google, and more.
          </p>
        )}
        {activeModel.source !== 'auto' && activeModel.kind === 'chat' && (
          <div className="border-t border-surface-border mt-1 pt-1 px-2 pb-1">
            <button
              type="button"
              className="w-full rounded-lg px-2 py-1.5 text-[11px] text-sky-300 hover:bg-sky-500/10 text-left"
              onClick={() => {
                setLocalPrefs({ defaultModelId: activeModel.id, lastChatModelId: activeModel.id });
                setModelMenuOpen(false);
              }}
            >
              Always use {activeModel.name} for new chats
            </button>
          </div>
        )}
        {kind === 'chat' && (
          <div className="border-t border-surface-border mt-1 pt-1 px-2 pb-1">
            <button
              type="button"
              className="w-full inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-content-secondary hover:bg-surface-hover hover:text-content-primary text-left"
              onClick={() => {
                setModelMenuOpen(false);
                navigate({ name: 'models', tab: 'cloud' });
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add or manage connected models
            </button>
          </div>
        )}
      </div>,
      document.body,
    )
    : null;

  const failoverChip = failoverNote ? (
    <div className="mb-2 flex justify-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 px-0.5 py-0.5 text-[11px] text-sky-300/95">
        {failoverNote}
        <button
          type="button"
          onClick={() => setFailoverNote(null)}
          className="w-5 h-5 flex items-center justify-center text-sky-400/80 hover:text-sky-200 transition-colors"
          aria-label="Dismiss"
          title="Dismiss"
        >
          <X className="w-3 h-3" />
        </button>
      </span>
      {import.meta.env.DEV && ipcFallbackDev && (
        <span className="inline-flex items-center px-0.5 py-0.5 text-[11px] text-amber-300/95">
          IPC fallback · brain HTTP
        </span>
      )}
    </div>
  ) : import.meta.env.DEV && ipcFallbackDev ? (
    <div className="mb-2 flex justify-center">
      <span className="inline-flex items-center px-0.5 py-0.5 text-[11px] text-amber-300/95">
        IPC fallback · brain HTTP
      </span>
    </div>
  ) : null;

  const [studioControlsOpen, setStudioControlsOpen] = useState(false);

  const composer = (
    <div className="w-full mx-auto min-w-0 nova-composer-column">
      {failoverChip}
      <div className="flex flex-col min-w-0 w-full">
        <div className="min-w-0 flex flex-col w-full">
          <div className="flex gap-2 min-w-0 items-end">
          <div className="flex flex-col items-center justify-end shrink-0 self-end w-[1.25rem] select-none pb-1.5">
            {threadSwitching ? (
              <span title="Loading chat" className="inline-flex">
                <Loader2
                  className="w-3.5 h-3.5 text-content-tertiary animate-spin"
                  aria-label="Loading chat"
                />
              </span>
            ) : null}
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
          {/* Status / chips above the box — same column as the composer so left edges match. */}
          {attachUploading && (
            <p className="mb-2 w-full min-w-0 text-left text-[11px] text-sky-300/90 animate-pulse truncate">{attachUploading}</p>
          )}
          {pendingAttaches.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 w-full max-w-full overflow-hidden">
              {pendingAttaches.map(meta => (
                <span key={attachKey(meta)} className="inline-flex items-center gap-1">
                  <AttachCard meta={meta} />
                  <button
                    type="button"
                    className="text-[10px] text-content-tertiary hover:text-content-secondary"
                    onClick={() => removePendingAttach(meta)}
                    aria-label={`Remove ${meta.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {pendingAttaches.length > 1 && (
                <button
                  type="button"
                  className="text-[10px] text-content-tertiary hover:text-content-secondary"
                  onClick={() => {
                    setPendingAttaches([]);
                    setChatStudioFiles({});
                    setChatStudioProjectId(null);
                    setPendingImages([]);
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
          )}
          {pendingImages.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 w-full">
              {pendingImages.map(img => (
                <span
                  key={img.id}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-surface-border bg-nova-navy-900/80 pl-1 pr-1.5 py-1 text-[10px] text-content-secondary"
                >
                  <img src={img.dataUrl} alt="" className="w-8 h-8 rounded-md object-cover" />
                  <span className="max-w-[7rem] truncate">{img.name}</span>
                  <button
                    type="button"
                    className="text-content-tertiary hover:text-content-primary"
                    aria-label={`Remove ${img.name}`}
                    onClick={() => setPendingImages(prev => prev.filter(p => p.id !== img.id))}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {mode === 'video' && (
            <div className="mb-2 flex flex-wrap items-center gap-2 w-full">
              <span className="text-[11px] text-content-tertiary">Clip length</span>
              {([10, 20, 30] as const).map(sec => (
                <button
                  key={sec}
                  type="button"
                  disabled={generating}
                  onClick={() => setVideoDurationSec(sec)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] border transition-colors ${
                    videoDurationSec === sec
                      ? 'border-sky-500/50 bg-sky-500/15 text-sky-100'
                      : 'border-surface-border bg-surface-hover/40 text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          )}
          {dictating ? (
            <p className="mb-2 w-full min-w-0 text-left text-[11px] text-rose-300/90 animate-pulse">
              Listening… speak now. Tap the mic again when you’re done, then press Enter.
            </p>
          ) : dictationHint ? (
            <p className="mb-2 w-full min-w-0 text-left text-[11px] text-amber-300/90 break-words [overflow-wrap:anywhere] line-clamp-2">
              {dictationHint}
            </p>
          ) : null}
          {dropHint && !attachUploading && (
            <p
              className="mb-2 w-full min-w-0 overflow-hidden text-left text-[11px] text-content-tertiary break-words [overflow-wrap:anywhere] line-clamp-2"
              title={dropHint}
            >
              {dropHint}
            </p>
          )}
          {queueLen > 0 && pendingQueueRef.current.length > 0 && (() => {
            // Small numbered cues above the chat box (not inside it). Max 3.
            // Cue 1 = next to send (oldest). Click → edit in composer; Enter saves back.
            const items = pendingQueueRef.current.slice(0, 3);
            const activeId = editingQueueId
              || (selectedQueueId && items.some(q => q.id === selectedQueueId) ? selectedQueueId : null);
            const beginEditCue = (q: { id: string; text: string }) => {
              // If already editing another cue, stash that draft back first.
              const prevId = editingQueueIdRef.current;
              if (prevId && prevId !== q.id) {
                const draft = String(input || '').trim();
                if (draft) {
                  pendingQueueRef.current = pendingQueueRef.current.map(item => (
                    item.id === prevId ? { ...item, text: draft } : item
                  ));
                  setQueueTick(t => t + 1);
                }
              }
              editingQueueIdRef.current = q.id;
              setEditingQueueId(q.id);
              setEditingQueueText(q.text);
              setSelectedQueueId(q.id);
              setInput(q.text);
              requestAnimationFrame(() => {
                const ta = textareaRef.current;
                if (!ta) return;
                ta.focus();
                ta.style.height = 'auto';
                ta.style.height = `${Math.min(ta.scrollHeight, Math.round(6.2 * 16))}px`;
                ta.style.overflowY = 'auto';
              });
            };
            const deleteCue = (id: string) => {
              pendingQueueRef.current = pendingQueueRef.current.filter(item => item.id !== id);
              const next = pendingQueueRef.current;
              setQueueLen(next.length);
              setQueueTick(t => t + 1);
              if (editingQueueIdRef.current === id) {
                editingQueueIdRef.current = null;
                setEditingQueueId(null);
                setEditingQueueText('');
                setInput('');
                if (textareaRef.current) textareaRef.current.style.height = 'auto';
              }
              if (selectedQueueId === id) setSelectedQueueId(null);
              if (!generatingRef.current) flushQueuedSend();
            };
            return (
              <div className="nova-queue-cues" key={queueTick} aria-label={`${items.length} queued`}>
                <div className="nova-queue-cues-row">
                  {items.map((q, idx) => {
                    const n = idx + 1;
                    const isActive = q.id === activeId;
                    return (
                      <div key={q.id} className={`nova-queue-cue ${isActive ? 'nova-queue-cue--active' : ''}`}>
                        <button
                          type="button"
                          className="nova-queue-cue-btn"
                          title={`Cue ${n}: click to edit in the chat box`}
                          aria-label={`Queued message ${n}`}
                          aria-pressed={isActive}
                          onClick={() => beginEditCue(q)}
                        >
                          {n}
                        </button>
                        {isActive ? (
                          <button
                            type="button"
                            className="nova-queue-cue-x"
                            aria-label={`Delete cue ${n}`}
                            title="Delete this cue"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteCue(q.id);
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="nova-queue-cues-clear"
                    aria-label="Clear all queued messages"
                    onClick={() => {
                      pendingQueueRef.current = [];
                      setQueueLen(0);
                      setQueueTick(t => t + 1);
                      editingQueueIdRef.current = null;
                      setEditingQueueId(null);
                      setEditingQueueText('');
                      setSelectedQueueId(null);
                      setInput('');
                      if (textareaRef.current) textareaRef.current.style.height = 'auto';
                    }}
                  >
                    Clear
                  </button>
                </div>
                {editingQueueId ? (
                  <p className="nova-queue-cues-hint">
                    Editing cue — Enter to save · Esc to cancel · × to delete
                  </p>
                ) : null}
              </div>
            );
          })()}
          <div
            data-ark-composer="1"
            className={`relative z-10 w-full min-w-0 flex flex-col border border-surface-border nova-glass-composer overflow-visible ${
              mode === 'voice' ? 'rounded-2xl' : 'rounded-xl'
            }`}
            onMouseDown={(e) => {
              // Clicking the glass chrome (not a control) should land the caret in the box.
              const t = e.target as HTMLElement | null;
              if (!t) return;
              if (t.closest('button, a, input, select, textarea, [role="button"]')) return;
              const ta = textareaRef.current;
              if (!ta) return;
              e.preventDefault();
              ta.focus();
            }}
          >
          <input
            ref={attachInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.go,.rs,.java,.kt,.swift,.cs,.cpp,.c,.h,.hpp,.rb,.php,.vue,.svelte,.css,.scss,.html,.json,.toml,.yaml,.yml,.md,.txt,.csv,.pdf,.rtf,.sql,.sh,.ps1,.xml,.log,image/*,text/*,application/json,application/pdf"
            onChange={e => {
              void onPickCodeFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg"
            multiple
            className="hidden"
            onChange={e => {
              void addPendingImages([...(e.target.files || [])]);
              e.target.value = '';
            }}
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => onInput(e.target.value)}
            onPaste={onComposerPaste}
            spellCheck
            lang="en"
            autoCorrect="on"
            autoCapitalize="sentences"
            onKeyDown={e => {
              if (e.key === 'Escape' && editingQueueIdRef.current) {
                e.preventDefault();
                editingQueueIdRef.current = null;
                setEditingQueueId(null);
                setEditingQueueText('');
                setSelectedQueueId(null);
                setInput('');
                if (textareaRef.current) textareaRef.current.style.height = 'auto';
                if (!generatingRef.current) flushQueuedSend();
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                if (Date.now() < ignoreEnterUntilRef.current) {
                  // Dialog-close often fires a bare Enter on an empty box.
                  // If the user already typed a prompt and/or staged attaches, send anyway.
                  const hasPayload = Boolean(String(input || '').trim())
                    || pendingImages.length > 0
                    || pendingAttaches.some(a => a.kind === 'file' || a.kind === 'image' || a.kind === 'files');
                  if (!hasPayload) {
                    e.preventDefault();
                    return;
                  }
                }
                e.preventDefault();
                // Editing a cue: Enter saves back into the queue (does not send).
                if (editingQueueIdRef.current) {
                  const id = editingQueueIdRef.current;
                  const text = String(input || '').trim();
                  if (!text) {
                    pendingQueueRef.current = pendingQueueRef.current.filter(item => item.id !== id);
                  } else {
                    pendingQueueRef.current = pendingQueueRef.current.map(item => (
                      item.id === id ? { ...item, text } : item
                    ));
                  }
                  editingQueueIdRef.current = null;
                  setEditingQueueId(null);
                  setEditingQueueText('');
                  setSelectedQueueId(null);
                  setInput('');
                  if (textareaRef.current) textareaRef.current.style.height = 'auto';
                  setQueueLen(pendingQueueRef.current.length);
                  setQueueTick(t => t + 1);
                  if (!generatingRef.current) flushQueuedSend();
                  return;
                }
                handleSend();
              }
            }}
            placeholder={
              editingQueueId
                ? 'Edit this cue — Enter to save, Esc to cancel…'
                : pendingImages.length
                  ? 'Type an ask, then Enter — photo goes with the message…'
                  : pendingAttaches.length || Object.keys(chatStudioFiles).length
                    ? 'Press Enter to read this, or type an ask…'
                    : placeholder
            }
            rows={1}
            title={
              editingQueueId
                ? 'Enter saves this cue · Esc cancels · Shift+Enter for a new line'
                : 'Enter to send · Shift+Enter for a new line · Ctrl+V pastes screenshots · + → clip attaches files or a project'
            }
            aria-label={
              editingQueueId
                ? 'Edit queued message. Enter to save, Escape to cancel'
                : 'Message. Enter to send with any attached photos or files. Shift+Enter for a new line'
            }
            className="nova-composer-textarea w-full bg-transparent border-none resize-none text-[0.9375rem] text-content-primary placeholder:text-content-tertiary focus:outline-none leading-[1.55] min-h-[2.5rem] px-3 pt-2 pb-1"
          />

          <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5 shrink-0 border-t border-transparent min-w-0">
            {/* Left tools + status chips — may compress; never steal space from Stop/mic/model. */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
            {mode === 'image' && (
              <button
                type="button"
                onClick={() => void pickPhotosIntoChat()}
                className="w-8 h-8 rounded-full flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0"
                title="Upload a reference photo to recreate or improve"
                aria-label="Upload reference photo"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
            )}
            <ComposerPlusMenu
              scope={mode === 'image' ? 'image' : 'chat'}
              busy={attachBusy || Boolean(attachUploading)}
              onAction={(action) => {
                if (action === 'studio') {
                  setStudioControlsOpen(true);
                  return;
                }
                if (action === 'plan') {
                  setComposerMode('plan');
                  openPlanWorkspace?.();
                  return;
                }
                if (action === 'ask') {
                  setComposerMode('ask');
                  return;
                }
                if (action === 'agent') {
                  setComposerMode('agent');
                  try { setLocalPrefs({ composerMode: 'agent' } as never); } catch { /* */ }
                  return;
                }
                handlePlusAction(action);
              }}
              buttonClassName="w-8 h-8 rounded-full flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0"
            />
            {composerMode ? (
              <span
                className={`inline-flex items-center gap-1 px-0.5 py-1 text-xs font-semibold shrink-0 ${COMPOSER_MODE_PILL[composerMode]}`}
                title={
                  composerMode === 'debug'
                    ? 'Debug clinic — audit the bound folder'
                    : composerMode === 'plan'
                      ? 'Plan mode — deep outline, no files until you say build'
                      : composerMode === 'agent'
                        ? 'Agent — one task at a time on the bound project'
                        : composerMode === 'multitask'
                          ? 'Multi-agent — Scout → Builder → Critic on the bound project'
                          : undefined
                }
              >
                {COMPOSER_MODE_LABEL[composerMode]}
                <button
                  type="button"
                  onClick={() => {
                    if (
                      composerMode === 'plan'
                      || composerMode === 'debug'
                      || composerMode === 'agent'
                      || composerMode === 'multitask'
                    ) {
                      setDropHint(null);
                    }
                    setComposerMode(null);
                  }}
                  className="opacity-60 hover:opacity-100 -mr-0.5 p-0.5"
                  aria-label="Clear mode"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ) : null}
            {(mode === 'general' || mode === 'code') && chatStudioDiskRoot ? (
              <button
                type="button"
                onClick={() => void openProjectFolder()}
                className="inline-flex items-center justify-center w-7 h-7 px-0 py-0 text-amber-300 hover:text-amber-200 transition-colors shrink-0 rounded-full hover:bg-amber-300/10"
                title={`Bound project folder:\n${chatStudioDiskRoot}`}
                aria-label={`Bound folder ${workspaceBadgeLabel || chatStudioDiskRoot.split(/[/\\]/).pop()}`}
              >
                <Folder className="w-3.5 h-3.5 shrink-0 text-amber-300" />
              </button>
            ) : composerMode === 'debug' || composerMode === 'agent' || composerMode === 'multitask' ? (
              <button
                type="button"
                onClick={() => {
                  setDropHint(
                    composerMode === 'debug'
                      ? 'Grant access to the project folder you want audited.'
                      : composerMode === 'multitask'
                        ? 'Grant access to the project folder for Multi-agent.'
                        : 'Grant access to the project folder for Agent.',
                  );
                  void browseBindFolder();
                }}
                className="inline-flex items-center gap-1 max-w-[8.5rem] px-0.5 py-1 text-xs font-medium text-amber-300/90 hover:text-amber-200 transition-colors shrink-0"
                title={
                  composerMode === 'debug'
                    ? 'Bind a project folder to audit'
                    : 'Bind a project folder to work on'
                }
              >
                <Folder className="w-3.5 h-3.5 shrink-0 text-amber-300/80" />
                <span className="truncate">Bind folder…</span>
              </button>
            ) : null}
            {(mode === 'general' || mode === 'code') && (showStudioPills || codePillSticky || chatStudioDiskRoot) ? (
              <button
                type="button"
                onClick={() => openCodeWorkspace()}
                disabled={!chatStudioDiskRoot && Object.keys(chatStudioFiles).length === 0}
                className={`inline-flex items-center gap-1 px-0.5 py-1 text-xs font-medium transition-colors shrink-0 ${
                  !chatStudioDiskRoot && Object.keys(chatStudioFiles).length === 0
                    ? 'text-violet-300/40 cursor-not-allowed'
                    : 'text-violet-300 hover:text-violet-200'
                }`}
                title={
                  generating
                    ? 'Code — Nova is writing files. Click to watch live.'
                    : 'Open Code. files on the left, editor on the right'
                }
                aria-label={generating ? 'Code — writing in progress' : 'Open Code'}
              >
                <Code2 className={`w-3.5 h-3.5 text-violet-300 ${generating ? 'animate-pulse' : ''}`} />
                <span className={generating ? 'animate-pulse' : undefined}>Code</span>
              </button>
            ) : null}
            {(mode === 'general' || mode === 'code') && (planPillSticky || planOverlayOpen || planLiveDrafting) ? (
              <button
                type="button"
                onClick={() => openPlanWorkspace?.()}
                className={`inline-flex items-center gap-1 px-0.5 py-1 text-xs font-medium transition-colors shrink-0 ${
                  planLiveDrafting
                    ? 'text-sky-300'
                    : 'text-sky-300 hover:text-sky-200'
                }`}
                title={
                  planLiveDrafting
                    ? 'Plan — NOVA is drafting the map. Click to watch live.'
                    : 'Open Plan — synced outline for this chat'
                }
                aria-label={planLiveDrafting ? 'Plan — drafting in progress' : 'Open Plan'}
              >
                <Map className={`w-3.5 h-3.5 text-sky-300 ${planLiveDrafting ? 'animate-pulse' : ''}`} />
                <span className={planLiveDrafting ? 'animate-pulse' : undefined}>Plan</span>
              </button>
            ) : null}
            {(mode === 'general' || mode === 'code')
              && chatStudioDiskRoot
              && createJobLive?.status === 'npm'
              ? (
              <span
                className="inline-flex items-center gap-1.5 px-0.5 py-1 text-xs font-medium text-amber-300 shrink-0"
                title="Installing npm dependencies for this project"
              >
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inset-0 rounded-full bg-amber-300/50 animate-ping" />
                  <span className="relative h-2 w-2 rounded-full bg-amber-300" />
                </span>
                <span className="hidden sm:inline">Installing…</span>
                <span className="sm:hidden">npm…</span>
              </span>
            ) : null}
            {(mode === 'general' || mode === 'code')
              && chatStudioDiskRoot
              && createJobLive?.status === 'verifying'
              ? (
              <span
                className="inline-flex items-center gap-1.5 px-0.5 py-1 text-xs font-medium text-sky-300 shrink-0 max-w-[7.5rem]"
                title={createJobLive.lastObservation || createJobLive.stage || 'Verifying Live evidence'}
              >
                <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
                  <span className="absolute inset-0 rounded-full bg-sky-300/50 animate-ping" />
                  <span className="relative h-2 w-2 rounded-full bg-sky-300" />
                </span>
                <span className="truncate">
                  {createJobLive.stage === 'fix' ? 'Fixing…' : 'Verifying…'}
                </span>
              </span>
            ) : null}
            {(mode === 'general' || mode === 'code')
              && showBoundLive
              && createJobLive?.status !== 'npm'
              && createJobLive?.status !== 'verifying'
              ? (
              <button
                type="button"
                onClick={() => void openProjectPreview()}
                className="inline-flex items-center gap-1 px-0.5 py-1 text-xs font-medium text-sky-300 hover:text-sky-200 transition-colors shrink-0"
                title={
                  createJobLive?.previewUrl
                    ? `Open Live (${createJobLive.previewUrl})`
                    : previewUrl
                      ? `Open Live (${previewUrl})`
                      : 'Open Live window'
                }
                aria-label="Open Live"
              >
                <Globe className="w-3.5 h-3.5 text-sky-300" />
                Live
              </button>
            ) : null}
            </div>
            {/* Mic · model · Stop — Stop at the end (after local/cloud icon). Timer/% live outside the glass. */}
            <div className="flex items-center gap-1 shrink-0 pl-1" data-nova-composer-controls="1">
              {(() => {
                // Keep Stop + rail timer visible while status store is still live, even if
                // React `generating` briefly desyncs (glyph prep / chat switch races).
                const statusBusy = Boolean(
                  liveTurnStatus
                  && viewingChatId
                  && liveTurnStatus.chatId === viewingChatId
                  && !/^done$/i.test(String(liveTurnStatus.label || '')),
                );
                const turnBusy = generating || statusBusy;
                const seatCloud = activeModel.source === 'cloud'
                  || (activeModel.source === 'auto' && threadBrain?.pinnedSource === 'cloud');
                const modelTitle = /^(Craft|Style|Verify|Done|Building)\s·/i.test(String(autoModelLabel || ''))
                  ? String(autoModelLabel)
                  : activeModel.source === 'auto'
                    ? (threadBrain
                      ? `Using ${autoEquippedCaption(threadBrain) || autoModelLabel}`
                      : 'Picks one model and stays on it for this chat')
                    : `Active model · ${activeModel.name}`;
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleComposerDictation()}
                      disabled={turnBusy && !dictating}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                        dictating
                          ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/50 animate-pulse'
                          : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                      } disabled:opacity-40`}
                      title={dictating ? 'Stop listening' : 'Speak — fills this box with text, then press Enter'}
                      aria-label={dictating ? 'Stop listening' : 'Start voice to text'}
                      aria-pressed={dictating}
                    >
                      {dictating ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                    <button
                      ref={modelButtonRef}
                      type="button"
                      onClick={() => setModelMenuOpen(o => !o)}
                      className="inline-flex items-center justify-center w-8 h-8 text-content-secondary hover:text-content-primary hover:bg-surface-hover rounded-full transition-colors shrink-0 bg-transparent border-0"
                      title={modelTitle}
                      aria-label={modelTitle}
                      aria-expanded={modelMenuOpen}
                      data-nova-model-seat={seatCloud ? 'cloud' : 'local'}
                    >
                      {mode === 'image' ? (
                        <ImageIcon className="w-4 h-4 text-sky-400 shrink-0" />
                      ) : mode === 'video' ? (
                        <Video className="w-4 h-4 text-sky-400 shrink-0" />
                      ) : seatCloud ? (
                        <Cloud className="w-4 h-4 text-sky-400 shrink-0" />
                      ) : (
                        <Laptop className="w-4 h-4 text-content-tertiary shrink-0" />
                      )}
                    </button>
                    {modelMenu}
                    {turnBusy ? (
                      <button
                        type="button"
                        onClick={handleStop}
                        className="flex items-center justify-center shrink-0 w-8 h-8 text-rose-500 hover:text-rose-400 transition-colors"
                        title="Stop generating"
                        aria-label="Stop generating"
                        data-nova-stop="1"
                      >
                        <Square className="w-4 h-4 fill-current" />
                      </button>
                    ) : null}
                  </>
                );
              })()}
            </div>
          </div>
          </div>
          </div>

          {/* Timer (top) · % (bottom) — outside the glass, beside the composer (original rail). */}
          {(() => {
            const statusBusy = Boolean(
              liveTurnStatus
              && viewingChatId
              && liveTurnStatus.chatId === viewingChatId
              && !/^done$/i.test(String(liveTurnStatus.label || '')),
            );
            const turnBusy = generating || statusBusy;
            const statusMs = statusBusy && liveTurnStatus?.history?.[0]?.at
              ? Math.max(0, statusRailNow - liveTurnStatus.history[0].at)
              : 0;
            const parts = turnBusy ? stackedLiveTurnParts(generating ? liveTurnMs : statusMs) : null;
            return (
              <div
                className="flex flex-col items-center justify-end shrink-0 self-end gap-1.5 w-[2rem] select-none pb-0.5"
                data-nova-composer-rail="1"
              >
                <div
                  className="min-h-[1.55rem] w-full flex flex-col items-center justify-end tabular-nums leading-none pointer-events-none"
                  title={parts ? `Working · ${parts.label}` : undefined}
                  aria-label={parts ? `Working ${parts.label}` : undefined}
                  aria-live="polite"
                  aria-hidden={!parts || undefined}
                >
                  {parts ? (
                    <>
                      <span className="text-[10px] font-medium text-content-secondary">{parts.top}</span>
                      <span className="text-[10px] text-content-tertiary mt-0.5">{parts.bottom}</span>
                    </>
                  ) : null}
                </div>
                <TokenUsageRing
                  contextRatio={tokenRatio}
                  modelRatio={modelRatio}
                  working={turnBusy}
                  className="shrink-0"
                  modelName={
                    activeModel.source === 'auto'
                      ? autoModelLabel
                      : activeModel.name
                  }
                  modelDetail={
                    mode === 'image'
                      ? activeModel.source === 'auto'
                        ? autoRingDetail(threadBrain, 'image')
                        : 'Image · session budget'
                      : mode === 'video'
                        ? activeModel.source === 'auto'
                          ? autoRingDetail(threadBrain, 'video')
                          : 'Video · session budget'
                        : activeModel.source === 'auto'
                          ? autoRingDetail(threadBrain, threadKind)
                          : activeModel.source === 'local'
                            ? 'On-device · no cloud quota'
                            : 'Cloud · connected key'
                  }
                />
              </div>
            );
          })()}

          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 mt-2.5 px-1">
        {(mode === 'general' || mode === 'code') && (
          <>
            {capacity && !capacity.cloudKeys ? (
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('NOVA:open-settings', { detail: { section: 'providers' } }));
                }}
                className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
                title={
                  capacity.suggestedFreeKeys.length
                    ? `Try ${capacity.suggestedFreeKeys.map(k => k.name).join(', ')}`
                    : 'Connect a free key'
                }
              >
                Connect free key
              </button>
            ) : null}
            {capacity && !capacity.localGguf && !capacity.ollama ? (
              <button
                type="button"
                onClick={() => navigate({ name: 'models', tab: 'for-pc' })}
                className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
                title="Install a local GGUF brain"
              >
                Install local brain
              </button>
            ) : null}
            {!githubConnected ? (
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    const res = await window.novaDesktop?.pluginOAuthStart?.('github');
                    if (!res?.ok || !res.accessToken) return;
                    const { setPluginToken } = await import('@/lib/localPrefs');
                    const { loadPluginState, upsertPluginRuntime } = await import('@/lib/plugins');
                    setPluginToken('github', res.accessToken);
                    upsertPluginRuntime(loadPluginState(), 'github', {
                      installed: true,
                      connected: true,
                      enabledInChat: true,
                      accountLabel: res.accountLabel || undefined,
                      permissions: ['list', 'read', 'search', 'write'],
                    });
                    setGithubConnected(true);
                  })();
                }}
                className="inline-flex items-center gap-1 text-[11px] text-content-tertiary hover:text-content-secondary transition-colors"
                title="GitHub is linked when you Continue with GitHub at sign-in"
              >
                <Github className="w-3 h-3" />
                My GitHub
              </button>
            ) : null}
          </>
        )}
        {capacity && mode === 'image' && !capacity.imageFree && !capacity.openaiImage && (
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('NOVA:open-settings', { detail: { section: 'providers' } }));
            }}
            className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
          >
            Add image key (HF / OpenAI)
          </button>
        )}
        {capacity && mode === 'video' && !capacity.videoFree && (
          <span className="text-[11px] text-amber-400/90">
            Open desktop NOVA Engine for free video routes
          </span>
        )}
      </div>
    </div>
  );

  const ideaGrid = (ideas: typeof IMAGE_IDEAS, uploadLabel?: string) => (
    <div className="w-full max-w-4xl mx-auto mt-6 flex-1 min-h-0 flex flex-col">
      <p className="text-sm font-semibold text-content-primary mb-3 px-1 shrink-0">Explore ideas</p>
      <div className="relative flex-1 min-h-0">
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 h-full overflow-y-auto pb-14"
          style={{
            maskImage: 'linear-gradient(to bottom, #000 0%, #000 78%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 78%, transparent 100%)',
          }}
        >
          {uploadLabel && (
            <button
              type="button"
              className="aspect-square rounded-2xl border border-dashed border-surface-border bg-nova-navy-900/50 hover:bg-surface-hover transition-colors flex flex-col items-center justify-center gap-2 text-content-secondary hover:text-content-primary"
              onClick={() => void pickPhotosIntoChat()}
            >
              <Upload className="w-6 h-6" />
              <span className="text-xs font-medium px-2 text-center">{uploadLabel}</span>
            </button>
          )}
          {ideas.map(idea => (
            <button
              key={idea.id}
              type="button"
              onClick={() => applyIdea(idea.label)}
              className={`aspect-square rounded-2xl border border-surface-border bg-gradient-to-br ${idea.tone} p-3 flex items-end text-left hover:brightness-110 transition-all`}
            >
              <span className="text-xs font-medium text-white/95 drop-shadow">{idea.label}</span>
            </button>
          ))}
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-nova-navy-950 via-nova-navy-950/75 to-transparent"
          aria-hidden="true"
        />
      </div>
    </div>
  );

  return (
    <div className="h-full min-w-0 flex flex-col overflow-hidden relative">
      {/* Always mounted. toggling mount caused flicker; only opacity changes. */}
      <div
        className={`absolute inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-none transition-opacity duration-150 ${
          dragOverChat ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden={!dragOverChat}
      >
        <div className="rounded-2xl border border-sky-400/40 bg-nova-navy-900/95 px-6 py-4 text-center shadow-xl">
          <p className="text-sm font-medium text-content-primary">Drop folder or files</p>
        </div>
      </div>
      {mode === 'voice' && !isVoiceTabEnabled() ? (
        <div className="absolute inset-0 z-40">
          <ParkedNotice feature="voice" />
        </div>
      ) : null}
      {(mode === 'general' || mode === 'voice') ? (
        <>
          {/* Tight spacer — keep Chat/Voice above the stream without a tall gray band */}
          <div className="h-8 shrink-0" aria-hidden />
          <ChatModeTabs />
        </>
      ) : null}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-content-tertiary">
          <Loader2 className="w-5 h-5 animate-spin text-content-secondary" />
          <p className="text-xs text-content-tertiary">Loading chat…</p>
        </div>
      ) : mode === 'voice' ? (
        <VoiceModeLayout
          phase={voicePhase}
          onActivate={handleVoiceActivate}
          busy={voiceBusy}
          composer={composer}
          brainHint={
            capacity && !capacity.liveChat ? (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-center space-y-2.5">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('NOVA:open-settings', { detail: { section: 'providers' } }));
                    }}
                    className="rounded-full bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 px-3 py-1 text-[11px] font-medium transition-colors"
                  >
                    Connect free key
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'models', tab: 'for-pc' })}
                    className="rounded-full bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 px-3 py-1 text-[11px] font-medium transition-colors"
                  >
                    Install local brain
                  </button>
                </div>
              </div>
            ) : undefined
          }
        />
      ) : showEmpty ? (
        mode === 'general' ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 pb-16 w-full min-h-0 nova-chat-surface">
            <h1 className="nova-chat-hero font-semibold text-content-primary tracking-tight mb-6 text-center">
              {greeting}
            </h1>
            <div className="w-full nova-composer-column">
              {composer}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col px-4 sm:px-8 pt-[min(12vh,5.5rem)] pb-4 min-h-0 overflow-hidden">
            <div className="shrink-0 flex flex-col items-center w-full nova-composer-column nova-chat-surface mx-auto">
              <h1 className="nova-chat-hero font-semibold text-content-primary tracking-tight mb-6 text-center">
                {greeting}
              </h1>
              {composer}
            </div>
            {mode === 'image' && (
              <>
                {ideaGrid(IMAGE_IDEAS, 'Upload a photo')}
                {creations.filter(c => c.kind !== 'video').length > 0 && (
                  <div className="w-full max-w-4xl mx-auto mt-6">
                    <p className="text-sm font-semibold text-content-primary mb-3 px-1">Your images</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {creations.filter(c => c.kind !== 'video').slice(0, 12).map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => navigate({
                            name: 'chat',
                            mode: 'image',
                            creationId: c.id,
                          })}
                          className="aspect-square rounded-xl overflow-hidden border border-surface-border bg-nova-navy-900"
                          title={c.title || c.prompt}
                        >
                          {c.dataUrl ? (
                            <img src={c.dataUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="flex h-full items-center justify-center text-[10px] text-content-tertiary">Image</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {mode === 'video' && ideaGrid(VIDEO_IDEAS)}
            {mode === 'code' && (!capacity || !capacity.liveChat) && ideaGrid(CODE_IDEAS)}
          </div>
        )
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="relative flex-1 min-h-0 flex flex-col">
            <div
              ref={messagesScrollRef}
              onScroll={onMessagesScroll}
              onWheel={onMessagesWheel}
              className="flex-1 min-h-0 overflow-auto px-3 sm:px-5 lg:px-8 pt-6 pb-6 NOVA-scroll-quiet nova-chat-scroll-mask"
            >
            <div className="nova-chat-stream nova-chat-surface w-full space-y-4">
              {messages.length === 0 && showOpenThread && (
                <div className="text-center py-8 space-y-3">
                  <p className="text-[0.8125rem] text-content-secondary">
                    Type what to build.
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {FIRST_RUN_KIND_CHIPS.map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        className="text-[11px] text-sky-300 px-1 py-1 hover:text-sky-100 transition-colors"
                        onClick={() => tryStartTurn(chip.prompt)}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map(msg => {
                return (
                <div
                  key={msg.id}
                  className={`nova-msg-row animate-fade-in ${
                    msg.role === 'user'
                      ? 'nova-msg-row--user'
                      : 'nova-msg-row--assistant'
                  }`}
                >
                  <div
                    className={`nova-chat-bubble text-content-primary min-w-0 ${
                      msg.role === 'user'
                        ? 'min-w-0 break-words [overflow-wrap:anywhere] overflow-hidden flex flex-col items-end gap-1'
                        : isMediaOnlyContent(msg.content)
                          || (
                            msg.content.startsWith('__generating__:image:')
                            || msg.content.startsWith('__generating__:video:')
                            || msg.content.startsWith('__progress__:')
                          )
                          || (
                            generating
                            && msg.id === messages[messages.length - 1]?.id
                            && (mode === 'image' || mode === 'video')
                          )
                          ? 'shrink-0'
                          // overflow-x-auto (not hidden) so 10+ list markers and long code stay visible
                          : 'min-w-0 break-words [overflow-wrap:anywhere] overflow-x-auto'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      (() => {
                        const raw = String(msg.content || '').trim();
                        const hasMedia = /!\[[^\]]*]\([^)]+\)/.test(raw) || raw.includes('nova-media:');
                        const promptText = stripComposerPrefix(raw)
                          .replace(/!\[[^\]]*]\([^)]+\)/g, '')
                          .replace(/<!--[\s\S]*?-->/g, '')
                          // Ladder/CDP test markers must never show in the bubble.
                          .replace(/\s*\[(?:CL|TW|RL|GL|NW|MK)[a-z0-9]+\]/gi, '')
                          .trim();
                        const mediaMatch = raw.match(/!\[[^\]]*]\(([^)]+)\)/);
                        const mediaSrc = mediaMatch?.[1] || '';
                        const copied = copiedMsgId === msg.id;

                        const copyPrompt = () => {
                          void navigator.clipboard.writeText(promptText || raw).then(() => {
                            setCopiedMsgId(msg.id);
                            window.setTimeout(() => {
                              setCopiedMsgId(prev => (prev === msg.id ? null : prev));
                            }, 1600);
                          }).catch(() => undefined);
                        };

                        const downloadImage = () => {
                          void (async () => {
                            try {
                              let src = mediaSrc;
                              if (src.startsWith('nova-media:')) {
                                src = (await resolveMediaRef(src.slice('nova-media:'.length))) || '';
                              }
                              if (!src) return;
                              const res = await fetch(src);
                              const blob = await res.blob();
                              const buf = await blob.arrayBuffer();
                              const u8 = new Uint8Array(buf);
                              let ext = 'jpg';
                              if (u8.length >= 8 && u8[0] === 0x89 && u8[1] === 0x50) ext = 'png';
                              else if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8) ext = 'jpg';
                              else if (u8.length >= 12 && u8[0] === 0x52 && u8[8] === 0x57) ext = 'webp';
                              const fileName = `NOVA-${Date.now()}.${ext}`;
                              const bytes = Array.from(u8);
                              if (window.novaDesktop?.saveToDownloads) {
                                const saved = await window.novaDesktop.saveToDownloads({
                                  fileName,
                                  bytes,
                                  mime: blob.type || 'image/jpeg',
                                });
                                if (saved?.ok && saved.folderPath) {
                                  pushDownloadCompleteToast({
                                    fileName: saved.fileName || fileName,
                                    folderPath: saved.folderPath,
                                  });
                                  return;
                                }
                              }
                              const url = URL.createObjectURL(new Blob([buf], { type: blob.type || 'image/jpeg' }));
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = fileName;
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                              window.setTimeout(() => URL.revokeObjectURL(url), 2000);
                              pushDownloadCompleteToast({ fileName, folderPath: '' });
                            } catch {
                              /* ignore */
                            }
                          })();
                        };

                        if (hasMedia) {
                          // Image + prompt share one right edge (not centered in a fat column).
                          const mediaOnly = (raw.match(/!\[[^\]]*]\([^)]+\)/g) || []).join('\n');
                          return (
                            <div className="w-fit max-w-full self-end flex flex-col items-end gap-2">
                              {mediaOnly ? (
                                <div className="w-fit max-w-[min(100%,22rem)] [&_img]:rounded-2xl [&_img]:shadow-[0_8px_28px_rgba(0,0,0,0.35)]">
                                  <MessageContent content={mediaOnly} live={false} tone="user" />
                                </div>
                              ) : null}
                              {promptText ? (
                                <div className="nova-chat-bubble w-fit max-w-full rounded-xl px-3 py-2 bg-surface-hover text-content-primary">
                                  <MessageContent content={promptText} live={false} tone="user" />
                                </div>
                              ) : null}
                              <div className="flex items-center gap-0.5 -mt-0.5">
                                <button
                                  type="button"
                                  title="Download image"
                                  aria-label="Download image"
                                  className="inline-flex items-center justify-center rounded-md p-1 text-content-tertiary/80 hover:text-content-secondary"
                                  onClick={downloadImage}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title={copied ? 'Copied' : 'Copy prompt'}
                                  aria-label={copied ? 'Copied' : 'Copy prompt'}
                                  className="inline-flex items-center justify-center rounded-md p-1 text-content-tertiary/80 hover:text-content-secondary"
                                  onClick={copyPrompt}
                                >
                                  {copied ? <Check className="w-3.5 h-3.5 text-nova-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <>
                            <div className="nova-chat-bubble min-w-0 max-w-full rounded-xl px-3 py-2 bg-surface-hover text-content-primary">
                              <MessageContent
                                content={msg.content}
                                live={false}
                                tone="user"
                                onPromptChipPick={(prompt) => {
                                  if (prompt === '__NOVA_ARM_PLAN__' || prompt === '<!--nova-arm-plan-->') {
                                    handlePlusAction('plan');
                                    return;
                                  }
                                  const p = String(prompt || '').trim();
                                  if (/^let['’]?s build this$/i.test(p) || /^lets build this$/i.test(p)) {
                                    setComposerMode(null);
                                    setDropHint(null);
                                  }
                                  tryStartTurn(prompt);
                                }}
                              />
                            </div>
                            {raw ? (
                              <button
                                type="button"
                                title={copied ? 'Copied' : 'Copy prompt'}
                                aria-label={copied ? 'Copied' : 'Copy prompt'}
                                className="inline-flex items-center justify-center rounded-md p-1 text-content-tertiary/80 hover:text-content-secondary"
                                onClick={copyPrompt}
                              >
                                {copied ? <Check className="w-3.5 h-3.5 text-nova-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            ) : null}
                          </>
                        );
                      })()
                    ) : (
                      <>
                    {(() => {
                      const isAssistant = msg.role === 'assistant';
                      const isLast = msg.id === messages[messages.length - 1]?.id;
                      const raw = String(msg.content || '');
                      // Only Image/Video tabs (or explicit image/video generating tags) show media placeholder.
                      // Empty chat bubbles must never become “Creating image”.
                      const showMediaGen = isAssistant && (
                        raw.startsWith('__generating__:image:')
                        || raw.startsWith('__generating__:video:')
                        || (
                          (mode === 'image' || mode === 'video')
                          && isLast
                          && generating
                          && (!raw.trim() || raw.startsWith('__generating__:'))
                          && !raw.includes('![')
                        )
                      );
                      if (showMediaGen) {
                        const genKind = raw.includes(':video:') || mode === 'video' ? 'video' : 'image';
                        const genLabel = raw.startsWith('__generating__:')
                          ? raw.split(':').slice(2).join(':') || undefined
                          : (genKind === 'video' ? 'Creating video' : 'Creating image');
                        return <GeneratingPlaceholder kind={genKind} label={genLabel} sessionKey={msg.id} />;
                      }
                      if (isAssistant && isLikelyErrorMessage(msg.content)) {
                        const errorInfo = classifyErrorMessage(msg.content);
                        return (
                          <NovaErrorInline
                            message={msg.content}
                            onAction={errorInfo.code === 'KEY_MISSING' ? () => {
                              window.dispatchEvent(new CustomEvent('NOVA:open-settings', { detail: { section: 'providers' } }));
                            } : undefined}
                          />
                        );
                      }
                      return (
                        <div className="nova-msg-body-cap">
                          <MessageContent
                            content={msg.content}
                            live={Boolean(generating && isLast && isAssistant)}
                            messageId={msg.id}
                            onPromptChipPick={(prompt) => {
                              if (prompt === '__NOVA_ARM_PLAN__' || prompt === '<!--nova-arm-plan-->') {
                                handlePlusAction('plan');
                                return;
                              }
                              const p = String(prompt || '').trim();
                              if (/^let['’]?s build this$/i.test(p) || /^lets build this$/i.test(p)) {
                                setComposerMode(null);
                                setDropHint(null);
                              }
                              // Repair / “fix DBG-015” — soft-arm Agent so the work queue applies.
                              if (/\bfix\s+(?:dbg[- ]?\d+|\d+)/i.test(p) || /\bfix\s+\d+(?:\s*,|\s+and\b)/i.test(p)) {
                                try { setComposerMode('agent'); } catch { /* ignore */ }
                              }
                              tryStartTurn(prompt);
                            }}
                          />
                        </div>
                      );
                    })()}
                    {(() => {
                      const isAssistant = msg.role === 'assistant';
                      const isLast = msg.id === messages[messages.length - 1]?.id;
                      const raw = String(msg.content || '').trim();
                      const isLiveStreaming = Boolean(
                        isAssistant
                        && isLast
                        && generating
                        && !raw.startsWith('__generating__:'),
                      );
                      // Copy + time + model only after this bubble is finished — never mid-stream.
                      const showReplyMeta = isAssistant
                        && !isLiveStreaming
                        && !raw.startsWith('__generating__:')
                        && Boolean(raw)
                        && !isLikelyErrorMessage(raw)
                        && (
                          typeof msg.elapsed_ms === 'number'
                          || (!generating && Boolean(msg.provider_used))
                          || (!generating && !isLast)
                        );
                      if (!showReplyMeta) return null;
                      const copied = copiedMsgId === msg.id;
                      // Sub-second timers on Fix/Agent look fake (surgical disk writes).
                      // Hide them — the Code pill + Files touched chips are the proof.
                      const providerUsed = String(msg.provider_used || '');
                      const isFileWorkProvider = /\b(?:Fix|Agent|Multi-agent|edit)\b/i.test(providerUsed);
                      const rawMs = typeof msg.elapsed_ms === 'number' ? msg.elapsed_ms : -1;
                      const timeBit = rawMs >= 0 && !(isFileWorkProvider && rawMs < 1500)
                        ? formatReplyElapsed(rawMs)
                        : '';
                      const modelBit = shortReplyModelLabel(msg.provider_used);
                      const chatId = routeChatIdRef.current || persistChatIdRef.current || '';
                      const snap = chatId ? getApplySnapshot(chatId) : null;
                      // Undo only on the assistant bubble that produced the last apply.
                      const showUndo = Boolean(
                        snap
                        && snap.assistantId === msg.id
                        && snap.updatedPaths?.length
                      );
                      const runUndo = () => {
                        void (async () => {
                          if (!chatId || !snap) return;
                          const blocks = snapshotToRevertBlocks(snap);
                          if (!blocks) return;
                          const applied = await applyChatReplyEdits({
                            reply: blocks,
                            projectId: chatStudioProjectIdRef.current,
                            projectName: studioPathBasename(snap.diskRoot || '') || 'project',
                            files: snap.files,
                            userMessage: 'undo last apply',
                            diskRoot: snap.diskRoot,
                          });
                          if (applied.ok) {
                            setChatStudioFiles(applied.files);
                            chatStudioFilesRef.current = applied.files;
                            persistStudioSnapshot(chatId, {
                              files: applied.files,
                              projectId: chatStudioProjectIdRef.current,
                              diskRoot: snap.diskRoot,
                            });
                            clearApplySnapshot(chatId);
                            const undoHint = 'Undid the last file apply.';
                            setDropHint(undoHint);
                            window.setTimeout(() => {
                              setDropHint(null);
                            }, 2200);
                          }
                        })();
                      };
                      const iconBtn =
                        'inline-flex items-center justify-center rounded-md p-1 text-content-tertiary hover:text-content-secondary hover:bg-white/[0.04] transition-colors disabled:opacity-40';
                      // Copy the spoken reply only — never the nova-trace / Files Changed payload.
                      const copyText = stripAgentTrace(raw)
                        .replace(/<!--[\s\S]*?-->/g, '')
                        .replace(/^\s*\{[\s\S]*?"(?:path|added|removed)"[\s\S]*\}\s*/m, '')
                        .trim();
                      const mutedBtn =
                        'inline-flex items-center justify-center rounded-md p-1 text-content-tertiary/35 cursor-not-allowed';
                      return (
                        <div className="mt-2.5 flex items-center gap-0.5 text-[11px] text-content-tertiary tabular-nums">
                          {showUndo ? (
                            <button
                              type="button"
                              title="Undo last edit"
                              aria-label="Undo last edit"
                              className={iconBtn}
                              onClick={runUndo}
                            >
                              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            title={copied ? 'Copied' : 'Copy'}
                            aria-label={copied ? 'Copied' : 'Copy response'}
                            className={iconBtn}
                            onClick={() => {
                              const text = copyText.trim();
                              if (!text) return;
                              void navigator.clipboard.writeText(text).then(() => {
                                setCopiedMsgId(msg.id);
                                window.setTimeout(() => {
                                  setCopiedMsgId(prev => (prev === msg.id ? null : prev));
                                }, 1600);
                              }).catch(() => undefined);
                            }}
                          >
                            {copied ? <Check className="w-3.5 h-3.5 text-nova-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            title="Try again (coming soon)"
                            aria-label="Try again unavailable"
                            className={mutedBtn}
                            disabled
                            aria-disabled="true"
                          >
                            <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            title="Share (coming soon)"
                            aria-label="Share unavailable"
                            className={mutedBtn}
                            disabled
                            aria-disabled="true"
                          >
                            <Share2 className="w-3.5 h-3.5" strokeWidth={2} />
                          </button>
                          {(timeBit || modelBit) ? (
                            <span className="ml-1.5 min-w-0 truncate text-content-tertiary/90">
                              {timeBit}
                              {timeBit && modelBit ? ' · ' : ''}
                              {modelBit}
                            </span>
                          ) : null}
                        </div>
                      );
                    })()}
                    {msg.role === 'assistant' && /Stopped at length limit/i.test(msg.content) ? (
                      <button
                        type="button"
                        className="mt-2 text-[10px] rounded-full bg-sky-600 text-white px-2.5 py-1"
                        onClick={() => {
                          const lastUser = [...messages].reverse().find((m) => m.role === 'user');
                          const text = String(lastUser?.content || '').replace(/<!--[\s\S]*?-->/g, '').trim();
                          tryStartTurn(text);
                        }}
                      >
                        Continue from cutoff
                      </button>
                    ) : null}
                    {msg.role === 'assistant' && /Retry with cloud/i.test(msg.content) ? (
                      <button
                        type="button"
                        className="mt-2 text-[10px] text-sky-300 hover:text-sky-100 px-0.5 py-1"
                        onClick={() => {
                          setLocalPrefs({ autoFailover: true, askBeforeCloudFailover: false });
                          const lastUser = [...messages].reverse().find(m => m.role === 'user');
                          if (lastUser) void sendMessage(lastUser.content);
                        }}
                      >
                        Retry with cloud
                      </button>
                    ) : null}
                    {msg.role === 'assistant' && /folder access|Allow Documents/i.test(msg.content) ? (
                      <button
                        type="button"
                        className="mt-2 text-[10px] text-emerald-200 hover:text-emerald-100 px-0.5 py-1"
                        onClick={() => {
                          setLocalPrefs({ allowDocumentsFolderAccess: true });
                          void syncWorkspaceGrantsFromPrefs();
                          setDropHint('Documents access enabled. Say create again.');
                        }}
                      >
                        Allow Documents
                      </button>
                    ) : null}

                    {msg.role === 'assistant' && githubOfferId === msg.id && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <button
                          type="button"
                          className="text-[10px] rounded-full bg-sky-600 text-white px-2.5 py-1"
                          onClick={() => {
                            if (!githubConnected) {
                              void (async () => {
                                const res = await window.novaDesktop?.pluginOAuthStart?.('github');
                                if (!res?.ok || !res.accessToken) return;
                                const { setPluginToken } = await import('@/lib/localPrefs');
                                const { loadPluginState, upsertPluginRuntime } = await import('@/lib/plugins');
                                setPluginToken('github', res.accessToken);
                                upsertPluginRuntime(loadPluginState(), 'github', {
                                  installed: true,
                                  connected: true,
                                  enabledInChat: true,
                                  accountLabel: res.accountLabel || undefined,
                                  permissions: ['list', 'read', 'search', 'write'],
                                });
                                setGithubConnected(true);
                                setGithubPickerOpen(true);
                              })();
                              return;
                            }
                            setGithubPickerOpen(true);
                          }}
                        >
                          {githubConnected ? 'Pick a repo' : 'Continue with GitHub'}
                        </button>
                      </div>
                    )}
                      </>
                    )}
                  </div>
                </div>
              );
              })}
              <div ref={messagesEndRef} />
            </div>
            </div>
            {showJumpToBottom ? (
              <button
                type="button"
                onClick={jumpToBottom}
                title={generating ? 'New reply in progress — jump to latest' : 'Jump to latest'}
                aria-label={generating ? 'Jump to latest — reply in progress' : 'Jump to latest message'}
                className={`absolute bottom-2 left-1/2 -translate-x-1/2 z-10 h-9 w-9 rounded-full border border-violet-400/35 bg-nova-navy-950/90 text-violet-200 hover:text-white hover:bg-nova-navy-900/95 hover:border-violet-300/50 backdrop-blur-sm flex items-center justify-center shadow-md shadow-black/40 ${
                  generating ? 'animate-pulse' : 'animate-bounce'
                }`}
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            ) : null}
          </div>
          <div className="shrink-0 px-4 sm:px-8 pb-6 pt-2 space-y-2">
            {setupNote && (
              <div className="max-w-3xl mx-auto rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90 leading-relaxed flex items-start justify-between gap-3">
                <p>
                  Local brain install had an issue during setup. Use{' '}
                  <button type="button" className="underline hover:text-amber-100" onClick={() => navigate({ name: 'local-ai' })}>
                    Local AI
                  </button>
                  {' '}to retry, or connect a free key.
                </p>
                <button
                  type="button"
                  className="shrink-0 text-amber-300/80 hover:text-amber-100"
                  onClick={() => {
                    try { localStorage.removeItem('NOVA:setup-brain-note'); } catch { /* ignore */ }
                    setSetupNote(null);
                  }}
                >
                  Dismiss
                </button>
              </div>
            )}
            {composer}
          </div>
        </div>
      )}
      <GitHubRepoPicker
        open={githubPickerOpen}
        onClose={() => setGithubPickerOpen(false)}
        onPick={repo => void clonePickedRepo(repo)}
      />
      <ChatCodeOverlay
        open={codeOverlayOpen}
        onClose={() => (closeCodeOverlay ? closeCodeOverlay() : setCodeOverlayOpen(false))}
        files={chatStudioFiles}
        readOnly={generating}
        smoothTyping={generating}
        followPath={generating ? liveWritingPath : null}
        projectName={
          loadChatStudio(route.name === 'chat' ? (route.chatId || '') : '')?.name
          || (chatStudioDiskRoot ? chatStudioDiskRoot.split(/[/\\]/).pop() : undefined)
        }
        onChangeFile={(path, content) => {
          if (generating) return;
          const next = { ...chatStudioFilesRef.current, [path]: content };
          setChatStudioFiles(next);
          chatStudioFilesRef.current = next;
          const chatId = routeChatIdRef.current || persistChatIdRef.current;
          if (chatId) {
            persistStudioSnapshot(chatId, { files: next });
          }
          const root = chatStudioDiskRootRef.current;
          const pid = chatStudioProjectIdRef.current;
          if (root && window.novaDesktop?.workspaceWriteFile) {
            const sep = root.includes('\\') ? '\\' : '/';
            const full = `${root.replace(/[/\\]+$/, '')}${sep}${path.replace(/\//g, sep)}`;
            void window.novaDesktop.workspaceWriteFile({
              targetPath: full,
              content,
            });
          } else if (pid) {
            void import('@/lib/projectWriteSafe').then(({ safeProjectWrite }) => {
              void safeProjectWrite({
                projectId: pid,
                projectName: path,
                files: { [path]: content },
              });
            });
          }
        }}
      />
      <ChatPlanOverlay
        open={Boolean(planOverlayOpen)}
        onClose={() => setPlanOverlayOpen?.(false)}
        chatId={route.name === 'chat' ? (route.chatId || routeChatIdRef.current || null) : (routeChatIdRef.current || null)}
        live={Boolean(planLiveDrafting)}
        liveLabel={dropHint && /planning/i.test(String(dropHint)) ? String(dropHint) : null}
      />
      <StudioControlsOverlay
        open={studioControlsOpen}
        onClose={() => setStudioControlsOpen(false)}
      />
      <DeleteProjectFolderModal
        prompt={deleteProjectPrompt}
        busy={deleteProjectBusy}
        onCancel={handleDeleteProjectCancel}
        onConfirm={() => { void handleDeleteProjectConfirm(); }}
      />
      <DeleteFileModal
        prompt={deleteFilePrompt}
        busy={deleteFileBusy}
        onCancel={handleDeleteFileCancel}
        onConfirm={() => { void handleDeleteFileConfirm(); }}
      />
      <DeleteFolderClarifyModal
        prompt={deleteFolderClarifyPrompt}
        busy={deleteFileBusy}
        onCancel={handleFolderClarifyCancel}
        onConfirmFolder={() => { void handleFolderClarifyConfirm(); }}
      />
    </div>
  );
}
