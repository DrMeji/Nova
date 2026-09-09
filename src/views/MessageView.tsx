import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  Ban, Download, File, Folder, Image as ImageIcon, Loader2, PanelLeft,
  Plus, Send, Trash2, UserMinus, UserPlus, UsersRound,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import { useSocial } from '@/context/SocialContext';
import {
  areMutualFriends,
  isBlockedArkId,
  listThread,
  loadHiddenDemoContacts,
  MSG_NEED_FRIEND,
  sendDirectMessage,
  subscribeMessages,
  threadPreview,
  type ArkContact,
  type DirectMessage,
  type MessageAttachment,
} from '@/lib/arkSocial';
import { formatArkId, isArkUserId, normalizeArkId } from '@/lib/arkUserId';
import { isArkDevEmail, isDevArkAlias } from '@/lib/arkDevAccount';
import { SOCIAL_DEMO_ENABLED } from '@/lib/socialDemo';
import { GuestSocialBanner } from '@/components/GuestSocialBanner';
import { ConnectShell } from '@/components/ConnectShell';
import { Modal } from '@/components/Modal';
import {
  buildDemoContacts,
  buildDemoGroups,
  buildDemoThread,
  DEMO_UNREAD_ARK_IDS,
  type DemoGroup,
} from '@/lib/socialDemo';
import { getLocalPrefs } from '@/lib/localPrefs';
import { ArkAvatar } from '@/components/ArkAvatar';
import {
  demoPresenceFor,
  formatActivityAge,
  presenceDotClass,
  type PresenceStatus,
} from '@/lib/presenceStatus';

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Timestamp + unread dot with a fixed dot slot so times stay right-aligned. */
function RailActivityMeta({ age, unread }: { age: string; unread?: boolean }) {
  return (
    <span className="shrink-0 flex items-center gap-1 self-center">
      <span className="text-[10px] text-content-tertiary tabular-nums">{age}</span>
      <span className="h-2 w-2 shrink-0 flex items-center justify-center">
        {unread ? (
          <span className="h-2 w-2 rounded-full bg-sky-400" aria-label="Unread message" />
        ) : null}
      </span>
    </span>
  );
}

function attachmentIcon(kind: MessageAttachment['kind']) {
  if (kind === 'image') return ImageIcon;
  if (kind === 'folder') return Folder;
  return File;
}

