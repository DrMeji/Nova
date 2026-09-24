/**
 * NOVA social layer: contacts, Networking posts, and DMs.
 * Cloud (Supabase) when signed in; local cache so the UI still works offline / guest.
 */

import { supabase } from '@/lib/supabase';
import { formatNovaId, isNovaUserId, lookupNovaUser, normalizeNovaId } from '@/lib/novaUserId';

export type NovaContact = {
  novaId: string;
  displayName: string;
  addedAt: string;
  avatarUrl?: string;
};

export type NetworkPost = {
  id: string;
  ownerNovaId: string;
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
  allowedNovaIds: string[];
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
  senderNovaId: string;
  recipientNovaId: string;
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

export function loadLocalContacts(): NovaContact[] {
  const list = readJson<NovaContact[]>(CONTACTS_KEY, []);
  return Array.isArray(list) ? list.filter(c => isNovaUserId(c.novaId)) : [];
}

function saveLocalContacts(list: NovaContact[]) {
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

export async function addContact(novaIdRaw: string, displayName?: string, avatarUrl?: string): Promise<NovaContact | null> {
  const novaId = normalizeNovaId(novaIdRaw);
  if (!isNovaUserId(novaId)) return null;
  if (loadLocalContacts().some(c => c.novaId === novaId)) {
    throw new Error('Already in contacts');
  }
  const looked = await lookupNovaUser(novaId);
  const contact: NovaContact = {
    novaId,
    displayName: displayName?.trim() || looked?.displayName || novaId,
    addedAt: new Date().toISOString(),
    avatarUrl: avatarUrl || looked?.avatarUrl || undefined,
  };
  const next = [contact, ...loadLocalContacts().filter(c => c.novaId !== novaId)];
  saveLocalContacts(next);
  return contact;
}

export function removeContact(novaId: string) {
  const id = normalizeNovaId(novaId);
  saveLocalContacts(loadLocalContacts().filter(c => normalizeNovaId(c.novaId) !== id && formatNovaId(c.novaId) !== formatNovaId(id)));
}

/** Friendship required before DMs. Shown in Message when send is blocked. */
export const MSG_NEED_FRIEND =
  'You need to add this person, and they need to accept your friend request before you can send messages.';

export async function unfriendPeer(userId: string | null | undefined, peerNovaIdRaw: string): Promise<void> {
  const peer = normalizeNovaId(peerNovaIdRaw);
  if (!isNovaUserId(peer)) return;
  removeContact(peer);
  hideDemoContact(peer);
  if (!canUseCloud(userId)) return;
  try {
    const { error } = await supabase.rpc('unfriend_nova_peer', { p_peer_nova_id: formatNovaId(peer) });
    if (error) {
      // Fallback: delete my cloud row only (peer may still see me until they refresh / RPC is applied).
      await supabase.from('nova_contacts').delete().eq('peer_nova_id', formatNovaId(peer));
      await supabase.from('nova_contacts').delete().eq('peer_nova_id', peer);
    }
  } catch {
    try {
      await supabase.from('nova_contacts').delete().eq('peer_nova_id', formatNovaId(peer));
    } catch {
      /* keep local removed */
    }
  }
}

export async function areMutualFriends(
  userId: string | null | undefined,
  peerNovaIdRaw: string,
  localContacts: NovaContact[],
): Promise<boolean> {
  const peer = formatNovaId(normalizeNovaId(peerNovaIdRaw));
  if (!isNovaUserId(peer)) return false;
  const locally = localContacts.some(c => formatNovaId(c.novaId) === peer);
  if (!locally) return false;
  if (!canUseCloud(userId)) return true;
  try {
    const { data, error } = await supabase.rpc('are_mutual_nova_friends', { p_peer_nova_id: peer });
    if (error) return locally;
    return Boolean(data);
  } catch {
    return locally;
  }
}

const BLOCKED_KEY = 'NOVA:blocked-ark-ids';
const HIDDEN_DEMOS_KEY = 'NOVA:hidden-demo-contacts';

export type BlockedUser = {
  novaId: string;
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

export function loadBlockedNovaIds(): string[] {
  const list = readJson<string[]>(BLOCKED_KEY, []);
  return Array.isArray(list) ? list.filter(isNovaUserId).map(formatNovaId) : [];
}

export function loadBlockedUsers(): BlockedUser[] {
  const ids = loadBlockedNovaIds();
  const meta = loadBlockedMeta();
  return ids.map(novaId => ({
    novaId,
    displayName: meta[novaId]?.displayName || novaId,
    blockedAt: meta[novaId]?.blockedAt || new Date(0).toISOString(),
  })).sort((a, b) => b.blockedAt.localeCompare(a.blockedAt));
}

export function isBlockedNovaId(novaId: string): boolean {
  const id = formatNovaId(normalizeNovaId(novaId));
  return loadBlockedNovaIds().some(x => formatNovaId(x) === id);
}

export async function blockNovaId(
  novaIdRaw: string,
  opts?: { userId?: string | null; displayName?: string },
): Promise<void> {
  const novaId = formatNovaId(normalizeNovaId(novaIdRaw));
  if (!isNovaUserId(novaId)) return;
  const next = [...new Set([...loadBlockedNovaIds(), novaId])];
  writeJson(BLOCKED_KEY, next);
  const meta = loadBlockedMeta();
  meta[novaId] = {
    displayName: opts?.displayName || meta[novaId]?.displayName || novaId,
    blockedAt: new Date().toISOString(),
  };
  saveBlockedMeta(meta);
  removeContact(novaId);
  hideDemoContact(novaId);
  if (!canUseCloud(opts?.userId)) return;
  try {
    const { error } = await supabase.rpc('block_nova_peer', { p_peer_nova_id: novaId });
    if (error) {
      await supabase.from('nova_blocks').upsert({
        owner_id: opts!.userId,
        blocked_nova_id: novaId,
      }, { onConflict: 'owner_id,blocked_nova_id' });
      await unfriendPeer(opts?.userId, novaId);
    }
  } catch {
    try {
      await unfriendPeer(opts?.userId, novaId);
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

export async function unblockNovaId(novaIdRaw: string, userId?: string | null): Promise<void> {
  const novaId = formatNovaId(normalizeNovaId(novaIdRaw));
  writeJson(BLOCKED_KEY, loadBlockedNovaIds().filter(id => formatNovaId(id) !== novaId));
  const meta = loadBlockedMeta();
  delete meta[novaId];
  saveBlockedMeta(meta);
  if (canUseCloud(userId)) {
    try {
      const { error } = await supabase.rpc('unblock_nova_peer', { p_peer_nova_id: novaId });
      if (error) {
        await supabase.from('nova_blocks').delete().eq('blocked_nova_id', novaId);
      }
    } catch {
      try {
        await supabase.from('nova_blocks').delete().eq('blocked_nova_id', novaId);
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
      .from('nova_blocks')
      .select('blocked_nova_id, created_at')
      .order('created_at', { ascending: false });
    if (error || !data) return loadBlockedUsers();
    const ids = data.map(r => formatNovaId(String(r.blocked_nova_id))).filter(isNovaUserId);
    writeJson(BLOCKED_KEY, [...new Set(ids)]);
    const meta = loadBlockedMeta();
    for (const row of data) {
      const id = formatNovaId(String(row.blocked_nova_id));
      if (!isNovaUserId(id)) continue;
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

export async function isBlockedFromAdding(targetNovaId: string, userId?: string | null): Promise<boolean> {
  if (!canUseCloud(userId)) return false;
  try {
    const { data, error } = await supabase.rpc('is_blocked_from_adding', {
      p_target_nova_id: formatNovaId(normalizeNovaId(targetNovaId)),
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

export function hideDemoContact(novaIdRaw: string) {
  const novaId = normalizeNovaId(novaIdRaw);
  writeJson(HIDDEN_DEMOS_KEY, [...new Set([...loadHiddenDemoContacts(), novaId])]);
}

export async function listContacts(userId?: string | null): Promise<NovaContact[]> {
  const local = loadLocalContacts();
  if (!canUseCloud(userId)) return local;
  try {
    const { data, error } = await supabase
      .from('nova_contacts')
      .select('peer_nova_id, display_name, peer_avatar_url, created_at')
      .order('created_at', { ascending: false });
    if (error || !data) return local;
    const cloud: NovaContact[] = data.map(row => ({
      novaId: String(row.peer_nova_id),
      displayName: String(row.display_name || row.peer_nova_id),
      addedAt: String(row.created_at),
      avatarUrl: row.peer_avatar_url ? String(row.peer_avatar_url) : undefined,
    })).filter(c => isNovaUserId(c.novaId));

    // Live profile overlay — Settings name/avatar changes must show for friends.
    const { lookupNovaUser, NOVA_DEV_ID, formatNovaId, clearArkLookupCache } = await import('@/lib/novaUserId');
    clearArkLookupCache();
    const [devHit, ...lives] = await Promise.all([
      lookupNovaUser('DEV'),
      ...cloud.map(c => lookupNovaUser(c.novaId)),
    ]);
    const enriched = cloud.map((c, i) => {
      const live = lives[i];
      const isDevPeer = Boolean(
        devHit
        && (
          c.novaId === NOVA_DEV_ID
          || c.novaId === devHit.novaId
          || (devHit.legacyNovaId && c.novaId === devHit.legacyNovaId)
          || formatNovaId(c.novaId) === NOVA_DEV_ID
        ),
      );
      if (isDevPeer) {
        const liveName = (live?.displayName || '').trim();
        const cached = (c.displayName || '').trim();
        const displayName =
          (liveName && liveName.toUpperCase() !== NOVA_DEV_ID)
            ? liveName
            : (cached && cached.toUpperCase() !== NOVA_DEV_ID && cached !== c.novaId)
              ? cached
              : 'NOVA user';
        return {
          ...c,
          novaId: NOVA_DEV_ID,
          displayName,
          avatarUrl: live?.avatarUrl || devHit?.avatarUrl || c.avatarUrl,
        };
      }
      const displayName = (live?.displayName || c.displayName || c.novaId).trim();
      const avatarUrl = live?.avatarUrl || c.avatarUrl;
      return {
        ...c,
        novaId: formatNovaId(c.novaId),
        displayName,
        avatarUrl: avatarUrl || undefined,
      };
    });

    // Persist fresher labels so the next open is instant.
    for (const c of enriched) {
      const prev = cloud.find(x => x.novaId === c.novaId);
      if (
        prev
        && (prev.displayName !== c.displayName || (prev.avatarUrl || '') !== (c.avatarUrl || ''))
      ) {
        void persistContact(userId, c);
      }
    }

    const blocked = new Set(loadBlockedNovaIds().map(formatNovaId));
    // Cloud is source of truth when signed in — local-only rows must not resurrect after unfriend.
    const byId = new Map<string, NovaContact>();
    enriched.forEach(c => {
      const id = formatNovaId(c.novaId);
      if (blocked.has(id)) return;
      byId.set(id, { ...c, novaId: id });
    });
    const merged = [...byId.values()];
    saveLocalContacts(merged);
    return merged;
  } catch {
    return local;
  }
}

export async function persistContact(userId: string | null | undefined, contact: NovaContact) {
  if (!canUseCloud(userId)) return;
  try {
    await supabase.from('nova_contacts').upsert({
      owner_id: userId,
      peer_nova_id: contact.novaId,
      display_name: contact.displayName,
      peer_avatar_url: contact.avatarUrl || null,
    }, { onConflict: 'owner_id,peer_nova_id' });
  } catch {
    /* ignore */
  }
}

function mapPost(row: Record<string, unknown>): NetworkPost {
  const local = loadLocalPosts().find(p => p.id === String(row.id));
  return {
    id: String(row.id),
    ownerNovaId: String(row.owner_nova_id || ''),
    ownerName: String(row.owner_name || ''),
    title: String(row.title || 'Untitled'),
    summary: String(row.summary || ''),
    details: local?.details || String(row.details || ''),
    intent: local?.intent || (row.intent === 'share' ? 'share' : 'help'),
    paying: Boolean(local?.paying ?? row.paying),
    visibility: row.visibility === 'private' ? 'private' : 'public',
    githubUrl: String(row.github_url || ''),
    allowedNovaIds: Array.isArray(row.allowed_nova_ids) ? row.allowed_nova_ids.map(String) : [],
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export async function listNetworkPosts(opts: {
  userId?: string | null;
  myNovaId?: string | null;
}): Promise<NetworkPost[]> {
  const local = loadLocalPosts();
  const mine = opts.myNovaId || '';
  const visibleLocal = local.filter(p =>
    p.visibility === 'public'
    || p.ownerNovaId === mine
    || p.allowedNovaIds.includes(mine),
  );
  if (!canUseCloud(opts.userId)) return visibleLocal.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  try {
    const { data, error } = await supabase
      .from('nova_network_posts')
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
  ownerNovaId: string;
  ownerName: string;
  title: string;
  summary: string;
  details?: string;
  intent?: 'help' | 'share';
  paying?: boolean;
  visibility: 'public' | 'private';
  githubUrl?: string;
  allowedNovaIds?: string[];
  allowDiscussion?: boolean;
  codeRequiresApproval?: boolean;
}): Promise<NetworkPost> {
  const post: NetworkPost = {
    id: crypto.randomUUID(),
    ownerNovaId: opts.ownerNovaId,
    ownerName: opts.ownerName,
    title: opts.title.trim() || 'Untitled',
    summary: opts.summary.trim(),
    details: (opts.details || '').trim(),
    intent: opts.intent || 'help',
    paying: Boolean(opts.paying),
    visibility: opts.visibility,
    githubUrl: (opts.githubUrl || '').trim(),
    allowedNovaIds: (opts.allowedNovaIds || []).map(normalizeNovaId).filter(isNovaUserId),
    createdAt: new Date().toISOString(),
    allowDiscussion: opts.allowDiscussion !== false,
    codeRequiresApproval: opts.codeRequiresApproval !== false,
  };
  saveLocalPosts([post, ...loadLocalPosts().filter(p => p.id !== post.id)]);
  if (canUseCloud(opts.userId)) {
    try {
      const cloudSummary = [post.summary, post.details].filter(Boolean).join('\n\n');
      const { data, error } = await supabase.from('nova_network_posts').insert({
        id: post.id,
        owner_id: opts.userId,
        owner_nova_id: post.ownerNovaId,
        owner_name: post.ownerName,
        title: post.title,
        summary: cloudSummary || post.summary,
        visibility: post.visibility,
        github_url: post.githubUrl || null,
        allowed_nova_ids: post.allowedNovaIds,
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
      await supabase.from('nova_network_posts').delete().eq('id', id);
    } catch {
      /* keep local */
    }
  }
}

export async function updateNetworkPost(
  id: string,
  patch: Partial<Pick<NetworkPost, 'title' | 'summary' | 'visibility' | 'allowedNovaIds' | 'githubUrl'>>,
  userId?: string | null,
): Promise<void> {
  const next = loadLocalPosts().map(p => (p.id === id ? { ...p, ...patch } : p));
  saveLocalPosts(next);
  if (canUseCloud(userId)) {
    try {
      await supabase.from('nova_network_posts').update({
        title: patch.title,
        summary: patch.summary,
        visibility: patch.visibility,
        github_url: patch.githubUrl,
        allowed_nova_ids: patch.allowedNovaIds,
      }).eq('id', id);
    } catch {
      /* keep local */
    }
  }
}

export async function listThread(myNovaId: string, peerNovaId: string, userId?: string | null): Promise<DirectMessage[]> {
  const local = loadLocalMessages().filter(m =>
    (m.senderNovaId === myNovaId && m.recipientNovaId === peerNovaId)
    || (m.senderNovaId === peerNovaId && m.recipientNovaId === myNovaId),
  );
  if (!canUseCloud(userId)) {
    return local.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  try {
    const { data, error } = await supabase
      .from('nova_direct_messages')
      .select('*')
      .or(`and(sender_nova_id.eq.${myNovaId},recipient_nova_id.eq.${peerNovaId}),and(sender_nova_id.eq.${peerNovaId},recipient_nova_id.eq.${myNovaId})`)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error || !data) return local.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const cloud: DirectMessage[] = data.map(row => ({
      id: String(row.id),
      senderNovaId: String(row.sender_nova_id),
      recipientNovaId: String(row.recipient_nova_id),
      body: String(row.body),
      createdAt: String(row.created_at),
    }));
    const byId = new Map<string, DirectMessage>();
    [...cloud, ...local].forEach(m => byId.set(m.id, m));
    const merged = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const rest = loadLocalMessages().filter(m =>
      !((m.senderNovaId === myNovaId && m.recipientNovaId === peerNovaId)
        || (m.senderNovaId === peerNovaId && m.recipientNovaId === myNovaId)),
    );
    saveLocalMessages([...rest, ...merged]);
    return merged;
  } catch {
    return local.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

export async function sendDirectMessage(opts: {
  userId?: string | null;
  senderNovaId: string;
  recipientNovaId: string;
  body: string;
  attachment?: MessageAttachment;
  /** When false, skip friendship check (internal / already verified). */
  allowWithoutFriendship?: boolean;
}): Promise<DirectMessage> {
  const peer = formatNovaId(normalizeNovaId(opts.recipientNovaId));
  if (!opts.allowWithoutFriendship) {
    const friends = await areMutualFriends(opts.userId, peer, loadLocalContacts());
    if (!friends) {
      throw new Error(MSG_NEED_FRIEND);
    }
    if (isBlockedNovaId(peer)) {
      throw new Error('You blocked this user. Unblock them in Settings → Privacy to message again.');
    }
  }
  const msg: DirectMessage = {
    id: crypto.randomUUID(),
    senderNovaId: opts.senderNovaId,
    recipientNovaId: peer,
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
    const { error } = await supabase.from('nova_direct_messages').insert({
      id: msg.id,
      sender_id: opts.userId,
      sender_nova_id: msg.senderNovaId,
      recipient_nova_id: msg.recipientNovaId,
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

export function threadPreview(myNovaId: string, peerNovaId: string): DirectMessage | null {
  const msgs = loadLocalMessages().filter(m =>
    (m.senderNovaId === myNovaId && m.recipientNovaId === peerNovaId)
    || (m.senderNovaId === peerNovaId && m.recipientNovaId === myNovaId),
  );
  return msgs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
}

export function subscribeMessages(
  myNovaId: string,
  onMessage: (msg: DirectMessage) => void,
  userId?: string | null,
) {
  if (!myNovaId || !canUseCloud(userId)) return () => undefined;
  try {
  const channel = supabase
    .channel(`NOVA-dm-${myNovaId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ark_direct_messages' },
      payload => {
        const row = payload.new as Record<string, unknown>;
        const msg: DirectMessage = {
          id: String(row.id),
          senderNovaId: String(row.sender_nova_id),
          recipientNovaId: String(row.recipient_nova_id),
          body: String(row.body),
          createdAt: String(row.created_at),
        };
        if (msg.senderNovaId === myNovaId || msg.recipientNovaId === myNovaId) {
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
      await supabase.from('nova_contacts').upsert({
        owner_id: userId,
        peer_nova_id: c.novaId,
        display_name: c.displayName,
        peer_avatar_url: c.avatarUrl || null,
      }, { onConflict: 'owner_id,peer_nova_id' });
    } catch {
      /* keep going */
    }
  }
  const posts = loadLocalPosts();
  for (const p of posts) {
    try {
      await supabase.from('nova_network_posts').upsert({
        id: p.id,
        owner_id: userId,
        owner_nova_id: p.ownerNovaId,
        owner_name: p.ownerName,
        title: p.title,
        summary: p.summary,
        visibility: p.visibility,
        github_url: p.githubUrl,
        allowed_nova_ids: p.allowedNovaIds,
        created_at: p.createdAt,
      }, { onConflict: 'id' });
    } catch {
      /* keep going */
    }
  }
  const msgs = loadLocalMessages();
  for (const m of msgs) {
    try {
      await supabase.from('nova_direct_messages').upsert({
        id: m.id,
        sender_id: userId,
        sender_nova_id: m.senderNovaId,
        recipient_nova_id: m.recipientNovaId,
        body: m.body,
        created_at: m.createdAt,
      }, { onConflict: 'id' });
    } catch {
      /* keep going */
    }
  }
}
