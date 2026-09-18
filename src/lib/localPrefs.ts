/** Local sticky prefs for guest / offline UI (no cloud required). */

const PREFS_KEY = 'ark:local-prefs';
/** Older NOVA-prefixed key from the rebrand. Must stay distinct from PREFS_KEY. */
const PREFS_KEY_LEGACY_NOVA = 'NOVA:local-prefs';
const API_KEYS_KEY = 'ark:provider-api-keys';
const API_KEYS_KEY_LEGACY_NOVA = 'NOVA:provider-api-keys';

export type AiModePref = 'automatic' | 'local_only' | 'cloud_when_available' | 'local_fallback';
export type DensityPref = 'comfortable' | 'compact';
export type AccentPref = 'sky' | 'emerald' | 'amber' | 'rose';
export type PresenceStatusPref = 'online' | 'idle' | 'dnd' | 'inactive';

export type LocalPrefs = {
  displayName: string;
  avatarDataUrl?: string;
  /** Sidebar / Message presence (Online, Idle, DND, Inactive). */
  presenceStatus: PresenceStatusPref;
  defaultModelId: string;
  /** Last model that successfully answered in Chat (for picker restore). */
  lastChatModelId?: string;
  /** Default brain for Code workspace when Auto is not selected. */
  defaultCodeModelId?: string;
  /** Role brains (Sprint C). Prefer these over legacy defaults when set. */
  activeChatId?: string;
  activeCoderId?: string;
  activeVisionId?: string;
  /** Prefs schema version for migrations (never let stale toggles resurrect). */
  prefsVersion?: number;
  /** Last provider/model that actually answered (Settings → AI). */
  lastAnsweredLabel?: string;
  /** UI font size in px (html root). */
  fontSizePx: number;
  aiMode: AiModePref;
  keepFilesLocal: boolean;
  allowCloudSync: boolean;
  sendDiagnostics: boolean;
  preferredLanguage: string;
  projectLocation: string;
  // Appearance
  density: DensityPref;
  accent: AccentPref;
  reduceMotion: boolean;
  /**
   * Softness of the floating background color circles (px).
   * 0 = sharp discs; 7 = current default soft edge.
   */
  orbBlurPx: number;
  compactSidebar: boolean;
  /** Expanded sidebar width in px (remembered per this PC). */
  sidebarWidth: number;
  showStatusBar: boolean;
  // AI
  autoFailover: boolean;
  /** Ask before a local request is sent to a cloud provider during failover. */
  askBeforeCloudFailover: boolean;
  /**
   * When false (default), block nude / pornographic image asks and bias hosts to SFW.
   * When true, allow NSFW image generation.
   */
  allowNsfw: boolean;
  streamResponses: boolean;
  rememberContext: boolean;
  /** Local GGUF sampling temperature (0.1–1.2). */
  ggufTemperature: number;
  /** Local GGUF max tokens (n_predict). */
  ggufNPredict: number;
  /** Search Hugging Face for GGUF brains that fit this PC. */
  huntInternetModels: boolean;
  /** Install the best coding GGUF found online when no coder is on disk. */
  autoInstallHuntModels: boolean;
  // Privacy
  shareUsageStats: boolean;
  clearClipboardAfterPaste: boolean;
  // Projects
  defaultProjectType: 'web' | 'api' | 'desktop';
  autoSaveProjects: boolean;
  openLastProjectOnLaunch: boolean;
  // Security
  twoFactorEnabled: boolean;
  requirePinOnLaunch: boolean;
  /** Lock the UI when the PC sleeps (PIN must already be set). */
  lockOnSleep: boolean;
  autoLockMinutes: number;
  sandboxAgent: boolean;
  /** Allow in-place workspace under ~/Desktop (still not all of C:). */
  allowDesktopFolderAccess: boolean;
  /** Allow in-place workspace under ~/Documents (still not all of C:). */
  allowDocumentsFolderAccess: boolean;
  /** Broad PC access for agent file ops under your user profile (with confirm). */
  allowFullPcAccess: boolean;
  /** Agent shell command policy. allowlist, auto-review, or run everything. */
  agentExecutionMode: 'allowlist' | 'auto_review' | 'run_all';
  /** Level-B agent tool loop (search → read → edit → run → verify). */
  agentLoopEnabled: boolean;
  /** Pref-gate for Project Workspace agent loop (off by default; not used in AIChat). */
  agentLoopInWorkspace: boolean;
  /** Max tool steps per Agent loop (4–60). */
  agentLoopMaxSteps: number;
  /** When true, create hops across multiple local/cloud models (slow). Default off. */
  multiModelCreate: boolean;
  /** After a green verify, auto `git commit` changed files (allowlist/confirm still apply). */
  agentLoopCommitOnSuccess: boolean;
  /** Chat-first shell. hide Code tab from sidebar (Code still works via handoff). */
  chatFirst: boolean;
  // Voice (Chat → Voice tab)
  /** Enable spoken conversation tab in Chat. */
  voiceChatEnabled: boolean;
  /** When true, pick the active system mic automatically. */
  voiceInputAuto: boolean;
  /** When true, pick the default playback device automatically. */
  voiceOutputAuto: boolean;
  /** Preferred microphone deviceId from enumerateDevices. */
  voiceInputDeviceId?: string;
  /** Preferred speaker/headphone deviceId for output test + routing when supported. */
  voiceOutputDeviceId?: string;
  /** speechSynthesis voiceURI for NOVA spoken replies. */
  voiceTtsVoiceUri?: string;
  // Updates
  autoCheckUpdates: boolean;
  notifyOnUpdate: boolean;
  launchOnStartup: boolean;
};

