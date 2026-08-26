/**
 * MCP-style tool catalog + invoke for ARK.
 *
 * Local tools mirror capabilities Chat already has. Registered external servers
 * (Settings → MCP) support stdio tools/list + tools/call. Full auto agent loop
 * (model picks tools mid-reply) can come later — Chat can already call by name.
 */

import {
  getMcpServer,
  listEnabledMcpServers,
  listMcpServers,
  patchMcpServerProbe,
  type McpServerConfig,
} from '@/lib/mcpServers';

export type ArkMcpTool = {
  name: string;
  description: string;
  local: boolean;
  status: 'ready' | 'planned' | 'registered';
  /** External server id when status is registered. */
  serverId?: string;
  serverName?: string;
};

/** Tools ARK can already perform locally (chat / project / media). */
export function listLocalMcpTools(): ArkMcpTool[] {
  return [
    {
      name: 'ark.project.read',
      description: 'Read files from a granted project folder',
      local: true,
      status: 'ready',
    },
    {
      name: 'ark.project.write',
      description: 'Apply edits / scaffolds to a bound project',
      local: true,
      status: 'ready',
    },
    {
      name: 'ark.media.image',
      description: 'Generate or recreate an image via ARK Image Core',
      local: true,
      status: 'ready',
    },
    {
      name: 'ark.brain.generate',
      description: 'Run a chat/coding turn through ARK Engine / Auto',
      local: true,
      status: 'ready',
    },
    {
      name: 'ark.mcp.connect',
      description: 'Register / call external MCP servers in Settings → MCP',
      local: true,
      status: 'ready',
    },
  ];
}

/** Cached tools from enabled registered servers (last successful probe). */
export function listRegisteredMcpTools(): ArkMcpTool[] {
  const out: ArkMcpTool[] = [];
  for (const server of listEnabledMcpServers()) {
    const tools = server.lastTools || [];
    if (!tools.length) {
      out.push({
        name: `${server.name}·(not probed)`,
        description: server.lastError
          ? `Last error: ${server.lastError}`
          : 'Open Settings → MCP and press Test to list tools',
        local: false,
        status: 'registered',
        serverId: server.id,
        serverName: server.name,
      });
      continue;
    }
    for (const t of tools) {
      out.push({
        name: t.name,
        description: t.description || `From ${server.name}`,
        local: false,
        status: 'registered',
        serverId: server.id,
        serverName: server.name,
      });
    }
  }
  return out;
}

export function listAllMcpTools(): ArkMcpTool[] {
  return [...listLocalMcpTools(), ...listRegisteredMcpTools()];
}

export function formatMcpToolsHelp(): string {
  const local = listLocalMcpTools();
  const servers = listMcpServers();
  const enabled = servers.filter(s => s.enabled);
  const registered = listRegisteredMcpTools().filter(t => !t.name.includes('(not probed)'));

  const lines = [
    'ARK MCP tools',
    '',
    '**Local (built-in)**',
    ...local.map(t => `• **${t.name}** — ${t.description}`),
    '',
  ];

  if (!servers.length) {
    lines.push(
      '**External servers** — none registered yet.',
      'Add one in **Settings → MCP** (stdio command + args). Press **Test** to list tools.',
      'Ask again with “list MCP tools” after you add a server.',
    );
  } else {
    lines.push(`**Registered servers** (${enabled.length} enabled / ${servers.length} total)`);
    for (const s of servers) {
      const n = s.lastTools?.length ?? 0;
      const state = !s.enabled
        ? 'disabled'
        : s.lastError
          ? `error: ${s.lastError}`
          : n
            ? `${n} tool${n === 1 ? '' : 's'}`
            : 'not probed yet';
      lines.push(`• **${s.name}** (${s.transport}) — ${state}`);
    }
    if (registered.length) {
      lines.push('', '**Tools from enabled servers**');
      for (const t of registered.slice(0, 40)) {
        const from = t.serverName ? ` · ${t.serverName}` : '';
        lines.push(`• **${t.name}**${from} — ${t.description}`);
      }
      if (registered.length > 40) {
        lines.push(`…and ${registered.length - 40} more (see Settings → MCP).`);
      }
      lines.push(
        '',
        '**Call a tool:** `run mcp tool read_graph` or `call mcp create_entities {"name":"…"}`',
      );
    } else {
      lines.push('', 'Press **Test** on an enabled server in Settings → MCP, then call a tool by name.');
    }
  }

  return lines.join('\n');
}

