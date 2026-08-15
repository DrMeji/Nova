import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useAuth } from '@/context/AuthContext';
import { fetchProjects, fetchChatMessages, saveChatMessage, updateProject } from '@/lib/api';
import type { Project, ChatMessage } from '@/types';
import {
  ChevronRight, FileCode, Folder, FolderOpen, FileText,
  Play, Square, CheckCircle2, Loader2, Bot, User as UserIcon,
  Wrench, TestTube, Hammer, Cpu, Cloud, PanelLeft, PanelRight,
  Globe, Circle, Plus, ImageIcon, ArrowUp, X, History, Eye, FilePlus2, FolderPlus,
} from 'lucide-react';
import { openInSystemBrowser } from '@/lib/openExternal';
import {
  detectPluginIntent,
  getChatEnabledPlugins,
  getPluginRuntime,
  loadPluginState,
  runPluginAction,
} from '@/lib/plugins';

type ProjectRow = Project & { id: string };

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  language?: string;
}

const DEMO_FILES: FileNode[] = [
  {
    name: 'src', type: 'folder', children: [
      { name: 'App.tsx', type: 'file', language: 'tsx' },
      { name: 'main.tsx', type: 'file', language: 'tsx' },
      { name: 'index.css', type: 'file', language: 'css' },
      {
        name: 'components', type: 'folder', children: [
          { name: 'Header.tsx', type: 'file', language: 'tsx' },
          { name: 'TaskList.tsx', type: 'file', language: 'tsx' },
          { name: 'TaskItem.tsx', type: 'file', language: 'tsx' },
        ],
      },
      {
        name: 'lib', type: 'folder', children: [
          { name: 'api.ts', type: 'file', language: 'ts' },
          { name: 'db.ts', type: 'file', language: 'ts' },
        ],
      },
    ],
  },
  { name: 'public', type: 'folder', children: [{ name: 'favicon.svg', type: 'file' }] },
  { name: 'package.json', type: 'file', language: 'json' },
  { name: 'README.md', type: 'file', language: 'md' },
  { name: 'tailwind.config.js', type: 'file', language: 'js' },
  { name: 'vite.config.ts', type: 'file', language: 'ts' },
];

const DEMO_CODE: Record<string, string> = {
  'App.tsx': `import { useState } from 'react';
import { Header } from './components/Header';
import { TaskList } from './components/TaskList';

export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-3xl mx-auto p-6">
        <TaskList tasks={tasks} onChange={setTasks} />
      </main>
    </div>
  );
}`,
};

