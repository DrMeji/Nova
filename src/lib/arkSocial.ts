/**
 * NOVA social layer: contacts, Networking posts, and DMs.
 * Cloud (Supabase) when signed in; local cache so the UI still works offline / guest.
 */

import { supabase } from '@/lib/supabase';
import { formatArkId, isArkUserId, lookupArkUser, normalizeArkId } from '@/lib/arkUserId';

export type ArkContact = {
  arkId: string;
  displayName: string;
  addedAt: string;
  avatarUrl?: string;
};

export type NetworkPost = {
  id: string;
  ownerArkId: string;
  ownerName: string;
  title: string;
  summary: string;
  /** Longer description shown when the post is opened. */
  details?: string;
  /** Help wanted vs sharing finished work. */
  intent?: 'help' | 'share';
  /** Willing to pay for help. UI badge only until payments ship. */
  paying?: boolean;
  visibility: 'public' | 'private';
  githubUrl: string;
  allowedArkIds: string[];
  createdAt: string;
  /** Feed filters / card meta (demo + future posts). */
  projectType?: string;
  platform?: string;
  categoryLabel?: string;
  views?: number;
  replies?: number;
  saves?: number;
  /** Allow public chat on the post. */
  allowDiscussion?: boolean;
  /** Others must ask before viewing project code. */
  codeRequiresApproval?: boolean;
};

export type MessageAttachment = {
  name: string;
  sizeLabel: string;
  kind: 'file' | 'image' | 'folder';
};

export type DirectMessage = {
  id: string;
  senderArkId: string;
  recipientArkId: string;
  body: string;
  createdAt: string;
  attachment?: MessageAttachment;
};

const CONTACTS_KEY = 'NOVA:contacts';
const POSTS_KEY = 'NOVA:network-posts';
const DMS_KEY = 'NOVA:direct-messages';

export function canUseCloud(userId?: string | null) {
  return Boolean(userId && userId !== 'guest-local' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId));
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function loadLocalContacts(): ArkContact[] {
  const list = readJson<ArkContact[]>(CONTACTS_KEY, []);
  return Array.isArray(list) ? list.filter(c => isArkUserId(c.arkId)) : [];
}

function saveLocalContacts(list: ArkContact[]) {
  writeJson(CONTACTS_KEY, list);
}

export function loadLocalPosts(): NetworkPost[] {
  const list = readJson<NetworkPost[]>(POSTS_KEY, []);
  return Array.isArray(list) ? list : [];
}

function saveLocalPosts(list: NetworkPost[]) {
  writeJson(POSTS_KEY, list);
}

export function loadLocalMessages(): DirectMessage[] {
  const list = readJson<DirectMessage[]>(DMS_KEY, []);
  return Array.isArray(list) ? list : [];
}

function saveLocalMessages(list: DirectMessage[]) {
  writeJson(DMS_KEY, list);
}

export async function addContact(arkIdRaw: string, displayName?: string, avatarUrl?: string): Promise<ArkContact | null> {
  const arkId = normalizeArkId(arkIdRaw);
  if (!isArkUserId(arkId)) return null;
  if (loadLocalContacts().some(c => c.arkId === arkId)) {
    throw new Error('Already in contacts');
  }
  const looked = await lookupArkUser(arkId);
  const contact: ArkContact = {
    arkId,
    displayName: displayName?.trim() || looked?.displayName || arkId,
    addedAt: new Date().toISOString(),
    avatarUrl: avatarUrl || looked?.avatarUrl || undefined,
  };
  const next = [contact, ...loadLocalContacts().filter(c => c.arkId !== arkId)];
  saveLocalContacts(next);
  return contact;
}

export function removeContact(arkId: string) {
  const id = normalizeArkId(arkId);
  saveLocalContacts(loadLocalContacts().filter(c => normalizeArkId(c.arkId) !== id && formatArkId(c.arkId) !== formatArkId(id)));
}

/** Friendship required before DMs. Shown in Message when send is blocked. */
export const MSG_NEED_FRIEND =
  'You need to add this person, and they need to accept your friend request before you can send messages.';

