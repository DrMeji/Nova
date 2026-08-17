/** Local sticky prefs for guest / offline UI (no cloud required). */

const PREFS_KEY = 'ark:local-prefs';
const API_KEYS_KEY = 'ark:provider-api-keys';

export type AiModePref = 'automatic' | 'local_only' | 'cloud_when_available' | 'local_fallback';
export type DensityPref = 'comfortable' | 'compact';
export type AccentPref = 'sky' | 'emerald' | 'amber' | 'rose';
export type UpdateChannel = 'stable' | 'beta';

export type LocalPrefs = {
  displayName: string;
  defaultModelId: string;
  /** Last model that successfully answered in Chat (for picker restore). */
  lastChatModelId?: string;
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
  compactSidebar: boolean;
  showStatusBar: boolean;
  // AI
  autoFailover: boolean;
  streamResponses: boolean;
  rememberContext: boolean;
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
  autoLockMinutes: number;
  sandboxAgent: boolean;
  // Updates
  updateChannel: UpdateChannel;
  autoCheckUpdates: boolean;
  notifyOnUpdate: boolean;
  launchOnStartup: boolean;
};

const DEFAULT_PREFS: LocalPrefs = {
  displayName: 'Guest',
  defaultModelId: 'ark-auto',
  aiMode: 'automatic',
  keepFilesLocal: true,
  allowCloudSync: false,
  sendDiagnostics: true,
  preferredLanguage: 'TypeScript',
  projectLocation: '~/ARK/Projects',
  density: 'comfortable',
  accent: 'sky',
  reduceMotion: false,
  compactSidebar: false,
  showStatusBar: true,
  autoFailover: true,
  streamResponses: true,
  rememberContext: true,
  shareUsageStats: false,
  clearClipboardAfterPaste: false,
  defaultProjectType: 'web',
  autoSaveProjects: true,
  openLastProjectOnLaunch: true,
  twoFactorEnabled: false,
  requirePinOnLaunch: false,
  autoLockMinutes: 30,
  sandboxAgent: true,
  updateChannel: 'stable',
  autoCheckUpdates: true,
  notifyOnUpdate: true,
  launchOnStartup: true,
};

export function getLocalPrefs(): LocalPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) as Partial<LocalPrefs> };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function setLocalPrefs(patch: Partial<LocalPrefs>): LocalPrefs {
  const next = { ...getLocalPrefs(), ...patch } as LocalPrefs;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete (next as Record<string, unknown>)[key];
    }
  }
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  try {
    window.dispatchEvent(new CustomEvent('ark:prefs-changed', { detail: next }));
  } catch {
    /* ignore */
  }
  return next;
}

export type ProviderKeyMap = Record<string, string>;

