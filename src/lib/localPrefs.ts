/** Local sticky prefs for guest / offline UI (no cloud required). */

const PREFS_KEY = 'ark:local-prefs';
const API_KEYS_KEY = 'ark:provider-api-keys';

export type AiModePref = 'automatic' | 'local_only' | 'cloud_when_available' | 'local_fallback';
export type DensityPref = 'comfortable' | 'compact';
export type AccentPref = 'sky' | 'emerald' | 'amber' | 'rose';
export type UpdateChannel = 'stable' | 'beta';

export type LocalPrefs = {
  displayName: string;
  avatarDataUrl?: string;
  defaultModelId: string;
  /** Last model that successfully answered in Chat (for picker restore). */
  lastChatModelId?: string;
  /** Default brain for Code workspace when Auto is not selected. */
  defaultCodeModelId?: string;
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
  compactSidebar: boolean;
  /** Expanded sidebar width in px (remembered per this PC). */
  sidebarWidth: number;
  showStatusBar: boolean;
  // AI
  autoFailover: boolean;
  /** Ask before a local request is sent to a cloud provider during failover. */
  askBeforeCloudFailover: boolean;
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
  // Updates
  updateChannel: UpdateChannel;
  autoCheckUpdates: boolean;
  notifyOnUpdate: boolean;
  launchOnStartup: boolean;
};

const DEFAULT_PREFS: LocalPrefs = {
  displayName: 'Guest',
  defaultModelId: 'ark-auto',
  defaultCodeModelId: 'ark-auto',
  fontSizePx: 16,
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
  sidebarWidth: 256,
  showStatusBar: true,
  autoFailover: true,
  askBeforeCloudFailover: false,
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
  updateChannel: 'stable',
  autoCheckUpdates: true,
  notifyOnUpdate: true,
  launchOnStartup: true,
};

export function getLocalPrefs(): LocalPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const merged = { ...DEFAULT_PREFS, ...JSON.parse(raw) as Partial<LocalPrefs> };
    if (typeof merged.ggufNPredict === 'number' && merged.ggufNPredict < 4096) {
      merged.ggufNPredict = 4096;
    }
    return merged;
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
    const res = await window.arkDesktop.secretsSave(map);
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
  writeLegacyLocalKeys(map);
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
      window.dispatchEvent(new Event('ark:provider-keys-changed'));
    } catch {
      /* ignore */
    }
    return { encrypted: keysEncrypted, count: Object.keys(merged).length };
  }

  providerKeyCache = readLegacyLocalKeys();
  keysEncrypted = false;
  keysHydrated = true;
  try {
    window.dispatchEvent(new Event('ark:provider-keys-changed'));
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
  providerKeyCache = map;
  await persistProviderKeys(map);
  try {
    window.dispatchEvent(new Event('ark:provider-keys-changed'));
  } catch {
    /* ignore */
  }
  return map;
}

