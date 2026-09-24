/**
 * AIChat presentational shell — composer, message list, dialogs.
 */
// @ts-nocheck — props bag is intentionally loose; logic stays in AIChat.tsx
import { useEffect } from 'react';
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
import { NovaErrorInline } from '@/components/NovaErrorInline';
import { NovaMark } from '@/components/NovaMark';
import { MessageContent, GeneratingPlaceholder } from '@/components/MediaMessage';
import { ChatCodeOverlay } from '@/components/ChatCodeOverlay';
import { useChatTurnStatus } from '@/hooks/useChatTurnStatus';
import { FIRST_RUN_KIND_CHIPS } from '@/lib/chatTurnHandlers';
import { isTraceMessage } from '@/lib/agentTrace';
import { classifyErrorMessage, isLikelyErrorMessage } from '@/lib/errors';
import { isVoiceTabEnabled } from '@/lib/featurePark';
import { formatReplyElapsed, shortReplyModelLabel } from '@/lib/speedTest';
import { attachKey } from '@/lib/chatAttach';
import { loadChatStudio, studioPathBasename } from '@/lib/chatStudioStore';
import { getApplySnapshot, clearApplySnapshot, snapshotToRevertBlocks } from '@/lib/chatApplySnapshotStore';
import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { setLocalPrefs, hasProviderApiKey } from '@/lib/localPrefs';
import { isCloudProviderEnabled } from '@/lib/cloudSources';
import { syncWorkspaceGrantsFromPrefs } from '@/lib/workspaceGrants';
import { autoEquippedCaption, autoRingDetail } from '@/lib/threadBrain';
import { probeLiveCapacity } from '@/lib/novaCapacity';
import { setEngineModel } from '@/lib/novaEngine';
import {
  Loader2, ImageIcon, Video, Code2,
  Upload, Cpu, Cloud, ChevronDown, Check,
  Folder, Square, X, ImagePlus,
  Puzzle, Briefcase, Github, Globe, Copy, Plus, Mic, MicOff, RotateCcw, RefreshCw, Share2,
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
  focusComposerIfSafe,
  type ChatModelOption,
} from './aiChatHelpers';

// Loose props bag — AIChat owns the logic; this file is presentational.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AIChatFrameProps = Record<string, any>;

