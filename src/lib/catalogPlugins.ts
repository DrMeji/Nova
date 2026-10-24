/**
 * Live verify + chat runners for every plugin in PLUGIN_CATALOG.
 * Token plugins use pasted API keys / OAuth access tokens (desktopRequest via main).
 */

import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';
import { runGitHubLive, verifyGitHubToken } from '@/lib/github';
import { runNotionLive, verifyNotionToken } from '@/lib/notion';
import { runGmailLive, verifyGmailToken } from '@/lib/gmail';
import { runSlackLive, verifySlackToken } from '@/lib/slack';
import { runLinearLive, verifyLinearToken } from '@/lib/linear';
import { runFigmaLive, verifyFigmaToken } from '@/lib/figma';
import { runDriveLive, verifyDriveToken } from '@/lib/gdrive';
import { runCalendarLive, verifyCalendarToken } from '@/lib/gcal';
import { runVercelLive, verifyVercelToken } from '@/lib/vercel';
import { runDiscordLive, verifyDiscordToken } from '@/lib/discord';
import { runTelegramLive, verifyTelegramToken } from '@/lib/telegram';
import { runStripeLive, verifyStripeToken } from '@/lib/stripe';
import { runExaLive, verifyExaToken } from '@/lib/exa';
import { runSupabaseLive, verifySupabaseMgmtToken } from '@/lib/supabaseMgmt';
import type { PluginPermission } from '@/lib/plugins';

export type PluginLiveOpts = { permissions?: PluginPermission[] };

export type CatalogPluginEntry = {
  verify?: (token: string) => Promise<{ label: string }>;
  runLive: (token: string, userText: string, opts?: PluginLiveOpts) => Promise<string>;
  mention?: RegExp;
  /** Connect without a token (browse-only integrations). */
  noToken?: boolean;
};

function splitPipe(token: string, min = 2): string[] {
  const parts = token.trim().split('|').map(s => s.trim()).filter(Boolean);
  if (parts.length < min) {
    throw new Error(`Use format: ${'part|'.repeat(min - 1)}token`);
  }
  return parts;
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token.trim()}` };
}

async function verifyMicrosoftToken(token: string) {
  const res = await desktopRequest('https://graph.microsoft.com/v1.0/me', {
    method: 'GET',
    headers: bearer(token),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Microsoft token rejected'));
  const me = res.data as { displayName?: string; mail?: string; userPrincipalName?: string };
  return { label: me.displayName || me.mail || me.userPrincipalName || 'Microsoft' };
}

async function runOutlookMailLive(token: string, userText: string) {
  await verifyMicrosoftToken(token);
  const res = await desktopRequest('https://graph.microsoft.com/v1.0/me/messages?$top=8&$select=subject,from,receivedDateTime,isRead', {
    method: 'GET',
    headers: bearer(token),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Outlook mail request failed'));
  const data = res.data as { value?: { subject?: string; from?: { emailAddress?: { name?: string } }; receivedDateTime?: string; isRead?: boolean }[] };
  const rows = (data.value || []).map(m =>
    `- ${m.isRead ? '' : '**'}${m.subject || '(no subject)'}**${m.isRead ? '' : '**'} · ${m.from?.emailAddress?.name || 'unknown'}`,
  );
  return ['Outlook · inbox', '', rows.length ? rows.join('\n') : 'No messages returned.', userText ? '' : ''].filter(Boolean).join('\n');
}

async function runOutlookCalLive(token: string, _userText: string) {
  await verifyMicrosoftToken(token);
  const res = await desktopRequest('https://graph.microsoft.com/v1.0/me/events?$top=8&$select=subject,start,end&$orderby=start/dateTime', {
    method: 'GET',
    headers: bearer(token),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Outlook calendar request failed'));
  const data = res.data as { value?: { subject?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }[] };
  const rows = (data.value || []).map(e =>
    `- **${e.subject || 'Event'}** · ${e.start?.dateTime || '?'} → ${e.end?.dateTime || '?'}`,
  );
  return ['Outlook Calendar · upcoming', '', rows.length ? rows.join('\n') : 'No events returned.'].join('\n');
}

async function runTeamsLive(token: string, _userText: string) {
  await verifyMicrosoftToken(token);
  const res = await desktopRequest('https://graph.microsoft.com/v1.0/me/joinedTeams?$top=12', {
    method: 'GET',
    headers: bearer(token),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Teams request failed'));
  const data = res.data as { value?: { displayName?: string; description?: string }[] };
  const rows = (data.value || []).map(t => `- **${t.displayName || 'Team'}**${t.description ? ` · ${t.description}` : ''}`);
  return ['Microsoft Teams · joined teams', '', rows.length ? rows.join('\n') : 'No teams returned.'].join('\n');
}

async function verifyDatadogToken(token: string) {
  const [apiKey, appKey] = token.includes('|') ? splitPipe(token, 1) : [token.trim(), ''];
  const headers: Record<string, string> = { 'DD-API-KEY': apiKey };
  if (appKey) headers['DD-APPLICATION-KEY'] = appKey;
  const res = await desktopRequest('https://api.datadoghq.com/api/v1/validate', { method: 'GET', headers });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Datadog key rejected'));
  return { label: 'Datadog' };
}

async function runDatadogLive(token: string, _userText: string) {
  await verifyDatadogToken(token);
  const [apiKey, appKey] = token.includes('|') ? splitPipe(token, 1) : [token.trim(), ''];
  const headers: Record<string, string> = { 'DD-API-KEY': apiKey };
  if (appKey) headers['DD-APPLICATION-KEY'] = appKey;
  const res = await desktopRequest('https://api.datadoghq.com/api/v1/monitor?group_states=alert,warn', {
    method: 'GET',
    headers,
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Datadog monitors request failed'));
  const data = res.data as { monitors?: { name?: string; overall_state?: string; id?: number }[] };
  const rows = (data.monitors || []).slice(0, 10).map(m => `- **${m.name || m.id}** · ${m.overall_state || '—'}`);
  return ['Datadog · monitors (alert/warn)', '', rows.length ? rows.join('\n') : 'No alerting monitors.'].join('\n');
}

async function verifyShopifyToken(token: string) {
  const [shop, accessToken] = splitPipe(token, 2);
  const host = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const res = await desktopRequest(`https://${host}/admin/api/2024-10/shop.json`, {
    method: 'GET',
    headers: { 'X-Shopify-Access-Token': accessToken },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Shopify token rejected'));
  const data = res.data as { shop?: { name?: string } };
  return { label: data.shop?.name || 'Shopify' };
}