const DEFAULT_PREFS: LocalPrefs = {
  displayName: 'Guest',
  presenceStatus: 'online',
  defaultModelId: 'NOVA-auto',
  defaultCodeModelId: 'NOVA-auto',
  prefsVersion: 2,
  fontSizePx: 16,
  aiMode: 'automatic',
  keepFilesLocal: true,
  allowCloudSync: false,
  sendDiagnostics: true,
  preferredLanguage: 'TypeScript',
  projectLocation: '~/NOVA/Projects',
  density: 'comfortable',
  accent: 'sky',
  reduceMotion: false,
  orbBlurPx: 7,
  compactSidebar: false,
  sidebarWidth: 256,
  showStatusBar: true,
  autoFailover: true,
  askBeforeCloudFailover: false,
  allowNsfw: false,
  streamResponses: true,
  rememberContext: true,
  ggufTemperature: 0.55,
  ggufNPredict: 4096,
  huntInternetModels: true,
  autoInstallHuntModels: true,
  shareUsageStats: false,
  clearClipboardAfterPaste: false,
  defaultProjectType: 'web',
  autoSaveProjects: true,
  openLastProjectOnLaunch: true,
  twoFactorEnabled: false,
  requirePinOnLaunch: false,
  lockOnSleep: true,
  autoLockMinutes: 30,
  sandboxAgent: true,
  allowDesktopFolderAccess: false,
  // First-create needs a real NOVA Projects home without a Settings trip.
  allowDocumentsFolderAccess: true,
  allowFullPcAccess: false,
  agentExecutionMode: 'allowlist',
  agentLoopEnabled: false,
  agentLoopInWorkspace: false,
  agentLoopMaxSteps: 24,
  multiModelCreate: false,
  agentLoopCommitOnSuccess: false,
  chatFirst: true,
  voiceChatEnabled: false,
  voiceInputAuto: true,
  voiceOutputAuto: true,
  autoCheckUpdates: true,
  notifyOnUpdate: true,
  launchOnStartup: true,
};

