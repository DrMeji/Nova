/**
 * ARK social layer: contacts, Networking posts, and DMs.
 * Cloud (Supabase) when signed in; local cache so the UI still works offline / guest.
 */

import { supabase } from '@/lib/supabase';
import { isArkUserId, lookupArkUser, normalizeArkId } from '@/lib/arkUserId';

export type ArkContact = {
  arkId: string;
  displayName: string;
  addedAt: string;
};

export type NetworkPost = {
  id: string;
  ownerArkId: string;
  ownerName: string;
  title: string;
  summary: string;
  visibility: 'public' | 'private';
  githubUrl: string;
  allowedArkIds: string[];
  createdAt: string;
};

export type DirectMessage = {
  id: string;
  senderArkId: string;
  recipientArkId: string;
  body: string;
  createdAt: string;
};

const CONTACTS_KEY = 'ark:contacts';
const POSTS_KEY = 'ark:network-posts';
const DMS_KEY = 'ark:direct-messages';

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

export async function addContact(arkIdRaw: string, displayName?: string): Promise<ArkContact | null> {
  const arkId = normalizeArkId(arkIdRaw);
  if (!isArkUserId(arkId)) return null;
  const looked = await lookupArkUser(arkId);
  const contact: ArkContact = {
    arkId,
    displayName: displayName?.trim() || looked?.displayName || arkId,
    addedAt: new Date().toISOString(),
  };
  const next = [contact, ...loadLocalContacts().filter(c => c.arkId !== arkId)];
  saveLocalContacts(next);
  return contact;
}

export function removeContact(arkId: string) {
  saveLocalContacts(loadLocalContacts().filter(c => c.arkId !== arkId));
}

export async function listContacts(userId?: string | null): Promise<ArkContact[]> {
  const local = loadLocalContacts();
  if (!canUseCloud(userId)) return local;
  try {
    const { data, error } = await supabase
      .from('ark_contacts')
      .select('peer_ark_id, display_name, created_at')
      .order('created_at', { ascending: false });
    if (error || !data) return local;
    const cloud: ArkContact[] = data.map(row => ({
      arkId: String(row.peer_ark_id),
      displayName: String(row.display_name || row.peer_ark_id),
      addedAt: String(row.created_at),
    })).filter(c => isArkUserId(c.arkId));
    const byId = new Map<string, ArkContact>();
    [...cloud, ...local].forEach(c => {
      if (!byId.has(c.arkId)) byId.set(c.arkId, c);
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
    }, { onConflict: 'owner_id,peer_ark_id' });
  } catch {
    /* ignore */
  }
}

function mapPost(row: Record<string, unknown>): NetworkPost {
  return {
    id: String(row.id),
    ownerArkId: String(row.owner_ark_id || ''),
    ownerName: String(row.owner_name || ''),
    title: String(row.title || 'Untitled'),
    summary: String(row.summary || ''),
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
  visibility: 'public' | 'private';
  githubUrl?: string;
  allowedArkIds?: string[];
}): Promise<NetworkPost> {
  const post: NetworkPost = {
    id: crypto.randomUUID(),
    ownerArkId: opts.ownerArkId,
    ownerName: opts.ownerName,
    title: opts.title.trim() || 'Untitled',
    summary: opts.summary.trim(),
    visibility: opts.visibility,
    githubUrl: (opts.githubUrl || '').trim(),
    allowedArkIds: (opts.allowedArkIds || []).map(normalizeArkId).filter(isArkUserId),
    createdAt: new Date().toISOString(),
  };
  saveLocalPosts([post, ...loadLocalPosts().filter(p => p.id !== post.id)]);
  if (canUseCloud(opts.userId)) {
    try {
      const { data, error } = await supabase.from('ark_network_posts').insert({
        id: post.id,
        owner_id: opts.userId,
        owner_ark_id: post.ownerArkId,
        owner_name: post.ownerName,
        title: post.title,
        summary: post.summary,
        visibility: post.visibility,
        github_url: post.githubUrl || null,
        allowed_ark_ids: post.allowedArkIds,
      }).select('*').maybeSingle();
      if (!error && data) return mapPost(data as Record<string, unknown>);
    } catch {
      /* keep local */
    }
  }
  return post;
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
}): Promise<DirectMessage> {
  const msg: DirectMessage = {
    id: crypto.randomUUID(),
    senderArkId: opts.senderArkId,
    recipientArkId: opts.recipientArkId,
    body: opts.body.trim(),
    createdAt: new Date().toISOString(),
  };
  saveLocalMessages([...loadLocalMessages(), msg]);
  if (canUseCloud(opts.userId)) {
    try {
      await supabase.from('ark_direct_messages').insert({
        id: msg.id,
        sender_id: opts.userId,
        sender_ark_id: msg.senderArkId,
        recipient_ark_id: msg.recipientArkId,
        body: msg.body,
      });
    } catch {
      /* keep local */
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
) {
  const channel = supabase
    .channel(`ark-dm-${myArkId}`)
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
}

/** After guest signs in, upload local-only social data to Supabase. */
export async function mergeGuestSocialToCloud(userId: string): Promise<void> {
  if (!canUseCloud(userId)) return;
  const contacts = loadLocalContacts();
  for (const c of contacts) {
    try {
      await supabase.from('ark_contacts').upsert({
        user_id: userId,
        contact_ark_id: c.arkId,
        display_name: c.displayName,
      }, { onConflict: 'user_id,contact_ark_id' });
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
