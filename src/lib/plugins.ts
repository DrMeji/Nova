/** NOVA plugin catalog + local install/connect state.
 * Token plugins (GitHub, Notion, …) verify live and store secrets in the OS vault.
 */

import { getPluginToken, setPluginToken } from '@/lib/localPrefs';
import { intentPermission, requirePluginPermission, hasPluginPermission } from '@/lib/pluginPermissions';
import {
  getCatalogPluginHandler,
  isCatalogPluginId,
  pluginMentionsText,
  runCatalogPluginLive,
} from '@/lib/catalogPlugins';

const STATE_KEY = 'NOVA:plugin-state';

export type PluginPermission =
  | 'read'
  | 'write'
  | 'list'
  | 'search'
  | 'send'
  | 'manage';

export type PluginAuthKind = 'oauth' | 'token' | 'none';

export type PluginDef = {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  tone: string;
  initial: string;
  category: string;
  /** First-wave plugins get a full connect → permissions → chat flow. */
  hero?: boolean;
  /** Real live API path exists (token verify + chat actions). */
  live?: boolean;
  authKind: PluginAuthKind;
  permissions: { id: PluginPermission; label: string; detail: string; required?: boolean }[];
  /** Example prompts NOVA can run once connected. */
  actions: { id: string; label: string; prompt: string }[];
};

/** Plugins with real verify + chat runners today. Default Plugins list. */
export const LIVE_PLUGIN_IDS = [
  'github',
  'notion',
  'gmail',
  'slack',
  'linear',
  'figma',
  'gdrive',
  'gcal',
  'vercel',
  'discord',
] as const;

/** Every catalog plugin has a live verify + chat runner. */
export function isPluginWired(id: string): boolean {
  return isCatalogPluginId(id);
}

/** @deprecated Use isPluginWired — all catalog plugins are wired. */
export const WIRED_PLUGIN_IDS = [] as const;

export function isPluginLive(id: string): boolean {
  return (LIVE_PLUGIN_IDS as readonly string[]).includes(id);
}

export type PluginRuntimeState = {
  installed: boolean;
  connected: boolean;
  enabledInChat: boolean;
  /** Granted permission ids */
  permissions: PluginPermission[];
  /** Token may be mirrored briefly; prefer OS vault via getPluginToken */
  token?: string;
  /** Connected account label (e.g. GitHub username) */
  accountLabel?: string;
  connectedAt?: string;
};

export type PluginStateMap = Record<string, PluginRuntimeState>;

export const PLUGIN_CATEGORIES: { id: string; title: string }[] = [
  { id: 'featured', title: 'Featured' },
  { id: 'productivity', title: 'Productivity' },
  { id: 'creativity', title: 'Creativity' },
  { id: 'developer', title: 'Developer Tools' },
  { id: 'business', title: 'Business & Operations' },
  { id: 'communication', title: 'Communication' },
];

