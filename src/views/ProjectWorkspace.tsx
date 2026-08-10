import { useState, useEffect, useRef } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useAuth } from '@/context/AuthContext';
import { fetchProjects, fetchChatMessages, saveChatMessage, updateProject } from '@/lib/api';
import type { Project, ChatMessage } from '@/types';
import {
  ChevronRight, FileCode, Folder, FolderOpen, FileText,
  Play, Square, RefreshCw, CheckCircle2, Loader2, Bot, User as UserIcon,
  Wrench, TestTube, Bug, Hammer, Eye, Cpu, Cloud,
} from 'lucide-react';

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
        ]
      },
      {
        name: 'lib', type: 'folder', children: [
          { name: 'api.ts', type: 'file', language: 'ts' },
          { name: 'db.ts', type: 'file', language: 'ts' },
        ]
      },
    ]
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

interface AgentStep {
  label: string;
  status: 'done' | 'active' | 'pending';
  icon: React.ComponentType<{ className?: string }>;
}

const AGENT_STEPS: AgentStep[] = [
  { label: 'Analyzing requirements', status: 'done', icon: Bot },
  { label: 'Planning architecture', status: 'done', icon: Bot },
  { label: 'Created project structure', status: 'done', icon: FileCode },
  { label: 'Created database layer', status: 'done', icon: FileCode },
  { label: 'Created UI components', status: 'active', icon: Hammer },
  { label: 'Installing dependencies', status: 'pending', icon: Wrench },
  { label: 'Running tests', status: 'pending', icon: TestTube },
];