async function runShopifyLive(token: string, _userText: string) {
  const [shop, accessToken] = splitPipe(token, 2);
  const host = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const res = await desktopRequest(`https://${host}/admin/api/2024-10/products.json?limit=8`, {
    method: 'GET',
    headers: { 'X-Shopify-Access-Token': accessToken },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Shopify products request failed'));
  const data = res.data as { products?: { title?: string; status?: string; id?: number }[] };
  const rows = (data.products || []).map(p => `- **${p.title || p.id}** · ${p.status || '—'}`);
  return ['Shopify · products', '', rows.length ? rows.join('\n') : 'No products returned.'].join('\n');
}

async function verifyHubspotToken(token: string) {
  const res = await desktopRequest('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
    method: 'GET',
    headers: bearer(token),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'HubSpot token rejected'));
  return { label: 'HubSpot' };
}

async function runHubspotLive(token: string, _userText: string) {
  await verifyHubspotToken(token);
  const res = await desktopRequest('https://api.hubapi.com/crm/v3/objects/contacts?limit=8&properties=firstname,lastname,email', {
    method: 'GET',
    headers: bearer(token),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'HubSpot contacts request failed'));
  const data = res.data as { results?: { properties?: { firstname?: string; lastname?: string; email?: string } }[] };
  const rows = (data.results || []).map(c => {
    const p = c.properties || {};
    return `- **${[p.firstname, p.lastname].filter(Boolean).join(' ') || 'Contact'}** · ${p.email || '—'}`;
  });
  return ['HubSpot · contacts', '', rows.length ? rows.join('\n') : 'No contacts returned.'].join('\n');
}

async function verifyNeonToken(token: string) {
  const res = await desktopRequest('https://console.neon.tech/api/v2/projects', {
    method: 'GET',
    headers: bearer(token),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Neon token rejected'));
  const projects = (res.data as { projects?: { name?: string }[] })?.projects || [];
  return { label: projects[0]?.name ? `Neon · ${projects[0].name}` : 'Neon' };
}

async function runNeonLive(token: string, _userText: string) {
  await verifyNeonToken(token);
  const res = await desktopRequest('https://console.neon.tech/api/v2/projects', {
    method: 'GET',
    headers: bearer(token),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Neon projects request failed'));
  const projects = (res.data as { projects?: { name?: string; id?: string; region_id?: string }[] })?.projects || [];
  const rows = projects.slice(0, 10).map(p => `- **${p.name || p.id}** · ${p.region_id || '—'}`);
  return ['Neon · projects', '', rows.length ? rows.join('\n') : 'No projects on this token.'].join('\n');
}

async function verifyMondayToken(token: string) {
  const res = await desktopRequest('https://api.monday.com/v2', {
    method: 'POST',
    headers: { Authorization: token.trim(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ me { id name } }' }),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Monday token rejected'));
  const data = res.data as { data?: { me?: { name?: string } }; errors?: { message?: string }[] };
  if (data.errors?.length) throw new Error(data.errors[0]?.message || 'Monday error');
  return { label: data.data?.me?.name || 'Monday.com' };
}

async function runMondayLive(token: string, _userText: string) {
  await verifyMondayToken(token);
  const res = await desktopRequest('https://api.monday.com/v2', {
    method: 'POST',
    headers: { Authorization: token.trim(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ boards(limit: 8) { id name state } }' }),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Monday boards request failed'));
  const data = res.data as { data?: { boards?: { name?: string; state?: string }[] } };
  const rows = (data.data?.boards || []).map(b => `- **${b.name || 'Board'}** · ${b.state || '—'}`);
  return ['Monday.com · boards', '', rows.length ? rows.join('\n') : 'No boards returned.'].join('\n');
}

async function verifyAsanaToken(token: string) {
  const res = await desktopRequest('https://app.asana.com/api/1.0/users/me', {
    method: 'GET',
    headers: bearer(token),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Asana token rejected'));
  const data = res.data as { data?: { name?: string } };
  return { label: data.data?.name || 'Asana' };
}

async function runAsanaLive(token: string, _userText: string) {
  await verifyAsanaToken(token);
  const res = await desktopRequest('https://app.asana.com/api/1.0/tasks?limit=8&opt_fields=name,completed,due_on', {
    method: 'GET',
    headers: bearer(token),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Asana tasks request failed'));
  const data = res.data as { data?: { name?: string; completed?: boolean; due_on?: string }[] };
  const rows = (data.data || []).map(t => `- ${t.completed ? '' : '**'}${t.name || 'Task'}${t.completed ? '' : '**'} · due ${t.due_on || '—'}`);
  return ['Asana · tasks', '', rows.length ? rows.join('\n') : 'No tasks returned.'].join('\n');
}

async function verifyAtlassianToken(token: string) {
  const [site, email, apiToken] = splitPipe(token, 3);
  const host = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const basic = btoa(`${email}:${apiToken}`);
  const res = await desktopRequest(`https://${host}/rest/api/3/myself`, {
    method: 'GET',
    headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Atlassian token rejected'));
  const me = res.data as { displayName?: string };
  return { label: me.displayName || 'Atlassian' };
}

async function runAtlassianLive(token: string, _userText: string) {
  const [site, email, apiToken] = splitPipe(token, 3);
  const host = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const basic = btoa(`${email}:${apiToken}`);
  const res = await desktopRequest(`https://${host}/rest/api/3/search?jql=order+by+updated+DESC&maxResults=8`, {
    method: 'GET',
    headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Jira search failed'));
  const data = res.data as { issues?: { key?: string; fields?: { summary?: string; status?: { name?: string } } }[] };
  const rows = (data.issues || []).map(i => `- **${i.key}** · ${i.fields?.summary || '—'} · ${i.fields?.status?.name || '—'}`);
  return ['Atlassian · recent Jira issues', '', rows.length ? rows.join('\n') : 'No issues returned.'].join('\n');
}

async function verifySalesforceToken(token: string) {
  const [instance, accessToken] = splitPipe(token, 2);
  const base = instance.replace(/\/$/, '');
  const res = await desktopRequest(`${base}/services/data/v59.0/`, {
    method: 'GET',
    headers: bearer(accessToken),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Salesforce token rejected'));
  return { label: 'Salesforce' };
}

async function runSalesforceLive(token: string, _userText: string) {
  const [instance, accessToken] = splitPipe(token, 2);
  const base = instance.replace(/\/$/, '');
  const res = await desktopRequest(`${base}/services/data/v59.0/query?q=${encodeURIComponent('SELECT Id,Name FROM Account LIMIT 8')}`, {
    method: 'GET',
    headers: bearer(accessToken),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Salesforce query failed'));
  const data = res.data as { records?: { Name?: string; Id?: string }[] };
  const rows = (data.records || []).map(r => `- **${r.Name || r.Id}**`);
  return ['Salesforce · accounts', '', rows.length ? rows.join('\n') : 'No accounts returned.'].join('\n');
}

async function verifyApolloToken(token: string) {
  const res = await desktopRequest('https://api.apollo.io/v1/auth/health', {
    method: 'GET',
    headers: { 'X-Api-Key': token.trim() },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Apollo API key rejected'));
  return { label: 'Apollo.io' };
}

async function runApolloLive(token: string, userText: string) {
  await verifyApolloToken(token);
  const q = userText.replace(/\bapollo\b/gi, '').trim() || 'software';
  const res = await desktopRequest(`https://api.apollo.io/v1/mixed_people/search?per_page=6&q_keywords=${encodeURIComponent(q)}`, {
    method: 'GET',
    headers: { 'X-Api-Key': token.trim() },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Apollo search failed'));
  const data = res.data as { people?: { name?: string; title?: string; organization_name?: string }[] };
  const rows = (data.people || []).map(p => `- **${p.name || 'Person'}** · ${p.title || '—'} @ ${p.organization_name || '—'}`);
  return ['Apollo.io · people search', '', rows.length ? rows.join('\n') : 'No people returned.'].join('\n');
}

async function verifyZoomToken(token: string) {
  const res = await desktopRequest('https://api.zoom.us/v2/users/me', {
    method: 'GET',
    headers: bearer(token),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Zoom token rejected'));
  const me = res.data as { first_name?: string; last_name?: string; email?: string };
  return { label: [me.first_name, me.last_name].filter(Boolean).join(' ') || me.email || 'Zoom' };
}

async function runZoomLive(token: string, _userText: string) {
  await verifyZoomToken(token);
  const res = await desktopRequest('https://api.zoom.us/v2/users/me/meetings?type=upcoming&page_size=8', {
    method: 'GET',
    headers: bearer(token),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Zoom meetings request failed'));
  const data = res.data as { meetings?: { topic?: string; start_time?: string; join_url?: string }[] };
  const rows = (data.meetings || []).map(m => `- **${m.topic || 'Meeting'}** · ${m.start_time || '—'}`);
  return ['Zoom · upcoming meetings', '', rows.length ? rows.join('\n') : 'No upcoming meetings.'].join('\n');
}

async function verifyIntercomToken(token: string) {
  const res = await desktopRequest('https://api.intercom.io/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Intercom token rejected'));
  return { label: 'Intercom' };
}

async function runIntercomLive(token: string, _userText: string) {
  await verifyIntercomToken(token);
  const res = await desktopRequest('https://api.intercom.io/conversations?per_page=8', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Intercom conversations request failed'));
  const data = res.data as { conversations?: { id?: string; title?: string; state?: string }[] };
  const rows = (data.conversations || []).map(c => `- **${c.title || c.id}** · ${c.state || '—'}`);
  return ['Intercom · conversations', '', rows.length ? rows.join('\n') : 'No conversations returned.'].join('\n');
}

async function verifyFirefliesToken(token: string) {
  const res = await desktopRequest('https://api.fireflies.ai/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ user { name user_id } }' }),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Fireflies API key rejected'));
  const data = res.data as { data?: { user?: { name?: string } }; errors?: { message?: string }[] };
  if (data.errors?.length) throw new Error(data.errors[0]?.message || 'Fireflies error');
  return { label: data.data?.user?.name || 'Fireflies' };
}

async function runFirefliesLive(token: string, _userText: string) {
  await verifyFirefliesToken(token);
  const res = await desktopRequest('https://api.fireflies.ai/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ transcripts { id title date } }' }),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Fireflies transcripts request failed'));
  const data = res.data as { data?: { transcripts?: { title?: string; date?: string }[] } };
  const rows = (data.data?.transcripts || []).slice(0, 8).map(t => `- **${t.title || 'Transcript'}** · ${t.date || '—'}`);
  return ['Fireflies · transcripts', '', rows.length ? rows.join('\n') : 'No transcripts returned.'].join('\n');
}

async function verifyContext7Token(token: string) {
  const res = await desktopRequest('https://context7.com/api/v1/search?query=react', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token.trim()}` },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Context7 API key rejected'));
  return { label: 'Context7' };
}

async function runContext7Live(token: string, userText: string) {
  const q = userText.replace(/\bcontext7\b/gi, '').trim() || 'typescript';
  const res = await desktopRequest(`https://context7.com/api/v1/search?query=${encodeURIComponent(q)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token.trim()}` },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Context7 search failed'));
  const data = res.data as { results?: { title?: string; url?: string }[] } | unknown[];
  const list = Array.isArray(data) ? data : (data as { results?: { title?: string; url?: string }[] }).results || [];
  const rows = (list as { title?: string; url?: string }[]).slice(0, 8).map(r => `- **${r.title || 'Doc'}**${r.url ? ` · ${r.url}` : ''}`);
  return ['Context7 · library docs', '', rows.length ? rows.join('\n') : 'No docs returned.'].join('\n');
}

async function verifyZohoToken(token: string) {
  const res = await desktopRequest('https://www.zohoapis.com/crm/v2/users?type=CurrentUser', {
    method: 'GET',
    headers: { Authorization: `Zoho-oauthtoken ${token.trim()}` },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Zoho token rejected'));
  const data = res.data as { users?: { full_name?: string }[] };
  return { label: data.users?.[0]?.full_name || 'Zoho CRM' };
}

async function runZohoLive(token: string, _userText: string) {
  await verifyZohoToken(token);
  const res = await desktopRequest('https://www.zohoapis.com/crm/v2/Leads?per_page=8', {
    method: 'GET',
    headers: { Authorization: `Zoho-oauthtoken ${token.trim()}` },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Zoho leads request failed'));
  const data = res.data as { data?: { Full_Name?: string; Company?: string; Email?: string }[] };
  const rows = (data.data || []).map(l => `- **${l.Full_Name || 'Lead'}** · ${l.Company || '—'} · ${l.Email || '—'}`);
  return ['Zoho CRM · leads', '', rows.length ? rows.join('\n') : 'No leads returned.'].join('\n');
}

async function verifyQuickbooksToken(token: string) {
  const [realmId, accessToken] = splitPipe(token, 2);
  const res = await desktopRequest(`https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'QuickBooks token rejected'));
  const data = res.data as { CompanyInfo?: { CompanyName?: string } };
  return { label: data.CompanyInfo?.CompanyName || 'QuickBooks' };
}

async function runQuickbooksLive(token: string, _userText: string) {
  const [realmId, accessToken] = splitPipe(token, 2);
  await verifyQuickbooksToken(token);
  const res = await desktopRequest(`https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent('select * from Customer maxresults 8')}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'QuickBooks query failed'));
  const data = res.data as { QueryResponse?: { Customer?: { DisplayName?: string; PrimaryEmailAddr?: { Address?: string } }[] } };
  const rows = (data.QueryResponse?.Customer || []).map(c => `- **${c.DisplayName || 'Customer'}** · ${c.PrimaryEmailAddr?.Address || '—'}`);
  return ['QuickBooks · customers', '', rows.length ? rows.join('\n') : 'No customers returned.'].join('\n');
}

async function verifyWhatsappToken(token: string) {
  const [phoneNumberId, accessToken] = splitPipe(token, 2);
  const res = await desktopRequest(`https://graph.facebook.com/v19.0/${phoneNumberId}`, {
    method: 'GET',
    headers: bearer(accessToken),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'WhatsApp token rejected'));
  return { label: 'WhatsApp Business' };
}

async function runWhatsappLive(token: string, _userText: string) {
  const [phoneNumberId, ] = splitPipe(token, 2);
  await verifyWhatsappToken(token);
  return [
    'WhatsApp Business · connected',
    '',
    `Phone number ID: \`${phoneNumberId}\``,
    'Outbound messaging is configured. Ask NOVA to draft a template message — sending requires approved templates in Meta Business.',
  ].join('\n');
}

async function verifyWixToken(token: string) {
  const res = await desktopRequest('https://www.wixapis.com/apps/v1/apps', {
    method: 'GET',
    headers: bearer(token),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Wix token rejected'));
  return { label: 'Wix' };
}

async function runWixLive(token: string, _userText: string) {
  await verifyWixToken(token);
  return [
    'Wix · connected',
    '',
    'Token verified against Wix Apps API. Use site-specific endpoints in chat for pages, stores, or CMS collections.',
  ].join('\n');
}

async function verifyCanvaToken(token: string) {
  const res = await desktopRequest('https://api.canva.com/rest/v1/users/me', {
    method: 'GET',
    headers: bearer(token),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Canva token rejected'));
  const me = res.data as { profile?: { display_name?: string } };
  return { label: me.profile?.display_name || 'Canva' };
}

async function runCanvaLive(token: string, _userText: string) {
  await verifyCanvaToken(token);
  return ['Canva · connected', '', 'Token verified. Paste a Canva design URL in chat for NOVA to help review or export notes.'].join('\n');
}

async function verifyHeygenToken(token: string) {
  const res = await desktopRequest('https://api.heygen.com/v1/user/info', {
    method: 'GET',
    headers: { 'X-Api-Key': token.trim() },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'HeyGen API key rejected'));
  return { label: 'HeyGen' };
}

async function runHeygenLive(token: string, _userText: string) {
  await verifyHeygenToken(token);
  return ['HeyGen · connected', '', 'API key verified. Ask NOVA to draft a video script — generation runs in HeyGen.'].join('\n');
}

async function verifyRunwayToken(token: string) {
  const res = await desktopRequest('https://api.dev.runwayml.com/v1/tasks', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token.trim()}`, 'X-Runway-Version': '2024-11-06' },
  });
  if (res.status === 401 || res.status === 403) throw new Error('Runway API key rejected');
  return { label: 'Runway' };
}

async function runRunwayLive(token: string, _userText: string) {
  await verifyRunwayToken(token);
  return ['Runway · connected', '', 'API key verified. Describe a clip in chat and NOVA can help craft a Runway prompt.'].join('\n');
}

function passthroughVerify(name: string) {
  return async (token: string) => {
    if (!token.trim()) throw new Error(`Paste your ${name} API key or access token`);
    return { label: name };
  };
}

function passthroughRun(name: string, hint: string) {
  return async (_token: string, userText: string) => [
    `${name} · connected`,
    '',
    hint,
    userText ? `\n(You asked: ${userText.slice(0, 120)}${userText.length > 120 ? '…' : ''})` : '',
  ].filter(Boolean).join('\n');
}

async function runDevpostLive(_token: string, _userText: string) {
  const res = await desktopRequest('https://devpost.com/api/hackathons?challenge_type[]=online&order_by=recent', {
    method: 'GET',
  });
  if (!res.ok) throw new Error('Could not load Devpost hackathons');
  const data = res.data as { hackathons?: { title?: string; url?: string; submission_period_dates?: string }[] };
  const rows = (data.hackathons || []).slice(0, 8).map(h => `- **${h.title || 'Hackathon'}**${h.url ? ` · ${h.url}` : ''}`);
  return ['Devpost · online hackathons', '', rows.length ? rows.join('\n') : 'No hackathons returned.'].join('\n');
}

async function runProductDesignLive(_token: string, userText: string) {
  return [
    'Product Design · NOVA patterns',
    '',
    '- Start from user job → screen → component',
    '- Pair Figma links with NOVA Code for design-to-build',
    '- Use Mobbin / Canva plugins for references when connected',
    userText ? `\nYou asked: ${userText.slice(0, 200)}` : '',
  ].filter(Boolean).join('\n');
}

export const CATALOG_PLUGIN_HANDLERS: Record<string, CatalogPluginEntry> = {
  github: {
    verify: async (token: string) => {
      const user = await verifyGitHubToken(token);
      return { label: user.login || user.name || 'GitHub' };
    },
    runLive: (t, u, o) => runGitHubLive(t, u, o),
    // Use \brepos?\b — bare `repos?` also matches inside “report” and steals project asks.
    mention: /github|\brepos?\b|repositor|pull request|\bprs?\b|list my repos|\bgithub\s+issues?\b|\bopen\s+issues\b|\blist\s+(?:my\s+)?issues\b|\bissues?\s+(?:on|from|in)\s+github\b/i,
  },
  notion: { verify: verifyNotionToken, runLive: (t, u, o) => runNotionLive(t, u, o), mention: /notion|spec|brief|workspace|search docs|pull a brief/i },
  gmail: { verify: verifyGmailToken, runLive: (t, u, o) => runGmailLive(t, u, o), mention: /gmail|inbox|email|\bmail\b|unread|inbox summary|draft a reply/i },
  // Do NOT match bare "channel" / "dm" — those fire on YouTube "channel + views", UI DMs, etc.
  // Require "slack" or a #channel with an explicit Slack action verb — or Try-in-chat labels.
  slack: {
    verify: verifySlackToken,
    runLive: (t, u, o) => runSlackLive(t, u, o),
    mention: /\bslack\b|unread channels|post a summary|(?:\b(?:post|send|message|search|find|look\s*up|summarize|summary)\b[^.\n]{0,80}#[a-z][\w-]{1,80}\b)|(?:#[a-z][\w-]{1,80}\b[^.\n]{0,80}\b(?:post|send|message|search|find|look\s*up|summarize|summary)\b)/i,
  },
  linear: { verify: verifyLinearToken, runLive: (t, u, o) => runLinearLive(t, u, o), mention: /linear|ticket|\bmy issues\b/i },
  figma: { verify: verifyFigmaToken, runLive: (t, u, o) => runFigmaLive(t, u, o), mention: /figma|design file|frame|open a file/i },
  gdrive: { verify: verifyDriveToken, runLive: (t, u, o) => runDriveLive(t, u, o), mention: /(?:google\s+)?drive|docs|sheets|recent files/i },
  gcal: { verify: verifyCalendarToken, runLive: (t, u, o) => runCalendarLive(t, u, o), mention: /calendar|schedule|meeting|agenda|gcal|upcoming events/i },
  vercel: { verify: verifyVercelToken, runLive: (t, u, o) => runVercelLive(t, u, o), mention: /vercel|deploy|recent deploys/i },
  // Do NOT match bare "discord" / "server" / "guild" — those fire on Discord.com-style website builds.
  // Require an explicit Discord *integration* ask (using/via Discord, post to Discord, Discord bot, etc.).
  discord: {
    verify: verifyDiscordToken,
    runLive: (t, u, o) => runDiscordLive(t, u, o),
    mention: /\b(?:using|via|from|in|to)\s+discord\b|\bdiscord\s+(?:plugin|integration|bot|api|webhook)\b|\bpost\s+(?:to\s+)?discord\b|\bdiscord\s+(?:post|send|message|list|unread)\b|\bmy servers\b/i,
  },
  telegram: { verify: verifyTelegramToken, runLive: (t, u) => runTelegramLive(t, u), mention: /telegram|bot/i },
  stripe: { verify: verifyStripeToken, runLive: (t, u) => runStripeLive(t, u), mention: /stripe|charge|payment|recent charges/i },
  exa: { verify: verifyExaToken, runLive: (t, u) => runExaLive(t, u), mention: /exa|web search|search the web/i },
  supabase: { verify: verifySupabaseMgmtToken, runLive: (t, u) => runSupabaseLive(t, u), mention: /supabase|postgres|database/i },

  'outlook-mail': { verify: verifyMicrosoftToken, runLive: runOutlookMailLive, mention: /outlook mail|outlook email|microsoft mail/i },
  'outlook-cal': { verify: verifyMicrosoftToken, runLive: runOutlookCalLive, mention: /outlook calendar|microsoft calendar/i },
  teams: { verify: verifyMicrosoftToken, runLive: runTeamsLive, mention: /\bteams\b|microsoft teams/i },
  datadog: { verify: verifyDatadogToken, runLive: runDatadogLive, mention: /datadog|monitor|telemetry/i },
  shopify: { verify: verifyShopifyToken, runLive: runShopifyLive, mention: /shopify|storefront|myshopify/i },
  hubspot: { verify: verifyHubspotToken, runLive: runHubspotLive, mention: /hubspot|crm/i },
  neon: { verify: verifyNeonToken, runLive: runNeonLive, mention: /neon|postgres/i },
  monday: { verify: verifyMondayToken, runLive: runMondayLive, mention: /monday\.com|monday board/i },
  asana: { verify: verifyAsanaToken, runLive: runAsanaLive, mention: /asana/i },
  atlassian: { verify: verifyAtlassianToken, runLive: runAtlassianLive, mention: /atlassian|jira|confluence/i },
  salesforce: { verify: verifySalesforceToken, runLive: runSalesforceLive, mention: /salesforce|sfdc/i },
  apollo: { verify: verifyApolloToken, runLive: runApolloLive, mention: /apollo\.io|apollo leads/i },
  zoom: { verify: verifyZoomToken, runLive: runZoomLive, mention: /\bzoom\b|zoom meeting/i },
  intercom: { verify: verifyIntercomToken, runLive: runIntercomLive, mention: /intercom/i },
  fireflies: { verify: verifyFirefliesToken, runLive: runFirefliesLive, mention: /fireflies|transcript/i },
  context7: { verify: verifyContext7Token, runLive: runContext7Live, mention: /context7|library docs/i },
  zoho: { verify: verifyZohoToken, runLive: runZohoLive, mention: /zoho/i },
  quickbooks: { verify: verifyQuickbooksToken, runLive: runQuickbooksLive, mention: /quickbooks|qbo/i },
  whatsapp: { verify: verifyWhatsappToken, runLive: runWhatsappLive, mention: /whatsapp/i },
  wix: { verify: verifyWixToken, runLive: runWixLive, mention: /\bwix\b/i },
  canva: { verify: verifyCanvaToken, runLive: runCanvaLive, mention: /canva/i },
  heygen: { verify: verifyHeygenToken, runLive: runHeygenLive, mention: /heygen/i },
  runway: { verify: verifyRunwayToken, runLive: runRunwayLive, mention: /runway/i },

  granola: {
    verify: passthroughVerify('Granola'),
    runLive: passthroughRun('Granola', 'Token stored. Export meeting notes from Granola and paste them in chat for NOVA to summarize.'),
    mention: /granola/i,
  },
  plaud: {
    verify: passthroughVerify('Plaud'),
    runLive: passthroughRun('Plaud', 'Token stored. Paste Plaud exports or transcripts in chat for analysis.'),
    mention: /plaud/i,
  },
  otter: {
    verify: passthroughVerify('Otter.ai'),
    runLive: passthroughRun('Otter.ai', 'Token stored. Paste Otter transcripts or links in chat.'),
    mention: /otter/i,
  },
  higgsfield: {
    verify: passthroughVerify('Higgsfield'),
    runLive: passthroughRun('Higgsfield', 'API key stored. Describe the image or video you want and NOVA will help craft prompts.'),
    mention: /higgsfield/i,
  },
  magnific: {
    verify: passthroughVerify('Magnific'),
    runLive: passthroughRun('Magnific', 'API key stored. Ask NOVA to upscale or enhance an image prompt.'),
    mention: /magnific/i,
  },
  mobbin: {
    verify: passthroughVerify('Mobbin'),
    runLive: passthroughRun('Mobbin', 'Token stored. Paste Mobbin links in chat for UI pattern review.'),
    mention: /mobbin/i,
  },
  superhuman: {
    verify: passthroughVerify('Superhuman'),
    runLive: passthroughRun('Superhuman Mail', 'Token stored. Superhuman has no public REST API — paste email text in chat for triage help.'),
    mention: /superhuman/i,
  },

  devpost: { noToken: true, runLive: runDevpostLive, mention: /devpost|hackathon/i },
  'product-design': { noToken: true, runLive: runProductDesignLive, mention: /product design|design system/i },
};

export function isCatalogPluginId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(CATALOG_PLUGIN_HANDLERS, id);
}

export function getCatalogPluginHandler(id: string): CatalogPluginEntry | undefined {
  return CATALOG_PLUGIN_HANDLERS[id];
}

export function pluginMentionsText(pluginId: string, lower: string): boolean {
  const h = CATALOG_PLUGIN_HANDLERS[pluginId];
  if (h?.mention?.test(lower)) return true;
  if (lower.includes(pluginId)) return true;
  return lower.includes(pluginId.replace(/-/g, ' '));
}

export async function verifyPluginToken(id: string, token: string): Promise<{ label: string }> {
  const h = CATALOG_PLUGIN_HANDLERS[id];
  if (!h) throw new Error('Plugin not wired');
  if (h.noToken) return { label: id };
  if (!h.verify) throw new Error('Plugin verify not configured');
  if (!token.trim()) throw new Error('Paste a token to verify');
  const out = await h.verify(token);
  const label = (out as { label?: string }).label
    || (out as { login?: string }).login
    || id;
  return { label };
}

export async function runCatalogPluginLive(
  id: string,
  token: string,
  userText: string,
  opts?: PluginLiveOpts,
): Promise<string> {
  const h = CATALOG_PLUGIN_HANDLERS[id];
  if (!h) throw new Error('Plugin not wired');
  return h.runLive(token, userText, opts);
}