export const PLUGIN_CATALOG: PluginDef[] = [
  // —— Hero plugins (full shell) ——
  {
    id: 'github',
    name: 'GitHub',
    description: 'Triage PRs, issues, CI, and publish flows.',
    longDescription:
      'Connect GitHub so NOVA can list repos, summarize pull requests, and help with issues while you build in Projects or Chat.',
    tone: 'from-zinc-600 to-zinc-900',
    initial: 'GH',
    category: 'featured',
    hero: true,
    live: true,
    authKind: 'token',
    permissions: [
      { id: 'list', label: 'List repositories', detail: 'See repos you can access', required: true },
      { id: 'read', label: 'Read code and PRs', detail: 'Open files, PRs, and issue text', required: true },
      { id: 'search', label: 'Search', detail: 'Search code and issues', required: false },
      { id: 'write', label: 'Write comments', detail: 'Draft or post PR/issue comments', required: false },
    ],
    actions: [
      { id: 'list-repos', label: 'List my repos', prompt: 'Using GitHub, list my repositories.' },
      { id: 'open-latest', label: 'Open latest in Code', prompt: 'Open my latest GitHub repo in Code' },
      { id: 'open-prs', label: 'Open PRs', prompt: 'Using GitHub, show my open pull requests.' },
      { id: 'recent-issues', label: 'Recent issues', prompt: 'Using GitHub, summarize recent issues.' },
      { id: 'create-repo', label: 'Create a repo', prompt: 'Using GitHub, create a private repo named NOVA-studio.' },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Specs, research, and team workflows.',
    longDescription:
      'Connect Notion so NOVA can find pages, pull specs into a project, and keep research next to your builds.',
    tone: 'from-neutral-700 to-black',
    initial: 'N',
    category: 'featured',
    hero: true,
    live: true,
    authKind: 'token',
    permissions: [
      { id: 'search', label: 'Search pages', detail: 'Find pages and databases', required: true },
      { id: 'read', label: 'Read content', detail: 'Read page text and properties', required: true },
      { id: 'write', label: 'Create or update pages', detail: 'Add notes or update docs', required: false },
    ],
    actions: [
      { id: 'search-docs', label: 'Search docs', prompt: 'Using Notion, search my workspace for product specs.' },
      { id: 'pull-brief', label: 'Pull a brief', prompt: 'Using Notion, summarize my latest project brief.' },
    ],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Read inbox and send mail.',
    longDescription:
      'Connect Gmail so NOVA can summarize unread mail, draft replies, and send when you confirm.',
    tone: 'from-red-500 to-red-700',
    initial: 'G',
    category: 'featured',
    hero: true,
    live: true,
    authKind: 'token',
    permissions: [
      { id: 'read', label: 'Read mail', detail: 'Open inbox and thread text', required: true },
      { id: 'search', label: 'Search mail', detail: 'Find messages by query', required: true },
      { id: 'send', label: 'Send mail', detail: 'Send or schedule messages', required: false },
    ],
    actions: [
      { id: 'inbox', label: 'Inbox summary', prompt: 'Using Gmail, summarize my unread inbox.' },
      { id: 'draft', label: 'Draft a reply', prompt: 'Using Gmail, draft a polite reply to my latest unread email.' },
    ],
  },

  // —— Rest of catalog (installable; connect later) ——
  { id: 'gdrive', name: 'Google Drive', description: 'Browse Drive files.', longDescription: 'List and search recent Drive files from NOVA.', tone: 'from-yellow-500 to-blue-600', initial: 'D', category: 'featured', hero: true, live: true, authKind: 'token', permissions: [{ id: 'read', label: 'Read files', detail: 'List and search Drive files', required: true }], actions: [{ id: 'recent', label: 'Recent files', prompt: 'Using Google Drive, list my recent files.' }] },
  { id: 'gcal', name: 'Google Calendar', description: 'View and create events.', longDescription: 'See upcoming events and create calendar events.', tone: 'from-blue-500 to-blue-700', initial: 'C', category: 'featured', hero: true, live: true, authKind: 'token', permissions: [{ id: 'read', label: 'Read events', detail: 'View schedule', required: true }, { id: 'write', label: 'Create events', detail: 'Add calendar events', required: false }], actions: [{ id: 'upcoming', label: 'Upcoming', prompt: 'Using Google Calendar, list my upcoming events.' }] },
  { id: 'slack', name: 'Slack', description: 'Read and post in Slack.', longDescription: 'Bring Slack threads into NOVA chat.', tone: 'from-purple-500 to-pink-600', initial: 'S', category: 'featured', hero: true, live: true, authKind: 'token', permissions: [{ id: 'read', label: 'Read channels', detail: 'Read messages', required: true }, { id: 'search', label: 'Search', detail: 'Search messages', required: false }, { id: 'write', label: 'Post messages', detail: 'Post to channels the bot can see', required: false }], actions: [{ id: 'unread', label: 'Unread channels', prompt: 'Using Slack, summarize unread channels.' }, { id: 'post-fix', label: 'Post a summary', prompt: 'Summarize this fix to #dev' }] },
  { id: 'outlook-mail', name: 'Outlook Email', description: 'Read and send Outlook mail.', longDescription: 'Outlook mail in NOVA.', tone: 'from-sky-500 to-blue-700', initial: 'Oe', category: 'featured', authKind: 'oauth', permissions: [{ id: 'read', label: 'Read mail', detail: 'Open Outlook mail', required: true }], actions: [] },
  { id: 'granola', name: 'Granola', description: 'Add your meeting context.', longDescription: 'Meeting notes context for NOVA.', tone: 'from-emerald-500 to-teal-700', initial: 'Gr', category: 'featured', authKind: 'token', permissions: [{ id: 'read', label: 'Read notes', detail: 'Access meeting notes', required: true }], actions: [] },

  { id: 'fireflies', name: 'Fireflies', description: 'Search meeting transcripts.', longDescription: 'Search Fireflies transcripts.', tone: 'from-orange-500 to-amber-700', initial: 'F', category: 'productivity', authKind: 'token', permissions: [{ id: 'search', label: 'Search', detail: 'Search transcripts', required: true }], actions: [] },
  { id: 'outlook-cal', name: 'Outlook Calendar', description: 'Manage Microsoft Outlook schedules.', longDescription: 'Outlook calendar access.', tone: 'from-sky-500 to-blue-700', initial: 'O', category: 'productivity', authKind: 'oauth', permissions: [{ id: 'read', label: 'Read events', detail: 'View calendar', required: true }], actions: [] },
  { id: 'plaud', name: 'Plaud', description: 'Retrieve insights from Plaud.', longDescription: 'Plaud meeting insights.', tone: 'from-violet-500 to-indigo-700', initial: 'P', category: 'productivity', authKind: 'token', permissions: [{ id: 'read', label: 'Read', detail: 'Read insights', required: true }], actions: [] },
  { id: 'otter', name: 'Otter.ai', description: 'Search meetings from Otter.ai.', longDescription: 'Otter meeting search.', tone: 'from-cyan-500 to-teal-700', initial: 'Ot', category: 'productivity', authKind: 'oauth', permissions: [{ id: 'search', label: 'Search', detail: 'Search meetings', required: true }], actions: [] },
  { id: 'atlassian', name: 'Atlassian Rovo', description: 'Manage Jira and Confluence fast.', longDescription: 'Jira and Confluence in NOVA.', tone: 'from-blue-600 to-indigo-800', initial: 'A', category: 'productivity', authKind: 'oauth', permissions: [{ id: 'read', label: 'Read', detail: 'Read issues and pages', required: true }], actions: [] },
  { id: 'linear', name: 'Linear', description: 'Track issues and product work.', longDescription: 'Linear issues in NOVA.', tone: 'from-indigo-500 to-violet-800', initial: 'L', category: 'productivity', hero: true, live: true, authKind: 'token', permissions: [{ id: 'read', label: 'Read issues', detail: 'List and read issues', required: true }, { id: 'write', label: 'Create issues', detail: 'Create or update issues', required: false }], actions: [{ id: 'mine', label: 'My issues', prompt: 'Using Linear, list my open issues.' }] },
  { id: 'monday', name: 'Monday.com', description: 'Plan projects and team workflows.', longDescription: 'Monday boards in NOVA.', tone: 'from-rose-500 to-pink-700', initial: 'Mo', category: 'productivity', authKind: 'token', permissions: [{ id: 'read', label: 'Read boards', detail: 'View boards', required: true }], actions: [] },

  { id: 'canva', name: 'Canva', description: 'Create, review, and edit designs.', longDescription: 'Canva designs in NOVA.', tone: 'from-cyan-400 to-blue-600', initial: 'Ca', category: 'creativity', authKind: 'oauth', permissions: [{ id: 'read', label: 'Read designs', detail: 'Open designs', required: true }], actions: [] },
  { id: 'higgsfield', name: 'Higgsfield', description: 'Every image and video model.', longDescription: 'Image and video models.', tone: 'from-fuchsia-500 to-purple-700', initial: 'H', category: 'creativity', authKind: 'token', permissions: [{ id: 'write', label: 'Generate', detail: 'Create media', required: true }], actions: [] },
  { id: 'product-design', name: 'Product Design', description: 'Explore and prototype ideas.', longDescription: 'Product design tools.', tone: 'from-rose-500 to-pink-700', initial: 'PD', category: 'creativity', authKind: 'none', permissions: [{ id: 'read', label: 'Browse', detail: 'Browse patterns', required: true }], actions: [] },
  { id: 'figma', name: 'Figma', description: 'Design to code workflows.', longDescription: 'Open Figma files by link and post comments.', tone: 'from-orange-400 to-purple-600', initial: 'Fi', category: 'creativity', hero: true, live: true, authKind: 'token', permissions: [{ id: 'read', label: 'Read files', detail: 'Open Figma files by URL', required: true }, { id: 'write', label: 'Comment', detail: 'Post file comments', required: false }], actions: [{ id: 'frames', label: 'Open a file', prompt: 'Using Figma, open figma.com/file/YOUR_KEY and list pages.' }] },
  { id: 'magnific', name: 'Magnific', description: 'Create images, video, designs.', longDescription: 'Creative generation.', tone: 'from-lime-500 to-emerald-700', initial: 'M', category: 'creativity', authKind: 'token', permissions: [{ id: 'write', label: 'Generate', detail: 'Create assets', required: true }], actions: [] },
  { id: 'heygen', name: 'HeyGen', description: 'Create AI videos.', longDescription: 'AI video creation.', tone: 'from-indigo-500 to-blue-700', initial: 'Hy', category: 'creativity', authKind: 'token', permissions: [{ id: 'write', label: 'Generate video', detail: 'Create videos', required: true }], actions: [] },
  { id: 'mobbin', name: 'Mobbin', description: 'Browse mobile and web UI patterns.', longDescription: 'UI pattern library.', tone: 'from-zinc-500 to-zinc-800', initial: 'Mb', category: 'creativity', authKind: 'token', permissions: [{ id: 'read', label: 'Browse', detail: 'Browse patterns', required: true }], actions: [] },
  { id: 'runway', name: 'Runway', description: 'Generate and edit video with AI.', longDescription: 'Runway video tools.', tone: 'from-emerald-400 to-teal-700', initial: 'Rw', category: 'creativity', authKind: 'token', permissions: [{ id: 'write', label: 'Generate', detail: 'Create video', required: true }], actions: [] },

  { id: 'datadog', name: 'Datadog', description: 'Search and act on your data.', longDescription: 'Observability in NOVA.', tone: 'from-violet-600 to-purple-900', initial: 'Dd', category: 'developer', authKind: 'token', permissions: [{ id: 'search', label: 'Search', detail: 'Search telemetry', required: true }], actions: [] },
  { id: 'supabase', name: 'Supabase', description: 'Manage and query databases.', longDescription: 'Supabase projects in NOVA.', tone: 'from-emerald-500 to-green-800', initial: 'Sb', category: 'developer', hero: true, live: true, authKind: 'token', permissions: [{ id: 'read', label: 'Query', detail: 'Run read queries', required: true }], actions: [{ id: 'projects', label: 'List projects', prompt: 'Using Supabase, list my projects.' }] },
  { id: 'vercel', name: 'Vercel', description: 'Build and deploy web apps and agents.', longDescription: 'Deployments from NOVA.', tone: 'from-zinc-500 to-black', initial: 'V', category: 'developer', hero: true, live: true, authKind: 'token', permissions: [{ id: 'read', label: 'Read deploys', detail: 'View deployments', required: true }, { id: 'write', label: 'Redeploy', detail: 'Trigger redeploys', required: false }], actions: [{ id: 'deploys', label: 'Recent deploys', prompt: 'Using Vercel, list my recent deployments.' }] },
  { id: 'exa', name: 'Exa', description: 'Web search for AI agents.', longDescription: 'Web search tool.', tone: 'from-blue-500 to-indigo-700', initial: 'Ex', category: 'developer', hero: true, live: true, authKind: 'token', permissions: [{ id: 'search', label: 'Search web', detail: 'Run searches', required: true }], actions: [{ id: 'search', label: 'Search the web', prompt: 'Using Exa, search for the latest on this topic.' }] },
  { id: 'neon', name: 'Neon Postgres', description: 'Manage Neon Postgres databases.', longDescription: 'Neon database access.', tone: 'from-green-400 to-emerald-700', initial: 'Ne', category: 'developer', authKind: 'token', permissions: [{ id: 'read', label: 'Query', detail: 'Read data', required: true }], actions: [] },
  { id: 'devpost', name: 'Devpost Hackathons', description: 'Find and submit to hackathons.', longDescription: 'Hackathon discovery.', tone: 'from-sky-500 to-blue-700', initial: 'Dp', category: 'developer', authKind: 'none', permissions: [{ id: 'read', label: 'Browse', detail: 'Browse events', required: true }], actions: [] },
  { id: 'context7', name: 'Context7', description: 'Up to date library docs for agents.', longDescription: 'Library docs for coding.', tone: 'from-amber-500 to-orange-700', initial: 'C7', category: 'developer', authKind: 'token', permissions: [{ id: 'read', label: 'Read docs', detail: 'Fetch docs', required: true }], actions: [] },
  { id: 'wix', name: 'Wix', description: 'Build and manage websites.', longDescription: 'Wix site management.', tone: 'from-yellow-400 to-amber-700', initial: 'Wx', category: 'developer', authKind: 'oauth', permissions: [{ id: 'manage', label: 'Manage sites', detail: 'Update sites', required: true }], actions: [] },

  { id: 'shopify', name: 'Shopify', description: 'Build and manage your store.', longDescription: 'Shopify store tools.', tone: 'from-lime-500 to-green-700', initial: 'Sh', category: 'business', authKind: 'token', permissions: [{ id: 'read', label: 'Read store', detail: 'View products and orders', required: true }], actions: [] },
  { id: 'zoho', name: 'Zoho CRM', description: 'Automate sales operations.', longDescription: 'Zoho CRM access.', tone: 'from-red-500 to-rose-700', initial: 'Z', category: 'business', authKind: 'oauth', permissions: [{ id: 'read', label: 'Read CRM', detail: 'View contacts', required: true }], actions: [] },
  { id: 'hubspot', name: 'HubSpot', description: 'Insights to action in HubSpot.', longDescription: 'HubSpot CRM.', tone: 'from-orange-500 to-red-600', initial: 'Hs', category: 'business', authKind: 'oauth', permissions: [{ id: 'read', label: 'Read CRM', detail: 'View deals', required: true }], actions: [] },
  { id: 'apollo', name: 'Apollo.io', description: 'Find buyers and close deals.', longDescription: 'Apollo sales data.', tone: 'from-yellow-500 to-orange-700', initial: 'Ap', category: 'business', authKind: 'token', permissions: [{ id: 'search', label: 'Search', detail: 'Find leads', required: true }], actions: [] },
  { id: 'quickbooks', name: 'QuickBooks', description: 'Track finances and invoices.', longDescription: 'QuickBooks data.', tone: 'from-green-500 to-emerald-800', initial: 'Qb', category: 'business', authKind: 'oauth', permissions: [{ id: 'read', label: 'Read finance', detail: 'View invoices', required: true }], actions: [] },
  { id: 'stripe', name: 'Stripe', description: 'Payments and billing workflows.', longDescription: 'Stripe payments.', tone: 'from-indigo-500 to-violet-800', initial: 'St', category: 'business', hero: true, live: true, authKind: 'token', permissions: [{ id: 'read', label: 'Read payments', detail: 'View charges', required: true }], actions: [{ id: 'charges', label: 'Recent charges', prompt: 'Using Stripe, list my recent charges.' }] },
  { id: 'salesforce', name: 'Salesforce', description: 'CRM and customer workflows.', longDescription: 'Salesforce CRM.', tone: 'from-sky-400 to-blue-700', initial: 'Sf', category: 'business', authKind: 'oauth', permissions: [{ id: 'read', label: 'Read CRM', detail: 'View records', required: true }], actions: [] },
  { id: 'asana', name: 'Asana', description: 'Organize work across teams.', longDescription: 'Asana tasks.', tone: 'from-rose-400 to-red-700', initial: 'As', category: 'business', authKind: 'oauth', permissions: [{ id: 'read', label: 'Read tasks', detail: 'View tasks', required: true }], actions: [] },

  { id: 'teams', name: 'Teams', description: 'Collaborate in Microsoft Teams.', longDescription: 'Teams chat.', tone: 'from-purple-500 to-indigo-700', initial: 'T', category: 'communication', authKind: 'oauth', permissions: [{ id: 'read', label: 'Read chats', detail: 'Read messages', required: true }], actions: [] },
  { id: 'discord', name: 'Discord', description: 'Community and chat workflows.', longDescription: 'Discord servers.', tone: 'from-indigo-500 to-violet-700', initial: 'Dc', category: 'communication', hero: true, live: true, authKind: 'token', permissions: [{ id: 'read', label: 'Read channels', detail: 'Read messages', required: true }, { id: 'write', label: 'Post messages', detail: 'Post to a channel by id', required: false }], actions: [{ id: 'servers', label: 'My servers', prompt: 'Using Discord, list my servers.' }] },
  { id: 'zoom', name: 'Zoom', description: 'Meetings and recordings.', longDescription: 'Zoom meetings.', tone: 'from-blue-400 to-blue-700', initial: 'Zm', category: 'communication', authKind: 'oauth', permissions: [{ id: 'read', label: 'Read meetings', detail: 'View meetings', required: true }], actions: [] },
  { id: 'telegram', name: 'Telegram', description: 'Message and bot integrations.', longDescription: 'Telegram bots.', tone: 'from-sky-400 to-cyan-700', initial: 'Tg', category: 'communication', authKind: 'token', permissions: [{ id: 'send', label: 'Send', detail: 'Send messages', required: true }], actions: [] },
  { id: 'whatsapp', name: 'WhatsApp', description: 'Business messaging support.', longDescription: 'WhatsApp business.', tone: 'from-emerald-400 to-green-700', initial: 'Wa', category: 'communication', authKind: 'oauth', permissions: [{ id: 'send', label: 'Send', detail: 'Send messages', required: true }], actions: [] },
  { id: 'superhuman', name: 'Superhuman Mail', description: 'Fast email triage and replies.', longDescription: 'Superhuman mail.', tone: 'from-violet-500 to-purple-800', initial: 'Su', category: 'communication', authKind: 'oauth', permissions: [{ id: 'read', label: 'Read mail', detail: 'Open mail', required: true }], actions: [] },
  { id: 'intercom', name: 'Intercom', description: 'Customer messaging and support.', longDescription: 'Intercom support.', tone: 'from-blue-500 to-indigo-700', initial: 'In', category: 'communication', authKind: 'token', permissions: [{ id: 'read', label: 'Read inbox', detail: 'View conversations', required: true }], actions: [] },
];

function defaultState(plugin: PluginDef): PluginRuntimeState {
  return {
    installed: false,
    connected: false,
    enabledInChat: false,
    permissions: plugin.permissions.filter(p => p.required).map(p => p.id),
  };
}

export function getPluginById(id: string) {
  return PLUGIN_CATALOG.find(p => p.id === id);
}

export function loadPluginState(): PluginStateMap {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) {
      const gmail = getPluginById('gmail');
      if (!gmail) return {};
      return {
        gmail: { ...defaultState(gmail), installed: true, connected: false, enabledInChat: false },
      };
    }
    return JSON.parse(raw) as PluginStateMap;
  } catch {
    return {};
  }
}

