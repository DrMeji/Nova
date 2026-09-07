/** Local sticky prefs for guest / offline UI (no cloud required). */

const PREFS_KEY = 'ark:local-prefs';
const API_KEYS_KEY = 'ark:provider-api-keys';

export type AiModePref = 'automatic' | 'local_only' | 'cloud_when_available' | 'local_fallback';
export type DensityPref = 'comfortable' | 'compact';
export type AccentPref = 'sky' | 'emerald' | 'amber' | 'rose';
export type UpdateChannel = 'stable' | 'beta';
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
  /**
   * Level-B agent tool loop (search → read → edit → run → verify).
   * When false, Agent mode falls back to one-shot coding.
   */
  agentLoopEnabled: boolean;
  /** Max tool steps per Agent loop (4–60). */
  agentLoopMaxSteps: number;
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
  /** speechSynthesis voiceURI for ARK spoken replies. */
  voiceTtsVoiceUri?: string;
  // Updates
  updateChannel: UpdateChannel;
  autoCheckUpdates: boolean;
  notifyOnUpdate: boolean;
  launchOnStartup: boolean;
};

const DEFAULT_PREFS: LocalPrefs = {
  displayName: 'Guest',
  presenceStatus: 'online',
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
  allowDocumentsFolderAccess: false,
  allowFullPcAccess: false,
  agentExecutionMode: 'allowlist',
  agentLoopEnabled: true,
  agentLoopMaxSteps: 24,
  agentLoopCommitOnSuccess: false,
  chatFirst: true,
  voiceChatEnabled: false,
  voiceInputAuto: true,
  voiceOutputAuto: true,
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
    if (typeof merged.voiceInputAuto !== 'boolean') merged.voiceInputAuto = true;
    if (typeof merged.voiceOutputAuto !== 'boolean') merged.voiceOutputAuto = true;
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
  await persistProviderKeys(map);
  // Commit the in-memory value only after the durable write succeeds.
  // Otherwise a failed secure-storage write looks connected until restart.
  providerKeyCache = map;
  try {
    window.dispatchEvent(new Event('ark:provider-keys-changed'));
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
    version: '0.1.190',
    channel: 'stable' as const,
    date: 'Sep 6, 2026',
    title: 'Update splash: rounded box, bar under icon',
    notes: [
      'Update splash is a rounded box on all four corners',
      'ARK icon stays centered with the progress bar directly underneath (not stuck to the bottom edge)',
      'Same layout for the install HTA splash and the Electron preview splash',
    ],
  },
  {
    version: '0.1.189',
    channel: 'stable' as const,
    date: 'Sep 3, 2026',
    title: 'Chat edits on disk, sticky Recent, premium scaffolds',
    notes: [
      'Hero/title edits apply on disk instead of planning stubs',
      'Sidebar Work/Tools/Connect stay fixed; only Recent scrolls',
      'Chat switch briefly loads then restores Localhost/Code for that chat',
      'Premium Apple-style landing scaffolds with Terms/Privacy/Contact',
    ],
  },
  {
    version: '0.1.180',
    channel: 'stable' as const,
    date: 'Sep 3, 2026',
    title: 'No duplicate Code Recent rows; phone preview frame',
    notes: [
      'Creating a project no longer adds a second Code filing-system row in Recent — stay on the chat; use the Code pill for files',
      'Legacy Code-project Recent entries are cleared; clicking them no longer opens an empty overlay + blank chat',
      'Mobile / phone builds can open Localhost in an iPhone or Android-sized preview frame',
      'Planning asks overall iOS / Android vs a specific device when relevant',
    ],
  },
  {
    version: '0.1.179',
    channel: 'stable' as const,
    date: 'Sep 3, 2026',
    title: 'Splash bar polish, Projects cleanup, Image SOON',
    notes: [
      'Update splash progress bar sits higher and fills left→right; Electron splash uses rounded corners',
      'Projects list no longer shows internal code/uploads folders; Remove deletes the real folder',
      'Create auto-picks a free folder name when an old project folder is still on disk',
      'Image tab is SOON for packaged installs (DEV / bat still has Image); focus stays on Chat coding',
    ],
  },
  {
    version: '0.1.178',
    channel: 'stable' as const,
    date: 'Sep 3, 2026',
    title: 'Smarter planning, Code pill only, Localhost fix',
    notes: [
      'Planning asks product questions (web vs phone, who it’s for) — never tech experience, auth, or privacy quizzes',
      'Brain tab content is truly vertically centered',
      'Old empty Code / Project workspace screen removed — only the Code pill opens files (folders left, editor right)',
      'Localhost no longer opens a blank black window for Vite apps; npm install runs before the preview server',
      'Builds lean thorough over empty shells',
    ],
  },
  {
    version: '0.1.177',
    channel: 'stable' as const,
    date: 'Sep 3, 2026',
    title: 'Cleaner updates, fixed splash, warmer planning',
    notes: [
      'Single update indicator (green download icon) — no duplicate spinning Update available strip',
      'Check for update swaps to Update when a build is ready; Settings stays on Update until you install',
      'Removed delta-ready / unsigned code-signing clutter from Update settings',
      'Update splash logo and progress bar are centered again',
      'Brain tab content is vertically centered',
      'Planning chats open with what you want to build and how to start, then natural clarifying questions',
    ],
  },
  {
    version: '0.1.176',
    channel: 'stable' as const,
    date: 'Sep 3, 2026',
    title: 'Chat mic, ARK Projects, Brain under Tools',
    notes: [
      'Microphone on the Chat box — click to speak, voice-to-text fills the composer',
      'Queued message bar matches the chat box width',
      'Thought dropdown shows background work; Files Changed card on disk edits; More details removed',
      'New projects land in Documents\\ARK Projects; Projects view lists them',
      'ARK Brain moved to Tools (under MCP) for any local app — not Lindsay-only',
      'Gaming news app ideas no longer trigger a desktop game inventory scan',
    ],
  },
  {
    version: '0.1.175',
    channel: 'stable' as const,
    date: 'Sep 3, 2026',
    title: 'Update splash only at install, one clean screen',
    notes: [
      'Update button no longer pops the splash while download / verify still runs in Settings',
      'Install splash is the official logo + progress screen only — old blank WinForms path removed',
      'HTA splash embeds the ARK mark so the logo cannot go missing mid-update',
      'Agent / Debug on a bound project can run a Level-B tool loop (list → read → grep → write → run → verify)',
    ],
  },
  {
    version: '0.1.174',
    channel: 'stable' as const,
    date: 'Sep 3, 2026',
    title: 'Transparent shell icon (no black tile)',
    notes: [
      'Taskbar / Start ARK mark is transparent. no black square behind the glyph',
      'Installer refreshes Windows icon cache after update so Start menu picks up the new mark',
      'Tray icon stays the clean transparent voice mark',
    ],
  },
  {
    version: '0.1.173',
    channel: 'stable' as const,
    date: 'Sep 3, 2026',
    title: 'Larger mark, real update splash, safer chat',
    notes: [
      'Taskbar and tray ARK mark is larger and clearer',
      'Official update splash (logo + progress) on real installs. bat preview stays bat-only',
      'Harmful asks use a professional refusal without decline lecture wording',
      'Yes / overall follow-ups deepen with new detail instead of repeating',
      'Chat switching in bat builds is snappier',
    ],
  },
  {
    version: '0.1.172',
    channel: 'stable' as const,
    date: 'Sep 2, 2026',
    title: 'Voice think ring, safer startup, cleaner refusals',
    notes: [
      'Harmful-content refusals are more professional and no longer feel like a 1 ms stub',
      'Voice no longer speaks internal capability rules out loud',
      'Thinking uses a spinning ring around the face instead of a text bubble',
      'Voice face and composer sit higher in the layout',
      'Title bar maximize uses a single box icon',
      'Local brain warmup is deferred after launch to reduce freezes on open',
    ],
  },
  {
    version: '0.1.171',
    channel: 'stable' as const,
    date: 'Sep 1, 2026',
    title: 'Voice sync, safety refusals, Chat/Voice tab fix',
    notes: [
      'Harmful/illegal asks get a direct refusal. no coding or positive-project pivot',
      'Voice mouth animation syncs to actual audio playback (no early mouth move)',
      'Thinking bubble + faster shimmer while Voice waits for a reply',
      'Removed outer white ring on Voice face; Chat/Voice tab switch fixed',
      'Chat stays on topic. no random coding offers on normal conversation',
    ],
  },
  {
    version: '0.1.170',
    channel: 'stable' as const,
    date: 'Sep 1, 2026',
    title: 'Fix update splash icon + working neural voice',
    notes: [
      'Update splash uses the new ARK face (no ears/antenna, inner shimmer) instead of legacy icon.png',
      'Neural Female/Male TTS fixed — edge-tts-universal replaces broken edge-tts in Electron',
      'System voice fallback respects Female vs Male when neural path is unavailable',
    ],
  },
  {
    version: '0.1.169',
    channel: 'stable' as const,
    date: 'Sep 1, 2026',
    title: 'Voice polish — brain hint, no preview button',
    notes: [
      'Voice tab shows a connect-key / install-brain hint when no model is ready',
      'Pressing Enter or tapping the face speaks setup guidance instead of failing silently',
      'Removed dev-only Preview voice button from the Voice tab',
    ],
  },
  {
    version: '0.1.168',
    channel: 'stable' as const,
    date: 'Sep 1, 2026',
    title: 'Voice tab, neural speech, animated ARK face',
    notes: [
      'Voice chat tab — talk back and forth for questions and stories, no history saved',
      'Microsoft Edge neural TTS — Female or Male voice in Settings → Voice',
      'Animated ARK face with inner shimmer and mouth bars while speaking',
      'Dedicated voice router — cloud-first, capped local tokens, no PC freeze on send',
      'Settings → Voice: mic, headphones, and spoken voice picker',
    ],
  },
  {
    version: '0.1.166',
    channel: 'stable' as const,
    date: 'Sep 1, 2026',
    title: 'Full plugin wiring, MCP remote, local vision',
    notes: [
      'All catalog plugins wired with verify + live actions — Build & Run shelf emptied',
      'MCP remote HTTP/SSE servers + inline auto tool loop in chat',
      'Qwen2-VL on-device vision hop when the bundle is installed (vision → chat/coder)',
      'Models cloud/local polish, download confirm, and honest capability copy',
      'Auth groundwork: avatar Storage migration + email reset ready when domain ships',
      'Video, Voice, Testers, Beta plugged in but hidden behind feature flags',
    ],
  },
  {
    version: '0.1.165',
    channel: 'stable' as const,
    date: 'Sep 1, 2026',
    title: 'Ambient shell, inbox polish, minimal update splash',
    notes: [
      'Soft roaming color orbs behind the whole app — same vibe as setup, calmer in the main shell',
      'Message list timestamps stay right-aligned; unread dot sits beside the time without shifting it',
      'Notifications inbox redesigned — cleaner rows, New/Earlier sections, kind-colored icons',
      'Updating splash is minimal black: smaller robot icon, pill progress bar, more breathing room',
      'Chat composer pill expands when you wrap lines; Image tab no longer inherits Chat drafts',
      'Networking views/saves/replies track real engagement; notification nav uses dots only',
    ],
  },
  {
    version: '0.1.160',
    channel: 'stable' as const,
    date: 'Aug 26, 2026',
    title: 'Friend requests fix + solid update splash',
    notes: [
      'Inbound friend requests sync and show Accept/Decline even when Realtime is missed',
      'One-time ARK ID rotation (DEV stays DEV); cloud ID is source of truth',
      'Updating splash is a solid dark panel — no white outer frame or caption junk',
      'Chat answer quality, web lookup, and context compaction improvements',
    ],
  },
  {
    version: '0.1.156',
    channel: 'stable' as const,
    date: 'Aug 25, 2026',
    title: 'Friends unadd/block + icon + Update screen',
    notes: [
      'Unadd removes both sides; messaging requires mutual friendship',
      'Trash deletes contacts; Settings → Privacy lists blocked users',
      'App icon: black rounded square only (no gray inset)',
      'Update screen: GitHub button beside Check for update; rounded progress splash',
    ],
  },
  {
    version: '0.1.155',
    channel: 'stable' as const,
    date: 'Aug 25, 2026',
    title: 'Notifications hub + display names',
    notes: [
      'Signed-in / SmartScreen tip moved into Notifications with a blue unread dot',
      'Friend requests, messages, and finished model downloads light Notifications',
      'DEV public ID stays DEV while friends see the real display name (e.g. AutoFoot)',
    ],
  },
  {
    version: '0.1.154',
    channel: 'stable' as const,
    date: 'Aug 25, 2026',
    title: 'DEV ARK ID + local recovery notes',
    notes: [
      'Developer account public ARK ID is DEV for everyone (not digits)',
      'Temp local recovery note saves email, password, and PIN on this PC only',
      'Forgot password / open folder points at that note until email reset ships',
      'Update check retries GitHub 504s; MCP tools can be called from Chat',
    ],
  },
  {
    version: '0.1.153',
    channel: 'stable' as const,
    date: 'Aug 24, 2026',
    title: 'Live friend names/avatars + signup name',
    notes: [
      'Friends list and chat refresh live display names and profile photos from Settings',
      'DEV account labels correctly on friend requests and contacts',
      'Sign up includes a single Name field (ARK ID still auto-assigned)',
      'Call stays parked until tomorrow; see docs/DEFERRED.md',
    ],
  },
  {
    version: '0.1.103',
    channel: 'stable' as const,
    date: 'Aug 21, 2026',
    title: 'Clean Connect for new installs + sharper brand icons',
    notes: [
      'Networking, Message, and Notifications ship empty. no fake demo posts, chats, or alerts in production builds (dev still has local templates)',
      'Real network posts and messages still appear when people actually use Connect',
      'Plugin / Models / Local AI / Settings API key brand marks cleaned up (Gmail, Slack, Discord, Drive, GitHub, Groq, and more)',
      'Update via Settings → Updates → Check → Download when this build is published',
    ],
  },
  {
    version: '0.1.102',
    channel: 'stable' as const,
    date: 'Aug 21, 2026',
    title: 'Connect refresh: Networking, Message, Notifications, login orbs',
    notes: [
      'Networking: centered type + Platform filters, single expanding platform pill, report with proof + 24h review notification, cleaner post chat',
      'Message: group chats, presence status, unread dots, DM toasts; Notifications under CONNECT',
      'Login ambient orbs move again (slow bounce) with three extra colors. no longer frozen by Windows reduce-motion',
      'Update via Settings → Updates → Check → Download when this build is published',
    ],
  },
  {
    version: '0.1.101',
    channel: 'stable' as const,
    date: 'Aug 21, 2026',
    title: 'Fresh install always shows setup after sign-in',
    notes: [
      'Reinstalling from GitHub no longer skips Hardware → Models → Connect after sign-in/sign-up',
      'Setup completion is tied to an install id; leftover AppData cannot fake a finished first-run',
      'In-place upgrades still keep your setup so you are not forced through onboarding again',
      'Update via Settings → Updates → Check → Download when this build is published',
    ],
  },
  {
    version: '0.1.100',
    channel: 'stable' as const,
    date: 'Aug 21, 2026',
    title: 'Code workspace that actually edits the live page',
    notes: [
      'Canonical web paths: stop writing path/to junk; Done only when Start/preview files change',
      'Fast local patches for background, text color, search bar, theme toggle, RGB title, rename',
      'Honest Code chat replies (no “from your latest notes” echo); GitHub push chip only when asked',
      'Usage ring aligned with the composer; Chat sticky folder / studio answer engine polish',
      'Update via Settings → Updates → Check → Download when this build is published',
    ],
  },
  {
    version: '0.1.98',
    channel: 'stable' as const,
    date: 'Aug 20, 2026',
    title: 'Tesla images, normal chat, Brain on Engine',
    notes: [
      'Fixed free image failures (Tesla Model S etc.): stop Pollinations retry storms that hit 429 queue-full; kick AI Horde after 10s; accept real fast renders',
      'Chat greets like a normal assistant (no “desktop creation” pitch); richer answers + movie watch-where hints; markdown bold renders without star spam',
      'Brand icons for plugins/models; installed checkmark without circle; Storage disk bar shows used space; Brain API lives on Models → Engine',
      'Deleting an image chat removes it from History too; Recent overflow archives into History',
      'Update via Settings → Updates → Check → Download when this build is published',
    ],
  },
  {
    version: '0.1.97',
    channel: 'stable' as const,
    date: 'Aug 20, 2026',
    title: 'Image accuracy, Chat→Image handoff, Video parked',
    notes: [
      'More reliable free images: simplify Pollinations URLs, AI Horde fallback, quality-first Flux path, wallpaper 16:9',
      'Vague image prompts ask a short brief (style/subject/size); upload a photo to recreate via img2img',
      'In Chat, image asks show Stay/Yes like Code. Yes opens Image and starts generating',
      'Video tab disabled (coming soon) until generative video is ready; Search hides Video',
      'Update via Settings → Updates → Check → Download when this build is published',
    ],
  },
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
      'Image mode no longer races fast turbo models. ARK tries flux-realism, flux, then openjourney sequentially (up to ~30s)',
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
    title: 'Bug fixes. tray, sidebar, Engine tab, model colors',
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
      'Update checker scans all releases. finds v0.1.83+ correctly',
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
    title: 'Quality pass 5. edges, clarity, jobs strip',
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
    title: 'Quality pass 4. complete fix list',
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
    title: 'Quality pass 3. complete wiring sweep',
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
    title: 'Quality pass 2. control, hardening, honesty',
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
    title: 'Review pass. trust, security, and work trace',
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
      'Yes from Chat opens Code with your prompt ready. nothing runs until you press Enter',
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
      'Start opens a separate preview window. phone frame for native apps, full page for websites',
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
      'Installed models get a trash control next to the check. Settings Storage, Models, and Local AI can delete the GGUF from this PC',
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
      'Networking is disabled in the sidebar with Coming soon. Message and Call stay available',
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
      'Updating splash and install path unchanged in 0.1.58. 0.1.59 keeps that screen until reopen',
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
      'Build steps live in the bot bubble (understand → plan → write → save). not a bar at the top',
      'Explorer shows what you are building (Calculator, Website, etc.) and file names as they appear',
      'Faster path: lighter prompts, live streaming on the right, scaffold in ~5s if the brain stalls',
    ],
  },
  {
    version: '0.1.55',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Code builds that finish. Explorer, scaffolds, compact build chip',
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
      'Auto picks a brain once per thread and stays on it until failover. pill shows ARK · model name',
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
      'Lindsay / brain API unchanged. ARK still starts from the installed app only',
    ],
  },
  {
    version: '0.1.51',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'ARK Engine is the brain. Auto picks the right local model',
    notes: [
      'Auto routes chat vs code vs media on the same ARK pill, and uses a ready Engine GGUF that fits this PC (7B / 3B when installed. not stuck on 1.5B)',
      'Build asks load a Coder GGUF when you have one; Lindsay on :8787 gets the same pick instead of Ollama',
      'Local llama-cli now uses a real chat template and stop strings so answers stay on-topic',
      'Ollama stays optional last. never the default brain',
    ],
  },
  {
    version: '0.1.50',
    channel: 'stable' as const,
    date: 'Aug 16, 2026',
    title: 'New Chat answers the question you asked',
    notes: [
      'Local chat no longer pastes the previous reply into the next one (the “c. Is there anything…” leak)',
      'ARK knows it is this app. not Ark: Survival Evolved. and won’t “correct” the name',
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
      'Collapsed sidebar: no logo / no profile. logo only when expanded; Settings alone at bottom',
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
      'Code starts empty. no fake files; Browser/Run chrome only when you build',
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
      'Single download progress in Settings. no second overlay',
      'Installer is staged to a stable temp path before ARK exits',
    ],
  },
  {
    version: '0.1.37',
    channel: 'stable' as const,
    date: 'Aug 17, 2026',
    title: 'Settings polish and chat continuity',
    notes: [
      'Save lives in the Settings nav. no black sticky bar',
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
      'No second “Closing…” overlay. download in-app, then only the Updating splash',
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
      'Single-instance lock. reopening focuses ARK instead of spawning more trays',
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
      'On-device Stable Diffusion 1.5 via ARK Engine (sd.cpp). install from Local AI',
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
      'One PC scan saved everywhere. Models / Local AI / onboarding show real specs and fit lists',
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
      'Single Updating screen with logo + percent. no terminals',
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
      'Honest routing status. no fake install steps',
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
