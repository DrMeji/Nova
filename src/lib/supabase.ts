import { createClient, type SupportedStorage } from '@supabase/supabase-js';

// Vite always injects import.meta.env in the app, but Node-based smoke tests
// and tooling can import this module without that object being present.
const viteEnv = (import.meta as unknown as { env?: Record<string, unknown> }).env;

type DesktopCloudEnv = {
  url?: string;
  anonKey?: string;
  configured?: boolean;
};

function readDesktopCloudEnv(): DesktopCloudEnv | null {
  if (typeof window === 'undefined') return null;
  try {
    const fn = (window as { arkDesktop?: { getCloudAuthEnv?: () => DesktopCloudEnv } }).arkDesktop
      ?.getCloudAuthEnv;
    if (typeof fn !== 'function') return null;
    const v = fn();
    if (!v || typeof v !== 'object') return null;
    return v;
  } catch {
    return null;
  }
}

const desktopCloud = readDesktopCloudEnv();
const viteUrl = (typeof viteEnv?.VITE_SUPABASE_URL === 'string' ? viteEnv.VITE_SUPABASE_URL : '').trim();
const viteAnon = (typeof viteEnv?.VITE_SUPABASE_ANON_KEY === 'string' ? viteEnv.VITE_SUPABASE_ANON_KEY : '').trim();
const deskUrl = typeof desktopCloud?.url === 'string' ? desktopCloud.url.trim() : '';
const deskAnon = typeof desktopCloud?.anonKey === 'string' ? desktopCloud.anonKey.trim() : '';

// Electron can override guest-local Vite placeholders via .env.local / cloud-auth.env.
const supabaseUrl = deskUrl || viteUrl;
const supabaseAnonKey = deskAnon || viteAnon;

const missingSupabase = !supabaseUrl || !supabaseAnonKey || /placeholder\.invalid/i.test(supabaseUrl);

/**
 * Hard brick only for browser builds without env.
 * Electron desktop may boot guest-local (create/bind/preview) when cloud keys
 * were not baked in — show supabaseCloudWarning instead of a black screen.
 */
export const supabaseConfigError =
  missingSupabase && typeof window !== 'undefined' && !(window as { arkDesktop?: unknown }).arkDesktop
    ? 'NOVA was built without Supabase config (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
    : null;

/** Non-blocking: cloud sign-in / sync unavailable until rebuilt with env. */
export const supabaseCloudWarning = missingSupabase
  ? 'Cloud sign-in is off (no Supabase env in this build). Add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY to .env.local, then relaunch. Guest local create still works.'
  : null;

export const isSupabaseConfigured = !missingSupabase;

/**
 * auth-js builds sessions as `{ expires_at: now+expires_in, ...data }` and the
 * spread lets the server's expires_at win. When Windows Time is stopped / skewed,
 * that server timestamp is already in the past → perpetual refresh → 429 → kickout.
 * Re-base expires_at on every token response using local now + expires_in.
 */
const skewSafeFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  try {
    const url = String(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url || '',
    );
    if (!/\/auth\/v1\/token/i.test(url) || !res.ok) return res;
    const data = await res.clone().json();
    if (!data || typeof data !== 'object') return res;
    const expiresIn = Number((data as { expires_in?: unknown }).expires_in);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) return res;
    const next = {
      ...(data as Record<string, unknown>),
      expires_at: Math.round(Date.now() / 1000) + Math.floor(expiresIn),
    };
    return new Response(JSON.stringify(next), {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } catch {
    return res;
  }
};

/**
 * Prefer Electron userData for the auth session so upgrades keep you signed in.
 * Falls back to localStorage in the browser.
 */
const LOCAL_FALLBACK_PREFIX = 'NOVA-auth-fallback:';

/** Clear mirrored auth keys (call on intentional Sign out only). */
export function clearAuthLocalFallback() {
  try {
    const ls = browserLocalStorage();
    if (!ls) return;
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) {
      if (k.startsWith(LOCAL_FALLBACK_PREFIX) || /auth-token/i.test(k)) {
        ls.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
}

const hasBrowserWindow = typeof globalThis !== 'undefined'
  && typeof (globalThis as { window?: unknown }).window !== 'undefined';

function browserLocalStorage(): Storage | null {
  if (!hasBrowserWindow) return null;
  try {
    return globalThis.window.localStorage;
  } catch {
    return null;
  }
}

function arkDesktopAuth() {
  if (!hasBrowserWindow) return undefined;
  try {
    return globalThis.window.arkDesktop;
  } catch {
    return undefined;
  }
}

/**
 * Supabase stores expires_at in server-second epoch. If the OS clock is skewed
 * (common when Windows Time is stopped), every fresh token looks already expired
 * → auth-js refresh-storms → 429 → SIGNED_OUT within seconds of login.
 * Re-base expires_at from local now + expires_in whenever we persist.
 */
function nextExpiresAt(expiresIn: number): number {
  return Math.floor(Date.now() / 1000) + Math.floor(expiresIn);
}

function normalizeSessionExpires(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const session =
      parsed && typeof parsed === 'object' && parsed.currentSession && typeof parsed.currentSession === 'object'
        ? (parsed.currentSession as Record<string, unknown>)
        : parsed;
    if (!session || typeof session !== 'object') return raw;
    const expiresIn = Number(session.expires_in);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) return raw;
    const nextExpires = nextExpiresAt(expiresIn);
    if (session.expires_at === nextExpires) return raw;
    session.expires_at = nextExpires;
    if (parsed.currentSession && parsed.currentSession !== session) {
      (parsed.currentSession as Record<string, unknown>).expires_at = nextExpires;
    }
    return JSON.stringify(parsed);
  } catch {
    return raw;
  }
}

