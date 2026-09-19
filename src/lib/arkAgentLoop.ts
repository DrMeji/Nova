/**
 * Level-B agent tool loop: search → read → patch/write → run → verify → repeat.
 * Bound workspace only. Allowlisted shell. Abortable. Continuable.
 *
 * Product decision: Nova create/edit may call this via `novaBuildLoop.ts`
 * when `agentLoopOnCreate` / `agentLoopOnEdit` are on (default on for create).
 * Original Nova tools include `ready` + `assets` (Preview Ready + public images).
 * Free forever — no paywall hooks in this loop.
 */

import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { agentCommandAllowed, agentCommandNeedsConfirm } from '@/lib/agentExecution';
import { shouldPreferCloudForCoding, countSourceFiles } from '@/lib/codingCloudPolicy';
import { getLocalPrefs } from '@/lib/localPrefs';
import { searchInFiles, formatSearchHits } from '@/lib/projectInspect';
import { verifyProjectAfterPatch } from '@/lib/postPatchVerify';
import {
  filterAgentFiles,
  listAgentTree,
  readAgentFile,
} from '@/lib/arkAgentRepo';
import {
  buildAgentRepoIndex,
  loadPersistedAgentRepoIndex,
  persistAgentRepoIndex,
  searchAgentIndex,
  updateAgentRepoIndex,
  type AgentRepoIndex,
} from '@/lib/arkAgentIndex';
import { applyAgentPatches, parseAgentPatches } from '@/lib/arkAgentPatch';
import { agentKindGuidance, detectKindFromFiles } from '@/lib/arkAgentPrompts';
import { callMcpTool, listRegisteredMcpTools, resolveMcpToolServer } from '@/lib/arkMcp';
import type { AgentTraceStep } from '@/lib/agentTrace';
import { nextTraceStepId } from '@/lib/agentTrace';

export type AgentLoopToolName =
  | 'list'
  | 'read'
  | 'grep'
  | 'write'
  | 'patch'
  | 'run'
  | 'git_status'
  | 'mcp'
  | 'ready'
  | 'assets'
  | 'done';

export type AgentLoopAction = {
  tool: AgentLoopToolName;
  path?: string;
  query?: string;
  command?: string;
  content?: string;
  answer?: string;
  search?: string;
  replace?: string;
  mcpTool?: string;
  mcpArgs?: Record<string, unknown>;
  raw?: string;
};

export type AgentLoopStep = {
  id: string;
  tool: AgentLoopToolName | 'thought' | 'status' | 'error';
  label: string;
  detail?: string;
  ok?: boolean;
  diff?: string;
};

export type AgentLoopResult = {
  ok: boolean;
  reply: string;
  files: Record<string, string>;
  updated: string[];
  steps: AgentLoopStep[];
  observations: string[];
  stopped: boolean;
  hitStepCap: boolean;
  verifyOk?: boolean;
  diffs: string[];
  providerLabel?: string;
  modelName?: string;
};

export type AgentLoopCallModel = (opts: {
  prompt: string;
  onChunk?: (chunk: string) => void;
}) => Promise<{ reply: string; modelName?: string; providerLabel?: string }>;

export type AgentLoopOpts = {
  brief: string;
  files: Record<string, string>;
  projectId: string;
  projectName?: string;
  diskRoot?: string | null;
  maxSteps?: number;
  shouldAbort?: () => boolean;
  onStep?: (step: AgentLoopStep, all: AgentLoopStep[]) => void;
  callModel: AgentLoopCallModel;
  autoRunAllowlisted?: boolean;
  /** Resume observations from a prior Continue. */
  priorObservations?: string[];
  /** After green verify, optionally git commit (confirm policy still applies). */
  commitOnSuccess?: boolean;
  commitMessage?: string;
};

const DEFAULT_MAX = 24;
const TOOL_NAMES = 'list|read|grep|write|patch|run|git_status|mcp|ready|assets|done';

function pushStep(
  steps: AgentLoopStep[],
  step: Omit<AgentLoopStep, 'id'>,
  onStep?: AgentLoopOpts['onStep'],
): AgentLoopStep {
  const full: AgentLoopStep = { id: nextTraceStepId(steps as unknown as AgentTraceStep[]), ...step };
  steps.push(full);
  onStep?.(full, steps);
  return full;
}

function extractBalancedJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Parse one tool action from model text (tolerant). */
export function parseAgentToolReply(raw: string): AgentLoopAction | null {
  const text = String(raw || '').trim();
  if (!text) return null;

  const jsonStr = extractBalancedJson(text);
  if (jsonStr) {
    try {
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;
      const tool = String(obj.tool || '') as AgentLoopToolName;
      if ((TOOL_NAMES.split('|') as AgentLoopToolName[]).includes(tool)) {
        return {
          tool,
          path: typeof obj.path === 'string' ? obj.path : undefined,
          query: typeof obj.query === 'string' ? obj.query : undefined,
          command: typeof obj.command === 'string' ? obj.command : undefined,
          content: typeof obj.content === 'string' ? obj.content : undefined,
          answer: typeof obj.answer === 'string' ? obj.answer : undefined,
          search: typeof obj.search === 'string' ? obj.search : typeof obj.old === 'string' ? obj.old : undefined,
          replace: typeof obj.replace === 'string' ? obj.replace : typeof obj.new === 'string' ? obj.new : undefined,
          mcpTool: typeof obj.mcpTool === 'string' ? obj.mcpTool : typeof obj.name === 'string' ? obj.name : undefined,
          mcpArgs: obj.args && typeof obj.args === 'object' && !Array.isArray(obj.args)
            ? obj.args as Record<string, unknown>
            : undefined,
          raw: text,
        };
      }
    } catch {
      /* fall through */
    }
  }

  const toolLine = text.match(new RegExp(`^\\s*TOOL:\\s*(${TOOL_NAMES})\\s*$`, 'im'));
  if (toolLine) {
    const tool = toolLine[1].toLowerCase() as AgentLoopToolName;
    const path = text.match(/^\s*PATH:\s*(.+)$/im)?.[1]?.trim();
    const query = text.match(/^\s*QUERY:\s*(.+)$/im)?.[1]?.trim();
    const command = text.match(/^\s*COMMAND:\s*(.+)$/im)?.[1]?.trim();
    const answerBlock = text.match(/^\s*ANSWER:\s*([\s\S]+)/im)?.[1]?.trim();
    const mcpTool = text.match(/^\s*NAME:\s*(.+)$/im)?.[1]?.trim()
      || text.match(/^\s*MCP:\s*(.+)$/im)?.[1]?.trim();
    let content: string | undefined;
    const fence = text.match(/```(?:[\w.-]*)?\n([\s\S]*?)```/);
    if (fence) content = fence[1];
    const search = text.match(/SEARCH:\s*\n([\s\S]*?)\nREPLACE:/i)?.[1];
    const replace = text.match(/REPLACE:\s*\n([\s\S]*?)(?=\nTOOL:|\nPATH:|$)/i)?.[1];
    if (tool === 'write' && /@@@FILE\s+/i.test(text)) {
      return { tool: 'write', content: text, raw: text };
    }
    if (tool === 'patch') {
      return {
        tool: 'patch',
        path,
        search: search?.replace(/\n$/, ''),
        replace: replace?.replace(/\n$/, ''),
        content: text,
        raw: text,
      };
    }
    let mcpArgs: Record<string, unknown> | undefined;
    const argsJson = extractBalancedJson(text.slice(text.toLowerCase().indexOf('args') >= 0 ? text.toLowerCase().indexOf('args') : 0));
    if (tool === 'mcp' && argsJson) {
      try {
        const parsed = JSON.parse(argsJson) as Record<string, unknown>;
        mcpArgs = (parsed.args as Record<string, unknown>) || parsed;
      } catch { /* ignore */ }
    }
    return {
      tool,
      path,
      query,
      command,
      content,
      answer: answerBlock,
      mcpTool,
      mcpArgs,
      raw: text,
    };
  }

  if (/^\s*TOOL:\s*patch\b/im.test(text) || /<<<<<<<\s*SEARCH/i.test(text)) {
    return { tool: 'patch', content: text, path: text.match(/^\s*PATH:\s*(.+)$/im)?.[1]?.trim(), raw: text };
  }
  if (/@@@FILE\s+\S+/i.test(text) || /```[\w./\\-]+\n/.test(text)) {
    return { tool: 'write', content: text, raw: text };
  }
  if (/^\s*DONE\b/i.test(text) || /\bTASK_COMPLETE\b/i.test(text)) {
    const answer = text.replace(/^\s*DONE[:\s]*/i, '').replace(/\bTASK_COMPLETE\b/gi, '').trim();
    return { tool: 'done', answer: answer || text, raw: text };
  }

  // Soft recover: "read src/App.tsx" / "grep useState" in prose
  const softRead = text.match(/\b(?:read|open|show)\s+(?:the\s+)?(?:file\s+)?[`'"]?([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+)[`'"]?/i);
  if (softRead && text.length < 220) {
    return { tool: 'read', path: softRead[1], raw: text };
  }
  const softGrep = text.match(/\b(?:grep|search|find)\s+(?:for\s+)?[`'"]([^`'"]+)[`'"]/i);
  if (softGrep && text.length < 220) {
    return { tool: 'grep', query: softGrep[1], raw: text };
  }

  return null;
}

function buildLoopSystemPrompt(opts: {
  brief: string;
  tree: string;
  projectName: string;
  step: number;
  maxSteps: number;
  observations: string[];
  kindHint: string;
  mcpTools: string;
}): string {
  const obs = opts.observations.length
    ? opts.observations.slice(-10).join('\n\n---\n\n')
    : '(none yet — start with list or grep)';
  return [
    'You are NOVA Agent on a bound project. Use tools until the task is done.',
    'Prefer grep/read before editing. Prefer TOOL: patch over full-file write.',
    'One primary tool per reply (you may include a second read/grep only if needed).',
    'Never touch files outside this workspace. Never invent paths you have not listed or read.',
    'Nova is free — never add paywalls, upgrade CTAs, or license gates in generated UI.',
    '',
    opts.kindHint,
    '',
    'Tool formats (pick ONE):',
    '',
    'TOOL: list',
    'PATH: optional/subdir',
    '',
    'TOOL: read',
    'PATH: relative/file.ext',
    '',
    'TOOL: grep',
    'QUERY: text to find',
    '',
    'TOOL: git_status',
    '',
    'TOOL: patch',
    'PATH: relative/file.ext',
    'SEARCH:',
    'exact old text',
    'REPLACE:',
    'new text',
    '',
    'TOOL: write',
    'PATH: relative/file.ext',
    '```',
    'full file contents (only when creating or large rewrite)',
    '```',
    '',
    'TOOL: run',
    'COMMAND: npm test',
    '',
    'TOOL: ready',
    '(Nova) Check Preview Ready gates for this product',
    '',
    'TOOL: assets',
    '(Nova) Check public heroes/logo/covers referenced by the app',
    '',
    'TOOL: mcp',
    'NAME: serverToolName',
    'ARGS: {"key":"value"}',
    '',
    'TOOL: done',
    'ANSWER: markdown summary',
    '',
    'Or JSON: {"tool":"patch","path":"src/App.tsx","search":"old","replace":"new"}',
    opts.mcpTools ? `\nRegistered MCP tools:\n${opts.mcpTools}` : '',
    '',
    `Project: ${opts.projectName}`,
    `Step ${opts.step}/${opts.maxSteps}`,
    '',
    '## File tree',
    opts.tree,
    '',
    '## User task',
    opts.brief,
    '',
    '## Recent tool results',
    obs,
    '',
    'Respond with the next tool only. If your last reply was invalid, emit a valid TOOL: line now.',
  ].filter(Boolean).join('\n');
}

async function runShellCommand(opts: {
  command: string;
  cwd?: string | null;
  autoRunAllowlisted?: boolean;
}): Promise<{ ok: boolean; output: string; needsConfirm?: boolean }> {
  const command = String(opts.command || '').trim();
  if (!command) return { ok: false, output: 'Empty command' };
  if (!agentCommandAllowed(command)) {
    return { ok: false, output: `Blocked by allowlist: ${command}` };
  }
  if (!window.arkDesktop?.agentRun) {
    return { ok: false, output: 'Shell unavailable outside desktop NOVA' };
  }
  const needsConfirm = agentCommandNeedsConfirm(command) && !opts.autoRunAllowlisted;
  if (needsConfirm) {
    return { ok: false, output: `Needs user confirm for: ${command}`, needsConfirm: true };
  }
  try {
    const ran = await window.arkDesktop.agentRun({
      command,
      cwd: opts.cwd || undefined,
      userConfirmed: true,
      skipConfirm: true,
    });
    const output = String(ran.output || ran.error || '').trim() || (ran.ok ? 'Done.' : 'Failed.');
    return { ok: Boolean(ran.ok), output: output.slice(0, 4000) };
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : 'Run failed' };
  }
}

function writePayloadFromAction(action: AgentLoopAction): string {
  if (action.content && /@@@FILE\s+/i.test(action.content)) return action.content;
  const path = String(action.path || '').trim();
  const body = String(action.content || '');
  if (path && body) {
    return `@@@FILE ${path}\n\`\`\`\n${body.replace(/\n$/, '')}\n\`\`\``;
  }
  return String(action.content || action.raw || '');
}

export function shouldRunAgentLoop(opts: {
  composerMode: 'ask' | 'plan' | 'agent' | 'debug' | 'multitask' | null;
  hasWorkspace: boolean;
  message: string;
}): boolean {
  const prefs = getLocalPrefs();
  if (prefs.agentLoopEnabled === false) return false;
  if (!opts.hasWorkspace) return false;
  if (opts.composerMode === 'ask' || opts.composerMode === 'plan') return false;
  const t = String(opts.message || '');
  // Tiny UI copy/color tweaks belong to deterministic micro-patches, not the agent loop.
  if (
    /\b(?:change|rename|set|make|update)\b[\s\S]{0,80}\b(?:title|headline|heading|hero|button|label|text)\b/i.test(t)
    && !/\b(?:fix|bug|error|refactor|implement|wire|scaffold|layout|page|component|hook)\b/i.test(t)
    && t.length < 180
  ) {
    return false;
  }
  if (opts.composerMode === 'agent' || opts.composerMode === 'debug') return true;
  // Bound workspace: treat concrete edit asks as agent work even without Agent pill.
  return /\b(fix|implement|refactor|add|wire|patch|debug|build|continue|change|update|edit|comment|insert|rename|remove|delete)\b/i.test(opts.message)
    && (
      /\b(file|code|bug|error|component|page|function|test|agent|task|app|index|main|comment|button|css|ui)\b/i.test(opts.message)
      || /\b(NOVA\s+agent\s+was\s+here)\b/i.test(opts.message)
    );
}

export function agentLoopMaxSteps(): number {
  const n = Number(getLocalPrefs().agentLoopMaxSteps);
  if (Number.isFinite(n) && n >= 4 && n <= 60) return Math.floor(n);
  return DEFAULT_MAX;
}

export function agentLoopPreferCloud(files: Record<string, string>, message: string): boolean {
  return shouldPreferCloudForCoding({
    fileCount: countSourceFiles(files),
    message,
    allowFileEdits: true,
    agentLoop: true,
  });
}

export function agentLoopCommitOnSuccess(): boolean {
  return Boolean((getLocalPrefs() as { agentLoopCommitOnSuccess?: boolean }).agentLoopCommitOnSuccess);
}

async function persistWrites(
  opts: AgentLoopOpts,
  files: Record<string, string>,
  changed: string[],
  projectName: string,
): Promise<{ ok: boolean; files: Record<string, string>; error?: string }> {
  if (!changed.length) return { ok: true, files };
  const payload = changed.map(p => `@@@FILE ${p}\n\`\`\`\n${files[p] ?? ''}\n\`\`\``).join('\n\n');
  const applied = await applyChatReplyEdits({
    reply: payload,
    projectId: opts.projectId,
    projectName,
    files,
    userMessage: opts.brief,
    diskRoot: opts.diskRoot,
  });
  if (!applied.ok) return { ok: false, files, error: applied.error || applied.reply };
  return { ok: true, files: filterAgentFiles(applied.files) };
}

export async function runArkAgentLoop(opts: AgentLoopOpts): Promise<AgentLoopResult> {
  const maxSteps = opts.maxSteps ?? agentLoopMaxSteps();
  let files = filterAgentFiles({ ...opts.files });
  const indexScope = String(opts.diskRoot || opts.projectId || opts.projectName || 'project');
  let index: AgentRepoIndex =
    loadPersistedAgentRepoIndex(indexScope, files) || buildAgentRepoIndex(files);
  persistAgentRepoIndex(indexScope, index);
  const updated = new Set<string>();
  const steps: AgentLoopStep[] = [];
  const observations: string[] = [...(opts.priorObservations || [])];
  const diffs: string[] = [];
  let stopped = false;
  let hitStepCap = false;
  let lastModel = '';
  let lastProvider = '';
  let verifyOk: boolean | undefined;
  let parseFails = 0;
  const projectName = opts.projectName || 'Project';
  const kind = detectKindFromFiles(files, opts.brief);
  const kindHint = agentKindGuidance(kind);
  const mcpList = listRegisteredMcpTools()
    .filter(t => t.status === 'registered' && t.name && !t.name.includes('(not probed)'))
    .slice(0, 24)
    .map(t => `- ${t.name}${t.serverName ? ` (${t.serverName})` : ''}: ${t.description}`)
    .join('\n');

  pushStep(steps, {
    tool: 'thought',
    label: opts.priorObservations?.length ? 'Continuing agent steps' : 'Planning agent steps',
    detail: opts.brief.slice(0, 200),
  }, opts.onStep);

  for (let i = 1; i <= maxSteps; i++) {
    if (opts.shouldAbort?.()) {
      stopped = true;
      pushStep(steps, { tool: 'status', label: 'Stopped', detail: 'User stopped the agent' }, opts.onStep);
      break;
    }

    const tree = listAgentTree(files, { limit: 100 });
    const prompt = buildLoopSystemPrompt({
      brief: opts.brief,
      tree,
      projectName,
      step: i,
      maxSteps,
      observations,
      kindHint,
      mcpTools: mcpList,
    });

    pushStep(steps, {
      tool: 'status',
      label: `Thinking (step ${i}/${maxSteps})`,
    }, opts.onStep);

    let modelReply = '';
    try {
      const routed = await opts.callModel({ prompt });
      modelReply = String(routed.reply || '');
      lastModel = routed.modelName || lastModel;
      lastProvider = routed.providerLabel || lastProvider;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Model error';
      pushStep(steps, { tool: 'error', label: 'Model failed', detail: msg, ok: false }, opts.onStep);
      observations.push(`Model error: ${msg}`);
      break;
    }

    if (opts.shouldAbort?.()) {
      stopped = true;
      break;
    }

    let action = parseAgentToolReply(modelReply);
    if (!action) {
      parseFails += 1;
      if (modelReply.length > 120 && !/TOOL:|@@@FILE|"tool"\s*:/i.test(modelReply) && parseFails >= 2) {
        action = { tool: 'done', answer: modelReply, raw: modelReply };
      } else {
        const nudge = parseFails >= 2
          ? 'Still invalid. Reply with ONLY one line starting TOOL: list|read|grep|patch|write|run|ready|assets|mcp|done'
          : 'Could not parse a tool call. Reply with TOOL: list|read|grep|patch|write|run|ready|assets|mcp|done.';
        observations.push(`${nudge}\nLast reply snippet:\n${modelReply.slice(0, 400)}`);
        pushStep(steps, {
          tool: 'error',
          label: 'Unparsed reply — nudging model',
          detail: modelReply.slice(0, 240),
          ok: false,
        }, opts.onStep);
        continue;
      }
    } else {
      parseFails = 0;
    }

    if (action.tool === 'list') {
      const listing = listAgentTree(files, { prefix: action.path, limit: 120 });
      observations.push(`list ${action.path || '/'}:\n${listing}`);
      pushStep(steps, {
        tool: 'list',
        label: action.path ? `Listed ${action.path}` : 'Listed project files',
        detail: listing.slice(0, 500),
        ok: true,
      }, opts.onStep);
      continue;
    }

    if (action.tool === 'read') {
      const read = readAgentFile(files, action.path || '');
      if (!read.ok) {
        observations.push(`read failed: ${read.error} (${read.path})`);
        pushStep(steps, {
          tool: 'read',
          label: `Read failed · ${read.path || 'path'}`,
          detail: read.error,
          ok: false,
        }, opts.onStep);
        continue;
      }
      observations.push(`read ${read.path}:\n\`\`\`\n${read.content}\n\`\`\``);
      pushStep(steps, {
        tool: 'read',
        label: `Read ${read.path}`,
        detail: `${(read.content || '').length} chars`,
        ok: true,
      }, opts.onStep);
      continue;
    }

    if (action.tool === 'grep') {
      const q = String(action.query || '').trim();
      const indexed = searchAgentIndex(index, q, 40);
      let formatted: string;
      let total: number;
      if (indexed.hits.length || indexed.candidateFiles > 0) {
        total = indexed.total;
        formatted = formatSearchHits(
          q,
          indexed.hits.map(h => ({ path: h.path, line: h.line, text: h.text })),
          total,
        );
      } else {
        const slow = searchInFiles(files, q, 40);
        total = slow.total;
        formatted = formatSearchHits(q, slow.hits, total);
      }
      observations.push(formatted);
      pushStep(steps, {
        tool: 'grep',
        label: `Search “${q.slice(0, 40)}”`,
        detail: `${total} hit(s)`,
        ok: true,
      }, opts.onStep);
      continue;
    }

    if (action.tool === 'patch') {
      const patches = parseAgentPatches(action.content || action.raw || '', action.path);
      if (action.path && action.search != null && !patches.length) {
        patches.push({
          path: action.path,
          search: action.search,
          replace: action.replace ?? '',
        });
      }
      if (!patches.length) {
        observations.push('patch failed: no SEARCH/REPLACE blocks found');
        pushStep(steps, { tool: 'patch', label: 'Patch failed', detail: 'No SEARCH/REPLACE', ok: false }, opts.onStep);
        continue;
      }
      const applied = applyAgentPatches(files, patches);
      const okPatches = applied.results.filter(r => r.ok);
      for (const r of applied.results) {
        if (r.diff) diffs.push(r.diff);
        pushStep(steps, {
          tool: 'patch',
          label: r.ok ? `Patched ${r.path}` : `Patch failed · ${r.path}`,
          detail: r.ok ? (r.diff || '').slice(0, 500) : r.error,
          ok: r.ok,
          diff: r.diff,
        }, opts.onStep);
      }
      if (!okPatches.length) {
        observations.push(`patch failed:\n${applied.results.map(r => r.error).join('\n')}`);
        continue;
      }
      files = applied.files;
      for (const p of applied.updated) {
        updated.add(p);
        index = updateAgentRepoIndex(index, p, files[p] || '');
      }
      persistAgentRepoIndex(indexScope, index);
      const persisted = await persistWrites(opts, files, applied.updated, projectName);
      if (!persisted.ok) {
        observations.push(`patch disk write failed: ${persisted.error}`);
      } else {
        files = persisted.files;
      }
      observations.push(`patch ok: ${applied.updated.join(', ')}`);

      const verify = await verifyProjectAfterPatch({
        diskRoot: opts.diskRoot,
        files,
        changedPaths: applied.updated,
        autoInstall: true,
      });
      if (verify.ran) {
        verifyOk = verify.ok;
        if (verify.installedDeps) {
          pushStep(steps, {
            tool: 'run',
            label: 'npm install (missing modules)',
            ok: true,
          }, opts.onStep);
        }
        observations.push(`verify ${verify.command}: ${verify.ok ? 'PASS' : 'FAIL'}\n${(verify.output || '').slice(0, 1500)}`);
        pushStep(steps, {
          tool: 'run',
          label: verify.ok ? `Verify passed · ${verify.command}` : `Verify failed · ${verify.command}`,
          detail: (verify.output || '').slice(0, 600),
          ok: verify.ok,
        }, opts.onStep);
      }
      continue;
    }

    if (action.tool === 'write') {
      const payload = writePayloadFromAction(action);
      pushStep(steps, {
        tool: 'write',
        label: 'Applying edits…',
        detail: action.path || 'files',
      }, opts.onStep);
      const applied = await applyChatReplyEdits({
        reply: payload,
        projectId: opts.projectId,
        projectName,
        files,
        userMessage: opts.brief,
        diskRoot: opts.diskRoot,
      });
      if (applied.ok) {
        files = filterAgentFiles(applied.files);
        for (const p of applied.updated) {
          updated.add(p);
          index = updateAgentRepoIndex(index, p, files[p] || '');
        }
        persistAgentRepoIndex(indexScope, index);
        observations.push(
          `write ok: ${applied.updated.join(', ') || 'no path list'}\n${applied.reply.slice(0, 800)}`,
        );
        pushStep(steps, {
          tool: 'write',
          label: applied.updated.length
            ? `Wrote ${applied.updated.slice(0, 4).join(', ')}${applied.updated.length > 4 ? '…' : ''}`
            : 'Write applied',
          detail: applied.updated.join('\n'),
          ok: true,
        }, opts.onStep);

        const verify = await verifyProjectAfterPatch({
          diskRoot: opts.diskRoot,
          files,
          changedPaths: applied.updated,
          autoInstall: true,
        });
        if (verify.ran) {
          verifyOk = verify.ok;
          if (verify.installedDeps) {
            pushStep(steps, { tool: 'run', label: 'npm install (missing modules)', ok: true }, opts.onStep);
          }
          observations.push(`verify ${verify.command}: ${verify.ok ? 'PASS' : 'FAIL'}\n${(verify.output || '').slice(0, 1500)}`);
          pushStep(steps, {
            tool: 'run',
            label: verify.ok ? `Verify passed · ${verify.command}` : `Verify failed · ${verify.command}`,
            detail: (verify.output || '').slice(0, 600),
            ok: verify.ok,
          }, opts.onStep);
        }
      } else {
        observations.push(`write failed: ${applied.error || applied.reply}`);
        pushStep(steps, {
          tool: 'write',
          label: 'Write failed',
          detail: applied.error || applied.reply.slice(0, 400),
          ok: false,
        }, opts.onStep);
      }
      continue;
    }

    if (action.tool === 'run') {
      const command = String(action.command || '').trim();
      pushStep(steps, { tool: 'run', label: `Run · ${command}`, detail: command }, opts.onStep);
      const ran = await runShellCommand({
        command,
        cwd: opts.diskRoot,
        autoRunAllowlisted: opts.autoRunAllowlisted !== false,
      });
      observations.push(`run \`${command}\` → ${ran.ok ? 'ok' : 'fail'}${ran.needsConfirm ? ' (needs confirm)' : ''}\n${ran.output}`);
      pushStep(steps, {
        tool: 'run',
        label: ran.ok ? `Ran ${command}` : ran.needsConfirm ? `Needs confirm · ${command}` : `Failed · ${command}`,
        detail: ran.output.slice(0, 800),
        ok: ran.ok,
      }, opts.onStep);
      continue;
    }

    if (action.tool === 'git_status') {
      pushStep(steps, { tool: 'git_status', label: 'Git status', detail: opts.diskRoot || '' }, opts.onStep);
      if (!opts.diskRoot) {
        observations.push('git_status failed: no disk root bound');
        pushStep(steps, { tool: 'git_status', label: 'Git status failed', detail: 'No disk root', ok: false }, opts.onStep);
        continue;
      }
      const status = await runShellCommand({
        command: 'git status --short',
        cwd: opts.diskRoot,
        autoRunAllowlisted: true,
      });
      const diff = await runShellCommand({
        command: 'git diff --stat',
        cwd: opts.diskRoot,
        autoRunAllowlisted: true,
      });
      const out = [
        `git status → ${status.ok ? 'ok' : 'fail'}`,
        status.output.slice(0, 1500) || '(clean)',
        'git diff --stat:',
        diff.output.slice(0, 1200) || '(none)',
      ].join('\n');
      observations.push(out);
      pushStep(steps, {
        tool: 'git_status',
        label: status.ok ? 'Git status' : 'Git status failed',
        detail: out.slice(0, 600),
        ok: status.ok,
      }, opts.onStep);
      continue;
    }

    if (action.tool === 'ready') {
      pushStep(steps, { tool: 'ready', label: 'Checking Preview Ready…' }, opts.onStep);
      try {
        const { isPreviewReady, looksLikeFillerStubAppSource } = await import('@/lib/createBuildQuality');
        const appBody = files['src/App.tsx'] || files['src/App.jsx'] || '';
        const ready = isPreviewReady(files, {
          productName: projectName,
          brief: opts.brief,
          requireInteractive: /\b(book|cart|chat|message|lend|search|checkout)\b/i.test(opts.brief),
        });
        const filler = looksLikeFillerStubAppSource(appBody);
        const ok = ready.ok && !filler;
        const detail = ok
          ? 'Preview Ready PASS'
          : [...(ready.reasons || []), ...(filler ? ['filler stub App'] : [])].join('; ');
        observations.push(`ready → ${ok ? 'PASS' : 'FAIL'}\n${detail}`);
        pushStep(steps, {
          tool: 'ready',
          label: ok ? 'Preview Ready PASS' : 'Preview Ready FAIL',
          detail: detail.slice(0, 600),
          ok,
        }, opts.onStep);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'ready check failed';
        observations.push(`ready error: ${msg}`);
        pushStep(steps, { tool: 'ready', label: 'Preview Ready error', detail: msg, ok: false }, opts.onStep);
      }
      continue;
    }

    if (action.tool === 'assets') {
      pushStep(steps, { tool: 'assets', label: 'Checking public assets…' }, opts.onStep);
      try {
        const appBlob = [
          files['src/App.tsx'] || '',
          files['src/App.jsx'] || '',
          files['src/App.css'] || '',
          files['index.html'] || '',
        ].join('\n');
        const hrefs = [...appBlob.matchAll(/(?:src|href)=["'](\/[^"']+\.(?:png|jpe?g|gif|webp|svg|ico))["']/gi)]
          .map((m) => m[1].replace(/^\//, ''));
        const unique = [...new Set(hrefs)].slice(0, 40);
        const missing: string[] = [];
        const wiped: string[] = [];
        for (const rel of unique) {
          const pub = rel.startsWith('public/') ? rel : `public/${rel}`;
          const body = files[pub] ?? files[rel];
          if (body == null && !Object.keys(files).some((k) => k.replace(/\\/g, '/').endsWith(rel))) {
            // Presence-only keys may be empty string — treat empty as present binary stub.
            const emptyKey = Object.keys(files).find((k) => {
              const n = k.replace(/\\/g, '/');
              return n === pub || n === rel || n.endsWith(`/${rel}`);
            });
            if (emptyKey == null) missing.push(rel);
            else if (String(files[emptyKey] || '').length > 0 && String(files[emptyKey]).length < 80
              && /@@@FILE|placeholder|missing/i.test(String(files[emptyKey]))) {
              wiped.push(rel);
            }
            continue;
          }
          if (typeof body === 'string' && body.length > 0 && body.length < 80
            && /@@@FILE|placeholder|missing/i.test(body)) {
            wiped.push(rel);
          }
        }
        const ok = missing.length === 0 && wiped.length === 0;
        const detail = ok
          ? `assets OK (${unique.length} referenced)`
          : [
              missing.length ? `missing: ${missing.join(', ')}` : '',
              wiped.length ? `wiped/marker: ${wiped.join(', ')}` : '',
            ].filter(Boolean).join('; ');
        observations.push(`assets → ${ok ? 'PASS' : 'FAIL'}\n${detail}`);
        pushStep(steps, {
          tool: 'assets',
          label: ok ? 'Assets PASS' : 'Assets FAIL',
          detail: detail.slice(0, 600),
          ok,
        }, opts.onStep);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'assets check failed';
        observations.push(`assets error: ${msg}`);
        pushStep(steps, { tool: 'assets', label: 'Assets error', detail: msg, ok: false }, opts.onStep);
      }
      continue;
    }

    if (action.tool === 'mcp') {
      const name = String(action.mcpTool || '').trim();
      if (!name) {
        pushStep(steps, { tool: 'mcp', label: 'MCP failed', detail: 'Missing NAME', ok: false }, opts.onStep);
        observations.push('mcp failed: missing tool name');
        continue;
      }
      const server = resolveMcpToolServer(name);
      if (!server) {
        pushStep(steps, { tool: 'mcp', label: `MCP unknown · ${name}`, ok: false }, opts.onStep);
        observations.push(`mcp failed: no server for ${name}`);
        continue;
      }
      pushStep(steps, { tool: 'mcp', label: `MCP · ${name}`, detail: server.name }, opts.onStep);
      const res = await callMcpTool(server, name, action.mcpArgs || {});
      observations.push(`mcp ${name} → ${res.ok ? 'ok' : 'fail'}\n${(res.content || res.error || '').slice(0, 2000)}`);
      pushStep(steps, {
        tool: 'mcp',
        label: res.ok ? `MCP ok · ${name}` : `MCP failed · ${name}`,
        detail: (res.content || res.error || '').slice(0, 600),
        ok: res.ok,
      }, opts.onStep);
      continue;
    }

    if (action.tool === 'done') {
      const answer = String(action.answer || modelReply || 'Done.').trim();

      // Optional git commit after green verify
      const wantCommit = opts.commitOnSuccess ?? agentLoopCommitOnSuccess();
      if (wantCommit && updated.size && opts.diskRoot && verifyOk !== false) {
        const msg = (opts.commitMessage || `NOVA Agent: ${opts.brief.slice(0, 72)}`).replace(/"/g, '\\"');
        const status = await runShellCommand({
          command: 'git status --porcelain',
          cwd: opts.diskRoot,
          autoRunAllowlisted: true,
        });
        if (status.ok && status.output.trim()) {
          const commit = await runShellCommand({
            command: `git add -A && git commit -m "${msg}"`,
            cwd: opts.diskRoot,
            autoRunAllowlisted: opts.autoRunAllowlisted !== false,
          });
          pushStep(steps, {
            tool: 'run',
            label: commit.ok ? 'Git commit' : 'Git commit skipped/failed',
            detail: commit.output.slice(0, 400),
            ok: commit.ok,
          }, opts.onStep);
          observations.push(`git commit → ${commit.ok ? 'ok' : 'fail'}\n${commit.output.slice(0, 800)}`);
        }
      }

      pushStep(steps, { tool: 'done', label: 'Done', detail: answer.slice(0, 200), ok: true }, opts.onStep);
      return {
        ok: true,
        reply: formatAgentLoopReply(answer, steps, [...updated], diffs),
        files,
        updated: [...updated],
        steps,
        observations,
        stopped,
        hitStepCap: false,
        verifyOk,
        diffs,
        providerLabel: lastProvider,
        modelName: lastModel,
      };
    }
  }

  if (!stopped && steps.length) {
    hitStepCap = true;
    pushStep(steps, {
      tool: 'status',
      label: 'Step limit reached',
      detail: 'Press Continue or send Continue in Agent mode.',
    }, opts.onStep);
  }

  const summary = buildPartialSummary(steps, [...updated], stopped, hitStepCap);
  return {
    ok: updated.size > 0 || steps.some(s => s.tool === 'done' && s.ok),
    reply: formatAgentLoopReply(summary, steps, [...updated], diffs),
    files,
    updated: [...updated],
    steps,
    observations,
    stopped,
    hitStepCap,
    verifyOk,
    diffs,
    providerLabel: lastProvider,
    modelName: lastModel,
  };
}

function buildPartialSummary(
  steps: AgentLoopStep[],
  updated: string[],
  stopped: boolean,
  hitStepCap: boolean,
): string {
  const lines = [
    stopped ? '**Stopped.**' : hitStepCap ? '**Step limit reached.**' : '**Agent finished.**',
    '',
  ];
  if (updated.length) {
    lines.push('**Files changed:**');
    for (const p of updated.slice(0, 20)) lines.push(`- \`${p}\``);
    lines.push('');
  }
  const trail = steps
    .filter(s => s.tool !== 'thought' && s.tool !== 'status')
    .slice(-8)
    .map(s => `- ${s.label}${s.ok === false ? ' (failed)' : ''}`);
  if (trail.length) {
    lines.push('**Recent steps:**');
    lines.push(...trail);
  }
  if (hitStepCap) {
    lines.push('', 'Send **Continue** in Agent mode (or use the Continue button) to resume.');
  }
  return lines.join('\n');
}

function formatAgentLoopReply(
  answer: string,
  steps: AgentLoopStep[],
  updated: string[],
  diffs: string[],
): string {
  const body = String(answer || '').trim();
  const changed = updated.length
    ? `\n\n---\nChanged: ${updated.slice(0, 12).map(p => `\`${p}\``).join(', ')}${updated.length > 12 ? '…' : ''}`
    : '';
  const trail = steps
    .filter(s => ['read', 'grep', 'write', 'patch', 'run', 'list', 'mcp'].includes(s.tool))
    .slice(-12)
    .map(s => s.label)
    .join(' → ');
  const header = trail ? `_Agent: ${trail}_\n\n` : '';
  const diffBlock = diffs.length
    ? `\n\n<details><summary>Diffs (${diffs.length})</summary>\n\n\`\`\`diff\n${diffs.slice(0, 3).join('\n\n').slice(0, 3500)}\n\`\`\`\n\n</details>`
    : '';
  return `${header}${body}${changed}${diffBlock}`.trim();
}

/** Map loop steps into AgentTraceStep for existing chat UI. */
export function agentLoopStepsToTrace(steps: AgentLoopStep[]): AgentTraceStep[] {
  return steps.map(s => {
    let kind: AgentTraceStep['kind'] = 'status';
    if (s.tool === 'thought') kind = 'thought';
    else if (s.tool === 'read' || s.tool === 'list' || s.tool === 'grep') kind = 'read';
    else if (s.tool === 'write' || s.tool === 'patch') kind = 'write';
    else if (s.tool === 'run' || s.tool === 'mcp') kind = 'run';
    else if (s.tool === 'done') kind = 'answer';
    else if (s.tool === 'error') kind = 'status';
    return {
      id: s.id,
      kind,
      label: s.label,
      detail: s.diff || s.detail,
    };
  });
}
