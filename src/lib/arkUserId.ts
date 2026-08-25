/**
 * Each ARK account gets one 7-digit ID (1000000–9999999).
 * Share this instead of email. It is unique to that account.
 */

import { supabase } from '@/lib/supabase';

export const ARK_ID_RE = /^[1-9]\d{6}$/;

function storageKey(userId: string) {
  return `ark:ark-id:${userId || 'guest-local'}`;
}

function usedKey() {
  return 'ark:ark-id-used';
}

export function isArkUserId(value: string) {
  return ARK_ID_RE.test(value.trim());
}

export function formatArkId(id: string) {
  const digits = id.replace(/\D/g, '');
  return digits.length === 7 ? digits : id;
}

export function normalizeArkId(value: string) {
  return value.replace(/\D/g, '').slice(0, 7);
}

function readUsed(): string[] {
  try {
    const raw = localStorage.getItem(usedKey());
    const parsed = raw ? JSON.parse(raw) as string[] : [];
    return Array.isArray(parsed) ? parsed.filter(isArkUserId) : [];
  } catch {
    return [];
  }
}

function rememberUsed(id: string) {
  const next = [...new Set([...readUsed(), id])];
  try {
    localStorage.setItem(usedKey(), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function readLocalArkId(userId: string): string | null {
  try {
    const v = localStorage.getItem(storageKey(userId));
    return v && isArkUserId(v) ? v : null;
  } catch {
    return null;
  }
}

function writeLocalArkId(userId: string, id: string) {
  try {
    localStorage.setItem(storageKey(userId), id);
  } catch {
    /* ignore */
  }
  rememberUsed(id);
}

function randomArkId(avoid: Set<string>) {
  for (let i = 0; i < 40; i++) {
    const n = 1_000_000 + Math.floor(Math.random() * 9_000_000);
    const id = String(n);
    if (!avoid.has(id)) return id;
  }
  return String(1_000_000 + Math.floor(Math.random() * 9_000_000));
}

async function fetchCloudArkId(userId: string): Promise<string | null> {
  if (!userId || userId === 'guest-local') return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('ark_id')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    const id = (data as { ark_id?: string } | null)?.ark_id;
    return id && isArkUserId(id) ? id : null;
  } catch {
    return null;
  }
}

async function saveCloudArkId(userId: string, arkId: string): Promise<'ok' | 'taken' | 'skip'> {
  if (!userId || userId === 'guest-local') return 'skip';
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ ark_id: arkId, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (!error) return 'ok';
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('duplicate') || msg.includes('unique') || error.code === '23505') return 'taken';
    return 'skip';
  } catch {
    return 'skip';
  }
}

/** Look up a public ARK ID (no email). Returns null if unknown or offline. */
const lookupCache = new Map<string, { at: number; value: { arkId: string; displayName: string | null; avatarUrl?: string | null } | null }>();
const LOOKUP_CACHE_MS = 15_000;

export async function lookupArkUser(arkId: string): Promise<{ arkId: string; displayName: string | null; avatarUrl?: string | null } | null> {
  const id = normalizeArkId(arkId);
  if (!isArkUserId(id)) return null;
  const cached = lookupCache.get(id);
  if (cached && Date.now() - cached.at < LOOKUP_CACHE_MS) return cached.value;
  try {
    const { data, error } = await supabase.rpc('lookup_ark_user', { p_ark_id: id });
    if (error || !data) {
      lookupCache.set(id, { at: Date.now(), value: null });
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !isArkUserId(String(row.ark_id || ''))) {
      lookupCache.set(id, { at: Date.now(), value: null });
      return null;
    }
    const value = {
      arkId: String(row.ark_id),
      displayName: row.display_name ? String(row.display_name) : null,
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    };
    lookupCache.set(id, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

export async function ensureArkId(userId: string): Promise<string> {
  const uid = userId || 'guest-local';
  const local = readLocalArkId(uid);
  if (local) {
    void saveCloudArkId(uid, local);
    return local;
  }

  const fromCloud = await fetchCloudArkId(uid);
  if (fromCloud) {
    writeLocalArkId(uid, fromCloud);
    return fromCloud;
  }

  const avoid = new Set(readUsed());
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = randomArkId(avoid);
    avoid.add(id);
    const saved = await saveCloudArkId(uid, id);
    if (saved === 'taken') continue;
    writeLocalArkId(uid, id);
    return id;
  }

  const fallback = randomArkId(avoid);
  writeLocalArkId(uid, fallback);
  return fallback;
}
