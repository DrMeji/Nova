/** Local sticky prefs for guest / offline UI (no cloud required). */

const PREFS_KEY = 'NOVA:local-prefs';
const API_KEYS_KEY = 'NOVA:provider-api-keys';
const PREFS_CHANGED_EVENT = 'nova:prefs-changed';

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
  /** Design / layout-contract brain (ensemble Design hop). */
  activeDesignId?: string;
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
  /**
   * Codex-style approval policy for agent shell/tools.
   * on-request = confirm risky; auto = workspace auto; never = no confirms (dangerous).
   */
  approvalPolicy: 'on-request' | 'never' | 'auto';
  /** Codex-style sandbox mode for agent writes/commands. */
  sandboxMode: 'read-only' | 'workspace-write' | 'full-access';
  /** When true, networked agent commands need allowlist/confirm. */
  networkDenyByDefault: boolean;
  /** Hosts allowed when networkDenyByDefault is on. */
  networkAllowlist: string[];
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
  /**
   * Create craft via Nova tool loop. Default **on** (coding foundation) —
   * scaffold then agent loop owns greenfield builds; invent/gates are demoted.
   */
  agentLoopOnCreate: boolean;
  /** Edit follow-ups use the tool loop when agentLoopEnabled is on (default on). */
  agentLoopOnEdit: boolean;
  /**
   * When true, create shows a Plan card and waits for “build it” before scaffolding.
   * Default off so first-time builds stay one-shot; power users can enable.
   */
  planApproveGate: boolean;
  /**
   * @deprecated Removed — Single Brain Create only. Kept for prefs migrate; always treated as false.
   */
  multiModelCreate: boolean;
  /**
   * When true (default), multimodal / ensemble Auto is parked: one locked model does
   * the job; create multi-hop seats stay in code but never activate. Set false later
   * to re-enable cooperative ensemble Auto without deleting that code.
   */
  ensembleAutoParked: boolean;
  /**
   * Share GPU with games / desktop: llama uses CPU (-ngl 0), smaller ctx, fewer threads.
   * Default on so create does not collapse FPS / ping on a single gaming GPU.
   */
  shareGpuMode: boolean;
  /**
   * After craft, optionally run one CSS style hop on the design brain (uigen).
   * Still sequential (swap once) — never concurrent multi-GGUF.
   */
  specialtyStyleHop: boolean;
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
  prefsVersion: 17,
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
  sidebarWidth: 232,
  showStatusBar: true,
  autoFailover: true,
  askBeforeCloudFailover: false,
  allowNsfw: false,
  streamResponses: true,
  rememberContext: true,
  ggufTemperature: 0.55,
  ggufNPredict: 6144,
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
  approvalPolicy: 'on-request',
  sandboxMode: 'workspace-write',
  networkDenyByDefault: true,
  networkAllowlist: ['registry.npmjs.org', 'nodejs.org', 'github.com', 'raw.githubusercontent.com'],
  allowDesktopFolderAccess: false,
  // First-create needs a real NOVA Projects home without a Settings trip.
  allowDocumentsFolderAccess: true,
  allowFullPcAccess: false,
  agentExecutionMode: 'allowlist',
  agentLoopEnabled: true,
  agentLoopInWorkspace: false,
  agentLoopMaxSteps: 32,
  agentLoopOnCreate: true,
  agentLoopOnEdit: true,
  planApproveGate: false,
  multiModelCreate: false,
  ensembleAutoParked: true,
  shareGpuMode: true,
  specialtyStyleHop: true,
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
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const merged = { ...DEFAULT_PREFS, ...JSON.parse(raw) as Partial<LocalPrefs> };
    if (typeof merged.voiceInputAuto !== 'boolean') merged.voiceInputAuto = true;
    if (typeof merged.voiceOutputAuto !== 'boolean') merged.voiceOutputAuto = true;
    if (typeof merged.ggufNPredict === 'number' && merged.ggufNPredict < 6144) {
      merged.ggufNPredict = 6144;
    }
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
    // v3: Nova create/edit tool loop defaults (free, no paywall).
    if ((merged.prefsVersion || 0) < 3) {
      if (typeof merged.agentLoopOnCreate !== 'boolean') merged.agentLoopOnCreate = false;
      if (typeof merged.agentLoopOnEdit !== 'boolean') merged.agentLoopOnEdit = true;
      if (typeof merged.planApproveGate !== 'boolean') merged.planApproveGate = false;
      if (typeof merged.agentLoopEnabled !== 'boolean') merged.agentLoopEnabled = true;
      merged.prefsVersion = 3;
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      } catch { /* ignore */ }
    }
    // v4: createV2 — agent loop OFF for create; single-coder path is default.
    if ((merged.prefsVersion || 0) < 4) {
      merged.agentLoopOnCreate = false;
      merged.multiModelCreate = false;
      merged.prefsVersion = 4;
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      } catch { /* ignore */ }
    }
    // v5: tighter default chat type (14px) so more messages fit in view.
    if ((merged.prefsVersion || 0) < 5) {
      merged.fontSizePx = 14;
      merged.prefsVersion = 5;
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      } catch { /* ignore */ }
    }
    // v6: new-install default is 16px again. Do not overwrite an existing user’s choice.
    if ((merged.prefsVersion || 0) < 6) {
      merged.prefsVersion = 6;
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      } catch { /* ignore */ }
    }
    // v7: create relay on — Plan/Design/Copy seats hand off to Craft (no critic fights).
    if ((merged.prefsVersion || 0) < 7) {
      merged.multiModelCreate = true;
      merged.agentLoopOnCreate = false;
      merged.prefsVersion = 7;
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      } catch { /* ignore */ }
    }
    // v8: restore compact chrome (narrow rail + denser composer) after relaunch drift.
    if ((merged.prefsVersion || 0) < 8) {
      merged.density = 'compact';
      merged.compactSidebar = true;
      if (typeof merged.fontSizePx !== 'number' || merged.fontSizePx >= 16) {
        merged.fontSizePx = 15;
      }
      merged.prefsVersion = 8;
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      } catch { /* ignore */ }
    }
    // v9: (superseded) briefly forced comfortable/16px — felt zoomed-out / sparse.
    if ((merged.prefsVersion || 0) < 9) {
      merged.prefsVersion = 9;
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      } catch { /* ignore */ }
    }
    // v10: (superseded) compact+14px made the rail/chat feel cramped after relaunch.
    if ((merged.prefsVersion || 0) < 10) {
      merged.prefsVersion = 10;
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      } catch { /* ignore */ }
    }
    // v11: LOCK roomy chrome — comfortable + 16px. Always re-assert so nothing can shrink it.
    if ((merged.prefsVersion || 0) < 11) {
      merged.prefsVersion = 11;
    }
    // v12: Single Brain Create — kill Multimodal relay; agent edit loop off by default.
    if ((merged.prefsVersion || 0) < 12) {
      merged.multiModelCreate = false;
      merged.agentLoopOnCreate = false;
      merged.agentLoopOnEdit = false;
      merged.prefsVersion = 12;
    }
    // v13: permanent chrome size lock — comfortable + 16px root. Stops density/font thrash
    // that felt like the whole UI was zooming in/out between launches.
    if ((merged.prefsVersion || 0) < 13) {
      merged.density = 'comfortable';
      merged.fontSizePx = 16;
      merged.compactSidebar = false;
      merged.prefsVersion = 13;
    }
    // v14: park multimodal ensemble Auto (keep code; default one-seat).
    if ((merged.prefsVersion || 0) < 14) {
      if (typeof merged.ensembleAutoParked !== 'boolean') merged.ensembleAutoParked = true;
      merged.multiModelCreate = false;
      merged.prefsVersion = 14;
    }
    // v15: coding foundation — agent tool loop owns edit + create (not invent dumps).
    if ((merged.prefsVersion || 0) < 15) {
      merged.agentLoopOnEdit = true;
      merged.agentLoopOnCreate = true;
      if (typeof merged.agentLoopEnabled !== 'boolean') merged.agentLoopEnabled = true;
      merged.prefsVersion = 15;
    }
    // v16: share GPU + specialty style hop defaults (containment + sequential design seat).
    if ((merged.prefsVersion || 0) < 16) {
      if (typeof merged.shareGpuMode !== 'boolean') merged.shareGpuMode = true;
      if (typeof merged.specialtyStyleHop !== 'boolean') merged.specialtyStyleHop = true;
      merged.prefsVersion = 16;
    }
    // v17: harness P0 approval_policy + sandbox + network deny-by-default.
    if ((merged.prefsVersion || 0) < 17) {
      if (!merged.approvalPolicy) merged.approvalPolicy = 'on-request';
      if (!merged.sandboxMode) merged.sandboxMode = 'workspace-write';
      if (typeof merged.networkDenyByDefault !== 'boolean') merged.networkDenyByDefault = true;
      if (!Array.isArray(merged.networkAllowlist) || !merged.networkAllowlist.length) {
        merged.networkAllowlist = ['registry.npmjs.org', 'nodejs.org', 'github.com', 'raw.githubusercontent.com'];
      }
      merged.prefsVersion = 17;
    }
    // Dead feature — never honor stale true from older blobs after v12.
    merged.multiModelCreate = false;
    if (typeof merged.ensembleAutoParked !== 'boolean') merged.ensembleAutoParked = true;
    if (typeof merged.shareGpuMode !== 'boolean') merged.shareGpuMode = true;
    if (typeof merged.specialtyStyleHop !== 'boolean') merged.specialtyStyleHop = true;
    // Density / font: clamp only — do not re-lock every read after v13 migrate.
    if (typeof merged.fontSizePx !== 'number' || Number.isNaN(merged.fontSizePx)) {
      merged.fontSizePx = 16;
    } else {
      merged.fontSizePx = Math.max(12, Math.min(22, Math.round(merged.fontSizePx)));
    }
    if (merged.density !== 'compact' && merged.density !== 'comfortable') {
      merged.density = 'comfortable';
    }
    // Only persist when we actually migrated this read (avoid rewrite thrash).
    const shouldPersist = (merged.prefsVersion || 0) >= 16;
    if (shouldPersist) {
      try {
        const prev = raw ? JSON.parse(raw) as Partial<LocalPrefs> : null;
        const changed = !prev
          || prev.prefsVersion !== merged.prefsVersion
          || prev.fontSizePx !== merged.fontSizePx
          || prev.density !== merged.density
          || prev.multiModelCreate === true
          || prev.ensembleAutoParked !== merged.ensembleAutoParked
          || prev.shareGpuMode !== merged.shareGpuMode
          || prev.specialtyStyleHop !== merged.specialtyStyleHop
          || prev.compactSidebar !== merged.compactSidebar
          || prev.agentLoopOnEdit !== merged.agentLoopOnEdit
          || prev.agentLoopOnCreate !== merged.agentLoopOnCreate;
        if (changed) {
          localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
        }
      } catch {
        try {
          localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
        } catch { /* ignore */ }
      }
    }
    return merged;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** True when a prefs blob is actually stored (not just in-memory defaults). */
