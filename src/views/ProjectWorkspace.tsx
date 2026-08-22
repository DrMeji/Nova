import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from '@/context/RouterContext';
import { useAuth } from '@/context/AuthContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { fetchProjects, saveChatMessage, updateProject } from '@/lib/api';
import type { Project, ChatMessage } from '@/types';
import {
  ChevronRight, FileCode, Folder, FolderOpen, FileText,
  Play, Square, CheckCircle2, Loader2, Bot, User as UserIcon,
  PanelLeft, PanelRight,
  Globe, Circle, ArrowUp, X, History, FilePlus2, FolderPlus,
  ChevronDown, Check, Cpu, Cloud, Zap, Search, GitBranch, Upload, Undo2, Smartphone,
} from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ArkErrorInline } from '@/components/ArkErrorInline';
import { BrandMark } from '@/components/BrandMark';
import { classifyErrorMessage, isLikelyErrorMessage } from '@/lib/errors';
import { openInSystemBrowser } from '@/lib/openExternal';
import {
  detectPluginIntent,
  getChatEnabledPlugins,
  getPluginRuntime,
  loadPluginState,
  runPluginAction,
} from '@/lib/plugins';
import { arkRoute, routerProviderLabel } from '@/lib/arkRouter';
import { buildRouterHistory, looksLikePromptEcho, looksLikeUserAskEcho } from '@/lib/chatHistory';
import {
  autoEquippedCaption,
  autoPillLabel,
  autoRingDetail,
  clearThreadBrain,
  loadThreadBrain,
  saveAutoThreadBrain,
  type ThreadBrain,
} from '@/lib/threadBrain';
import {
  loadProjectThread,
  mergeProjectThreads,
  parseProjectThread,
  PROJECT_CHAT_FILE,
  saveProjectThread,
  serializeProjectThread,
} from '@/lib/projectThread';
import { getLocalPrefs, hasProviderApiKey, setLocalPrefs } from '@/lib/localPrefs';
import { safeProjectWrite } from '@/lib/projectWriteSafe';
import { loadRecentProjects } from '@/lib/recentStore';
import { encodeChatAttach, folderNameFromPaths, isChatAttachMessage, looksLikeFolderPick } from '@/lib/chatAttach';
import { allowWindowFileDrop, dropHasFiles, resolveChatDrop } from '@/lib/chatDrop';
import { MessageContent } from '@/components/MediaMessage';
import {
  applyFileEdits,
  buildDoneSummary,
  classifyCodeTurnSize,
  buildProjectCodingPrompt,
  buildFileTreeFromPaths,
  BUILD_PROGRESS_STEPS,
  composePreviewHtml,
  editsFromWorkingHtml,
  extractStreamingFileEdits,
  extractStreamingHtml,
  extractChatStyleFileEdits,
  flattenProjectFiles,
  foldersToExpand,
  formatCodeChatReply,
  inferBuildLabel,
  parseClosedFileEdits,
  parseFileEdits,
  planFilesForBuild,
  rankFilesForTurnPack,
  fileContentLooksComplete,
  replyHasUnclosedFileBlock,
  scaffoldFallbackEdits,
  wantsProjectFileEdits,
  type BuildLiveStep,
} from '@/lib/projectCodeEdit';
import {
  finalizeWebEdits,
  isWebMicroAsk,
  prunePlaceholderJunk,
  touchesPreviewServing,
  webMicroAskEdits,
} from '@/lib/webProjectCanon';
import { classifyMobileTarget, inferMobileTargetFromFiles, isNativeMobileTree, looksLikeWebsiteBuild, needsMobileTargetChoice, WEBSITE_BUILD_MARK } from '@/lib/mobileTarget';
import { finalizeMobileEdits, formatNativeBuildReply, formatNativePushReply, preferredMobileFocus, simpleVisualPatchEdits, layoutLockEdits } from '@/lib/mobileTemplates';
import {
  classifyMobileDevice,
  classifyNamedDevice,
  deviceChipLabel,
  deviceLine,
  devicesForChips,
  isLayoutLockAsk,
  layoutLockPrompt,
  needsDeviceFamilyChoice,
  PHONE_DEVICES,
  resolveDevices,
  sizedBuildPrompt,
  type MobilePlatform,
  type PhoneDevice,
} from '@/lib/mobileDevices';
import { isCloudProviderEnabled } from '@/lib/cloudSources';
import { DevicePreview } from '@/components/DevicePreview';
import { WorkTrace, buildCodeTrace, buildInspectTrace } from '@/components/WorkTrace';
import { ComposerPlusMenu, type ComposerPlusAction } from '@/components/ComposerPlusMenu';
import { CodeEditor } from '@/components/CodeEditor';
import { fileTintClass, languageFromPath } from '@/lib/syntaxHighlight';
import { TokenUsageRing } from '@/components/TokenUsageRing';
import { estimateTokens, getTokenUsageRatio, resetTokenUsage, syncTokenUsage } from '@/lib/tokenUsage';
import { getModelHealthRatio, recordModelTurn } from '@/lib/modelHealth';
import { applyFilesInBatches, yieldFrame } from '@/lib/chunkedImport';
import { prepareBrainRotation } from '@/lib/modelRotation';
import { getEngineStatus, setEngineModel, engineGenerateCancel } from '@/lib/arkEngine';
import { honestNoLiveChatReply, probeLiveCapacity } from '@/lib/arkCapacity';
import { appendScaffoldHonesty } from '@/lib/codeBuildHonesty';
import {
  buildInspectPrompt,
  buildNamedPatchPrompt,
  describeProjectFromFiles,
  filterEditsToPaths,
  formatLocalFindings,
  isExplainAsk,
  isFindInFilesAsk,
  isImproveAsk,
  isPatchAsk,
  pathsMentionedInText,
  pickFilesForInspect,
  preferredEntryPath,
  parseReplyFindings,
  scanProjectFindings,
  searchInFiles,
  stripFileBlocks,
  wantsInspectOnly,
  wantsNamedPatch,
  type SearchHit,
} from '@/lib/projectInspect';
import { gitPush, gitCommit, gitStatus, gitClone, gitPull, githubCloneUrl, parseGithubRemote, formatGitReview, type GitStatus } from '@/lib/arkGitClient';
import {
  githubToken,
  needGithubWrite,
  repoNameFromProject,
  workflowCreateGitHubRepo,
  workflowOpenPullRequest,
} from '@/lib/codeGitHubWorkflow';
import { runCodeStudioCommand } from '@/lib/studioCommands';
import { StudioEmptyState } from '@/components/StudioEmptyState';
import { GitHubRepoPicker } from '@/components/GitHubRepoPicker';
import {
  getGitHubRepoAccess,
  type GitHubRepo,
  type TeamAccess,
} from '@/lib/github';

type CodeModel = {
  id: string;
  name: string;
  source: 'auto' | 'local' | 'cloud';
  detail: string;
};

const CODE_MODELS: CodeModel[] = [
  { id: 'ark-auto', name: 'ARK', source: 'auto', detail: 'Best coder · stays on for this project' },
];

const CLOUD_CODE_WHEN_KEYED: (CodeModel & { keyId: string })[] = [
  { id: 'groq-llama', name: 'Llama 3.3 70B', source: 'cloud', detail: 'Groq', keyId: 'groq' },
  { id: 'gemini-flash', name: 'Gemini 2.0 Flash', source: 'cloud', detail: 'Google', keyId: 'google' },
  { id: 'openrouter-free', name: 'OpenRouter', source: 'cloud', detail: 'Free routes', keyId: 'openrouter' },
  { id: 'gpt-4o', name: 'GPT-4o', source: 'cloud', detail: 'OpenAI', keyId: 'openai' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', source: 'cloud', detail: 'Anthropic', keyId: 'anthropic' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', source: 'cloud', detail: 'DeepSeek', keyId: 'deepseek' },
];

const COMPOSER_MODE_PREFIX: Record<'plan' | 'ask' | 'agent' | 'debug' | 'multitask', string> = {
  plan: 'Plan this out step by step, then we can build:\n\n',
  ask: '',
  agent: 'Agent mode — edit files and run approved tools in this workspace:\n\n',
  debug: 'Debug this — find the issue and propose a fix:\n\n',
  multitask: 'Break this into parallel tasks and tackle them clearly:\n\n',
};

type ProjectRow = Project & { id: string };

function emptyWorkspaceProject(userId: string, id = '', name = 'Code'): ProjectRow {
  return {
    id,
    user_id: userId,
    name,
    description: 'Local ARK code workspace',
    project_type: 'web',
    status: 'idle',
    build_status: 'idle',
    last_prompt: null,
    agent_state: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as ProjectRow;
}

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  language?: string;
}

const CODE_ROUTE_TIMEOUT_MS = 320_000;
const CODE_STALL_MS = 25_000;
const CODE_FIRST_TOKEN_MS = 45_000;
const BUILD_STEP_ORDER: BuildLiveStep[] = ['understand', 'plan', 'generate', 'apply', 'done'];

function packDiskFiles(files: Record<string, string>, messages?: ChatMessage[]) {
  const payloadFiles: Record<string, string> = { ...flattenProjectFiles(files) };
  delete payloadFiles[PROJECT_CHAT_FILE];
  delete payloadFiles['ark-meta.json'];
  if (messages?.some(m => String(m.content || '').trim())) {
    payloadFiles[PROJECT_CHAT_FILE] = serializeProjectThread(messages);
  }
  return payloadFiles;
}

function preferredLiveEditPath(paths: string[]): string | undefined {
  const skip = /\.(pbxproj|plist)$|Assets\.xcassets|\.xcodeproj\//;
  const live = paths.filter(p => !skip.test(p));
  return live.find(p => /ContentView\.swift$|MainActivity\.kt$/i.test(p))
    || live.find(p => /\.(swift|kt)$/i.test(p))
    || live.find(p => /\.(tsx|jsx|css|html|py|ts|js)$/i.test(p) && !/ark-preview/i.test(p))
    || live.find(p => /ark-preview\.html$/i.test(p))
    || live[0]
    || paths[0];
}

function defaultCodeModel(): CodeModel {
  const prefs = getLocalPrefs();
  const pref = prefs.defaultCodeModelId || prefs.defaultModelId;
  if (!pref || pref === 'ark-auto') return CODE_MODELS[0];
  const cloud = CLOUD_CODE_WHEN_KEYED.find(m => m.id === pref);
  if (cloud && hasProviderApiKey(cloud.keyId)) return cloud;
  return { id: pref, name: pref, source: 'local', detail: 'Local · Settings default' };
}

function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function renderChatMarkup(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i} className="font-semibold text-content-primary">{bold[1]}</strong>;
    return <span key={i}>{part}</span>;
  });
}