function FileBubble({
  attachment,
  mine,
  onDownload,
}: {
  attachment: MessageAttachment;
  mine: boolean;
  onDownload?: () => void;
}) {
  const Icon = attachmentIcon(attachment.kind);
  return (
    <div
      className={`w-[min(100%,260px)] rounded-2xl border px-3.5 py-3 ${
        mine
          ? 'border-sky-400/30 bg-sky-600/90 text-white'
          : 'border-white/10 bg-surface-hover text-content-primary'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${
          mine ? 'bg-white/15' : 'bg-black/30 border border-white/10'
        }`}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{attachment.name}</p>
          <p className={`text-[11px] mt-0.5 ${mine ? 'text-white/70' : 'text-content-tertiary'}`}>
            {attachment.kind === 'folder' ? 'Folder' : attachment.kind === 'image' ? 'Image' : 'File'}
            {' · '}
            {attachment.sizeLabel}
            {' · '}
            this PC only
          </p>
          {!mine && (
            <button
              type="button"
              onClick={onDownload}
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-300 hover:text-sky-200"
            >
              <Download className="w-3 h-3" />
              Download
            </button>
          )}
          {mine && (
            <p className="mt-2 text-[10px] text-white/60">Sent</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function MessageView() {
  const { user, profile } = useAuth();
  const { route, navigate } = useRouter();
  const { contacts, inviteByArkId, refreshContacts, removeFriend, deleteContact, blockFriend, unreadFrom } = useSocial();
  const myArkId = isArkDevEmail(user?.email) ? 'DEV' : (profile?.ark_id || '');
  const peer = route.name === 'message' ? route.peer : undefined;
  const groupId = route.name === 'message' ? route.groupId : undefined;
  const [addId, setAddId] = useState('');
  const [draft, setDraft] = useState('');
  const [thread, setThread] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addOk, setAddOk] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [canChat, setCanChat] = useState(true);
  const [attachMenu, setAttachMenu] = useState(false);
  const [railCompact, setRailCompact] = useState(false);
  const [hiddenTick, setHiddenTick] = useState(0);
  const [groups, setGroups] = useState<DemoGroup[]>(() => buildDemoGroups(myArkId || '3218815'));
  const [createOpen, setCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [pickedMembers, setPickedMembers] = useState<string[]>([]);
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [addToGroupOpen, setAddToGroupOpen] = useState(false);
  const [clearedDemoUnread, setClearedDemoUnread] = useState<string[]>([]);
  const [listTick, setListTick] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const unreadPeers = useMemo(() => {
    const set = new Set(unreadFrom);
    for (const id of DEMO_UNREAD_ARK_IDS) {
      if (!clearedDemoUnread.includes(id)) set.add(id);
    }
    return set;
  }, [unreadFrom, clearedDemoUnread]);

  const people = useMemo(() => {
    const hidden = new Set(loadHiddenDemoContacts());
    const demos = buildDemoContacts().filter(c => !hidden.has(c.arkId) && !isBlockedArkId(c.arkId));
    const byId = new Map<string, ArkContact>();
    for (const c of demos) byId.set(c.arkId, c);
    for (const c of contacts) {
      if (!isBlockedArkId(c.arkId)) byId.set(c.arkId, c);
    }
    const me = myArkId || '3218815';
    const list = [...byId.values()];
    // Newest activity (message or just-added) at top; stale chats sink.
    const activityAt = (c: ArkContact) => {
      const last = threadPreview(me, c.arkId);
      const demoLast = last ? null : buildDemoThread(me, c.arkId).slice(-1)[0];
      const msgAt = (last || demoLast)?.createdAt || '';
      const addAt = c.addedAt || '';
      return msgAt > addAt ? msgAt : addAt;
    };
    return list.sort((a, b) => activityAt(b).localeCompare(activityAt(a)));
  }, [contacts, hiddenTick, myArkId, thread.length, listTick]);

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      const aAt = a.messages[a.messages.length - 1]?.createdAt || '';
      const bAt = b.messages[b.messages.length - 1]?.createdAt || '';
      return bAt.localeCompare(aAt);
    });
  }, [groups]);

  const activeGroup = groups.find(g => g.id === groupId) || null;
  const isDemoPeer = Boolean(peer && buildDemoContacts().some(c => c.arkId === peer));
  const isFriend = Boolean(peer && contacts.some(c => formatArkId(c.arkId) === formatArkId(peer)));
  const active = !groupId
    ? (people.find(c => c.arkId === peer)
      || (peer && !isBlockedArkId(peer) ? { arkId: peer, displayName: peer, addedAt: '' } : null))
    : null;

  useEffect(() => {
    setSendError(null);
    if (groupId || !peer) {
      setCanChat(true);
      return;
    }
    if (isDemoPeer) {
      setCanChat(true);
      return;
    }
    let cancelled = false;
    void areMutualFriends(user?.id, peer, contacts).then(ok => {
      if (!cancelled) {
        setCanChat(ok);
        if (!ok) setSendError(MSG_NEED_FRIEND);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [peer, groupId, contacts, user?.id, isDemoPeer]);

  useEffect(() => {
    const compact = () => setRailCompact(true);
    window.addEventListener('NOVA:compact-connect-rail', compact);
    return () => window.removeEventListener('NOVA:compact-connect-rail', compact);
  }, []);

  useEffect(() => {
    setAttachMenu(false);
    setGroupPanelOpen(false);
    setAddToGroupOpen(false);
    if (peer) {
      setClearedDemoUnread(prev => (prev.includes(peer) ? prev : [...prev, peer]));
    }
  }, [peer, groupId]);

  useEffect(() => {
    if (activeGroup) setEditGroupName(activeGroup.name);
  }, [activeGroup?.id, activeGroup?.name]);

  useEffect(() => {
    if (groupId) {
      const g = groups.find(x => x.id === groupId);
      if (!g) {
        setThread([]);
        return;
      }
      setThread(g.messages.map(m => ({
        id: m.id,
        senderArkId: m.senderArkId,
        recipientArkId: groupId,
        body: m.body,
        createdAt: m.createdAt,
        attachment: m.attachment,
      })));
      setLoading(false);
      return;
    }
    if (!peer) {
      setThread([]);
      return;
    }
    const demos = buildDemoThread(myArkId || '3218815', peer);
    setLoading(true);
    void listThread(myArkId || '3218815', peer, user?.id).then(list => {
      const real = list.filter(m => !String(m.id).startsWith('demo-dm-'));
      setThread([...demos, ...real]);
      setLoading(false);
    });
    if (!myArkId) return;
    const unsub = subscribeMessages(myArkId, msg => {
      if (
        (msg.senderArkId === myArkId && msg.recipientArkId === peer)
        || (msg.senderArkId === peer && msg.recipientArkId === myArkId)
      ) {
        setThread(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
      }
    }, user?.id);
    const poll = window.setInterval(() => {
      void listThread(myArkId, peer, user?.id).then(list => {
        const real = list.filter(m => !String(m.id).startsWith('demo-dm-'));
        setThread([...buildDemoThread(myArkId, peer), ...real]);
      });
    }, 4000);
    return () => {
      unsub();
      window.clearInterval(poll);
    };
  }, [myArkId, peer, groupId, user?.id, groups]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    const sender = myArkId || '3218815';

    if (groupId && activeGroup) {
      setDraft('');
      const msg = {
        id: crypto.randomUUID(),
        senderArkId: sender,
        body,
        createdAt: new Date().toISOString(),
      };
      setGroups(prev => prev.map(g => (
        g.id === groupId ? { ...g, messages: [...g.messages, msg] } : g
      )));
      return;
    }

    if (!peer) return;
    if (!isDemoPeer && !canChat) {
      setSendError(MSG_NEED_FRIEND);
      return;
    }
    setSendError(null);
    setDraft('');
    try {
      const msg = await sendDirectMessage({
        userId: user?.id,
        senderArkId: sender,
        recipientArkId: peer,
        body,
        allowWithoutFriendship: isDemoPeer,
      });
      setThread(prev => [...prev, msg]);
      setListTick(t => t + 1);
    } catch (err) {
      setDraft(body);
      const msg = err instanceof Error ? err.message : 'Could not send.';
      setSendError(msg);
      if (msg === MSG_NEED_FRIEND || /friend request|still friends|need to add/i.test(msg)) {
        setCanChat(false);
      }
    }
  };

  const sendAttachments = async (files: FileList | null, asFolder?: boolean) => {
    if (!files?.length) return;
    const sender = myArkId || '3218815';
    setAttachMenu(false);

    if (!groupId && peer && !isDemoPeer && !canChat) {
      setSendError(MSG_NEED_FRIEND);
      return;
    }

    const pushGroupAttachment = (attachment: MessageAttachment) => {
      if (!groupId) return;
      const msg = {
        id: crypto.randomUUID(),
        senderArkId: sender,
        body: '',
        createdAt: new Date().toISOString(),
        attachment,
      };
      setGroups(prev => prev.map(g => (
        g.id === groupId ? { ...g, messages: [...g.messages, msg] } : g
      )));
    };

    if (asFolder) {
      const total = [...files].reduce((n, f) => n + f.size, 0);
      const folderName = files[0].webkitRelativePath?.split('/')[0] || files[0].name || 'Folder';
      const attachment: MessageAttachment = {
        name: folderName,
        sizeLabel: `${files.length} file${files.length === 1 ? '' : 's'} · ${formatBytes(total)}`,
        kind: 'folder',
      };
      if (groupId) {
        pushGroupAttachment(attachment);
        return;
      }
      if (!peer) return;
      try {
        const msg = await sendDirectMessage({
          userId: user?.id,
          senderArkId: sender,
          recipientArkId: peer,
          body: '',
          attachment,
          allowWithoutFriendship: isDemoPeer,
        });
        setThread(prev => [...prev, msg]);
        setListTick(t => t + 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not send.';
        setSendError(msg);
        if (msg === MSG_NEED_FRIEND || /friend request|still friends|need to add/i.test(msg)) {
          setCanChat(false);
        }
      }
      return;
    }

    for (const file of [...files]) {
      const kind: MessageAttachment['kind'] = file.type.startsWith('image/') ? 'image' : 'file';
      const attachment: MessageAttachment = {
        name: file.name,
        sizeLabel: formatBytes(file.size),
        kind,
      };
      if (groupId) {
        pushGroupAttachment(attachment);
        continue;
      }
      if (!peer) return;
      try {
        const msg = await sendDirectMessage({
          userId: user?.id,
          senderArkId: sender,
          recipientArkId: peer,
          body: '',
          attachment,
          allowWithoutFriendship: isDemoPeer,
        });
        setThread(prev => [...prev, msg]);
        setListTick(t => t + 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not send.';
        setSendError(msg);
        if (msg === MSG_NEED_FRIEND || /friend request|still friends|need to add/i.test(msg)) {
          setCanChat(false);
        }
        break;
      }
    }
  };

  const add = async () => {
    const raw = addId.trim();
    const id = normalizeArkId(raw);
    setAddError(null);
    setAddOk(null);
    if (!isDevArkAlias(raw) && !isArkUserId(id)) {
      setAddError('Enter a 7-digit NOVA ID (or DEV)');
      return;
    }
    if (!isDevArkAlias(raw) && id === myArkId) {
      setAddError('That’s your own NOVA ID');
      return;
    }
    if (!isDevArkAlias(raw) && isBlockedArkId(id)) {
      setAddError('That user is blocked');
      return;
    }
    setAdding(true);
    try {
      await inviteByArkId(isDevArkAlias(raw) ? 'DEV' : id);
      setAddId('');
      setAddOk(`Friend request was sent to ${isDevArkAlias(raw) ? 'DEV' : id}`);
      // Request pending. do not open a chat or show their profile.
      await refreshContacts();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not send friend request');
    }
    setAdding(false);
  };

  const unaddActive = () => {
    if (!active) return;
    void removeFriend(active.arkId).then(() => {
      setHiddenTick(t => t + 1);
      setCanChat(false);
      setSendError(MSG_NEED_FRIEND);
      navigate({ name: 'message' });
    });
  };

  const deleteFromList = (arkId: string, e?: MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    void deleteContact(arkId).then(() => {
      setHiddenTick(t => t + 1);
      if (peer === arkId) navigate({ name: 'message' });
    });
  };

  const createGroup = () => {
    const name = groupName.trim() || 'New group';
    if (pickedMembers.length < 1) return;
    const me = myArkId || '3218815';
    const id = `group-${crypto.randomUUID().slice(0, 8)}`;
    const g: DemoGroup = {
      id,
      name,
      memberArkIds: [me, ...pickedMembers],
      messages: [{
        id: `gm-${Date.now()}`,
        senderArkId: me,
        body: `Created “${name}”`,
        createdAt: new Date().toISOString(),
      }],
    };
    setGroups(prev => [g, ...prev]);
    setCreateOpen(false);
    setGroupName('');
    setPickedMembers([]);
    navigate({ name: 'message', groupId: id });
  };

  const saveGroupName = () => {
    if (!groupId) return;
    const name = editGroupName.trim() || 'Group';
    setGroups(prev => prev.map(g => (g.id === groupId ? { ...g, name } : g)));
  };

  const kickFromGroup = (arkId: string) => {
    if (!groupId) return;
    const me = myArkId || '3218815';
    if (arkId === me || arkId === myArkId) return;
    setGroups(prev => prev.map(g => (
      g.id === groupId
        ? { ...g, memberArkIds: g.memberArkIds.filter(id => id !== arkId) }
        : g
    )));
  };

  const addMembersToGroup = (ids: string[]) => {
    if (!groupId || !ids.length) return;
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      const set = new Set(g.memberArkIds);
      ids.forEach(id => set.add(id));
      return { ...g, memberArkIds: [...set] };
    }));
    setAddToGroupOpen(false);
    setPickedMembers([]);
  };

  const deleteGroup = () => {
    if (!groupId) return;
    setGroups(prev => prev.filter(g => g.id !== groupId));
    setGroupPanelOpen(false);
    navigate({ name: 'message' });
  };

  const memberStatus = (arkId: string): PresenceStatus => {
    const me = myArkId || '3218815';
    if (arkId === me || arkId === myArkId) {
      return (getLocalPrefs().presenceStatus || 'online') as PresenceStatus;
    }
    return demoPresenceFor(arkId);
  };

  const memberName = (arkId: string) => {
    const me = myArkId || '3218815';
    if (arkId === me || arkId === myArkId) return 'You';
    return people.find(p => p.arkId === arkId)?.displayName || arkId;
  };

  const blockActive = () => {
    if (!active) return;
    void blockFriend(active.arkId, active.displayName).then(() => {
      setHiddenTick(t => t + 1);
      navigate({ name: 'message' });
    });
  };

  if (people.length === 0) {
    return (
      <div className="h-full box-border p-4 animate-fade-in bg-transparent">
        <div className="h-full flex flex-col rounded-2xl border border-surface-border bg-ark-navy-900 overflow-hidden">
          <div className="px-6 pt-5 max-w-md mx-auto w-full">
            <GuestSocialBanner feature="message" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-6 pb-5">
            <div className="w-full max-w-sm text-center space-y-6">
              <div className="mx-auto h-14 w-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <UserPlus className="w-6 h-6 text-content-secondary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-content-primary tracking-tight">Add a friend</h1>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-ark-navy-900/80 border border-white/10 p-1.5 pl-4">
                <input
                  value={addId}
                  onChange={e => setAddId(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void add(); }}
                  placeholder="NOVA ID"
                  className="flex-1 min-w-0 bg-transparent text-sm font-mono text-content-primary placeholder:text-content-tertiary outline-none"
                />
                <button
                  type="button"
                  onClick={() => void add()}
                  disabled={adding}
                  className="shrink-0 rounded-full bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium px-4 py-2 disabled:opacity-40"
                >
                  {adding ? '…' : 'Add'}
                </button>
              </div>
              {addError && <p className="text-xs text-rose-300">{addError}</p>}
              {addOk && <p className="text-xs text-emerald-300">{addOk}</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <ConnectShell
      railVisible
      railCompact={railCompact}
      railWidthClass={railCompact ? undefined : 'w-[19rem]'}
      rail={(
        <>
          <div className={`shrink-0 ${railCompact ? 'px-1.5 pt-4 pb-2' : 'px-2.5 pt-4 pb-2'} space-y-2`}>
            {!railCompact && <GuestSocialBanner feature="message" />}
            <div className={`flex items-center gap-1 ${railCompact ? 'flex-col' : ''}`}>
              {!railCompact && (
                <div className="flex-1 min-w-0 flex items-center gap-1 rounded-full bg-ark-navy-950/60 border border-white/10 p-1 pl-2.5">
                  <input
                    value={addId}
                    onChange={e => setAddId(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void add(); }}
                    placeholder="Add NOVA ID"
                    inputMode="numeric"
                    className="flex-1 min-w-0 bg-transparent text-xs font-mono text-content-primary placeholder:text-content-tertiary outline-none py-1"
                  />
                  <button
                    type="button"
                    onClick={() => void add()}
                    disabled={adding}
                    className="shrink-0 rounded-full bg-surface-hover hover:bg-white/10 text-[11px] text-content-primary px-2.5 py-1 disabled:opacity-40"
                  >
                    {adding ? '…' : 'Add'}
                  </button>
                </div>
              )}
              {railCompact && (
                <button
                  type="button"
                  onClick={() => setRailCompact(false)}
                  title="Add NOVA ID"
                  aria-label="Add NOVA ID"
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                title="New group"
                aria-label="New group"
                className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
              >
                <UsersRound className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setRailCompact(v => !v)}
                className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
                title={railCompact ? 'Expand people' : 'Collapse to icons'}
                aria-label={railCompact ? 'Expand people' : 'Collapse to icons'}
              >
                <PanelLeft className={`w-4 h-4 transition-transform ${railCompact ? 'rotate-180' : ''}`} />
              </button>
            </div>
            {addError && !railCompact && <p className="px-1 text-[10px] text-rose-300">{addError}</p>}
            {addOk && !railCompact && <p className="px-1 text-[10px] text-emerald-300">{addOk}</p>}
          </div>
          <div className={`flex-1 overflow-y-auto pb-3 ${railCompact ? 'px-1.5 pt-4 space-y-1' : 'px-2 pt-5 space-y-1'}`}>
            {sortedGroups.map(g => {
              const last = g.messages[g.messages.length - 1];
              const age = formatActivityAge(last?.createdAt);
              if (railCompact) {
                return (
                  <button
                    key={g.id}
                    type="button"
                    title={g.name}
                    onClick={() => navigate({ name: 'message', groupId: g.id })}
                    className={`w-full flex items-center justify-center rounded-xl py-2 ${
                      groupId === g.id ? 'bg-surface-hover' : 'hover:bg-surface-hover/60'
                    }`}
                  >
                    <span className="h-9 w-9 rounded-full bg-sky-500/15 border border-sky-400/20 flex items-center justify-center text-sky-200">
                      <UsersRound className="w-4 h-4" />
                    </span>
                  </button>
                );
              }
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => navigate({ name: 'message', groupId: g.id })}
                  className={`w-full flex items-center gap-2.5 text-left rounded-xl px-2.5 py-2.5 ${
                    groupId === g.id ? 'bg-surface-hover' : 'hover:bg-surface-hover/60'
                  }`}
                >
                  <span className="h-9 w-9 shrink-0 rounded-full bg-sky-500/15 border border-sky-400/20 flex items-center justify-center text-sky-200">
                    <UsersRound className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-content-primary truncate">{g.name}</span>
                    <span className="block text-[10px] text-content-tertiary truncate mt-0.5">
                      {g.memberArkIds.length} people
                    </span>
                  </span>
                  {age && <RailActivityMeta age={age} />}
                </button>
              );
            })}
            {people.map(c => {
              const last = myArkId ? threadPreview(myArkId, c.arkId) : null;
              const demoLast = !last ? buildDemoThread(myArkId || '3218815', c.arkId).slice(-1)[0] : null;
              const preview = last || demoLast;
              const age = formatActivityAge(preview?.createdAt || c.addedAt);
              const hasUnread = unreadPeers.has(c.arkId) && peer !== c.arkId;
              const status = demoPresenceFor(c.arkId);
              if (railCompact) {
                return (
                  <div key={c.arkId} className="group relative w-full flex items-center justify-center">
                    <button
                      type="button"
                      title={c.displayName}
                      onClick={() => navigate({ name: 'message', peer: c.arkId })}
                      className={`w-full flex items-center justify-center rounded-xl py-2 ${
                        !groupId && peer === c.arkId ? 'bg-surface-hover' : 'hover:bg-surface-hover/60'
                      }`}
                    >
                      <span className="relative">
                        <ArkAvatar name={c.displayName} src={c.avatarUrl} size="md" />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-ark-navy-950 ${presenceDotClass(status)}`}
                          aria-hidden
                        />
                        {hasUnread && (
                          <span className="absolute -top-0.5 -left-0.5 h-2 w-2 rounded-full bg-sky-400 border border-ark-navy-950" aria-label="Unread" />
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      title="Delete contact"
                      aria-label={`Delete ${c.displayName}`}
                      onClick={e => deleteFromList(c.arkId, e)}
                      className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-ark-navy-900 border border-white/15 text-content-tertiary hover:text-rose-300 hover:border-rose-400/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              }
              return (
                <div
                  key={c.arkId}
                  className={`group relative w-full rounded-xl pr-9 ${
                    !groupId && peer === c.arkId ? 'bg-surface-hover' : 'hover:bg-surface-hover/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'message', peer: c.arkId })}
                    className="w-full min-w-0 flex items-center gap-2.5 text-left rounded-xl px-2.5 py-2.5"
                  >
                    <span className="relative shrink-0">
                      <ArkAvatar name={c.displayName} src={c.avatarUrl} size="md" />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-ark-navy-950 ${presenceDotClass(status)}`}
                        title={status}
                        aria-hidden
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-content-primary truncate">{c.displayName}</span>
                      <span className="block text-[10px] font-mono text-content-tertiary tracking-wider mt-0.5">
                        {formatArkId(c.arkId)}
                      </span>
                    </span>
                    {age && <RailActivityMeta age={age} unread={hasUnread} />}
                  </button>
                  <button
                    type="button"
                    title="Delete contact"
                    aria-label={`Delete ${c.displayName}`}
                    onClick={e => deleteFromList(c.arkId, e)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-7 w-7 rounded-full flex items-center justify-center text-content-tertiary hover:text-rose-300 hover:bg-rose-500/15 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    >
      {!active && !activeGroup ? (
        <div className="flex-1 flex items-center justify-center text-sm text-content-tertiary px-6 text-center">
          Choose someone on the left to start chatting.
        </div>
      ) : activeGroup ? (
        <>
          <div className="shrink-0 px-5 pt-3 pb-3 flex items-center justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-ark-navy-950/80 pl-3 pr-1.5 py-1 shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setEditGroupName(activeGroup.name);
                  setGroupPanelOpen(true);
                }}
                className="inline-flex items-center gap-1.5 min-w-0 hover:opacity-90"
              >
                <UsersRound className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                <p className="text-sm font-medium text-content-primary truncate max-w-[10rem]">{activeGroup.name}</p>
                <span className="text-[10px] text-content-tertiary shrink-0">{activeGroup.memberArkIds.length}</span>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pt-6 pb-4 space-y-2.5">
            {thread.map(m => {
              const mine = m.senderArkId === (myArkId || '3218815') || m.senderArkId === myArkId;
              const who = people.find(p => p.arkId === m.senderArkId)?.displayName
                || (m.senderArkId === (myArkId || '3218815') ? 'You' : m.senderArkId);
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  {m.attachment ? (
                    <div className="space-y-1">
                      {!mine && <p className="text-[10px] text-content-tertiary px-1">{who}</p>}
                      <FileBubble
                        attachment={m.attachment}
                        mine={mine}
                        onDownload={() => { /* Preview only */ }}
                      />
                    </div>
                  ) : (
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      mine ? 'bg-sky-600 text-white' : 'bg-surface-hover text-content-primary'
                    }`}>
                      {!mine && <p className="text-[10px] opacity-70 mb-0.5">{who}</p>}
                      <p>{m.body}</p>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <div className="shrink-0 px-4 pb-4 pt-2">
            <div className="relative mx-auto w-full max-w-md">
              {attachMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-44 rounded-xl border border-white/10 bg-ark-navy-900 shadow-xl overflow-hidden z-10">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs text-content-secondary hover:bg-surface-hover hover:text-content-primary"
                    onClick={() => fileRef.current?.click()}
                  >
                    Image or file
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs text-content-secondary hover:bg-surface-hover hover:text-content-primary"
                    onClick={() => {
                      const el = folderRef.current;
                      if (el) el.setAttribute('webkitdirectory', '');
                      el?.click();
                    }}
                  >
                    Folder
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1 rounded-full bg-ark-navy-950/80 border border-white/10 pl-1.5 pr-1.5 py-1">
                <button
                  type="button"
                  onClick={() => setAttachMenu(v => !v)}
                  className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-white/5"
                  aria-label="Attach"
                  title="Upload image, file, or folder"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  spellCheck
                  lang="en"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Message group…"
                  className="flex-1 min-w-0 bg-transparent text-sm text-content-primary placeholder:text-content-tertiary outline-none py-1.5"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!draft.trim()}
                  className="h-8 w-8 shrink-0 rounded-full bg-sky-600 text-white flex items-center justify-center disabled:opacity-35"
                  aria-label="Send"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => {
                  void sendAttachments(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={folderRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => {
                  void sendAttachments(e.target.files, true);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="shrink-0 px-5 pt-3 pb-3 flex items-center justify-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-ark-navy-950/80 pl-4 pr-1.5 py-1 shadow-sm">
              <p className="text-sm font-medium text-content-primary truncate max-w-[11rem]">{active!.displayName}</p>
              <button type="button" onClick={unaddActive} title="Unadd" aria-label="Unadd" className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-white/5">
                <UserMinus className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={blockActive} title="Block" aria-label="Block" className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-rose-300/90 hover:text-rose-200 hover:bg-rose-500/15">
                <Ban className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pt-6 pb-4 space-y-2.5">
            {loading && <Loader2 className="w-4 h-4 animate-spin text-content-tertiary mx-auto" />}
            {thread.map(m => {
              const mine = m.senderArkId === (myArkId || '3218815') || m.senderArkId === myArkId;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  {m.attachment ? (
                    <FileBubble
                      attachment={m.attachment}
                      mine={mine}
                      onDownload={() => {
                        /* Preview only */
                      }}
                    />
                  ) : (
                    <p className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      mine
                        ? 'bg-sky-600 text-white'
                        : 'bg-surface-hover text-content-primary'
                    }`}>
                      {m.body}
                    </p>
                  )}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <div className="shrink-0 px-4 pb-4 pt-2">
            {sendError && !groupId ? (
              <p className="mx-auto w-full max-w-md mb-2 text-[11px] text-amber-200/95 leading-relaxed text-center px-1">
                {sendError}
              </p>
            ) : null}
            {!canChat && !groupId && !isFriend && peer ? (
              <div className="mx-auto w-full max-w-md mb-2 flex justify-center">
                <button
                  type="button"
                  disabled={adding}
                  onClick={() => {
                    setAddId(peer);
                    void (async () => {
                      setAdding(true);
                      setAddError(null);
                      try {
                        await inviteByArkId(peer);
                        setAddOk(`Friend request was sent to ${formatArkId(peer)}`);
                        setSendError('Friend request sent. They need to accept before you can message.');
                      } catch (err) {
                        setSendError(err instanceof Error ? err.message : 'Could not send friend request');
                      }
                      setAdding(false);
                    })();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/20 border border-sky-500/35 px-3 py-1.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
                >
                  <UserPlus className="w-3 h-3" />
                  {adding ? 'Sending…' : 'Send friend request'}
                </button>
              </div>
            ) : null}
            <div className="relative mx-auto w-full max-w-md">
              {attachMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-44 rounded-xl border border-white/10 bg-ark-navy-900 shadow-xl overflow-hidden z-10">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs text-content-secondary hover:bg-surface-hover hover:text-content-primary"
                    onClick={() => fileRef.current?.click()}
                  >
                    Image or file
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs text-content-secondary hover:bg-surface-hover hover:text-content-primary"
                    onClick={() => {
                      const el = folderRef.current;
                      if (el) el.setAttribute('webkitdirectory', '');
                      el?.click();
                    }}
                  >
                    Folder
                  </button>
                </div>
              )}
              <div className={`flex items-center gap-1 rounded-full bg-ark-navy-950/80 border border-white/10 pl-1.5 pr-1.5 py-1 ${!canChat && !groupId ? 'opacity-60' : ''}`}>
                <button
                  type="button"
                  onClick={() => setAttachMenu(v => !v)}
                  disabled={!canChat && !groupId}
                  className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-white/5 disabled:opacity-40"
                  aria-label="Attach"
                  title="Upload image, file, or folder"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  spellCheck
                  lang="en"
                  disabled={!canChat && !groupId}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={!canChat && !groupId ? 'Add friend to message…' : 'Message…'}
                  className="flex-1 min-w-0 bg-transparent text-sm text-content-primary placeholder:text-content-tertiary outline-none py-1.5 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!draft.trim() || (!canChat && !groupId)}
                  className="h-8 w-8 shrink-0 rounded-full bg-sky-600 text-white flex items-center justify-center disabled:opacity-35"
                  aria-label="Send"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => {
                  void sendAttachments(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={folderRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => {
                  void sendAttachments(e.target.files, true);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        </>
      )}
    </ConnectShell>

    <Modal
      isOpen={createOpen}
      onClose={() => setCreateOpen(false)}
      title="New group"
      size="sm"
    >
      <div className="px-5 py-4 space-y-3">
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-content-tertiary">Group name</span>
          <input
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            placeholder="Weekend plans"
            className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-content-primary outline-none focus:border-sky-500/40"
          />
        </label>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-wider text-content-tertiary">Members</p>
          {people.map(c => {
            const on = pickedMembers.includes(c.arkId);
            return (
              <button
                key={c.arkId}
                type="button"
                onClick={() => setPickedMembers(prev => (
                  on ? prev.filter(id => id !== c.arkId) : [...prev, c.arkId]
                ))}
                className={`w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm ${
                  on ? 'bg-sky-500/15 text-sky-100' : 'hover:bg-surface-hover text-content-secondary'
                }`}
              >
                <ArkAvatar name={c.displayName} src={c.avatarUrl} size="sm" />
                {c.displayName}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={pickedMembers.length < 1}
          onClick={createGroup}
          className="w-full rounded-full bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium py-2 disabled:opacity-40"
        >
          Create group
        </button>
      </div>
    </Modal>

    <Modal
      isOpen={groupPanelOpen && Boolean(activeGroup)}
      onClose={() => setGroupPanelOpen(false)}
      title="Group"
      size="sm"
    >
      {activeGroup && (
        <div className="px-5 py-4 space-y-4">
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-content-tertiary">Name</span>
            <div className="flex gap-2">
              <input
                value={editGroupName}
                onChange={e => setEditGroupName(e.target.value)}
                className="flex-1 min-w-0 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-content-primary outline-none focus:border-sky-500/40"
              />
              <button
                type="button"
                onClick={saveGroupName}
                className="shrink-0 rounded-full bg-sky-500 hover:bg-sky-400 text-white text-xs font-medium px-3"
              >
                Save
              </button>
            </div>
          </label>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wider text-content-tertiary">
                Members · {activeGroup.memberArkIds.length}
              </p>
              <button
                type="button"
                onClick={() => {
                  setPickedMembers([]);
                  setAddToGroupOpen(true);
                }}
                className="inline-flex items-center gap-1 text-[11px] text-sky-300 hover:text-sky-200"
              >
                <UserPlus className="w-3 h-3" />
                Add
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1">
              {activeGroup.memberArkIds.map(id => {
                const me = myArkId || '3218815';
                const isMe = id === me || id === myArkId;
                const status = memberStatus(id);
                return (
                  <div
                    key={id}
                    className="group flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-white/[0.04]"
                  >
                    <span className="relative shrink-0">
                      <ArkAvatar
                        name={memberName(id)}
                        src={
                          isMe
                            ? getLocalPrefs().avatarDataUrl
                            : contacts.find(c => c.arkId === id)?.avatarUrl
                        }
                        size="md"
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-ark-navy-900 ${presenceDotClass(status)}`}
                        aria-hidden
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-content-primary truncate">{memberName(id)}</span>
                      <span className="block text-[10px] font-mono text-content-tertiary tracking-wider mt-0.5">
                        {formatArkId(id)}
                      </span>
                    </span>
                    {!isMe && (
                      <button
                        type="button"
                        onClick={() => kickFromGroup(id)}
                        title="Kick from group"
                        aria-label="Kick from group"
                        className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-content-tertiary hover:text-rose-300 hover:bg-rose-500/15 opacity-70 group-hover:opacity-100"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={deleteGroup}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-full border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-sm py-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete group
          </button>
        </div>
      )}
    </Modal>

    <Modal
      isOpen={addToGroupOpen && Boolean(activeGroup)}
      onClose={() => setAddToGroupOpen(false)}
      title="Add people"
      size="sm"
    >
      {activeGroup && (
        <div className="px-5 py-4 space-y-3">
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {people
              .filter(c => !activeGroup.memberArkIds.includes(c.arkId))
              .map(c => {
                const on = pickedMembers.includes(c.arkId);
                return (
                  <button
                    key={c.arkId}
                    type="button"
                    onClick={() => setPickedMembers(prev => (
                      on ? prev.filter(id => id !== c.arkId) : [...prev, c.arkId]
                    ))}
                    className={`w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm ${
                      on ? 'bg-sky-500/15 text-sky-100' : 'hover:bg-surface-hover text-content-secondary'
                    }`}
                  >
                    <span className="relative shrink-0">
                      <ArkAvatar name={c.displayName} src={c.avatarUrl} size="sm" />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-ark-navy-900 ${presenceDotClass(demoPresenceFor(c.arkId))}`}
                        aria-hidden
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{c.displayName}</span>
                      <span className="block text-[10px] font-mono text-content-tertiary">{formatArkId(c.arkId)}</span>
                    </span>
                  </button>
                );
              })}
            {people.every(c => activeGroup.memberArkIds.includes(c.arkId)) && (
              <p className="text-xs text-content-tertiary py-4 text-center">Everyone you know is already in this group.</p>
            )}
          </div>
          <button
            type="button"
            disabled={pickedMembers.length < 1}
            onClick={() => addMembersToGroup(pickedMembers)}
            className="w-full rounded-full bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium py-2 disabled:opacity-40"
          >
            Add to group
          </button>
        </div>
      )}
    </Modal>
    </>
  );
}