type SessionExpiryFields = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
};

/** Heal in-memory session expires_at so auth-js auto-refresh does not treat it as already dead. */
export function healSessionExpires<T extends SessionExpiryFields>(session: T): T {
  const expiresIn = Number(session.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return session;
  const nextExpires = nextExpiresAt(expiresIn);
  if (session.expires_at === nextExpires) return session;
  return { ...session, expires_at: nextExpires };
}

/**
 * Write a healed session blob back into Electron + local mirror without calling
 * supabase.auth.setSession (setSession re-triggers refresh when JWT exp is skewed).
 */
export async function persistHealedAuthSession(session: SessionExpiryFields): Promise<SessionExpiryFields> {
  const healed = healSessionExpires(session);
  if (!healed?.access_token || !healed.refresh_token) return healed;
  const blob = JSON.stringify(healed);
  try {
    await arkAuthStorage.setItem('ark-auth-token', blob);
  } catch {
    /* ignore — React restore still keeps the user in-app */
  }
  return healed;
}

const arkAuthStorage: SupportedStorage = {
  getItem: (key) => {
    const desktop = arkDesktopAuth();
    const readFallback = () => {
      try {
        return browserLocalStorage()?.getItem(LOCAL_FALLBACK_PREFIX + key) ?? null;
      } catch {
        return null;
      }
    };
    const healExpires = (v: string | null) => {
      if (typeof v !== 'string' || !v) return v;
      const normalized = normalizeSessionExpires(v);
      // Persist healed expiry so the next auto-refresh tick does not re-storm.
      if (normalized !== v) {
        try {
          browserLocalStorage()?.setItem(LOCAL_FALLBACK_PREFIX + key, normalized);
        } catch {
          /* ignore */
        }
        if (desktop?.authStorageSet) {
          void desktop.authStorageSet(key, normalized).catch(() => undefined);
        }
      }
      return normalized;
    };
    if (desktop?.authStorageGet) {
      return desktop.authStorageGet(key).then((v) => {
        if (typeof v === 'string' && v.length > 0) return healExpires(v);
        const fallback = readFallback();
        // Heal encrypted store from local mirror after decrypt/glitch empties it.
        if (fallback && desktop.authStorageSet) {
          void desktop.authStorageSet(key, fallback).catch(() => undefined);
        }
        return healExpires(fallback);
      });
    }
    return healExpires(browserLocalStorage()?.getItem(key) ?? null);
  },
  setItem: (key, value) => {
    const normalized = normalizeSessionExpires(String(value ?? ''));
    // Always mirror locally so a brief OS-encryption/decrypt failure cannot wipe the session.
    try {
      browserLocalStorage()?.setItem(LOCAL_FALLBACK_PREFIX + key, normalized);
    } catch {
      /* ignore */
    }
    const desktop = arkDesktopAuth();
    if (desktop?.authStorageSet) {
      return desktop
        .authStorageSet(key, normalized)
        .then(() => undefined)
        .catch(() => undefined);
    }
    browserLocalStorage()?.setItem(key, normalized);
  },
  removeItem: (key) => {
    // Soft-delete on the Electron store only. Keep the local mirror so a
    // spurious _removeSession (token refresh / getUser race) can be recovered
    // by AuthContext. Intentional Sign out calls clearAuthLocalFallback().
    const desktop = arkDesktopAuth();
    if (desktop?.authStorageRemove) {
      return desktop
        .authStorageRemove(key)
        .then(() => undefined)
        .catch(() => undefined);
    }
    try {
      browserLocalStorage()?.removeItem(key);
    } catch {
      /* ignore */
    }
    return undefined;
  },
};

// Placeholder client keeps the module from throwing at import time (black screen).
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.invalid',
  supabaseAnonKey || 'public-anon-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: arkAuthStorage,
      storageKey: 'ark-auth-token',
    },
    global: {
      fetch: skewSafeFetch,
    },
  },
);