/** In-memory cache — Desktop stores encrypted via OS; browser uses localStorage. */
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
  if (window.arkDesktop?.secretsSave) {
    await window.arkDesktop.secretsSave(map);
    try {
      localStorage.removeItem(API_KEYS_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  writeLegacyLocalKeys(map);
}

/** Load keys from OS-encrypted vault (or migrate legacy localStorage). Call once at app start. */
export async function hydrateProviderApiKeys(): Promise<{
  encrypted: boolean;
  count: number;
}> {
  if (window.arkDesktop?.secretsLoad) {
    const res = await window.arkDesktop.secretsLoad();
    const fromVault = (res.ok && res.keys) ? res.keys : {};
    const legacy = readLegacyLocalKeys();
    const merged = { ...legacy, ...fromVault };
    providerKeyCache = merged;
    keysEncrypted = Boolean(res.encrypted);
    keysHydrated = true;
    if (Object.keys(legacy).length > 0) {
      await persistProviderKeys(merged);
    }
    return { encrypted: keysEncrypted, count: Object.keys(merged).length };
  }

  providerKeyCache = readLegacyLocalKeys();
  keysEncrypted = false;
  keysHydrated = true;
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

export function setProviderApiKey(providerId: string, apiKey: string) {
  const map = getProviderApiKeys();
  if (apiKey.trim()) {
    map[providerId] = apiKey.trim();
  } else {
    delete map[providerId];
  }
  providerKeyCache = map;
  void persistProviderKeys(map);
  return map;
}

export function setProviderApiKeys(map: ProviderKeyMap) {
  const clean: ProviderKeyMap = {};
  for (const [id, value] of Object.entries(map)) {
    if (typeof value === 'string' && value.trim()) clean[id] = value.trim();
  }
  providerKeyCache = clean;
  void persistProviderKeys(clean);
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

/** App changelog shown in Settings → Updates (UI shows only the installed version). */
export const ARK_CHANGELOG = [
  {
    version: '0.1.41',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Build switch + cleaner chat answers',
    notes: [
      'Build button in chat and sidebar opens the VS Code–style workspace',
      'New topics (weather → build an app) no longer paste the previous answer',
      'Plugins stay under Plugins; Build is its own path',
    ],
  },
  {
    version: '0.1.40',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Updating splash instead of a terminal',
    notes: [
      'Install shows a small Updating ARK window (logo, percent, progress bar)',
      'No more command-prompt window during updates',
      'Hidden backup installer path if the splash cannot start',
    ],
  },
  {
    version: '0.1.39',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Chat queue, stop, and reply continuity',
    notes: [
      'Stop clears as soon as a reply finishes (including when local streaming ends early)',
      'Queued prompts show a banner and auto-send when the current reply completes',
      'Follow-ups no longer paste the previous story into the next answer',
    ],
  },
  {
    version: '0.1.38',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Updater install actually finishes',
    notes: [
      'Fixed blank “Updating ARK” hang caused by killing Electron helper processes',
      'Install now runs via a standalone apply script after download (no stuck black window)',
      'Single download progress in Settings — no second overlay',
      'Installer is staged to a stable temp path before ARK exits',
    ],
  },
  {
    version: '0.1.37',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Settings polish and chat continuity',
    notes: [
      'Save lives in the Settings nav — no black sticky bar',
      'Short Settings tabs no longer phantom-scroll; Updates drops GitHub URL and signing/reports',
      'Locked Beta tab reserved for advanced tooling',
      'Follow-up messages stay in the same Recent chat; queue/stop clear correctly',
      'Local replies no longer echo “> hello” or User:/ARK: transcripts',
    ],
  },
  {
    version: '0.1.36',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Updater actually closes and installs',
    notes: [
      'After download, ARK force-exits so the Updating window is not stuck waiting',
      'No second “Closing…” overlay — download in-app, then only the Updating splash',
      'Updater force-kills a stuck parent process and continues install',
    ],
  },
  {
    version: '0.1.35',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Chat queue, stop, setup, and Settings polish',
    notes: [
      'Connect setup lists all free keys without scrolling',
      'Chat only queues while a reply is in progress; stop clears when done',
      'Recent chats no longer open to a blank Explore screen',
      'Settings Save confirmation; What’s new shows only this version',
      'Suggested plugins include plus buttons and two more cards',
    ],
  },
  {
    version: '0.1.34',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'In-app updater handoff fix',
    notes: [
      'Updating ARK window can install while the main app closes (single-instance lock fix)',
      'Updater waits until the splash is ready before quitting the old process',
    ],
  },
  {
    version: '0.1.33',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'Cleaner chat, setup, and Free sources',
    notes: [
      'Local chat no longer dumps llama.cpp banners / help into the bubble',
      'Model picker stays on Auto / cloud picks (no silent snap back to Qwen)',
      'Type and queue the next message while a reply is generating',
      'Recent chats load without blanking; Free sources match Providers styling',
      'Removed confusing Connect setup paragraph under the step tabs',
    ],
  },
  {
    version: '0.1.31',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'Fix black screen and duplicate tray icons',
    notes: [
      'Packaged UI loads correctly (no blank black window from file:// module CORS)',
      'Single-instance lock — reopening focuses ARK instead of spawning more trays',
      'Tray shows the ARK icon with tooltip “ARK” (not brain port text)',
    ],
  },
  {
    version: '0.1.30',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'Fix installer launch crash',
    notes: [
      'Fix startup crash (invalid model alias syntax in brain API)',
      'Installer now launches ARK after Setup finishes',
    ],
  },
  {
    version: '0.1.29',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'FLUX local + finishing upgrade list',
    notes: [
      'FLUX.1 Schnell (Local) installable from Local AI (~13 GB sd.cpp bundle)',
      'Clearer Authenticode + OAuth setup links in Settings',
      'Stronger HF video routes; update feed remains DrMeji/Ark only',
    ],
  },
  {
    version: '0.1.28',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'One public repo · SDXL Turbo local',
    notes: [
      'Installers and in-app updates use DrMeji/Ark only (ark-dist retired)',
      'SDXL Turbo (Local) downloadable from Local AI alongside SD 1.5',
      'OAuth setup guide: docs/oauth-setup.md; Authenticode via CSC_* on Ark CI',
    ],
  },
  {
    version: '0.1.27',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'Local image + real MP4 + brain polish',
    notes: [
      'On-device Stable Diffusion 1.5 via ARK Engine (sd.cpp) — install from Local AI',
      'Video: stronger free MP4 hosts + Ken Burns real MP4 when generative video is offline',
      'Download cancel/disk checks, chat Ready/Installing/Cloud picker, tray keep-alive, Lindsay aliases',
      'Live plugin depth (GitHub issues, Linear close, Discord #channel, Drive upload); Creations delete',
      'CI uploads latest.yml/blockmap; optional CSC_* secrets for Authenticode',
    ],
  },
  {
    version: '0.1.26',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'First-run setup + Recent archive/delete',
    notes: [
      'Fresh installs always run Hardware → Models → Connect after sign-in or sign-up (once per install)',
      'Recent chats: Archive to History, or Delete forever with confirmation (wipes local data)',
      'Phase 1 honesty: Discover vs Download, Chat capacity CTAs, labeled image/video previews',
    ],
  },
  {
    version: '0.1.25',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'Accurate hardware + ARK as external brain',
    notes: [
      'One PC scan saved everywhere — Models / Local AI / onboarding show real specs and fit lists',
      'Brain API 0.4: Ollama-shaped /api/* + OpenAI chat completions so Lindsay (and any app) can use ARK instead of Ollama',
      'More Engine downloads (Coder 14B/32B, DeepSeek, StarCoder, Llama 8B, …), multi-download queue + disk check, Import/drop GGUF',
      'Chat failover “Switched to…” chip + capacity meter; Calendar create + Notion update; video catalog honesty',
    ],
  },
  {
    version: '0.1.24',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'Tester-ready first chat path',
    notes: [
      'Honest chat thinking state; Install local brain CTA beside free keys',
      'Onboarding no longer pretends a failed brain install succeeded; Local AI one-click recommended install',
      'Video motion-still marked as preview; Settings → Testers how-to + feedback link',
    ],
  },
  {
    version: '0.1.23',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'Real cloud SSE + Drive/Calendar/Figma',
    notes: [
      'OpenAI-compatible cloud providers stream true SSE into chat',
      'Google Drive + Calendar live; Figma file comments',
      'Clearer SmartScreen / Authenticode reputation guidance',
    ],
  },
  {
    version: '0.1.22',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'Deeper plugins, stop streaming, more free keys',
    notes: [
      'Slack/Discord post, Gmail confirm-send, Notion create page, Vercel redeploy, GitHub comments',
      'Stop button + GGUF prompt-echo strip; cloud replies reveal progressively',
      'Cerebras + SambaNova free-key routes; Lindsay brain API cookbook; OAuth/signing setup guides',
    ],
  },
  {
    version: '0.1.21',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'Streaming local brain + free-key wizard',
    notes: [
      'Local GGUF streams tokens live into chat',
      'Connect free key wizard from capacity CTA; OAuth client ids in Settings',
      'Linear write, Slack search, Figma file open; local update failure reports',
    ],
  },
  {
    version: '0.1.20',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'More free capacity plugged in',
    notes: [
      'Hugging Face + NVIDIA NIM + Together / Fireworks / DeepSeek / Mistral in ARK Router',
      'Video tries Pollinations + HF MP4 hosts; browser-assisted plugin connect; permission checks',
      'electron-updater delta path when latest.yml is published; code-signing via CSC_LINK',
    ],
  },
  {
    version: '0.1.19',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'Update flow verification',
    notes: [
      'Check → Update from 0.1.18 to confirm download → splash → reopen',
    ],
  },
  {
    version: '0.1.18',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'Fix update splash not opening',
    notes: [
      'Updater breakaway launch so the Updating window actually appears',
      'Download finishes in ARK first, then splash installs and reopens',
    ],
  },
  {
    version: '0.1.17',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'Clean ARK splash update test',
    notes: [
      'Check → Update from 0.1.16: black ARK splash, no PowerShell taskbar entry',
    ],
  },
  {
    version: '0.1.16',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'ARK update splash + custom models folder',
    notes: [
      'Update splash is a real ARK window (no PowerShell in the taskbar)',
      'Local AI → Advanced: change or reset the models folder path',
    ],
  },
  {
    version: '0.1.15',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'Update polish verification',
    notes: [
      'Use Check → Update from 0.1.14 to verify the black splash with no terminals',
    ],
  },
  {
    version: '0.1.14',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'Cleaner update splash, no terminals',
    notes: [
      'Updating box is larger with a dark black background',
      'No cmd/PowerShell windows during update',
      'New Chat footer order: capacity, Add plugins, Open a project',
    ],
  },
  {
    version: '0.1.13',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'New Chat composer cleanup',
    notes: [
      'Auto model picker sits inside the chat bar next to the mic',
      'Add plugins, capacity, and Open a project sit under the composer',
      'Removed What can ARK do capability tiles',
    ],
  },
  {
    version: '0.1.12',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'Discord-style updates that actually install',
    notes: [
      'Update helper survives app quit (was dying before install finished)',
      'Small Updating box downloads + installs, then reopens ARK',
      'No fullscreen download overlay',
    ],
  },
  {
    version: '0.1.11',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'Discord-style update box + faster reopen',
    notes: [
      'Updating splash is a small centered box (not fullscreen)',
      'ARK relaunches as soon as install finishes',
    ],
  },
  {
    version: '0.1.10',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'Separate Updating splash window',
    notes: [
      'Download in ARK, then a small logo + percent window finishes the update',
      'Main app closes during install; ARK reopens when done',
      'No terminals during update',
    ],
  },
  {
    version: '0.1.9',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'Clean silent updates',
    notes: [
      'Single Updating screen with logo + percent — no terminals',
      'Silent install helper (no ping / cmd windows)',
      'Local AI Speed tab grayed out for now',
    ],
  },
  {
    version: '0.1.8',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'Reliable update relaunch + stay signed in',
    notes: [
      'Update helper survives app quit and reopens ARK automatically',
      'Auth session stored in app data so upgrades keep you signed in',
      'Launch ARK when Windows starts (Settings → Updates)',
      'Removed page subtitle blurbs on Models, Local AI, Plugins',
    ],
  },
  {
    version: '0.1.7',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'Update flow that keeps your session',
    notes: [
      'Upgrades no longer wipe sign-in, setup, or models',
      'Clear download → install overlay, then auto-reopen ARK',
      'Lands on New Chat still signed in',
    ],
  },
  {
    version: '0.1.6',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'Real project coding loop',
    notes: [
      'Project chat calls ARK Router and writes real files',
      'Explorer and editor update from model file blocks',
      'Honest routing status — no fake install steps',
    ],
  },
  {
    version: '0.1.5',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'In-app updates + cream light',
    notes: [
      'Check → Download updates inside ARK (no GitHub browser hop)',
      'Removed speed step from first-run setup',
      'Light appearance uses soft cream instead of pure white',
      'Uninstall wipes ARK models and app data',
    ],
  },
  {
    version: '0.1.4',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'Auth, speed, and chrome',
    notes: [
      'Forgot password + username on sign up',
      'Faster/more accurate speed test (multi-sample + upload)',
      'Sidebar top spacing aligned; display name syncs to sidebar',
      'Beta settings category (disabled for now)',
    ],
  },
  {
    version: '0.1.2',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'First-run + chrome',
    notes: [
      'Sidebar panel chrome and logo mark',
      'Fixed Guest / Settings clipped at bottom',
      'Packaged installs always run first-run setup once',
    ],
  },
  {
    version: '0.1.1',
    channel: 'stable' as const,
    date: 'Aug 15, 2026',
    title: 'App icon',
    notes: [
      'White robot app icon on Setup and ARK.exe',
      'Proper Windows .ico for installer embedding',
    ],
  },
  {
    version: '0.1.0',
    channel: 'stable' as const,
    date: 'Aug 14, 2026',
    title: 'Studio shell',
    notes: [
      'Project workspace with Explorer, Chat, Code, and Preview',
      'Expanding chat composer with image attach and Changes +/-',
      'Local AI start/stop, model download, and switch flow',
      'Cloud provider health board and local API key connect',
      'Sticky settings prefs saved on this device',
      'History items open into chat or projects',
      'Browser chip opens localhost in your system browser',
      'Explorer new file and folder actions',
    ],
  },
  {
    version: '0.0.9',
    channel: 'beta' as const,
    date: 'Aug 13, 2026',
    title: 'First run optimize',
    notes: [
      'Auth screen with Bypass + Setup and Bypass to App',
      'Speed test and hardware recommendation onboarding',
      'Models For your PC / Local / Cloud tabs',
    ],
  },
  {
    version: '0.0.8',
    channel: 'stable' as const,
    date: 'Aug 12, 2026',
    title: 'Navigation and history',
    notes: [
      'History, Projects, Plugins sticky headers',
      'Capability cards on New Chat home',
      'Collapsed sidebar profile and settings fix',
    ],
  },
];
