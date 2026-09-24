/**
 * Each NOVA account gets one 7-digit ID (1000000–9999999), except the designated
 * developer account whose public NOVA ID is the literal `DEV`.
 * Share this instead of email. Users cannot edit their NOVA ID.
 */

import { supabase } from '@/lib/supabase';
import { isNovaDevEmail, isDevNovaAlias } from '@/lib/novaDevAccount';

export const NOVA_ID_RE = /^[1-9]\d{6}$/;
export const NOVA_DEV_ID = 'DEV';

function storageKey(userId: string) {
  return `NOVA:NOVA-id:${userId || 'guest-local'}`;
}

function usedKey() {
  return 'NOVA:NOVA-id-used';
}

/** True for a normal 7-digit ID or the developer alias DEV. */
export function isNovaUserId(value: string) {
  const v = String(value || '').trim();
  if (isDevNovaAlias(v)) return true;
  return NOVA_ID_RE.test(v);
}

export function formatNovaId(id: string) {
  const raw = String(id || '').trim();
  if (isDevNovaAlias(raw)) return NOVA_DEV_ID;
  const digits = raw.replace(/\D/g, '');
  return digits.length === 7 ? digits : raw;
}

export function normalizeNovaId(value: string) {
  const raw = String(value || '').trim();
  if (isDevNovaAlias(raw)) return NOVA_DEV_ID;
  return raw.replace(/\D/g, '').slice(0, 7);
}

function readUsed(): string[] {
  try {
    const raw = localStorage.getItem(usedKey());
    const parsed = raw ? JSON.parse(raw) as string[] : [];
    return Array.isArray(parsed) ? parsed.filter(isNovaUserId) : [];
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

export function readLocalNovaId(userId: string): string | null {
  try {
    const v = localStorage.getItem(storageKey(userId));
    return v && isNovaUserId(v) ? formatNovaId(v) : null;
  } catch {
    return null;
  }
}

function writeLocalNovaId(userId: string, id: string) {
  const normalized = formatNovaId(id);
  try {
    localStorage.setItem(storageKey(userId), normalized);
  } catch {
    /* ignore */
  }
  rememberUsed(normalized);
}

function randomNovaId(avoid: Set<string>) {
  for (let i = 0; i < 40; i++) {
    const n = 1_000_000 + Math.floor(Math.random() * 9_000_000);
    const id = String(n);
    if (!avoid.has(id) && id !== NOVA_DEV_ID) return id;
  }
  return String(1_000_000 + Math.floor(Math.random() * 9_000_000));
}

async function fetchCloudNovaId(userId: string): Promise<string | null> {
  if (!userId || userId === 'guest-local') return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('nova_id')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    const id = (data as { nova_id?: string } | null)?.nova_id;
    return id && isNovaUserId(id) ? formatNovaId(id) : null;
  } catch {
    return null;
  }
}

async function saveCloudNovaId(userId: string, novaId: string): Promise<'ok' | 'taken' | 'skip'> {
  if (!userId || userId === 'guest-local') return 'skip';
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ nova_id: formatNovaId(novaId), updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (!error) return 'ok';
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('duplicate') || msg.includes('unique') || error.code === '23505') return 'taken';
    return 'skip';
  } catch {
    return 'skip';
  }
}

export type NovaLookupHit = {
  novaId: string;
  displayName: string | null;
  avatarUrl?: string | null;
  /** Legacy numeric id if DB still stores digits for DEV (for remapping contacts). */
  legacyNovaId?: string;
};

/** Look up a public NOVA ID (no email). Returns null if unknown or offline. */
const lookupCache = new Map<string, { at: number; value: NovaLookupHit | null }>();
const LOOKUP_CACHE_MS = 15_000;

export function clearArkLookupCache() {
  lookupCache.clear();
}

export async function lookupNovaUser(novaId: string): Promise<NovaLookupHit | null> {
  const raw = String(novaId || '').trim();
  const id = normalizeNovaId(raw);
  if (!isNovaUserId(id)) return null;
  const cacheKey = formatNovaId(id);
  const cached = lookupCache.get(cacheKey);
  if (cached && Date.now() - cached.at < LOOKUP_CACHE_MS) return cached.value;
  try {
    const { data, error } = await supabase.rpc('lookup_nova_user', {
      p_nova_id: cacheKey,
    });
    if (error || !data) {
      lookupCache.set(cacheKey, { at: Date.now(), value: null });
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      lookupCache.set(cacheKey, { at: Date.now(), value: null });
      return null;
    }
    const rowId = String(row.nova_id || '');
    // DEV lookup may still return a legacy numeric row — always expose public ID as DEV.
    const isDevHit = isDevNovaAlias(raw) || isDevNovaAlias(rowId) || cacheKey === NOVA_DEV_ID;
    if (!isDevHit && !isNovaUserId(rowId)) {
      lookupCache.set(cacheKey, { at: Date.now(), value: null });
      return null;
    }
    // Public NOVA ID stays DEV for the developer account; display name is separate
    // (e.g. AutoFoot) so friends see the name, not only "DEV".
    const rawName = row.display_name ? String(row.display_name).trim() : '';
    const displayName = rawName && rawName.toUpperCase() !== NOVA_DEV_ID ? rawName : null;
    const value: NovaLookupHit = {
      novaId: isDevHit ? NOVA_DEV_ID : formatNovaId(rowId),
      displayName,
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
      legacyNovaId: isDevHit && NOVA_ID_RE.test(rowId) ? rowId : undefined,
    };
    lookupCache.set(cacheKey, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

/**
 * Ensure this account has a public NOVA ID.
 * Developer email is forced to the literal `DEV` so friends see DEV, not digits.
 */
export async function ensureNovaId(userId: string, email?: string | null): Promise<string> {
  const uid = userId || 'guest-local';

  if (isNovaDevEmail(email)) {
    writeLocalNovaId(uid, NOVA_DEV_ID);
    await saveCloudNovaId(uid, NOVA_DEV_ID);
    return NOVA_DEV_ID;
  }

  // Cloud profile is source of truth — stale local cache must not hide friend requests.
  const fromCloud = await fetchCloudNovaId(uid);
  if (fromCloud && !isDevNovaAlias(fromCloud)) {
    writeLocalNovaId(uid, fromCloud);
    return fromCloud;
  }

  const local = readLocalNovaId(uid);
  if (local && !isDevNovaAlias(local)) {
    void saveCloudNovaId(uid, local);
    return local;
  }

  const avoid = new Set(readUsed());
  avoid.add(NOVA_DEV_ID);
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = randomNovaId(avoid);
    avoid.add(id);
    const saved = await saveCloudNovaId(uid, id);
    if (saved === 'taken') continue;
    writeLocalNovaId(uid, id);
    return id;
  }

  const fallback = randomNovaId(avoid);
  writeLocalNovaId(uid, fallback);
  return fallback;
}