export async function unfriendPeer(userId: string | null | undefined, peerArkIdRaw: string): Promise<void> {
  const peer = normalizeArkId(peerArkIdRaw);
  if (!isArkUserId(peer)) return;
  removeContact(peer);
  hideDemoContact(peer);
  if (!canUseCloud(userId)) return;
  try {
    const { error } = await supabase.rpc('unfriend_ark_peer', { p_peer_ark_id: formatArkId(peer) });
    if (error) {
      // Fallback: delete my cloud row only (peer may still see me until they refresh / RPC is applied).
      await supabase.from('ark_contacts').delete().eq('peer_ark_id', formatArkId(peer));
      await supabase.from('ark_contacts').delete().eq('peer_ark_id', peer);
    }
  } catch {
    try {
      await supabase.from('ark_contacts').delete().eq('peer_ark_id', formatArkId(peer));
    } catch {
      /* keep local removed */
    }
  }
}

export async function areMutualFriends(
  userId: string | null | undefined,
  peerArkIdRaw: string,
  localContacts: ArkContact[],
): Promise<boolean> {
  const peer = formatArkId(normalizeArkId(peerArkIdRaw));
  if (!isArkUserId(peer)) return false;
  const locally = localContacts.some(c => formatArkId(c.arkId) === peer);
  if (!locally) return false;
  if (!canUseCloud(userId)) return true;
  try {
    const { data, error } = await supabase.rpc('are_mutual_ark_friends', { p_peer_ark_id: peer });
    if (error) return locally;
    return Boolean(data);
  } catch {
    return locally;
  }
}

const BLOCKED_KEY = 'NOVA:blocked-ark-ids';
const HIDDEN_DEMOS_KEY = 'NOVA:hidden-demo-contacts';

export type BlockedUser = {
  arkId: string;
  displayName: string;
  blockedAt: string;
};

const BLOCKED_META_KEY = 'NOVA:blocked-meta';

function loadBlockedMeta(): Record<string, { displayName?: string; blockedAt?: string }> {
  const raw = readJson<Record<string, { displayName?: string; blockedAt?: string }>>(BLOCKED_META_KEY, {});
  return raw && typeof raw === 'object' ? raw : {};
}

function saveBlockedMeta(meta: Record<string, { displayName?: string; blockedAt?: string }>) {
  writeJson(BLOCKED_META_KEY, meta);
}

export function loadBlockedArkIds(): string[] {
  const list = readJson<string[]>(BLOCKED_KEY, []);
  return Array.isArray(list) ? list.filter(isArkUserId).map(formatArkId) : [];
}

export function loadBlockedUsers(): BlockedUser[] {
  const ids = loadBlockedArkIds();
  const meta = loadBlockedMeta();
  return ids.map(arkId => ({
    arkId,
    displayName: meta[arkId]?.displayName || arkId,
    blockedAt: meta[arkId]?.blockedAt || new Date(0).toISOString(),
  })).sort((a, b) => b.blockedAt.localeCompare(a.blockedAt));
}

export function isBlockedArkId(arkId: string): boolean {
  const id = formatArkId(normalizeArkId(arkId));
  return loadBlockedArkIds().some(x => formatArkId(x) === id);
}

export async function blockArkId(
  arkIdRaw: string,
  opts?: { userId?: string | null; displayName?: string },
): Promise<void> {
  const arkId = formatArkId(normalizeArkId(arkIdRaw));
  if (!isArkUserId(arkId)) return;
  const next = [...new Set([...loadBlockedArkIds(), arkId])];
  writeJson(BLOCKED_KEY, next);
  const meta = loadBlockedMeta();
  meta[arkId] = {
    displayName: opts?.displayName || meta[arkId]?.displayName || arkId,
    blockedAt: new Date().toISOString(),
  };
  saveBlockedMeta(meta);
  removeContact(arkId);
  hideDemoContact(arkId);
  if (!canUseCloud(opts?.userId)) return;
  try {
    const { error } = await supabase.rpc('block_ark_peer', { p_peer_ark_id: arkId });
    if (error) {
      await supabase.from('ark_blocks').upsert({
        owner_id: opts!.userId,
        blocked_ark_id: arkId,
      }, { onConflict: 'owner_id,blocked_ark_id' });
      await unfriendPeer(opts?.userId, arkId);
    }
  } catch {
    try {
      await unfriendPeer(opts?.userId, arkId);
    } catch {
      /* local block still set */
    }
  }
  try {
    window.dispatchEvent(new CustomEvent('NOVA:blocks-changed'));
  } catch {
    /* ignore */
  }
}

