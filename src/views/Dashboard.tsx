import { useState, useEffect } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useAuth } from '@/context/AuthContext';
import { fetchProjects, createProject } from '@/lib/api';
import type { Project } from '@/types';
import { Sparkles, Plus, ArrowRight, Cpu, Cloud, Clock, CheckCircle2, Loader2 } from 'lucide-react';

interface ProjectData {
  id: string;
  name: string;
  project_type: string;
  status: string;
  build_status: string;
  updated_at: string;
  created_at: string;
}

type ProjectRow = Project & { updated_at: string; created_at: string };

export function Dashboard() {
  const { navigate } = useRouter();
  const { profile } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchProjects()
      .then(data => setProjects(data as ProjectRow[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!prompt.trim()) return;
    setCreating(true);
    try {
      const name = prompt.slice(0, 40).trim() || 'New Project';
      const project = await createProject(name, prompt, 'web', prompt) as Project & { id: string };
      navigate({ name: 'project', id: project.id });
    } catch {
      setCreating(false);
    }
  };

  const greeting = profile?.display_name ?? 'there';

  return (
    <div className="max-w-5xl mx-auto p-8 animate-fade-in">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-content-primary mb-1">Welcome back, {greeting}.</h1>
        <p className="text-content-secondary text-sm">What would you like to build?</p>
      </div>

      {/* Prompt field */}
      <div className="relative mb-8">
        <div className="ark-card p-1.5 flex items-end gap-2 focus-within:border-ark-blue-400 transition-colors">
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCreate();
            }}
            placeholder="Describe your project... e.g. Build a task management web app with dark mode"
            rows={2}
            className="flex-1 bg-transparent border-none resize-none px-3 py-2.5 text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none"
          />
          <button
            onClick={handleCreate}
            disabled={!prompt.trim() || creating}
            className="ark-btn-primary mb-1 mr-1"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Create Project
          </button>
        </div>
        <p className="text-2xs text-content-tertiary mt-2 px-1">
          Press Cmd/Ctrl + Enter to create
        </p>
      </div>

      {/* AI Network status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="ark-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-ark-accent-green/10 flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5 text-ark-accent-green" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-content-primary">Local AI</p>
            <p className="text-xs text-content-secondary">Ready · Qwen2.5 Coder 7B</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-ark-accent-green">
            <div className="w-1.5 h-1.5 rounded-full bg-ark-accent-green animate-pulse-soft" />
            Active
          </div>
        </div>
        <div className="ark-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-ark-blue-500/10 flex items-center justify-center shrink-0">
            <Cloud className="w-5 h-5 text-ark-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-content-primary">Cloud Providers</p>
            <p className="text-xs text-content-secondary">2 connected · 2 available</p>
          </div>
          <div className="text-xs text-content-tertiary">Available</div>
        </div>
      </div>

      {/* Recent Projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-content-primary">Recent Projects</h2>
          <button onClick={() => navigate({ name: 'projects' })} className="ark-btn-ghost text-xs">
            View all <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-content-tertiary">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="ark-card p-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-ark-blue-500/10 mb-3">
              <Plus className="w-6 h-6 text-ark-blue-400" />
            </div>
            <p className="text-sm text-content-secondary mb-1">No projects yet</p>
            <p className="text-xs text-content-tertiary">Describe what you want to build above to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.slice(0, 6).map(project => (
              <ProjectCard key={project.id} project={project} onClick={() => navigate({ name: 'project', id: project.id })} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project, onClick }: { project: ProjectData; onClick: () => void }) {
  const statusColors: Record<string, string> = {
    idle: 'text-content-tertiary',
    building: 'text-ark-accent-amber',
    running: 'text-ark-accent-green',
    error: 'text-ark-accent-red',
    complete: 'text-ark-accent-green',
  };

  const buildSuccess = project.build_status === 'success';
  const buildFailed = project.build_status === 'failed';

  return (
    <button onClick={onClick} className="ark-card p-4 text-left hover:border-surface-border-light transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div className="w-8 h-8 rounded-lg bg-ark-navy-800 border border-surface-border flex items-center justify-center text-xs font-semibold text-content-secondary">
          {project.name[0]?.toUpperCase()}
        </div>
        {buildSuccess ? (
          <CheckCircle2 className="w-4 h-4 text-ark-accent-green" />
        ) : buildFailed ? (
          <CheckCircle2 className="w-4 h-4 text-ark-accent-red" />
        ) : (
          <div className={`w-2 h-2 rounded-full ${project.status === 'building' ? 'bg-ark-accent-amber animate-pulse-soft' : 'bg-content-tertiary'}`} />
        )}
      </div>
      <h3 className="text-sm font-medium text-content-primary mb-1 group-hover:text-ark-blue-300 transition-colors truncate">{project.name}</h3>
      <p className="text-xs text-content-tertiary capitalize mb-3">{project.project_type}</p>
      <div className="flex items-center gap-1.5 text-2xs text-content-tertiary">
        <Clock className="w-3 h-3" />
        <span>{new Date(project.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        <span className={`ml-auto ${statusColors[project.status] ?? ''}`}>{project.status}</span>
      </div>
    </button>
  );
}
