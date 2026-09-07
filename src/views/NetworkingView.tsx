import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark, ChevronRight, Clock3, DollarSign, Eye, Folder, Globe, Loader2, Lock,
  MessageSquare, MoreVertical, Plus, Search, Send, User, UserPlus, Unlock,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { useRouter } from '@/context/RouterContext';
import { useSocial } from '@/context/SocialContext';
import { listNetworkPosts, publishNetworkPost, deleteNetworkPost, type NetworkPost } from '@/lib/arkSocial';
import { formatArkId, isArkUserId, lookupArkUser, normalizeArkId } from '@/lib/arkUserId';
import { isDevArkAlias } from '@/lib/arkDevAccount';
import { GuestSocialBanner } from '@/components/GuestSocialBanner';
import { ArkAvatar } from '@/components/ArkAvatar';
import { buildDemoNetworkPosts } from '@/lib/socialDemo';
import { Modal } from '@/components/Modal';
import { pushSidebarToast } from '@/lib/sidebarToast';
import { pushLocalNotification } from '@/lib/localNotifications';
import { getLocalPrefs } from '@/lib/localPrefs';
import {
  getSaveCount,
  getViewCount,
  hasUnreadDiscussion,
  loadDiscussions,
  markDiscussionRead,
  recordPostSave,
  recordPostView,
  saveDiscussions,
  type DiscussionMessage,
} from '@/lib/networkEngagement';

type FeedTab = 'public' | 'paid' | 'mine' | 'saved';

const SAVED_KEY = 'NOVA:network-saved';