/** Meta asks about what ARK can do — answer locally instead of the raw chat model. */
export function looksLikeArkCapabilityAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/\b(?:list|show)\s+mcp\b/i.test(t) || /\bmcp tools\b/i.test(t)) return true;
  if (/\bwhat can you do\b/i.test(t) || /\bwhat(?:'s| is) ark\b/i.test(t)) return true;
  if (/\b(?:break down|explain|describe)\b/i.test(t) && /\b(?:ark\.|mcp\b|tools?)\b/i.test(t)) return true;
  if (/\bark\.[a-z0-9_-]+\.[a-z0-9_-]+\b/i.test(t) && /\b(?:what|how|explain|break|describe)\b/i.test(t)) {
    return true;
  }
  if (/\bcan you\b/i.test(t)) {
    if (/\b(?:edit|read|write|create|modify|change|save|access|open|summarize|generate|connect|run)\b/i.test(t)
      && /\b(?:files?|disk|folder|project|markdown|\.md\b|loops?|code|mcp|tools?)\b/i.test(t)) {
      return true;
    }
    if (/\b(?:edit|read|write)\s+files?\b/i.test(t)) return true;
  }
  if (/\bi need you,?\s*ark\b/i.test(t)) return true;
  if (/\bhow long is your memory\b/i.test(t)) return true;
  return false;
}

export function formatArkCapabilitiesHelp(opts?: {
  hasProject?: boolean;
  hasFolderAccess?: boolean;
}): string {
  const hasProject = Boolean(opts?.hasProject);
  const hasFolder = Boolean(opts?.hasFolderAccess);
  const lines = [
    '**What ARK can do in Chat**',
    '',
    'ARK routes your message before the local model answers. When you see **ARK** under a reply, a built-in handler ran — not the raw LLM alone.',
    '',
    '**Files & projects**',
    `• **Read files** — say *read notes.txt* or attach files and ask to summarize.${hasFolder ? ' Folder access is on.' : ' Enable Desktop/Documents in **Settings → Security** first.'}`,
    `• **Create a file** — *create a file named Notes.md in my project folder* (one file, not a whole app).`,
    `• **Create / scaffold a project** — *build me a landing page called MyApp* (writes real files under Desktop\\Projects).${hasProject ? ' This chat already has a project bound.' : ''}`,
    `• **Edit bound project files** — open **Code** or bind a folder, then ask to change UI, add pages, fix bugs.`,
    '',
    '**Built-in tools (same as MCP list)**',
    '• **ark.project.read** — read from a granted folder',
    '• **ark.project.write** — apply edits / scaffolds to a bound project',
    '• **ark.media.image** — generate images (Image tab)',
    '• **ark.brain.generate** — run a turn through ARK Engine / your pinned model',
    '• **ark.mcp.connect** — register external MCP servers in **Settings → MCP**',
    '',
    '**What the local model alone cannot do**',
    'Small local models (Qwen 7B, etc.) do not touch your disk by themselves. Ask ARK directly: *create file …*, *read …*, *list my projects*, or use **Code** for multi-file edits.',
    '',
    'Say **list MCP tools** for registered external servers.',
  ];
  return lines.join('\n');
}

/** Probe one server via Electron host; persist tools / error on the registry. */
export async function probeMcpServer(server: McpServerConfig): Promise<{
  ok: boolean;
  tools: { name: string; description?: string }[];
  error?: string | null;
}> {
  const api = window.arkDesktop?.mcpListTools;
  if (!api) {
    const error = 'Desktop MCP host unavailable — run the Electron app (not browser-only).';
    patchMcpServerProbe(server.id, {
      lastError: error,
      lastCheckedAt: new Date().toISOString(),
      lastTools: [],
    });
    return { ok: false, tools: [], error };
  }

  try {
    const res = await api({
      id: server.id,
      transport: server.transport,
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      url: server.url,
    });
    const tools = Array.isArray(res.tools) ? res.tools.filter(t => t?.name) : [];
    const error = res.ok ? null : (res.error || 'Probe failed');
    patchMcpServerProbe(server.id, {
      lastTools: tools,
      lastError: error,
      lastCheckedAt: new Date().toISOString(),
    });
    return { ok: Boolean(res.ok), tools, error };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err || 'Probe failed');
    patchMcpServerProbe(server.id, {
      lastError: error,
      lastCheckedAt: new Date().toISOString(),
      lastTools: [],
    });
    return { ok: false, tools: [], error };
  }
}

