/**
 * Local MCP-style tool catalog for ARK.
 *
 * ARK already runs fully local (Electron + Brain API). This module exposes the
 * same capabilities as an MCP tool list so we can wire stdio MCP servers later
 * without inventing a second agent surface.
 *
 * Not a full MCP host yet. inventory + future connect points only.
 */

export type ArkMcpTool = {
  name: string;
  description: string;
  local: boolean;
  status: 'ready' | 'planned';
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
      description: 'Connect an external MCP server (stdio / SSE) into Chat +',
      local: true,
      status: 'planned',
    },
  ];
}

export function formatMcpToolsHelp(): string {
  const tools = listLocalMcpTools();
  const lines = [
    'ARK local tools (MCP-style):',
    '',
    ...tools.map(t => `• **${t.name}**. ${t.description} (${t.status})`),
    '',
    'External MCP servers are planned next: Settings will list connectable servers; Chat `+` will expose their tools.',
  ];
  return lines.join('\n');
}