export function getLocalPrefs(): LocalPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
      || localStorage.getItem(PREFS_KEY_LEGACY_NOVA);
    if (!raw) return { ...DEFAULT_PREFS };
    const merged = { ...DEFAULT_PREFS, ...JSON.parse(raw) as Partial<LocalPrefs> };
    if (typeof merged.voiceInputAuto !== 'boolean') merged.voiceInputAuto = true;
    if (typeof merged.voiceOutputAuto !== 'boolean') merged.voiceOutputAuto = true;
    if (typeof merged.ggufNPredict === 'number' && merged.ggufNPredict < 4096) {
      merged.ggufNPredict = 4096;
    }
    // Brand rename: legacy ark-* model ids → NOVA-*
    if (merged.defaultModelId === 'ark-auto') merged.defaultModelId = 'NOVA-auto';
    if (merged.defaultCodeModelId === 'ark-auto') merged.defaultCodeModelId = 'NOVA-auto';
    if (merged.defaultModelId === 'ark-image-core') merged.defaultModelId = 'NOVA-image-core';
    if (merged.defaultModelId === 'ark-video-core') merged.defaultModelId = 'NOVA-video-core';
    if (merged.defaultModelId === 'ark-core') merged.defaultModelId = 'NOVA-core';
    if (typeof merged.orbBlurPx !== 'number' || Number.isNaN(merged.orbBlurPx)) {
      merged.orbBlurPx = 7;
    } else {
      merged.orbBlurPx = Math.max(0, Math.min(24, Math.round(merged.orbBlurPx)));
    }
    // Schema migrate — never resurrect stale multiModelCreate: true from old installs.
    const ver = typeof merged.prefsVersion === 'number' ? merged.prefsVersion : 0;
    if (ver < 2) {
      merged.multiModelCreate = false;
      merged.prefsVersion = 2;
      if (!merged.activeChatId && merged.defaultModelId) merged.activeChatId = merged.defaultModelId;
      if (!merged.activeCoderId && merged.defaultCodeModelId) merged.activeCoderId = merged.defaultCodeModelId;
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      } catch { /* ignore */ }
    }
    return merged;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** True when a prefs blob is actually stored (not just in-memory defaults). */
export function hasStoredLocalPrefs(): boolean {
  try {
    return Boolean(localStorage.getItem(PREFS_KEY) || localStorage.getItem(PREFS_KEY_LEGACY_NOVA));
  } catch {
    return false;
  }
}

const GRANT_PREF_KEYS = [
  'allowDesktopFolderAccess',
  'allowDocumentsFolderAccess',
  'allowFullPcAccess',
  'agentExecutionMode',
] as const;

export function setLocalPrefs(patch: Partial<LocalPrefs>): LocalPrefs {
  const next = { ...getLocalPrefs(), ...patch } as LocalPrefs;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete (next as Record<string, unknown>)[key];
    }
  }
  try {
    // Do not invent grant keys from DEFAULT_PREFS — writing false would wipe Electron grants
    // on the next sync. Only persist grants when already stored or explicitly patched.
    let existing: Record<string, unknown> = {};
    try {
      const raw = localStorage.getItem(PREFS_KEY)
        || localStorage.getItem(PREFS_KEY_LEGACY_NOVA);
      if (raw) existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      existing = {};
    }
    const toStore = { ...next } as Record<string, unknown>;
    for (const key of GRANT_PREF_KEYS) {
      if (!(key in patch) && !(key in existing)) {
        delete toStore[key];
      }
    }
    localStorage.setItem(PREFS_KEY, JSON.stringify(toStore));
    // Drop the legacy rebrand key if it still exists.
    try {
      localStorage.removeItem(PREFS_KEY_LEGACY_NOVA);
    } catch {
      /* ignore */
    }
  } catch {
    /* quota / private mode — still return next so UI can update this session */
  }
  try {
    window.dispatchEvent(new CustomEvent('ark:prefs-changed', { detail: next }));
  } catch {
    /* ignore */
  }
  return next;
}

export type ProviderKeyMap = Record<string, string>;

/** In-memory cache. Desktop stores encrypted via OS; browser uses localStorage. */
let providerKeyCache: ProviderKeyMap | null = null;
let keysHydrated = false;
let keysEncrypted = false;

function readLegacyLocalKeys(): ProviderKeyMap {
  try {
    const raw = localStorage.getItem(API_KEYS_KEY)
      || localStorage.getItem(API_KEYS_KEY_LEGACY_NOVA);
    if (!raw) return {};
    return JSON.parse(raw) as ProviderKeyMap;
  } catch {
    return {};
  }
}

function writeLegacyLocalKeys(map: ProviderKeyMap) {
  if (Object.keys(map).length === 0) localStorage.removeItem(API_KEYS_KEY);
  else localStorage.setItem(API_KEYS_KEY, JSON.stringify(map));
}

