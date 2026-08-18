import { useEffect, useMemo, useState } from 'react';
import { Globe, Loader2, Lock, Plus, Search, Unlock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { useRouter } from '@/context/RouterContext';
import { useSocial } from '@/context/SocialContext';
import { gitClone, githubCloneUrl, parseGithubRepoRef } from '@/lib/arkGitClient';
import { listNetworkPosts, publishNetworkPost, type NetworkPost } from '@/lib/arkSocial';
import { formatArkId, isArkUserId, normalizeArkId } from '@/lib/arkUserId';
import { getPluginRuntime, loadPluginState } from '@/lib/plugins';
import { GuestSocialBanner } from '@/components/GuestSocialBanner';

export function NetworkingView() {
  const { user, profile } = useAuth();
  const { navigate } = useRouter();
  const { recent, addRecent, touchRecentProject } = useRecentProjects();
  const { contacts } = useSocial();
  const myArkId = profile?.ark_id || '';
  const [posts, setPosts] = useState<NetworkPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'public' | 'mine'>('public');
  const [composer, setComposer] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [allowed, setAllowed] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const refresh = async () => {
    setLoading(true);
    const list = await listNetworkPosts({ userId: user?.id, myArkId });
    setPosts(list);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, [user?.id, myArkId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter(p => {
      if (tab === 'mine' && p.ownerArkId !== myArkId) return false;
      if (tab === 'public' && p.visibility !== 'public' && p.ownerArkId !== myArkId) return false;
      if (q && !`${p.title} ${p.summary} ${p.ownerName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [posts, query, tab, myArkId]);

  const postWork = async () => {
    if (!myArkId || !title.trim()) return;
    setBusy(true);
    const allowedIds = allowed.split(/[,\s]+/).map(normalizeArkId).filter(isArkUserId);
    await publishNetworkPost({
      userId: user?.id,
      ownerArkId: myArkId,
      ownerName: profile?.display_name || 'ARK user',
      title,
      summary,
      visibility,
      githubUrl,
      allowedArkIds: visibility === 'private' ? allowedIds : [],
    });
    setComposer(false);
    setTitle('');
    setSummary('');
    setGithubUrl('');
    setAllowed('');
    setBusy(false);
    await refresh();
  };

  const openInCode = async (post: NetworkPost) => {
    const project = addRecent(post.title);
    touchRecentProject(project.id, post.title);
    const ref = post.githubUrl ? parseGithubRepoRef(post.githubUrl) : null;
    if (ref) {
      const token = getPluginRuntime('github', loadPluginState()).token?.trim();
      const cloned = await gitClone(project.id, githubCloneUrl(ref.owner, ref.repo), token);
      if (!cloned.ok) setNote(cloned.error || 'Could not clone that repo. Opening a blank Code workspace instead.');
    }
    try {
      localStorage.setItem(
        `ark:project-draft:${project.id}`,
        post.summary || `Continue ${post.title} by ${post.ownerName || post.ownerArkId}`,
      );
    } catch {
      /* ignore */
    }
    navigate({ name: 'project', id: project.id });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden animate-fade-in bg-ark-navy-950">
      <div className="shrink-0 px-6 pt-[min(12vh,6rem)]">
        <div className="w-full max-w-3xl mx-auto">
          <GuestSocialBanner feature="networking" />
          <div className="flex items-center justify-between gap-4 mb-2">
            <h1 className="text-3xl font-semibold text-content-primary tracking-tight">Networking</h1>
            <button
              type="button"
              onClick={() => setComposer(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm text-[rgb(var(--color-accent-fg))]"
              style={{ backgroundColor: 'rgb(var(--color-accent))' }}
            >
              <Plus className="w-4 h-4" />
              Post work
            </button>
          </div>
          <p className="text-sm text-content-tertiary mb-5">
            ARK’s gallery. Post a finished app public or private. Others open it in Code from your ARK ID.
          </p>
          {user?.id === 'guest-local' && (
            <p className="text-[11px] text-amber-200/80 mb-4">
              Sign in so other ARK installs can see your posts. Guest posts stay on this PC.
            </p>
          )}
          <div className="flex items-center gap-2 mb-4">
            {(['public', 'mine'] as const).map(id => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-full px-3.5 py-1.5 text-sm ${
                  tab === id ? 'bg-surface-hover text-content-primary' : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                {id === 'public' ? 'Everyone' : 'Yours'}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 rounded-full bg-surface-hover px-3 py-1.5 w-48">
              <Search className="w-3.5 h-3.5 text-content-tertiary" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search"
                className="flex-1 bg-transparent text-sm text-content-primary outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-10">
        <div className="w-full max-w-3xl mx-auto space-y-3">
          {note && <p className="text-xs text-amber-200/90">{note}</p>}
          {composer && (
            <div className="rounded-2xl border border-surface-border bg-ark-navy-900/50 p-4 space-y-2">
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="What did you build?"
                className="w-full bg-ark-navy-950 border border-surface-border rounded-lg px-3 py-2 text-sm text-content-primary"
              />
              <textarea
                value={summary}
                onChange={e => setSummary(e.target.value)}
                placeholder="Short description — people will see this before they open it."
                rows={3}
                className="w-full bg-ark-navy-950 border border-surface-border rounded-lg px-3 py-2 text-sm text-content-primary resize-none"
              />
              <input
                value={githubUrl}
                onChange={e => setGithubUrl(e.target.value)}
                placeholder="GitHub URL (optional — so they can clone it)"
                className="w-full bg-ark-navy-950 border border-surface-border rounded-lg px-3 py-2 text-sm text-content-primary"
              />
              {recent[0] && (
                <button
                  type="button"
                  className="text-[11px] text-sky-300"
                  onClick={() => {
                    setTitle(recent[0].name);
                    setSummary(`Open ${recent[0].name} from ARK.`);
                  }}
                >
                  Use latest Code project: {recent[0].name}
                </button>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${visibility === 'public' ? 'border-sky-500/40 text-sky-200' : 'border-surface-border text-content-tertiary'}`}
                >
                  <Unlock className="w-3 h-3 inline mr-1" /> Public
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${visibility === 'private' ? 'border-sky-500/40 text-sky-200' : 'border-surface-border text-content-tertiary'}`}
                >
                  <Lock className="w-3 h-3 inline mr-1" /> Private
                </button>
              </div>
              {visibility === 'private' && (
                <input
                  value={allowed}
                  onChange={e => setAllowed(e.target.value)}
                  placeholder="Allowed ARK IDs, comma separated"
                  className="w-full bg-ark-navy-950 border border-surface-border rounded-lg px-3 py-2 text-sm text-content-primary"
                />
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="text-xs text-content-tertiary" onClick={() => setComposer(false)}>Cancel</button>
                <button
                  type="button"
                  disabled={busy || !title.trim() || !myArkId}
                  onClick={() => void postWork()}
                  className="rounded-lg bg-sky-600 text-white text-xs px-3 py-1.5 disabled:opacity-40"
                >
                  {busy ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-content-tertiary py-10">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading posts…
            </p>
          ) : shown.length === 0 ? (
            <div className="text-center py-16 text-content-tertiary">
              <Globe className="w-6 h-6 mx-auto mb-2 opacity-70" />
              <p className="text-sm">Nothing posted yet. Finish something in Code, then post it here.</p>
            </div>
          ) : (
            shown.map(post => (
              <article key={post.id} className="rounded-2xl border border-surface-border bg-ark-navy-900/40 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-content-primary truncate">{post.title}</p>
                    <p className="text-[11px] text-content-tertiary mt-0.5">
                      {post.ownerName || 'ARK user'} · {formatArkId(post.ownerArkId)} · {post.visibility}
                    </p>
                    {post.summary && <p className="text-xs text-content-secondary mt-2 leading-relaxed">{post.summary}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void openInCode(post)}
                    className="shrink-0 text-xs rounded-full border border-surface-border px-3 py-1.5 text-content-secondary hover:text-content-primary"
                  >
                    Open in Code
                  </button>
                </div>
                {post.ownerArkId && post.ownerArkId !== myArkId && (
                  <button
                    type="button"
                    className="mt-2 text-[11px] text-sky-300"
                    onClick={() => navigate({ name: 'message', peer: post.ownerArkId })}
                  >
                    Message {contacts.find(c => c.arkId === post.ownerArkId)?.displayName || formatArkId(post.ownerArkId)}
                  </button>
                )}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
