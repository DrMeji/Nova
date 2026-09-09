import { createClient, type SupportedStorage } from '@supabase/supabase-js';

// Vite always injects import.meta.env in the app, but Node-based smoke tests
// and tooling can import this module without that object being present.
const viteEnv = (import.meta as unknown as { env?: Record<string, unknown> }).env;
const supabaseUrl = (typeof viteEnv?.VITE_SUPABASE_URL === 'string' ? viteEnv.VITE_SUPABASE_URL : '').trim();
const supabaseAnonKey = (typeof viteEnv?.VITE_SUPABASE_ANON_KEY === 'string' ? viteEnv.VITE_SUPABASE_ANON_KEY : '').trim();

/** Set when the production bundle was built without Vite env. UI should show this, not go blank. */
export const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? 'NOVA was built without Supabase config (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
    : null;

/**
 * Prefer Electron userData for the auth session so upgrades keep you signed in.
 * Falls back to localStorage in the browser.
 */
const LOCAL_FALLBACK_PREFIX = 'NOVA-auth-fallback:';

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

const arkAuthStorage: SupportedStorage = {
  getItem: (key) => {
    const desktop = arkDesktopAuth();
    if (desktop?.authStorageGet) {
      return desktop.authStorageGet(key).then((v) => {
        if (typeof v === 'string') return v;
        try {
          return browserLocalStorage()?.getItem(LOCAL_FALLBACK_PREFIX + key) ?? null;
        } catch {
          return null;
        }
      });
    }
    return browserLocalStorage()?.getItem(key) ?? null;
  },
  setItem: (key, value) => {
    const desktop = arkDesktopAuth();
    if (desktop?.authStorageSet) {
      return desktop
        .authStorageSet(key, value)
        .then(() => undefined)
        .catch(() => {
          // If OS encryption is unavailable, still allow sign-in via local fallback.
          try {
            browserLocalStorage()?.setItem(LOCAL_FALLBACK_PREFIX + key, value);
          } catch {
            /* ignore */
          }
        });
    }
    browserLocalStorage()?.setItem(key, value);
  },
  removeItem: (key) => {
    const desktop = arkDesktopAuth();
    if (desktop?.authStorageRemove) {
      return desktop
        .authStorageRemove(key)
        .then(() => undefined)
        .catch(() => {
          try {
            browserLocalStorage()?.removeItem(LOCAL_FALLBACK_PREFIX + key);
          } catch {
            /* ignore */
          }
        })
        .finally(() => {
          try {
            browserLocalStorage()?.removeItem(LOCAL_FALLBACK_PREFIX + key);
          } catch {
            /* ignore */
          }
        });
    }
    browserLocalStorage()?.removeItem(key);
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
  },
);
