import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { listGitHubRepos, type GitHubRepo } from '@/lib/github';
import { getPluginRuntime, loadPluginState } from '@/lib/plugins';

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (repo: GitHubRepo) => void;
};

export function GitHubRepoPicker({ open, onClose, onPick }: Props) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const token = getPluginRuntime('github', loadPluginState()).token?.trim();
    if (!token) {
      setError('Connect GitHub in Plugins first.');
      setRepos([]);
      return;
    }
    setLoading(true);
    setError('');
    void listGitHubRepos(token, 30)
      .then(list => setRepos(list))
      .catch(err => setError(err instanceof Error ? err.message : 'Could not list repos'))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-surface-border bg-ark-navy-950 shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <p className="text-sm font-medium text-content-primary">Open a GitHub repo</p>
          <button type="button" onClick={onClose} className="text-content-tertiary hover:text-content-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-auto p-2">
          {loading && (
            <p className="flex items-center gap-2 px-3 py-6 text-xs text-content-tertiary">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading your repos…
            </p>
          )}
          {error && (
            <div className="px-3 py-4 space-y-2">
              <p className="text-xs text-amber-300/90">{error}</p>
              {error.includes('Connect GitHub') ? (
                <button
                  type="button"
                  className="text-xs text-sky-400 hover:text-sky-300"
                  onClick={() => {
                    onClose();
                    window.dispatchEvent(new CustomEvent('NOVA:open-settings', { detail: { section: 'plugins' } }));
                  }}
                >
                  Open Plugins → Connect GitHub
                </button>
              ) : null}
            </div>
          )}
          {!loading && !error && repos.map(repo => (
            <button
              key={repo.id}
              type="button"
              onClick={() => onPick(repo)}
              className="w-full text-left rounded-xl px-3 py-2.5 hover:bg-surface-hover"
            >
              <p className="text-sm text-content-primary truncate">{repo.full_name}</p>
              <p className="text-[11px] text-content-tertiary">
                {repo.private ? 'private' : 'public'}
                {(repo.size ?? 1) === 0 ? ' · empty' : ''}
                {repo.language ? ` · ${repo.language}` : ''}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