function loadSavedIds(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const list = raw ? JSON.parse(raw) as string[] : [];
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

function persistSavedIds(ids: string[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
}

function ownerAvatarSrc(
  ownerArkId: string,
  myArkId: string,
  contacts: { arkId: string; avatarUrl?: string }[],
): string | undefined {
  if (ownerArkId && ownerArkId === myArkId) return getLocalPrefs().avatarDataUrl;
  return contacts.find(c => c.arkId === ownerArkId)?.avatarUrl;
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
}

const PROJECT_TYPES = [
  { id: 'all', label: 'All' },
  { id: 'web', label: 'Web app' },
  { id: 'software', label: 'Software' },
  { id: 'game', label: 'Game' },
  { id: 'mobile', label: 'Mobile app' },
  { id: 'site', label: 'Website' },
] as const;

const PROJECT_PLATFORMS = [
  { id: 'all', label: 'All' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'windows', label: 'Windows' },
  { id: 'macos', label: 'macOS' },
  { id: 'ios', label: 'iOS' },
  { id: 'android', label: 'Android' },
  { id: 'web', label: 'Web' },
] as const;

type ProjectTypeId = (typeof PROJECT_TYPES)[number]['id'];
type ProjectPlatformId = (typeof PROJECT_PLATFORMS)[number]['id'];

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.max(0, Math.floor(ms / 3600_000));
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function NetworkingView() {
  const { user, profile } = useAuth();
  const { navigate } = useRouter();
  const { recent } = useRecentProjects();
  const { contacts, inviteByArkId, refreshContacts } = useSocial();
  const myArkId = profile?.ark_id || '';
  const [posts, setPosts] = useState<NetworkPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<FeedTab>('public');
  const [composer, setComposer] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [intent, setIntent] = useState<'help' | 'share'>('help');
  const [paying, setPaying] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [allowed, setAllowed] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [idSearchBusy, setIdSearchBusy] = useState(false);
  const [idSearchHit, setIdSearchHit] = useState<{ arkId: string; displayName: string | null } | null>(null);
  const [idSearchNote, setIdSearchNote] = useState('');
  const [projectType, setProjectType] = useState<ProjectTypeId>('all');
  const [platform, setPlatform] = useState<ProjectPlatformId>('all');
  const [platformOpen, setPlatformOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>(() => loadSavedIds());
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [discussionDraft, setDiscussionDraft] = useState('');
  const [discussionByPost, setDiscussionByPost] = useState<Record<string, DiscussionMessage[]>>(
    () => loadDiscussions(),
  );
  const [engagementTick, setEngagementTick] = useState(0);
  const [codeAsked, setCodeAsked] = useState<Record<string, boolean>>({});
  const [allowDiscussionPost, setAllowDiscussionPost] = useState(true);
  const [reportPost, setReportPost] = useState<NetworkPost | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportProofName, setReportProofName] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const platformRef = useRef<HTMLDivElement>(null);
  const reportProofRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!platformOpen && !menuPostId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (platformRef.current?.contains(t)) return;
      setPlatformOpen(false);
      setMenuPostId(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [platformOpen, menuPostId]);

  const refresh = async () => {
    setLoading(true);
    const list = await listNetworkPosts({ userId: user?.id, myArkId });
    const demos = buildDemoNetworkPosts(myArkId || '1110000');
    const real = list.filter(p => !String(p.id).startsWith('demo-'));
    setPosts([...demos, ...real]);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, [user?.id, myArkId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qId = normalizeArkId(query);
    const saved = new Set(savedIds);
    return posts.filter(p => {
      if (tab === 'mine' && p.ownerArkId !== myArkId) return false;
      if (tab === 'saved' && !saved.has(p.id)) return false;
      if (tab === 'paid') {
        if (!p.paying) return false;
        if (p.visibility !== 'public' && p.ownerArkId !== myArkId) return false;
      }
      if (tab === 'public' && p.visibility !== 'public' && p.ownerArkId !== myArkId) return false;
      if (projectType !== 'all' && p.projectType && p.projectType !== projectType) return false;
      if (platform !== 'all' && p.platform && p.platform !== platform) return false;
      if (q) {
        const hay = `${p.title} ${p.summary} ${p.details || ''} ${p.ownerName} ${p.categoryLabel || ''} ${p.ownerArkId}`.toLowerCase();
        if (!hay.includes(q) && !(isArkUserId(qId) && p.ownerArkId === qId)) return false;
      }
      return true;
    });
  }, [posts, query, tab, myArkId, savedIds, projectType, platform]);

  useEffect(() => {
    const raw = query.trim();
    const id = normalizeArkId(raw);
    const wantDev = isDevArkAlias(raw);
    if ((!wantDev && !isArkUserId(id)) || (!wantDev && id === myArkId)) {
      setIdSearchHit(null);
      setIdSearchNote('');
      return;
    }
    let cancelled = false;
    setIdSearchBusy(true);
    setIdSearchNote('');
    void lookupArkUser(wantDev ? 'DEV' : id).then((hit) => {
      if (cancelled) return;
      setIdSearchBusy(false);
      if (hit) {
        if (hit.arkId === myArkId) {
          setIdSearchHit(null);
          setIdSearchNote('That’s your own account');
          return;
        }
        setIdSearchHit({
          arkId: hit.arkId,
          displayName: wantDev ? 'DEV' : hit.displayName,
        });
      } else {
        setIdSearchHit(null);
        setIdSearchNote(wantDev ? 'DEV is not registered yet' : `No NOVA account found for ${id}`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query, myArkId]);

  const toggleSave = (postId: string, e?: { stopPropagation: () => void }) => {
    e?.stopPropagation();
    setSavedIds(prev => {
      const saving = !prev.includes(postId);
      const next = saving ? [...prev, postId] : prev.filter(id => id !== postId);
      persistSavedIds(next);
      if (myArkId) {
        recordPostSave(postId, myArkId, saving);
        setEngagementTick(t => t + 1);
      }
      return next;
    });
  };

  const selected = selectedId ? shown.find(p => p.id === selectedId) || posts.find(p => p.id === selectedId) : null;

  useEffect(() => {
    if (!selectedId || !myArkId) return;
    const post = posts.find(p => p.id === selectedId);
    if (!post) return;
    recordPostView(selectedId, myArkId, post.ownerArkId);
    setEngagementTick(t => t + 1);
  }, [selectedId, myArkId, posts]);

  const resetComposer = () => {
    setTitle('');
    setSummary('');
    setDetails('');
    setGithubUrl('');
    setAllowed('');
    setPaying(false);
    setIntent('help');
    setVisibility('public');
    setAllowDiscussionPost(true);
  };

  const postWork = async () => {
    if (!myArkId || !title.trim()) return;
    setBusy(true);
    const allowedIds = allowed.split(/[,\s]+/).map(normalizeArkId).filter(isArkUserId);
    await publishNetworkPost({
      userId: user?.id,
      ownerArkId: myArkId,
      ownerName: profile?.display_name || 'NOVA user',
      title,
      summary,
      details,
      intent,
      paying: intent === 'help' && paying,
      visibility,
      githubUrl,
      allowedArkIds: visibility === 'private' ? allowedIds : [],
      allowDiscussion: allowDiscussionPost,
      codeRequiresApproval: true,
    });
    setComposer(false);
    resetComposer();
    setBusy(false);
    await refresh();
  };

  const ensureDiscussion = (postId: string) => {
    setDiscussionByPost(prev => {
      if (prev[postId]) return prev;
      return { ...prev, [postId]: [] };
    });
  };

  const sendDiscussion = () => {
    if (!selectedId) return;
    const body = discussionDraft.trim();
    if (!body) return;
    const name = profile?.display_name || 'You';
    setDiscussionDraft('');
    setDiscussionByPost(prev => {
      const next = {
        ...prev,
        [selectedId]: [
          ...(prev[selectedId] || []),
          {
            id: crypto.randomUUID(),
            name,
            body,
            at: new Date().toISOString(),
            senderArkId: myArkId || undefined,
          },
        ],
      };
      saveDiscussions(next);
      return next;
    });
  };

  const openDiscussion = (postId: string) => {
    ensureDiscussion(postId);
    setDiscussionOpen(true);
    const msgs = discussionByPost[postId] || [];
    markDiscussionRead(postId, msgs.length);
    setEngagementTick(t => t + 1);
  };

  const askToViewCode = (post: NetworkPost) => {
    setCodeAsked(prev => ({ ...prev, [post.id]: true }));
    setNote(`Asked ${post.ownerName || 'the owner'} to view the code. Waiting for approval.`);
  };

  const submitReport = () => {
    if (!reportPost || !reportReason.trim()) return;
    setReportBusy(true);
    const who = reportPost.ownerName || 'NOVA user';
    const id = formatArkId(reportPost.ownerArkId);
    pushLocalNotification({
      kind: 'report',
      title: 'Your report is being reviewed',
      body: `We typically review within 24 hours. Reported: ${who} (${id}) · “${reportPost.title}”.${reportProofName ? ` Proof attached: ${reportProofName}.` : ''} You’ll get another notice when it’s done.`,
    });
    pushSidebarToast('Report sent. under review for up to 24 hours.', { ttlMs: 10_000, id: 'report-sent' });
    setNote('Report sent. Check Notifications for status.');
    setReportBusy(false);
    setReportPost(null);
    setReportReason('');
    setReportProofName(null);
    setMenuPostId(null);
  };

  const messageOwner = (post: NetworkPost) => {
    if (!post.ownerArkId || post.ownerArkId === myArkId) return;
    navigate({ name: 'message', peer: post.ownerArkId });
  };

  const addOwner = async (post: NetworkPost) => {
    if (!post.ownerArkId || post.ownerArkId === myArkId) return;
    setAddBusy(true);
    setNote('');
    try {
      await inviteByArkId(post.ownerArkId, post.ownerName);
      await refreshContacts();
      setNote(`Friend request sent to ${formatArkId(post.ownerArkId)}. They’ll appear after they accept.`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not add that user.');
    }
    setAddBusy(false);
  };

  const addFromSearchId = async () => {
    if (!idSearchHit) return;
    setAddBusy(true);
    setIdSearchNote('');
    try {
      await inviteByArkId(idSearchHit.arkId, idSearchHit.displayName || undefined);
      await refreshContacts();
      setIdSearchNote(`Friend request sent to ${formatArkId(idSearchHit.arkId)}. They’ll appear after they accept.`);
    } catch (err) {
      setIdSearchNote(err instanceof Error ? err.message : 'Could not send friend request.');
    }
    setAddBusy(false);
  };

  return (
    <>
      <div className="h-full box-border p-4 animate-fade-in bg-transparent">
        <div className="h-full min-h-0 flex flex-col rounded-2xl border border-surface-border bg-ark-navy-900 shadow-[0_8px_32px_rgba(0,0,0,0.35)] overflow-hidden">
          <div className="shrink-0 px-5 sm:px-8 pt-5 pb-3">
            <GuestSocialBanner feature="networking" />
            <p className="text-[10px] text-content-tertiary mt-2 text-center">
              Posts sync for signed-in accounts. Post chat, code-view requests, and reports are currently saved on this device only.
            </p>
            {/* Centered toolbar. Search and filter pill match size */}
            <div className="mt-3 flex items-center justify-center gap-2.5 flex-wrap">
              <div className="h-10 w-56 flex items-center gap-2 rounded-full bg-ark-navy-950/70 border border-white/10 px-3">
                <Search className="w-3.5 h-3.5 text-content-tertiary shrink-0" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search posts or 7-digit NOVA ID"
                  className="flex-1 min-w-0 bg-transparent text-sm text-content-primary outline-none placeholder:text-content-tertiary"
                />
              </div>
              <div className="h-10 w-44 flex items-center justify-evenly rounded-full bg-ark-navy-950/70 border border-white/10 px-1">
                {([
                  { id: 'public' as const, label: 'Everyone', icon: Globe },
                  { id: 'paid' as const, label: 'Paid', icon: DollarSign },
                  { id: 'mine' as const, label: 'Yours', icon: User },
                  { id: 'saved' as const, label: 'Saved', icon: Bookmark },
                ]).map(item => {
                  const Icon = item.icon;
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.label}
                      aria-label={item.label}
                      onClick={() => setTab(item.id)}
                      className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors ${
                        active
                          ? 'bg-white/10 text-content-primary'
                          : 'text-content-tertiary hover:text-content-secondary hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => { setComposer(true); setSelectedId(null); }}
                className="shrink-0 h-10 inline-flex items-center gap-1.5 rounded-full px-4 text-sm text-[rgb(var(--color-accent-fg))]"
                style={{ backgroundColor: 'rgb(var(--color-accent))' }}
              >
                <Plus className="w-4 h-4" />
                Post
              </button>
            </div>
            {user?.id === 'guest-local' && (
              <p className="text-[11px] text-amber-200/80 mt-3 text-center">
                Sign in so other NOVA installs can see your posts. Guest posts stay on this PC.
              </p>
            )}
          </div>

          <div className="shrink-0 px-5 sm:px-8 pb-4">
            <div className="w-full flex items-center justify-center gap-2 overflow-x-auto">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-ark-navy-950/60 p-1 shrink-0">
                {PROJECT_TYPES.map(item => {
                  const active = projectType === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setProjectType(item.id)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors ${
                        active
                          ? 'bg-white/10 text-content-primary'
                          : 'text-content-tertiary hover:text-content-secondary'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div
                ref={platformRef}
                role="listbox"
                className="inline-flex items-center rounded-full border border-white/10 bg-ark-navy-950/60 p-1 shrink-0"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (platformOpen) {
                      setPlatform('all');
                      setPlatformOpen(false);
                      return;
                    }
                    setPlatformOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-content-secondary hover:text-content-primary transition-colors"
                  aria-expanded={platformOpen}
                  aria-haspopup="listbox"
                >
                  <span className="text-content-tertiary">Platform</span>
                  <span className="text-content-primary">
                    {PROJECT_PLATFORMS.find(p => p.id === platform)?.label || 'All'}
                  </span>
                  <ChevronRight className={`w-3 h-3 text-content-tertiary transition-transform ${platformOpen ? 'translate-x-0.5' : ''}`} />
                </button>
                {platformOpen &&
                  PROJECT_PLATFORMS.filter(item => item.id !== 'all').map(item => {
                    const active = platform === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          setPlatform(item.id);
                          setPlatformOpen(false);
                        }}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
                          active
                            ? 'bg-white/10 text-content-primary'
                            : 'text-content-secondary hover:text-content-primary hover:bg-white/5'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-8 pb-6">
            <div className="w-full">
              {note && <p className="text-xs text-amber-200/90 mb-3">{note}</p>}
              {(idSearchHit || idSearchBusy || idSearchNote) && (isArkUserId(normalizeArkId(query)) || isDevArkAlias(query)) && (
                <div className="mb-3 rounded-2xl border border-sky-500/25 bg-sky-500/5 px-4 py-3 flex items-center gap-3 flex-wrap">
                  {idSearchBusy ? (
                    <p className="text-sm text-content-tertiary flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Looking up NOVA ID…
                    </p>
                  ) : idSearchHit ? (
                    <>
                      <ArkAvatar name={idSearchHit.displayName || idSearchHit.arkId} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-content-primary">
                          {idSearchHit.displayName || 'NOVA user'}
                        </p>
                        <p className="text-[11px] text-content-tertiary">NOVA ID {formatArkId(idSearchHit.arkId)}</p>
                        {idSearchNote ? <p className="text-[11px] text-amber-200/90 mt-1">{idSearchNote}</p> : null}
                      </div>
                      <button
                        type="button"
                        disabled={addBusy}
                        onClick={() => void addFromSearchId()}
                        className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1.5 text-xs text-white disabled:opacity-40"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Add friend
                      </button>
                    </>
                  ) : (
                    <p className="text-sm text-amber-200/90">{idSearchNote || 'No match for that NOVA ID.'}</p>
                  )}
                </div>
              )}
              {loading ? (
                <p className="flex items-center gap-2 text-sm text-content-tertiary py-10">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading posts…
                </p>
              ) : shown.length === 0 ? (
                <div className="text-center py-16 text-content-tertiary">
                  <Globe className="w-6 h-6 mx-auto mb-2 opacity-70" />
                  <p className="text-sm">
                    {isArkUserId(normalizeArkId(query)) || isDevArkAlias(query)
                      ? 'No posts from that NOVA ID yet. Use Add friend above if they were found.'
                      : tab === 'saved'
                        ? 'No saved projects yet. Bookmark a post to find it here.'
                        : tab === 'paid'
                          ? 'No paid posts yet.'
                          : 'Nothing here yet. Post what you’re building. or that you need help.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {shown.map(post => {
                    const isSaved = savedIds.includes(post.id);
                    void engagementTick;
                    const viewCount = getViewCount(post.id);
                    const saveCount = getSaveCount(post.id);
                    const replies = discussionByPost[post.id] || [];
                    const replyCount = replies.length;
                    const chatUnread = hasUnreadDiscussion(post.id, replies, myArkId);
                    const menuOpen = menuPostId === post.id;
                    return (
                      <div
                        key={post.id}
                        className="relative w-full text-left rounded-2xl border border-surface-border bg-ark-navy-900/45 hover:bg-ark-navy-900/60 px-3.5 py-3.5 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(post.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start gap-2.5">
                            <ArkAvatar
                              name={post.ownerName || post.ownerArkId}
                              src={ownerAvatarSrc(post.ownerArkId, myArkId, contacts)}
                              size="md"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-sm font-medium text-content-primary truncate">{post.title}</p>
                                    {post.intent === 'help' && (
                                      <span className="text-[10px] rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-amber-200/90">
                                        Help
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-content-tertiary mt-0.5 truncate">
                                    by {post.ownerName || 'NOVA user'}
                                  </p>
                                </div>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  title={isSaved ? 'Unsave' : 'Save'}
                                  onClick={e => toggleSave(post.id, e)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      toggleSave(post.id);
                                    }
                                  }}
                                  className={`shrink-0 p-1 rounded-md ${
                                    isSaved ? 'text-sky-300' : 'text-content-tertiary hover:text-content-secondary'
                                  }`}
                                >
                                  <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`} />
                                </span>
                              </div>
                              {post.summary && (
                                <p className="text-xs text-content-secondary mt-2 leading-relaxed line-clamp-2">{post.summary}</p>
                              )}
                              {(post.categoryLabel || post.platform || post.projectType) && (
                                <span className="inline-flex mt-2.5 text-[10px] rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-content-tertiary">
                                  {post.categoryLabel
                                    || PROJECT_PLATFORMS.find(x => x.id === post.platform)?.label
                                    || PROJECT_TYPES.find(x => x.id === post.projectType)?.label
                                    || 'Project'}
                                </span>
                              )}
                              <div className="mt-3 flex items-center gap-3 min-w-0 text-[10px] text-content-tertiary">
                                <span className="inline-flex items-center gap-1" title="Views">
                                  <Eye className="w-3 h-3" />
                                  {formatCount(viewCount)}
                                </span>
                                <span className="inline-flex items-center gap-1" title="Messages">
                                  <span className="relative inline-flex">
                                    <MessageSquare className="w-3 h-3" />
                                    {chatUnread ? (
                                      <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-sky-400" aria-hidden />
                                    ) : null}
                                  </span>
                                  {formatCount(replyCount)}
                                </span>
                                <span className="inline-flex items-center gap-1" title="Saved">
                                  <Bookmark className="w-3 h-3" />
                                  {formatCount(saveCount)}
                                </span>
                                <span className="inline-flex items-center gap-1" title="Posted">
                                  <Clock3 className="w-3 h-3" />
                                  {timeAgo(post.createdAt)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                        <div className="absolute bottom-3 right-3">
                          <button
                            type="button"
                            title="More"
                            aria-label="More"
                            onClick={e => {
                              e.stopPropagation();
                              setMenuPostId(menuOpen ? null : post.id);
                            }}
                            className="p-1 rounded-md text-content-tertiary hover:text-content-secondary hover:bg-white/5"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                          {menuOpen && (
                            <div className="absolute right-0 bottom-full mb-1 z-20 min-w-[8.5rem] rounded-xl border border-white/10 bg-ark-navy-900 shadow-xl overflow-hidden">
                              {post.ownerArkId === myArkId && !String(post.id).startsWith('demo-') && (
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-xs text-rose-300 hover:bg-white/[0.05]"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setMenuPostId(null);
                                    void deleteNetworkPost(post.id, user?.id).then(() => {
                                      if (selectedId === post.id) {
                                        setSelectedId(null);
                                        setDiscussionOpen(false);
                                      }
                                      return refresh();
                                    });
                                  }}
                                >
                                  Delete
                                </button>
                              )}
                              {post.ownerArkId !== myArkId && (
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-xs text-rose-300 hover:bg-white/[0.05]"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setMenuPostId(null);
                                    setReportPost(post);
                                    setReportReason('');
                                    setReportProofName(null);
                                  }}
                                >
                                  Report
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => {
          setSelectedId(null);
          setDiscussionOpen(false);
          setDiscussionDraft('');
        }}
        title={selected?.title || 'Post'}
        size={discussionOpen ? 'xl' : 'md'}
      >
        {selected && (
          <div className={`h-full min-h-0 flex ${discussionOpen ? 'flex-row' : 'flex-col'}`}>
            <div className={`overflow-y-auto px-5 py-4 space-y-4 ${discussionOpen ? 'flex-1 min-w-0' : 'h-full'}`}>
              <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                  <ArkAvatar
                    name={selected.ownerName || selected.ownerArkId}
                    src={ownerAvatarSrc(selected.ownerArkId, myArkId, contacts)}
                    size="lg"
                    className="!h-12 !w-12 !text-xs"
                  />
                  {selected.paying && (
                    <span className="absolute -top-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-500 text-white shadow">
                      <DollarSign className="w-3 h-3" strokeWidth={2.5} />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {selected.intent === 'help' && (
                      <span className="text-[10px] rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                        Needs help
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-content-tertiary mt-1">
                    {selected.ownerName || 'NOVA user'} · {formatArkId(selected.ownerArkId)} · {timeAgo(selected.createdAt)}
                  </p>
                </div>
              </div>
              {selected.summary && (
                <p className="text-sm text-content-secondary leading-relaxed">{selected.summary}</p>
              )}
              {(selected.details || '').trim() && (
                <p className="text-sm text-content-primary/90 leading-relaxed whitespace-pre-wrap">{selected.details}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {selected.ownerArkId !== myArkId && (
                  <>
                    <button
                      type="button"
                      disabled={addBusy}
                      onClick={() => void addOwner(selected)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-3 py-1.5 text-xs text-content-secondary hover:text-content-primary disabled:opacity-40"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Add user
                    </button>
                    <button
                      type="button"
                      onClick={() => messageOwner(selected)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-3 py-1.5 text-xs text-content-secondary hover:text-content-primary"
                    >
                      <User className="w-3.5 h-3.5" />
                      Contact user
                    </button>
                  </>
                )}
                {selected.allowDiscussion !== false && (
                  <button
                    type="button"
                    onClick={() => openDiscussion(selected.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1.5 text-xs text-white"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Message
                  </button>
                )}
                {selected.ownerArkId !== myArkId && (
                  <button
                    type="button"
                    disabled={Boolean(codeAsked[selected.id])}
                    onClick={() => askToViewCode(selected)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-3 py-1.5 text-xs text-content-secondary hover:text-content-primary disabled:opacity-50"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    {codeAsked[selected.id] ? 'Approval requested' : 'Ask to view code'}
                  </button>
                )}
                {selected.ownerArkId === myArkId && !String(selected.id).startsWith('demo-') && (
                  <button
                    type="button"
                    className="text-xs text-rose-300 px-2"
                    onClick={() => void deleteNetworkPost(selected.id, user?.id).then(() => {
                      setSelectedId(null);
                      setDiscussionOpen(false);
                      return refresh();
                    })}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            {discussionOpen && selected.allowDiscussion !== false && (
              <div className="w-[min(100%,20rem)] shrink-0 flex flex-col min-h-0 bg-ark-navy-950/30 pl-1">
                <div className="shrink-0 px-4 pt-4 pb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-content-primary">Post chat</p>
                  <button
                    type="button"
                    onClick={() => setDiscussionOpen(false)}
                    className="text-[10px] text-content-tertiary hover:text-content-secondary"
                  >
                    Close
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-3">
                  {(discussionByPost[selected.id] || []).map(m => (
                    <div key={m.id}>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[11px] font-medium text-content-primary truncate">{m.name}</p>
                        <p className="text-[10px] text-content-tertiary shrink-0">{timeAgo(m.at)}</p>
                      </div>
                      <p className="text-xs text-content-secondary mt-1 leading-relaxed">{m.body}</p>
                    </div>
                  ))}
                </div>
                <div className="shrink-0 px-3 pb-3 pt-1">
                  <div className="flex items-center gap-1 rounded-full bg-ark-navy-950/70 border border-white/10 pl-3 pr-1 py-1">
                    <input
                      value={discussionDraft}
                      onChange={e => setDiscussionDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendDiscussion();
                        }
                      }}
                      placeholder="Chime in…"
                      className="flex-1 min-w-0 bg-transparent text-xs text-content-primary placeholder:text-content-tertiary outline-none py-1"
                    />
                    <button
                      type="button"
                      onClick={sendDiscussion}
                      disabled={!discussionDraft.trim()}
                      className="h-7 w-7 shrink-0 rounded-full bg-sky-600 text-white flex items-center justify-center disabled:opacity-35"
                      aria-label="Send"
                    >
                      <Send className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(reportPost)}
        onClose={() => {
          setReportPost(null);
          setReportReason('');
          setReportProofName(null);
        }}
        title="Report"
        size="sm"
      >
        {reportPost && (
          <div className="px-5 py-4 space-y-3.5">
            <div className="rounded-xl bg-black/30 px-3.5 py-3 space-y-1">
              <p className="text-sm text-content-primary">{reportPost.ownerName || 'NOVA user'}</p>
              <p className="text-[11px] font-mono text-content-tertiary tracking-wider">
                {formatArkId(reportPost.ownerArkId)}
              </p>
              <p className="text-xs text-content-secondary pt-1">
                Project: <span className="text-content-primary">{reportPost.title}</span>
              </p>
            </div>

            <label className="block space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider text-content-tertiary">What happened?</span>
              <textarea
                value={reportReason}
                onChange={e => setReportReason(e.target.value)}
                spellCheck
                lang="en"
                placeholder="e.g. This is my project. they copied it without permission…"
                rows={4}
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary/70 outline-none focus:border-sky-500/40 resize-none leading-relaxed"
              />
            </label>

            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider text-content-tertiary">Proof (optional)</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => reportProofRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-content-secondary hover:text-content-primary"
                >
                  <Folder className="w-3.5 h-3.5" />
                  Upload project / files
                </button>
                {reportProofName && (
                  <span className="text-[11px] text-content-tertiary truncate">{reportProofName}</span>
                )}
              </div>
              <input
                ref={reportProofRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => {
                  const files = e.target.files;
                  if (!files?.length) {
                    setReportProofName(null);
                    return;
                  }
                  const first = files[0];
                  const folder = first.webkitRelativePath?.split('/')[0];
                  setReportProofName(folder || (files.length > 1 ? `${files.length} files` : first.name));
                  e.target.value = '';
                }}
              />
              <p className="text-[10px] text-content-tertiary leading-relaxed">
                If you claim theft, attach your original project so we can compare. Reviews usually take up to 24 hours.
              </p>
            </div>

            <button
              type="button"
              disabled={reportBusy || !reportReason.trim()}
              onClick={submitReport}
              className="w-full rounded-full bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium py-2 disabled:opacity-40"
            >
              {reportBusy ? 'Sending…' : 'Send report'}
            </button>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={composer}
        onClose={() => { setComposer(false); }}
        title="New post"
        size="md"
      >
        <div className="h-full overflow-y-auto px-5 py-4 space-y-3.5">
          <div className="flex rounded-full bg-black/35 p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setIntent('help')}
              className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
                intent === 'help' ? 'bg-white/10 text-content-primary' : 'text-content-tertiary hover:text-content-secondary'
              }`}
            >
              Need help
            </button>
            <button
              type="button"
              onClick={() => { setIntent('share'); setPaying(false); }}
              className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
                intent === 'share' ? 'bg-white/10 text-content-primary' : 'text-content-tertiary hover:text-content-secondary'
              }`}
            >
              Sharing work
            </button>
          </div>

          <label className="block space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-content-tertiary">Title</span>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={intent === 'help' ? 'Coffee shop site' : 'My portfolio v1'}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary/70 focus:outline-none focus:border-sky-500/40"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-content-tertiary">Preview</span>
            <input
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="One line for the feed"
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary/70 focus:outline-none focus:border-sky-500/40"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-content-tertiary">Details</span>
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              spellCheck
              lang="en"
              placeholder="What you’re building, what you need, how it should look…"
              rows={3}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary/70 focus:outline-none focus:border-sky-500/40 resize-none leading-relaxed"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-content-tertiary">
              GitHub <span className="normal-case tracking-normal font-normal opacity-70">(optional)</span>
            </span>
            <input
              value={githubUrl}
              onChange={e => setGithubUrl(e.target.value)}
              placeholder="https://github.com/…"
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary/70 focus:outline-none focus:border-sky-500/40"
            />
          </label>

          {recent[0] && (
            <button
              type="button"
              className="text-[11px] text-sky-300/90 hover:text-sky-200"
              onClick={() => {
                setTitle(recent[0].name);
                setSummary(`Working on ${recent[0].name} in NOVA Code.`);
              }}
            >
              Fill from latest Code project · {recent[0].name}
            </button>
          )}

          {intent === 'help' && (
            <button
              type="button"
              onClick={() => setPaying(p => !p)}
              className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                paying
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-white/10 bg-black/25 hover:border-white/20'
              }`}
            >
              <span className="min-w-0">
                <span className="block text-sm text-content-primary">Willing to pay for help</span>
                <span className="block text-[11px] text-content-tertiary mt-0.5">Shows a $ badge. payments come later</span>
              </span>
              <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                paying ? 'bg-emerald-500 text-white' : 'border border-white/15 text-content-tertiary'
              }`}>
                <DollarSign className="w-3.5 h-3.5" strokeWidth={2.5} />
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setAllowDiscussionPost(v => !v)}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
              allowDiscussionPost
                ? 'border-sky-500/35 bg-sky-500/10'
                : 'border-white/10 bg-black/25 hover:border-white/20'
            }`}
          >
            <span className="min-w-0">
              <span className="block text-sm text-content-primary">Allow messages on this post</span>
              <span className="block text-[11px] text-content-tertiary mt-0.5">
                People can chat on the post without DMing you
              </span>
            </span>
            <span className={`text-[11px] shrink-0 ${allowDiscussionPost ? 'text-sky-300' : 'text-content-tertiary'}`}>
              {allowDiscussionPost ? 'On' : 'Off'}
            </span>
          </button>

          <div className="flex items-center gap-3 pt-0.5">
            <div className="flex rounded-full bg-black/35 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                  visibility === 'public' ? 'bg-white/10 text-content-primary' : 'text-content-tertiary'
                }`}
              >
                <Unlock className="w-3 h-3" /> Public
              </button>
              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                  visibility === 'private' ? 'bg-white/10 text-content-primary' : 'text-content-tertiary'
                }`}
              >
                <Lock className="w-3 h-3" /> Private
              </button>
            </div>
            <button
              type="button"
              aria-disabled={busy || !title.trim() || !myArkId}
              onClick={() => {
                if (busy) return;
                if (!myArkId) {
                  setNote('Sign in (or finish profile) so this post has an NOVA ID.');
                  return;
                }
                if (!title.trim()) {
                  setNote('Add a title before posting.');
                  return;
                }
                void postWork();
              }}
              className={`ml-auto rounded-full bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium px-5 py-1.5 transition-colors ${
                busy || !title.trim() || !myArkId ? 'opacity-40' : ''
              }`}
            >
              {busy ? 'Posting…' : 'Post'}
            </button>
          </div>

          {visibility === 'private' && (
            <div className="space-y-1.5 pt-1 border-t border-white/5">
              <p className="text-[11px] text-content-tertiary">Who can see this</p>
              {contacts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {contacts.map(c => {
                    const on = allowed.split(/[,\s]+/).map(normalizeArkId).includes(c.arkId);
                    return (
                      <button
                        key={c.arkId}
                        type="button"
                        onClick={() => {
                          const ids = allowed.split(/[,\s]+/).map(normalizeArkId).filter(isArkUserId);
                          const next = on ? ids.filter(id => id !== c.arkId) : [...ids, c.arkId];
                          setAllowed(next.join(', '));
                        }}
                        className={`rounded-full border px-2.5 py-1 text-[11px] ${
                          on ? 'border-sky-400/50 text-sky-200' : 'border-white/10 text-content-tertiary'
                        }`}
                      >
                        {c.displayName}
                      </button>
                    );
                  })}
                </div>
              )}
              <input
                value={allowed}
                onChange={e => setAllowed(e.target.value)}
                placeholder="Paste NOVA IDs"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary/70 focus:outline-none focus:border-sky-500/40"
              />
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
