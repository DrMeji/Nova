import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from '@/context/RouterContext';
import { useAuth } from '@/context/AuthContext';
import { fetchProjects, fetchChatMessages, saveChatMessage, updateProject } from '@/lib/api';
import type { Project, ChatMessage } from '@/types';
import {
  ChevronRight, FileCode, Folder, FolderOpen, FileText,
  Play, Square, CheckCircle2, Loader2, Bot, User as UserIcon,
  PanelLeft, PanelRight,
  Globe, Circle, ImageIcon, ArrowUp, X, History, Eye, FilePlus2, FolderPlus,
  ChevronDown, Check, Cpu, Cloud, Zap,
} from 'lucide-react';
import { openInSystemBrowser } from '@/lib/openExternal';
import {
  detectPluginIntent,
  getChatEnabledPlugins,
  getPluginRuntime,
  loadPluginState,
  runPluginAction,
} from '@/lib/plugins';
import { arkRoute, routerProviderLabel } from '@/lib/arkRouter';
import { buildRouterHistory } from '@/lib/chatHistory';
import { getLocalPrefs, hasProviderApiKey, setLocalPrefs } from '@/lib/localPrefs';
import { loadRecentProjects } from '@/lib/recentStore';
import {
  applyFileEdits,
  buildProjectCodingPrompt,
  foldersToExpand,
  parseFileEdits,
  stripFileBlocks,
} from '@/lib/projectCodeEdit';
import { ComposerPlusMenu, type ComposerPlusAction } from '@/components/ComposerPlusMenu';
import { TokenUsageRing } from '@/components/TokenUsageRing';
import { getTokenUsageRatio, recordTokenUsage } from '@/lib/tokenUsage';
import { getEngineStatus, setEngineModel } from '@/lib/arkEngine';

type CodeModel = {
  id: string;
  name: string;
  source: 'auto' | 'local' | 'cloud';
  detail: string;
};

const CODE_MODELS: CodeModel[] = [
  { id: 'ark-auto', name: 'ARK', source: 'auto', detail: 'Free-first · silent failover' },
];

const CLOUD_CODE_WHEN_KEYED: (CodeModel & { keyId: string })[] = [
  { id: 'groq:llama-3.3-70b', name: 'Llama 3.3 70B', source: 'cloud', detail: 'Groq', keyId: 'groq' },
  { id: 'google:gemini-2.0-flash', name: 'Gemini 2.0 Flash', source: 'cloud', detail: 'Google', keyId: 'google' },
  { id: 'openrouter:auto', name: 'OpenRouter', source: 'cloud', detail: 'Free routes', keyId: 'openrouter' },
];

const COMPOSER_MODE_PREFIX: Record<'plan' | 'ask' | 'debug' | 'multitask', string> = {
  plan: 'Plan this out step by step, then we can build:\n\n',
  ask: '',
  debug: 'Debug this — find the issue and propose a fix:\n\n',
  multitask: 'Break this into parallel tasks and tackle them clearly:\n\n',
};

type ProjectRow = Project & { id: string };

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  language?: string;
}

