/**
 * MCP-style tool catalog + invoke for NOVA.
 *
 * Local tools mirror capabilities Chat already has. Registered external servers
 * (sidebar **MCP**) support stdio tools/list + tools/call. Full auto agent loop
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

/** Tools NOVA can already perform locally (chat / project / media). */
export function listLocalMcpTools(): ArkMcpTool[] {
  return [
    {
      name: 'NOVA.project.read',
      description: 'Read files from a granted project folder',
      local: true,
      status: 'ready',
    },
    {
      name: 'NOVA.project.write',
      description: 'Apply edits / scaffolds to a bound project',
      local: true,
      status: 'ready',
    },
    {
      name: 'NOVA.media.image',
      description: 'Generate or recreate an image via NOVA Image Core',
      local: true,
      status: 'ready',
    },
    {
      name: 'NOVA.brain.generate',
      description: 'Run a chat/coding turn through NOVA Engine / Auto',
      local: true,
      status: 'ready',
    },
    {
      name: 'NOVA.mcp.connect',
      description: 'Register / call external MCP servers in the MCP tab',
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
          : 'Open **MCP** and press Test to list tools',
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
    'NOVA MCP tools',
    '',
    '**Local (built-in)**',
    ...local.map(t => `• **${t.name}** — ${t.description}`),
    '',
  ];

  if (!servers.length) {
    lines.push(
      '**External servers** — none registered yet.',
      'Add one in **MCP** (stdio command + args). Press **Test** to list tools.',
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
        lines.push(`…and ${registered.length - 40} more (see **MCP**).`);
      }
      lines.push(
        '',
        '**Call a tool:** `run mcp tool read_graph` or `call mcp create_entities {"name":"…"}`',
      );
    } else {
      lines.push('', 'Press **Test** on an enabled server in **MCP**, then call a tool by name.');
    }
  }

  return lines.join('\n');
}