export async function callMcpTool(
  server: McpServerConfig,
  name: string,
  args?: Record<string, unknown>,
): Promise<{ ok: boolean; content: string; error?: string | null }> {
  const api = window.arkDesktop?.mcpCallTool;
  if (!api) {
    return {
      ok: false,
      content: '',
      error: 'Desktop MCP host unavailable — run the Electron app.',
    };
  }
  try {
    const res = await api({
      server: {
        id: server.id,
        transport: server.transport,
        command: server.command,
        args: server.args,
        cwd: server.cwd,
        url: server.url,
      },
      name,
      arguments: args || {},
    });
    return {
      ok: Boolean(res.ok),
      content: String(res.content || ''),
      error: res.ok ? null : (res.error || 'Tool call failed'),
    };
  } catch (err) {
    return {
      ok: false,
      content: '',
      error: err instanceof Error ? err.message : String(err || 'Tool call failed'),
    };
  }
}

export type McpCallIntent = {
  toolName: string;
  serverId?: string;
  args: Record<string, unknown>;
};

/**
 * Parse “run/call/use mcp tool NAME …” (optional JSON args).
 * Returns null if this isn’t an explicit MCP invoke.
 */
export function parseMcpCallIntent(content: string): McpCallIntent | null {
  const text = String(content || '').trim();
  if (!text) return null;

  const m = text.match(
    /\b(?:run|call|use|invoke)\s+(?:the\s+)?(?:mcp\s+)?(?:tool\s+)?([a-zA-Z0-9_.:-]+)\b/i,
  );
  if (!m) return null;
  // Require mcp / tool / "run mcp" style so normal “use Autocomplete” doesn’t fire.
  if (!/\bmcp\b/i.test(text) && !/\b(?:run|call|invoke)\s+(?:the\s+)?tool\b/i.test(text)) {
    return null;
  }

  const toolName = m[1];
  if (!toolName || toolName.toLowerCase().startsWith('ark.')) return null;

  let args: Record<string, unknown> = {};
  const jsonMatch = text.match(/\{[\s\S]*\}$/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore bad json */
    }
  }

  return { toolName, args };
}

/** Resolve which enabled server owns a tool name (prefer last probe cache). */
export function resolveMcpToolServer(toolName: string): McpServerConfig | null {
  const name = String(toolName || '').trim();
  if (!name) return null;
  const hits = listRegisteredMcpTools().filter(
    t => t.serverId && t.name.toLowerCase() === name.toLowerCase(),
  );
  if (hits[0]?.serverId) {
    return getMcpServer(hits[0].serverId);
  }
  // Fallback: first enabled stdio server (caller should have probed).
  return listEnabledMcpServers().find(s => s.transport === 'stdio') || null;
}
