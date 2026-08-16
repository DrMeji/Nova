/** Helpers to honor granted plugin permissions on live API calls. */

export type PluginPerm =
  | 'read'
  | 'write'
  | 'list'
  | 'search'
  | 'send'
  | 'manage';

export function hasPluginPermission(
  permissions: PluginPerm[] | undefined,
  permission: PluginPerm,
) {
  if (!permissions?.length) return false;
  return permissions.includes(permission);
}

export function requirePluginPermission(
  permissions: PluginPerm[] | undefined,
  permission: PluginPerm,
  label: string,
): string | null {
  if (hasPluginPermission(permissions, permission)) return null;
  return [
    `${label} · permission needed`,
    '',
    `This action needs the “${permission}” permission.`,
    'Open Plugins → Connect → Permissions and enable it, then try again.',
  ].join('\n');
}

/** Map user intent to the permission required for common plugin actions. */
export function intentPermission(pluginId: string, userText: string): PluginPerm {
  const lower = userText.toLowerCase();
  if (pluginId === 'github') {
    if (/\b(comment|post|create|write|close)\b/.test(lower)) return 'write';
    if (/\b(search|find|look up)\b/.test(lower)) return 'search';
    return 'read';
  }
  if (pluginId === 'notion') {
    if (/\b(create|update|write|add)\b/.test(lower)) return 'write';
    if (/\b(search|find|look up)\b/.test(lower)) return 'search';
    return 'read';
  }
  if (pluginId === 'gmail' || pluginId === 'slack') {
    if (/\b(send|reply|post|write)\b/.test(lower)) return 'write';
    if (/\b(search|find)\b/.test(lower)) return 'search';
    return 'read';
  }
  if (pluginId === 'linear') {
    if (/\b(create|update|write|close)\b/.test(lower)) return 'write';
    return 'read';
  }
  return 'read';
}
