/**
 * Wave 2 agent harness — condenser, modes, git milestones, prompt queue,
 * mid-turn steer, repo-map peek, plan gate helpers.
 */

export type InventAgentMode = 'invent' | 'redesign' | 'ask' | 'debug';

export type ModeAcl = {
  mode: InventAgentMode;
  allowWriteApp: boolean;
  allowWriteLogo: boolean;
  allowRescaffold: boolean;
  allowShell: boolean;
};

const MODE_ACL: Record<InventAgentMode, ModeAcl> = {
  invent: { mode: 'invent', allowWriteApp: true, allowWriteLogo: true, allowRescaffold: true, allowShell: true },
  redesign: { mode: 'redesign', allowWriteApp: true, allowWriteLogo: false, allowRescaffold: false, allowShell: true },
  ask: { mode: 'ask', allowWriteApp: false, allowWriteLogo: false, allowRescaffold: false, allowShell: false },
  debug: { mode: 'debug', allowWriteApp: true, allowWriteLogo: false, allowRescaffold: false, allowShell: true },
};

export function inventModeAcl(mode: InventAgentMode): ModeAcl {
  return MODE_ACL[mode] || MODE_ACL.ask;
}

export function detectInventAgentMode(text: string): InventAgentMode {
  const t = String(text || '');
  if (/\b(?:redesign|restyle|new\s+layout|premium\s+pass)\b/i.test(t)) return 'redesign';
  if (/\b(?:debug|fix|broken|error|heal)\b/i.test(t) && !/\b(?:create|invent|build)\b/i.test(t)) return 'debug';
  if (/\b(?:what|why|how|explain|tell\s+me)\b/i.test(t) && !/\b(?:create|invent|build|make)\b/i.test(t)) return 'ask';
  if (/\b(?:create|invent|build|make)\b/i.test(t)) return 'invent';
  return 'ask';
}

export function modeConfigFiles(): Record<string, string> {
  return {
    '.nova/modes/invent.json': `${JSON.stringify(MODE_ACL.invent, null, 2)}\n`,
    '.nova/modes/redesign.json': `${JSON.stringify(MODE_ACL.redesign, null, 2)}\n`,
    '.nova/modes/ask.json': `${JSON.stringify(MODE_ACL.ask, null, 2)}\n`,
    '.nova/modes/debug.json': `${JSON.stringify(MODE_ACL.debug, null, 2)}\n`,
  };
}

/** Condenser — compress long craft status traces. */
export function condenseCraftTrace(lines: string[], maxKeep = 24): string[] {
  const arr = (lines || []).map((l) => String(l || '').trim()).filter(Boolean);
  if (arr.length <= maxKeep) return arr;
  const head = arr.slice(0, 6);
  const tail = arr.slice(-12);
  const mid = arr.slice(6, -12);
  const summary = `[condensed ${mid.length} craft steps: ${mid.filter((m) => /fail|error|Ready|Live|logo|premium/i.test(m)).slice(0, 4).join(' · ') || 'progress'}]`;
  return [...head, summary, ...tail];
}

