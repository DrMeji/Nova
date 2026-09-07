/**
 * Registered external MCP servers (user-defined).
 * Separate from NOVA Plugins (BuildRun catalog) — these are stdio/SSE tool hosts.
 */

export type McpTransport = 'stdio' | 'sse';

export type McpServerConfig = {
  id: string;
  name: string;
  transport: McpTransport;
  /** stdio: executable (e.g. npx, node, python) */
  command?: string;
  /** stdio: args as a single string (split on spaces; quoted segments preserved lightly) */
  args?: string;
  cwd?: string;
  /** sse: server URL */
  url?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** Last tools/list snapshot (name + description only). */
  lastTools?: { name: string; description?: string }[];
  lastError?: string | null;
  lastCheckedAt?: string | null;
};

const KEY = 'NOVA:mcp-servers';
export const MCP_CHANGED_EVENT = 'NOVA:mcp-changed';

function emitChanged() {
  try {
    window.dispatchEvent(new Event(MCP_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

function readAll(): McpServerConfig[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is McpServerConfig => row && typeof row === 'object' && typeof (row as McpServerConfig).id === 'string')
      .map(row => ({
        id: String(row.id),
        name: String(row.name || 'MCP server'),
        transport: row.transport === 'sse' ? 'sse' : 'stdio',
        command: row.command ? String(row.command) : undefined,
        args: row.args != null ? String(row.args) : undefined,
        cwd: row.cwd ? String(row.cwd) : undefined,
        url: row.url ? String(row.url) : undefined,
        enabled: Boolean(row.enabled),
        createdAt: String(row.createdAt || new Date().toISOString()),
        updatedAt: String(row.updatedAt || row.createdAt || new Date().toISOString()),
        lastTools: Array.isArray(row.lastTools)
          ? row.lastTools.map(t => ({
            name: String((t as { name?: string }).name || ''),
            description: (t as { description?: string }).description
              ? String((t as { description?: string }).description)
              : undefined,
          })).filter(t => t.name)
          : undefined,
        lastError: row.lastError != null ? String(row.lastError) : null,
        lastCheckedAt: row.lastCheckedAt != null ? String(row.lastCheckedAt) : null,
      }));
  } catch {
    return [];
  }
}

function writeAll(list: McpServerConfig[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  emitChanged();
}

export function listMcpServers(): McpServerConfig[] {
  return readAll().sort((a, b) => a.name.localeCompare(b.name));
}

export function listEnabledMcpServers(): McpServerConfig[] {
  return listMcpServers().filter(s => s.enabled);
}

export function getMcpServer(id: string): McpServerConfig | null {
  return readAll().find(s => s.id === id) || null;
}

function newId() {
  return `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Split args string into argv (supports simple "quoted" segments). */
export function splitMcpArgs(args: string | undefined): string[] {
  const raw = String(args || '').trim();
  if (!raw) return [];
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    out.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  return out.filter(Boolean);
}

export function upsertMcpServer(input: {
  id?: string;
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string;
  cwd?: string;
  url?: string;
  enabled?: boolean;
}): McpServerConfig {
  const list = readAll();
  const now = new Date().toISOString();
  const id = input.id || newId();
  const existing = list.find(s => s.id === id);
  const next: McpServerConfig = {
    id,
    name: String(input.name || 'MCP server').trim() || 'MCP server',
    transport: input.transport === 'sse' ? 'sse' : 'stdio',
    command: input.command?.trim() || undefined,
    args: input.args?.trim() || undefined,
    cwd: input.cwd?.trim() || undefined,
    url: input.url?.trim() || undefined,
    enabled: input.enabled != null ? Boolean(input.enabled) : (existing?.enabled ?? true),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastTools: existing?.lastTools,
    lastError: existing?.lastError ?? null,
    lastCheckedAt: existing?.lastCheckedAt ?? null,
  };
  const without = list.filter(s => s.id !== id);
  writeAll([...without, next]);
  return next;
}

export function setMcpServerEnabled(id: string, enabled: boolean) {
  const list = readAll();
  const hit = list.find(s => s.id === id);
  if (!hit) return null;
  hit.enabled = enabled;
  hit.updatedAt = new Date().toISOString();
  writeAll(list);
  return hit;
}

export function removeMcpServer(id: string) {
  writeAll(readAll().filter(s => s.id !== id));
}

export function patchMcpServerProbe(
  id: string,
  patch: {
    lastTools?: { name: string; description?: string }[];
    lastError?: string | null;
    lastCheckedAt?: string;
  },
) {
  const list = readAll();
  const hit = list.find(s => s.id === id);
  if (!hit) return null;
  if (patch.lastTools) hit.lastTools = patch.lastTools;
  if ('lastError' in patch) hit.lastError = patch.lastError ?? null;
  if (patch.lastCheckedAt) hit.lastCheckedAt = patch.lastCheckedAt;
  hit.updatedAt = new Date().toISOString();
  writeAll(list);
  return hit;
}