const AGENT_STEPS = [
  { id: 'analyze', label: 'Analyzing requirements' },
  { id: 'plan', label: 'Planning architecture' },
  { id: 'structure', label: 'Created project structure' },
  { id: 'database', label: 'Created database layer' },
  { id: 'ui', label: 'Created UI components' },
  { id: 'deps', label: 'Installing dependencies' },
  { id: 'preview', label: 'Running preview' },
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
  const [selectedFile, setSelectedFile] = useState('src/App.tsx');
  const [expandedFolders, setExpandedFolders] = useState(new Set(['src', 'src/components', 'src/lib']));
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
  const [fileContents, setFileContents] = useState<Record<string, string>>(() => ({ ...DEMO_CODE }));
  const [rightTab, setRightTab] = useState<'code' | 'preview'>('code');
  const [fileFlash, setFileFlash] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [fileTree, setFileTree] = useState<FileNode[]>(() => structuredClone(DEMO_FILES));
  const [creating, setCreating] = useState<null | { kind: 'file' | 'folder'; parentPath: string }>(null);
  const [createName, setCreateName] = useState('');
  const [diskRoot, setDiskRoot] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const codeEditorRef = useRef<HTMLTextAreaElement>(null);

  const isWebProject = !project || project.project_type === 'web' || project.project_type === 'api';
  const [previewUrl, setPreviewUrl] = useState('http://127.0.0.1:0');
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    if (projectId.startsWith('demo-')) {
      const name = projectId
        .replace(/^demo-/, '')
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
      setProject({
        id: projectId,
        user_id: user?.id ?? 'guest',
        name,
        description: 'Placeholder project folder',
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

    fetchProjects()
      .then(data => {
        const found = (data as ProjectRow[]).find(p => p.id === projectId);
        if (found) setProject(found);
      })
      .catch(() => {});

    fetchChatMessages(projectId)
      .then(data => setMessages(data as ChatMessage[]))
      .catch(() => {});
  }, [projectId, user?.id]);

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
          const mapped: Record<string, string> = { ...DEMO_CODE };
          for (const [rel, content] of Object.entries(res.files)) {
            const base = rel.includes('/') ? rel.split('/').pop()! : rel;
            mapped[base] = content;
            mapped[rel] = content;
          }
          setFileContents(mapped);
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
    const content = chatInput.trim();
    const images = [...attachedImages];
    const uid = user?.id ?? 'guest';
    setChatInput('');
    setAttachedImages([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const looksLikeFreshBuild = /build|create|make|new app|calculator|todo|dashboard/i.test(content);

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

    if (looksLikeFreshBuild) {
      setAgentRunActive(true);
      setAgentSteps(AGENT_STEPS.map(s => ({ ...s, status: 'pending' as const })));
      setRunHistory(prev => [
        { id: crypto.randomUUID(), title: content.slice(0, 48) || 'New build', at: new Date().toLocaleTimeString() },
        ...prev,
      ]);
      // Animate steps, then clear from main view (they live in history)
      let step = 0;
      const tick = window.setInterval(() => {
        step += 1;
        setAgentSteps(prev => prev.map((s, i) => ({
          ...s,
          status: (i < step - 1 ? 'done' : i === step - 1 ? 'active' : 'pending') as 'pending' | 'active' | 'done',
        })));
        if (step >= AGENT_STEPS.length) {
          window.clearInterval(tick);
          setAgentSteps(prev => prev.map(s => ({ ...s, status: 'done' as const })));
          window.setTimeout(() => setAgentRunActive(false), 900);
        }
      }, 550);
    }

    // Placeholder diff bump when agent works on code
    setDiffStats(prev => ({
      added: prev.added + 12 + Math.floor(Math.random() * 40),
      removed: prev.removed + 3 + Math.floor(Math.random() * 15),
    }));

    // Chat → code link: update the open file and flash the panel
    setCodeOpen(true);
    setRightTab('code');
    const targetPath = selectedFile.endsWith('.tsx') || selectedFile.endsWith('.ts') || selectedFile.endsWith('.js')
      ? selectedFile
      : 'src/App.tsx';
    const targetKey = targetPath.split('/').pop() ?? 'App.tsx';
    setSelectedFile(targetPath);
    setFileContents(prev => {
      const current = prev[targetKey] ?? DEMO_CODE[targetKey] ?? `// ${targetPath}\n`;
      const stamp = `// ARK update · ${new Date().toLocaleTimeString()}\n// ${content.slice(0, 72) || 'image request'}\n`;
      const next = current.includes('// ARK update')
        ? current.replace(/\/\/ ARK update[\s\S]*?(?=\n(?:import|export|\/\/(?! ARK)|$))/m, stamp.trimEnd())
        : `${stamp}\n${current}`;
      return { ...prev, [targetKey]: next };
    });
    setFileFlash(true);
    window.setTimeout(() => setFileFlash(false), 1400);

    try {
      await saveChatMessage(project.id, 'user', content);
      await updateProject(project.id, { last_prompt: content, status: 'building' });
    } catch { /* placeholder */ }

    void (async () => {
      const pluginState = loadPluginState();
      const enabled = getChatEnabledPlugins(pluginState);
      const pluginId = detectPluginIntent(content, enabled.map(p => p.id));
      let replyText = looksLikeFreshBuild
        ? `Starting that build now. I updated ${targetKey} — check the code panel (highlighted).`
        : `Updated ${targetKey} based on that. The code panel is highlighted so you can see what changed.`;
      let provider = 'Local';

      if (pluginId) {
        const runtime = getPluginRuntime(pluginId, pluginState);
        const pluginReply = await runPluginAction(pluginId, content, runtime.token);
        if (pluginReply) {
          replyText = pluginReply;
          provider = `${enabled.find(p => p.id === pluginId)?.name ?? 'Plugin'}${runtime.accountLabel ? ` · ${runtime.accountLabel}` : ''}`;
        }
      }

      window.setTimeout(() => {
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
      }, pluginId ? 250 : 700);
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
        const files: Record<string, string> = { ...DEMO_CODE, ...fileContents };
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
              if (prev[key]) return prev;
              return {
                ...prev,
                [key]: DEMO_CODE[key] ?? `// ${fullPath}\n// Editable placeholder content.\n`,
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

  const fileKey = selectedFile.split('/').pop() ?? 'App.tsx';
  const codeBody = fileContents[fileKey]
    ?? DEMO_CODE[fileKey]
    ?? `// ${selectedFile}\n// Placeholder file content for UI preview.\n`;

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

  const buildLabel = buildRunning ? `Building ${buildProgress}%` : previewReady || buildProgress >= 100 ? 'Build ready' : 'Build idle';
  const engineLabel = 'Local AI ready';
  const providerLabel = 'Providers standing by';

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-surface-border px-4 py-2.5 flex items-center justify-between gap-3 bg-ark-navy-900/30">
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
          {isWebProject && (
            <button
              type="button"
              onClick={openPreviewInBrowser}
              title="Open localhost in your system browser"
              className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-2 py-0.5 text-[11px] text-content-secondary shrink-0 hover:bg-surface-hover hover:text-content-primary transition-colors"
            >
              <Globe className="w-3 h-3 text-sky-400" />
              Browser
              <span className="text-content-tertiary">·</span>
              <span className="font-mono text-content-tertiary truncate max-w-[9rem]">{previewUrl}</span>
            </button>
          )}
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
            className={buildRunning ? 'ark-btn-secondary !text-ark-accent-red ml-1' : 'ark-btn-primary ml-1'}
          >
            {buildRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {buildRunning ? 'Stop' : 'Build & Run'}
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
              <div className="flex-1 overflow-auto p-2">{renderFileTree(fileTree)}</div>
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
              <textarea
                ref={textareaRef}
                value={chatInput}
                onChange={e => onChatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
                placeholder="Ask ARK to change this project..."
                rows={1}
                className="w-full bg-transparent text-sm text-content-primary placeholder:text-content-tertiary px-3.5 pt-3 pb-2 resize-none outline-none max-h-[220px] overflow-y-auto leading-relaxed"
              />
              <div className="flex items-center justify-between px-2 pb-2">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover transition-colors"
                    title="Attach image"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover transition-colors"
                    title="Upload image"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() && attachedImages.length === 0}
                  className="w-8 h-8 rounded-lg bg-content-primary text-ark-navy-950 flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                </button>
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
                  <textarea
                    ref={codeEditorRef}
                    value={codeBody}
                    onChange={e => {
                      const next = e.target.value;
                      setFileContents(prev => ({ ...prev, [fileKey]: next }));
                      setDiffStats(prev => ({
                        added: prev.added + 1,
                        removed: prev.removed,
                      }));
                    }}
                    spellCheck={false}
                    className="w-full h-full resize-none bg-transparent font-mono text-xs text-content-primary leading-relaxed outline-none p-2 rounded-lg focus:bg-ark-navy-900/40"
                  />
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
                        Hit Build & Run to start ARK’s local preview server for this project.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {isWebProject && (
                <div className="shrink-0 px-3 py-2 flex items-center gap-2 text-xs text-content-secondary">
                  <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">
                    {previewReady || buildProgress >= 100 || buildRunning
                      ? `ARK preview · ${livePreviewUrl || fileKey}${previewReady ? ' · ready' : ''}`
                      : 'Web project · hit Build & Run for a live local preview'}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Status strip */}
      <div className="shrink-0 px-3 py-1.5 flex items-center justify-between gap-3 bg-ark-navy-900/40">
        <div className="flex items-center gap-3 min-w-0 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-content-secondary">
            <span className={`w-1.5 h-1.5 rounded-full ${buildRunning ? 'bg-amber-400' : buildProgress >= 100 ? 'bg-ark-accent-green' : 'bg-content-tertiary'}`} />
            {buildLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 text-content-secondary">
            <Cpu className="w-3 h-3 text-emerald-400" />
            {engineLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 text-content-secondary">
            <Cloud className="w-3 h-3 text-sky-400" />
            {providerLabel}
          </span>
          {isWebProject && (
            <button
              type="button"
              onClick={openPreviewInBrowser}
              className="inline-flex items-center gap-1.5 text-content-secondary truncate hover:text-content-primary transition-colors"
              title="Open localhost in your system browser"
            >
              <Globe className="w-3 h-3 text-sky-400" />
              Browser target
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
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
          <Hammer className="w-3 h-3 text-content-tertiary ml-1" />
          <Wrench className="w-3 h-3 text-content-tertiary" />
          <TestTube className="w-3 h-3 text-content-tertiary" />
        </div>
      </div>
    </div>
  );
}
