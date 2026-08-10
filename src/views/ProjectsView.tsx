import { useState, useEffect } from 'react';
import { useRouter } from '@/context/RouterContext';
import { fetchProjects, createProject, deleteProject } from '@/lib/api';
import type { Project } from '@/types';
import { Plus, Loader2, Trash2, Clock, Globe, Monitor, Server, Smartphone, Gamepad2, Wrench } from 'lucide-react';

const PROJECT_TYPES = [
  { value: 'web', label: 'Web App', icon: Globe },
  { value: 'desktop', label: 'Desktop App', icon: Monitor },
  { value: 'api', label: 'API / Backend', icon: Server },
  { value: 'mobile', label: 'Mobile App', icon: Smartphone },
  { value: 'game', label: 'Game', icon: Gamepad2 },
  { value: 'tool', label: 'Tool / Utility', icon: Wrench },
];

type ProjectRow = Project & { id: string };

export function ProjectsView() {
  const { navigate } = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState('web');
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    fetchProjects()
      .then(data => setProjects(data as ProjectRow[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const project = await createProject(newName, newDesc, newType) as Project & { id: string };
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      navigate({ name: 'project', id: project.id });
    } catch {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteProject(id);
    load();
  };

  return (
    <div className="max-w-5xl mx-auto p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-content-primary">Projects</h1>
          <p className="text-sm text-content-secondary mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="ark-btn-primary">
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-content-tertiary">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="ark-card p-16 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-ark-blue-500/10 mb-4">
            <Plus className="w-7 h-7 text-ark-blue-400" />
          </div>
          <h3 className="text-sm font-medium text-content-primary mb-1">No projects yet</h3>
          <p className="text-xs text-content-tertiary mb-4">Create your first project to start building with ARK</p>
          <button onClick={() => setShowCreate(true)} className="ark-btn-primary">
            <Plus className="w-4 h-4" />
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(project => {
            const typeInfo = PROJECT_TYPES.find(t => t.value === project.project_type) ?? PROJECT_TYPES[0];
            const TypeIcon = typeInfo.icon;
            return (
              <div
                key={project.id}
                onClick={() => navigate({ name: 'project', id: project.id })}
                className="ark-card p-4 cursor-pointer hover:border-surface-border-light transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-ark-navy-800 border border-surface-border flex items-center justify-center">
                    <TypeIcon className="w-4 h-4 text-content-secondary" />
                  </div>
                  <button
                    onClick={e => handleDelete(project.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-content-tertiary hover:text-ark-accent-red transition-all p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <h3 className="text-sm font-medium text-content-primary mb-1 group-hover:text-ark-blue-300 transition-colors truncate">{project.name}</h3>
                <p className="text-xs text-content-tertiary line-clamp-2 mb-3">{project.description || 'No description'}</p>
                <div className="flex items-center gap-2 text-2xs text-content-tertiary">
                  <span className="capitalize">{typeInfo.label}</span>
                  <span>·</span>
                  <Clock className="w-3 h-3" />
                  <span>{new Date(project.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  <span className={`ml-auto capitalize ${project.status === 'building' ? 'text-ark-accent-amber' : project.status === 'error' ? 'text-ark-accent-red' : 'text-content-tertiary'}`}>
                    {project.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowCreate(false)}>
          <div className="ark-card p-6 w-full max-w-md animate-slide-up" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-content-primary mb-4">New Project</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1.5">Project Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="My Awesome App"
                  className="ark-input"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1.5">Description</label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="What does this project do?"
                  rows={3}
                  className="ark-input resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1.5">Project Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {PROJECT_TYPES.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setNewType(type.value)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs transition-all ${
                        newType === type.value
                          ? 'border-ark-blue-400 bg-ark-blue-500/10 text-ark-blue-300'
                          : 'border-surface-border text-content-secondary hover:border-surface-border-light'
                      }`}
                    >
                      <type.icon className="w-4 h-4" />
                      <span>{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowCreate(false)} className="ark-btn-secondary flex-1">Cancel</button>
              <button onClick={handleCreate} disabled={!newName.trim() || creating} className="ark-btn-primary flex-1">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