/** Meta asks about what NOVA can do — answer locally instead of the raw chat model. */
export function looksLikeArkCapabilityAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  // Product planning / build asks must never hit the file-capability canned reply
  // (e.g. "Can you help me plan… Do not create files yet.").
  if (
    /\b(?:help me plan|professional approach|exact\s+(?:visual\s+)?replica|look\s+like|desktop\s+website|landing\s+page)\b/i.test(t)
    || /\b(?:do\s+not|don't|dont)\s+create\s+files?\b/i.test(t)
    || (
      /\b(?:build|create|make|scaffold)\b/i.test(t)
      && /\b(?:website|web\s*app|app|game|apple\.com|netflix|twitch)\b/i.test(t)
    )
  ) {
    return false;
  }
  if (/\b(?:list|show)\s+mcp\b/i.test(t) || /\bmcp tools\b/i.test(t)) return true;
  if (/\bwhat can you do\b/i.test(t) || /\bwhat(?:'s| is) NOVA\b/i.test(t)) return true;
  if (/\b(?:break down|explain|describe)\b/i.test(t) && /\b(?:NOVA\.|mcp\b|tools?)\b/i.test(t)) {
    return true;
  }
  if (/\bark\.[a-z0-9_-]+\.[a-z0-9_-]+\b/i.test(t) && /\b(?:what|how|explain|break|describe)\b/i.test(t)) {
    return true;
  }
  // Direct capability checks — including terse yes/no forms.
  if (/\b(?:can|could|do|will)\s+you\b/i.test(t) || /\bare you able\b/i.test(t)) {
    if (/\b(?:edit|read|write|create|modify|change|rename|save|access|open|delete|update)\b/i.test(t)
      && /\b(?:files?|disk|folder|folders|project|markdown|\.md\b|code|mcp|tools?|png|jpe?g|image|document|notes?)\b/i.test(t)) {
      return true;
    }
    if (/\b(?:edit|read|write|rename)\s+files?\b/i.test(t)) return true;
  }
  if (/\bi need you,?\s*NOVA\b/i.test(t)) return true;
  if (/\bhow long is your memory\b/i.test(t)) return true;
  return false;
}

function isFileCapabilityFocus(question: string): boolean {
  const t = String(question || '');
  if (/\b(?:do\s+not|don't|dont)\s+create\s+files?\b/i.test(t)) return false;
  if (/\b(?:help me plan|professional approach|exact\s+replica|desktop\s+website)\b/i.test(t)) return false;
  return /\b(?:edit|read|write|create|modify|change|rename|delete|update)\b/i.test(t)
    && /\b(?:files?|folder|disk|png|jpe?g|image|document|notes?|markdown|\.md\b)\b/i.test(t);
}

export function formatArkCapabilitiesHelp(opts?: {
  question?: string;
  hasProject?: boolean;
  hasFolderAccess?: boolean;
}): string {
  const question = String(opts?.question || '').trim();
  const hasProject = Boolean(opts?.hasProject);
  const hasFolder = opts?.hasFolderAccess !== false;
  const wantsYesNo = /\byes\s*or\s*no\b|\by\/n\b/i.test(question);

  if (isFileCapabilityFocus(question)) {
    const lead = wantsYesNo
      ? 'Yes.'
      : 'Yes. I can work with files on this PC from Chat.';
    return [
      lead,
      '',
      'I can create, read, edit, rename, and delete files or folders in places you have granted (Desktop, Documents, Downloads, and bound project folders).',
      '',
      'You can answer in one message or step by step. Include:',
      '1. **Where** the file or folder is (paste a full path like `C:\\Users\\you\\Desktop\\Projects\\MyApp`, or say Desktop / Documents / a project name)',
      '2. **What** you want done (read it, rename it, change text inside, create a new file, etc.)',
      '3. **Any details** that matter (new name, what to put inside, what to keep)',
      '',
      '**One-shot example:** *In `C:\\Users\\you\\Desktop\\Projects\\Nova`, read `.cursorrules` and tell me what is in it.*',
      '',
      '**Rename example:** *Rename `draft.md` to `notes.md` in Desktop\\Projects\\MyApp.*',
      '',
      hasProject
        ? 'This chat already has a folder bound, so you can also say *edit config.json* or *rename logo.png to brand.png* without repeating the path.'
        : 'If it is not under Desktop/Documents yet, paste the path or open the folder in Chat first.',
      hasFolder ? '' : 'If folder access is off, turn it on in **Settings → Security**.',
    ].filter(Boolean).join('\n');
  }

  const lines = [
    '**What NOVA can do in Chat**',
    '',
    'I read your message and either run a built-in action (files, projects, MCP) or answer with your local / cloud brain.',
    '',
    '**Files & folders**',
    `• **Create / edit / rename / delete**: point me at a path or project folder and say what to change.${hasFolder ? '' : ' Enable Desktop/Documents in **Settings → Security** first.'}`,
    `• **Create a single file**: e.g. *create Notes.md on my Desktop with …*`,
    `• **Scaffold a project**: e.g. *build a landing page called MyApp* (writes under Desktop\\Projects).${hasProject ? ' This chat already has a project bound.' : ''}`,
    '',
    '**Built-in tools**',
    '• **NOVA.project.read / write**: read and update granted folders',
    '• **NOVA.media.image**: Image tab',
    '• **NOVA.brain.generate**: your pinned local or cloud model',
    '• **NOVA.mcp.connect**: external MCP servers in **MCP**',
    '',
    'Ask directly when you want disk work, for example *create a file…*, *rename this.png to…*, or *edit README*. The local model alone does not touch disk without those intents.',
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

  const toolName = m[1];
  if (!toolName || toolName.toLowerCase().startsWith('NOVA.')) return null;

  const explicitMcp =
    /\bmcp\b/i.test(text) || /\b(?:run|call|invoke)\s+(?:the\s+)?tool\b/i.test(text);

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

  if (explicitMcp) {
    return { toolName, args };
  }

  // Auto-match when the tool name is uniquely registered (no "mcp" keyword needed).
  const registered = listRegisteredMcpTools().filter(
    t => t.name.toLowerCase() === toolName.toLowerCase(),
  );
  if (registered.length !== 1) return null;

  return {
    toolName: registered[0].name,
    serverId: registered[0].serverId,
    args,
  };
}

/** Resolve which enabled server owns a tool name (prefer last probe cache). */
export function resolveMcpToolServer(toolName: string, serverId?: string): McpServerConfig | null {
  if (serverId) {
    const direct = getMcpServer(serverId);
    if (direct?.enabled) return direct;
  }
  const name = String(toolName || '').trim();
  if (!name) return null;
  const hits = listRegisteredMcpTools().filter(
    t => t.serverId && t.name.toLowerCase() === name.toLowerCase(),
  );
  if (hits[0]?.serverId) {
    return getMcpServer(hits[0].serverId);
  }
  // Fallback: first enabled server (stdio or remote).
  return listEnabledMcpServers().find(s => s.transport === 'stdio' || s.transport === 'sse') || null;
}

/** Model-emitted inline MCP invoke: `ARK_MCP:tool_name {"arg":"value"}` */
export function extractInlineMcpToolCalls(text: string): McpCallIntent[] {
  const out: McpCallIntent[] = [];
  const re = /ARK_MCP:\s*([a-zA-Z0-9_.:-]+)\s*(\{[\s\S]*?\})?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const toolName = m[1];
    if (!toolName) continue;
    let args: Record<string, unknown> = {};
    if (m[2]) {
      try {
        const parsed = JSON.parse(m[2]) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        /* ignore */
      }
    }
    const server = resolveMcpToolServer(toolName);
    out.push({ toolName, serverId: server?.id, args });
  }
  return out;
}

/** Run MCP tools the model requested inline (max steps to avoid loops). */
export async function runMcpAutoToolLoop(
  assistantText: string,
  maxSteps = 3,
): Promise<{ text: string; ran: string[] }> {
  let text = String(assistantText || '');
  const ran: string[] = [];
  for (let step = 0; step < maxSteps; step++) {
    const calls = extractInlineMcpToolCalls(text);
    if (!calls.length) break;
    const call = calls[0];
    const server = resolveMcpToolServer(call.toolName, call.serverId);
    if (!server) {
      text = text.replace(/ARK_MCP:[^\n]+/i, `_(MCP tool **${call.toolName}** not found — probe servers in Settings → MCP.)_`);
      break;
    }
    const res = await callMcpTool(server, call.toolName, call.args);
    ran.push(call.toolName);
    const block = res.ok
      ? `\n\n**${call.toolName}** (${server.name})\n\`\`\`\n${res.content || '(empty)'}\n\`\`\``
      : `\n\n**${call.toolName}** failed: ${res.error || 'unknown error'}`;
    text = text.replace(/ARK_MCP:[^\n]+/i, block.trim());
  }
  return { text, ran };
}

export function mcpAutoToolSystemHint(): string {
  const tools = listRegisteredMcpTools().slice(0, 24);
  if (!tools.length) return '';
  const names = tools.map(t => t.name).join(', ');
  return [
    'Registered MCP tools (user enabled servers):',
    names,
    'To call one, emit a single line: ARK_MCP:tool_name {"optional":"json args"}',
    'NOVA will execute it and replace the line with results.',
  ].join('\n');
}
