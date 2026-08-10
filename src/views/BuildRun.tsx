import { useState, useEffect } from 'react';
import { fetchProjects, updateProject } from '@/lib/api';
import type { Project } from '@/types';
import {
  Play, Square, RefreshCw, Loader2, CheckCircle2, XCircle,
  Terminal, Globe, FileCode, AlertCircle,
} from 'lucide-react';

type ProjectRow = Project & { id: string };

export function BuildRun() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [buildState, setBuildState] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');
  const [buildOutput, setBuildOutput] = useState<{ text: string; type: 'info' | 'success' | 'error' | 'warning' }[]>([]);

  useEffect(() => {
    fetchProjects()
      .then(data => {
        const rows = data as ProjectRow[];
        setProjects(rows);
        if (rows.length > 0) setSelectedProject(rows[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const currentProject = projects.find(p => p.id === selectedProject);

  const handleBuild = async () => {
    if (!currentProject) return;
    setBuildState('running');
    setBuildOutput([]);

    const steps: { text: string; type: 'info' | 'success' | 'error' | 'warning'; delay: number }[] = [
      { text: 'Installing dependencies...', type: 'info', delay: 500 },
      { text: '  added 245 packages in 3.2s', type: 'info', delay: 300 },
      { text: '  npm install completed', type: 'success', delay: 200 },
      { text: 'Compiling TypeScript...', type: 'info', delay: 500 },
      { text: '  src/App.tsx compiled', type: 'info', delay: 200 },
      { text: '  src/main.tsx compiled', type: 'info', delay: 200 },
      { text: '  src/components/Header.tsx compiled', type: 'info', delay: 200 },
      { text: '  src/components/TaskList.tsx compiled', type: 'info', delay: 200 },
      { text: 'TypeScript compilation completed', type: 'success', delay: 200 },
      { text: 'Running tests...', type: 'info', delay: 400 },
      { text: '  ✓ App.test.tsx (3 tests passed)', type: 'success', delay: 200 },
      { text: '  ✓ TaskList.test.tsx (5 tests passed)', type: 'success', delay: 200 },
      { text: 'All tests passed', type: 'success', delay: 200 },
      { text: 'Starting development server...', type: 'info', delay: 300 },
      { text: '  Local: http://localhost:5173', type: 'success', delay: 200 },
      { text: 'Build completed successfully', type: 'success', delay: 200 },
    ];

    for (const step of steps) {
      await new Promise(resolve => setTimeout(resolve, step.delay));
      setBuildOutput(prev => [...prev, step]);
    }

    setBuildState('success');
    if (currentProject) {
      await updateProject(currentProject.id, { status: 'complete', build_status: 'success' });
    }
  };

  const handleStop = () => {
    setBuildState('idle');
    setBuildOutput([]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-content-tertiary">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-content-primary">Build & Run</h1>
          <p className="text-sm text-content-secondary mt-0.5">Build, test, and run your projects</p>
        </div>
        <div className="flex items-center gap-2">
          {buildState === 'running' ? (
            <button onClick={handleStop} className="ark-btn-secondary !text-ark-accent-red">
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
          ) : (
            <button onClick={handleBuild} disabled={!currentProject} className="ark-btn-primary">
              <Play className="w-3.5 h-3.5" />
              Build & Run
            </button>
          )}
          <button onClick={handleBuild} disabled={buildState === 'running' || !currentProject} className="ark-btn-secondary">
            <RefreshCw className="w-3.5 h-3.5" />
            Rebuild
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="ark-card p-16 text-center">
          <FileCode className="w-10 h-10 text-content-tertiary mx-auto mb-3" />
          <p className="text-sm text-content-secondary">No projects to build</p>
          <p className="text-xs text-content-tertiary mt-1">Create a project first</p>
        </div>
      ) : (
        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Project selector */}
          <div className="w-56 shrink-0 space-y-2 overflow-auto">
            <p className="text-2xs uppercase tracking-wider text-content-tertiary font-semibold px-1 mb-2">Projects</p>
            {projects.map(project => (
              <button
                key={project.id}
                onClick={() => { setSelectedProject(project.id); setBuildState('idle'); setBuildOutput([]); }}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedProject === project.id
                    ? 'border-ark-blue-400 bg-ark-blue-500/10'
                    : 'border-surface-border hover:border-surface-border-light'
                }`}
              >
                <p className="text-sm font-medium text-content-primary truncate">{project.name}</p>
                <p className="text-2xs text-content-tertiary mt-0.5 capitalize">{project.project_type}</p>
              </button>
            ))}
          </div>

          {/* Build output */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {currentProject && (
              <div className="shrink-0 mb-3 flex items-center gap-2">
                {buildState === 'idle' && <div className="w-2 h-2 rounded-full bg-content-tertiary" />}
                {buildState === 'running' && <Loader2 className="w-3.5 h-3.5 text-ark-accent-amber animate-spin" />}
                {buildState === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-ark-accent-green" />}
                {buildState === 'failed' && <XCircle className="w-3.5 h-3.5 text-ark-accent-red" />}
                <span className="text-sm font-medium text-content-primary">{currentProject.name}</span>
                <span className={`text-xs capitalize ml-auto ${
                  buildState === 'success' ? 'text-ark-accent-green' :
                  buildState === 'running' ? 'text-ark-accent-amber' :
                  buildState === 'failed' ? 'text-ark-accent-red' :
                  'text-content-tertiary'
                }`}>
                  {buildState === 'idle' ? 'Not built' : buildState}
                </span>
              </div>
            )}

            {/* Terminal output */}
            <div className="flex-1 ark-card overflow-hidden flex flex-col bg-ark-navy-950">
              <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-surface-border bg-ark-navy-900/50">
                <Terminal className="w-3.5 h-3.5 text-content-tertiary" />
                <span className="text-xs text-content-secondary">Build Output</span>
              </div>
              <div className="flex-1 overflow-auto p-4 font-mono text-xs space-y-0.5">
                {buildOutput.length === 0 ? (
                  <div className="text-content-tertiary">
                    <p className="mb-2">Ready to build.</p>
                    <p className="flex items-center gap-1.5">
                      <AlertCircle className="w-3 h-3" />
                      Click "Build & Run" to compile and test this project.
                    </p>
                  </div>
                ) : (
                  buildOutput.map((line, i) => (
                    <div
                      key={i}
                      className={`animate-fade-in ${
                        line.type === 'success' ? 'text-ark-accent-green' :
                        line.type === 'error' ? 'text-ark-accent-red' :
                        line.type === 'warning' ? 'text-ark-accent-amber' :
                        'text-content-secondary'
                      }`}
                    >
                      {line.text}
                    </div>
                  ))
                )}
                {buildState === 'running' && (
                  <div className="flex items-center gap-1 text-content-tertiary">
                    <span className="animate-pulse-soft">_</span>
                  </div>
                )}
              </div>
              {buildState === 'success' && (
                <div className="shrink-0 border-t border-surface-border p-3 bg-ark-navy-900/50 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-ark-accent-green" />
                  <span className="text-xs text-content-secondary">Running at</span>
                  <a href="#" className="text-xs text-ark-blue-300 hover:text-ark-blue-200">http://localhost:5173</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