async function persistProviderKeys(map: ProviderKeyMap) {
  if (window.arkDesktop?.secretsSave) {
    const res = await window.arkDesktop.secretsSave(map);
    if (res && res.ok === false) {
      throw new Error(res.error || 'Could not save API keys securely');
    }
    try {
      localStorage.removeItem(API_KEYS_KEY);
      localStorage.removeItem(API_KEYS_KEY_LEGACY_NOVA);
    } catch {
      /* ignore */
    }
    return;
  }
  // Desktop shell without vault = refuse (never write keys into localStorage).
  if (window.arkDesktop) {
    throw new Error('Secure key vault unavailable — API keys cannot be saved unsafely.');
  }
  writeLegacyLocalKeys(map);
  try {
    localStorage.removeItem(API_KEYS_KEY_LEGACY_NOVA);
  } catch {
    /* ignore */
  }
}

/** Load keys from OS-encrypted vault (or migrate legacy localStorage). Call once at app start. */
export async function hydrateProviderApiKeys(): Promise<{
  encrypted: boolean;
  count: number;
}> {
  if (window.arkDesktop?.secretsLoad) {
    const res = await window.arkDesktop.secretsLoad();
    const legacy = readLegacyLocalKeys();
    const merged: ProviderKeyMap = { ...legacy };
    const status = (res.ok && res.keyStatus) ? res.keyStatus : {};
    if (window.arkDesktop.secretsGetKey) {
      for (const [id, set] of Object.entries(status)) {
        if (!set) continue;
        try {
          const row = await window.arkDesktop.secretsGetKey(id);
          if (row.ok && row.key) merged[id] = row.key;
        } catch {
          /* skip broken key */
        }
      }
    }
    providerKeyCache = merged;
    keysEncrypted = Boolean(res.encrypted);
    keysHydrated = true;
    if (Object.keys(legacy).length > 0) {
      await persistProviderKeys(merged);
    }
    try {
      window.dispatchEvent(new Event('NOVA:provider-keys-changed'));
    } catch {
      /* ignore */
    }
    return { encrypted: keysEncrypted, count: Object.keys(merged).length };
  }

  providerKeyCache = readLegacyLocalKeys();
  keysEncrypted = false;
  keysHydrated = true;
  try {
    window.dispatchEvent(new Event('NOVA:provider-keys-changed'));
  } catch {
    /* ignore */
  }
  return { encrypted: false, count: Object.keys(providerKeyCache).length };
}

export function providerKeysAreEncrypted() {
  return keysEncrypted;
}

export function getProviderApiKeys(): ProviderKeyMap {
  if (providerKeyCache) return { ...providerKeyCache };
  if (!keysHydrated) {
    return readLegacyLocalKeys();
  }
  return {};
}

export async function setProviderApiKey(providerId: string, apiKey: string) {
  const map = getProviderApiKeys();
  if (apiKey.trim()) {
    map[providerId] = apiKey.trim();
  } else {
    delete map[providerId];
  }
  await persistProviderKeys(map);
  // Commit the in-memory value only after the durable write succeeds.
  // Otherwise a failed secure-storage write looks connected until restart.
  providerKeyCache = map;
  try {
    window.dispatchEvent(new Event('NOVA:provider-keys-changed'));
  } catch {
    /* ignore */
  }
  return map;
}

export async function setProviderApiKeys(map: ProviderKeyMap) {
  const clean: ProviderKeyMap = {};
  for (const [id, value] of Object.entries(map)) {
    if (typeof value === 'string' && value.trim()) clean[id] = value.trim();
  }
  await persistProviderKeys(clean);
  providerKeyCache = clean;
  try {
    window.dispatchEvent(new Event('NOVA:provider-keys-changed'));
  } catch {
    /* ignore */
  }
  return clean;
}

export function hasProviderApiKey(providerId: string) {
  return Boolean(getProviderApiKeys()[providerId]);
}

const PLUGIN_KEY_PREFIX = 'plugin:';

/** Store plugin tokens in the same OS-encrypted vault as provider keys. */
export function setPluginToken(pluginId: string, token: string) {
  return setProviderApiKey(`${PLUGIN_KEY_PREFIX}${pluginId}`, token);
}

export function getPluginToken(pluginId: string): string | undefined {
  const value = getProviderApiKeys()[`${PLUGIN_KEY_PREFIX}${pluginId}`];
  return value || undefined;
}

export function clearPluginToken(pluginId: string) {
  return setPluginToken(pluginId, '');
}

/** Changelog moved to src/lib/changelog.ts (canonical notes: docs/CHANGELOG.md). */
