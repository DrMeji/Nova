/**
 * Renderer helpers for NOVA Code git (clone / commit / push / review).
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
  // Require an explicit repo target — not product wording like "Twitch clone" + "Follow/Subscribe".
  if (
    /\b(?:git\s+)?clone\b/.test(t)
    && (/github\.com/.test(t) || /\bclone\s+(?:https?:\/\/\S+|[\w.-]+\/[\w.-]+)/i.test(message))
  ) {
    return 'clone';
  }
  if (/\bcreate (a )?(public |private )?(github )?repo\b/.test(t) || /\bpush this (folder|project|repo)\b/.test(t)) {
    return 'create-repo';
  }
  if (/\b(create|open|make)\b.{0,40}\b(pr|pull request)\b/.test(t)) return 'pr';
  // Slack: require the word slack, or a real #channel (not CSS hex / UI “Send”).
  const slackChannel = Array.from(message.matchAll(/#([a-z][\w-]{1,80})\b/gi)).some(
    (m) => !/^[0-9a-f]{3,8}$/i.test(m[1]),
  );
  if (
    (/\bslack\b/.test(t) || (slackChannel && /\b(?:post|summarize|summary)\b/.test(t)))
    && (/\bslack\b/.test(t) || /\b(?:post|summarize|summary)\b/.test(t))
  ) {
    return 'slack';
  }  if (/\b(what (did we |have we )?chang|git diff|review (the )?diff|last commits?)\b/.test(t)) return 'diff';
  if (/\b(git push|push (this|it|to origin|to github)|commit .{0,40}and push)\b/.test(t)) return 'push';
  if (/\b(git commit|commit (these |my |the )?changes)\b/.test(t)) return 'commit';
  return null;
}

export async function gitStatus(projectId: string): Promise<GitStatus> {
  const res = await window.novaDesktop?.gitStatus?.(projectId);
  return res || { ok: false, error: 'Git is only available in the NOVA desktop app.' };
}

export async function gitInit(projectId: string): Promise<GitStatus & { created?: boolean }> {
  const res = await window.novaDesktop?.gitInit?.(projectId);
  return res || { ok: false, error: 'Git init needs the NOVA desktop app.' };
}

export async function gitClone(projectId: string, url: string, token?: string): Promise<GitStatus> {
  const res = await window.novaDesktop?.gitClone?.({ projectId, url, token });
  return res || { ok: false, error: 'Git clone needs the NOVA desktop app.' };
}

export async function gitCommit(projectId: string, message: string): Promise<GitStatus> {
  const res = await window.novaDesktop?.gitCommit?.({ projectId, message });
  return res || { ok: false, error: 'Git commit needs the NOVA desktop app.' };
}

export async function gitPush(projectId: string, token?: string): Promise<GitStatus> {
  const res = await window.novaDesktop?.gitPush?.({ projectId, token });
  return res || { ok: false, error: 'Git push needs the NOVA desktop app.' };
}

export async function gitPull(projectId: string, token?: string): Promise<GitStatus> {
  const res = await window.novaDesktop?.gitPull?.({ projectId, token });
  return res || { ok: false, error: 'Git pull needs the NOVA desktop app.' };
}

export async function gitDiff(projectId: string): Promise<GitStatus> {
  const res = await window.novaDesktop?.gitDiff?.(projectId);
  return res || { ok: false, error: 'Git diff needs the NOVA desktop app.' };
}

export async function gitSetOrigin(projectId: string, remoteUrl: string): Promise<GitStatus> {
  const res = await window.novaDesktop?.gitSetOrigin?.({ projectId, remoteUrl });
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