export function setProviderApiKeys(map: ProviderKeyMap) {
  const clean: ProviderKeyMap = {};
  for (const [id, value] of Object.entries(map)) {
    if (typeof value === 'string' && value.trim()) clean[id] = value.trim();
  }
  providerKeyCache = clean;
  void persistProviderKeys(clean);
  try {
    window.dispatchEvent(new Event('ark:provider-keys-changed'));
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

/** App changelog shown in Settings → Updates (UI shows only the installed version). */
export const ARK_CHANGELOG = [
  {
    version: '0.1.96',
    channel: 'stable' as const,
    date: 'Aug 19, 2026',
    title: 'ChatGPT-style image generating UI + reliable reveal',
    notes: [
      'Creating image card with moving pixel animation and stages: Creating image → Sketching it out → Almost done → Wrapping it up',
      'Fixed invisible generating card (width collapse) and empty assistant bubble after failed/slow generates',
      'Image fetch budget capped ~28s so it finishes instead of hanging past a minute',
      'Switching Chat/Image tabs mid-generate returns you to the in-progress thread; Stop stays available',
      'Finished images show clean (no outer frame) with copy/download',
      'Update via Settings → Updates → Check → Download when this build is published',
    ],
  },
  {
    version: '0.1.95',
    channel: 'stable' as const,
    date: 'Aug 19, 2026',
    title: 'Quality-first image & video generation',
    notes: [
      'Image mode no longer races fast turbo models — ARK tries flux-realism, flux, then openjourney sequentially (up to ~30s)',
      'Product prompts (iPhone, devices) get hero-shot hints: sharp studio render, no hands unless you ask',
      'Live generation animation with elapsed seconds and progress bar while images/videos render',
      'Video tab: pick 10 / 20 / 30 second clip length before send (max 30s)',
      'Update via Settings → Updates → Check → Download when this build is published',
    ],
  },
  {
    version: '0.1.94',
    channel: 'stable' as const,
    date: 'Aug 19, 2026',
    title: 'Real image generation pass + silent update indicator',
    notes: [
      'Image mode tries local SD, Hugging Face FLUX, then Pollinations (flux / realism / turbo) with longer waits',
      'Gradient SVG placeholders no longer masquerade as finished images when hosts fail',
      'Bottom “Checking for updates” strip removed; green download button appears near Search when an update exists',
      'Update via Settings → Updates → Check → Download when this build is published',
    ],
  },
  {
    version: '0.1.93',
    channel: 'stable' as const,
    date: 'Aug 19, 2026',
    title: 'Chat reply polish: no false red errors, fresh Image/Video, response timer',
    notes: [
      'Normal assistant answers no longer show as red error boxes (fixed false “port/space” matches)',
      'Image and Video tabs always open a fresh canvas instead of jumping to the last Recent thread',
      '“Responded in …” timer restored under Chat, Image, and Video replies; Code still shows Worked for …',
      'Finished-while-away glow lights the Recent chat row (not New Chat) until you open that thread',
      'Update via Settings → Updates → Check → Download when this build is published',
    ],
  },
  {
    version: '0.1.91',
    channel: 'stable' as const,
    date: 'Aug 19, 2026',
    title: 'First-message chat handoff, login orbs, engine install fixes',
    notes: [
      'Sending from New Chat now opens that thread instead of leaving you on the empty starter',
      'Login and setup ambient RGB orbs show again (even when Windows reduce-motion is on)',
      'Safer CUDA / Stable Diffusion binary install and extract; stuck Stop on empty New Chat cleared',
      'Update via Settings → Updates → Check → Download when this build is published',
    ],
  },
  {
    version: '0.1.90',
    channel: 'stable' as const,
    date: 'Aug 19, 2026',
    title: 'Seamless brain rotation and reliability pass',
    notes: [
      'Speed-aware GGUF preload and hot-swap keep long chats and coding threads in context',
      'Coding history, preview honesty, and clearer errors in Chat, Code, and Local AI',
      'Models Engine tab stays on Models; stop/cancel no longer starts a second local run',
      'Update via Settings → Updates → Check → Download when this build is published',
    ],
  },
  {
    version: '0.1.89',
    channel: 'stable' as const,
    date: 'Aug 19, 2026',
    title: 'Hide top-left TitleBar text',
    notes: [
      'Top-left window chrome is now blank (no “ARK” label), leaving only sidebar icons/search visible.',
    ],
  },
  {
    version: '0.1.88',
    channel: 'stable' as const,
    date: 'Aug 19, 2026',
    title: 'Dev ARK ID + UI chrome fixes',
    notes: [
      'Dev account ARK ID now shows single `DEV` (and Copy copies `DEV`) instead of repeating it',
      'Title bar no longer renders route context text (removes “arc model engine” / random context noise)',
      'Local AI installed check/trash icons are always green/red (never grey)',
    ],
  },
  {
    version: '0.1.87',
    channel: 'stable' as const,
    date: 'Aug 19, 2026',
    title: 'Installed icon color fix (Local AI)',
    notes: [
      'Installed checkmark/trash icons now force their explicit green/red colors',
      'Prevents parent styles from making Local AI installed icons look grey',
    ],
  },
  {
    version: '0.1.86',
    channel: 'stable' as const,
    date: 'Aug 19, 2026',
    title: 'Dev account labels + installed icon consistency',
    notes: [
      'Dev account (designated email): ARK ID shows “Dev DEV” (no dev badge pill)',
      'Copy ARK ID now copies the displayed “Dev DEV” text for the dev account',
      'Sidebar top-left icon no longer shows fallback alt text (“arc”)',
      'Installed model check/trash icons are consistent across Models and Local AI tabs',
    ],
  },
  {
    version: '0.1.85',
    channel: 'stable' as const,
    date: 'Aug 19, 2026',
    title: 'Bug fixes — tray, sidebar, Engine tab, model colors',
    notes: [
      'Tray "Open Settings" now correctly opens the Account section',
      'Sidebar: Local AI and Models no longer both highlight at once',
      'Engine tab in Models stays in-view (no longer kicks to Local AI)',
      'Installed model checkmark is green; trash icon is red',
      'ARK ID shows "deaf" for designated account instead of number',
      'Hardware scan buttons spaced apart in Settings',
      '"ARK · Chat" removed from title bar (just shows "ARK")',
    ],
  },
  {
    version: '0.1.82',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Restore roomy settings + clarify model pills',
    notes: [
      'Settings modal widened back to the original roomy layout',
      'Models Chat/Code pills are clickable again (tooltips clarify defaults)',
      'Plugins Browse now shows catalog-only / coming-soon inventory again',
    ],
  },
  {
    version: '0.1.84',
    channel: 'stable' as const,
    date: 'Aug 19, 2026',
    title: 'UI polish, Connect coming soon, sidebar cleanup',
    notes: [
      'Capacity label removed from sidebar; Local AI tab restored under Tools',
      'Connect tabs (Networking, Message, Call) show blur + Coming Soon overlay',
      'Models list: trash-only when installed, Chat/Code pills removed',
      'Settings content centred; Testers + Beta tabs blocked (coming soon)',
      'Tray menu redesigned; Open Settings routes to Account section',
      'Settings > Models: single click to select (no split Chat/Code rows)',
      'Font size default raised to 16px; dev badge for designated emails',
      'Update checker scans all releases — finds v0.1.83+ correctly',
      'App always opens to a fresh chat on launch',
    ],
  },
  {
    version: '0.1.83',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Auto-set defaults on model install',
    notes: [
      'Models tab stays simple: Chat/Code pills are indicators only',
      'Installing a model auto-sets it as the default for Chat or Code based on category',
    ],
  },
  {
    version: '0.1.81',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Harden auth & restore media/UI clarity',
    notes: [
      'Signup no longer asks for a custom username (auto ARK ID display name)',
      'Parked Connect items no longer navigate (opens Settings → Testers)',
      'Title bar no longer shows confusing Hybrid pill; Capacity label clarifies local+cloud',
      'Models list returns to download/check/trash (Chat/Code pills are non-clickable)',
      'Image/Video templates are restored; motion-still helper text clarified',
    ],
  },
  {
    version: '0.1.80',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Close leftover list items',
    notes: [
      'PIN lock on sleep, delete project files on disk, find-in-files totals',
      'Enter/Shift+Enter documented; Ctrl+F in Code vs Ctrl+K app search',
      'System health extracted; lookup throttle; cleanup helper on clone temp dirs',
    ],
  },
  {
    version: '0.1.79',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Finish remaining polish lists',
    notes: [
      'Single engine catalog module + UI catalog smoke; GGUF temperature/length prefs',
      'Updater hits 100% after download; Jobs strip shows update progress',
      'Continue from cutoff, retry-with-cloud button, import skipped toasts',
      'OAuth callback port retry; Stripe parked; Code vs Chat default pickers',
    ],
  },
  {
    version: '0.1.78',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Quality pass 5 — edges, clarity, jobs strip',
    notes: [
      'Packaged brain: auth required for /api/tags, /v1/models, /v1/engine',
      'Concurrent GGUF returns busy error; truncation footer; disk confirm before download',
      'Jobs strip for downloads; unified capacity label; System health in Settings',
      'Dev auth-off badge in Settings + tray; auth store refuses plaintext read',
      'Release notes no longer hardcode :8787 as the only brain URL',
    ],
  },
  {
    version: '0.1.77',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Quality pass 4 — complete fix list',
    notes: [
      'Ask-before-cloud failover, vision key errors, main-process cloud auth injection',
      'Download errors persist with Dismiss/Retry; queue survives restart; FLUX part errors',
      'Media library corrupt reset; OpenAPI 401/429/503; cloud keys never in renderer headers',
      'Scaffold honesty in Code, find-in-files totals, Projects cloud-fail notice',
      'About unified, theme FOUC fix, reduced-motion orbs, PIN lock on sleep',
    ],
  },
  {
    version: '0.1.76',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Quality pass 3 — complete wiring sweep',
    notes: [
      'Studio read-only guard, no-capacity honesty, clone overwrite warning, import skip counts',
      'Auth session refuses plaintext; download errors persist; Windows disk space check',
      'Clean shutdown stops engine + GGUF server; dynamic brain URL; llama-server error status',
      'Settings local reports + uninstall warning; modal focus trap; guest banner dismiss',
      'Updater finalizing at 99%; CI smoke workflow; project git hook extract',
    ],
  },
  {
    version: '0.1.75',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Quality pass 2 — control, hardening, honesty',
    notes: [
      'Media preview badges always show for SVG / real:false fallbacks',
      'Brain API rate limits, body size cap, empty-output errors, stream error events',
      'GGUF server port conflict handling (8788–8797); tray shows brain URL + token',
      'Main window sandbox enabled; secrets-load returns status map + per-key fetch',
      'Title bar Local/Hybrid/Cloud/Offline pill; download Canceling… state',
      'Signing status in Settings → Updates; GitHub picker opens Plugins when no token',
    ],
  },
  {
    version: '0.1.74',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Review pass — trust, security, and work trace',
    notes: [
      'GGUF failures and brain API errors return real 503s instead of fake success replies',
      'Packaged installs get a brain bearer token; copy or rotate it in Settings → AI',
      'API keys refuse plaintext save when OS encryption is unavailable',
      'Code review/debug shows a live work trace while ARK reads your project',
      'External links use an allowlist with confirm for unknown hosts',
    ],
  },
  {
    version: '0.1.73',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Code waits for Enter, reads your folder, and locks device size',
    notes: [
      'Yes from Chat opens Code with your prompt ready — nothing runs until you press Enter',
      'If the brain does not finish, ARK says so instead of pasting an offline starter app',
      '“What is this project about?” reads the opened files, describes them, then offers Debug / Work on this',
      'While code is writing, the right editor follows the live file; device previews stay the real phone size (zoom only, no stretching)',
    ],
  },
  {
    version: '0.1.72',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Chat finishes answers; Code edits the same app; Start opens a preview window',
    notes: [
      'Chat and Code wait long enough to finish lists instead of stopping mid-sentence or repeating the same answer',
      'Simple edits (background, device name) update the existing iOS/Android files instead of spawning ArkApp / Calculator / IphoneApp folders',
      'Start opens a separate preview window — phone frame for native apps, full page for websites',
      'Code Plus → Open folder loads files like New Chat, and Plan / Ask / Debug / Multitask chips sit above the input so they stay aligned',
    ],
  },
  {
    version: '0.1.71',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Settings that shrink, caches that clear, models you can delete',
    notes: [
      'Every tab reflows when you shrink the window: sidebar collapses, Settings stacks, grids wrap instead of overflowing',
      'Clear local chat cache and Storage → Clear cache actually wipe local threads and reports (keys and models stay)',
      'Installed models get a trash control next to the check — Settings Storage, Models, and Local AI can delete the GGUF from this PC',
      'Security 2FA is blanketed as Coming soon until that feature ships',
    ],
  },
  {
    version: '0.1.70',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Sweep dead UI and wire Coming soon for real',
    notes: [
      'Coming soon tabs (Image, Video, Networking, Message, Call) no longer open if something still links to them',
      'Settings full-page and overlay now share one panel; unused capacity/update overlays and demo project stubs are gone',
      'Code chat respects Models cloud on/off, and leftover Invite / New iPhone starter code is out of the workspace',
    ],
  },
  {
    version: '0.1.69',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Device-target apps + tighter Cloud AI',
    notes: [
      'Code chat asks which device after it notices iOS or Android: iPhone / iPad / Mac, or phone / tablet / laptop',
      'Start opens a device-sized preview in ARK; Xcode and Android Studio still ship the real app',
      'Saved provider keys stay checked on Models, Cloud plus/check persists, and Image / Video / Networking / Message / Call / Testers are Coming soon',
      'PC specs stay on Local AI → Hardware only; Models has a Refresh hunt instead of the hardware banner',
    ],
  },
  {
    version: '0.1.68',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Multi-host model hunt and speed test',
    notes: [
      'Hunt GGUF brains from Hugging Face and ModelScope, with HF Mirror as a download fallback',
      'Speed test measures this PC to each host and back, then installs from the fastest path',
      'Connected API keys are pinged in the same run for chat latency, not file downloads',
      'Local GGUF chat answers more reliably, and a backup brain can download when the current one runs out',
    ],
  },
  {
    version: '0.1.67',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Ignore streamed instruction fragments in chat',
    notes: [
      'Chat no longer treats a single leaked instruction sentence as the model reply',
      'Streaming waits for real answer text instead of latching onto prompt fragments',
    ],
  },
  {
    version: '0.1.66',
    channel: 'stable' as const,
    date: 'Aug 18, 2026',
    title: 'Fix Qwen prompt echo + balance update bar',
    notes: [
      'Local Qwen/GGUF chat no longer gets a double ARK system instruction block',
      'Text chat keeps the neutral Thinking state until real text arrives',
      'Update splash progress bar is wider and centered in both HTML and fallback UI',
    ],
  },
  {
    version: '0.1.65',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Fix system-prompt echo in text chat (test)',
    notes: [
      'Chat now detects and rejects “system prompt echo” replies from models',
      'Router will failover when a local model re-emits the ARK system instruction block',
    ],
  },
  {
    version: '0.1.64',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Fix installer uninstall locks during updates (test)',
    notes: [
      'Updater now waits until no other ARK.exe processes remain before running NSIS',
    ],
  },
  {
    version: '0.1.63',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Re-enable Networking + Message (test)',
    notes: [
      'Sidebar tabs for Networking and Message are enabled for UI testing.',
    ],
  },
  {
    version: '0.1.62',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Re-enable Networking + Message (test)',
    notes: [
      'Networking and Message tabs are enabled again for UI testing',
    ],
  },
  {
    version: '0.1.61',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Cleaner Updating screen + Message Coming soon',
    notes: [
      'Update splash uses the ARK icon in the window and taskbar, one status line, and a clearer progress bar',
      'Message is disabled in the sidebar with Coming soon (Networking stays Coming soon)',
    ],
  },
  {
    version: '0.1.60',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Networking marked Coming soon (update splash test)',
    notes: [
      'Networking is disabled in the sidebar with Coming soon — Message and Call stay available',
      'Use this build to confirm the Updating screen stays until ARK reopens',
    ],
  },
  {
    version: '0.1.59',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Updating screen stays until ARK reopens',
    notes: [
      'The Updating splash no longer vanishes after install while ARK is still starting',
      'Splash stays on screen until the real ARK window appears, then it closes',
    ],
  },
  {
    version: '0.1.58',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Code studio, native iPhone/Android apps, and honest brains',
    notes: [
      'Code can author real iPhone (Xcode) and Android (Android Studio) projects and push to GitHub',
      'Updating splash and install path unchanged in 0.1.58 — 0.1.59 keeps that screen until reopen',
    ],
  },
  {
    version: '0.1.57',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Ships 0.1.56 fixes + chat composer + Local AI layout',
    notes: [
      'Fixes failed 0.1.56 release (Code workspace build error) so Updates can install again',
      'Chat composer: wider, single-line pill with aligned + / model controls',
      'Local AI: Installed and download lists use the same side-by-side grid as Models',
      'Code build progress in chat bubble + Explorer project label (from 0.1.56)',
    ],
  },
  {
    version: '0.1.56',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Code builds show progress in chat; Explorer names your project',
    notes: [
      'Build steps live in the bot bubble (understand → plan → write → save) — not a bar at the top',
      'Explorer shows what you are building (Calculator, Website, etc.) and file names as they appear',
      'Faster path: lighter prompts, live streaming on the right, scaffold in ~5s if the brain stalls',
    ],
  },
  {
    version: '0.1.55',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Code builds that finish — Explorer, scaffolds, compact build chip',
    notes: [
      'Build hint is a short centered pill above the chat box; composer is slightly taller',
      'Code workspace auto-sends when you click Yes, streams into Explorer, and scaffolds calculator if the brain times out',
      'Projects save under ark-projects/code/ on disk for easy access',
    ],
  },
  {
    version: '0.1.54',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Chat code replies and Code workspace planning flow',
    notes: [
      'Build hint bar is smaller and cleaner; chat still returns copy-pasteable code when you press Enter',
      'System-prompt echoes stripped from chat bubbles',
      'Code workspace shows plan → write → apply steps and creates files from markdown fences',
    ],
  },
  {
    version: '0.1.53',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Sticky Auto brain across chat, image, video, and code',
    notes: [
      'Auto picks a brain once per thread and stays on it until failover — pill shows ARK · model name',
      'Image and video chats remember their equipped path; code workspace uses the same sticky coder brain',
      'Token ring and model pill reflect the active brain instead of generic ARK',
      'Sidebar profile restored at the bottom (name + settings gear)',
    ],
  },
  {
    version: '0.1.52',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Fix stray Electron window on PC restart',
    notes: [
      'Dev Electron builds no longer register Windows startup (that caused the raw Electron splash on boot)',
      'Packaged ARK cleans up stale dev startup entries and re-registers the real ARK.exe when Launch on startup is on',
      'Lindsay / brain API unchanged — ARK still starts from the installed app only',
    ],
  },
  {
    version: '0.1.51',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'ARK Engine is the brain — Auto picks the right local model',
    notes: [
      'Auto routes chat vs code vs media on the same ARK pill, and uses a ready Engine GGUF that fits this PC (7B / 3B when installed — not stuck on 1.5B)',
      'Build asks load a Coder GGUF when you have one; Lindsay on :8787 gets the same pick instead of Ollama',
      'Local llama-cli now uses a real chat template and stop strings so answers stay on-topic',
      'Ollama stays optional last — never the default brain',
    ],
  },
  {
    version: '0.1.50',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'New Chat answers the question you asked',
    notes: [
      'Local chat no longer pastes the previous reply into the next one (the “c. Is there anything…” leak)',
      'ARK knows it is this app — not Ark: Survival Evolved — and won’t “correct” the name',
      'Follow-ups like “tell me a story” start a fresh answer; build asks still keep useful context',
    ],
  },
  {
    version: '0.1.48',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'Stop Recent duplicates + faster New Chat',
    notes: [
      'Code / Image / Video no longer spawn a new Recent row on every sidebar click',
      'New Chat no longer reuses a stale thread id (fixes mixed follow-up replies)',
      'Token ring centered with the ARK pill; Stop clears sooner when the reply is done',
    ],
  },
  {
    version: '0.1.47',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'Background downloads + done indicators',
    notes: [
      'Collapsed sidebar: no logo / no profile — logo only when expanded; Settings alone at bottom',
      'Queue banner matches composer width; token ring click shows model + budget',
      'Model downloads keep going when you leave Models / Local AI; nav blinks green when ready',
      'Chat reply finished while away blinks New Chat / Image / Video until you open it',
    ],
  },
  {
    version: '0.1.46',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'Update wait screen + UI polish',
    notes: [
      'Updating screen stays until ARK reopens (“Waiting for ARK to reopen”)',
      'Smaller plus menu; Recent shows chat vs Code icons with archive/delete',
      'Cleaner Code Start/Stop, chat footer, Settings grids without empty scroll',
    ],
  },
  {
    version: '0.1.45',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'Plus menu, ARK model pill, token ring',
    notes: [
      'Plus button opens Plan / Ask / Debug / Multitask / Add file (Chat and Code)',
      'Model pill shows ARK with a dropdown; Code chat has the same model picker + failover',
      'Code button only appears when a build-style ask is detected; token ring shows budget use',
    ],
  },
  {
    version: '0.1.44',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'Code cleanup + update screen stays open',
    notes: [
      'Updating window stays through install until ARK reopens (Installing → Opening ARK)',
      'Code starts empty — no fake files; Browser/Run chrome only when you build',
      'Chat asks before switching to Code; Recent is one list with rename',
    ],
  },
  {
    version: '0.1.43',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'Code workspace back in the sidebar',
    notes: [
      'Sidebar Build is now Code (</> icon) and opens the explorer + editor + chat layout',
      'Asking to build/look at code, or attaching a code file, auto-switches into Code',
      'Local Code projects no longer spin forever on a blank screen',
    ],
  },
  {
    version: '0.1.42',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Updater finishes and reopens ARK',
    notes: [
      'Install no longer kills the Updating window mid-way by overwriting a locked ARK.exe',
      'Hidden apply step runs after the splash exits, then ARK reopens',
      'Updating window is a bit larger',
    ],
  },
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
