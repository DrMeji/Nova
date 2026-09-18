/**
 * Chat-facing code edit replies. hide source, show short status + optional trace.
 */

import {
  encodeTraceMessage,
  nextTraceStepId,
  traceThoughtFromAsk,
  type AgentFileChange,
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
  fileChanges?: AgentFileChange[];
  projectName?: string;
  extraSteps?: AgentTraceStep[];
}): string {
  const wrote = (opts.wrotePaths || []).filter(Boolean);
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

  for (const path of wrote.slice(0, 12)) {
    steps.push({
      id: nextTraceStepId(steps),
      kind: 'write',
      label: path,
      detail: opts.projectName,
    });
  }

  if (opts.extraSteps?.length) steps.push(...opts.extraSteps);

  const fileChanges = opts.fileChanges?.length
    ? opts.fileChanges
    : wrote.map(path => ({ path, added: 1, removed: 0 }));

  const payload: AgentTracePayload = {
    startedAt: opts.startedAt,
    done: true,
    steps,
    answer: opts.answer,
    elapsedMs: opts.elapsedMs,
    changedPaths: wrote,
    fileChanges,
  };
  return encodeTraceMessage(payload);
}

/** Prefer the model’s spoken prose over canned “keep building / still planning” swaps. */
function proseFromReply(raw: string): string {
  const stripped = stripFileBlocks(String(raw || ''));
  let body = stripped
    .replace(/```[\w]*\n[\s\S]*?```/g, '')
    .replace(/@@@FILE[^\n]*\n?/gi, '')
    .replace(/^\s*(?:css|jsx|tsx|javascript|typescript|html)\s*$/gim, '')
    .replace(/^\s*(?:And add the following CSS[^\n]*)$/gim, '')
    .replace(/^\s*(?:const|let|var|function|export|import|return|struct|import\s+SwiftUI)\b[\s\S]{0,200}$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // Never surface system-prompt echoes as “prose” (causes flicker → canned swap).
  body = body
    .replace(/You are NOVA,[\s\S]*?(?:Never nest asterisks[^\n]*\.|Never repeat or paraphrase these instructions[^\n]*\.)/gi, '')
    .replace(/(?:^|\n)(?:a )?normal helpful AI chat assistant[\s\S]*?(?:Never nest asterisks[^\n]*\.|Write movie\/TV lists[^\n]*\.)/gi, '')
    .replace(/\bTalk like ChatGPT[^\n.]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!body || body.length < 24) return '';
  // Drop pure status stubs the model sometimes echoes.
  if (/^(?:updating|writing|applying|generating)\b/i.test(body) && body.length < 80) return '';
  if (/\bTalk like ChatGPT\b/i.test(body) || /^You are NOVA,/i.test(body)) return '';
  if (/@@@FILE|^\s*css\s*$/i.test(body)) return '';
  return body.slice(0, 4000);
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
  const prose = proseFromReply(opts.rawReply);
  const stripped = stripFileBlocks(opts.rawReply);

  if (opts.applied && opts.changedPaths?.length) {
    // Never leave protocol leftovers or CODE-fence prose in the bubble.
    let cleanProse = prose
      .replace(/@@@FILE\b[\s\S]*$/gi, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/```[\s\S]*$/g, '')
      .replace(/^\s*(?:css|jsx|tsx|CODE)\s*$/gim, '')
      .replace(/I applied those updates on disk[^\n]*/gi, '')
      .trim();
    if (
      /@@@FILE|^\s*css\s*$/i.test(cleanProse)
      || cleanProse.length < 8
      || /And add the following CSS/i.test(cleanProse)
    ) {
      cleanProse = '';
    }
    // Prefer ask-specific Done when prose is a language label or generic filler.
    const askSpecific = formatCodeChatReply(
      opts.userMessage,
      opts.changedPaths,
      '',
      { surface: 'chat' },
    );
    if (!cleanProse || /^(?:css|Done\.|Updated)\b/i.test(cleanProse)) {
      return askSpecific;
    }
    // Good descriptive prose (nav sticky…) — keep it, skip the CODE stub footer.
    if (!/I applied those updates on disk/i.test(cleanProse)) {
      return cleanProse;
    }
    return askSpecific;
  }
  if (opts.applyError === 'no_edits' || opts.applyError === 'no_changes') {
    if (prose) return prose;
    return (
      'I’m having an issue — I can’t provide the change you’re asking for right now.\n\n'
      + 'No template was substituted. Try one clearer ask, and I’ll apply it to the open project.'
    );
  }
  if (opts.editMode && /\b(?:here'?s the updated|updated codebase|full (?:source|code) below|copy[- ]paste)\b/i.test(stripped)) {
    return prose || 'I almost pasted source into chat. Ask once more and I will apply the edits on disk only, then show Files Changed.';
  }
  if (opts.applyError === 'no_project') {
    return 'No project folder is bound to this chat. Say **Create project …** or open the folder with +, then ask again.';
  }
  if (opts.applyError) {
    return prose || `Could not save the change: ${opts.applyError}`;
  }
  if (opts.changedPaths?.length) {
    if (prose) {
      return `${prose}\n\nI updated the project files. What would you like to add or polish next?`;
    }
    return formatCodeChatReply(opts.userMessage, opts.changedPaths, '', { surface: 'chat' });
  }
  if (/```|@@@FILE/i.test(opts.rawReply) || looksLikeCodeDump(stripped)) {
    // Always keep substantial prose the user already saw streaming — never swap it for a canned line.
    if (prose) {
      const askNext = opts.editMode
        ? '\n\nWhat would you like to add or polish next?'
        : '';
      return `${prose}${askNext}`;
    }
    if (opts.editMode === true) {
      return 'Updating your project files on disk… If nothing changes in a moment, say the edit again in one short sentence.';
    }
    // @@@FILE in the raw reply is not proof anything landed on disk.
    if (/@@@FILE\b/i.test(String(opts.rawReply || ''))) {
      return 'I drafted file updates but could not confirm they were saved. Say the change once more in one short sentence and I will apply it to the open project.';
    }
    return 'Happy to keep shaping this with you. What should we improve next — layout, visuals, copy, or a new section?';
  }
  // Never show “I will modify App.jsx…” as if the work finished.
  if (/\b(i will|i'll|going to)\b[\s\S]{0,80}\b(modify|update|edit|change|add)\b/i.test(stripped)) {
    return prose || 'Still working on applying that to your project files…';
  }
  if (stripped && stripped.length > 12 && stripped.length < 400 && !/\b(App\.jsx|App\.css|\.jsx|\.css)\b/i.test(stripped)) {
    return stripped;
  }
  return stripped || prose || 'Done.';
}

function looksLikeCodeDump(text: string): boolean {
  const t = String(text || '');
  if ((t.match(/[{};]/g) || []).length >= 8) return true;
  if (/background-color\s*:|font-family\s*:|display\s*:\s*flex/i.test(t)) return true;
  if (/<\/?[A-Z][A-Za-z]+\b/.test(t) && /className=/.test(t)) return true;
  if (/export\s+default\s+function|=>\s*\(|^\s*return\s*\(/m.test(t)) return true;
  return false;
}

export function liveCodingStatusText(partial: string): string {
  const raw = String(partial || '');
  // Prefer the last @@@FILE path so status tracks real work, not vague “visuals”.
  const fileHits = [...raw.matchAll(/@@@FILE\s+([^\s\n]+)/gi)].map((m) => m[1].replace(/\\/g, '/'));
  const lastFile = fileHits.length ? fileHits[fileHits.length - 1] : '';
  if (lastFile) {
    const base = lastFile.split('/').pop() || lastFile;
    if (/\.(css|scss)$/i.test(lastFile)) return `Updating CSS in ${base}…`;
    if (/\.(jsx|tsx|js|ts)$/i.test(lastFile)) return `Writing code in ${base}…`;
    if (/index\.html$/i.test(lastFile)) return `Updating ${base}…`;
    if (/package\.json$/i.test(lastFile)) return `Updating package.json…`;
    if (/vite\.config\./i.test(lastFile)) return `Updating Vite config…`;
    return `Writing ${base}…`;
  }
  if (/image\.pollinations\.ai|unsplash|background-image|\/heroes?\//i.test(raw)) {
    return 'Updating background and hero imagery…';
  }
  if (/logo\.svg|simple-icons|nav-icon|\/icons\//i.test(raw)) {
    return 'Adding logo and icons…';
  }
  if (/@keyframes|animation|transition|hover/i.test(raw) && /\.css|@@@FILE/i.test(raw)) {
    return 'Polishing motion and hover states…';
  }
  const clean = stripFileBlocks(raw);
  if (/@@@FILE|```[\w]*\n|<!DOCTYPE|<html[\s>]|export\s+default\s+function/i.test(raw)) {
    if (/\.(css|scss)\b/i.test(raw) || /className=|@keyframes|display\s*:/i.test(raw)) {
      return 'Designing App.css and layout…';
    }
    return 'Writing project files…';
  }
  if (clean && clean.length > 8 && clean.length < 280 && !/```|@@@FILE/i.test(clean)) {
    return clean.replace(/\s+/g, ' ').trim().slice(0, 120);
  }
  return 'Building your project…';
}