export function savePluginState(map: PluginStateMap) {
  // Never persist raw tokens in localStorage. vault holds them.
  const scrubbed: PluginStateMap = {};
  for (const [id, state] of Object.entries(map)) {
    const { token: legacyToken, ...rest } = state;
    if (legacyToken && legacyToken !== 'demo-token') {
      setPluginToken(id, legacyToken);
    }
    scrubbed[id] = rest;
  }
  localStorage.setItem(STATE_KEY, JSON.stringify(scrubbed));
  window.dispatchEvent(new Event('NOVA:plugins-changed'));
}

export function getPluginRuntime(id: string, map: PluginStateMap): PluginRuntimeState {
  const plugin = getPluginById(id);
  if (!plugin) {
    return { installed: false, connected: false, enabledInChat: false, permissions: [] };
  }
  const base = map[id] ?? defaultState(plugin);
  const vault = getPluginToken(id);
  return {
    ...base,
    token: vault || base.token,
  };
}

export function upsertPluginRuntime(
  map: PluginStateMap,
  id: string,
  patch: Partial<PluginRuntimeState>,
): PluginStateMap {
  const current = getPluginRuntime(id, map);
  const safePatch = { ...patch };
  delete safePatch.token;
  const nextState: PluginRuntimeState = { ...current, ...safePatch };
  delete nextState.token;
  const next = { ...map, [id]: nextState };
  savePluginState(next);
  return next;
}