export async function unblockArkId(arkIdRaw: string, userId?: string | null): Promise<void> {
  const arkId = formatArkId(normalizeArkId(arkIdRaw));
  writeJson(BLOCKED_KEY, loadBlockedArkIds().filter(id => formatArkId(id) !== arkId));
  const meta = loadBlockedMeta();
  delete meta[arkId];
  saveBlockedMeta(meta);
  if (canUseCloud(userId)) {
    try {
      const { error } = await supabase.rpc('unblock_ark_peer', { p_peer_ark_id: arkId });
      if (error) {
        await supabase.from('ark_blocks').delete().eq('blocked_ark_id', arkId);
      }
    } catch {
      try {
        await supabase.from('ark_blocks').delete().eq('blocked_ark_id', arkId);
      } catch {
        /* keep local */
      }
    }
  }
  try {
    window.dispatchEvent(new CustomEvent('NOVA:blocks-changed'));
  } catch {
    /* ignore */
  }
}

export async function syncBlockedFromCloud(userId?: string | null): Promise<BlockedUser[]> {
  if (!canUseCloud(userId)) return loadBlockedUsers();
  try {
    const { data, error } = await supabase
      .from('ark_blocks')
      .select('blocked_ark_id, created_at')
      .order('created_at', { ascending: false });
    if (error || !data) return loadBlockedUsers();
    const ids = data.map(r => formatArkId(String(r.blocked_ark_id))).filter(isArkUserId);
    writeJson(BLOCKED_KEY, [...new Set(ids)]);
    const meta = loadBlockedMeta();
    for (const row of data) {
      const id = formatArkId(String(row.blocked_ark_id));
      if (!isArkUserId(id)) continue;
      meta[id] = {
        displayName: meta[id]?.displayName || id,
        blockedAt: String(row.created_at || new Date().toISOString()),
      };
    }
    saveBlockedMeta(meta);
    return loadBlockedUsers();
  } catch {
    return loadBlockedUsers();
  }
}

