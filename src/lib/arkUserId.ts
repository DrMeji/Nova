/**
 * Each NOVA account gets one 7-digit ID (1000000–9999999), except the designated
 * developer account whose public NOVA ID is the literal `DEV`.
 * Share this instead of email. Users cannot edit their NOVA ID.
 */

import { supabase } from '@/lib/supabase';
import { isArkDevEmail, isDevArkAlias } from '@/lib/arkDevAccount';

export const ARK_ID_RE = /^[1-9]\d{6}$/;
export const ARK_DEV_ID = 'DEV';

function storageKey(userId: string) {
  return `NOVA:NOVA-id:${userId || 'guest-local'}`;
}

function usedKey() {
  return 'NOVA:NOVA-id-used';
}

/** True for a normal 7-digit ID or the developer alias DEV. */
export function isArkUserId(value: string) {
  const v = String(value || '').trim();
  if (isDevArkAlias(v)) return true;
  return ARK_ID_RE.test(v);
}

export function formatArkId(id: string) {
  const raw = String(id || '').trim();
  if (isDevArkAlias(raw)) return ARK_DEV_ID;
  const digits = raw.replace(/\D/g, '');
  return digits.length === 7 ? digits : raw;
}

export function normalizeArkId(value: string) {
  const raw = String(value || '').trim();
  if (isDevArkAlias(raw)) return ARK_DEV_ID;
  return raw.replace(/\D/g, '').slice(0, 7);
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
    return v && isArkUserId(v) ? formatArkId(v) : null;
  } catch {
    return null;
  }
}

function writeLocalArkId(userId: string, id: string) {
  const normalized = formatArkId(id);
  try {
    localStorage.setItem(storageKey(userId), normalized);
  } catch {
    /* ignore */
  }
  rememberUsed(normalized);
}

function randomArkId(avoid: Set<string>) {
  for (let i = 0; i < 40; i++) {
    const n = 1_000_000 + Math.floor(Math.random() * 9_000_000);
    const id = String(n);
    if (!avoid.has(id) && id !== ARK_DEV_ID) return id;
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
    return id && isArkUserId(id) ? formatArkId(id) : null;
  } catch {
    return null;
  }
}

async function saveCloudArkId(userId: string, arkId: string): Promise<'ok' | 'taken' | 'skip'> {
  if (!userId || userId === 'guest-local') return 'skip';
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ ark_id: formatArkId(arkId), updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (!error) return 'ok';
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('duplicate') || msg.includes('unique') || error.code === '23505') return 'taken';
    return 'skip';
  } catch {
    return 'skip';
  }
}

export type ArkLookupHit = {
  arkId: string;
  displayName: string | null;
  avatarUrl?: string | null;
  /** Legacy numeric id if DB still stores digits for DEV (for remapping contacts). */
  legacyArkId?: string;
};

/** Look up a public NOVA ID (no email). Returns null if unknown or offline. */
const lookupCache = new Map<string, { at: number; value: ArkLookupHit | null }>();
const LOOKUP_CACHE_MS = 15_000;

export function clearArkLookupCache() {
  lookupCache.clear();
}

export async function lookupArkUser(arkId: string): Promise<ArkLookupHit | null> {
  const raw = String(arkId || '').trim();
  const id = normalizeArkId(raw);
  if (!isArkUserId(id)) return null;
  const cacheKey = formatArkId(id);
  const cached = lookupCache.get(cacheKey);
  if (cached && Date.now() - cached.at < LOOKUP_CACHE_MS) return cached.value;
  try {
    const { data, error } = await supabase.rpc('lookup_ark_user', {
      p_ark_id: cacheKey,
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
    const rowId = String(row.ark_id || '');
    // DEV lookup may still return a legacy numeric row — always expose public ID as DEV.
    const isDevHit = isDevArkAlias(raw) || isDevArkAlias(rowId) || cacheKey === ARK_DEV_ID;
    if (!isDevHit && !isArkUserId(rowId)) {
      lookupCache.set(cacheKey, { at: Date.now(), value: null });
      return null;
    }
    // Public NOVA ID stays DEV for the developer account; display name is separate
    // (e.g. AutoFoot) so friends see the name, not only "DEV".
    const rawName = row.display_name ? String(row.display_name).trim() : '';
    const displayName = rawName && rawName.toUpperCase() !== ARK_DEV_ID ? rawName : null;
    const value: ArkLookupHit = {
      arkId: isDevHit ? ARK_DEV_ID : formatArkId(rowId),
      displayName,
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
      legacyArkId: isDevHit && ARK_ID_RE.test(rowId) ? rowId : undefined,
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
export async function ensureArkId(userId: string, email?: string | null): Promise<string> {
  const uid = userId || 'guest-local';

  if (isArkDevEmail(email)) {
    writeLocalArkId(uid, ARK_DEV_ID);
    await saveCloudArkId(uid, ARK_DEV_ID);
    return ARK_DEV_ID;
  }

  // Cloud profile is source of truth — stale local cache must not hide friend requests.
  const fromCloud = await fetchCloudArkId(uid);
  if (fromCloud && !isDevArkAlias(fromCloud)) {
    writeLocalArkId(uid, fromCloud);
    return fromCloud;
  }

  const local = readLocalArkId(uid);
  if (local && !isDevArkAlias(local)) {
    void saveCloudArkId(uid, local);
    return local;
  }

  const avoid = new Set(readUsed());
  avoid.add(ARK_DEV_ID);
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
