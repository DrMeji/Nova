/** Browser-assisted plugin auth. open provider login/token pages in the system browser. */

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
  vercel: {
    label: 'Vercel tokens',
    url: 'https://vercel.com/account/tokens',
    hint: 'Create a Vercel access token and paste it below. ARK verifies it live.',
  },
  discord: {
    label: 'Discord developer portal',
    url: 'https://discord.com/developers/applications',
    hint: 'Create a bot, copy the bot token, paste below.',
  },
  datadog: {
    label: 'Datadog API keys',
    url: 'https://app.datadoghq.com/organization-settings/api-keys',
    hint: 'Paste API key, or apiKey|appKey for monitors. ARK verifies live.',
  },
  shopify: {
    label: 'Shopify admin token',
    url: 'https://admin.shopify.com/store',
    hint: 'Paste as mystore.myshopify.com|shpat_… admin API token.',
  },
  neon: {
    label: 'Neon console',
    url: 'https://console.neon.tech/app/settings/api-keys',
    hint: 'Create a personal API key and paste below.',
  },
  monday: {
    label: 'Monday.com API',
    url: 'https://developer.monday.com/api-reference/docs/authentication',
    hint: 'Paste your Monday API v2 token.',
  },
  asana: {
    label: 'Asana developer console',
    url: 'https://app.asana.com/0/my-apps',
    hint: 'Create a personal access token and paste it below.',
  },
  atlassian: {
    label: 'Atlassian API tokens',
    url: 'https://id.atlassian.com/manage-profile/security/api-tokens',
    hint: 'Paste as site.atlassian.net|email@you.com|api_token.',
  },
  salesforce: {
    label: 'Salesforce connected apps',
    url: 'https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm',
    hint: 'Paste as https://instance.my.salesforce.com|access_token.',
  },
  apollo: {
    label: 'Apollo.io API',
    url: 'https://app.apollo.io/#/settings/integrations/api',
    hint: 'Create an API key and paste below.',
  },
  intercom: {
    label: 'Intercom developer hub',
    url: 'https://developers.intercom.com/',
    hint: 'Paste a workspace access token.',
  },
  fireflies: {
    label: 'Fireflies.ai integrations',
    url: 'https://app.fireflies.ai/integrations',
    hint: 'Paste your Fireflies API key.',
  },
  context7: {
    label: 'Context7',
    url: 'https://context7.com',
    hint: 'Paste your Context7 API key for library docs search.',
  },
  zoho: {
    label: 'Zoho API console',
    url: 'https://api-console.zoho.com/',
    hint: 'Paste a Zoho CRM OAuth access token.',
  },
  quickbooks: {
    label: 'Intuit developer',
    url: 'https://developer.intuit.com/',
    hint: 'Paste as realmId|access_token from your QuickBooks app.',
  },
  whatsapp: {
    label: 'Meta for developers',
    url: 'https://developers.facebook.com/',
    hint: 'Paste as phoneNumberId|access_token from WhatsApp Cloud API.',
  },
  wix: {
    label: 'Wix developers',
    url: 'https://dev.wix.com/',
    hint: 'Paste an OAuth access token for your Wix app.',
  },
  heygen: {
    label: 'HeyGen API',
    url: 'https://app.heygen.com/settings?nav=API',
    hint: 'Paste your HeyGen API key.',
  },
  runway: {
    label: 'Runway developer',
    url: 'https://dev.runwayml.com/',
    hint: 'Paste your Runway API key.',
  },
  stripe: {
    label: 'Stripe API keys',
    url: 'https://dashboard.stripe.com/apikeys',
    hint: 'Create a secret key (test or live) and paste it below. ARK verifies live.',
  },
  exa: {
    label: 'Exa API keys',
    url: 'https://dashboard.exa.ai/api-keys',
    hint: 'Create an API key and paste it below. ARK runs a live search to verify.',
  },
  supabase: {
    label: 'Supabase access tokens',
    url: 'https://supabase.com/dashboard/account/tokens',
    hint: 'Create a personal access token for the Management API and paste below.',
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