/** Aider-style ranked file peek from Acc keys + brief tokens. */
export function rankedRepoMapPeek(
  files: Record<string, string>,
  brief: string,
  limit = 12,
): string[] {
  const keys = Object.keys(files || {}).filter((k) => !k.startsWith('.__'));
  const tokens = String(brief || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3);
  const scored = keys.map((k) => {
    const low = k.toLowerCase();
    let s = 0;
    if (/^src\/App\.(jsx|tsx)$/i.test(k)) s += 50;
    if (/App\.css$/i.test(k)) s += 30;
    if (/public\/logo\.svg$/i.test(k)) s += 40;
    if (/^\.nova\//i.test(k)) s += 15;
    for (const t of tokens) {
      if (low.includes(t)) s += 3;
      if (String(files[k] || '').toLowerCase().includes(t)) s += 1;
    }
    return { k, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.k);
}

export type QueuedPrompt = { id: string; text: string; at: number };

const promptQueues = new Map<string, QueuedPrompt[]>();

export function enqueueCraftPrompt(chatId: string, text: string): QueuedPrompt {
  const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const item = { id, text: String(text || '').slice(0, 8000), at: Date.now() };
  const list = promptQueues.get(chatId) || [];
  list.push(item);
  promptQueues.set(chatId, list.slice(-8));
  return item;
}

export function drainCraftPromptQueue(chatId: string): QueuedPrompt[] {
  const list = promptQueues.get(chatId) || [];
  promptQueues.set(chatId, []);
  return list;
}

export function peekCraftPromptQueue(chatId: string): QueuedPrompt[] {
  return [...(promptQueues.get(chatId) || [])];
}

/** Mid-turn steer instruction formatting (harness STEER). */
export function formatMidTurnSteer(instruction: string): string {
  return `STEER (apply at next safe checkpoint): ${String(instruction || '').slice(0, 500)}`;
}

/** Optional git milestone message for invent steps. */
export function inventGitCommitMessage(step: string, brand: string): string {
  const s = String(step || 'craft').slice(0, 40);
  const b = String(brand || 'project').slice(0, 40);
  return `nova(invent): ${s} · ${b}`;
}

export async function tryInventGitCommit(opts: {
  diskRoot: string;
  message: string;
  projectId?: string;
}): Promise<{ ok: boolean; note: string }> {
  const desk = typeof window !== 'undefined' ? window.novaDesktop : undefined;
  const root = String(opts.diskRoot || '').trim();
  const projectId = String(opts.projectId || '').trim();
  if (!desk) return { ok: false, note: 'no disk/desktop' };
  try {
    const anyDesk = desk as unknown as {
      gitInit?: (projectId: string) => Promise<{ ok?: boolean; created?: boolean; error?: string }>;
      gitCommit?: (p: { projectId?: string; cwd?: string; message: string }) => Promise<{ ok?: boolean; error?: string }>;
      runProjectCommand?: (p: { cwd: string; command: string }) => Promise<{ ok?: boolean; error?: string }>;
    };
    // Always init repo on invent Ready when we have a project id.
    if (projectId && typeof anyDesk.gitInit === 'function') {
      await anyDesk.gitInit(projectId).catch(() => null);
    }
    if (projectId && typeof anyDesk.gitCommit === 'function') {
      const r = await anyDesk.gitCommit({ projectId, message: opts.message });
      return { ok: r?.ok !== false, note: r?.ok === false ? String(r.error || 'git fail') : 'git commit' };
    }
    if (root && typeof anyDesk.gitCommit === 'function') {
      const r = await anyDesk.gitCommit({ cwd: root, message: opts.message });
      return { ok: r?.ok !== false, note: r?.ok === false ? String(r.error || 'git fail') : 'git commit' };
    }
    if (root && typeof anyDesk.runProjectCommand === 'function') {
      const msg = opts.message.replace(/"/g, '\\"');
      const r = await anyDesk.runProjectCommand({
        cwd: root,
        command: `git init && git add -A && git commit -m "${msg}" --allow-empty-message || git commit -m "${msg}"`,
      });
      return { ok: r?.ok !== false, note: r?.ok === false ? String(r.error || 'git fail') : 'git commit' };
    }
  } catch (e) {
    return { ok: false, note: String(e).slice(0, 80) };
  }
  return { ok: false, note: 'git bridge unavailable' };
}

/** Checkpoint list for UI. */
export function formatCheckpointList(
  stack: Array<{ at: number; label: string; productName: string }>,
): string {
  if (!stack.length) return 'No checkpoints yet.';
  return stack
    .slice()
    .reverse()
    .map((c, i) => `${i + 1}. ${c.label} · ${c.productName} · ${new Date(c.at).toLocaleString()}`)
    .join('\n');
}