const AGENT_STEPS = [
  { id: 'route', label: 'Routing through ARK' },
  { id: 'apply', label: 'Applying file changes' },
  { id: 'ready', label: 'Changes ready in Explorer' },
] as const;

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
  const projectId = route.name === 'project' ? route.id : '';
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatPlugins, setChatPlugins] = useState(() => getChatEnabledPlugins(loadPluginState()));
  const [chatInput, setChatInput] = useState('');
  const [composerMode, setComposerMode] = useState<'plan' | 'ask' | 'debug' | 'multitask' | null>(null);
  const [tokenRatio, setTokenRatio] = useState(0);
  const [activeModel, setActiveModel] = useState<CodeModel>(() => {
    const saved = getLocalPrefs().defaultModelId;
    if (!saved || saved === 'ark-auto') return CODE_MODELS[0];
    return { id: saved, name: saved, source: 'local', detail: 'Pinned' };
  });
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const [localModels, setLocalModels] = useState<CodeModel[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [expandedFolders, setExpandedFolders] = useState(new Set<string>());
  const [buildRunning, setBuildRunning] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [codeOpen, setCodeOpen] = useState(true);
  const [explorerWidth, setExplorerWidth] = useState(220);
  const [codeWidth, setCodeWidth] = useState(380);
  const [agentRunActive, setAgentRunActive] = useState(false);
  const [agentSteps, setAgentSteps] = useState(
    AGENT_STEPS.map(s => ({ ...s, status: 'pending' as 'pending' | 'active' | 'done' })),
  );
  const [attachedImages, setAttachedImages] = useState<{ id: string; url: string; name: string }[]>([]);
  const [changesOpen, setChangesOpen] = useState(false);
  const [diffStats, setDiffStats] = useState({ added: 0, removed: 0 });
  const [showHistory, setShowHistory] = useState(false);
  const [runHistory, setRunHistory] = useState<{ id: string; title: string; at: string }[]>([]);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [rightTab, setRightTab] = useState<'code' | 'preview'>('code');
  const [fileFlash, setFileFlash] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [creating, setCreating] = useState<null | { kind: 'file' | 'folder'; parentPath: string }>(null);
  const [createName, setCreateName] = useState('');
  const [diskRoot, setDiskRoot] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const codeFileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const codeEditorRef = useRef<HTMLTextAreaElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  const isWebProject = !project || project.project_type === 'web' || project.project_type === 'api';
  const [previewUrl, setPreviewUrl] = useState('http://127.0.0.1:0');
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setTokenRatio(getTokenUsageRatio(projectId));
  }, [projectId]);

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
    const keyed = CLOUD_CODE_WHEN_KEYED.filter(m => hasProviderApiKey(m.keyId));
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
    if (!projectId) return;

    if (projectId.startsWith('demo-') || projectId.startsWith('proj-')) {
      const recent = loadRecentProjects().find(p => p.id === projectId);
      const name = recent?.name
        || (projectId.startsWith('demo-')
          ? projectId
            .replace(/^demo-/, '')
            .split('-')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ')
          : 'Code project');
      setProject({
        id: projectId,
        user_id: user?.id ?? 'guest',
        name,
        description: 'Local ARK code workspace',
        project_type: 'web',
        status: 'idle',
        build_status: 'idle',
        last_prompt: null,
        agent_state: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as ProjectRow);
      return;
    }

    let cancelled = false;
    fetchProjects()
      .then(data => {
        if (cancelled) return;
        const found = (data as ProjectRow[]).find(p => p.id === projectId);
        if (found) {
          setProject(found);
          return;
        }
        // Fallback so the workspace never spins forever
        const recent = loadRecentProjects().find(p => p.id === projectId);
        setProject({
          id: projectId,
          user_id: user?.id ?? 'guest',
          name: recent?.name || 'Code project',
          description: 'Local ARK code workspace',
          project_type: 'web',
          status: 'idle',
          build_status: 'idle',
          last_prompt: null,
          agent_state: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as ProjectRow);
      })
      .catch(() => {
        if (cancelled) return;
        const recent = loadRecentProjects().find(p => p.id === projectId);
        setProject({
          id: projectId,
          user_id: user?.id ?? 'guest',
          name: recent?.name || 'Code project',
          description: 'Local ARK code workspace',
          project_type: 'web',
          status: 'idle',
          build_status: 'idle',
          last_prompt: null,
          agent_state: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as ProjectRow);
      });

    fetchChatMessages(projectId)
      .then(data => {
        if (!cancelled) setMessages(data as ChatMessage[]);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [projectId, user?.id]);

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
            return clone;
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
        if (res.ok && res.files && Object.keys(res.files).length > 0) {
          const mapped: Record<string, string> = {};
          for (const [rel, content] of Object.entries(res.files)) {
            const base = rel.includes('/') ? rel.split('/').pop()! : rel;
            mapped[base] = content;
            mapped[rel] = content;
          }
          setFileContents(mapped);
          const keys = Object.keys(res.files);
          if (keys.length && !selectedFile) setSelectedFile(keys[0]);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!project || !window.arkDesktop?.projectWrite) return;
    const t = window.setTimeout(() => {
      const payloadFiles: Record<string, string> = {};
      for (const [k, v] of Object.entries(fileContents)) {
        if (k.includes('/')) payloadFiles[k] = v;
        else if (k.endsWith('.tsx') || k.endsWith('.ts') || k.endsWith('.css')) {
          payloadFiles[`src/${k}`] = v;
        } else {
          payloadFiles[k] = v;
        }
      }
      void window.arkDesktop!.projectWrite!({
        projectId: project.id,
        projectName: project.name,
        files: payloadFiles,
      }).then(res => {
        if (res.root) setDiskRoot(res.root);
      });
    }, 800);
    return () => window.clearTimeout(t);
  }, [fileContents, project]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const handleSendChat = async () => {
    if ((!chatInput.trim() && attachedImages.length === 0) || !project) return;
    let content = chatInput.trim();
    if (composerMode && COMPOSER_MODE_PREFIX[composerMode]) {
      content = `${COMPOSER_MODE_PREFIX[composerMode]}${content}`;
    }
    setComposerMode(null);
    setTokenRatio(recordTokenUsage(project.id, content));
    const images = [...attachedImages];
    const uid = user?.id ?? 'guest';
    setChatInput('');
    setAttachedImages([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      user_id: uid,
      project_id: project.id,
      role: 'user',
      content: content || (images.length ? `[${images.length} image${images.length > 1 ? 's' : ''} attached]` : ''),
      provider_used: null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    setAgentRunActive(true);
    setAgentSteps(AGENT_STEPS.map((s, i) => ({
      ...s,
      status: (i === 0 ? 'active' : 'pending') as 'pending' | 'active' | 'done',
    })));
    setRunHistory(prev => [
      { id: crypto.randomUUID(), title: content.slice(0, 48) || 'Project edit', at: new Date().toLocaleTimeString() },
      ...prev,
    ]);
    setCodeOpen(true);
    setRightTab('code');

    try {
      await saveChatMessage(project.id, 'user', content);
      await updateProject(project.id, { last_prompt: content, status: 'building' });
    } catch { /* offline / guest ok */ }

    void (async () => {
      const pluginState = loadPluginState();
      const enabled = getChatEnabledPlugins(pluginState);
      const pluginId = detectPluginIntent(content, enabled.map(p => p.id));

      let replyText = '';
      let provider = 'ARK';
      let changedPaths: string[] = [];

      try {
        if (pluginId) {
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
            setAgentSteps(prev => prev.map(s => ({ ...s, status: 'done' as const })));
          }
        }

        if (!replyText) {
          const prefs = getLocalPrefs();
          const priorForHistory = [...messages, userMsg];
          const historyBase = prefs.rememberContext
            ? buildRouterHistory(priorForHistory, content)
            : buildRouterHistory([], content);
          // Prefer project files for the latest turn so the model can edit them.
          const codingMessage = buildProjectCodingPrompt(content, fileContents, project.name);
          const history = historyBase.map((turn, i) =>
            i === historyBase.length - 1 && turn.role === 'user'
              ? { ...turn, content: codingMessage }
              : turn,
          );

          const routed = await arkRoute({
            message: codingMessage,
            kind: 'coding',
            preferredModelId: activeModel.id === 'ark-auto' ? undefined : activeModel.id,
            preferredSource:
              activeModel.source === 'auto'
                ? 'auto'
                : activeModel.source === 'local'
                  ? 'local'
                  : 'cloud',
            history,
          });
          provider = routerProviderLabel(routed, 'ARK');

          setAgentSteps(prev => prev.map((s, i) => ({
            ...s,
            status: (i === 0 ? 'done' : i === 1 ? 'active' : 'pending') as 'pending' | 'active' | 'done',
          })));

          const edits = parseFileEdits(routed.reply);
          if (edits.length > 0) {
            const applied = applyFileEdits(fileContents, fileTree, edits);
            setFileContents(applied.files);
            setFileTree(applied.tree);
            setDiffStats(prev => ({
              added: prev.added + applied.addedLines,
              removed: prev.removed + applied.removedLines,
            }));
            changedPaths = applied.changedPaths;
            const expand = foldersToExpand(applied.changedPaths);
            setExpandedFolders(prev => {
              const next = new Set(prev);
              expand.forEach(p => next.add(p));
              return next;
            });
            const focus = applied.changedPaths[0];
            if (focus) {
              setSelectedFile(focus);
              setFileFlash(true);
              window.setTimeout(() => setFileFlash(false), 1400);
            }

            // Persist immediately (don't wait for debounce)
            if (window.arkDesktop?.projectWrite) {
              const payloadFiles: Record<string, string> = {};
              for (const [k, v] of Object.entries(applied.files)) {
                if (k.includes('/')) payloadFiles[k] = v;
                else if (/\.(tsx|ts|jsx|js|css)$/i.test(k)) payloadFiles[`src/${k}`] = v;
                else payloadFiles[k] = v;
              }
              void window.arkDesktop.projectWrite({
                projectId: project.id,
                projectName: project.name,
                files: payloadFiles,
              }).then(res => {
                if (res.root) setDiskRoot(res.root);
              });
            }

            const prose = stripFileBlocks(routed.reply);
            replyText = prose
              ? `${prose}\n\n${applied.summary}`
              : applied.summary;
          } else {
            replyText = stripFileBlocks(routed.reply) || routed.reply;
          }

          setAgentSteps(prev => prev.map(s => ({ ...s, status: 'done' as const })));
        }
      } catch (err) {
        replyText = err instanceof Error
          ? `Could not complete that edit: ${err.message}`
          : 'ARK Router failed on this project edit.';
        setAgentSteps(prev => prev.map((s, i) => ({
          ...s,
          status: (i === 0 ? 'done' : 'pending') as 'pending' | 'active' | 'done',
        })));
      }

      if (changedPaths.length) {
        try {
          await updateProject(project.id, {
            status: 'idle',
            build_status: 'idle',
            last_prompt: content,
          });
        } catch { /* ignore */ }
      }

      const reply: ChatMessage = {
        id: crypto.randomUUID(),
        user_id: uid,
        project_id: project.id,
        role: 'assistant',
        content: replyText,
        provider_used: provider,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, reply]);
      window.setTimeout(() => setAgentRunActive(false), 700);

      try {
        await saveChatMessage(project.id, 'assistant', replyText);
      } catch { /* ignore */ }
    })();
  };

  const onChatInput = (value: string) => {
    setChatInput(value);
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };

  const onPickImages = (files: FileList | null) => {
    if (!files?.length) return;
    const next = Array.from(files).slice(0, 4).map(file => ({
      id: crypto.randomUUID(),
      url: URL.createObjectURL(file),
      name: file.name,
    }));
    setAttachedImages(prev => [...prev, ...next].slice(0, 6));
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
    setBuildProgress(0);
    setCodeOpen(true);
    setRightTab('preview');
    setPreviewReady(false);

    const interval = setInterval(() => {
      setBuildProgress(prev => Math.min(90, prev + 8));
    }, 120);

    void (async () => {
      try {
        const files: Record<string, string> = { ...fileContents };
        // Flatten keys that are basenames into src/ paths when needed
        const payloadFiles: Record<string, string> = {};
        for (const [k, v] of Object.entries(files)) {
          if (k.includes('/')) payloadFiles[k] = v;
          else if (k.endsWith('.tsx') || k.endsWith('.ts') || k.endsWith('.css')) {
            payloadFiles[`src/${k}`] = v;
          } else {
            payloadFiles[k] = v;
          }
        }
        if (!payloadFiles['index.html']) {
          payloadFiles['index.html'] = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${project?.name ?? 'ARK'}</title>
<style>body{margin:0;font-family:system-ui;background:#0b1220;color:#e8eefc;padding:24px}
pre{background:#121a2b;border:1px solid #243047;border-radius:12px;padding:14px;overflow:auto}</style>
</head><body>
<h1>${(project?.name ?? 'Project').replace(/</g, '')}</h1>
<p>ARK Build &amp; Run local preview</p>
<pre>${(payloadFiles['src/App.tsx'] || payloadFiles['App.tsx'] || '// App').replace(/</g, '&lt;').slice(0, 4000)}</pre>
</body></html>`;
        }

        if (window.arkDesktop?.previewStart && project) {
          const res = await window.arkDesktop.previewStart({
            projectId: project.id,
            projectName: project.name,
            files: payloadFiles,
          });
          setLivePreviewUrl(res.url);
          setPreviewUrl(res.url);
          setPreviewReady(true);
          setBuildProgress(100);
        } else {
          // Browser fallback: blob URL from generated HTML
          const html = payloadFiles['index.html'];
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          setLivePreviewUrl(url);
          setPreviewUrl(url);
          setPreviewReady(true);
          setBuildProgress(100);
        }
      } catch (err) {
        setPreviewReady(false);
        setBuildProgress(0);
        console.error(err);
      } finally {
        clearInterval(interval);
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
    if (creating.parentPath) {
      setExpandedFolders(prev => new Set(prev).add(creating.parentPath));
    }
    if (creating.kind === 'file') {
      const fullPath = creating.parentPath ? `${creating.parentPath}/${name}` : name;
      setSelectedFile(fullPath);
      setFileContents(prev => ({
        ...prev,
        [name]: `// ${fullPath}\n// New file\n`,
      }));
      setRightTab('code');
      setCodeOpen(true);
    }
    setCreating(null);
    setCreateName('');
  };

  const startCreate = (kind: 'file' | 'folder') => {
    const parentPath = selectedFile.includes('.')
      ? selectedFile.split('/').slice(0, -1).join('/')
      : (expandedFolders.has(selectedFile) || selectedFile === 'src' ? selectedFile : 'src');
    const folderParent = parentPath || 'src';
    setExpandedFolders(prev => new Set(prev).add(folderParent));
    setCreating({ kind, parentPath: folderParent });
    setCreateName(kind === 'folder' ? 'new-folder' : 'NewFile.tsx');
  };

  const openPreviewInBrowser = () => {
    const url = livePreviewUrl || previewUrl;
    if (url.startsWith('blob:') || url.includes('127.0.0.1:0')) return;
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
            const key = fullPath.split('/').pop() ?? fullPath;
            setFileContents(prev => {
              if (prev[fullPath] || prev[key]) return prev;
              const seed = `// ${fullPath}\n`;
              return {
                ...prev,
                [fullPath]: seed,
                [key]: seed,
              };
            });
            setRightTab('code');
          }}
          className={`flex items-center gap-1 w-full px-2 py-1 text-xs rounded transition-colors ${
            isSelected ? 'bg-sky-500/10 text-sky-300' : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
          }`}
        >
          <ChevronRight className="w-3 h-3 opacity-0 shrink-0" />
          {node.language === 'md'
            ? <FileText className="w-3.5 h-3.5 shrink-0" />
            : <FileCode className="w-3.5 h-3.5 shrink-0" />}
          <span className="truncate">{node.name}</span>
        </button>
      );
    });

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-content-tertiary">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const hasFiles = fileTree.length > 0 || Object.keys(fileContents).length > 0;
  const fileKey = selectedFile ? (selectedFile.split('/').pop() ?? selectedFile) : '';
  const codeBody = selectedFile
    ? (fileContents[selectedFile] ?? fileContents[fileKey] ?? '')
    : '';
  const showBrowserChrome = Boolean(livePreviewUrl || previewReady);

  const previewHtml = (() => {
    const name = (project?.name ?? 'Project').replace(/</g, '');
    const prompt = (project?.last_prompt ?? 'Ready when you are').replace(/</g, '').slice(0, 160);
    const snippet = codeBody
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .split('\n')
      .slice(0, 18)
      .join('\n');
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
  :root{color-scheme:dark}
  body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:radial-gradient(1200px 600px at 20% -10%,#1a2744,transparent),#0b1220;color:#e8eefc;min-height:100vh}
  .wrap{max-width:720px;margin:0 auto;padding:28px 20px 40px}
  .badge{display:inline-flex;align-items:center;gap:8px;font-size:11px;color:#34d399;margin-bottom:14px}
  .dot{width:8px;height:8px;border-radius:50%;background:#34d399;box-shadow:0 0 0 4px rgba(52,211,153,.12)}
  h1{margin:0 0 8px;font-size:28px;letter-spacing:-.02em}
  .sub{margin:0 0 18px;color:#9fb0cc;font-size:14px;line-height:1.5}
  .panel{border:1px solid #243047;border-radius:16px;background:#121a2b;overflow:hidden}
  .panel h2{margin:0;padding:12px 14px;font-size:12px;color:#9fb0cc;border-bottom:1px solid #243047;text-transform:uppercase;letter-spacing:.08em}
  pre{margin:0;padding:14px;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#d7e3ff;white-space:pre-wrap;word-break:break-word}
</style></head><body>
  <div class="wrap">
    <div class="badge"><span class="dot"></span> Build &amp; Run preview</div>
    <h1>${name}</h1>
    <p class="sub">${prompt}</p>
    <div class="panel">
      <h2>${fileKey}</h2>
      <pre>${snippet}</pre>
    </div>
  </div>
</body></html>`;
  })();

  const buildLabel = buildRunning
    ? `Building ${buildProgress}%`
    : previewReady || buildProgress >= 100
      ? 'Build ready'
      : null;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-surface-border px-4 py-2 flex items-center justify-between gap-3 bg-ark-navy-900/30 pr-28">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={() => navigate({ name: 'projects' })} className="ark-btn-ghost text-xs shrink-0">
            Projects
          </button>
          <ChevronRight className="w-3 h-3 text-content-tertiary shrink-0" />
          <span className="text-sm font-medium text-content-primary truncate">{project.name}</span>
          {diskRoot ? (
            <span className="text-[10px] text-content-tertiary truncate max-w-[220px]" title={diskRoot}>
              {diskRoot}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
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
          <button
            type="button"
            onClick={handleBuild}
            disabled={!hasFiles && !buildRunning}
            title={hasFiles ? (buildRunning ? 'Stop preview' : 'Start preview') : 'Ask ARK to create files first'}
            className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-medium ml-1 mr-1 transition-colors ${
              buildRunning
                ? 'border border-rose-400/35 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                : hasFiles
                  ? 'bg-sky-500/90 text-white hover:bg-sky-500'
                  : 'bg-surface-hover text-content-tertiary cursor-not-allowed'
            }`}
          >
            {buildRunning ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {buildRunning ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      {/* Panes: Explorer | Chat | Code */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {explorerOpen && (
          <>
            <div className="shrink-0 flex flex-col bg-ark-navy-900/20 overflow-hidden" style={{ width: explorerWidth }}>
              <div className="shrink-0 px-2 py-2 flex items-center justify-between gap-1">
                <p className="text-[10px] uppercase tracking-wider text-content-tertiary font-semibold px-1">Explorer</p>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => startCreate('file')}
                    title="New file"
                    className="w-6 h-6 rounded-md flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
                  >
                    <FilePlus2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startCreate('folder')}
                    title="New folder"
                    className="w-6 h-6 rounded-md flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setExplorerOpen(false)}
                    className="text-[10px] text-content-tertiary hover:text-content-secondary px-1"
                  >
                    Hide
                  </button>
                </div>
              </div>
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
                {fileTree.length === 0 ? (
                  <p className="px-2 py-6 text-[11px] text-content-tertiary leading-relaxed text-center">
                    No files yet. Ask ARK in chat to create your project.
                  </p>
                ) : (
                  renderFileTree(fileTree)
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
                  changesOpen || diffStats.added + diffStats.removed > 0
                    ? 'bg-surface-hover text-content-primary border border-surface-border'
                    : 'text-content-tertiary hover:text-content-secondary hover:bg-surface-hover'
                }`}
                title="View changes"
              >
                <span>Changes</span>
                {diffStats.added + diffStats.removed > 0 ? (
                  <span className="flex items-center gap-1 tabular-nums">
                    <span className="text-emerald-400">+{diffStats.added}</span>
                    <span className="text-red-400">-{diffStats.removed}</span>
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
                  onClick={() => setDiffStats({ added: 0, removed: 0 })}
                  className="text-[10px] text-content-tertiary hover:text-content-secondary"
                >
                  Clear
                </button>
              </div>
              {diffStats.added + diffStats.removed === 0 ? (
                <p className="text-[11px] text-content-tertiary">No changes yet. Ask ARK to edit the project.</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded-md bg-surface-hover/60">
                    <span className="text-content-primary font-mono truncate">{selectedFile.split('/').pop()}</span>
                    <span className="tabular-nums shrink-0 ml-2">
                      <span className="text-emerald-400">+{Math.max(1, Math.floor(diffStats.added * 0.6))}</span>
                      {' '}
                      <span className="text-red-400">-{Math.max(0, Math.floor(diffStats.removed * 0.5))}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded-md bg-surface-hover/60">
                    <span className="text-content-primary font-mono">TaskList.tsx</span>
                    <span className="tabular-nums shrink-0 ml-2">
                      <span className="text-emerald-400">+{Math.max(1, Math.floor(diffStats.added * 0.4))}</span>
                      {' '}
                      <span className="text-red-400">-{Math.max(0, Math.ceil(diffStats.removed * 0.5))}</span>
                    </span>
                  </div>
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
                        <p className="text-content-tertiary">{run.at} · Analyzing → Planning → Structure → UI → Preview</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Agent steps only during a fresh build */}
          {agentRunActive && (
            <div className="shrink-0 border-b border-surface-border px-3 py-2.5 bg-ark-navy-900/30">
              <p className="text-[10px] uppercase tracking-wider text-content-tertiary mb-2 font-semibold">Building</p>
              <div className="space-y-1.5">
                {agentSteps.map(step => (
                  <div key={step.id} className="flex items-center gap-2">
                    {step.status === 'done' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-ark-accent-green shrink-0" />
                    ) : step.status === 'active' ? (
                      <Loader2 className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-spin" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-content-tertiary shrink-0" />
                    )}
                    <span className={`text-xs ${
                      step.status === 'done' ? 'text-content-secondary'
                        : step.status === 'active' ? 'text-content-primary'
                          : 'text-content-tertiary'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-auto px-4 py-4 space-y-3">
            {messages.length === 0 && !agentRunActive && (
              <div className="text-center py-10 px-4">
                <p className="text-sm text-content-secondary mb-1">Start building with chat</p>
                <p className="text-xs text-content-tertiary max-w-sm mx-auto">
                  Ask ARK to add a page, fix a bug, or redesign a component. Fresh builds show progress briefly, then in History.
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
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm text-content-primary ${
                  msg.role === 'user' ? 'bg-surface-hover' : 'bg-ark-navy-900 border border-surface-border'
                }`}>
                  {msg.content || <Loader2 className="w-3.5 h-3.5 animate-spin text-content-tertiary" />}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer: grows with text + image attach */}
          <div className="shrink-0 p-3 space-y-2">
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
                    <span className={`w-4 h-4 rounded-md bg-gradient-to-br ${plugin.tone} text-[8px] font-bold text-white flex items-center justify-center`}>
                      {plugin.initial}
                    </span>
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
            <div className="rounded-2xl border border-surface-border bg-ark-navy-900/50 focus-within:border-content-tertiary/50 transition-colors">
              {attachedImages.length > 0 && (
                <div className="flex flex-wrap gap-2 px-3 pt-3">
                  {attachedImages.map(img => (
                    <div key={img.id} className="relative group">
                      <img
                        src={img.url}
                        alt={img.name}
                        className="h-14 w-14 object-cover rounded-lg border border-surface-border"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(img.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ark-navy-800 border border-surface-border flex items-center justify-center text-content-tertiary hover:text-content-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {composerMode && (
                <div className="flex items-center gap-2 px-3.5 pt-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-hover/60 px-2.5 py-0.5 text-[11px] text-content-secondary capitalize">
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
              <textarea
                ref={textareaRef}
                value={chatInput}
                onChange={e => onChatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendChat();
                  }
                }}
                placeholder="Ask ARK to build or edit files in this project…"
                rows={1}
                className="w-full bg-transparent text-sm text-content-primary placeholder:text-content-tertiary px-3.5 pt-3 pb-2 resize-none outline-none max-h-[220px] overflow-y-auto leading-relaxed"
              />
              <div className="flex items-center justify-between px-2 pb-2 gap-1">
                <div className="flex items-center gap-0.5 min-w-0">
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
                          if (first) setSelectedFile(first.includes('/') ? first : `src/${first}`);
                        }
                        return mapped;
                      });
                    }}
                  />
                  <ComposerPlusMenu
                    buttonClassName="w-8 h-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover transition-colors"
                    onAction={(action: ComposerPlusAction) => {
                      if (action === 'file' || action === 'image') {
                        codeFileInputRef.current?.click();
                        return;
                      }
                      setComposerMode(action);
                      requestAnimationFrame(() => textareaRef.current?.focus());
                    }}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <TokenUsageRing
                    ratio={tokenRatio}
                    size={16}
                    className="text-content-primary"
                    modelName={activeModel.source === 'auto' ? 'ARK Auto' : activeModel.name}
                    modelDetail={
                      activeModel.source === 'auto'
                        ? 'Free-first · silent failover'
                        : activeModel.source === 'local'
                          ? 'Local · ARK Engine'
                          : 'Cloud · connected key'
                    }
                  />
                  <button
                    ref={modelButtonRef}
                    type="button"
                    onClick={() => setModelMenuOpen(o => !o)}
                    className="inline-flex items-center gap-1 rounded-full border border-surface-border/80 bg-surface-hover/60 hover:bg-surface-hover px-2 py-1 text-[11px] text-content-primary transition-colors max-w-[8.5rem]"
                    title={activeModel.source === 'auto' ? 'ARK Auto · failover on' : activeModel.name}
                    aria-label="Select model"
                    aria-expanded={modelMenuOpen}
                  >
                    {activeModel.source !== 'auto' && (
                      activeModel.source === 'local'
                        ? <Cpu className="w-3 h-3 text-emerald-400 shrink-0" />
                        : <Cloud className="w-3 h-3 text-sky-400 shrink-0" />
                    )}
                    <span className="font-medium truncate">
                      {activeModel.source === 'auto' ? 'ARK' : activeModel.name}
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
                              setLocalPrefs({ defaultModelId: 'ark-auto', aiMode: 'automatic', autoFailover: true });
                            } else {
                              setLocalPrefs({ defaultModelId: model.id, lastChatModelId: model.id });
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
                  <button
                    type="button"
                    onClick={() => void handleSendChat()}
                    disabled={!chatInput.trim() && attachedImages.length === 0}
                    className="w-8 h-8 rounded-full bg-content-primary text-ark-navy-950 flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {codeOpen && (
          <>
            <ResizeHandle onDrag={dragCode} />
            <div
              className={`shrink-0 flex flex-col min-h-0 bg-ark-navy-900/15 overflow-hidden transition-shadow ${
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
                    <FileCode className="w-3 h-3" />
                    {fileKey}
                    {fileFlash && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab('preview')}
                    className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${
                      rightTab === 'preview' ? 'bg-surface-hover text-content-primary' : 'text-content-tertiary hover:text-content-secondary'
                    }`}
                  >
                    <Eye className="w-3 h-3" />
                    Preview
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

              {buildRunning && (
                <div className="shrink-0 px-3 py-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-content-secondary">Building preview…</span>
                    <span className="text-xs text-content-tertiary">{buildProgress}%</span>
                  </div>
                  <div className="h-1 bg-surface-hover rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500/80 transition-all duration-100" style={{ width: `${buildProgress}%` }} />
                  </div>
                </div>
              )}

              {rightTab === 'code' ? (
                <div className="flex-1 min-h-0 overflow-hidden p-2">
                  {!selectedFile ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-2">
                      <FileCode className="w-5 h-5 text-content-tertiary" />
                      <p className="text-sm text-content-secondary">No code yet</p>
                      <p className="text-xs text-content-tertiary max-w-xs">
                        Ask ARK in chat to create files — they’ll show up here.
                      </p>
                    </div>
                  ) : (
                    <textarea
                      ref={codeEditorRef}
                      value={codeBody}
                      onChange={e => {
                        const next = e.target.value;
                        setFileContents(prev => ({
                          ...prev,
                          [fileKey]: next,
                          [selectedFile]: next,
                        }));
                      }}
                      spellCheck={false}
                      className="w-full h-full resize-none bg-transparent font-mono text-xs text-content-primary leading-relaxed outline-none p-2 rounded-lg focus:bg-ark-navy-900/40"
                    />
                  )}
                </div>
              ) : (
                <div className="flex-1 min-h-0 bg-ark-navy-950 relative">
                  {previewReady || buildProgress >= 100 ? (
                    livePreviewUrl ? (
                      <iframe
                        title="Project preview"
                        src={livePreviewUrl}
                        className="w-full h-full border-0 bg-white"
                        sandbox="allow-scripts allow-same-origin"
                      />
                    ) : (
                      <iframe
                        title="Project preview"
                        srcDoc={previewHtml}
                        className="w-full h-full border-0 bg-white"
                        sandbox="allow-scripts"
                      />
                    )
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-2">
                      <Globe className="w-5 h-5 text-sky-400" />
                      <p className="text-sm text-content-secondary">No preview yet</p>
                      <p className="text-xs text-content-tertiary max-w-xs">
                        Create files with chat, then hit Start for a local preview.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {showBrowserChrome && (
                <div className="shrink-0 px-3 py-2 flex items-center gap-2 text-xs text-content-secondary">
                  <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">
                    {`ARK preview · ${livePreviewUrl || fileKey}${previewReady ? ' · ready' : ''}`}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

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
              <span className="text-[11px] text-content-tertiary truncate font-mono max-w-[18rem]" title={livePreviewUrl || previewUrl}>
                {livePreviewUrl || previewUrl}
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
    </div>
  );
}