function AssistantBuildReply({
  content,
  onOpenPath,
}: {
  content: string;
  onOpenPath?: (path: string, line?: number) => void;
}) {
  const match = content.match(/^(.*?)\n\nWorked for (.+)\s*$/s);
  const body = stripFileBlocks(match ? match[1] : content).trim();
  const worked = match?.[2]?.trim() || null;
  const findings = onOpenPath ? parseReplyFindings(body) : [];
  const display = body.length > 900 || /```|@@@FILE|background-color\s*:/i.test(body)
    ? body.slice(0, 280).replace(/\s+\S*$/, '') + '…'
    : body;
  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap leading-relaxed">{renderChatMarkup(display)}</p>
      {findings.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {findings.map(f => (
            <button
              key={`${f.path}:${f.line || 0}`}
              type="button"
              onClick={() => onOpenPath?.(f.path, f.line)}
              className="text-[10px] rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-200 hover:bg-sky-500/20"
            >
              {f.path}{f.line ? `:${f.line}` : ''}
            </button>
          ))}
        </div>
      )}
      {worked && (
        <p className="text-[11px] text-content-tertiary">Worked for {worked}</p>
      )}
    </div>
  );
}

function BuildProgressBubble({
  label,
  step,
  plannedFiles,
  startedAt,
  kind,
  focusFile,
}: {
  label: string;
  step: BuildLiveStep;
  plannedFiles: string[];
  startedAt: number;
  kind?: 'build' | 'inspect' | 'fix';
  focusFile?: string;
}) {
  const reading = kind === 'inspect';
  const fixing = kind === 'fix';
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - startedAt);
  const title = step === 'done'
    ? (reading ? `Reviewed ${label}` : fixing ? `Updated ${label}` : `Built ${label}`)
    : (reading ? `Reviewing ${label}` : fixing ? `Fixing ${label}` : `Building ${label}`);
  const traceItems = reading
    ? buildInspectTrace(step, plannedFiles, focusFile)
    : buildCodeTrace(step, plannedFiles, focusFile, fixing ? 'fix' : 'build');

  useEffect(() => {
    if (step === 'done') {
      setElapsedMs(Date.now() - startedAt);
      return;
    }
    const tick = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);
    return () => window.clearInterval(tick);
  }, [startedAt, step]);

  return (
    <WorkTrace
      title={title}
      elapsed={formatElapsed(elapsedMs)}
      items={traceItems}
    />
  );
}

function ResizeHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    lastX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    if (dx !== 0) onDrag(dx);
  };

  const onPointerUp = () => {
    dragging.current = false;
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-sky-500/30 active:bg-sky-500/50 transition-colors relative group"
      title="Drag to resize"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}

export function ProjectWorkspace() {
  const { route, navigate } = useRouter();
  const { user } = useAuth();
  const { touchRecentProject, addRecent } = useRecentProjects();
  const projectId = route.name === 'project' ? route.id : '';
  const isFreshCode = route.name === 'code';
  const codeSession = route.name === 'code' ? (route.session || 'new') : '';
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatPlugins, setChatPlugins] = useState(() => getChatEnabledPlugins(loadPluginState()));
  const [chatInput, setChatInput] = useState('');
  const [composerMode, setComposerMode] = useState<'plan' | 'ask' | 'agent' | 'debug' | 'multitask' | null>(null);
  const [composerTall, setComposerTall] = useState(false);
  const [tokenRatio, setTokenRatio] = useState(0);
  const [modelRatio, setModelRatio] = useState(0);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachProgressLabel, setAttachProgressLabel] = useState('');
  const [activeModel, setActiveModel] = useState<CodeModel>(() => defaultCodeModel());
  const [threadBrain, setThreadBrain] = useState<ThreadBrain | null>(null);
  const threadBrainRef = useRef<ThreadBrain | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const [localModels, setLocalModels] = useState<CodeModel[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [expandedFolders, setExpandedFolders] = useState(new Set<string>());
  const [buildRunning, setBuildRunning] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [explorerOpen, setExplorerOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 900);
  const [codeOpen, setCodeOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 900);
  const [explorerWidth, setExplorerWidth] = useState(220);
  const [codeWidth, setCodeWidth] = useState(380);
  const [buildLive, setBuildLive] = useState<{
    assistantId: string;
    label: string;
    step: BuildLiveStep;
    plannedFiles: string[];
    startedAt: number;
    kind?: 'build' | 'inspect' | 'fix';
    focusFile?: string;
  } | null>(null);
  const [attachedImages, setAttachedImages] = useState<{ id: string; url: string; name: string }[]>([]);
  const [changesOpen, setChangesOpen] = useState(false);
  const [fileChanges, setFileChanges] = useState<{ path: string; added: number; removed: number }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [runHistory, setRunHistory] = useState<{ id: string; title: string; at: string; steps: string }[]>([]);
  const [sandboxNote, setSandboxNote] = useState<string | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [rightTab, setRightTab] = useState<'code' | 'preview'>('code');
  const [fileFlash, setFileFlash] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [creating, setCreating] = useState<null | { kind: 'file' | 'folder'; parentPath: string }>(null);
  const [createName, setCreateName] = useState('');
  const [diskRoot, setDiskRoot] = useState<string | null>(null);
  const [workspaceInPlace, setWorkspaceInPlace] = useState(false);
  const [githubMenuOpen, setGithubMenuOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findHits, setFindHits] = useState<SearchHit[]>([]);
  const [findTotal, setFindTotal] = useState(0);
  const [gitInfo, setGitInfo] = useState<GitStatus | null>(null);
  const [gitBusy, setGitBusy] = useState(false);
  const [githubPickerOpen, setGithubPickerOpen] = useState(false);
  const [myAccess, setMyAccess] = useState<TeamAccess>('full');
  const [jumpLine, setJumpLine] = useState(0);
  const [fileFindOpen, setFileFindOpen] = useState(false);
  const [fileFind, setFileFind] = useState('');
  const [undoReady, setUndoReady] = useState(false);
  const [inspectOfferId, setInspectOfferId] = useState<string | null>(null);
  const [shipOfferId, setShipOfferId] = useState<string | null>(null);
  const [mobileOfferId, setMobileOfferId] = useState<string | null>(null);
  const [mobileOfferPrompt, setMobileOfferPrompt] = useState('');
  const [mobileOfferStep, setMobileOfferStep] = useState<'platform' | 'family'>('platform');
  const [familyPlatform, setFamilyPlatform] = useState<MobilePlatform | null>(null);
  const [previewDevice, setPreviewDevice] = useState<PhoneDevice | null>(null);
  const [deviceOfferId, setDeviceOfferId] = useState<string | null>(null);
  const [reviseUserMsgId, setReviseUserMsgId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [revertPrompt, setRevertPrompt] = useState<{ userId: string; content: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const codeFileInputRef = useRef<HTMLInputElement>(null);
  const codeFolderInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const codeEditorRef = useRef<HTMLTextAreaElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const streamDraftRef = useRef('');
  const buildAbortRef = useRef<{ abort: () => void } | null>(null);
  const fileContentsRef = useRef(fileContents);
  const fileTreeRef = useRef(fileTree);
  const skipHydrateRef = useRef(false);
  const typeTimerRef = useRef<number | undefined>(undefined);
  const messagesRef = useRef<ChatMessage[]>([]);
  const runIdRef = useRef(0);
  const lastInspectPathsRef = useRef<string[]>([]);
  const ignoreEnterUntilRef = useRef(0);
  const undoSnapshotRef = useRef<Record<string, string> | null>(null);
  const previewDeviceRef = useRef<PhoneDevice | null>(null);
  fileContentsRef.current = fileContents;
  fileTreeRef.current = fileTree;
  messagesRef.current = messages;
  previewDeviceRef.current = previewDevice;

  const applyProjectFiles = useCallback((files: Record<string, string>) => {
    const mapped: Record<string, string> = {};
    for (const [rel, content] of Object.entries(files)) {
      const norm = rel.replace(/\\/g, '/');
      const base = norm.includes('/') ? norm.split('/').pop()! : norm;
      if (base === PROJECT_CHAT_FILE || base === 'ark-meta.json') continue;
      mapped[norm] = content;
    }
    const cleaned = prunePlaceholderJunk(mapped);
    const tree = buildFileTreeFromPaths(cleaned);
    fileContentsRef.current = cleaned;
    fileTreeRef.current = tree;
    setFileContents(cleaned);
    setFileTree(tree);
    setExplorerOpen(true);
    setCodeOpen(true);
    setExpandedFolders(prev => {
      const next = new Set(prev);
      Object.keys(cleaned).forEach(p => foldersToExpand([p]).forEach(f => next.add(f)));
      return next;
    });
    const entry = preferredEntryPath(cleaned);
    if (entry) {
      setSelectedFile(entry);
      setRightTab('code');
    }
  }, []);

  /** Pace large imports — only touch React state once at the end (tree rebuild is expensive). */
  const applyProjectFilesPaced = useCallback(async (files: Record<string, string>) => {
    const count = Object.keys(files).length;
    if (count <= 40) {
      applyProjectFiles(files);
      return;
    }
    await applyFilesInBatches(files, (accumulated, done, total) => {
      if (done < total) {
        setAttachProgressLabel(`Loading files ${done}/${total}`);
        return;
      }
      applyProjectFiles(accumulated);
    }, {
      onProgress: (p) => {
        if (p.phase === 'apply') {
          setAttachProgressLabel(p.label || `Loading ${p.done}/${p.total}`);
        }
      },
    });
  }, [applyProjectFiles]);

  const refreshGit = useCallback(async (id?: string) => {
    const pid = id || projectId;
    if (!pid || !window.arkDesktop?.gitStatus) return;
    try {
      const st = await gitStatus(pid);
      setGitInfo(st);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  const canEdit = myAccess !== 'read';

  const postAssistantNote = useCallback((text: string, offerPrompts = false) => {
    const uid = user?.id ?? 'guest';
    const pid = project?.id || projectId || '';
    const note: ChatMessage = {
      id: crypto.randomUUID(),
      user_id: uid,
      project_id: pid,
      role: 'assistant',
      content: text,
      provider_used: 'ARK',
      created_at: new Date().toISOString(),
    };
    setMessages(prev => {
      const next = [...prev, note];
      messagesRef.current = next;
      if (pid) saveProjectThread(pid, next);
      return next;
    });
    if (offerPrompts) setInspectOfferId(note.id);
  }, [project?.id, projectId, user?.id]);

  /** User folder/file card in the thread + assistant “what next?” */
  const postAttachInChat = useCallback((
    attachContent: string,
    assistantText: string,
    offerPrompts = true,
  ) => {
    const uid = user?.id ?? 'guest';
    const pid = project?.id || projectId || '';
    const attach: ChatMessage = {
      id: crypto.randomUUID(),
      user_id: uid,
      project_id: pid,
      role: 'user',
      content: attachContent,
      provider_used: null,
      created_at: new Date().toISOString(),
    };
    const note: ChatMessage = {
      id: crypto.randomUUID(),
      user_id: uid,
      project_id: pid,
      role: 'assistant',
      content: assistantText,
      provider_used: 'ARK',
      created_at: new Date().toISOString(),
    };
    setMessages(prev => {
      const next = [...prev, attach, note];
      messagesRef.current = next;
      if (pid) saveProjectThread(pid, next);
      return next;
    });
    if (offerPrompts) setInspectOfferId(note.id);
  }, [project?.id, projectId, user?.id]);

  const refreshLivePreview = useCallback(async (
    files?: Record<string, string>,
    device?: PhoneDevice | null,
  ) => {
    const pid = project?.id || projectId;
    if (!pid || !window.arkDesktop?.previewStart) return;
    const nextFiles = files || fileContentsRef.current;
    const native = isNativeMobileTree(nextFiles);
    const payloadFiles = packDiskFiles(nextFiles, messagesRef.current);
    const composed = composePreviewHtml(nextFiles);
    if (!payloadFiles['index.html'] && composed) payloadFiles['index.html'] = composed;
    if (!payloadFiles['index.html'] && payloadFiles['ark-preview.html']) {
      payloadFiles['index.html'] = payloadFiles['ark-preview.html'];
    }
    const res = await window.arkDesktop.previewStart({
      projectId: pid,
      projectName: project?.name,
      files: payloadFiles,
    });
    if (!res?.url) return;
    const bust = `${res.url}${res.url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    setLivePreviewUrl(bust);
    setPreviewUrl(bust);
    setPreviewReady(true);
    const d = device
      ?? previewDeviceRef.current
      ?? (native
        ? (resolveDevices(inferMobileTargetFromFiles(nextFiles) || 'ios', '').ios || null)
        : null);
    if (d) {
      previewDeviceRef.current = d;
      setPreviewDevice(d);
    }
    if (window.arkDesktop.previewOpenWindow) {
      await window.arkDesktop.previewOpenWindow({
        projectId: pid,
        url: bust,
        title: d ? `${d.label} · ${d.width}×${d.height}` : `${project?.name || 'ARK'} preview`,
        kind: native && d ? 'device' : 'web',
        device: d
          ? { label: d.label, width: d.width, height: d.height, family: d.family }
          : undefined,
      });
    }
  }, [project?.id, project?.name, projectId]);

  const applyWorkspaceEdits = useCallback((edits: { path: string; content: string }[]) => {
    if (!canEdit || !edits.length) return { changedPaths: [] as string[] };
    undoSnapshotRef.current = { ...fileContentsRef.current };
    setUndoReady(true);
    const applied = applyFileEdits(fileContentsRef.current, fileTreeRef.current, edits);
    fileContentsRef.current = applied.files;
    fileTreeRef.current = applied.tree.length ? applied.tree : buildFileTreeFromPaths(applied.files);
    setFileContents(applied.files);
    setFileTree(fileTreeRef.current);
    setFileChanges(prev => {
      const map = new Map(prev.map(f => [f.path, f]));
      for (const d of applied.fileDiffs) {
        const cur = map.get(d.path);
        map.set(d.path, {
          path: d.path,
          added: (cur?.added || 0) + d.added,
          removed: (cur?.removed || 0) + d.removed,
        });
      }
      return [...map.values()];
    });
    setExpandedFolders(prev => {
      const next = new Set(prev);
      foldersToExpand(applied.changedPaths).forEach(p => next.add(p));
      return next;
    });
    const focus = preferredLiveEditPath(applied.changedPaths) || preferredMobileFocus(applied.changedPaths);
    if (focus) {
      setSelectedFile(focus);
      setRightTab('code');
      setCodeOpen(true);
    }
    const pid = project?.id || projectId;
    if (pid) {
      void safeProjectWrite({
        projectId: pid,
        projectName: project?.name,
        files: packDiskFiles(applied.files, messagesRef.current),
      }).then(res => {
        if (res.root) setDiskRoot(res.root);
        setWorkspaceInPlace(Boolean(res.meta && (res.meta as { inPlace?: boolean }).inPlace));
        if (res.sandboxBlocked?.length) {
          const note = `Sandbox blocked ${res.sandboxBlocked.length} path(s): ${res.sandboxBlocked.slice(0, 3).join(', ')}`;
          setSandboxNote(note);
          postAssistantNote(note);
        }
      });
    }
    void refreshLivePreview(applied.files);
    return { changedPaths: applied.changedPaths, files: applied.files };
  }, [canEdit, project?.id, project?.name, projectId, refreshLivePreview]);

  const openPathInEditor = useCallback((path: string, line?: number) => {
    const flat = fileContentsRef.current;
    const hit = flat[path]
      ? path
      : Object.keys(flat).find(k => k.endsWith(`/${path}`) || k === path) || path;
    setSelectedFile(hit);
    setExpandedFolders(prev => {
      const next = new Set(prev);
      foldersToExpand([hit]).forEach(p => next.add(p));
      return next;
    });
    setRightTab('code');
    setCodeOpen(true);
    setJumpLine(line || 1);
  }, []);

  const undoLastEdit = () => {
    const snap = undoSnapshotRef.current;
    if (!snap) return;
    applyProjectFiles(snap);
    undoSnapshotRef.current = null;
    setUndoReady(false);
  };

  const findNextInFile = () => {
    const q = fileFind.trim().toLowerCase();
    if (!q || !selectedFile) return;
    const body = fileContentsRef.current[selectedFile] || '';
    const lines = body.split('\n');
    const start = jumpLine || 0;
    const idx = lines.findIndex((line, i) => i >= start && line.toLowerCase().includes(q));
    const wrap = idx < 0 ? lines.findIndex(line => line.toLowerCase().includes(q)) : idx;
    if (wrap >= 0) setJumpLine(wrap + 1);
  };

  useEffect(() => {
    const remote = gitInfo?.remote || '';
    const parsed = parseGithubRemote(remote);
    const token = getPluginRuntime('github', loadPluginState()).token?.trim();
    if (!parsed || !token) {
      setMyAccess('full');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const mine = await getGitHubRepoAccess(token, parsed.owner, parsed.repo);
        if (!cancelled) setMyAccess(mine.access);
      } catch {
        if (!cancelled) setMyAccess('read');
      }
    })();
    return () => { cancelled = true; };
  }, [gitInfo?.remote]);
  const [previewUrl, setPreviewUrl] = useState('http://127.0.0.1:0');
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setThreadBrain(null);
      return;
    }
    setThreadBrain(loadThreadBrain(projectId, 'coding'));
  }, [projectId]);

  useEffect(() => {
    threadBrainRef.current = threadBrain;
  }, [threadBrain]);

  useEffect(() => {
    if (!projectId) return;
    setTokenRatio(getTokenUsageRatio(projectId));
    setModelRatio(getModelHealthRatio(projectId));
  }, [projectId]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const apply = () => {
      if (mq.matches) {
        setExplorerOpen(false);
        setCodeOpen(false);
      }
    };
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getEngineStatus().then(status => {
      if (cancelled) return;
      const installed = (status.models || [])
        .filter(m => m.status === 'ready')
        .map(m => ({
          id: m.id,
          name: m.name || m.id,
          source: 'local' as const,
          detail: m.detail || 'Local GGUF',
        }));
      setLocalModels(installed);
      setActiveModel(prev => {
        if (prev.source !== 'local' || prev.id === 'ark-auto') return prev;
        const hit = installed.find(m => m.id === prev.id);
        return hit || prev;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const place = () => {
      const btn = modelButtonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setMenuPos({ left: r.left + r.width / 2, bottom: window.innerHeight - r.top + 8 });
    };
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (modelButtonRef.current?.contains(t) || modelMenuRef.current?.contains(t)) return;
      setModelMenuOpen(false);
    };
    window.addEventListener('resize', place);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('mousedown', onDown);
    };
  }, [modelMenuOpen]);

  const codeModelOptions = useMemo(() => {
    const keyed = CLOUD_CODE_WHEN_KEYED.filter(
      m => hasProviderApiKey(m.keyId) && isCloudProviderEnabled(m.keyId),
    );
    return [...CODE_MODELS, ...localModels, ...keyed];
  }, [localModels]);

  useEffect(() => {
    if (!projectId) return;
    try {
      const draft = localStorage.getItem(`ark:project-draft:${projectId}`);
      if (draft) {
        setChatInput(draft);
        localStorage.removeItem(`ark:project-draft:${projectId}`);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    if (isFreshCode) {
      runIdRef.current += 1;
      buildAbortRef.current?.abort();
      buildAbortRef.current = null;
      setMessages([]);
      messagesRef.current = [];
      setFileContents({});
      fileContentsRef.current = {};
      setFileTree([]);
      fileTreeRef.current = [];
      setSelectedFile('');
      setBuildLive(null);
      setPreviewReady(false);
      setLivePreviewUrl(null);
      setDiskRoot(null);
      setEditingUserId(null);
      setReviseUserMsgId(null);
      setRevertPrompt(null);
      setProject(emptyWorkspaceProject(user?.id ?? 'guest'));
      return;
    }
    if (!projectId) return;
    if (skipHydrateRef.current) {
      skipHydrateRef.current = false;
      return;
    }

    const cached = loadProjectThread(projectId);
    setMessages(cached);
    messagesRef.current = cached;
    setFileContents({});
    fileContentsRef.current = {};
    setFileTree([]);
    fileTreeRef.current = [];
    setSelectedFile('');
    setBuildLive(null);
    setPreviewReady(false);
    setLivePreviewUrl(null);
    setEditingUserId(null);
    setRevertPrompt(null);

    const recent = loadRecentProjects().find(p => p.id === projectId);
    const fallbackName = recent?.name
      || (projectId.startsWith('demo-')
        ? projectId.replace(/^demo-/, '').split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
        : 'Code project');

    if (projectId.startsWith('demo-') || projectId.startsWith('proj-')) {
      setProject(emptyWorkspaceProject(user?.id ?? 'guest', projectId, fallbackName));
      return;
    }

    let cancelled = false;
    fetchProjects()
      .then(data => {
        if (cancelled) return;
        const found = (data as ProjectRow[]).find(p => p.id === projectId);
        setProject(found || emptyWorkspaceProject(user?.id ?? 'guest', projectId, fallbackName));
      })
      .catch(() => {
        if (!cancelled) setProject(emptyWorkspaceProject(user?.id ?? 'guest', projectId, fallbackName));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, isFreshCode, codeSession, user?.id]);

  useEffect(() => {
    if (!projectId) return;
    if (!messages.length) return;
    saveProjectThread(projectId, messages);
  }, [messages, projectId]);

  // Seed files dropped from Chat (code uploads)
  useEffect(() => {
    if (!projectId) return;
    try {
      const raw = localStorage.getItem(`ark:project-seed-files:${projectId}`);
      if (!raw) return;
      localStorage.removeItem(`ark:project-seed-files:${projectId}`);
      const files = JSON.parse(raw) as Record<string, string>;
      if (!files || typeof files !== 'object') return;
      setFileContents(prev => {
        const next = { ...prev };
        const treeExtra: FileNode[] = [];
        for (const [name, content] of Object.entries(files)) {
          if (typeof content !== 'string') continue;
          const rel = name.includes('/') ? name : `src/${name}`;
          next[rel] = content;
          next[name] = content;
          treeExtra.push({
            name: name.includes('/') ? name.split('/').pop()! : name,
            type: 'file',
            language: name.split('.').pop(),
          });
        }
        if (treeExtra.length) {
          setFileTree(prevTree => {
            const clone = structuredClone(prevTree);
            const src = clone.find(n => n.name === 'src' && n.type === 'folder');
            if (src?.children) {
              for (const f of treeExtra) {
                if (!src.children.some(c => c.name === f.name)) src.children.push(f);
              }
            }
            return clone.length ? clone : buildFileTreeFromPaths(next);
          });
          const first = Object.keys(files)[0];
          if (first) setSelectedFile(first.includes('/') ? first : `src/${first}`);
        }
        return next;
      });
    } catch {
      /* ignore */
    }
  }, [projectId]);

  // Load / persist project files on disk (ARK userData/ark-projects)
  useEffect(() => {
    if (!projectId || !window.arkDesktop?.projectRead) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await window.arkDesktop!.projectRead!(projectId);
        if (cancelled) return;
        if (res.root) setDiskRoot(res.root);
        setWorkspaceInPlace(Boolean(res.meta && (res.meta as { inPlace?: boolean }).inPlace));
        const mapped: Record<string, string> = {};
        let diskChat: ChatMessage[] = [];
        if (res.ok && res.files) {
          for (const [rel, content] of Object.entries(res.files)) {
            const base = rel.includes('/') ? rel.split('/').pop()! : rel;
            if (base === PROJECT_CHAT_FILE) {
              diskChat = parseProjectThread(content);
              continue;
            }
            if (base === 'ark-meta.json') continue;
            mapped[rel.replace(/\\/g, '/')] = content;
          }
        }
        if (Object.keys(mapped).length > 0) {
          applyProjectFiles(mapped);
        }
        void refreshGit(projectId);
        if (diskChat.length && !skipHydrateRef.current) {
          const local = loadProjectThread(projectId);
          const best = mergeProjectThreads(local, diskChat);
          if (best.length && (
            messagesRef.current.length === 0 || best.length > messagesRef.current.length
          )) {
            setMessages(best);
            messagesRef.current = best;
            saveProjectThread(projectId, best);
          }
        } else if (
          !skipHydrateRef.current
          && messagesRef.current.length === 0
          && Object.keys(mapped).length > 0
        ) {
          const name = loadRecentProjects().find(p => p.id === projectId)?.name || 'Project';
          const fileCount = Object.keys(mapped).length;
          const attachId = `local-attach-${projectId}`;
          const noteId = `local-asst-${projectId}`;
          const seeded: ChatMessage[] = [
            {
              id: attachId,
              user_id: user?.id ?? 'guest',
              project_id: projectId,
              role: 'user',
              content: encodeChatAttach({ kind: 'folder', name, count: fileCount, projectId }),
              provider_used: null,
              created_at: new Date().toISOString(),
            },
            {
              id: noteId,
              user_id: user?.id ?? 'guest',
              project_id: projectId,
              role: 'assistant',
              content: [
                `Got **${name}** — ${fileCount} file${fileCount === 1 ? '' : 's'} are in Explorer.`,
                '',
                'What should I do with it? Pick a prompt below, or type your own.',
              ].join('\n'),
              provider_used: 'ARK',
              created_at: new Date().toISOString(),
            },
          ];
          setMessages(seeded);
          messagesRef.current = seeded;
          saveProjectThread(projectId, seeded);
          setInspectOfferId(noteId);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, applyProjectFiles, refreshGit]);

  useEffect(() => {
    if (!project?.id) return;
    const t = window.setTimeout(() => {
      const payloadFiles = packDiskFiles(fileContents, messagesRef.current);
      if (!Object.keys(payloadFiles).length) return;
      void safeProjectWrite({
        projectId: project.id,
        projectName: project.name,
        files: payloadFiles,
      }).then(res => {
        if (res.root) setDiskRoot(res.root);
        setWorkspaceInPlace(Boolean(res.meta && (res.meta as { inPlace?: boolean }).inPlace));
      });
    }, 800);
    return () => window.clearTimeout(t);
  }, [fileContents, project]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, buildLive]);

  useEffect(() => {
    const refresh = () => setChatPlugins(getChatEnabledPlugins(loadPluginState()));
    refresh();
    window.addEventListener('ark:plugins-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('ark:plugins-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    if (!findOpen) return;
    const q = findQuery.trim();
    if (!q) {
      setFindHits([]);
      setFindTotal(0);
      return;
    }
    const t = window.setTimeout(() => {
      const found = searchInFiles(fileContentsRef.current, q, 40);
      setFindHits(found.hits);
      setFindTotal(found.total);
    }, 160);
    return () => window.clearTimeout(t);
  }, [findQuery, findOpen, fileContents]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'f') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !findOpen) {
        /* keep typing in composer; still open explorer find when in Code */
      }
      e.preventDefault();
      setFindOpen(true);
      setExplorerOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [findOpen]);

  useEffect(() => {
    if (!projectId) return;
    void refreshGit(projectId);
    const t = window.setInterval(() => void refreshGit(projectId), 12_000);
    return () => window.clearInterval(t);
  }, [projectId, refreshGit]);

  const openProjectFolder = async (sourceDir?: string, mode: 'in-place' | 'import' = 'in-place') => {
    const uid = user?.id ?? 'guest';
    let active = project;
    let pid = project?.id || projectId;
    if (!pid) {
      const created = addRecent('Code');
      pid = created.id;
      skipHydrateRef.current = true;
      active = emptyWorkspaceProject(uid, created.id, created.name);
      setProject(active);
      navigate({ name: 'project', id: created.id });
    }
    const applyOpened = async (
      files: Record<string, string>,
      opts: {
        name?: string;
        root?: string;
        inPlace?: boolean;
        skipped?: { env?: number; large?: number; binary?: number; limit?: number };
      },
    ) => {
      await applyProjectFilesPaced(files);
      const count = Object.keys(files).length;
      if (opts.name) touchRecentProject(pid, opts.name);
      if (opts.root) {
        setDiskRoot(opts.root);
        setWorkspaceInPlace(Boolean(opts.inPlace));
      }
      const skipBits: string[] = [];
      const skipped = opts.skipped;
      if (skipped?.env) skipBits.push(`${skipped.env} secret .env file${skipped.env === 1 ? '' : 's'}`);
      if (skipped?.large) skipBits.push(`${skipped.large} large file${skipped.large === 1 ? '' : 's'}`);
      if (skipped?.binary) skipBits.push(`${skipped.binary} binary file${skipped.binary === 1 ? '' : 's'}`);
      if (skipped?.limit) skipBits.push('import limit reached');
      const skipNote = skipBits.length ? ` Skipped: ${skipBits.join(', ')}.` : '';
      const folderLabel = opts.name || 'folder';
      const firstPath = Object.keys(files)[0];
      if (firstPath) {
        setSelectedFile(firstPath);
        setExplorerOpen(true);
        setRightTab('code');
      }
      if (!count) {
        postAssistantNote(`That folder opened, but I could not read any text files from it.${skipNote}`);
        return;
      }
      resetTokenUsage(pid);
      setTokenRatio(0);
      setModelRatio(getModelHealthRatio(pid));
      const pathLine = opts.inPlace && opts.root
        ? `Opened **${folderLabel}** at \`${opts.root}\` (${count} source files). Editing on disk.${skipNote}`
        : `Imported **${folderLabel}** (${count} files) into ARK.${skipNote}`;
      postAttachInChat(
        encodeChatAttach({ kind: 'folder', name: folderLabel, count, projectId: pid }),
        [
          pathLine,
          '',
          'What should I do? Debug, explain what this app is, find problems — or describe a change.',
        ].join('\n'),
        true,
      );
      ignoreEnterUntilRef.current = Date.now() + 600;
    };
    const openApi = mode === 'import'
      ? window.arkDesktop?.projectImportFolder
      : window.arkDesktop?.workspaceOpenRoot;
    if (!openApi) {
      codeFolderInputRef.current?.click();
      return;
    }
    setAttachBusy(true);
    setAttachProgressLabel(mode === 'import' ? 'Importing folder…' : 'Opening folder…');
    const onProg = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { label?: string; done?: number; total?: number } | undefined;
      if (d?.label) setAttachProgressLabel(d.label);
      else if (d?.total) setAttachProgressLabel(`Reading ${d.done || 0}/${d.total}`);
    };
    window.addEventListener('ark:project-import-progress', onProg);
    try {
      const res = await openApi({
        projectId: pid,
        projectName: active?.name || project?.name,
        ...(sourceDir ? { sourceDir } : {}),
      });
      if (!res?.ok || res.canceled) {
        if (!res?.canceled && !sourceDir) codeFolderInputRef.current?.click();
        return;
      }
      if (res.root) setDiskRoot(res.root);
      setWorkspaceInPlace(Boolean((res as { inPlace?: boolean }).inPlace));
      setAttachProgressLabel('Loading into Explorer…');
      if (res.files && Object.keys(res.files).length) {
        await applyOpened(res.files, {
          name: res.name,
          root: res.root,
          inPlace: (res as { inPlace?: boolean }).inPlace,
          skipped: (res as { skipped?: { env?: number; large?: number; binary?: number; limit?: number } }).skipped,
        });
      } else {
        const read = await window.arkDesktop?.projectRead?.(pid);
        if (read?.files && Object.keys(read.files).length) {
          await applyOpened(read.files, {
            name: res.name,
            root: read.root,
            inPlace: Boolean(read.meta && (read.meta as { inPlace?: boolean }).inPlace),
            skipped: (res as { skipped?: { env?: number; large?: number; binary?: number; limit?: number } }).skipped,
          });
        } else if (!sourceDir) {
          codeFolderInputRef.current?.click();
        }
        if (read?.root) {
          setDiskRoot(read.root);
          setWorkspaceInPlace(Boolean(read.meta && (read.meta as { inPlace?: boolean }).inPlace));
        }
      }
      void refreshGit(pid);
    } finally {
      window.removeEventListener('ark:project-import-progress', onProg);
      setAttachBusy(false);
      setAttachProgressLabel('');
    }
  };

  const openWorkspaceInPlace = (sourceDir?: string) => openProjectFolder(sourceDir, 'in-place');
  const importProjectFolderCopy = (sourceDir?: string) => openProjectFolder(sourceDir, 'import');

  const enterPathAndOpen = async () => {
    const typed = window.prompt('Folder path on this PC (e.g. D:\\Projects\\MyApp):');
    if (!typed?.trim()) return;
    const stat = await window.arkDesktop?.workspaceStatPath?.(typed.trim());
    if (!stat?.ok || !stat.isDirectory) {
      window.alert(stat?.error || 'That path is not a folder.');
      return;
    }
    const ok = window.confirm(
      `Allow ARK to read and edit files under this folder?\n\n${stat.path || typed.trim()}`,
    );
    if (!ok) return;
    await openWorkspaceInPlace(stat.path || typed.trim());
  };

  const cloneFromUrl = async () => {
    const url = window.prompt('Git clone URL (https://github.com/user/repo.git):');
    if (!url?.trim()) return;
    const uid = user?.id ?? 'guest';
    let pid = project?.id || projectId;
    if (!pid) {
      const created = addRecent('Code');
      pid = created.id;
      skipHydrateRef.current = true;
      setProject(emptyWorkspaceProject(uid, created.id, created.name));
      navigate({ name: 'project', id: created.id });
    }
    const token = getPluginRuntime('github', loadPluginState()).token?.trim();
    setAttachBusy(true);
    setAttachProgressLabel('Cloning repository…');
    const onProg = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { label?: string } | undefined;
      if (d?.label) setAttachProgressLabel(d.label);
    };
    window.addEventListener('ark:project-import-progress', onProg);
    try {
      const res = await window.arkDesktop?.gitCloneOpen?.({
        projectId: pid,
        projectName: project?.name,
        url: url.trim(),
        token,
      });
      if (!res?.ok || res.canceled) {
        if (res?.error) {
          postAssistantNote(res.error);
        }
        return;
      }
      if (res.root) setDiskRoot(res.root);
      setWorkspaceInPlace(true);
      if (res.files && Object.keys(res.files).length) {
        await applyProjectFilesPaced(res.files);
        resetTokenUsage(pid);
        setTokenRatio(0);
        postAttachInChat(
          encodeChatAttach({ kind: 'folder', name: res.name || 'repo', count: Object.keys(res.files).length, projectId: pid }),
          [
            `Cloned and opened at \`${res.root}\`. What should we do first?`,
          ].join('\n'),
          true,
        );
      }
      void refreshGit(pid);
    } finally {
      window.removeEventListener('ark:project-import-progress', onProg);
      setAttachBusy(false);
      setAttachProgressLabel('');
    }
  };

  const [dragOverCode, setDragOverCode] = useState(false);
  const codeDragActiveRef = useRef(false);
  const setCodeDragActive = (on: boolean) => {
    if (codeDragActiveRef.current === on) return;
    codeDragActiveRef.current = on;
    setDragOverCode(on);
  };

  const applyDroppedIntoCode = async (list: FileList | null) => {
    if (!list?.length || myAccess === 'read') return;
    const uid = user?.id ?? 'guest';
    let pid = project?.id || projectId;
    if (!pid) {
      const created = addRecent('Code');
      pid = created.id;
      skipHydrateRef.current = true;
      setProject(emptyWorkspaceProject(uid, created.id, created.name));
      navigate({ name: 'project', id: created.id });
    }
    const result = await resolveChatDrop(list, { projectId: pid, mergeProject: true });
    const files = result.files;
    const count = Object.keys(files).length;
    if (!count && !result.images.length) return;
    if (count) {
      applyProjectFiles(files);
      const firstPath = Object.keys(files)[0];
      if (firstPath) {
        setSelectedFile(firstPath);
        setExplorerOpen(true);
        setRightTab('code');
      }
      const labels = (result.attaches?.length ? result.attaches : (result.attach ? [result.attach] : []))
        .map(a => a.name)
        .join(', ') || 'drop';
      if (result.attach?.kind === 'folder' && result.attach.name) {
        touchRecentProject(pid, result.attach.name);
      }
      postAttachInChat(
        encodeChatAttach(result.attach || { kind: 'files', name: labels, count, projectId: pid }),
        [
          `Got **${labels}** from drag-and-drop — files are in Explorer.`,
          '',
          'What should I do next?',
        ].join('\n'),
        true,
      );
    }
    ignoreEnterUntilRef.current = Date.now() + 600;
    void refreshGit(pid);
  };

  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (myAccess === 'read') return;
      allowWindowFileDrop(e);
      if (dropHasFiles(e.dataTransfer) || (e.dataTransfer?.types?.length ?? 0) === 0) {
        setCodeDragActive(true);
      }
    };
    const onOver = (e: DragEvent) => {
      if (myAccess === 'read') return;
      allowWindowFileDrop(e);
    };
    const onLeave = (e: DragEvent) => {
      if (e.relatedTarget == null) setCodeDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (myAccess === 'read') return;
      allowWindowFileDrop(e);
      setCodeDragActive(false);
      void applyDroppedIntoCode(e.dataTransfer?.files ?? null);
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
  }, [myAccess, project?.id, projectId]);

  const pickCodePhotos = async () => {
    if (!window.arkDesktop?.pickFiles) return;
    const res = await window.arkDesktop.pickFiles({ imagesOnly: true });
    if (res?.canceled || !res?.ok || !res.paths?.length) return;
    await attachCodeImagesFromPaths(res.paths);
  };

  const pickCodeFiles = async () => {
    if (!window.arkDesktop?.pickFiles) return;
    const res = await window.arkDesktop.pickFiles();
    if (res?.canceled || !res?.ok || !res.paths?.length) return;
    await attachCodeFilesFromPaths(res.paths);
  };

  const pickCodeFolder = () => {
    void openWorkspaceInPlace();
  };

  const attachCodeImagesFromPaths = async (paths: string[]) => {
    const next: { id: string; url: string; name: string }[] = [];
    for (const abs of paths.slice(0, 4)) {
      const data = await window.arkDesktop?.readDataUrl?.(abs);
      if (data?.ok && data.dataUrl) {
        next.push({
          id: `img-${crypto.randomUUID().slice(0, 8)}`,
          url: data.dataUrl,
          name: data.name || abs.split(/[/\\]/).pop() || 'image',
        });
      }
    }
    if (next.length) setAttachedImages(prev => [...prev, ...next].slice(0, 4));
    ignoreEnterUntilRef.current = Date.now() + 600;
  };

  const attachCodeFilesFromPaths = async (paths: string[]) => {
    const uid = user?.id ?? 'guest';
    let pid = project?.id || projectId;
    if (!pid) {
      const created = addRecent('Code');
      pid = created.id;
      skipHydrateRef.current = true;
      setProject(emptyWorkspaceProject(uid, created.id, created.name));
      navigate({ name: 'project', id: created.id });
    }
    const files: Record<string, string> = {};
    for (const abs of paths) {
      const base = abs.split(/[/\\]/).pop() || 'file';
      if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(base)) {
        await attachCodeImagesFromPaths([abs]);
        continue;
      }
      const read = await window.arkDesktop?.readTextFile?.({ path: abs });
      files[base] = read?.ok && read.text != null ? read.text : `[Attached file: ${base}]`;
    }
    if (Object.keys(files).length) {
      applyProjectFiles(files);
      const first = Object.keys(files)[0];
      if (first) {
        setSelectedFile(first);
        setExplorerOpen(true);
        setRightTab('code');
      }
      const label = Object.keys(files).length === 1
        ? Object.keys(files)[0]
        : `${Object.keys(files).length} files`;
      postAttachInChat(
        encodeChatAttach({
          kind: Object.keys(files).length === 1 ? 'file' : 'files',
          name: label,
          count: Object.keys(files).length,
          projectId: pid,
          id: `files-${pid}`,
        }),
        `Got **${label}** — in Explorer.`,
        true,
      );
    }
    ignoreEnterUntilRef.current = Date.now() + 600;
    void refreshGit(pid);
  };

  const clonePickedRepo = async (repo: GitHubRepo) => {
    setGithubPickerOpen(false);
    const uid = user?.id ?? 'guest';
    let pid = project?.id || projectId;
    const hasFiles = Object.keys(fileContentsRef.current).some(k => String(fileContentsRef.current[k] || '').trim());
    if (hasFiles && !window.confirm('This project already has files. Cloning will merge into the folder and may overwrite matching paths. Continue?')) {
      return;
    }
    if (!pid) {
      const created = addRecent(repo.name);
      pid = created.id;
      skipHydrateRef.current = true;
      setProject(emptyWorkspaceProject(uid, created.id, created.name));
      navigate({ name: 'project', id: created.id });
    }
    const token = getPluginRuntime('github', loadPluginState()).token?.trim();
    const [owner, name] = repo.full_name.split('/');
    const cloned = await gitClone(pid, githubCloneUrl(owner, name), token);
    if (!cloned.ok) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        user_id: uid,
        project_id: pid,
        role: 'assistant',
        content: cloned.error || 'Clone failed.',
        provider_used: 'GitHub',
        created_at: new Date().toISOString(),
      }]);
      return;
    }
    const read = await window.arkDesktop?.projectRead?.(pid);
    if (read?.files) applyProjectFiles(read.files);
    if (read?.root) setDiskRoot(read.root);
    touchRecentProject(pid, repo.name);
    await refreshGit(pid);
    if ((repo.size ?? 1) === 0) {
      setChatInput('This repo is empty. Start with a blank page and add ');
      textareaRef.current?.focus();
    }
  };

  const headerGitStatus = async () => {
    if (!projectId || gitBusy) return;
    setGitBusy(true);
    try {
      const st = await gitStatus(projectId);
      postAssistantNote(formatGitReview(st));
    } finally {
      setGitBusy(false);
    }
  };

  const headerPull = async () => {
    if (!projectId || gitBusy || !canEdit) return;
    const token = getPluginRuntime('github', loadPluginState()).token?.trim();
    setGitBusy(true);
    try {
      const pulled = await gitPull(projectId, token);
      if (!pulled.ok) {
        postAssistantNote(pulled.error || 'Pull failed.');
        return;
      }
      const read = await window.arkDesktop?.projectRead?.(projectId);
      if (read?.files) applyProjectFiles(read.files);
      postAssistantNote(pulled.message || 'Pulled latest from origin.');
      await refreshGit(projectId);
    } finally {
      setGitBusy(false);
    }
  };

  const headerPush = async () => {
    if (!projectId || gitBusy || !canEdit) return;
    if (!window.confirm('Push committed changes to GitHub? This sends your local commits to the remote repository.')) {
      return;
    }
    setGitBusy(true);
    try {
      await safeProjectWrite({
          projectId,
          projectName: project?.name,
          files: packDiskFiles(fileContentsRef.current, messagesRef.current),
        });
      const token = getPluginRuntime('github', loadPluginState()).token?.trim();
      if (!token) {
        setGithubPickerOpen(true);
        setMessages(prev => {
          const note: ChatMessage = {
            id: crypto.randomUUID(),
            user_id: user?.id ?? 'guest',
            project_id: projectId,
            role: 'assistant',
            content: 'Connect GitHub in Plugins first — then Push will send your commit.',
            provider_used: 'Git',
            created_at: new Date().toISOString(),
          };
          const next = [...prev, note];
          saveProjectThread(projectId, next);
          return next;
        });
        return;
      }
      if (!gitInfo?.git || gitInfo.dirty) {
        await gitCommit(projectId, 'Update from ARK');
      }
      const pushed = await gitPush(projectId, token);
      if (!pushed.ok) {
        let errText = pushed.error || 'Push failed.';
        if (/No origin remote/i.test(errText)) {
          errText += '\n\nSay “create a private GitHub repo” in chat, or connect GitHub in Plugins and add origin.';
        }
        if (/Git is not installed/i.test(errText)) {
          errText += '\n\nInstall Git for Windows from https://git-scm.com/download/win then retry.';
        }
        if (!token && /401|403|Authentication|denied/i.test(errText)) {
          errText += '\n\nAdd your GitHub token in Plugins → GitHub.';
        }
        setMessages(prev => {
          const note: ChatMessage = {
            id: crypto.randomUUID(),
            user_id: user?.id ?? 'guest',
            project_id: projectId,
            role: 'assistant',
            content: errText,
            provider_used: 'Git',
            created_at: new Date().toISOString(),
          };
          const next = [...prev, note];
          saveProjectThread(projectId, next);
          return next;
        });
      } else if (isNativeMobileTree(fileContentsRef.current)) {
        const noteText = formatNativePushReply(pushed.remote || gitInfo?.remote || '', fileContentsRef.current);
        setMessages(prev => {
          const note: ChatMessage = {
            id: crypto.randomUUID(),
            user_id: user?.id ?? 'guest',
            project_id: projectId,
            role: 'assistant',
            content: noteText,
            provider_used: 'Git',
            created_at: new Date().toISOString(),
          };
          const next = [...prev, note];
          saveProjectThread(projectId, next);
          return next;
        });
      }
      await refreshGit(projectId);
    } finally {
      setGitBusy(false);
    }
  };

  const headerCommit = async () => {
    if (!projectId || gitBusy || !canEdit) return;
    const msg = window.prompt('Commit message:', 'Update from ARK')?.trim();
    if (!msg) return;
    setGitBusy(true);
    try {
      await safeProjectWrite({
        projectId,
        projectName: project?.name,
        files: packDiskFiles(fileContentsRef.current, messagesRef.current),
      });
      const committed = await gitCommit(projectId, msg);
      if (!committed.ok) {
        postAssistantNote(committed.error || 'Commit failed.');
        return;
      }
      postAssistantNote(committed.message || formatGitReview(committed));
      await refreshGit(projectId);
    } finally {
      setGitBusy(false);
    }
  };

  const headerCreateRepo = async () => {
    if (!projectId || gitBusy || !canEdit) return;
    const token = githubToken();
    if (!token) {
      setGithubPickerOpen(true);
      postAssistantNote('Connect GitHub in Plugins first — then create a repo.');
      return;
    }
    const blocked = needGithubWrite();
    if (blocked) {
      postAssistantNote(blocked);
      return;
    }
    if (gitInfo?.remote && !window.confirm('This folder already has a GitHub remote. Create a new repo anyway?')) {
      return;
    }
    const defaultName = repoNameFromProject(project?.name || 'ark-project');
    const name = window.prompt('Repository name on GitHub:', defaultName)?.trim();
    if (!name) return;
    const isPrivate = window.confirm('Create as private repo? (Cancel = public)');
    if (!window.confirm(`Create GitHub repo "${name}" and push this folder?`)) return;

    setGitBusy(true);
    try {
      await safeProjectWrite({
        projectId,
        projectName: project?.name,
        files: packDiskFiles(fileContentsRef.current, messagesRef.current),
      });
      const result = await workflowCreateGitHubRepo({
        projectId,
        projectName: project?.name || 'Code project',
        token,
        repoName: name,
        isPrivate,
      });
      postAssistantNote(result.reply);
      await refreshGit(projectId);
    } finally {
      setGitBusy(false);
    }
  };

  const headerCreatePR = async () => {
    if (!projectId || gitBusy || !canEdit) return;
    const token = githubToken();
    if (!token) {
      setGithubPickerOpen(true);
      postAssistantNote('Connect GitHub in Plugins first — then open a pull request.');
      return;
    }
    const blocked = needGithubWrite();
    if (blocked) {
      postAssistantNote(blocked);
      return;
    }
    const st = await gitStatus(projectId);
    const head = st.branch && st.branch !== 'HEAD' ? st.branch : '';
    if (!head || head === 'main' || head === 'master') {
      postAssistantNote(`You're on ${head || 'HEAD'}. Create or switch to a feature branch first.`);
      return;
    }
    const title = window.prompt('Pull request title:', st.log?.[0]?.replace(/^[a-f0-9]+\s+/i, '') || 'Changes from ARK')?.trim();
    if (!title) return;
    if (!window.confirm(`Push branch "${head}" and open a pull request on GitHub?`)) return;

    setGitBusy(true);
    try {
      await safeProjectWrite({
        projectId,
        projectName: project?.name,
        files: packDiskFiles(fileContentsRef.current, messagesRef.current),
      });
      const result = await workflowOpenPullRequest({
        projectId,
        token,
        title,
        pushFirst: true,
      });
      postAssistantNote(result.reply);
      await refreshGit(projectId);
    } finally {
      setGitBusy(false);
    }
  };

  const handleSendChat = async (overrideContent?: string) => {
    // Always free a stuck prior job (Chat parity) so follow-ups never spin forever.
    void engineGenerateCancel();
    if (buildAbortRef.current) {
      const stoppingOnly = !overrideContent && !chatInput.trim() && !reviseUserMsgId;
      buildAbortRef.current.abort();
      if (stoppingOnly) return;
    }
    buildAbortRef.current = null;
    setBuildLive(null);

    const rawContent = (overrideContent ?? chatInput).trim();
    if ((!rawContent && attachedImages.length === 0) || !project) return;

    const explainEarly = isExplainAsk(rawContent);
    const inspectEarly = wantsInspectOnly(rawContent, composerMode === 'debug')
      || isFindInFilesAsk(rawContent);
    if (!canEdit && !explainEarly && !inspectEarly) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        user_id: user?.id ?? 'guest',
        project_id: project.id || projectId || 'draft',
        role: 'assistant',
        content: 'Read access — you can inspect and ask questions, but cannot edit files or push.',
        provider_used: 'ARK',
        created_at: new Date().toISOString(),
      }]);
      return;
    }

    const capacity = await probeLiveCapacity();
    const pluginHit = detectPluginIntent(rawContent, getChatEnabledPlugins(loadPluginState()).map(p => p.id));
    const wantsWrites = wantsProjectFileEdits(rawContent) || looksLikeWebsiteBuild(rawContent);

    // Offline scaffold: build/change asks still write files even with no live brain.
    if (!capacity.liveChat && !explainEarly && !inspectEarly && !pluginHit) {
      if (canEdit && wantsWrites) {
        const uidOffline = user?.id ?? 'guest';
        let offlineProject = project;
        if (!offlineProject.id) {
          const created = addRecent(inferBuildLabel(rawContent, 'Code'));
          skipHydrateRef.current = true;
          offlineProject = emptyWorkspaceProject(uidOffline, created.id, created.name);
          setProject(offlineProject);
          navigate({ name: 'project', id: created.id });
        }
        const offlinePid = offlineProject.id;
        const offlineLabel = inferBuildLabel(rawContent, offlineProject.name);
        touchRecentProject(offlinePid, offlineLabel);
        const userOffline: ChatMessage = {
          id: crypto.randomUUID(),
          user_id: uidOffline,
          project_id: offlinePid,
          role: 'user',
          content: rawContent,
          provider_used: null,
          created_at: new Date().toISOString(),
        };
        const assistantOfflineId = crypto.randomUUID();
        const fallback = scaffoldFallbackEdits(rawContent, fileContentsRef.current);
        if (!fallback.length) {
          setMessages(prev => [...prev, userOffline, {
            id: assistantOfflineId,
            user_id: uidOffline,
            project_id: offlinePid,
            role: 'assistant',
            content: [
              honestNoLiveChatReply(),
              '',
              'I also could not scaffold files offline for that ask. Connect a free key or install a local brain, then try again.',
            ].join('\n'),
            provider_used: 'ARK',
            created_at: new Date().toISOString(),
          }]);
          setChatInput('');
          return;
        }
        undoSnapshotRef.current = { ...fileContentsRef.current };
        setUndoReady(true);
        const applied = applyFileEdits(fileContentsRef.current, fileTreeRef.current, fallback);
        fileContentsRef.current = applied.files;
        fileTreeRef.current = applied.tree.length ? applied.tree : buildFileTreeFromPaths(applied.files);
        setFileContents(applied.files);
        setFileTree(fileTreeRef.current);
        const focus = preferredLiveEditPath(applied.changedPaths) || applied.changedPaths[0];
        if (focus) {
          setSelectedFile(focus);
          setRightTab('code');
          setCodeOpen(true);
        }
        void safeProjectWrite({
          projectId: offlinePid,
          projectName: offlineLabel,
          files: packDiskFiles(applied.files, [...messagesRef.current, userOffline]),
        }).then(res => { if (res.root) setDiskRoot(res.root); });
        if (window.arkDesktop?.previewStart) {
          void window.arkDesktop.previewStart({
            projectId: offlinePid,
            projectName: offlineLabel,
            files: packDiskFiles(applied.files, messagesRef.current),
          }).then(res => {
            if (res?.url) {
              setLivePreviewUrl(res.url);
              setPreviewUrl(res.url);
              setPreviewReady(true);
            }
          });
        }
        const replyOffline = [
          `Created **${applied.changedPaths.join(', ')}** offline (no live brain yet).`,
          'Press **Start** to open the preview. Connect a free key or local brain for smarter edits next.',
        ].join('\n');
        const nextMsgs = [...messagesRef.current, userOffline, {
          id: assistantOfflineId,
          user_id: uidOffline,
          project_id: offlinePid,
          role: 'assistant' as const,
          content: replyOffline,
          provider_used: 'Local scaffold',
          created_at: new Date().toISOString(),
        }];
        messagesRef.current = nextMsgs;
        setMessages(nextMsgs);
        saveProjectThread(offlinePid, nextMsgs);
        setChatInput('');
        return;
      }
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        user_id: user?.id ?? 'guest',
        project_id: project.id || projectId || 'draft',
        role: 'assistant',
        content: honestNoLiveChatReply(),
        provider_used: 'ARK',
        created_at: new Date().toISOString(),
      }]);
      return;
    }

    const uid = user?.id ?? 'guest';
    let activeProject = project;
    if (!activeProject.id) {
      const created = addRecent(inferBuildLabel(rawContent, 'Code'));
      skipHydrateRef.current = true;
      activeProject = emptyWorkspaceProject(uid, created.id, created.name);
      setProject(activeProject);
      navigate({ name: 'project', id: created.id });
    }
    const pid = activeProject.id;

    const persistLocalThread = (msgs: ChatMessage[]) => {
      messagesRef.current = msgs;
      saveProjectThread(pid, msgs);
      void safeProjectWrite({
          projectId: pid,
          projectName: inferBuildLabel(rawContent, activeProject.name),
          files: packDiskFiles(fileContentsRef.current, msgs),
        }).then(res => {
          if (res.root) setDiskRoot(res.root);
        setWorkspaceInPlace(Boolean(res.meta && (res.meta as { inPlace?: boolean }).inPlace));
        });
    };

    const composerWasDebug = composerMode === 'debug';
    const improveAsk = isImproveAsk(rawContent);
    const explainOnly = isExplainAsk(rawContent) && !improveAsk;
    const hasFilesNow = Object.values(fileContentsRef.current)
      .some(v => String(v || '').trim().length > 40);
    const keepName = Boolean(activeProject.name && !/^code$/i.test(activeProject.name))
      && (
        hasFilesNow
        || explainOnly
        || wantsInspectOnly(rawContent, composerWasDebug)
        || wantsNamedPatch(rawContent, true)
      );
    const buildLabel = keepName
      ? activeProject.name
      : inferBuildLabel(rawContent, activeProject.name);
    if (!keepName) touchRecentProject(pid, buildLabel);

    let content = rawContent;
    if (composerMode && COMPOSER_MODE_PREFIX[composerMode]) {
      content = `${COMPOSER_MODE_PREFIX[composerMode]}${content}`;
    }
    setComposerMode(null);
    const nativeDoneReply = (opts?: { continued?: boolean }) => {
      if (isNativeMobileTree(fileContentsRef.current) || classifyMobileTarget(content)) {
        return formatNativeBuildReply(buildLabel, content, fileContentsRef.current);
      }
      return buildDoneSummary(buildLabel, opts);
    };
    setTokenRatio(getTokenUsageRatio(pid));
    setModelRatio(getModelHealthRatio(pid));
    const revisingId = reviseUserMsgId;
    setReviseUserMsgId(null);
    setEditingUserId(null);
    setChatInput('');
    setComposerTall(false);
    setAttachedImages([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const skipPlatformAsk = explainOnly
      || improveAsk
      || isPatchAsk(rawContent)
      || isFindInFilesAsk(rawContent)
      || (hasFilesNow && wantsInspectOnly(rawContent, composerWasDebug))
      || (hasFilesNow && wantsNamedPatch(rawContent, true));

    if (canEdit && !skipPlatformAsk && needsMobileTargetChoice(rawContent) && !isNativeMobileTree(fileContentsRef.current)) {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      user_id: uid,
        project_id: pid,
      role: 'user',
        content: rawContent,
      provider_used: null,
      created_at: new Date().toISOString(),
    };
      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        user_id: uid,
        project_id: pid,
        role: 'assistant',
        content: 'Which should I build? Apple (Xcode), Android (Android Studio), or a website in the browser? I will not start writing files until you pick.',
        provider_used: 'ARK',
        created_at: new Date().toISOString(),
      };
      setMessages(prev => {
        const next = [...prev, userMsg, assistantMsg];
        persistLocalThread(next);
        return next;
      });
      setMobileOfferId(assistantId);
      setMobileOfferPrompt(rawContent);
      setMobileOfferStep('platform');
      setFamilyPlatform(null);
      return;
    }

    const knownTarget = looksLikeWebsiteBuild(rawContent) ? null : classifyMobileTarget(rawContent);
    if (canEdit && knownTarget && needsDeviceFamilyChoice(rawContent, knownTarget) && !isNativeMobileTree(fileContentsRef.current)) {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        user_id: uid,
        project_id: pid,
        role: 'user',
        content: rawContent,
        provider_used: null,
        created_at: new Date().toISOString(),
      };
      const assistantId = crypto.randomUUID();
      const familyAsk = knownTarget === 'android'
        ? 'Which Android size should I lock? The preview stays that width × height — zoom only, no stretching.'
        : knownTarget === 'ios'
          ? 'Which Apple size should I lock? Example: iPhone 16 is 393×852. The preview stays that size — zoom only, no stretching.'
          : 'Which canvas size should I lock? The preview stays that width × height — zoom only, no stretching.';
      const assistantMsg: ChatMessage = {
        id: assistantId,
        user_id: uid,
        project_id: pid,
        role: 'assistant',
        content: familyAsk,
        provider_used: 'ARK',
        created_at: new Date().toISOString(),
      };
      setMessages(prev => {
        const next = [...prev, userMsg, assistantMsg];
        persistLocalThread(next);
        return next;
      });
      setMobileOfferId(assistantId);
      setMobileOfferPrompt(rawContent);
      setMobileOfferStep('family');
      setFamilyPlatform(knownTarget);
      return;
    }

    if (revisingId) {
      fileContentsRef.current = {};
      fileTreeRef.current = [];
      setFileContents({});
      setFileTree([]);
      setSelectedFile('');
      setPreviewReady(false);
      setLivePreviewUrl(null);
    }

    const hadExistingFiles = !revisingId && Object.values(fileContentsRef.current)
      .some(v => String(v || '').trim().length > 40);
    const inspectOnly = !canEdit
      || explainOnly
      || improveAsk
      || (hadExistingFiles && wantsInspectOnly(rawContent, composerWasDebug));
    const patchOnlyNamed = canEdit && hadExistingFiles && wantsNamedPatch(rawContent, true) && !inspectOnly;
    const plannedFiles = inspectOnly || patchOnlyNamed
      ? pickFilesForInspect(fileContentsRef.current, rawContent)
      : planFilesForBuild(content);
    const userMsg: ChatMessage = {
      id: revisingId || crypto.randomUUID(),
      user_id: uid,
      project_id: pid,
      role: 'user',
      content: content || '',
      provider_used: null,
      created_at: new Date().toISOString(),
    };
    const assistantId = crypto.randomUUID();
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      user_id: uid,
      project_id: pid,
      role: 'assistant',
      content: '',
      provider_used: null,
      created_at: new Date().toISOString(),
    };
    let nextMsgs: ChatMessage[] = [];
    setMessages(prev => {
      let next = prev;
      if (revisingId) {
        const idx = prev.findIndex(m => m.id === revisingId);
        if (idx >= 0) next = prev.slice(0, idx);
      }
      nextMsgs = [...next, userMsg, assistantPlaceholder];
      return nextMsgs;
    });
    persistLocalThread(nextMsgs.length ? nextMsgs : [userMsg, assistantPlaceholder]);

    setBuildLive({
      assistantId,
      label: buildLabel,
      step: 'understand',
      plannedFiles,
      startedAt: Date.now(),
      kind: inspectOnly ? 'inspect' : patchOnlyNamed ? 'fix' : 'build',
    });
    setExplorerOpen(true);
    setCodeOpen(true);
    setRightTab('code');
    setRunHistory(prev => [
      {
        id: crypto.randomUUID(),
        title: content.slice(0, 48) || 'Project edit',
        at: new Date().toLocaleTimeString(),
        steps: BUILD_PROGRESS_STEPS.map(s => s.label).join(' → '),
      },
      ...prev,
    ]);

    const bumpStep = (step: BuildLiveStep) => {
      setBuildLive(prev => {
        if (prev?.assistantId !== assistantId) return prev;
        const cur = BUILD_STEP_ORDER.indexOf(prev.step);
        const next = BUILD_STEP_ORDER.indexOf(step);
        if (next < cur) return prev;
        return { ...prev, step };
      });
    };

    const commitEdits = (
      edits: ReturnType<typeof parseFileEdits>,
      opts?: { openPreview?: boolean },
    ) => {
      if (!canEdit) return { changedPaths: [] as string[], summary: '', previewTouched: false };
      const nativeTree = isNativeMobileTree(fileContentsRef.current);
      const webFinal = nativeTree
        ? edits
        : finalizeWebEdits(fileContentsRef.current, content, edits, { projectName: project?.name || buildLabel });
      if (!webFinal.length) return { changedPaths: [] as string[], summary: '', previewTouched: false };
      const nativeEdits = finalizeMobileEdits(content, webFinal, fileContentsRef.current);
      if (!nativeEdits.length) return { changedPaths: [] as string[], summary: '', previewTouched: false };
      if (classifyMobileTarget(content) && !isLayoutLockAsk(content)) {
        const drop = new Set(['index.html', 'css/styles.css', 'js/app.js', 'src/App.tsx', 'src/main.tsx', 'src/index.css']);
        fileContentsRef.current = Object.fromEntries(
          Object.entries(fileContentsRef.current).filter(([path]) => !drop.has(path) && !/^css\/|^js\//.test(path)),
        );
      }
      undoSnapshotRef.current = { ...fileContentsRef.current };
      setUndoReady(true);
      const applied = applyFileEdits(fileContentsRef.current, fileTreeRef.current, nativeEdits);
      const cleaned = prunePlaceholderJunk(applied.files);
      fileContentsRef.current = cleaned;
      fileTreeRef.current = buildFileTreeFromPaths(cleaned);
      setFileContents(cleaned);
      setFileTree(fileTreeRef.current);
      const previewTouched = nativeTree || touchesPreviewServing(applied.changedPaths, cleaned);
      setFileChanges(prev => {
        const map = new Map(prev.map(f => [f.path, f]));
        for (const d of applied.fileDiffs) {
          const cur = map.get(d.path);
          map.set(d.path, {
            path: d.path,
            added: (cur?.added || 0) + d.added,
            removed: (cur?.removed || 0) + d.removed,
          });
        }
        return [...map.values()];
      });
      const expand = foldersToExpand(applied.changedPaths);
      setExpandedFolders(prev => {
        const next = new Set(prev);
        expand.forEach(p => next.add(p));
        return next;
      });
      const native = isNativeMobileTree(cleaned);
      const focus = preferredLiveEditPath(applied.changedPaths)
        || preferredMobileFocus(applied.changedPaths)
        || applied.changedPaths[0];
      if (focus) {
        setSelectedFile(focus);
    setRightTab('code');
        setCodeOpen(true);
        setFileFlash(true);
        window.setTimeout(() => setFileFlash(false), 1400);
        setBuildLive(prev => prev?.assistantId === assistantId ? { ...prev, focusFile: focus } : prev);
      }
      if (opts?.openPreview && !native) setRightTab('preview');
      if (native) {
        const mapped = classifyMobileTarget(content) || inferMobileTargetFromFiles(cleaned) || 'ios';
        const picked = resolveDevices(mapped, content);
        const nextDevice = classifyNamedDevice(content) || picked.ios || picked.android || null;
        if (nextDevice) {
          previewDeviceRef.current = nextDevice;
          setPreviewDevice(nextDevice);
        }
        setCodeOpen(true);
        void refreshLivePreview(cleaned, nextDevice);
      }
      void safeProjectWrite({
          projectId: pid,
          projectName: buildLabel,
          files: packDiskFiles(cleaned, messagesRef.current),
        }).then(res => {
          if (res.root) setDiskRoot(res.root);
        setWorkspaceInPlace(Boolean(res.meta && (res.meta as { inPlace?: boolean }).inPlace));
          if (!res.ok && res.error) {
            setSandboxNote(res.error);
            window.setTimeout(() => setSandboxNote(null), 5000);
          }
        }).catch(err => {
          setSandboxNote(err instanceof Error ? err.message : 'Could not save project files');
          window.setTimeout(() => setSandboxNote(null), 5000);
        });
      if (applied.changedPaths.length && !native && window.arkDesktop?.previewStart) {
        void window.arkDesktop.previewStart({
          projectId: pid,
          projectName: buildLabel,
          files: packDiskFiles(cleaned, messagesRef.current),
        }).then(res => {
          if (res?.url && !String(res.url).includes('127.0.0.1:0') && !String(res.url).includes('://0')) {
            const bust = `${res.url}${res.url.includes('?') ? '&' : '?'}t=${Date.now()}`;
            setLivePreviewUrl(bust);
            setPreviewUrl(bust);
            setPreviewReady(true);
            if (opts?.openPreview) setRightTab('preview');
          } else if (res && (res.ok === false || !res.url || String(res.url).includes(':0'))) {
            setSandboxNote('Preview server did not start — static HTML is still in the Preview tab.');
            window.setTimeout(() => setSandboxNote(null), 4200);
          }
        }).catch(err => {
          setSandboxNote(err instanceof Error ? err.message : 'Preview failed to start');
          window.setTimeout(() => setSandboxNote(null), 4200);
        });
      }
      if (/\b(github|push|git\s+push|ship|remote|pull request|\bpr\b)\b/i.test(content)) {
        setShipOfferId(assistantId);
      } else {
        setShipOfferId(null);
      }
      if (isNativeMobileTree(cleaned) && !classifyMobileDevice(content)) {
        setDeviceOfferId(assistantId);
      }
      return { ...applied, files: cleaned, previewTouched };
    };

    const runId = ++runIdRef.current;

    void saveChatMessage(pid, 'user', content).catch(() => undefined);
    void updateProject(pid, { last_prompt: content, status: 'building' }).catch(() => undefined);

    void (async () => {
      const pluginState = loadPluginState();
      const enabled = getChatEnabledPlugins(pluginState);
      const pluginId = detectPluginIntent(content, enabled.map(p => p.id));

      let replyText = '';
      let provider = 'ARK';
      let changedPaths: string[] = [];
      let previewTouched = false;
      let stallTimer: number | undefined;
      let hardTimer: number | undefined;
      let aborted = false;
      let waitOpen = true;
      let abortReject: ((err: Error) => void) | null = null;
      const buildStartedAt = Date.now();
      const withTiming = (body: string) => {
        setModelRatio(recordModelTurn(pid, {
          tokens: estimateTokens(body),
          activeMs: Date.now() - buildStartedAt,
        }));
        return `${body.trim()}\n\nWorked for ${formatElapsed(Date.now() - buildStartedAt)}`;
      };
      const snapshotChanged = () => {
        changedPaths = Object.entries(fileContentsRef.current)
          .filter(([, v]) => String(v || '').trim().length > 24)
          .map(([k]) => k);
      };
      let filesBeforeGenerate: Record<string, string> | null = null;
      let treeBeforeGenerate = fileTreeRef.current;
      let hopAfterLocalStall = true;
      const restoreGeneratedDraft = () => {
        if (!filesBeforeGenerate) return;
        fileContentsRef.current = { ...filesBeforeGenerate };
        fileTreeRef.current = treeBeforeGenerate;
        setFileContents(fileContentsRef.current);
        setFileTree(fileTreeRef.current);
      };
      const collectFinishedEdits = (reply: string) => {
        let edits = parseClosedFileEdits(reply);
        if (!edits.length) {
          edits = extractChatStyleFileEdits(reply, content)
            .filter(e => fileContentLooksComplete(e.path, e.content));
        }
        if (!edits.length && !patchOnlyNamed) {
          const html = extractStreamingHtml(reply);
          if (html && fileContentLooksComplete('index.html', html)) {
            edits = editsFromWorkingHtml(html, plannedFiles)
              .filter(e => fileContentLooksComplete(e.path, e.content));
          }
        }
        if (patchOnlyNamed) edits = filterEditsToPaths(edits, lastInspectPathsRef.current);
        return edits;
      };
      const unfinishedNote = 'The brain stopped mid-file. I did not save a half-written app. Send again and let it finish.';

      const abortPromise = new Promise<never>((_, reject) => {
        abortReject = reject;
      });

      const finishWait = (reason: string) => {
        if (aborted || !waitOpen) return;
        aborted = true;
        waitOpen = false;
        if (stallTimer) window.clearTimeout(stallTimer);
        if (hardTimer) window.clearTimeout(hardTimer);
        if (typeTimerRef.current) {
          window.clearInterval(typeTimerRef.current);
          typeTimerRef.current = undefined;
        }
        void engineGenerateCancel();
        abortReject?.(new Error(reason));
      };

      buildAbortRef.current = {
        abort: () => {
          if (!waitOpen) return;
          buildAbortRef.current = null;
          finishWait('Stopped');
        },
      };

      try {
        bumpStep('plan');
        if (plannedFiles.length) {
          setExpandedFolders(prev => {
            const next = new Set(prev);
            foldersToExpand(plannedFiles).forEach(p => next.add(p));
            return next;
          });
          const focus = preferredLiveEditPath(plannedFiles);
          if (focus && (inspectOnly || fileContentsRef.current[focus])) setSelectedFile(focus);
        }
        if (aborted || runId !== runIdRef.current) throw new Error('Stopped');

        await safeProjectWrite({
            projectId: pid,
            projectName: buildLabel,
            files: packDiskFiles(fileContentsRef.current, messagesRef.current),
          });
        const studio = await runCodeStudioCommand({
          message: rawContent,
          projectId: pid,
          projectName: buildLabel,
          files: fileContentsRef.current,
        });
        if (studio) {
          replyText = studio.reply;
          provider = 'ARK';
          if (studio.reload) {
            const read = await window.arkDesktop?.projectRead?.(pid);
            if (read?.files) applyProjectFiles(read.files);
            if (read?.root) setDiskRoot(read.root);
          }
          await refreshGit(pid);
          bumpStep('done');
        }

        if (!replyText && pluginId && !inspectOnly && !patchOnlyNamed && !isFindInFilesAsk(rawContent)) {
          const runtime = getPluginRuntime(pluginId, pluginState);
          const pluginReply = await runPluginAction(
            pluginId,
            content,
            runtime.token,
            runtime.permissions,
          );
          if (pluginReply) {
            replyText = pluginReply;
            provider = `${enabled.find(p => p.id === pluginId)?.name ?? 'Plugin'}${runtime.accountLabel ? ` · ${runtime.accountLabel}` : ''}`;
            bumpStep('done');
          }
        }

        // Micro web asks (bg, search bar, rename, RGB…): apply local patch immediately — don’t wait on the model.
        if (!replyText && canEdit && !inspectOnly && isWebMicroAsk(rawContent)) {
          const micro = webMicroAskEdits(fileContentsRef.current, rawContent);
          if (micro.length) {
            bumpStep('apply');
            const applied = commitEdits(micro, { openPreview: true });
            changedPaths = applied.changedPaths;
            previewTouched = Boolean(applied.previewTouched);
            if (changedPaths.length) {
              replyText = formatCodeChatReply(rawContent, changedPaths, '', { previewTouched });
              bumpStep('done');
            }
          }
        }

        if (!replyText) {
          bumpStep('generate');
          setRightTab('code');

          const prefs = getLocalPrefs();
          const priorForHistory = revisingId
            ? messages.filter(m => m.id !== revisingId).concat(userMsg)
            : [...messages, userMsg];
          const keepContinuity = true;
          // Inspect: fresh history only (Chat parity) — packing prior dumps hung GGUF.
          const turnSize = classifyCodeTurnSize(rawContent, fileContentsRef.current);
          const historyMaxTurns = inspectOnly
            ? 4
            : turnSize === 'micro' ? 3 : turnSize === 'small' ? 4 : 6;
          const historyBase = inspectOnly
            ? buildRouterHistory([], content)
            : prefs.rememberContext
              ? buildRouterHistory(priorForHistory, content, undefined, {
                keepContinuity,
                kind: 'coding',
                maxTurns: historyMaxTurns,
              })
              : buildRouterHistory([], content);
          await yieldFrame();
          const findings = inspectOnly
            ? scanProjectFindings(fileContentsRef.current, rawContent)
            : [];
          const inspectPaths = inspectOnly
            ? pickFilesForInspect(fileContentsRef.current, rawContent)
            : rankFilesForTurnPack(
              flattenProjectFiles(fileContentsRef.current),
              rawContent,
              turnSize,
            );
          await yieldFrame();
          const mentioned = pathsMentionedInText(
            `${rawContent}\n${messages.slice(-4).map(m => m.content).join('\n')}`,
            fileContentsRef.current,
          );
          const allowedPatchPaths = [...new Set([
            ...mentioned,
            ...lastInspectPathsRef.current,
            ...inspectPaths,
          ])];
          if (inspectOnly) lastInspectPathsRef.current = inspectPaths;
          if (patchOnlyNamed && allowedPatchPaths.length) lastInspectPathsRef.current = allowedPatchPaths;
          if (inspectPaths.length) {
            const focus = preferredLiveEditPath(inspectPaths);
            setBuildLive(prev => (
              prev?.assistantId === assistantId
                ? { ...prev, plannedFiles: inspectPaths, focusFile: focus }
                : prev
            ));
          }

          const inspectMode = explainOnly ? 'explain' : improveAsk ? 'improve' : 'debug';
          const codingMessage = inspectOnly
            ? buildInspectPrompt(
              rawContent,
              fileContentsRef.current,
              inspectPaths,
              findings,
              buildLabel,
              inspectMode,
            )
            : patchOnlyNamed
              ? buildNamedPatchPrompt(rawContent, fileContentsRef.current, allowedPatchPaths, buildLabel)
              : buildProjectCodingPrompt(content, fileContentsRef.current, buildLabel);
          const history = historyBase.map((turn, i) =>
            i === historyBase.length - 1 && turn.role === 'user'
              ? { ...turn, content: codingMessage }
              : turn,
          );

          const rotation = await prepareBrainRotation({
            scopeId: pid,
            kind: 'coding',
            history,
            currentModelId: threadBrainRef.current?.modelId,
            brain: activeModel.source === 'auto' ? threadBrainRef.current : null,
          });
          if (rotation.brain) {
            threadBrainRef.current = rotation.brain;
            setThreadBrain(rotation.brain);
          }
          if (rotation.swapped) setModelRatio(0);
          else setModelRatio(getModelHealthRatio(pid));
          const routeHistory = rotation.history;
          // Inner ring = this turn’s routed history only (codingMessage is already in the last user turn).
          const turnPackTokens = routeHistory.reduce((n, t) => n + estimateTokens(t.content), 0);
          setTokenRatio(syncTokenUsage(pid, turnPackTokens));

          const paintFiles = (edits: ReturnType<typeof parseFileEdits>, focusLast = true) => {
            if (!canEdit) return;
            if (!edits.length || inspectOnly) return;
            const nextEdits = patchOnlyNamed ? filterEditsToPaths(edits, allowedPatchPaths) : edits;
            if (!nextEdits.length) return;
            const applied = applyFileEdits(fileContentsRef.current, fileTreeRef.current, nextEdits);
            fileContentsRef.current = applied.files;
            fileTreeRef.current = applied.tree.length ? applied.tree : buildFileTreeFromPaths(applied.files);
            setFileContents(applied.files);
            setFileTree(fileTreeRef.current);
            setFileChanges(prev => {
              const map = new Map(prev.map(f => [f.path, f]));
              for (const d of applied.fileDiffs) {
                const cur = map.get(d.path);
                map.set(d.path, {
                  path: d.path,
                  added: (cur?.added || 0) + d.added,
                  removed: (cur?.removed || 0) + d.removed,
                });
              }
              return [...map.values()];
            });
            setExpandedFolders(prev => {
              const next = new Set(prev);
              foldersToExpand(applied.changedPaths).forEach(p => next.add(p));
              return next;
            });
            const focus = preferredLiveEditPath(applied.changedPaths)
              || (focusLast ? applied.changedPaths[applied.changedPaths.length - 1] : applied.changedPaths[0]);
            if (focus) {
              setSelectedFile(focus);
              setRightTab('code');
              setCodeOpen(true);
              setBuildLive(prev => prev?.assistantId === assistantId ? { ...prev, focusFile: focus } : prev);
            }
            bumpStep('generate');
          };
          let paintQueued: ReturnType<typeof parseFileEdits> | null = null;
          let paintRaf = 0;
          const queuePaint = (edits: ReturnType<typeof parseFileEdits>) => {
            paintQueued = edits;
            if (paintRaf) return;
            paintRaf = window.requestAnimationFrame(() => {
              paintRaf = 0;
              const batch = paintQueued;
              paintQueued = null;
              if (batch?.length) paintFiles(batch);
            });
          };
          if (typeTimerRef.current) window.clearInterval(typeTimerRef.current);

          filesBeforeGenerate = { ...fileContentsRef.current };
          treeBeforeGenerate = fileTreeRef.current;

          let sawChunk = false;
          const armStall = () => {
            if (stallTimer) window.clearTimeout(stallTimer);
            stallTimer = window.setTimeout(() => {
              if (aborted) return;
              if (hopAfterLocalStall && !inspectOnly && !patchOnlyNamed) {
                hopAfterLocalStall = false;
                void engineGenerateCancel();
                streamDraftRef.current = '';
                restoreGeneratedDraft();
                sawChunk = false;
                armStall();
                return;
              }
              finishWait('Stalled');
            }, sawChunk ? CODE_STALL_MS : CODE_FIRST_TOKEN_MS);
          };
          armStall();

          hardTimer = window.setTimeout(() => {
            finishWait('Code generation timed out');
          }, inspectOnly || patchOnlyNamed ? 45_000 : CODE_ROUTE_TIMEOUT_MS);

          const sticky = activeModel.source === 'auto' ? (rotation.brain || threadBrainRef.current) : null;
          streamDraftRef.current = '';

          const routed = await Promise.race([
            arkRoute({
            message: codingMessage,
            kind: 'coding',
              preferredModelId: activeModel.id,
              preferredModelName: activeModel.name,
              preferredSource:
                activeModel.source === 'auto'
                  ? 'auto'
                  : activeModel.source === 'local'
                    ? 'local'
                    : 'cloud',
              stickyModelId: sticky?.modelId,
              stickyModelName: sticky?.modelName,
              stickyPinnedSource: sticky?.pinnedSource,
            history: routeHistory,
              onAttemptReset: () => {
                hopAfterLocalStall = false;
                streamDraftRef.current = '';
                restoreGeneratedDraft();
                sawChunk = false;
                armStall();
                if (hardTimer) window.clearTimeout(hardTimer);
                hardTimer = window.setTimeout(() => {
                  finishWait('Code generation timed out');
                }, inspectOnly || patchOnlyNamed ? 45_000 : CODE_ROUTE_TIMEOUT_MS);
              },
              onChunk: (piece) => {
                if (aborted) return;
                sawChunk = true;
                armStall();
                streamDraftRef.current += piece;
                bumpStep('generate');
                if (inspectOnly) return;
                const streamedFiles = extractStreamingFileEdits(streamDraftRef.current);
                if (streamedFiles.length) {
                  if (typeTimerRef.current) {
                    window.clearInterval(typeTimerRef.current);
                    typeTimerRef.current = undefined;
                  }
                  queuePaint(patchOnlyNamed ? filterEditsToPaths(streamedFiles, allowedPatchPaths) : streamedFiles);
                  return;
                }
                const partial = extractStreamingHtml(streamDraftRef.current);
                if (partial && partial.length > 24 && !patchOnlyNamed) {
                  if (typeTimerRef.current) {
                    window.clearInterval(typeTimerRef.current);
                    typeTimerRef.current = undefined;
                  }
                  queuePaint(editsFromWorkingHtml(partial, plannedFiles));
                }
              },
            }),
            abortPromise,
          ]);

          if (stallTimer) window.clearTimeout(stallTimer);
          if (hardTimer) window.clearTimeout(hardTimer);
          if (typeTimerRef.current) {
            window.clearInterval(typeTimerRef.current);
            typeTimerRef.current = undefined;
          }
          waitOpen = false;
          aborted = true;
          provider = routerProviderLabel(routed, 'ARK');

          if (activeModel.source === 'auto' && routed.source !== 'none') {
            const nextBrain = saveAutoThreadBrain(
              pid,
              'coding',
              routed,
              threadBrainRef.current,
              routed.attempted?.length ?? 0,
            );
            if (nextBrain) setThreadBrain(nextBrain);
          }

          bumpStep(inspectOnly ? 'done' : 'apply');

          if (inspectOnly) {
            const spoken = stripFileBlocks(routed.reply);
            const usable = spoken && !looksLikePromptEcho(spoken) && spoken.length > 40
              && !/get started with coding/i.test(spoken)
              && !/^I read \d+ file/i.test(spoken);
            if (usable) {
              replyText = spoken.trim();
            } else if (explainOnly) {
              replyText = [
                describeProjectFromFiles(fileContentsRef.current, buildLabel),
                '',
                'The coding brain did not finish a full read. This is a local file scan — ask again to try the model.',
              ].join('\n');
            } else {
              replyText = [
                formatLocalFindings(findings),
                'I could not finish a full review from the brain. Ask again, or tap Debug this.',
              ].filter(Boolean).join('\n\n');
            }
            if (canEdit && explainOnly && !/would you like/i.test(replyText)) {
              replyText = `${replyText.trim()}\n\nWould you like me to debug it, or start working on a change?`;
            }
            lastInspectPathsRef.current = inspectPaths;
            setInspectOfferId(assistantId);
            const focus = preferredLiveEditPath(inspectPaths) || preferredEntryPath(fileContentsRef.current);
            if (focus) {
              setSelectedFile(focus);
              setRightTab('code');
              setCodeOpen(true);
            }
            if (!canEdit) {
              replyText = `${replyText.trim()}\n\nYou have Read on this repo — you can look and discuss, not edit or push.`;
            }
          } else {
            const draft = streamDraftRef.current || routed.reply || '';
            let edits = collectFinishedEdits(draft);
            const cutOff = replyHasUnclosedFileBlock(draft);
            restoreGeneratedDraft();
            if (patchOnlyNamed) edits = filterEditsToPaths(edits, allowedPatchPaths);
            let spoken = stripFileBlocks(routed.reply);
            if (
              looksLikePromptEcho(spoken)
              || looksLikeUserAskEcho(spoken, rawContent)
              || looksLikePromptEcho(draft)
              || looksLikeUserAskEcho(draft, rawContent)
            ) {
              spoken = '';
            }

            if (edits.length > 0) {
              const applied = commitEdits(edits, { openPreview: true });
              changedPaths = applied.changedPaths;
              previewTouched = Boolean((applied as { previewTouched?: boolean }).previewTouched);
            } else if (patchOnlyNamed) {
              snapshotChanged();
              if (!changedPaths.length) {
                const visual = simpleVisualPatchEdits(fileContentsRef.current, rawContent);
                if (visual.length) {
                  const applied = commitEdits(visual, { openPreview: true });
                  changedPaths = applied.changedPaths;
              previewTouched = Boolean((applied as { previewTouched?: boolean }).previewTouched);
                  if (changedPaths.length) {
                    replyText = `Updated ${changedPaths.join(', ')} with a local color/name patch from your files — not a full model rewrite.`;
                  }
                }
              }
            } else if (wantsProjectFileEdits(rawContent) || looksLikeWebsiteBuild(rawContent)) {
              const fallback = scaffoldFallbackEdits(rawContent, fileContentsRef.current);
              if (fallback.length) {
                const applied = commitEdits(fallback, { openPreview: true });
                changedPaths = applied.changedPaths;
              previewTouched = Boolean((applied as { previewTouched?: boolean }).previewTouched);
                if (changedPaths.length) {
                  replyText = [
                    `Updated ${changedPaths.join(', ')}.`,
                    'Press **Start** to open the preview, or tell me what to change next.',
                  ].join('\n');
                }
              }
            }

            if (!replyText) {
              if (!changedPaths.length) {
                if (wantsProjectFileEdits(rawContent) || looksLikeWebsiteBuild(rawContent)) {
                  replyText = 'No file updates applied. The model didn’t return @@@FILE blocks. Try again or shorten the ask.';
                } else {
                  replyText = spoken && spoken.length > 40 && !cutOff
                    ? spoken
                    : unfinishedNote;
                }
              } else if (cutOff) {
                replyText = `Saved ${changedPaths.join(', ')}. The last file was cut off — send again to finish it.`;
              } else {
                replyText = spoken && spoken.length > 24
                  ? spoken
                  : (patchOnlyNamed
                    ? `Updated ${changedPaths.join(', ')}.`
                    : nativeDoneReply({ continued: hadExistingFiles || Boolean(revisingId) }));
              }
            }
          }

          bumpStep('done');
        }
      } catch (err) {
        waitOpen = false;
        if (stallTimer) window.clearTimeout(stallTimer);
        if (hardTimer) window.clearTimeout(hardTimer);
        if (typeTimerRef.current) {
          window.clearInterval(typeTimerRef.current);
          typeTimerRef.current = undefined;
        }
        void engineGenerateCancel();
        const stopped = err instanceof Error && /stopped/i.test(err.message);
        const stalled = err instanceof Error && /stalled|timed out/i.test(err.message);
        const draft = streamDraftRef.current || '';

        if (runId !== runIdRef.current) {
          replyText = '';
        } else if (!inspectOnly) {
          restoreGeneratedDraft();
          const edits = collectFinishedEdits(draft);
          const cutOff = replyHasUnclosedFileBlock(draft);
          if (edits.length) {
            bumpStep('apply');
            const applied = commitEdits(
              patchOnlyNamed ? filterEditsToPaths(edits, lastInspectPathsRef.current) : edits,
            );
            changedPaths = applied.changedPaths;
              previewTouched = Boolean((applied as { previewTouched?: boolean }).previewTouched);
          }
          if (stopped) {
            replyText = changedPaths.length
              ? (cutOff
                ? `Saved ${changedPaths.join(', ')}. Stopped before the last file finished.`
                : buildDoneSummary(buildLabel, { stopped: true, hadFiles: true }))
              : buildDoneSummary(buildLabel, { stopped: true, hadFiles: false });
            bumpStep('done');
          } else {
            if (!changedPaths.length && patchOnlyNamed) {
              const visual = simpleVisualPatchEdits(fileContentsRef.current, rawContent);
              if (visual.length) {
                const applied = commitEdits(visual);
                changedPaths = applied.changedPaths;
              previewTouched = Boolean((applied as { previewTouched?: boolean }).previewTouched);
                if (changedPaths.length) {
                  replyText = `Updated ${changedPaths.join(', ')} with a local color/name patch from your files — not a full model rewrite.`;
                }
              }
            }
            if (!changedPaths.length && (wantsProjectFileEdits(rawContent) || looksLikeWebsiteBuild(rawContent))) {
              const fallback = scaffoldFallbackEdits(rawContent, fileContentsRef.current);
              if (fallback.length) {
                const applied = commitEdits(fallback, { openPreview: true });
                changedPaths = applied.changedPaths;
              previewTouched = Boolean((applied as { previewTouched?: boolean }).previewTouched);
                if (changedPaths.length) {
                  replyText = [
                    `Created **${changedPaths.join(', ')}** so you can run this in Start.`,
                    stalled ? '(Brain stalled — used a local starter.)' : '',
                    'Press **Start** to open the preview.',
                  ].filter(Boolean).join('\n');
                }
              }
            }
            if (!replyText) {
            replyText = changedPaths.length
              ? (cutOff
                ? `Saved ${changedPaths.join(', ')}. The last file was cut off — send again to finish it.`
                : (stripFileBlocks(draft) || nativeDoneReply({ continued: hadExistingFiles || Boolean(revisingId) })))
              : (stalled || cutOff
                ? unfinishedNote
                : (wantsProjectFileEdits(rawContent)
                  ? 'I couldn’t produce file edits for that. Try: “Create index.html with Hello World”.'
                  : (stripFileBlocks(draft) || unfinishedNote)));
            }
            bumpStep('done');
          }
        }

        if (runId === runIdRef.current) {
          if (inspectOnly) {
            const spoken = stripFileBlocks(streamDraftRef.current);
            const usable = spoken && !looksLikePromptEcho(spoken) && spoken.length > 40
              && !/get started with coding/i.test(spoken)
              && !/^I read \d+ file/i.test(spoken);
            if (usable) {
              replyText = spoken.trim();
            } else if (explainOnly) {
              replyText = [
                describeProjectFromFiles(fileContentsRef.current, buildLabel),
                '',
                'The coding brain did not finish a full read. This is a local file scan — ask again to try the model.',
              ].join('\n');
            } else {
              replyText = [
                formatLocalFindings(scanProjectFindings(fileContentsRef.current, rawContent)),
                stopped
                  ? 'Stopped before the review finished.'
                  : 'I could not finish a full review from the brain. Ask again, or tap Debug this.',
              ].filter(Boolean).join('\n\n');
            }
            if (canEdit && explainOnly && !/would you like/i.test(replyText)) {
              replyText = `${replyText.trim()}\n\nWould you like me to debug it, or start working on a change?`;
            }
            const focus = preferredLiveEditPath(
              pickFilesForInspect(fileContentsRef.current, rawContent),
            ) || preferredEntryPath(fileContentsRef.current);
            if (focus) {
              setSelectedFile(focus);
              setRightTab('code');
              setCodeOpen(true);
            }
            setInspectOfferId(assistantId);
            if (!canEdit) {
              replyText = `${replyText.trim()}\n\nYou have Read on this repo — you can look and discuss, not edit or push.`;
            }
            bumpStep('done');
          }
        }
      }

      buildAbortRef.current = null;
      if (!String(replyText || '').trim()) {
        replyText = aborted
          ? '(stopped)'
          : inspectOnly
            ? describeProjectFromFiles(fileContentsRef.current, buildLabel)
            : 'No reply finished. Send again.';
      }
      if (!inspectOnly && changedPaths.length) {
        replyText = formatCodeChatReply(rawContent, changedPaths, replyText, { previewTouched: previewTouched || touchesPreviewServing(changedPaths, fileContentsRef.current) });
      }
      if (replyText) replyText = withTiming(replyText);
      if (
        replyText
        && changedPaths.length
        && /stalled|timed out|stopped mid-file|did not finish|cut off|could not finish|offline starter|local starter/i.test(replyText)
      ) {
        replyText = appendScaffoldHonesty(replyText);
      }

      if (runId !== runIdRef.current) {
        if (replyText) {
          const existing = loadProjectThread(pid);
          const mapped = existing.map(m => (
            m.id === assistantId
              ? { ...m, content: replyText, provider_used: provider }
              : m
          ));
          const saved = mapped.some(m => m.id === assistantId)
            ? mapped
            : [...existing, { ...assistantPlaceholder, content: replyText, provider_used: provider }];
          saveProjectThread(pid, saved);
        }
        setBuildLive(prev => prev?.assistantId === assistantId ? null : prev);
        return;
      }

      if (changedPaths.length) {
        try {
          await updateProject(pid, {
            status: 'idle',
            build_status: 'idle',
            last_prompt: content,
          });
        } catch { /* ignore */ }
      }

      setBuildLive(prev => prev?.assistantId === assistantId ? null : prev);
      setMessages(prev => {
        const next = prev.map(m => (
          m.id === assistantId
            ? { ...m, content: replyText || '(no response)', provider_used: provider }
            : m
        ));
        persistLocalThread(next);
        return next;
      });

      try {
        await saveChatMessage(pid, 'assistant', replyText);
      } catch { /* ignore */ }
    })().finally(() => {
      buildAbortRef.current = null;
      setBuildLive(prev => prev?.assistantId === assistantId ? null : prev);
    });
  };

  const resizeComposer = () => {
    const el = textareaRef.current;
    if (!el) return;
    const value = el.value || '';
    if (!value) {
      el.style.height = '';
      el.style.maxHeight = '';
      el.style.overflowY = 'hidden';
      setComposerTall(attachedImages.length > 0);
      return;
    }
    // Leave pill layout immediately so wrapped lines are never clipped.
    const wantsTall = value.includes('\n') || value.length > 24 || attachedImages.length > 0;
    setComposerTall(wantsTall);

    const applyHeight = () => {
      const box = textareaRef.current;
      if (!box) return;
      box.style.height = 'auto';
      box.style.maxHeight = '';
      // Force layout so scrollHeight reflects full wrapped text.
      void box.offsetHeight;
      const raw = box.scrollHeight;
      const max = Math.round(window.innerHeight * 0.4);
      const minPx = wantsTall ? 56 : 22;
      const next = Math.max(minPx, Math.min(Math.max(raw, minPx), max));
      box.style.height = `${next}px`;
      box.style.overflowY = raw > max ? 'auto' : 'hidden';
    };

    applyHeight();
    // Second pass after tall chrome reflows (full width).
    requestAnimationFrame(applyHeight);
  };

  const onChatInput = (value: string) => {
    setChatInput(value);
    requestAnimationFrame(resizeComposer);
  };

  useEffect(() => {
    requestAnimationFrame(resizeComposer);
  }, [chatInput, attachedImages.length]);

  const stopBuild = () => {
    void engineGenerateCancel();
    buildAbortRef.current?.abort();
    buildAbortRef.current = null;
    setBuildLive(null);
  };

  const onPickImages = (files: FileList | null) => {
    if (!files?.length) return;
    const next = Array.from(files).slice(0, 4).map(file => ({
      id: crypto.randomUUID(),
      url: URL.createObjectURL(file),
      name: file.name,
    }));
    setAttachedImages(prev => [...prev, ...next].slice(0, 6));
    const uid = user?.id ?? 'guest';
    const pid = project?.id || projectId || '';
    const attachMsgs: ChatMessage[] = next.map(img => ({
      id: crypto.randomUUID(),
      user_id: uid,
      project_id: pid,
      role: 'user' as const,
      content: [
        encodeChatAttach({ kind: 'image', name: img.name, count: 1 }),
        `![${img.name.replace(/[\[\]]/g, '')}](${img.url})`,
      ].join('\n'),
      provider_used: null,
      created_at: new Date().toISOString(),
    }));
    const note: ChatMessage = {
      id: crypto.randomUUID(),
      user_id: uid,
      project_id: pid,
      role: 'assistant',
      content: 'Got your image in the chat. Ask me what you want — describe it, debug from a screenshot, or use it as a reference.',
      provider_used: 'ARK',
      created_at: new Date().toISOString(),
    };
    setMessages(prev => {
      const merged = [...prev, ...attachMsgs, note];
      messagesRef.current = merged;
      if (pid) saveProjectThread(pid, merged);
      return merged;
    });
  };

  const removeImage = (id: string) => {
    setAttachedImages(prev => {
      const found = prev.find(i => i.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter(i => i.id !== id);
    });
  };

  const handleBuild = () => {
    if (buildRunning) {
      setBuildRunning(false);
      setBuildProgress(0);
      if (project && window.arkDesktop?.previewStop) {
        void window.arkDesktop.previewStop(project.id);
      }
      return;
    }
    setBuildRunning(true);
    setBuildProgress(10);
    setCodeOpen(true);
    setPreviewReady(false);

    void (async () => {
      try {
        setBuildProgress(40);
        const native = isNativeMobileTree(fileContents);
        const device = previewDevice
          || (native
            ? (resolveDevices(inferMobileTargetFromFiles(fileContents) || 'ios', '').ios || null)
            : null);
        if (window.arkDesktop?.previewStart && project) {
          await refreshLivePreview(fileContents, device);
          setBuildProgress(100);
          return;
        }
        const payloadFiles = packDiskFiles(fileContents, messagesRef.current);
        const composed = composePreviewHtml(fileContents);
        const html = composed || payloadFiles['ark-preview.html'] || payloadFiles['index.html'] || '';
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          setLivePreviewUrl(url);
          setPreviewUrl(url);
          setPreviewReady(true);
          setBuildProgress(100);
        window.open(url, 'ark-preview');
      } catch (err) {
        setPreviewReady(false);
        setBuildProgress(0);
        console.error(err);
      } finally {
        setBuildRunning(false);
      }
    })();
  };

  const dragExplorer = useCallback((dx: number) => {
    setExplorerWidth(w => Math.min(420, Math.max(160, w + dx)));
  }, []);

  const dragCode = useCallback((dx: number) => {
    setCodeWidth(w => Math.min(560, Math.max(260, w - dx)));
  }, []);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const insertNode = (
    nodes: FileNode[],
    parentPath: string,
    node: FileNode,
    currentPath = '',
  ): FileNode[] => {
    if (!parentPath) {
      if (nodes.some(n => n.name === node.name)) return nodes;
      return [...nodes, node].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    return nodes.map(n => {
      const full = currentPath ? `${currentPath}/${n.name}` : n.name;
      if (n.type === 'folder' && full === parentPath) {
        const children = n.children ?? [];
        if (children.some(c => c.name === node.name)) return n;
        const nextChildren = [...children, node].sort((a, b) => {
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        return { ...n, children: nextChildren };
      }
      if (n.type === 'folder' && n.children) {
        return { ...n, children: insertNode(n.children, parentPath, node, full) };
      }
      return n;
    });
  };

  const commitCreate = () => {
    if (!canEdit) return;
    if (!creating) return;
    const raw = createName.trim().replace(/[\\/]/g, '');
    if (!raw) {
      setCreating(null);
      setCreateName('');
      return;
    }
    const name = creating.kind === 'folder'
      ? raw
      : raw.includes('.') ? raw : `${raw}.tsx`;
    const node: FileNode = creating.kind === 'folder'
      ? { name, type: 'folder', children: [] }
      : {
          name,
          type: 'file',
          language: name.split('.').pop(),
        };
    setFileTree(prev => insertNode(prev, creating.parentPath, node));
    if (projectId) touchRecentProject(projectId, project?.name);
    if (creating.parentPath) {
      setExpandedFolders(prev => new Set(prev).add(creating.parentPath));
    }
    if (creating.kind === 'file') {
      const fullPath = creating.parentPath ? `${creating.parentPath}/${name}` : name;
      const seed = name.endsWith('.css')
        ? `/* ${fullPath} */\n`
        : name.endsWith('.html')
          ? `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8" /><title>New page</title></head>\n<body></body>\n</html>\n`
          : `// ${fullPath}\n`;
      setSelectedFile(fullPath);
      setFileContents(prev => ({
        ...prev,
        [fullPath]: seed,
        [name]: seed,
      }));
      setRightTab('code');
      setCodeOpen(true);
    }
    setCreating(null);
    setCreateName('');
  };

  const startCreate = (kind: 'file' | 'folder') => {
    if (!canEdit) return;
    const parentPath = selectedFile.includes('.')
      ? selectedFile.split('/').slice(0, -1).join('/')
      : (selectedFile && !selectedFile.includes('.') ? selectedFile : '');
    if (parentPath) {
      setExpandedFolders(prev => new Set(prev).add(parentPath));
    }
    setCreating({ kind, parentPath });
    const defaultFile = parentPath === 'css'
      ? 'styles.css'
      : parentPath === 'js'
        ? 'app.js'
        : 'index.html';
    setCreateName(kind === 'folder' ? 'css' : defaultFile);
  };

  const openPreviewInBrowser = () => {
    const url = livePreviewUrl || previewUrl;
    if (!url || url.startsWith('blob:') || url.includes('127.0.0.1:0')) {
      setSandboxNote('No preview URL yet — ask ARK to create a page, then open Preview.');
      window.setTimeout(() => setSandboxNote(null), 3200);
      return;
    }
    void openInSystemBrowser(url);
  };

  const renderFileTree = (nodes: FileNode[], path = ''): React.ReactNode =>
    nodes.map(node => {
      const fullPath = path ? `${path}/${node.name}` : node.name;
      const isExpanded = expandedFolders.has(fullPath);
      const isSelected = selectedFile === fullPath;

      if (node.type === 'folder') {
        return (
          <div key={fullPath}>
            <button
              type="button"
              onClick={() => {
                toggleFolder(fullPath);
                setSelectedFile(fullPath);
              }}
              className={`flex items-center gap-1 w-full px-2 py-1 text-xs rounded transition-colors ${
                isSelected ? 'bg-sky-500/10 text-sky-300' : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
              }`}
            >
              <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              {isExpanded
                ? <FolderOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                : <Folder className="w-3.5 h-3.5 text-content-tertiary shrink-0" />}
              <span className="truncate">{node.name}</span>
            </button>
            {isExpanded && node.children && (
              <div className="ml-3 border-l border-surface-border pl-1">
                {renderFileTree(node.children, fullPath)}
              </div>
            )}
          </div>
        );
      }

      return (
        <button
          key={fullPath}
          type="button"
          onClick={() => {
            setSelectedFile(fullPath);
            setRightTab('code');
            setCodeOpen(true);
          }}
          className={`flex items-center gap-1 w-full px-2 py-1 text-xs rounded transition-colors ${
            isSelected ? 'bg-sky-500/10 text-sky-300' : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
          }`}
        >
          <ChevronRight className="w-3 h-3 opacity-0 shrink-0" />
          {node.language === 'md'
            ? <FileText className="w-3.5 h-3.5 shrink-0 text-content-tertiary" />
            : <FileCode className={`w-3.5 h-3.5 shrink-0 ${fileTintClass(node.name)}`} />}
          <span className="truncate">{node.name}</span>
          {fileChanges.some(f => f.path === fullPath || f.path.endsWith(`/${node.name}`)) && (
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Changed" />
          )}
        </button>
      );
    });

  const explorerTree = useMemo(
    () => (fileTree.length > 0 ? fileTree : buildFileTreeFromPaths(fileContents)),
    [fileTree, fileContents],
  );
  const livePageHtml = useMemo(() => composePreviewHtml(fileContents).trim(), [fileContents]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-content-tertiary">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const fileKey = selectedFile ? (selectedFile.split('/').pop() ?? selectedFile) : '';
  const codeBody = selectedFile
    ? (fileContents[selectedFile] ?? fileContents[fileKey] ?? '')
    : '';
  const showBrowserChrome = Boolean(
    (livePreviewUrl && !livePreviewUrl.includes('127.0.0.1:0')) || previewReady,
  ) && !isNativeMobileTree(fileContents);

  const buildLabel = buildRunning
    ? `Preparing preview ${buildProgress}%`
    : previewReady || buildProgress >= 100
      ? 'Preview ready (static HTML)'
      : null;

  return (
    <div className="h-full min-w-0 flex flex-col min-h-0 relative overflow-hidden">
      <div
        className={`absolute inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-none transition-opacity duration-150 ${
          dragOverCode ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden={!dragOverCode}
      >
        <div className="rounded-2xl border border-sky-400/40 bg-ark-navy-900/95 px-6 py-4 text-center shadow-xl">
          <p className="text-sm font-medium text-content-primary">Drop folder or files</p>
          <p className="text-[11px] text-content-tertiary mt-1">They open in Explorer for this Code project</p>
        </div>
      </div>
      {/* Header */}
      <div className="shrink-0 border-b border-surface-border px-3 sm:px-4 py-2 flex items-center justify-between gap-2 sm:gap-3 bg-ark-navy-900/30 pr-24 sm:pr-28 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={() => navigate({ name: 'projects' })} className="ark-btn-ghost text-xs shrink-0">
            Projects
          </button>
          <ChevronRight className="w-3 h-3 text-content-tertiary shrink-0" />
          <span className="text-sm font-medium text-content-primary truncate">{project.name}</span>
          {myAccess === 'read' && (
            <span className="text-[10px] rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-200 px-1.5 py-0.5 shrink-0">
              Read
            </span>
          )}
          {myAccess === 'write' && gitInfo?.remote && (
            <span className="text-[10px] rounded-full border border-surface-border text-content-tertiary px-1.5 py-0.5 shrink-0">
              Write
            </span>
          )}
          {diskRoot ? (
            <span
              className={`text-[10px] truncate max-w-[min(420px,42vw)] ${workspaceInPlace ? 'text-sky-300/90' : 'text-content-tertiary'}`}
              title={diskRoot}
            >
              {workspaceInPlace ? 'Editing on disk: ' : 'Project: '}{diskRoot}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {projectId ? (
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setGithubMenuOpen(v => !v)}
                className="h-8 px-2 rounded-lg flex items-center gap-1 text-[11px] text-content-secondary hover:text-content-primary hover:bg-surface-hover"
              >
                <GitBranch className="w-3.5 h-3.5" />
                GitHub
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
              {githubMenuOpen && (
                <>
                  <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Close menu" onClick={() => setGithubMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg border border-surface-border bg-ark-navy-900 shadow-xl py-1">
                    <button type="button" className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-surface-hover" onClick={() => { setGithubMenuOpen(false); void cloneFromUrl(); }}>Clone from URL…</button>
                    <button type="button" className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-surface-hover" onClick={() => { setGithubMenuOpen(false); setGithubPickerOpen(true); }}>My repositories…</button>
                    <button type="button" className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-surface-hover" onClick={() => { setGithubMenuOpen(false); void headerGitStatus(); }}>Git status</button>
                    <button type="button" className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-surface-hover disabled:opacity-40" disabled={gitBusy || !canEdit} onClick={() => { setGithubMenuOpen(false); void headerCommit(); }}>Commit changes…</button>
                    <button type="button" className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-surface-hover disabled:opacity-40" disabled={gitBusy || !canEdit} onClick={() => { setGithubMenuOpen(false); void headerPull(); }}>Pull latest</button>
                    <button type="button" className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-surface-hover disabled:opacity-40" disabled={gitBusy || !canEdit} onClick={() => { setGithubMenuOpen(false); void headerPush(); }}>Push to GitHub…</button>
                    <div className="my-1 border-t border-surface-border/70" />
                    <button type="button" className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-surface-hover disabled:opacity-40" disabled={gitBusy || !canEdit} onClick={() => { setGithubMenuOpen(false); void headerCreateRepo(); }}>Create repository…</button>
                    <button type="button" className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-surface-hover disabled:opacity-40" disabled={gitBusy || !canEdit} onClick={() => { setGithubMenuOpen(false); void headerCreatePR(); }}>Open pull request…</button>
                  </div>
                </>
              )}
            </div>
          ) : null}
          {gitInfo?.git ? (
            <div className="hidden md:flex items-center gap-1 pl-1 ml-0.5 border-l border-surface-border/70">
              <span className="flex items-center gap-1 text-[11px] text-content-tertiary px-1" title={gitInfo.remote || 'Local git'}>
                <GitBranch className="w-3 h-3" />
                {gitInfo.branch || 'HEAD'}
                {gitInfo.dirty
                  ? <span className="text-amber-400/90">· {gitInfo.dirty} file{gitInfo.dirty === 1 ? '' : 's'} changed</span>
                  : <span className="text-content-tertiary/80">· saved</span>}
              </span>
            <button
              type="button"
                onClick={() => void headerPush()}
                disabled={gitBusy || !canEdit}
                title={canEdit ? 'Save a commit if needed, then push to GitHub' : 'Read access — you cannot push'}
                className="h-8 px-2 rounded-lg flex items-center gap-1 text-[11px] text-content-secondary hover:text-content-primary hover:bg-surface-hover disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                Push
            </button>
        </div>
          ) : null}
          <button
            type="button"
            onClick={() => setExplorerOpen(v => !v)}
            title={explorerOpen ? 'Hide explorer' : 'Show explorer'}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              explorerOpen ? 'bg-surface-hover text-content-primary' : 'text-content-tertiary hover:text-content-primary hover:bg-surface-hover'
            }`}
            aria-label="Toggle explorer"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setCodeOpen(v => !v)}
            title={codeOpen ? 'Hide code' : 'Show code'}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              codeOpen ? 'bg-surface-hover text-content-primary' : 'text-content-tertiary hover:text-content-primary hover:bg-surface-hover'
            }`}
            aria-label="Toggle code panel"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Panes: Explorer | Chat | Code */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {explorerOpen && (
          <>
            <div className="shrink-0 flex flex-col bg-ark-navy-900/20 overflow-hidden min-w-0 max-w-[38vw]" style={{ width: explorerWidth }}>
              <div className="shrink-0 px-2 py-2 border-b border-surface-border/60">
                {buildLive ? (
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-amber-400/90 font-semibold px-1">
                      {buildLive.kind === 'inspect'
                        ? 'Inspecting'
                        : buildLive.kind === 'fix'
                          ? 'Writing'
                          : 'Building'}
                    </p>
                    <p className="text-sm font-semibold text-content-primary truncate px-1 mt-0.5">
                      {buildLive.label}
                    </p>
                    {buildLive.plannedFiles.length > 0 && (
                      <p className="text-[10px] text-content-tertiary truncate px-1 mt-1">
                        {buildLive.plannedFiles.join(' · ')}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] uppercase tracking-wider text-content-tertiary font-semibold px-1">
                    Explorer
                  </p>
                )}
              </div>
              <div className="shrink-0 px-2 py-1.5 flex items-center justify-end gap-0.5">
                  {explorerTree.length > 0 && (
                    <>
                  <button
                    type="button"
                    onClick={() => setFindOpen(v => !v)}
                    title="Find in files (Ctrl+F)"
                    aria-label="Find in files"
                    className={`w-6 h-6 rounded-md flex items-center justify-center ${
                      findOpen ? 'text-sky-300 bg-sky-500/10' : 'text-content-tertiary hover:text-content-primary hover:bg-surface-hover'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startCreate('file')}
                    title={canEdit ? 'New file' : 'Read access — you cannot add files'}
                    aria-label="New file"
                    disabled={!canEdit}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover disabled:opacity-40"
                  >
                    <FilePlus2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startCreate('folder')}
                    title={canEdit ? 'New folder' : 'Read access — you cannot add folders'}
                    aria-label="New folder"
                    disabled={!canEdit}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover disabled:opacity-40"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                  </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setExplorerOpen(false)}
                    className="text-[10px] text-content-tertiary hover:text-content-secondary px-1"
                  >
                    Hide
                  </button>
                </div>
              {findOpen && (
                <div className="px-2 pb-2 border-b border-surface-border/50">
                  <input
                    value={findQuery}
                    onChange={e => setFindQuery(e.target.value)}
                    placeholder="Find in files"
                    className="w-full bg-transparent text-xs text-content-primary outline-none border border-surface-border rounded-md px-2 py-1.5"
                    autoFocus
                  />
                  <div className="mt-1.5 max-h-40 overflow-auto space-y-0.5">
                    {findQuery.trim() && findHits.length === 0 ? (
                      <p className="text-[10px] text-content-tertiary px-1 py-2">No matches</p>
                    ) : (
                      <>
                        {findTotal > 40 && (
                          <p className="text-[10px] text-content-tertiary px-1 py-1">
                            Showing 40 of {findTotal}
                          </p>
                        )}
                        {findHits.slice(0, 40).map(hit => (
                          <button
                            key={`${hit.path}:${hit.line}:${hit.text.slice(0, 24)}`}
                            type="button"
                            onClick={() => openPathInEditor(hit.path, hit.line)}
                            className="w-full text-left px-1.5 py-1 rounded-md hover:bg-surface-hover"
                          >
                            <p className="text-[10px] text-sky-300 truncate">{hit.path}:{hit.line}</p>
                            <p className="text-[10px] text-content-tertiary truncate">{hit.text}</p>
                          </button>
                        ))}
                      </>
                    )}
              </div>
                </div>
              )}
              {creating && (
                <div className="px-2 pb-2">
                  <div className="rounded-lg border border-surface-border bg-ark-navy-950/80 p-2">
                    <p className="text-[10px] text-content-tertiary mb-1">
                      New {creating.kind} in {creating.parentPath || 'root'}
                    </p>
                    <input
                      value={createName}
                      onChange={e => setCreateName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitCreate();
                        if (e.key === 'Escape') {
                          setCreating(null);
                          setCreateName('');
                        }
                      }}
                      className="w-full bg-transparent text-xs text-content-primary outline-none border border-surface-border rounded-md px-2 py-1.5 mb-1.5"
                      autoFocus
                    />
                    <div className="flex gap-1">
                      <button type="button" onClick={() => { setCreating(null); setCreateName(''); }} className="flex-1 text-[10px] py-1 rounded-md text-content-tertiary hover:bg-surface-hover">
                        Cancel
                      </button>
                      <button type="button" onClick={commitCreate} className="flex-1 text-[10px] py-1 rounded-md bg-surface-hover text-content-primary">
                        Create
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-auto p-2">
                {explorerTree.length === 0 ? (
                  myAccess === 'read' ? (
                    <p className="text-[11px] text-content-tertiary px-2 py-6 leading-relaxed text-center">
                      You have Read on this project. You can inspect and discuss in chat — you cannot add files.
                    </p>
                  ) : (
                  <StudioEmptyState />
                  )
                ) : (
                  renderFileTree(explorerTree)
                )}
              </div>
            </div>
            <ResizeHandle onDrag={dragExplorer} />
          </>
        )}

        {/* Chat center */}
        <div className="flex-1 min-w-0 flex flex-col bg-ark-navy-950">
          {/* Compact toolbar — no permanent ARK Agent header */}
          <div className="shrink-0 h-10 px-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => setChangesOpen(v => !v)}
                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors ${
                  changesOpen || fileChanges.length > 0
                    ? 'bg-surface-hover text-content-primary border border-surface-border'
                    : 'text-content-tertiary hover:text-content-secondary hover:bg-surface-hover'
                }`}
                title="View changes"
              >
                <span>Changes</span>
                {fileChanges.length > 0 ? (
                  <span className="flex items-center gap-1 tabular-nums">
                    <span className="text-emerald-400">+{fileChanges.reduce((n, f) => n + f.added, 0)}</span>
                    <span className="text-red-400">-{fileChanges.reduce((n, f) => n + f.removed, 0)}</span>
                  </span>
                ) : (
                  <span className="text-content-tertiary/70">0</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowHistory(v => !v)}
                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] transition-colors ${
                  showHistory
                    ? 'bg-surface-hover text-content-primary'
                    : 'text-content-tertiary hover:text-content-secondary hover:bg-surface-hover'
                }`}
                title="Build history"
              >
                <History className="w-3 h-3" />
                History
              </button>
            </div>
            <span className="text-[10px] text-content-tertiary truncate">Chat</span>
          </div>

          {changesOpen && (
            <div className="shrink-0 border-b border-surface-border bg-ark-navy-900/40 px-3 py-2.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] text-content-secondary">Uncommitted file edits</p>
                <button
                  type="button"
                  onClick={() => setFileChanges([])}
                  className="text-[10px] text-content-tertiary hover:text-content-secondary"
                >
                  Clear
                </button>
              </div>
              {fileChanges.length === 0 ? (
                <p className="text-[11px] text-content-tertiary">No changes yet. Ask ARK to edit the project.</p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {fileChanges.map(file => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => {
                        setSelectedFile(file.path);
                        setRightTab('code');
                        setCodeOpen(true);
                      }}
                      className="w-full flex items-center justify-between text-[11px] px-2 py-1.5 rounded-md bg-surface-hover/60 hover:bg-surface-hover text-left"
                    >
                      <span className="text-content-primary font-mono truncate">{file.path}</span>
                    <span className="tabular-nums shrink-0 ml-2">
                        <span className="text-emerald-400">+{file.added}</span>
                      {' '}
                        <span className="text-red-400">-{file.removed}</span>
                    </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {showHistory && (
            <div className="shrink-0 border-b border-surface-border bg-ark-navy-900/40 px-3 py-2.5 max-h-40 overflow-y-auto">
              <p className="text-[11px] text-content-secondary mb-2">Build runs</p>
              {runHistory.length === 0 ? (
                <p className="text-[11px] text-content-tertiary">
                  Fresh build steps appear here after you ask ARK to create something new.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {runHistory.map(run => (
                    <div key={run.id} className="flex items-start gap-2 text-[11px]">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-content-primary truncate">{run.title}</p>
                        <p className="text-content-tertiary">{run.at} · {run.steps}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-auto px-4 py-4 space-y-3">
            {messages.length === 0 && !buildLive && (
              <div className="text-center py-10 px-4">
                <p className="text-sm text-content-secondary mb-1">Start building with chat</p>
                <p className="text-xs text-content-tertiary max-w-sm mx-auto">
                  {canEdit
                    ? 'Ask ARK to add a page, fix a bug, or build an iPhone / Android app. Fresh builds show progress briefly, then in History.'
                    : 'You have Read on this project — you can inspect and discuss the code, but you cannot edit or push.'}
                </p>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className="w-7 h-7 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
                  {msg.role === 'user'
                    ? <UserIcon className="w-3.5 h-3.5 text-content-secondary" />
                    : <Bot className="w-3.5 h-3.5 text-content-secondary" />}
                </div>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm text-content-primary ${
                  msg.role === 'user' ? 'bg-surface-hover' : 'bg-ark-navy-900 border border-surface-border'
                }`}>
                  {msg.role === 'assistant' && buildLive?.assistantId === msg.id ? (
                    <BuildProgressBubble
                      label={buildLive.label}
                      step={buildLive.step}
                      plannedFiles={buildLive.plannedFiles}
                      startedAt={buildLive.startedAt}
                      kind={buildLive.kind}
                      focusFile={buildLive.focusFile}
                    />
                  ) : msg.role === 'user' && editingUserId === msg.id ? (
                    <textarea
                      value={editDraft}
                      onChange={e => setEditDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          const next = editDraft.trim();
                          if (!next || next === msg.content) {
                            setEditingUserId(null);
                            return;
                          }
                          setRevertPrompt({ userId: msg.id, content: next });
                        }
                        if (e.key === 'Escape') setEditingUserId(null);
                      }}
                      rows={Math.min(8, editDraft.split('\n').length + 1)}
                      className="w-full bg-transparent text-sm text-content-primary outline-none resize-none leading-relaxed"
                      autoFocus
                    />
                  ) : msg.role === 'user' ? (
                    isChatAttachMessage(msg.content) || /!\[[^\]]*\]\([^)]+\)/.test(msg.content) ? (
                      <div className="text-left w-full">
                        <MessageContent content={msg.content} />
                      </div>
                    ) : (
                    <button
                      type="button"
                      className="text-left w-full"
                      title="Click to edit this prompt"
                      onClick={() => {
                        setEditingUserId(msg.id);
                        setEditDraft(msg.content);
                      }}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </button>
                    )
                  ) : (
                    <div>
                    {msg.content && isLikelyErrorMessage(msg.content)
                      ? <ArkErrorInline message={msg.content} />
                      : msg.content
                        ? <AssistantBuildReply content={msg.content} onOpenPath={openPathInEditor} />
                        : <Loader2 className="w-3.5 h-3.5 animate-spin text-content-tertiary" />}
                    {inspectOfferId === msg.id && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <button type="button" className="text-[10px] rounded-full bg-sky-600 text-white px-2.5 py-1" onClick={() => { setInspectOfferId(null); void handleSendChat('Debug this project. Find bugs, risky code, and broken paths.'); }}>
                          Debug this
                        </button>
                        <button type="button" className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary" onClick={() => { setInspectOfferId(null); void handleSendChat('Tell me what this app or folder is about and how it is structured.'); }}>
                          What is this?
                        </button>
                        <button type="button" className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary" onClick={() => { setInspectOfferId(null); void handleSendChat('Explain the architecture and how the main pieces connect.'); }}>
                          Explain architecture
                        </button>
                        <button type="button" className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary" onClick={() => { setInspectOfferId(null); void handleSendChat('Find the most likely problems and how to fix them.'); }}>
                          Find problems
                        </button>
                        {canEdit && (
                          <button type="button" className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary" onClick={() => { setInspectOfferId(null); void handleSendChat('Suggest a concrete fix for the top issues and apply it.'); }}>
                            Fix it
                          </button>
                        )}
                        {canEdit && (
                          <button type="button" className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary" onClick={() => { setChatInput('Change '); textareaRef.current?.focus(); }}>
                            Change something
                          </button>
                        )}
                        <button type="button" className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-tertiary" onClick={() => setInspectOfferId(null)}>
                          Dismiss
                        </button>
                </div>
                    )}
                    {mobileOfferId === msg.id && canEdit && mobileOfferStep === 'platform' && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <button
                          type="button"
                          className="text-[10px] rounded-full bg-sky-600 text-white px-2.5 py-1"
                          onClick={() => {
                            setMobileOfferStep('family');
                            setFamilyPlatform('ios');
                          }}
                        >
                          Apple
                        </button>
                        <button
                          type="button"
                          className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary"
                          onClick={() => {
                            setMobileOfferStep('family');
                            setFamilyPlatform('android');
                          }}
                        >
                          Android
                        </button>
                        <button
                          type="button"
                          className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary"
                          onClick={() => {
                            setMobileOfferStep('family');
                            setFamilyPlatform('both');
                          }}
                        >
                          Both
                        </button>
                        <button
                          type="button"
                          className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary"
                          onClick={() => {
                            setMobileOfferId(null);
                            void handleSendChat(`${mobileOfferPrompt}\n\n${WEBSITE_BUILD_MARK}`);
                          }}
                        >
                          Website
                        </button>
                      </div>
                    )}
                    {mobileOfferId === msg.id && canEdit && mobileOfferStep === 'family' && familyPlatform && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {devicesForChips(familyPlatform).map(device => (
                          <button
                            key={device.id}
                            type="button"
                            className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary"
                            onClick={() => {
                              setMobileOfferId(null);
                              previewDeviceRef.current = device;
                              setPreviewDevice(device);
                              if (isNativeMobileTree(fileContentsRef.current)) {
                                const target = inferMobileTargetFromFiles(fileContentsRef.current)
                                  || familyPlatform
                                  || 'ios';
                                const locked = layoutLockEdits(
                                  fileContentsRef.current,
                                  layoutLockPrompt(device),
                                  target === 'both' ? 'ios' : target,
                                );
                                if (locked.length) {
                                  applyWorkspaceEdits(locked);
                                  postAssistantNote(`Locked the canvas to ${deviceChipLabel(device)}. Zoom with Ctrl +/- — the window stays ${device.width}×${device.height}.`);
                                  return;
                                }
                              }
                              void handleSendChat(`${mobileOfferPrompt}\n\n${sizedBuildPrompt(device)}`);
                            }}
                          >
                            {deviceChipLabel(device)}
                          </button>
                        ))}
                      </div>
                    )}
                    {deviceOfferId === msg.id && canEdit && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {devicesForChips(
                          inferMobileTargetFromFiles(fileContents)
                            || classifyMobileTarget(msg.content)
                            || 'ios',
                        ).map(device => (
                          <button
                            key={device.id}
                            type="button"
                            className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary"
                            onClick={() => {
                              setDeviceOfferId(null);
                              previewDeviceRef.current = device;
                              setPreviewDevice(device);
                              const native = isNativeMobileTree(fileContentsRef.current);
                              if (native) {
                                const target = inferMobileTargetFromFiles(fileContentsRef.current)
                                  || classifyMobileTarget(mobileOfferPrompt || msg.content)
                                  || 'ios';
                                const locked = layoutLockEdits(fileContentsRef.current, layoutLockPrompt(device), target);
                                if (locked.length) {
                                  applyWorkspaceEdits(locked);
                                  postAssistantNote(`Locked the canvas to ${deviceChipLabel(device)}. Zoom with Ctrl +/- — the window stays ${device.width}×${device.height}.`);
                                  return;
                                }
                              }
                              void handleSendChat(layoutLockPrompt(device));
                            }}
                          >
                            {deviceChipLabel(device)}
                          </button>
                        ))}
                      </div>
                    )}
                    {shipOfferId === msg.id && canEdit && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <button type="button" className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary" onClick={() => void headerPush()}>
                          Push to GitHub?
                        </button>
                        {chatPlugins.some(p => p.id === 'slack') && getPluginRuntime('slack', loadPluginState()).permissions.includes('write') && (
                          <button type="button" className="text-[10px] rounded-full border border-surface-border px-2.5 py-1 text-content-secondary" onClick={() => void handleSendChat('Summarize this fix to #dev')}>
                            Post to Slack
                          </button>
                        )}
                      </div>
                    )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer: grows with text + image attach */}
          <div className="shrink-0 p-3 space-y-2 overflow-visible">
            {attachBusy && (
              <p className="text-[11px] text-sky-300/90 px-1 tabular-nums">
                {attachProgressLabel || 'Uploading…'}
              </p>
            )}
            {sandboxNote && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90 flex items-start justify-between gap-2">
                <p>{sandboxNote}</p>
                <button type="button" className="shrink-0" onClick={() => setSandboxNote(null)} aria-label="Dismiss">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {chatPlugins.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-0.5">
                {chatPlugins.map(plugin => (
                  <button
                    key={plugin.id}
                    type="button"
                    onClick={() => {
                      const action = plugin.actions[0];
                      setChatInput(action?.prompt ?? `Using ${plugin.name}, `);
                      requestAnimationFrame(() => textareaRef.current?.focus());
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-ark-navy-900/60 px-2.5 py-1 text-[11px] text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
                    title={plugin.description}
                  >
                    <BrandMark id={plugin.id} name={plugin.name} initial={plugin.initial} tone={plugin.tone} size="xs" />
                    {plugin.name}
                  </button>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => {
                onPickImages(e.target.files);
                e.target.value = '';
              }}
            />
            {composerMode && (
              <div className="flex items-center gap-2 px-1">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-hover/60 px-2.5 py-0.5 text-[11px] leading-none text-content-secondary capitalize">
                  {composerMode}
                  <button
                    type="button"
                    onClick={() => setComposerMode(null)}
                    className="text-content-tertiary hover:text-content-primary"
                    aria-label="Clear mode"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              </div>
            )}
            {Object.keys(fileContents).length > 0 && (
              <div className="px-1 text-[10px] text-content-tertiary">
                {Object.keys(fileContents).length} file{Object.keys(fileContents).length === 1 ? '' : 's'} in Explorer — ask in chat to debug or explain
              </div>
            )}
            <div className={`flex gap-2 min-w-0 ${composerTall ? 'items-end' : 'items-center'}`}>
            <div
              className={`flex-1 min-w-0 border border-surface-border bg-ark-navy-900/90 overflow-visible ${
                composerTall
                  ? 'flex flex-col rounded-2xl'
                  : 'flex items-center gap-1 rounded-full min-h-11 pl-1 pr-1.5 py-1.5'
              }`}
            >
              {attachedImages.length > 0 && (
                <div className="px-3 pt-2 text-[10px] text-content-tertiary">
                  {attachedImages.length} image{attachedImages.length === 1 ? '' : 's'} in chat — send a message to ask about {attachedImages.length === 1 ? 'it' : 'them'}
                </div>
              )}
              <input
                ref={codeFileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.go,.rs,.java,.css,.html,.json,.md,.toml,.yaml,.yml,image/*,text/*"
                onChange={async e => {
                  const list = e.target.files;
                  e.target.value = '';
                  if (!list?.length) return;
                  const next: Record<string, string> = {};
                  for (const f of [...list].slice(0, 20)) {
                    try {
                      next[f.name] = await f.text();
                    } catch {
                      /* skip */
                    }
                  }
                  if (!Object.keys(next).length) return;
                  setFileContents(prev => {
                    const mapped = { ...prev };
                    const treeExtra: FileNode[] = [];
                    for (const [name, body] of Object.entries(next)) {
                      const rel = name.includes('/') ? name : `src/${name}`;
                      mapped[rel] = body;
                      mapped[name] = body;
                      treeExtra.push({
                        name: name.includes('/') ? name.split('/').pop()! : name,
                        type: 'file',
                        language: name.split('.').pop(),
                      });
                    }
                    if (treeExtra.length) {
                      setFileTree(prevTree => {
                        if (!prevTree.length) {
                          return [{
                            name: 'src',
                            type: 'folder',
                            children: treeExtra,
                          }];
                        }
                        const clone = structuredClone(prevTree);
                        const src = clone.find(n => n.name === 'src' && n.type === 'folder');
                        if (src?.children) {
                          for (const f of treeExtra) {
                            if (!src.children.some(c => c.name === f.name)) src.children.push(f);
                          }
                        }
                        return clone;
                      });
                      const first = Object.keys(next)[0];
                      if (first) {
                        setSelectedFile(first.includes('/') ? first : `src/${first}`);
                        setExplorerOpen(true);
                        setRightTab('code');
                      }
                    }
                    return mapped;
                  });
                  const paths = Object.keys(next);
                  const count = paths.length;
                  const label = count === 1
                    ? (paths[0].split('/').pop() || paths[0])
                    : `${count} files`;
                  postAttachInChat(
                    encodeChatAttach({
                      kind: count === 1 ? 'file' : 'files',
                      name: label,
                      count,
                    }),
                    [
                      `Got **${label}** — ${count === 1 ? 'it is' : 'they are'} in Explorer.`,
                      '',
                      'What should I do? Debug, explain, find problems — or type your own ask.',
                    ].join('\n'),
                    true,
                  );
                }}
              />
              <input
                ref={codeFolderInputRef}
                type="file"
                multiple
                className="hidden"
                {...{ webkitdirectory: '', directory: '' } as Record<string, string>}
                onChange={async e => {
                  const list = e.target.files;
                  e.target.value = '';
                  if (!list?.length) return;
                  const next: Record<string, string> = {};
                  for (const f of [...list].slice(0, 80)) {
                    try {
                      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
                      next[rel.replace(/\\/g, '/')] = await f.text();
                    } catch {
                      /* skip */
                    }
                  }
                  if (!Object.keys(next).length) return;
                  applyProjectFiles(next);
                  const paths = Object.keys(next);
                  const count = paths.length;
                  const asFolder = looksLikeFolderPick(paths);
                  const label = asFolder
                    ? folderNameFromPaths(paths, 'folder')
                    : (paths[0]?.split('/').pop() || 'file');
                  const firstPath = paths[0];
                  if (firstPath) {
                    setSelectedFile(firstPath);
                    setExplorerOpen(true);
                    setRightTab('code');
                  }
                  postAttachInChat(
                    encodeChatAttach({
                      kind: asFolder ? 'folder' : (count === 1 ? 'file' : 'files'),
                      name: label,
                      count,
                    }),
                    [
                      asFolder
                        ? `Got **${label}** — files are in Explorer.`
                        : `Got **${label}**.`,
                      '',
                      'What should I do? Debug, explain, find problems — or type your own ask.',
                    ].join('\n'),
                    true,
                  );
                }}
              />
              {!composerTall && (
                <ComposerPlusMenu
                  scope="code"
                  busy={attachBusy}
                  buttonClassName="w-8 h-8 rounded-full flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0"
                  onAction={(action: ComposerPlusAction) => {
                    if (action === 'image') {
                      void pickCodePhotos();
                      return;
                    }
                    if (action === 'file') {
                      void pickCodeFiles();
                      return;
                    }
                    if (action === 'folder') {
                      pickCodeFolder();
                      return;
                    }
                    if (action === 'import-folder') {
                      void importProjectFolderCopy();
                      return;
                    }
                    if (action === 'enter-path') {
                      void enterPathAndOpen();
                      return;
                    }
                    if (action === 'plan' || action === 'ask' || action === 'agent' || action === 'debug' || action === 'multitask') {
                      setComposerMode(action);
                    }
                    requestAnimationFrame(() => textareaRef.current?.focus());
                  }}
                />
              )}
              <textarea
                ref={textareaRef}
                value={chatInput}
                onChange={e => onChatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    if (Date.now() < ignoreEnterUntilRef.current) {
                      e.preventDefault();
                      return;
                    }
                    e.preventDefault();
                    if (buildLive) stopBuild();
                    else void handleSendChat();
                  }
                }}
                placeholder="Build, add, remove, upgrade, or fix files in this project…"
                rows={1}
                className={`bg-transparent border-none resize-none text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none leading-5 block w-full ${
                  composerTall ? 'min-h-[3.5rem] px-3.5 pt-3.5 pb-2' : 'flex-1 min-w-0 min-h-[1.25rem] px-1 py-0 self-center'
                }`}
                style={{ overflowY: 'hidden', height: 'auto' }}
              />
              <div
                className={
                  composerTall
                    ? 'flex items-center justify-between gap-2 px-2 pb-2 pt-1'
                    : 'flex items-center shrink-0 gap-1'
                }
              >
                {composerTall && (
                  <ComposerPlusMenu
                    scope="code"
                    busy={attachBusy}
                    buttonClassName="w-8 h-8 rounded-full flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0"
                    onAction={(action: ComposerPlusAction) => {
                      if (action === 'image') {
                        void pickCodePhotos();
                        return;
                      }
                      if (action === 'file') {
                        void pickCodeFiles();
                        return;
                      }
                      if (action === 'folder') {
                        pickCodeFolder();
                        return;
                      }
                      if (action === 'import-folder') {
                        void importProjectFolderCopy();
                        return;
                      }
                      if (action === 'enter-path') {
                        void enterPathAndOpen();
                        return;
                      }
                      if (action === 'plan' || action === 'ask' || action === 'agent' || action === 'debug' || action === 'multitask') {
                        setComposerMode(action);
                      }
                      requestAnimationFrame(() => textareaRef.current?.focus());
                    }}
                  />
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    ref={modelButtonRef}
                    type="button"
                    onClick={() => setModelMenuOpen(o => !o)}
                    className="inline-flex items-center gap-1 rounded-full border border-surface-border/80 bg-surface-hover/60 hover:bg-surface-hover px-2 py-1 text-[11px] text-content-primary transition-colors max-w-[8.5rem]"
                    title={activeModel.source === 'auto'
                      ? (threadBrain ? autoEquippedCaption(threadBrain) : 'ARK Auto · picks best coder')
                      : activeModel.name}
                    aria-label="Select model"
                    aria-expanded={modelMenuOpen}
                  >
                    {activeModel.source !== 'auto' && (
                      activeModel.source === 'local'
                        ? <Cpu className="w-3 h-3 text-emerald-400 shrink-0" />
                        : <Cloud className="w-3 h-3 text-sky-400 shrink-0" />
                    )}
                    <span className="font-medium truncate">
                      {activeModel.source === 'auto' ? autoPillLabel(threadBrain) : activeModel.name}
                    </span>
                    <ChevronDown className={`w-3 h-3 text-content-tertiary shrink-0 ${modelMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {modelMenuOpen && menuPos && createPortal(
                    <div
                      ref={modelMenuRef}
                      className="w-64 max-h-72 overflow-y-auto rounded-xl border border-surface-border bg-ark-navy-900 shadow-2xl py-1.5"
                      style={{
                        position: 'fixed',
                        left: menuPos.left,
                        bottom: menuPos.bottom,
                        transform: 'translateX(-50%)',
                        zIndex: 99999,
                      }}
                    >
                      {codeModelOptions.map(model => (
                  <button
                          key={model.id}
                    type="button"
                          onClick={() => {
                            setActiveModel(model);
                            if (model.source === 'auto') {
                              setLocalPrefs({ defaultModelId: 'ark-auto', defaultCodeModelId: 'ark-auto', aiMode: 'automatic', autoFailover: true });
                            } else {
                              setLocalPrefs({ defaultCodeModelId: model.id, defaultModelId: model.id });
                              if (projectId) clearThreadBrain(projectId, 'coding');
                              setThreadBrain(null);
                              if (model.source === 'local') void setEngineModel(model.id).catch(() => undefined);
                            }
                            setModelMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover"
                        >
                          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            model.source === 'auto' ? 'bg-sky-500/15 text-sky-400'
                              : model.source === 'local' ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-sky-500/15 text-sky-400'
                          }`}>
                            {model.source === 'auto' ? <Zap className="w-3.5 h-3.5" />
                              : model.source === 'local' ? <Cpu className="w-3.5 h-3.5" />
                                : <Cloud className="w-3.5 h-3.5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-content-primary truncate">{model.name}</span>
                            <span className="block text-[11px] text-content-tertiary truncate">{model.detail}</span>
                          </span>
                          {activeModel.id === model.id && <Check className="w-4 h-4 text-ark-accent-green shrink-0" />}
                  </button>
                      ))}
                    </div>,
                    document.body,
                  )}
                  {buildLive ? (
                <button
                  type="button"
                      onClick={stopBuild}
                      title="Stop building"
                      aria-label="Stop building"
                      className="w-8 h-8 rounded-full bg-rose-500/20 text-rose-300 flex items-center justify-center hover:bg-rose-500/30 transition-colors"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleSendChat()}
                      disabled={(!chatInput.trim() && attachedImages.length === 0) || (!canEdit && !isExplainAsk(chatInput) && !wantsInspectOnly(chatInput, composerMode === 'debug'))}
                      title={!canEdit ? 'Read access — inspect/explain only' : 'Send'}
                      className="w-8 h-8 rounded-full bg-content-primary text-ark-navy-950 flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                </button>
                  )}
                </div>
              </div>
            </div>
            <TokenUsageRing
              contextRatio={tokenRatio}
              modelRatio={modelRatio}
              size={20}
              className={`text-content-primary shrink-0 ${composerTall ? 'mb-2' : 'self-center'}`}
              modelName={activeModel.source === 'auto' ? autoPillLabel(threadBrain) : activeModel.name}
              modelDetail={
                activeModel.source === 'auto'
                  ? autoRingDetail(threadBrain, 'coding')
                  : activeModel.source === 'local'
                    ? 'Local · ARK Engine'
                    : 'Cloud · connected key'
              }
            />
            </div>
          </div>
        </div>

        {codeOpen && (
          <>
            <ResizeHandle onDrag={dragCode} />
            <div
              className={`shrink-0 flex flex-col min-h-0 min-w-0 max-w-[48vw] bg-ark-navy-900/15 overflow-hidden transition-shadow ${
                fileFlash ? 'ring-2 ring-sky-400/50 ring-inset' : ''
              }`}
              style={{ width: codeWidth }}
            >
              <div className="shrink-0 flex items-center justify-between px-2 h-9 bg-ark-navy-900/30">
                <div className="flex items-center gap-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => setRightTab('code')}
                    className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${
                      rightTab === 'code' ? 'bg-surface-hover text-content-primary' : 'text-content-tertiary hover:text-content-secondary'
                    }`}
                  >
                    <FileCode className={`w-3 h-3 ${fileTintClass(fileKey)}`} />
                    <span className="truncate max-w-[160px]" title={selectedFile}>
                      {selectedFile || fileKey}
                    </span>
                    {selectedFile && (
                      <span className="text-[10px] uppercase tracking-wide text-content-tertiary">
                        {languageFromPath(selectedFile)}
                      </span>
                    )}
                    {fileFlash && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBuild()}
                    title="Open a preview window of this project"
                    className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${
                      buildRunning ? 'bg-sky-500/90 text-white' : 'text-content-tertiary hover:text-content-secondary'
                    }`}
                  >
                    <Play className="w-3 h-3" />
                    Start
                  </button>
                  {undoReady && canEdit && (
                    <button
                      type="button"
                      onClick={undoLastEdit}
                      title="Undo last ARK edit"
                      className="inline-flex items-center gap-1 text-[11px] text-content-tertiary hover:text-content-primary px-1"
                    >
                      <Undo2 className="w-3 h-3" />
                      Undo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFileFindOpen(v => !v)}
                    title="Find in this file"
                    className={`w-7 h-7 rounded-md flex items-center justify-center ${
                      fileFindOpen ? 'bg-surface-hover text-content-primary' : 'text-content-tertiary hover:text-content-primary'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setCodeOpen(false)}
                  className="text-[10px] text-content-tertiary hover:text-content-secondary px-2"
                >
                  Hide
                </button>
              </div>

              {fileFindOpen && rightTab === 'code' && (
                <div className="shrink-0 px-3 py-1.5 border-b border-surface-border/50 flex gap-2">
                  <input
                    value={fileFind}
                    onChange={e => setFileFind(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') findNextInFile(); }}
                    placeholder="Find in this file"
                    className="flex-1 bg-transparent text-xs text-content-primary outline-none border border-surface-border rounded-md px-2 py-1"
                    autoFocus
                  />
                  <button type="button" onClick={findNextInFile} className="text-[10px] text-content-secondary px-2">
                    Next
                  </button>
                </div>
              )}
              {buildRunning && (
                <div className="shrink-0 px-3 py-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-content-secondary">Preparing preview…</span>
                    <span className="text-xs text-content-tertiary">{buildProgress}%</span>
                  </div>
                  <div className="h-1 bg-surface-hover rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500/80 transition-all duration-100" style={{ width: `${buildProgress}%` }} />
                  </div>
                </div>
              )}

              {rightTab === 'code' ? (
                <div className="flex-1 min-h-0 overflow-hidden">
                  {!selectedFile ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-2">
                      <FileCode className="w-5 h-5 text-content-tertiary" />
                      <p className="text-sm text-content-secondary">No code yet</p>
                      <p className="text-xs text-content-tertiary max-w-xs">
                        Ask ARK in chat to create files — they’ll show up here.
                      </p>
                    </div>
                  ) : (
                    <CodeEditor
                    ref={codeEditorRef}
                      path={selectedFile || fileKey}
                    value={codeBody}
                      readOnly={!canEdit}
                      jumpLine={jumpLine}
                      onChange={next => {
                        if (!canEdit) return;
                        fileContentsRef.current = {
                          ...fileContentsRef.current,
                          [fileKey]: next,
                          [selectedFile]: next,
                        };
                      setFileContents(prev => ({
                        ...prev,
                        [fileKey]: next,
                        [selectedFile]: next,
                      }));
                    }}
                      onSave={() => {
                        if (!canEdit || !projectId) return;
                        void safeProjectWrite({
                          projectId,
                          projectName: project?.name,
                          files: packDiskFiles(fileContentsRef.current, messagesRef.current),
                        });
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="flex-1 min-h-0 bg-ark-navy-950 relative">
                  {isNativeMobileTree(fileContents) ? (
                    previewDevice && livePageHtml ? (
                      <DevicePreview device={previewDevice} html={livePageHtml} />
                    ) : previewDevice ? (
                      <DevicePreview
                        device={previewDevice}
                        html={`<!doctype html><html><body style="margin:0;background:#070b14;color:#e8eef8;font-family:sans-serif;padding:24px"><p>${previewDevice.label}</p><p>Ask ARK to rebuild if this preview is empty.</p></body></html>`}
                      />
                    ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-2">
                      <Smartphone className="w-5 h-5 text-sky-400" />
                      <p className="text-sm text-content-secondary">Native project</p>
                      <p className="text-xs text-content-tertiary max-w-sm leading-relaxed">
                        Pick a device in chat to see a sized preview here. Ship from Xcode or Android Studio after you push to GitHub.
                      </p>
                    </div>
                    )
                  ) : livePreviewUrl && !livePreviewUrl.includes('127.0.0.1:0') ? (
                    <div className="relative w-full h-full">
                      <iframe
                        key={livePreviewUrl}
                        title="Project preview"
                        src={livePreviewUrl}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts allow-same-origin"
                      />
                    </div>
                  ) : livePageHtml ? (
                    <div className="relative w-full h-full">
                      <iframe
                        key={livePageHtml.slice(0, 120)}
                        title="Project preview"
                        srcDoc={livePageHtml}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts"
                      />
                    <p className="absolute bottom-2 left-2 right-2 text-[10px] text-content-tertiary pointer-events-none">
                      Sandbox preview: scripts allowed, no same-origin APIs or popups.
                    </p>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-2">
                      <Play className="w-5 h-5 text-sky-400" />
                      <p className="text-sm text-content-secondary">No static preview yet</p>
                      <p className="text-xs text-content-tertiary max-w-xs">
                        Ask ARK in chat to create the page, then open Preview. This is static HTML in a sandbox (scripts only — no forms posting out). It is not a running npm server.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {showBrowserChrome && (
                <div className="shrink-0 px-3 py-2 flex items-center gap-2 text-xs text-content-secondary flex-wrap">
                  <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">
                    {livePreviewUrl && !livePreviewUrl.includes('127.0.0.1:0')
                      ? `Preview · ${fileKey || 'index'}`
                      : `Preview (static HTML) · ${fileKey || 'index'}`}
                  </span>
                  <select
                    className="ml-auto max-w-[11rem] bg-transparent border border-surface-border rounded-md px-1.5 py-0.5 text-[10px] text-content-secondary"
                    value={previewDevice?.id || ''}
                    onChange={e => {
                      const next = PHONE_DEVICES.find(d => d.id === e.target.value) || null;
                      previewDeviceRef.current = next;
                      setPreviewDevice(next);
                    }}
                    title="Device frame for preview"
                  >
                    <option value="">Desktop</option>
                    <optgroup label="iPhone">
                      {PHONE_DEVICES.filter(d => d.family === 'iphone').map(d => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="iPad / Mac">
                      {PHONE_DEVICES.filter(d => d.family === 'ipad' || d.family === 'mac').map(d => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Android">
                      {PHONE_DEVICES.filter(d => d.platform === 'android').map(d => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <GitHubRepoPicker
        open={githubPickerOpen}
        onClose={() => setGithubPickerOpen(false)}
        onPick={repo => void clonePickedRepo(repo)}
      />

      {/* Status strip — only meaningful activity */}
      {(buildLabel || showBrowserChrome || !explorerOpen || !codeOpen) ? (
      <div className="shrink-0 px-3 py-1.5 flex items-center justify-between gap-3 bg-ark-navy-900/40">
        <div className="flex items-center gap-3 min-w-0 text-[11px]">
            {buildLabel && (
          <span className="inline-flex items-center gap-1.5 text-content-secondary">
                <span className={`w-1.5 h-1.5 rounded-full ${buildRunning ? 'bg-amber-400' : 'bg-ark-accent-green'}`} />
            {buildLabel}
          </span>
            )}
            {showBrowserChrome && (
            <button
              type="button"
              onClick={openPreviewInBrowser}
              className="inline-flex items-center gap-1.5 text-content-secondary truncate hover:text-content-primary transition-colors"
                title="Open preview in browser"
            >
              <Globe className="w-3 h-3 text-sky-400" />
                Open preview
            </button>
          )}
        </div>
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            {showBrowserChrome && (
              <span className="text-[11px] text-content-tertiary truncate font-mono max-w-[18rem]" title={livePreviewUrl && !livePreviewUrl.includes('127.0.0.1:0') ? livePreviewUrl : 'Static HTML preview'}>
                {livePreviewUrl && !livePreviewUrl.includes('127.0.0.1:0') ? livePreviewUrl : 'Static HTML preview'}
              </span>
            )}
          {!explorerOpen && (
            <button type="button" onClick={() => setExplorerOpen(true)} className="text-[11px] text-content-tertiary hover:text-content-secondary px-1.5">
              Explorer
            </button>
          )}
          {!codeOpen && (
            <button type="button" onClick={() => setCodeOpen(true)} className="text-[11px] text-content-tertiary hover:text-content-secondary px-1.5">
              Code
            </button>
          )}
        </div>
      </div>
      ) : null}

      <Modal
        isOpen={Boolean(revertPrompt)}
        onClose={() => setRevertPrompt(null)}
        title="Would you like to revert your response?"
        size="sm"
      >
        <p className="text-sm text-content-secondary leading-relaxed">
          Revert replaces that prompt and rebuilds the files on the right from the new message.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="ark-btn-ghost text-xs" onClick={() => setRevertPrompt(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-lg bg-sky-500/90 hover:bg-sky-500 text-white text-xs font-medium px-3 py-1.5"
            onClick={() => {
              if (!revertPrompt) return;
              const { userId, content } = revertPrompt;
              setRevertPrompt(null);
              setEditingUserId(null);
              setReviseUserMsgId(userId);
              void handleSendChat(content);
            }}
          >
            Revert
          </button>
        </div>
      </Modal>
    </div>
  );
}
