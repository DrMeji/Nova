import { useEffect, useState } from 'react';
import { Cable, ChevronDown, ChevronRight, Pencil, Trash2, RefreshCw } from 'lucide-react';
import {
  listMcpServers,
  upsertMcpServer,
  removeMcpServer,
  setMcpServerEnabled,
  MCP_CHANGED_EVENT,
  type McpServerConfig,
  type McpTransport,
} from '@/lib/mcpServers';
import { probeMcpServer } from '@/lib/arkMcp';

function serverCommand(server: McpServerConfig) {
  if (server.transport === 'stdio') {
    return `${server.command || '?'} ${server.args || ''}`.trim();
  }
  return server.url || 'sse';
}

export function McpView() {
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>(() => listMcpServers());
  const [mcpEditingId, setMcpEditingId] = useState<string | null>(null);
  const [mcpFormOpen, setMcpFormOpen] = useState(false);
  const [mcpName, setMcpName] = useState('');
  const [mcpTransport, setMcpTransport] = useState<McpTransport>('stdio');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpArgs, setMcpArgs] = useState('');
  const [mcpCwd, setMcpCwd] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpBusyId, setMcpBusyId] = useState<string | null>(null);
  const [mcpFlash, setMcpFlash] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setMcpServers(listMcpServers());
    window.addEventListener(MCP_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(MCP_CHANGED_EVENT, refresh);
  }, []);

  const flash = (msg: string, ms = 2800) => {
    setMcpFlash(msg);
    window.setTimeout(() => setMcpFlash(''), ms);
  };

  const resetMcpForm = () => {
    setMcpEditingId(null);
    setMcpFormOpen(false);
    setMcpName('');
    setMcpTransport('stdio');
    setMcpCommand('');
    setMcpArgs('');
    setMcpCwd('');
    setMcpUrl('');
  };

  const openMcpCreate = () => {
    resetMcpForm();
    setMcpFormOpen(true);
  };

  const openMcpEdit = (server: McpServerConfig) => {
    setMcpEditingId(server.id);
    setMcpFormOpen(true);
    setMcpName(server.name);
    setMcpTransport(server.transport);
    setMcpCommand(server.command || '');
    setMcpArgs(server.args || '');
    setMcpCwd(server.cwd || '');
    setMcpUrl(server.url || '');
  };

  const saveMcpForm = () => {
    const name = mcpName.trim() || 'MCP server';
    if (mcpTransport === 'stdio' && !mcpCommand.trim()) {
      flash('stdio needs a command (e.g. npx, node, python)');
      return;
    }
    if (mcpTransport === 'sse' && !mcpUrl.trim()) {
      flash('Remote MCP needs an endpoint URL');
      return;
    }
    upsertMcpServer({
      id: mcpEditingId || undefined,
      name,
      transport: mcpTransport,
      command: mcpTransport === 'stdio' ? mcpCommand : '',
      args: mcpTransport === 'stdio' ? mcpArgs : '',
      cwd: mcpTransport === 'stdio' ? mcpCwd : '',
      url: mcpTransport === 'sse' ? mcpUrl.trim() : '',
    });
    setMcpServers(listMcpServers());
    resetMcpForm();
    flash(mcpEditingId ? 'Server updated' : 'Server added');
  };

  const runMcpProbe = async (server: McpServerConfig) => {
    if (mcpBusyId) return;
    setMcpBusyId(server.id);
    setMcpFlash(`Testing ${server.name}…`);
    try {
      const res = await probeMcpServer(server);
      setMcpServers(listMcpServers());
      setMcpFlash(
        res.ok
          ? `${server.name}: ${res.tools.length} tool${res.tools.length === 1 ? '' : 's'}`
          : `${server.name}: ${res.error || 'probe failed'}`,
      );
      if (res.ok) setExpandedId(server.id);
    } finally {
      setMcpBusyId(null);
      window.setTimeout(() => setMcpFlash(''), 4000);
    }
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 sm:px-8 py-8 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-content-primary tracking-tight">MCP</h1>
            <p className="mt-1 text-sm text-content-tertiary leading-relaxed">
              Connect external tool servers for Chat. stdio (local) or remote URL (HTTP / SSE).
            </p>
          </div>
          <button type="button" className="ark-btn-primary text-xs shrink-0" onClick={openMcpCreate}>
            Add server
          </button>
        </div>

        {mcpFlash ? (
          <p className="text-xs text-content-secondary">{mcpFlash}</p>
        ) : null}

        {mcpFormOpen && (
          <div className="rounded-2xl border border-surface-border bg-ark-navy-900/50 p-4 space-y-3">
            <p className="text-sm font-medium text-content-primary">
              {mcpEditingId ? 'Edit server' : 'New server'}
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-[11px] text-content-tertiary">Name</span>
                <input
                  className="ark-input w-full text-sm"
                  value={mcpName}
                  onChange={e => setMcpName(e.target.value)}
                  placeholder="Memory"
                />
              </label>
              <div className="sm:col-span-2 flex gap-2">
                {(['stdio', 'sse'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      mcpTransport === t
                        ? 'border-sky-500/50 bg-sky-500/10 text-sky-200'
                        : 'border-surface-border text-content-tertiary hover:text-content-secondary'
                    }`}
                    onClick={() => setMcpTransport(t)}
                  >
                    {t === 'stdio' ? 'stdio' : 'Remote URL'}
                  </button>
                ))}
              </div>
              {mcpTransport === 'stdio' ? (
                <>
                  <label className="block space-y-1">
                    <span className="text-[11px] text-content-tertiary">Command</span>
                    <input
                      className="ark-input w-full text-sm font-mono"
                      value={mcpCommand}
                      onChange={e => setMcpCommand(e.target.value)}
                      placeholder="npx"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] text-content-tertiary">Args</span>
                    <input
                      className="ark-input w-full text-sm font-mono"
                      value={mcpArgs}
                      onChange={e => setMcpArgs(e.target.value)}
                      placeholder="-y @modelcontextprotocol/server-memory"
                    />
                  </label>
                  <label className="block space-y-1 sm:col-span-2">
                    <span className="text-[11px] text-content-tertiary">Working folder (optional)</span>
                    <input
                      className="ark-input w-full text-sm font-mono"
                      value={mcpCwd}
                      onChange={e => setMcpCwd(e.target.value)}
                      placeholder="C:\\Projects\\my-app"
                    />
                  </label>
                </>
              ) : (
                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-[11px] text-content-tertiary">MCP endpoint URL</span>
                  <input
                    className="ark-input w-full text-sm font-mono"
                    value={mcpUrl}
                    onChange={e => setMcpUrl(e.target.value)}
                    placeholder="https://example.com/mcp"
                  />
                  <span className="text-[10px] text-content-tertiary">
                    Streamable HTTP or legacy HTTP+SSE (same hosts as Cursor remote MCP).
                  </span>
                </label>
              )}
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button type="button" className="ark-btn-ghost text-xs" onClick={resetMcpForm}>
                Cancel
              </button>
              <button type="button" className="ark-btn-primary text-xs" onClick={saveMcpForm}>
                Save
              </button>
            </div>
          </div>
        )}

        {mcpServers.length === 0 && !mcpFormOpen ? (
          <div className="rounded-2xl border border-dashed border-surface-border px-5 py-10 text-center">
            <Cable className="w-5 h-5 text-content-tertiary mx-auto mb-2.5" />
            <p className="text-sm text-content-secondary">No MCP servers yet</p>
            <p className="text-xs text-content-tertiary mt-1">
              Add one, then ask Chat to list MCP tools.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.12em] text-content-tertiary px-0.5">
              {mcpServers.length} server{mcpServers.length === 1 ? '' : 's'}
            </p>
            <div className="rounded-2xl border border-surface-border overflow-hidden divide-y divide-surface-border">
              {mcpServers.map(server => {
                const toolCount = server.lastTools?.length ?? 0;
                const open = expandedId === server.id;
                const cmd = serverCommand(server);
                return (
                  <div key={server.id} className="bg-ark-navy-900/35">
                    <div className="flex items-center gap-3 px-3.5 py-2.5">
                      <button
                        type="button"
                        className="shrink-0 text-content-tertiary hover:text-content-secondary"
                        aria-label={open ? 'Hide tools' : 'Show tools'}
                        onClick={() => setExpandedId(open ? null : server.id)}
                      >
                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-medium text-content-primary truncate">{server.name}</p>
                          <span className="shrink-0 text-[10px] uppercase tracking-wide text-content-tertiary">
                            {server.transport}
                          </span>
                          {server.transport === 'sse' ? (
                            <span className="shrink-0 rounded-full bg-sky-500/15 text-sky-300 px-2 py-0.5 text-[10px]">
                              Remote
                            </span>
                          ) : null}
                          {toolCount > 0 ? (
                            <span className="shrink-0 rounded-full bg-ark-navy-950/80 border border-white/10 px-2 py-0.5 text-[10px] text-content-tertiary">
                              {toolCount} tool{toolCount === 1 ? '' : 's'}
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] text-content-tertiary">Not probed</span>
                          )}
                        </div>
                        <p className="text-[11px] text-content-tertiary font-mono truncate mt-0.5" title={cmd}>
                          {cmd}
                        </p>
                        {server.lastError ? (
                          <p className="text-[11px] text-rose-300/90 truncate mt-0.5">{server.lastError}</p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          className="h-8 w-8 rounded-lg text-content-tertiary hover:text-content-secondary hover:bg-surface-hover/60 flex items-center justify-center disabled:opacity-40"
                          title="Test"
                          disabled={mcpBusyId === server.id}
                          onClick={() => void runMcpProbe(server)}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${mcpBusyId === server.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          type="button"
                          className="h-8 w-8 rounded-lg text-content-tertiary hover:text-content-secondary hover:bg-surface-hover/60 flex items-center justify-center"
                          title="Edit"
                          onClick={() => openMcpEdit(server)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className="h-8 w-8 rounded-lg text-content-tertiary hover:text-rose-300 hover:bg-rose-500/10 flex items-center justify-center"
                          title="Remove"
                          onClick={() => {
                            if (!window.confirm(`Remove “${server.name}”?`)) return;
                            void window.arkDesktop?.mcpStop?.({ id: server.id });
                            removeMcpServer(server.id);
                            setMcpServers(listMcpServers());
                            if (expandedId === server.id) setExpandedId(null);
                            flash('Server removed');
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          className={`relative ml-1 rounded-full transition-colors shrink-0 ${
                            server.enabled ? 'bg-content-primary' : 'bg-ark-navy-700'
                          }`}
                          style={{ height: '22px', width: '40px' }}
                          aria-pressed={server.enabled}
                          title={server.enabled ? 'Enabled' : 'Disabled'}
                          onClick={() => {
                            setMcpServerEnabled(server.id, !server.enabled);
                            setMcpServers(listMcpServers());
                          }}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              server.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {open ? (
                      <div className="px-3.5 pb-3 pl-11">
                        {toolCount > 0 ? (
                          <ul className="rounded-xl border border-surface-border/80 bg-ark-navy-950/40 px-3 py-2 space-y-1 max-h-40 overflow-y-auto">
                            {(server.lastTools || []).map(t => (
                              <li key={t.name} className="text-[11px] text-content-secondary truncate">
                                <span className="font-mono text-content-primary">{t.name}</span>
                                {t.description ? (
                                  <span className="text-content-tertiary"> · {t.description}</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-content-tertiary">
                            No tools cached yet. Press Test to probe this server.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
