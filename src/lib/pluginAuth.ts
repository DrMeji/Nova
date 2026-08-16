/** Browser-assisted plugin auth — open provider login/token pages in the system browser. */

export type PluginAuthLink = {
  label: string;
  url: string;
  hint: string;
};

const AUTH_LINKS: Record<string, PluginAuthLink> = {
  github: {
    label: 'GitHub token settings',
    url: 'https://github.com/settings/tokens?type=beta',
    hint: 'Create a fine-grained or classic PAT, then paste it below. ARK verifies live.',
  },
  notion: {
    label: 'Notion integrations',
    url: 'https://www.notion.so/my-integrations',
    hint: 'Create an internal integration, share pages with it, paste the secret below.',
  },
  gmail: {
    label: 'Google OAuth Playground',
    url: 'https://developers.google.com/oauthplayground/',
    hint: 'Authorize gmail.readonly + userinfo.email, copy the access token, paste below.',
  },
  slack: {
    label: 'Slack apps',
    url: 'https://api.slack.com/apps',
    hint: 'Create a bot, install to your workspace, paste the xoxb- bot token.',
  },
  linear: {
    label: 'Linear API keys',
    url: 'https://linear.app/settings/api',
    hint: 'Create a personal API key and paste it below.',
  },
  figma: {
    label: 'Figma tokens',
    url: 'https://www.figma.com/developers/api#access-tokens',
    hint: 'Create a personal access token and paste it below.',
  },
  gdrive: {
    label: 'Google OAuth Playground',
    url: 'https://developers.google.com/oauthplayground/',
    hint: 'Authorize drive.readonly, copy the access token, paste below.',
  },
  gcal: {
    label: 'Google OAuth Playground',
    url: 'https://developers.google.com/oauthplayground/',
    hint: 'Authorize calendar.readonly, copy the access token, paste below.',
  },
  'outlook-mail': {
    label: 'Microsoft identity',
    url: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    hint: 'Register an app with Mail.Read, then paste an access token for local testing.',
  },
  'outlook-cal': {
    label: 'Microsoft identity',
    url: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    hint: 'Register an app with Calendars.Read, then paste an access token.',
  },
  teams: {
    label: 'Microsoft identity',
    url: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    hint: 'Register an app with Chat.Read, then paste an access token.',
  },
  zoom: {
    label: 'Zoom marketplace',
    url: 'https://marketplace.zoom.us/develop/create',
    hint: 'Create an OAuth app, then paste an access token for local use.',
  },
  canva: {
    label: 'Canva developers',
    url: 'https://www.canva.com/developers/',
    hint: 'Create an integration, then paste an access token.',
  },
  hubspot: {
    label: 'HubSpot private apps',
    url: 'https://developers.hubspot.com/docs/api/private-apps',
    hint: 'Create a private app token and paste it below.',
  },
  asana: {
    label: 'Asana developer console',
    url: 'https://app.asana.com/0/my-apps',
    hint: 'Create a personal access token and paste it below.',
  },
  salesforce: {
    label: 'Salesforce connected apps',
    url: 'https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm',
    hint: 'Create a connected app, then paste an access token.',
  },
  discord: {
    label: 'Discord developer portal',
    url: 'https://discord.com/developers/applications',
    hint: 'Create a bot, copy the bot token, paste below.',
  },
};

export function getPluginAuthLink(pluginId: string): PluginAuthLink {
  return (
    AUTH_LINKS[pluginId] || {
      label: 'Open provider site',
      url: 'https://ark.local',
      hint: 'Open the provider site, create a token or OAuth access token, then paste it here. ARK stores it in the OS vault.',
    }
  );
}

/** True when this plugin should use browser-open + paste (OAuth-assisted). */
export function usesBrowserAssistedAuth(authKind: 'oauth' | 'token' | 'none') {
  return authKind === 'oauth' || authKind === 'token';
}