export function ProjectWorkspace() {
  const { route, navigate } = useRouter();
  const { user } = useAuth();
  const projectId = route.name === 'project' ? route.id : '';
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<string>('src/App.tsx');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src', 'src/components', 'src/lib']));
  const [buildRunning, setBuildRunning] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) return;
    fetchProjects().then(data => {
      const found = (data as ProjectRow[]).find(p => p.id === projectId);
      if (found) setProject(found);
    });
    fetchChatMessages(projectId).then(data => setMessages(data as ChatMessage[])).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendChat = async () => {
    if (!chatInput.trim() || !user) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      user_id: user.id,
      project_id: projectId,
      role: 'user',
      content: chatInput,
      provider_used: null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    const input = chatInput;
    setChatInput('');

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      user_id: user.id,
      project_id: projectId,
      role: 'assistant',
      content: '',
      provider_used: 'Local AI · Qwen2.5 Coder',
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, assistantMsg]);

    const responses = [
      "I'll help you with that. Let me analyze the current project structure and make the changes.",
      "Got it. I'm updating the relevant files now. This should only take a moment.",
      "Understood. I'll modify the code to implement that feature. Building and testing after.",
      "I can do that. Let me check the current state and apply the changes.",
    ];
    const response = responses[Math.floor(Math.random() * responses.length)];

    setTimeout(async () => {
      setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: response } : m));
      await saveChatMessage(projectId, 'user', input);
      await saveChatMessage(projectId, 'assistant', response, 'Local AI · Qwen2.5 Coder');
      if (project) {
        await updateProject(project.id, { last_prompt: input, status: 'building' });
      }
    }, 800);
  };

  const handleBuild = () => {
    if (buildRunning) {
      setBuildRunning(false);
      setBuildProgress(0);
      return;
    }
    setBuildRunning(true);
    setBuildProgress(0);
    const interval = setInterval(() => {
      setBuildProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setBuildRunning(false);
          return 100;
        }
        return prev + 5;
      });
    }, 100);
  };

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-content-tertiary">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderFileTree = (nodes: FileNode[], path = ''): React.ReactNode => {
    return nodes.map(node => {
      const fullPath = path ? `${path}/${node.name}` : node.name;
      const isExpanded = expandedFolders.has(fullPath);
      const isSelected = selectedFile === fullPath;

      if (node.type === 'folder') {
        return (
          <div key={fullPath}>
            <button
              onClick={() => toggleFolder(fullPath)}
              className="flex items-center gap-1 w-full px-2 py-1 text-xs text-content-secondary hover:text-content-primary hover:bg-surface-hover rounded transition-colors"
            >
              {isExpanded ? <ChevronRight className="w-3 h-3 rotate-90 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
              {isExpanded ? <FolderOpen className="w-3.5 h-3.5 text-ark-blue-400 shrink-0" /> : <Folder className="w-3.5 h-3.5 text-content-tertiary shrink-0" />}
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
          onClick={() => setSelectedFile(fullPath)}
          className={`flex items-center gap-1 w-full px-2 py-1 text-xs rounded transition-colors ${
            isSelected ? 'bg-ark-blue-500/10 text-ark-blue-300' : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
          }`}
        >
          <ChevronRight className="w-3 h-3 opacity-0 shrink-0" />
          {node.language === 'md' ? <FileText className="w-3.5 h-3.5 shrink-0" /> : <FileCode className="w-3.5 h-3.5 shrink-0" />}
          <span className="truncate">{node.name}</span>
        </button>
      );
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Project header */}
      <div className="shrink-0 border-b border-surface-border px-5 py-3 flex items-center justify-between bg-ark-navy-900/30">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate({ name: 'projects' })} className="ark-btn-ghost text-xs">Projects</button>
          <ChevronRight className="w-3 h-3 text-content-tertiary" />
          <span className="text-sm font-medium text-content-primary">{project.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleBuild} className={buildRunning ? 'ark-btn-secondary !text-ark-accent-red' : 'ark-btn-primary'}>
            {buildRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {buildRunning ? 'Stop' : 'Build & Run'}
          </button>
        </div>
      </div>

      {/* Three panes */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: file explorer */}
        <div className="w-52 shrink-0 border-r border-surface-border overflow-auto p-2 bg-ark-navy-900/20">
          <p className="text-2xs uppercase tracking-wider text-content-tertiary px-2 py-1.5 font-semibold">Explorer</p>
          {renderFileTree(DEMO_FILES)}
        </div>

        {/* Center: editor / preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {buildRunning && (
            <div className="shrink-0 border-b border-surface-border p-3 bg-ark-navy-900/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-content-secondary">Building...</span>
                <span className="text-xs text-content-tertiary">{buildProgress}%</span>
              </div>
              <div className="h-1.5 bg-ark-navy-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-ark-blue-500 to-ark-blue-400 transition-all duration-100" style={{ width: `${buildProgress}%` }} />
              </div>
            </div>
          )}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Editor tab bar */}
            <div className="shrink-0 border-b border-surface-border flex items-center px-3 h-9 bg-ark-navy-900/30">
              <div className="flex items-center gap-1.5 text-xs text-content-primary px-2 py-1 bg-surface-hover rounded-t border-b-2 border-ark-blue-400">
                <FileCode className="w-3 h-3" />
                {selectedFile.split('/').pop()}
              </div>
            </div>
            {/* Code content */}
            <div className="flex-1 overflow-auto bg-ark-navy-950 p-4">
              <pre className="font-mono text-xs text-content-primary leading-relaxed whitespace-pre">
                <code>{DEMO_CODE['App.tsx'] ?? `// ${selectedFile}`}</code>
              </pre>
            </div>
          </div>
        </div>

        {/* Right: ARK Agent */}
        <div className="w-80 shrink-0 border-l border-surface-border flex flex-col bg-ark-navy-900/20">
          {/* Agent status */}
          <div className="shrink-0 p-4 border-b border-surface-border">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-ark-blue-500/15 flex items-center justify-center">
                <Bot className="w-4 h-4 text-ark-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-content-primary">ARK Agent</p>
                <p className="text-2xs text-content-tertiary">Building your project</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {AGENT_STEPS.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  {step.status === 'done' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-ark-accent-green shrink-0" />
                  ) : step.status === 'active' ? (
                    <Loader2 className="w-3.5 h-3.5 text-ark-accent-amber shrink-0 animate-spin" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-surface-border-light shrink-0" />
                  )}
                  <span className={`text-xs ${step.status === 'done' ? 'text-content-secondary' : step.status === 'active' ? 'text-content-primary' : 'text-content-tertiary'}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Chat */}
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs text-content-tertiary">Chat with ARK about your project</p>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === 'user' ? 'bg-ark-blue-500/20' : 'bg-ark-accent-green/15'
                }`}>
                  {msg.role === 'user' ? <UserIcon className="w-3 h-3 text-ark-blue-300" /> : <Bot className="w-3 h-3 text-ark-accent-green" />}
                </div>
                <div className={`max-w-[220px] ${msg.role === 'user' ? 'items-end' : ''}`}>
                  <div className={`rounded-lg px-3 py-2 text-xs ${
                    msg.role === 'user' ? 'bg-ark-blue-500/15 text-content-primary' : 'bg-surface-hover text-content-primary'
                  }`}>
                    {msg.content || <Loader2 className="w-3 h-3 animate-spin text-content-tertiary" />}
                  </div>
                  {msg.provider_used && (
                    <p className="text-2xs text-content-tertiary mt-1 px-1">{msg.provider_used}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat input */}
          <div className="shrink-0 p-3 border-t border-surface-border">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSendChat(); }}
                placeholder="Ask ARK..."
                className="ark-input !py-2 text-xs"
              />
              <button onClick={handleSendChat} disabled={!chatInput.trim()} className="ark-btn-primary !px-3 !py-2">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom status within workspace */}
      <div className="shrink-0 border-t border-surface-border px-4 py-1.5 flex items-center justify-between text-2xs text-content-tertiary bg-ark-navy-900/50">
        <div className="flex items-center gap-3">
          <span>Build: {buildRunning ? 'Running' : 'Idle'}</span>
          <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> Local AI: Ready</span>
          <span className="flex items-center gap-1"><Cloud className="w-3 h-3" /> Provider: Optimized</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="hover:text-content-secondary"><RefreshCw className="w-3 h-3" /></button>
          <button className="hover:text-content-secondary"><Eye className="w-3 h-3" /></button>
          <button className="hover:text-content-secondary"><Bug className="w-3 h-3" /></button>
        </div>
      </div>
    </div>
  );
}
