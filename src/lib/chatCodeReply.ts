/**
 * Chat-facing code edit replies. hide source, show short status + optional trace.
 */

import {
  encodeTraceMessage,
  nextTraceStepId,
  traceThoughtFromAsk,
  type AgentTracePayload,
  type AgentTraceStep,
} from '@/lib/agentTrace';
import {
  formatCodeChatReply,
  stripFileBlocks,
} from '@/lib/projectCodeEdit';
import { formatReplyElapsed } from '@/lib/speedTest';

export function buildStudioTraceMessage(opts: {
  startedAt: number;
  elapsedMs: number;
  userMessage: string;
  answer: string;
  readPaths?: string[];
  wrotePaths?: string[];
  projectName?: string;
  extraSteps?: AgentTraceStep[];
}): string {
  const steps: AgentTraceStep[] = [
    {
      id: nextTraceStepId([]),
      kind: 'thought',
      label: traceThoughtFromAsk(opts.userMessage),
    },
    {
      id: nextTraceStepId([{ id: 'x', kind: 'thought', label: '' }]),
      kind: 'status',
      label: `Worked for ${formatReplyElapsed(opts.elapsedMs)}`,
    },
  ];

  for (const path of (opts.readPaths || []).slice(0, 12)) {
    steps.push({
      id: nextTraceStepId(steps),
      kind: 'read',
      label: path,
    });
  }

  for (const path of (opts.wrotePaths || []).slice(0, 12)) {
    steps.push({
      id: nextTraceStepId(steps),
      kind: 'run',
      label: `Wrote ${path}`,
      detail: opts.projectName,
    });
  }

  if (opts.extraSteps?.length) steps.push(...opts.extraSteps);

  const payload: AgentTracePayload = {
    startedAt: opts.startedAt,
    done: true,
    steps,
    answer: opts.answer,
  };
  return encodeTraceMessage(payload);
}

/** Strip code fences and format a short chat bubble for coding turns. */
export function finalizeCodingChatBubble(opts: {
  userMessage: string;
  rawReply: string;
  changedPaths?: string[];
  applied?: boolean;
  applyError?: string;
  /** When false, code blocks are shown as chat text — not a failed save. */
  editMode?: boolean;
}): string {
  const stripped = stripFileBlocks(opts.rawReply);
  if (opts.applied && opts.changedPaths?.length) {
    return formatCodeChatReply(
      opts.userMessage,
      opts.changedPaths,
      '',
      { surface: 'chat' },
    );
  }
  if (opts.applyError === 'no_edits' || opts.applyError === 'no_changes') {
    return 'I understood the ask, but nothing was saved to your project files yet. Try again. I will patch the files on disk this time.';
  }
  if (opts.applyError === 'no_project') {
    return 'No project folder is bound to this chat. Say **Create project …** or open the folder with +, then ask again.';
  }
  if (opts.applyError) {
    return `Could not save the change: ${opts.applyError}`;
  }
  if (opts.changedPaths?.length) {
    return formatCodeChatReply(opts.userMessage, opts.changedPaths, '', { surface: 'chat' });
  }
  if (/```|@@@FILE/i.test(opts.rawReply)) {
    // Only claim a failed save when this turn was meant to write files.
    // Plain chat often includes sample HTML/code — keep that text.
    if (opts.editMode === true) {
      return 'I drafted changes but could not save them to disk. Try the ask again in one short sentence.';
    }
    const body = stripped && stripped.length > 20 ? stripped : stripFileBlocks(opts.rawReply);
    return body || 'Done.';
  }
  // Never show “I will modify App.jsx…” as if the work finished.
  if (/\b(i will|i'll|going to)\b[\s\S]{0,80}\b(modify|update|edit|change|add)\b/i.test(stripped)) {
    return 'Still working on applying that to your project files…';
  }
  if (stripped && stripped.length > 12 && stripped.length < 400 && !/\b(App\.jsx|App\.css|\.jsx|\.css)\b/i.test(stripped)) {
    return stripped;
  }
  return stripped || 'Done.';
}

export function liveCodingStatusText(partial: string): string {
  const clean = stripFileBlocks(partial);
  if (/@@@FILE|```[\w]*\n|<!DOCTYPE|<html[\s>]|export\s+default\s+function/i.test(partial)) {
    if (/\b(logo|icon|image)\b/i.test(partial)) return 'Updating visuals in your project…';
    if (/\b(button|nav|header|footer|sidebar|tab)\b/i.test(partial)) return 'Updating layout and controls…';
    if (/\b(page|route|screen)\b/i.test(partial)) return 'Updating pages…';
    return 'Writing project files…';
  }
  if (clean && clean.length > 8 && clean.length < 280 && !/```|@@@FILE/i.test(clean)) return clean;
  if (/\b(logo|icon|image)\b/i.test(partial)) return 'Creating logo and updating the project…';
  if (/\b(button|nav|header|footer|sidebar)\b/i.test(partial)) return 'Updating the layout…';
  return 'Updating project files…';
}