export async function isBlockedFromAdding(targetArkId: string, userId?: string | null): Promise<boolean> {
  if (!canUseCloud(userId)) return false;
  try {
    const { data, error } = await supabase.rpc('is_blocked_from_adding', {
      p_target_ark_id: formatArkId(normalizeArkId(targetArkId)),
    });
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

export function loadHiddenDemoContacts(): string[] {
  const list = readJson<string[]>(HIDDEN_DEMOS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function hideDemoContact(arkIdRaw: string) {
  const arkId = normalizeArkId(arkIdRaw);
  writeJson(HIDDEN_DEMOS_KEY, [...new Set([...loadHiddenDemoContacts(), arkId])]);
}

export async function listContacts(userId?: string | null): Promise<ArkContact[]> {
  const local = loadLocalContacts();
  if (!canUseCloud(userId)) return local;
  try {
    const { data, error } = await supabase
      .from('ark_contacts')
      .select('peer_ark_id, display_name, peer_avatar_url, created_at')
      .order('created_at', { ascending: false });
    if (error || !data) return local;
    const cloud: ArkContact[] = data.map(row => ({
      arkId: String(row.peer_ark_id),
      displayName: String(row.display_name || row.peer_ark_id),
      addedAt: String(row.created_at),
      avatarUrl: row.peer_avatar_url ? String(row.peer_avatar_url) : undefined,
    })).filter(c => isArkUserId(c.arkId));

    // Live profile overlay — Settings name/avatar changes must show for friends.
    const { lookupArkUser, ARK_DEV_ID, formatArkId, clearArkLookupCache } = await import('@/lib/arkUserId');
    clearArkLookupCache();
    const [devHit, ...lives] = await Promise.all([
      lookupArkUser('DEV'),
      ...cloud.map(c => lookupArkUser(c.arkId)),
    ]);
    const enriched = cloud.map((c, i) => {
      const live = lives[i];
      const isDevPeer = Boolean(
        devHit
        && (
          c.arkId === ARK_DEV_ID
          || c.arkId === devHit.arkId
          || (devHit.legacyArkId && c.arkId === devHit.legacyArkId)
          || formatArkId(c.arkId) === ARK_DEV_ID
        ),
      );
      if (isDevPeer) {
        const liveName = (live?.displayName || '').trim();
        const cached = (c.displayName || '').trim();
        const displayName =
          (liveName && liveName.toUpperCase() !== ARK_DEV_ID)
            ? liveName
            : (cached && cached.toUpperCase() !== ARK_DEV_ID && cached !== c.arkId)
              ? cached
              : 'NOVA user';
        return {
          ...c,
          arkId: ARK_DEV_ID,
          displayName,
          avatarUrl: live?.avatarUrl || devHit?.avatarUrl || c.avatarUrl,
        };
      }
      const displayName = (live?.displayName || c.displayName || c.arkId).trim();
      const avatarUrl = live?.avatarUrl || c.avatarUrl;
      return {
        ...c,
        arkId: formatArkId(c.arkId),
        displayName,
        avatarUrl: avatarUrl || undefined,
      };
    });

    // Persist fresher labels so the next open is instant.
    for (const c of enriched) {
      const prev = cloud.find(x => x.arkId === c.arkId);
      if (
        prev
        && (prev.displayName !== c.displayName || (prev.avatarUrl || '') !== (c.avatarUrl || ''))
      ) {
        void persistContact(userId, c);
      }
    }

    const blocked = new Set(loadBlockedArkIds().map(formatArkId));
    // Cloud is source of truth when signed in — local-only rows must not resurrect after unfriend.
    const byId = new Map<string, ArkContact>();
    enriched.forEach(c => {
      const id = formatArkId(c.arkId);
      if (blocked.has(id)) return;
      byId.set(id, { ...c, arkId: id });
    });
    const merged = [...byId.values()];
    saveLocalContacts(merged);
    return merged;
  } catch {
    return local;
  }
}

export async function persistContact(userId: string | null | undefined, contact: ArkContact) {
  if (!canUseCloud(userId)) return;
  try {
    await supabase.from('ark_contacts').upsert({
      owner_id: userId,
      peer_ark_id: contact.arkId,
      display_name: contact.displayName,
      peer_avatar_url: contact.avatarUrl || null,
    }, { onConflict: 'owner_id,peer_ark_id' });
  } catch {
    /* ignore */
  }
}

function mapPost(row: Record<string, unknown>): NetworkPost {
  const local = loadLocalPosts().find(p => p.id === String(row.id));
  return {
    id: String(row.id),
    ownerArkId: String(row.owner_ark_id || ''),
    ownerName: String(row.owner_name || ''),
    title: String(row.title || 'Untitled'),
    summary: String(row.summary || ''),
    details: local?.details || String(row.details || ''),
    intent: local?.intent || (row.intent === 'share' ? 'share' : 'help'),
    paying: Boolean(local?.paying ?? row.paying),
    visibility: row.visibility === 'private' ? 'private' : 'public',
    githubUrl: String(row.github_url || ''),
    allowedArkIds: Array.isArray(row.allowed_ark_ids) ? row.allowed_ark_ids.map(String) : [],
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export async function listNetworkPosts(opts: {
  userId?: string | null;
  myArkId?: string | null;
}): Promise<NetworkPost[]> {
  const local = loadLocalPosts();
  const mine = opts.myArkId || '';
  const visibleLocal = local.filter(p =>
    p.visibility === 'public'
    || p.ownerArkId === mine
    || p.allowedArkIds.includes(mine),
  );
  if (!canUseCloud(opts.userId)) return visibleLocal.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  try {
    const { data, error } = await supabase
      .from('ark_network_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(80);
    if (error || !data) return visibleLocal;
    const cloud = data.map(r => mapPost(r as Record<string, unknown>));
    const byId = new Map<string, NetworkPost>();
    [...cloud, ...visibleLocal].forEach(p => {
      if (!byId.has(p.id)) byId.set(p.id, p);
    });
    const merged = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    saveLocalPosts(merged);
    return merged;
  } catch {
    return visibleLocal.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export async function publishNetworkPost(opts: {
  userId?: string | null;
  ownerArkId: string;
  ownerName: string;
  title: string;
  summary: string;
  details?: string;
  intent?: 'help' | 'share';
  paying?: boolean;
  visibility: 'public' | 'private';
  githubUrl?: string;
  allowedArkIds?: string[];
  allowDiscussion?: boolean;
  codeRequiresApproval?: boolean;
}): Promise<NetworkPost> {
  const post: NetworkPost = {
    id: crypto.randomUUID(),
    ownerArkId: opts.ownerArkId,
    ownerName: opts.ownerName,
    title: opts.title.trim() || 'Untitled',
    summary: opts.summary.trim(),
    details: (opts.details || '').trim(),
    intent: opts.intent || 'help',
    paying: Boolean(opts.paying),
    visibility: opts.visibility,
    githubUrl: (opts.githubUrl || '').trim(),
    allowedArkIds: (opts.allowedArkIds || []).map(normalizeArkId).filter(isArkUserId),
    createdAt: new Date().toISOString(),
    allowDiscussion: opts.allowDiscussion !== false,
    codeRequiresApproval: opts.codeRequiresApproval !== false,
  };
  saveLocalPosts([post, ...loadLocalPosts().filter(p => p.id !== post.id)]);
  if (canUseCloud(opts.userId)) {
    try {
      const cloudSummary = [post.summary, post.details].filter(Boolean).join('\n\n');
      const { data, error } = await supabase.from('ark_network_posts').insert({
        id: post.id,
        owner_id: opts.userId,
        owner_ark_id: post.ownerArkId,
        owner_name: post.ownerName,
        title: post.title,
        summary: cloudSummary || post.summary,
        visibility: post.visibility,
        github_url: post.githubUrl || null,
        allowed_ark_ids: post.allowedArkIds,
      }).select('*').maybeSingle();
      if (!error && data) {
        const mapped = mapPost(data as Record<string, unknown>);
        return {
          ...mapped,
          details: post.details,
          intent: post.intent,
          paying: post.paying,
        };
      }
    } catch {
      /* keep local */
    }
  }
  return post;
}

export async function deleteNetworkPost(id: string, userId?: string | null): Promise<void> {
  saveLocalPosts(loadLocalPosts().filter(p => p.id !== id));
  if (canUseCloud(userId)) {
    try {
      await supabase.from('ark_network_posts').delete().eq('id', id);
    } catch {
      /* keep local */
    }
  }
}

export async function updateNetworkPost(
  id: string,
  patch: Partial<Pick<NetworkPost, 'title' | 'summary' | 'visibility' | 'allowedArkIds' | 'githubUrl'>>,
  userId?: string | null,
): Promise<void> {
  const next = loadLocalPosts().map(p => (p.id === id ? { ...p, ...patch } : p));
  saveLocalPosts(next);
  if (canUseCloud(userId)) {
    try {
      await supabase.from('ark_network_posts').update({
        title: patch.title,
        summary: patch.summary,
        visibility: patch.visibility,
        github_url: patch.githubUrl,
        allowed_ark_ids: patch.allowedArkIds,
      }).eq('id', id);
    } catch {
      /* keep local */
    }
  }
}

export async function listThread(myArkId: string, peerArkId: string, userId?: string | null): Promise<DirectMessage[]> {
  const local = loadLocalMessages().filter(m =>
    (m.senderArkId === myArkId && m.recipientArkId === peerArkId)
    || (m.senderArkId === peerArkId && m.recipientArkId === myArkId),
  );
  if (!canUseCloud(userId)) {
    return local.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  try {
    const { data, error } = await supabase
      .from('ark_direct_messages')
      .select('*')
      .or(`and(sender_ark_id.eq.${myArkId},recipient_ark_id.eq.${peerArkId}),and(sender_ark_id.eq.${peerArkId},recipient_ark_id.eq.${myArkId})`)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error || !data) return local.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const cloud: DirectMessage[] = data.map(row => ({
      id: String(row.id),
      senderArkId: String(row.sender_ark_id),
      recipientArkId: String(row.recipient_ark_id),
      body: String(row.body),
      createdAt: String(row.created_at),
    }));
    const byId = new Map<string, DirectMessage>();
    [...cloud, ...local].forEach(m => byId.set(m.id, m));
    const merged = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const rest = loadLocalMessages().filter(m =>
      !((m.senderArkId === myArkId && m.recipientArkId === peerArkId)
        || (m.senderArkId === peerArkId && m.recipientArkId === myArkId)),
    );
    saveLocalMessages([...rest, ...merged]);
    return merged;
  } catch {
    return local.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

export async function sendDirectMessage(opts: {
  userId?: string | null;
  senderArkId: string;
  recipientArkId: string;
  body: string;
  attachment?: MessageAttachment;
  /** When false, skip friendship check (internal / already verified). */
  allowWithoutFriendship?: boolean;
}): Promise<DirectMessage> {
  const peer = formatArkId(normalizeArkId(opts.recipientArkId));
  if (!opts.allowWithoutFriendship) {
    const friends = await areMutualFriends(opts.userId, peer, loadLocalContacts());
    if (!friends) {
      throw new Error(MSG_NEED_FRIEND);
    }
    if (isBlockedArkId(peer)) {
      throw new Error('You blocked this user. Unblock them in Settings → Privacy to message again.');
    }
  }
  const msg: DirectMessage = {
    id: crypto.randomUUID(),
    senderArkId: opts.senderArkId,
    recipientArkId: peer,
    body: opts.body.trim(),
    createdAt: new Date().toISOString(),
    attachment: opts.attachment,
  };
  // Attachments are device-local only until cloud upload exists — don't pretend the peer got them.
  if (canUseCloud(opts.userId) && opts.attachment) {
    throw new Error(
      'File attachments stay on this device for now. Send text to deliver over the network, or share the file another way.',
    );
  }
  saveLocalMessages([...loadLocalMessages(), msg]);
  if (canUseCloud(opts.userId)) {
    const { error } = await supabase.from('ark_direct_messages').insert({
      id: msg.id,
      sender_id: opts.userId,
      sender_ark_id: msg.senderArkId,
      recipient_ark_id: msg.recipientArkId,
      body: msg.body,
    });
    if (error) {
      // Roll back local so we do not leave an undelivered ghost in the thread.
      saveLocalMessages(loadLocalMessages().filter(m => m.id !== msg.id));
      throw new Error(
        error.message?.trim()
          || 'Couldn’t deliver that message to the server. Check your connection and that you’re still friends, then try again.',
      );
    }
  }
  return msg;
}

export function threadPreview(myArkId: string, peerArkId: string): DirectMessage | null {
  const msgs = loadLocalMessages().filter(m =>
    (m.senderArkId === myArkId && m.recipientArkId === peerArkId)
    || (m.senderArkId === peerArkId && m.recipientArkId === myArkId),
  );
  return msgs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
}

export function subscribeMessages(
  myArkId: string,
  onMessage: (msg: DirectMessage) => void,
  userId?: string | null,
) {
  if (!myArkId || !canUseCloud(userId)) return () => undefined;
  try {
  const channel = supabase
    .channel(`NOVA-dm-${myArkId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ark_direct_messages' },
      payload => {
        const row = payload.new as Record<string, unknown>;
        const msg: DirectMessage = {
          id: String(row.id),
          senderArkId: String(row.sender_ark_id),
          recipientArkId: String(row.recipient_ark_id),
          body: String(row.body),
          createdAt: String(row.created_at),
        };
        if (msg.senderArkId === myArkId || msg.recipientArkId === myArkId) {
          const existing = loadLocalMessages();
          if (!existing.some(m => m.id === msg.id)) saveLocalMessages([...existing, msg]);
          onMessage(msg);
        }
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
  } catch {
    return () => undefined;
  }
}

/** After guest signs in, upload local-only social data to Supabase. */
export async function mergeGuestSocialToCloud(userId: string): Promise<void> {
  if (!canUseCloud(userId)) return;
  const contacts = loadLocalContacts();
  for (const c of contacts) {
    try {
      await supabase.from('ark_contacts').upsert({
        owner_id: userId,
        peer_ark_id: c.arkId,
        display_name: c.displayName,
        peer_avatar_url: c.avatarUrl || null,
      }, { onConflict: 'owner_id,peer_ark_id' });
    } catch {
      /* keep going */
    }
  }
  const posts = loadLocalPosts();
  for (const p of posts) {
    try {
      await supabase.from('ark_network_posts').upsert({
        id: p.id,
        owner_id: userId,
        owner_ark_id: p.ownerArkId,
        owner_name: p.ownerName,
        title: p.title,
        summary: p.summary,
        visibility: p.visibility,
        github_url: p.githubUrl,
        allowed_ark_ids: p.allowedArkIds,
        created_at: p.createdAt,
      }, { onConflict: 'id' });
    } catch {
      /* keep going */
    }
  }
  const msgs = loadLocalMessages();
  for (const m of msgs) {
    try {
      await supabase.from('ark_direct_messages').upsert({
        id: m.id,
        sender_id: userId,
        sender_ark_id: m.senderArkId,
        recipient_ark_id: m.recipientArkId,
        body: m.body,
        created_at: m.createdAt,
      }, { onConflict: 'id' });
    } catch {
      /* keep going */
    }
  }
}