export function hasStoredLocalPrefs(): boolean {
  try {
    return Boolean(localStorage.getItem(PREFS_KEY));
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

/** Multimodal / ensemble Auto is parked (default). Code stays; multi-seat hops stay off. */
export function isEnsembleAutoParked(): boolean {
  try {
    return getLocalPrefs().ensembleAutoParked !== false;
  } catch {
    return true;
  }
}

export function setLocalPrefs(patch: Partial<LocalPrefs>): LocalPrefs {
  const next = { ...getLocalPrefs(), ...patch } as LocalPrefs;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete (next as Record<string, unknown>)[key];
    }
  }
  // Keep rail open by default; density/font honor Settings (no silent re-lock).
  if (typeof next.compactSidebar !== 'boolean') next.compactSidebar = false;
  if (typeof next.fontSizePx === 'number' && !Number.isNaN(next.fontSizePx)) {
    next.fontSizePx = Math.max(12, Math.min(22, Math.round(next.fontSizePx)));
  }
  next.prefsVersion = Math.max(16, Number(next.prefsVersion) || 0);
  next.multiModelCreate = false;
  if (typeof next.ensembleAutoParked !== 'boolean') next.ensembleAutoParked = true;
  if (typeof next.shareGpuMode !== 'boolean') next.shareGpuMode = true;
  if (typeof next.specialtyStyleHop !== 'boolean') next.specialtyStyleHop = true;
  // Coding foundation — agent loop owns create + edit unless explicitly cleared.
  if (typeof next.agentLoopOnCreate !== 'boolean') next.agentLoopOnCreate = true;
  if (typeof next.agentLoopOnEdit !== 'boolean') next.agentLoopOnEdit = true;
  try {
    // Do not invent grant keys from DEFAULT_PREFS — writing false would wipe Electron grants
    // on the next sync. Only persist grants when already stored or explicitly patched.
    let existing: Record<string, unknown> = {};
    try {
      const raw = localStorage.getItem(PREFS_KEY);
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
  } catch {
    /* quota / private mode — still return next so UI can update this session */
  }
  try {
    window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT, { detail: next }));
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
    const raw = localStorage.getItem(API_KEYS_KEY);
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
  if (window.novaDesktop?.secretsSave) {
    const res = await window.novaDesktop.secretsSave(map);
    if (res && res.ok === false) {
      throw new Error(res.error || 'Could not save API keys securely');
    }
    try {
      localStorage.removeItem(API_KEYS_KEY);
          } catch {
      /* ignore */
    }
    return;
  }
  // Desktop shell without vault = refuse (never write keys into localStorage).
  if (window.novaDesktop) {
    throw new Error('Secure key vault unavailable — API keys cannot be saved unsafely.');
  }
  writeLegacyLocalKeys(map);
}

/** Load keys from OS-encrypted vault (or migrate legacy localStorage). Call once at app start. */
export async function hydrateProviderApiKeys(): Promise<{
  encrypted: boolean;
  count: number;
}> {
  if (window.novaDesktop?.secretsLoad) {
    const res = await window.novaDesktop.secretsLoad();
    const legacy = readLegacyLocalKeys();
    const merged: ProviderKeyMap = { ...legacy };
    const status = (res.ok && res.keyStatus) ? res.keyStatus : {};
    if (window.novaDesktop.secretsGetKey) {
      for (const [id, set] of Object.entries(status)) {
        if (!set) continue;
        try {
          const row = await window.novaDesktop.secretsGetKey(id);
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