export function AIChatFrame(props: AIChatFrameProps) {
  const activeModel = props.activeModel;
  const addPendingImages = props.addPendingImages;
  const attachBusy = props.attachBusy;
  const attachInputRef = props.attachInputRef;
  const attachUploading = props.attachUploading;
  const autoModelLabel = props.autoModelLabel;
  const bindTypedPath = props.bindTypedPath;
  const browseBindFolder = props.browseBindFolder;
  const capacity = props.capacity;
  const chatPlugins = props.chatPlugins;
  const chatStudioDiskRoot = props.chatStudioDiskRoot;
  const chatStudioDiskRootRef = props.chatStudioDiskRootRef;
  const chatStudioFiles = props.chatStudioFiles;
  const chatStudioFilesRef = props.chatStudioFilesRef;
  const chatStudioProjectIdRef = props.chatStudioProjectIdRef;
  const chats = props.chats;
  const clonePickedRepo = props.clonePickedRepo;
  const codeOverlayOpen = props.codeOverlayOpen;
  const liveTurnStatus = useChatTurnStatus();
  const liveWritingPath = liveTurnStatus?.writingPath || null;
  const codePillSticky = props.codePillSticky;
  const composerMode = props.composerMode;
  const copiedMsgId = props.copiedMsgId;
  const createJobLive = props.createJobLive;
  const creations = props.creations;
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
  const editingQueueText = props.editingQueueText;
  const engineInstallingModels = props.engineInstallingModels;
  const engineLocalModels = props.engineLocalModels;
  const engineReadyIds = props.engineReadyIds;
  const failoverNote = props.failoverNote;
  const flushQueuedSend = props.flushQueuedSend;
  const freeKeyOpen = props.freeKeyOpen;
  const generating = props.generating;
  const generatingRef = props.generatingRef;
  const githubOfferId = props.githubOfferId;
  const githubPickerOpen = props.githubPickerOpen;
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
  const messages = props.messages;
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
  const openProjectFolder = props.openProjectFolder;
  const openProjectPreview = props.openProjectPreview;
  const pathBindDraft = props.pathBindDraft;
  const pathBindInputRef = props.pathBindInputRef;
  const pathBindOpen = props.pathBindOpen;
  const pendingAttaches = props.pendingAttaches;
  const pendingImages = props.pendingImages;
  const pendingQueueRef = props.pendingQueueRef;
  const persistChatIdRef = props.persistChatIdRef;
  const persistStudioSnapshot = props.persistStudioSnapshot;
  const pickPhotosIntoChat = props.pickPhotosIntoChat;
  const placeholder = props.placeholder;
  const previewUrl = props.previewUrl;
  const queueLen = props.queueLen;
  const queueTick = props.queueTick;
  const removePendingAttach = props.removePendingAttach;
  const route = props.route;
  const routeChatIdRef = props.routeChatIdRef;
  const sendMessage = props.sendMessage;
  const setActiveModel = props.setActiveModel;
  const setCapacity = props.setCapacity;
  const setChatStudioFiles = props.setChatStudioFiles;
  const setChatStudioProjectId = props.setChatStudioProjectId;
  const setCodeOverlayOpen = props.setCodeOverlayOpen;
  const setComposerMode = props.setComposerMode;
  const setCopiedMsgId = props.setCopiedMsgId;
  const setDropHint = props.setDropHint;
  // Undo toast: gray (via text-content-tertiary) and auto-dismiss once.
  useEffect(() => {
    if (dropHint !== 'Undid the last file apply.') return;
    const id = window.setTimeout(() => setDropHint(null), 2200);
    return () => window.clearTimeout(id);
  }, [dropHint, setDropHint]);
  // Keep ambient orbs moving while a reply generates (do not freeze the shell animation).
  const setEditingQueueId = props.setEditingQueueId;
  const setEditingQueueText = props.setEditingQueueText;
  const setFailoverNote = props.setFailoverNote;
  const setFreeKeyOpen = props.setFreeKeyOpen;
  const setGithubPickerOpen = props.setGithubPickerOpen;
  const setInput = props.setInput;
  const setModelMenuOpen = props.setModelMenuOpen;
  const setPathBindDraft = props.setPathBindDraft;
  const setPathBindOpen = props.setPathBindOpen;
  const setPendingAttaches = props.setPendingAttaches;
  const setPendingImages = props.setPendingImages;
  const setQueueLen = props.setQueueLen;
  const setQueueTick = props.setQueueTick;
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
  const user = props.user;
  const videoDurationSec = props.videoDurationSec;
  const voicePhase = props.voicePhase;
  const workspaceBadgeLabel = props.workspaceBadgeLabel;

  // Code overlay auto-opens when create/build starts (NOVA:open-code-overlay) so you can watch live.

  const applyIdea = (label: string) => {
    setInput(label);
    focusComposerIfSafe(textareaRef.current);
  };

  const viewingChatId = route.name === 'chat' ? route.chatId : undefined;
  // Explore / idea grid only for brand-new chats. never when a Recent thread is open.
  const showEmpty = !loading && messages.length === 0 && !viewingChatId;

  const voiceBusy = generating
    || voicePhase === 'listening'
    || voicePhase === 'thinking'
    || voicePhase === 'speaking';
  const showOpenThread = !loading && Boolean(viewingChatId);
  const ModelSourceIcon = activeModel.source === 'cloud' ? Cloud : Cpu;
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
                  <span className="block text-sm text-content-primary truncate">{model.name}</span>
                  <span className="block text-[11px] text-content-tertiary truncate">
                    {autoEquippedCaption(threadBrain) || 'Multi-model · including vision for builds'}
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
                <span className="w-7 h-7 flex items-center justify-center shrink-0 text-emerald-400">
                  <Cpu className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content-primary truncate">{model.name}</span>
                  {model.detail ? <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span> : null}
                </span>
                {activeModel.id === model.id && <Check className="w-4 h-4 text-nova-accent-green shrink-0" />}
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
                <span className="w-7 h-7 flex items-center justify-center shrink-0 text-amber-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content-primary truncate">{model.name}</span>
                  {model.detail ? <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span> : null}
                </span>
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
                  <span className="w-7 h-7 flex items-center justify-center shrink-0 text-content-tertiary">
                    <Cpu className="w-3.5 h-3.5" />
                  </span>
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
                <span className="w-7 h-7 flex items-center justify-center shrink-0 text-sky-400">
                  <Cloud className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-content-primary truncate">{model.name}</span>
                  {model.detail ? <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span> : null}
                </span>
                {activeModel.id === model.id && <Check className="w-4 h-4 text-nova-accent-green shrink-0" />}
              </button>
            ))}
          </>
        )}
        {kind === 'chat' && keyedCloud.length === 0 && ollamaModels.length === 0 && engineLocalModels.length === 0 && (
          null
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
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 pl-2.5 pr-1 py-0.5 text-[11px] text-sky-300/95">
        {failoverNote}
        <button
          type="button"
          onClick={() => setFailoverNote(null)}
          className="w-5 h-5 rounded-full flex items-center justify-center text-sky-400/80 hover:text-sky-200 hover:bg-sky-500/20 transition-colors"
          aria-label="Dismiss"
          title="Dismiss"
        >
          <X className="w-3 h-3" />
        </button>
      </span>
      {import.meta.env.DEV && ipcFallbackDev && (
        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] text-amber-300/95">
          IPC fallback · brain HTTP
        </span>
      )}
    </div>
  ) : import.meta.env.DEV && ipcFallbackDev ? (
    <div className="mb-2 flex justify-center">
      <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] text-amber-300/95">
        IPC fallback · brain HTTP
      </span>
    </div>
  ) : null;

  const composer = (
    <div className="w-full max-w-3xl mx-auto min-w-0">
      {failoverChip}
      <div className="flex flex-col min-w-0 w-full">
        <div className="min-w-0 flex flex-col w-full">
          {attachUploading && (
            <p className="mb-2 px-1 text-[11px] text-sky-300/90 animate-pulse truncate">{attachUploading}</p>
          )}
          {pendingAttaches.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1 max-w-full overflow-hidden">
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
          {dictating ? (
            <p className="mb-2 px-1 text-[11px] text-rose-300/90 animate-pulse">
              Listening… speak now, then click the mic again when you’re done.
            </p>
          ) : dictationHint ? (
            <p className="mb-2 px-1 text-[11px] text-amber-300/90 break-words [overflow-wrap:anywhere] line-clamp-2">
              {dictationHint}
            </p>
          ) : null}
          {pendingImages.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
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
            <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
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
          {dropHint && !attachUploading && (
            <p
              className="mb-2 w-full min-w-0 overflow-hidden text-left text-[11px] text-content-tertiary break-words [overflow-wrap:anywhere] line-clamp-2"
              title={dropHint}
            >
              {dropHint}
            </p>
          )}
          {pathBindOpen && (
            <div className="mb-2 w-full min-w-0 box-border rounded-xl border border-surface-border bg-nova-navy-900/90 px-2 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <Folder className="w-3.5 h-3.5 shrink-0 text-amber-300/90" />
                <input
                  ref={pathBindInputRef}
                  type="text"
                  value={pathBindDraft}
                  onChange={(e) => setPathBindDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void bindTypedPath();
                    }
                    if (e.key === 'Escape') {
                      setPathBindOpen(false);
                      setPathBindDraft('');
                    }
                  }}
                  placeholder="Folder path…"
                  className="min-w-0 flex-1 bg-transparent border-none px-1 py-1 text-xs text-content-primary placeholder:text-content-tertiary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void browseBindFolder()}
                  className="shrink-0 rounded-md px-2 py-1 text-[11px] text-content-secondary hover:bg-surface-hover hover:text-content-primary"
                >
                  Browse
                </button>
                <button
                  type="button"
                  onClick={() => void bindTypedPath()}
                  className="shrink-0 rounded-md bg-amber-500/90 px-2.5 py-1 text-[11px] font-medium text-nova-navy-950 hover:bg-amber-400"
                >
                  Bind
                </button>
                <button
                  type="button"
                  onClick={() => { setPathBindOpen(false); setPathBindDraft(''); }}
                  className="shrink-0 rounded-md p-1 text-content-tertiary hover:text-content-secondary hover:bg-surface-hover"
                  aria-label="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
          <div
            data-ark-composer="1"
            className={`w-full min-w-0 flex flex-col border border-surface-border bg-nova-navy-900 shadow-lg shadow-black/20 overflow-hidden ${
              mode === 'voice' ? 'rounded-2xl' : 'rounded-xl'
            }`}
          >
          {queueLen > 0 && pendingQueueRef.current.length > 0 && (
            <div className="w-full min-w-0 box-border flex flex-col gap-1.5 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100/90">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {queueLen === 1
                    ? '1 message queued — edit or wait for this reply to finish'
                    : `${queueLen} messages queued — next sends when this reply finishes`}
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded-md px-2 py-0.5 text-amber-200/90 hover:bg-amber-500/20 transition-colors"
                  onClick={() => {
                    pendingQueueRef.current = [];
                    setQueueLen(0);
                    setQueueTick(t => t + 1);
                    editingQueueIdRef.current = null;
                    setEditingQueueId(null);
                    setEditingQueueText('');
                  }}
                >
                  Clear
                </button>
              </div>
              <ul className="space-y-1.5" key={queueTick}>
                {pendingQueueRef.current.map((q, idx) => (
                  <li key={q.id} className="rounded-md border border-amber-500/20 bg-nova-navy-950/40 px-2 py-1.5">
                    {editingQueueId === q.id ? (
                      <div className="flex flex-col gap-1.5">
                        <textarea
                          value={editingQueueText}
                          onChange={e => setEditingQueueText(e.target.value)}
                          rows={2}
                          className="w-full resize-none rounded-md border border-amber-500/30 bg-nova-navy-950 px-2 py-1 text-[12px] text-content-primary outline-none focus:border-amber-400/50"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            className="rounded-md px-2 py-0.5 text-amber-200/80 hover:bg-amber-500/15"
                            onClick={() => {
                              editingQueueIdRef.current = null;
                              setEditingQueueId(null);
                              setEditingQueueText('');
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="rounded-md bg-amber-500/90 px-2.5 py-0.5 font-medium text-nova-navy-950 hover:bg-amber-400"
                            onClick={() => {
                              const text = editingQueueText.trim();
                              if (!text) return;
                              pendingQueueRef.current = pendingQueueRef.current.map(item => (
                                item.id === q.id ? { ...item, text } : item
                              ));
                              setQueueTick(t => t + 1);
                              editingQueueIdRef.current = null;
                              setEditingQueueId(null);
                              setEditingQueueText('');
                              // If the reply already finished while editing, flush now.
                              if (!generatingRef.current) flushQueuedSend();
                            }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 text-amber-50/90 break-words [overflow-wrap:anywhere]">
                          <span className="text-amber-200/50 mr-1">{idx + 1}.</span>
                          {q.text.length > 160 ? `${q.text.slice(0, 157)}…` : q.text}
                        </span>
                        <button
                          type="button"
                          aria-label="Edit queued message"
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-amber-200/90 hover:bg-amber-500/20"
                          onClick={() => {
                            editingQueueIdRef.current = q.id;
                            setEditingQueueId(q.id);
                            setEditingQueueText(q.text);
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <input
            ref={attachInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.go,.rs,.java,.kt,.swift,.cs,.cpp,.c,.h,.hpp,.rb,.php,.vue,.svelte,.css,.scss,.html,.json,.toml,.yaml,.yml,.md,.sql,.sh,.ps1,image/*,text/*,application/json"
            onChange={e => {
              void onPickCodeFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
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
              if (e.key === 'Enter' && !e.shiftKey) {
                if (Date.now() < ignoreEnterUntilRef.current) {
                  e.preventDefault();
                  return;
                }
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              pendingAttaches.length || Object.keys(chatStudioFiles).length
                ? 'Press Enter to read this, or type an ask…'
                : placeholder
            }
            rows={1}
            title="Enter to send · Shift+Enter for a new line · Ctrl+V pastes screenshots"
            aria-label="Message. Enter to send, Shift+Enter for a new line"
            className="w-full bg-transparent border-none resize-none text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none leading-5 min-h-[2.75rem] px-3 pt-2.5 pb-1"
            style={{ overflowY: 'hidden' }}
          />

          <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5 shrink-0 border-t border-transparent">
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
              onAction={handlePlusAction}
              buttonClassName="w-8 h-8 rounded-full flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0"
            />
            {composerMode ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium shrink-0 ${COMPOSER_MODE_PILL[composerMode]}`}
              >
                {COMPOSER_MODE_LABEL[composerMode]}
                <button
                  type="button"
                  onClick={() => setComposerMode(null)}
                  className="opacity-60 hover:opacity-100 -mr-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
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
                className="inline-flex items-center gap-1 max-w-[11rem] rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/25 transition-colors shrink-0"
                title={`Open in Explorer:\n${chatStudioDiskRoot}`}
              >
                <Folder className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                <span className="truncate">
                  {`bound: ${workspaceBadgeLabel || chatStudioDiskRoot.split(/[/\\]/).pop()}`}
                </span>
              </button>
            ) : null}
            {(mode === 'general' || mode === 'code') && (showStudioPills || codePillSticky || chatStudioDiskRoot) ? (
              <button
                type="button"
                onClick={() => openCodeWorkspace()}
                disabled={!chatStudioDiskRoot && Object.keys(chatStudioFiles).length === 0}
                className={`relative inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors shrink-0 ${
                  !chatStudioDiskRoot && Object.keys(chatStudioFiles).length === 0
                    ? 'border-violet-500/20 bg-violet-500/10 text-violet-100/40 cursor-not-allowed'
                    : 'border-violet-500/45 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30'
                }`}
                title={
                  generating
                    ? 'Code — Nova is writing files. Click to watch live.'
                    : 'Open Code. files on the left, editor on the right'
                }
                aria-label={generating ? 'Code — writing in progress' : 'Open Code'}
              >
                {generating && (codePillSticky || chatStudioDiskRoot || Object.keys(chatStudioFiles).length > 0) ? (
                  <span
                    className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-violet-300/40 animate-pulse"
                    aria-hidden
                  />
                ) : null}
                <Code2 className="w-3.5 h-3.5 text-violet-300 relative" />
                <span className="relative">Code</span>
              </button>
            ) : null}
            {(mode === 'general' || mode === 'code')
              && chatStudioDiskRoot
              && createJobLive?.status === 'npm'
              ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-100 shrink-0"
                title="Installing npm dependencies for this project"
              >
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inset-0 rounded-full bg-amber-300/50 animate-ping" />
                  <span className="relative h-2 w-2 rounded-full bg-amber-300" />
                </span>
                Installing…
              </span>
            ) : null}
            {(mode === 'general' || mode === 'code')
              && chatStudioDiskRoot
              && !generating
              && (
                createJobLive?.status === 'ready'
                || Boolean(previewUrl)
                // After Preview Ready reply, job may drop off the store — still offer Live.
                || (
                  createJobLive?.status !== 'writing'
                  && createJobLive?.status !== 'npm'
                  && Object.keys(chatStudioFiles).some((p) => /App\.(tsx|jsx)$/i.test(p) || /index\.html$/i.test(p))
                )
              )
              ? (
              <button
                type="button"
                onClick={() => void openProjectPreview()}
                className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-100 hover:bg-sky-500/25 transition-colors shrink-0"
                title={
                  createJobLive?.previewUrl
                    ? `Open Live (${createJobLive.previewUrl})`
                    : previewUrl
                      ? `Open Live (${previewUrl})`
                      : 'Open Live window'
                }
              >
                <Globe className="w-3.5 h-3.5 text-sky-300" />
                Live
              </button>
            ) : null}
            <div className="flex-1 min-w-0" aria-hidden />
            <div className="flex items-center gap-1.5 shrink-0">
              {mode !== 'voice' ? (
                <button
                  type="button"
                  onClick={() => toggleComposerDictation()}
                  disabled={generating && !dictating}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                    dictating
                      ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/50 animate-pulse'
                      : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                  } disabled:opacity-40`}
                  title={dictating ? 'Stop listening' : 'Speak — fill the chat box with voice-to-text'}
                  aria-label={dictating ? 'Stop listening' : 'Start voice to text'}
                  aria-pressed={dictating}
                >
                  {dictating ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              ) : null}
              {/* Chat: locked to Nova Multimodal (Auto). Image/video keep a picker. */}
              {mode === 'image' || mode === 'video' ? (
                <>
                  <button
                    ref={modelButtonRef}
                    type="button"
                    onClick={() => setModelMenuOpen(o => !o)}
                    className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-nova-navy-800 hover:bg-surface-hover px-2.5 py-1 text-xs text-content-primary transition-colors max-w-[11.5rem]"
                    title={`Active model · ${activeModel.name}`}
                    aria-label="Select model"
                    aria-expanded={modelMenuOpen}
                  >
                    {mode === 'image' ? (
                      <ImageIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    ) : (
                      <Video className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    )}
                    <span className="font-medium truncate">{activeModel.name}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-content-tertiary transition-transform shrink-0 ${modelMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {modelMenu}
                </>
              ) : (
                <div
                  className="inline-flex items-center rounded-full border border-surface-border bg-nova-navy-800 px-2.5 py-1 text-xs text-content-primary max-w-[12.5rem]"
                  title={
                    threadBrain
                      ? `Nova Multimodal · currently using ${autoEquippedCaption(threadBrain) || autoModelLabel}`
                      : 'Nova Multimodal · Auto picks the best chat or coder brain per turn'
                  }
                  aria-label="Nova Multimodal — automatic model routing"
                >
                  <span className="font-medium truncate">
                    {autoModelLabel === 'Multimodal' ? 'Multimodal' : autoModelLabel}
                  </span>
                </div>
              )}

              {generating && (
                <button
                  type="button"
                  onClick={handleStop}
                  className="flex items-center justify-center shrink-0 p-0.5 text-rose-500 hover:text-rose-400 transition-colors"
                  title="Stop generating"
                  aria-label="Stop generating"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>
              )}
            </div>
          </div>
          </div>
          </div>

          {(() => {
            const parts = generating ? stackedLiveTurnParts(liveTurnMs) : null;
            return (
              <div className="flex flex-col items-center justify-end shrink-0 self-end gap-1.5 w-[2rem] select-none pb-0.5">
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5 px-1">
        {capacity && !capacity.liveChat && (mode === 'general' || mode === 'code') && (
          <>
            <button
              type="button"
              onClick={() => setFreeKeyOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
              title={
                capacity.suggestedFreeKeys.length
                  ? `Try ${capacity.suggestedFreeKeys.map(k => k.name).join(', ')}`
                  : 'Connect a free key'
              }
            >
              Connect free key
            </button>
            <button
              type="button"
              onClick={() => navigate({ name: 'local-ai' })}
              className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
              title="Install a local GGUF brain"
            >
              Install local brain
            </button>
          </>
        )}
        {capacity && mode === 'image' && !capacity.imageFree && !capacity.openaiImage && (
          <button
            type="button"
            onClick={() => setFreeKeyOpen(true)}
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

        {(mode === 'general' || mode === 'code') && (!capacity || !capacity.liveChat) && (
          <>
            <button
              type="button"
              onClick={() => setGithubPickerOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] text-content-tertiary hover:text-content-secondary transition-colors"
              title="Pick a GitHub repo"
            >
              <Github className="w-3 h-3" />
              My GitHub
            </button>

            <button
              type="button"
              onClick={() => navigate({ name: 'build' })}
              className="inline-flex items-center gap-1.5 text-[11px] text-content-tertiary hover:text-content-secondary transition-colors"
            >
              <Puzzle className="w-3.5 h-3.5" strokeWidth={1.75} />
              {chatPlugins.length ? 'Manage plugins' : 'Add plugins'}
            </button>

            {mode === 'general' && (
              <button
                type="button"
                onClick={() => navigate({ name: 'projects' })}
                className="inline-flex items-center gap-1.5 text-[11px] text-content-tertiary hover:text-content-secondary transition-colors"
              >
                <Briefcase className="w-3.5 h-3.5" strokeWidth={1.75} />
                Open a project
              </button>
            )}
          </>
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
      {(mode === 'general' || mode === 'voice') ? <ChatModeTabs /> : null}
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
                    onClick={() => setFreeKeyOpen(true)}
                    className="rounded-full bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 px-3 py-1 text-[11px] font-medium transition-colors"
                  >
                    Connect free key
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'local-ai' })}
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
          <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 pb-16 w-full min-h-0">
            <h1 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight mb-3 text-center">
              {greeting}
            </h1>
            {capacity && !capacity.liveChat && engineInstallingModels.length > 0 && (
              <div className="mb-6 max-w-md w-full px-2">
                <RotatingTip />
              </div>
            )}
            {capacity && !capacity.liveChat && !engineInstallingModels.length && (
              <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
                <button
                  type="button"
                  onClick={() => setFreeKeyOpen(true)}
                  className="rounded-full bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 px-3.5 py-1.5 text-xs font-medium transition-colors"
                >
                  Connect free key
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'local-ai' })}
                  className="rounded-full bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 px-3.5 py-1.5 text-xs font-medium transition-colors"
                >
                  Install local brain
                </button>
              </div>
            )}
            <div className="w-full max-w-3xl">
              {composer}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col px-4 sm:px-8 pt-[min(12vh,5.5rem)] pb-4 min-h-0 overflow-hidden">
            <div className="shrink-0 flex flex-col items-center w-full max-w-3xl mx-auto">
              <h1 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight mb-8 text-center">
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
              className="flex-1 min-h-0 overflow-auto px-3 sm:px-5 lg:px-8 py-6 NOVA-scroll-quiet"
            >
            <div className="max-w-6xl mx-auto w-full space-y-5">
              {messages.length === 0 && showOpenThread && (
                <div className="text-center py-10 space-y-4">
                  <p className="text-sm text-content-secondary">
                    Type what to build.
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {FIRST_RUN_KIND_CHIPS.map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        className="text-[11px] rounded-full border border-sky-500/35 bg-sky-500/10 text-sky-200 px-3 py-1.5 hover:bg-sky-500/20 transition-colors"
                        onClick={() => tryStartTurn(chip.prompt)}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex gap-3 animate-fade-in w-full ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`text-sm text-content-primary min-w-0 ${
                      msg.role === 'user'
                        ? 'max-w-[min(48rem,88%)] min-w-0 break-words [overflow-wrap:anywhere] overflow-hidden flex flex-col items-end gap-1'
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
                          ? 'shrink-0 max-w-[min(56rem,94%)]'
                          // overflow-x-auto (not hidden) so 10+ list markers and long code stay visible
                          : 'max-w-[min(56rem,94%)] min-w-0 break-words [overflow-wrap:anywhere] overflow-x-auto'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <>
                        <div className="min-w-0 max-w-full rounded-xl px-3.5 py-2.5 bg-surface-hover text-[13px] leading-5 text-content-primary">
                          <MessageContent
                            content={msg.content}
                            live={false}
                            tone="user"
                            onPromptChipPick={(prompt) => tryStartTurn(prompt)}
                          />
                        </div>
                        {(() => {
                          const raw = String(msg.content || '').trim();
                          if (!raw) return null;
                          const copied = copiedMsgId === msg.id;
                          return (
                            <button
                              type="button"
                              title={copied ? 'Copied' : 'Copy prompt'}
                              aria-label={copied ? 'Copied' : 'Copy prompt'}
                              className="inline-flex items-center justify-center rounded-md p-1 text-content-tertiary/80 hover:text-content-secondary"
                              onClick={() => {
                                void navigator.clipboard.writeText(raw).then(() => {
                                  setCopiedMsgId(msg.id);
                                  window.setTimeout(() => {
                                    setCopiedMsgId(prev => (prev === msg.id ? null : prev));
                                  }, 1600);
                                }).catch(() => undefined);
                              }}
                            >
                              {copied ? <Check className="w-3.5 h-3.5 text-nova-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          );
                        })()}
                      </>
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
                            onAction={errorInfo.code === 'KEY_MISSING' ? () => setFreeKeyOpen(true) : undefined}
                          />
                        );
                      }
                      return (
                        <MessageContent
                          content={msg.content}
                          live={Boolean(generating && isLast && isAssistant && isTraceMessage(raw))}
                          messageId={msg.id}
                          onPromptChipPick={(prompt) => tryStartTurn(prompt)}
                        />
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
                      const timeBit = typeof msg.elapsed_ms === 'number' && msg.elapsed_ms >= 0
                        ? formatReplyElapsed(msg.elapsed_ms)
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
                              void navigator.clipboard.writeText(raw).then(() => {
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
                            title="Try again"
                            aria-label="Try again"
                            className={iconBtn}
                            disabled={generating}
                            onClick={() => {
                              if (generating) return;
                              regenerateReply?.(msg.id);
                            }}
                          >
                            <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            title="Share"
                            aria-label="Share response"
                            className={iconBtn}
                            onClick={() => {
                              void (async () => {
                                try {
                                  if (typeof navigator.share === 'function') {
                                    await navigator.share({ text: raw });
                                    return;
                                  }
                                } catch { /* fall through to clipboard */ }
                                try {
                                  await navigator.clipboard.writeText(raw);
                                  setCopiedMsgId(msg.id);
                                  window.setTimeout(() => {
                                    setCopiedMsgId(prev => (prev === msg.id ? null : prev));
                                  }, 1600);
                                } catch { /* ignore */ }
                              })();
                            }}
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
                        className="mt-2 text-[10px] rounded-full border border-sky-500/40 text-sky-300 px-2.5 py-1"
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
                        className="mt-2 text-[10px] rounded-full border border-emerald-500/40 text-emerald-200 px-2.5 py-1"
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
                          onClick={() => setGithubPickerOpen(true)}
                        >
                          Pick a repo
                        </button>
                      </div>
                    )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            </div>
            {showJumpToBottom ? (
              <button
                type="button"
                onClick={jumpToBottom}
                title="Jump to latest"
                aria-label="Jump to latest message"
                className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 h-8 w-8 rounded-full border border-white/10 bg-nova-navy-950/75 text-content-tertiary/80 hover:text-content-secondary hover:bg-nova-navy-900/95 hover:border-white/20 backdrop-blur-sm flex items-center justify-center opacity-55 hover:opacity-100 transition-opacity shadow-sm"
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
        onClose={() => setCodeOverlayOpen(false)}
        files={chatStudioFiles}
        readOnly={generating}
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
      <FreeKeyWizard
        open={freeKeyOpen}
        onClose={() => {
          setFreeKeyOpen(false);
          void probeLiveCapacity().then(setCapacity).catch(() => undefined);
        }}
        preferIds={capacity?.suggestedFreeKeys.map(k => k.id)}
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
