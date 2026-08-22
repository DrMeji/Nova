/**
 * Renderer helpers for ARK Code git (clone / commit / push / review).
 */

export type GitStatus = {
  ok: boolean;
  git?: boolean;
  branch?: string | null;
  dirty?: number;
  files?: string[];
  log?: string[];
  diff?: string;
  remote?: string;
  message?: string;
  error?: string;
  text?: string;
};

export function parseGithubRepoRef(text: string): { owner: string; repo: string } | null {
  const m = text.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?/i)
    || text.match(/\bclone\s+(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)/i);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2].replace(/\.git$/i, '');
  if (/^(http|https|www)$/i.test(owner)) return null;
  return { owner, repo };
}

export function parseGithubRemote(url: string): { owner: string; repo: string } | null {
  const m = String(url || '').match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

export function githubCloneUrl(owner: string, repo: string) {
  return `https://github.com/${owner}/${repo}.git`;
}

export function isStudioGitAsk(message: string): boolean {
  return classifyGitAsk(message) !== null;
}

export function classifyGitAsk(message: string):
  | 'clone'
  | 'commit'
  | 'push'
  | 'create-repo'
  | 'diff'
  | 'pr'
  | 'slack'
  | null {
  const t = message.toLowerCase();
  if (/\bclone\b/.test(t) && /github\.com|[\w.-]+\/[\w.-]+/.test(t)) return 'clone';
  if (/\bcreate (a )?(public |private )?(github )?repo\b/.test(t) || /\bpush this (folder|project|repo)\b/.test(t)) {
    return 'create-repo';
  }
  if (/\b(create|open|make)\b.{0,40}\b(pr|pull request)\b/.test(t)) return 'pr';
  if ((/\bslack\b/.test(t) || /#([\w-]+)/.test(t)) && /\b(post|summarize|summary|send)\b/.test(t)) return 'slack';
  if (/\b(what (did we |have we )?chang|git diff|review (the )?diff|last commits?)\b/.test(t)) return 'diff';
  if (/\b(git push|push (this|it|to origin|to github)|commit .{0,40}and push)\b/.test(t)) return 'push';
  if (/\b(git commit|commit (these |my |the )?changes)\b/.test(t)) return 'commit';
  return null;
}

export async function gitStatus(projectId: string): Promise<GitStatus> {
  const res = await window.arkDesktop?.gitStatus?.(projectId);
  return res || { ok: false, error: 'Git is only available in the ARK desktop app.' };
}

export async function gitClone(projectId: string, url: string, token?: string): Promise<GitStatus> {
  const res = await window.arkDesktop?.gitClone?.({ projectId, url, token });
  return res || { ok: false, error: 'Git clone needs the ARK desktop app.' };
}

export async function gitCommit(projectId: string, message: string): Promise<GitStatus> {
  const res = await window.arkDesktop?.gitCommit?.({ projectId, message });
  return res || { ok: false, error: 'Git commit needs the ARK desktop app.' };
}

export async function gitPush(projectId: string, token?: string): Promise<GitStatus> {
  const res = await window.arkDesktop?.gitPush?.({ projectId, token });
  return res || { ok: false, error: 'Git push needs the ARK desktop app.' };
}

export async function gitPull(projectId: string, token?: string): Promise<GitStatus> {
  const res = await window.arkDesktop?.gitPull?.({ projectId, token });
  return res || { ok: false, error: 'Git pull needs the ARK desktop app.' };
}

export async function gitDiff(projectId: string): Promise<GitStatus> {
  const res = await window.arkDesktop?.gitDiff?.(projectId);
  return res || { ok: false, error: 'Git diff needs the ARK desktop app.' };
}

export async function gitSetOrigin(projectId: string, remoteUrl: string): Promise<GitStatus> {
  const res = await window.arkDesktop?.gitSetOrigin?.({ projectId, remoteUrl });
  return res || { ok: false, error: 'Could not set origin.' };
}

export function formatGitReview(st: GitStatus): string {
  if (st.text) return st.text;
  if (!st.ok) return st.error || 'Git could not run.';
  if (!st.git) return 'This project is not a git repo yet. Commit from the Code header, or say “commit these changes”.';
  const parts = [
    st.branch ? `Branch: ${st.branch}` : '',
    st.remote ? `Remote: ${st.remote}` : 'No origin remote yet.',
    typeof st.dirty === 'number' ? (st.dirty ? `${st.dirty} changed file(s)` : 'Working tree clean.') : '',
    st.diff || '',
    st.log?.length ? `Recent:\n${st.log.map(l => `• ${l}`).join('\n')}` : '',
  ].filter(Boolean);
  return parts.join('\n') || 'No git summary.';
}
