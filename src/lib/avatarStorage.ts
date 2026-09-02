/**
 * Profile avatars via Supabase Storage (HTTP URLs in profiles.avatar_url).
 * Falls back to storing a data URL only if Storage is unavailable.
 */

import { supabase } from '@/lib/supabase';

const BUCKET = 'avatars';
const MAX_BYTES = 2_500_000;

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } | null {
  const m = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const b64 = m[2];
  try {
    const bin = atob(b64);
    if (bin.length > MAX_BYTES) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = mime.includes('png') ? 'png'
      : mime.includes('webp') ? 'webp'
        : mime.includes('gif') ? 'gif'
          : 'jpg';
    return { blob: new Blob([bytes], { type: mime }), ext };
  } catch {
    return null;
  }
}

export type AvatarUploadResult =
  | { ok: true; url: string; via: 'storage' | 'inline' }
  | { ok: false; error: string };

/**
 * Upload a local data-URL avatar and return a stable public HTTPS URL when Storage works.
 */
export async function uploadAvatarDataUrl(
  userId: string,
  dataUrl: string,
): Promise<AvatarUploadResult> {
  const parsed = dataUrlToBlob(dataUrl);
  if (!parsed) {
    return { ok: false, error: 'Could not read that image. Try a smaller JPG or PNG.' };
  }

  const path = `${userId}/avatar.${parsed.ext}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, parsed.blob, {
      upsert: true,
      contentType: parsed.blob.type,
      cacheControl: '3600',
    });

  if (upErr) {
    const msg = String(upErr.message || '');
    // Bucket / policy not applied yet — caller may fall back to inline data URL.
    if (/bucket|not found|row-level security|policy|jwt/i.test(msg)) {
      return { ok: false, error: `storage_unavailable:${msg}` };
    }
    return { ok: false, error: msg || 'Upload failed' };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = data?.publicUrl;
  if (!url) return { ok: false, error: 'No public URL returned' };
  // Bust CDN/cache so friends see the new face immediately.
  const stamped = `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
  return { ok: true, url: stamped, via: 'storage' };
}

export async function removeAvatarFromStorage(userId: string): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove([
      `${userId}/avatar.jpg`,
      `${userId}/avatar.png`,
      `${userId}/avatar.webp`,
      `${userId}/avatar.gif`,
    ]);
  } catch {
    /* ignore */
  }
}

/** Persist profile.avatar_url (HTTPS preferred) and broadcast to friends. */
export async function persistProfileAvatarUrl(userId: string, avatarUrl: string | null): Promise<void> {
  await supabase.from('profiles').upsert({
    id: userId,
    avatar_url: avatarUrl,
  });
  try {
    await supabase.rpc('broadcast_my_profile');
  } catch {
    /* RPC may not be applied yet */
  }
}

/** Move legacy data-URL avatars into Storage when the bucket migration is applied. */
export async function migrateInlineAvatarToStorage(
  userId: string,
  avatarUrl: string | null | undefined,
): Promise<string | null> {
  if (!avatarUrl?.startsWith('data:image')) return null;
  const uploaded = await uploadAvatarDataUrl(userId, avatarUrl);
  if (!uploaded.ok || uploaded.via !== 'storage') return null;
  await persistProfileAvatarUrl(userId, uploaded.url);
  return uploaded.url;
}