export function getInstalledPlugins(map: PluginStateMap) {
  return PLUGIN_CATALOG.filter(p => getPluginRuntime(p.id, map).installed);
}

export function getChatEnabledPlugins(map: PluginStateMap) {
  return PLUGIN_CATALOG.filter(p => {
    if (!isPluginWired(p.id)) return false;
    const s = getPluginRuntime(p.id, map);
    return s.installed && s.connected && s.enabledInChat && s.permissions.length > 0;
  });
}

/** Installed + connected with a token — enough to run live API asks from chat. */
export function getConnectedPlugins(map: PluginStateMap) {
  return PLUGIN_CATALOG.filter(p => {
    if (!isPluginWired(p.id)) return false;
    const s = getPluginRuntime(p.id, map);
    if (!s.installed || !s.connected || s.permissions.length === 0) return false;
    return Boolean(String(s.token || '').trim());
  });
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when the user ask clearly targets this plugin (name, Try-in-chat label, or mention regex). */
export function pluginIntentMatches(pluginId: string, userText: string): boolean {
  const raw = String(userText || '').trim();
  if (!raw) return false;
  if (/<!--nova-debug-clinic-->/i.test(raw) || /^Debug this\.\s*find the issue/i.test(raw) || /^\[Debug\]/i.test(raw)) {
    return false;
  }
  const lower = raw.toLowerCase();
  const plugin = getPluginById(pluginId);
  if (!plugin) return pluginMentionsText(pluginId, lower);

  const name = plugin.name.toLowerCase();
  // Explicit: "Using Gmail…", "via Slack", "from Notion"
  if (new RegExp(`\\b(?:using|via|from|with|in)\\s+${escapeRegExp(name)}\\b`, 'i').test(raw)) {
    return true;
  }
  if (lower === name || lower.startsWith(`${name},`) || lower.startsWith(`${name}:`)) {
    return true;
  }

  // Try-in-chat chip labels / full prompts (exact or near-exact)
  for (const action of plugin.actions || []) {
    const label = String(action.label || '').trim().toLowerCase();
    const prompt = String(action.prompt || '').trim().toLowerCase();
    if (label && (lower === label || lower === `${label}.`)) return true;
    if (prompt && lower === prompt) return true;
    // Short chip text typed manually: "Inbox summary", "Unread channels", "My issues"
    if (label.length >= 4 && (lower === label || lower.includes(label))) {
      // Avoid "mail" false positives: require label to be a substantial share of the ask
      if (lower.length <= label.length + 12) return true;
    }
  }

  return pluginMentionsText(pluginId, lower);
}

/** Stub / live plugin replies for chat. */
export async function runPluginAction(
  pluginId: string,
  userText: string,
  token?: string,
  permissions?: PluginPermission[],
): Promise<string | null> {
  const handler = getCatalogPluginHandler(pluginId);
  if (!handler) return null;

  if (!pluginIntentMatches(pluginId, userText)) return null;

  const needed = intentPermission(pluginId, userText);
  if (permissions && permissions.length > 0) {
    const hasListOrRead = hasPluginPermission(permissions, 'list') || hasPluginPermission(permissions, 'read');
    if (needed === 'list' && !hasListOrRead) {
      return requirePluginPermission(permissions, 'list', pluginId);
    }
    if (!hasPluginPermission(permissions, 'read') && needed === 'read' && !hasListOrRead) {
      return requirePluginPermission(permissions, 'read', pluginId);
    }
    if (needed === 'write' && !hasPluginPermission(permissions, 'write')) {
      return requirePluginPermission(permissions, 'write', pluginId);
    }
    if (needed === 'search' && !hasPluginPermission(permissions, 'search') && !hasPluginPermission(permissions, 'read')) {
      return requirePluginPermission(permissions, 'search', pluginId);
    }
    if (needed === 'write' && hasPluginPermission(permissions, 'write') === false) {
      return requirePluginPermission(permissions, 'write', pluginId);
    }
  }

  if (!handler.noToken && !token) {
    return runPluginStub(pluginId, userText);
  }

  try {
    return await runCatalogPluginLive(pluginId, token || '', userText, { permissions });
  } catch (err) {
    const name = getPluginById(pluginId)?.name || pluginId;
    const msg = err instanceof Error ? err.message : 'Request failed';
    return [`${name} · error`, '', msg].join('\n');
  }
}

/** Honest reply when a plugin is named but not connected. never invent account data. */
export function runPluginStub(pluginId: string, userText: string): string | null {
  if (!pluginIntentMatches(pluginId, userText)) return null;

  const name = getPluginById(pluginId)?.name || pluginId;
  return [
    `${name} is not connected.`,
    '',
    `Open Plugins, connect ${name} with a real token, then ask again.`,
    'I will not invent inbox, repo, or calendar data.',
  ].join('\n');
}

/**
 * Pick which connected plugin should handle this ask.
 * Prefers: explicit "Using X" → exact Try-in-chat label → mention regex.
 * When several match (e.g. "issue"), prefer the one named in the text, else first id order.
 */
export function detectPluginIntent(text: string, candidateIds: string[]): string | null {
  if (!candidateIds.length) return null;
  const raw = String(text || '').trim();
  if (!raw) return null;
  // Debug clinic owns the turn — never hand "issue"/"problems" to GitHub/Linear.
  if (/<!--nova-debug-clinic-->/i.test(raw) || /^Debug this\.\s*find the issue/i.test(raw) || /^\[Debug\]/i.test(raw)) {
    return null;
  }
  const lower = raw.toLowerCase();

  type Hit = { id: string; score: number };
  const hits: Hit[] = [];

  for (const id of candidateIds) {
    const plugin = getPluginById(id);
    if (!plugin) continue;
    const name = plugin.name.toLowerCase();
    let score = 0;

    if (new RegExp(`\\b(?:using|via|from|with)\\s+${escapeRegExp(name)}\\b`, 'i').test(raw)) {
      score = 100;
    } else {
      for (const action of plugin.actions || []) {
        const label = String(action.label || '').trim().toLowerCase();
        const prompt = String(action.prompt || '').trim().toLowerCase();
        if (label && (lower === label || lower === `${label}.`)) {
          score = Math.max(score, 90);
        } else if (prompt && lower === prompt) {
          score = Math.max(score, 90);
        } else if (label.length >= 4 && lower.length <= label.length + 12 && lower.includes(label)) {
          score = Math.max(score, 80);
        }
      }
      if (score === 0 && pluginIntentMatches(id, raw)) {
        // Bare mention — boost if plugin name appears
        score = lower.includes(name) || lower.includes(id.replace(/-/g, ' ')) ? 60 : 40;
      }
    }

    if (score > 0) hits.push({ id, score });
  }

  if (!hits.length) return null;
  hits.sort((a, b) => b.score - a.score);
  return hits[0].id;
}
