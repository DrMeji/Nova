/** Live GitHub API helpers for the ARK GitHub plugin. */

export type GitHubUser = {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  public_repos: number;
};

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  updated_at: string;
  language: string | null;
};

export type GitHubIssueLike = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  repository_url?: string;
  pull_request?: { url: string };
  repository?: { full_name?: string };
};

async function githubGet<T>(token: string, path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
  };

  if (window.arkDesktop?.httpGet) {
    const res = await window.arkDesktop.httpGet(url, headers);
    if (!res.ok) {
      const msg =
        typeof res.data === 'object' && res.data && 'message' in res.data
          ? String((res.data as { message: string }).message)
          : `GitHub error ${res.status}`;
      throw new Error(msg);
    }
    return res.data as T;
  }

  // Browser fallback (may fail CORS outside Electron)
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `GitHub error ${res.status}`);
  }
  return data as T;
}

export async function verifyGitHubToken(token: string): Promise<GitHubUser> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Paste a GitHub personal access token');
  return githubGet<GitHubUser>(trimmed, '/user');
}

export async function listGitHubRepos(token: string, limit = 12): Promise<GitHubRepo[]> {
  const repos = await githubGet<GitHubRepo[]>(
    token,
    `/user/repos?sort=updated&per_page=${limit}&affiliation=owner,collaborator,organization_member`,
  );
  return Array.isArray(repos) ? repos : [];
}

export async function listGitHubOpenPrs(token: string, limit = 10): Promise<GitHubIssueLike[]> {
  const user = await verifyGitHubToken(token);
  const result = await githubGet<{ items: GitHubIssueLike[] }>(
    token,
    `/search/issues?q=${encodeURIComponent(`is:pr is:open author:${user.login}`)}&per_page=${limit}`,
  );
  return result.items ?? [];
}

export async function listGitHubIssues(token: string, limit = 10): Promise<GitHubIssueLike[]> {
  const issues = await githubGet<GitHubIssueLike[]>(
    token,
    `/issues?filter=all&state=open&per_page=${limit}`,
  );
  // /issues includes PRs; keep issues only
  return (Array.isArray(issues) ? issues : []).filter(i => !i.pull_request);
}

function repoNameFromIssue(issue: GitHubIssueLike) {
  if (issue.repository?.full_name) return issue.repository.full_name;
  if (issue.repository_url) {
    const parts = issue.repository_url.split('/');
    const owner = parts[parts.length - 2];
    const repo = parts[parts.length - 1];
    if (owner && repo) return `${owner}/${repo}`;
  }
  return 'repo';
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

/** Build a chat reply from live GitHub data based on the user prompt. */
export async function runGitHubLive(
  token: string,
  userText: string,
  opts?: { permissions?: string[] },
): Promise<string> {
  const lower = userText.toLowerCase();
  const perms = opts?.permissions || [];

  if (/\b(comment|post|create|write|close)\b/.test(lower) && perms.length > 0 && !perms.includes('write')) {
    return [
      'GitHub · permission needed',
      '',
      'Write actions need the Write permission. Enable it under Plugins → GitHub → Permissions.',
    ].join('\n');
  }

  if (/pull|\bpr\b/.test(lower)) {
    const [user, prs] = await Promise.all([
      verifyGitHubToken(token),
      listGitHubOpenPrs(token),
    ]);
    if (prs.length === 0) {
      return [
        `GitHub · open pull requests (@${user.login})`,
        '',
        'No open pull requests authored by you right now.',
      ].join('\n');
    }
    return [
      `GitHub · open pull requests (@${user.login})`,
      '',
      ...prs.map((pr, i) => `${i + 1}. ${repoNameFromIssue(pr)} — #${pr.number} “${pr.title}”\n   ${pr.html_url}`),
      '',
      'Live data from your GitHub account. Open a link above in your browser.',
    ].join('\n');
  }

  if (/issue/.test(lower)) {
    const [user, issues] = await Promise.all([
      verifyGitHubToken(token),
      listGitHubIssues(token),
    ]);
    if (issues.length === 0) {
      return [
        `GitHub · open issues (@${user.login})`,
        '',
        'No open issues assigned/visible right now.',
      ].join('\n');
    }
    return [
      `GitHub · open issues (@${user.login})`,
      '',
      ...issues.slice(0, 10).map((issue, i) =>
        `${i + 1}. ${repoNameFromIssue(issue)} — #${issue.number} “${issue.title}”\n   ${issue.html_url}`,
      ),
      '',
      'Live data from your GitHub account.',
    ].join('\n');
  }

  const [user, repos] = await Promise.all([
    verifyGitHubToken(token),
    listGitHubRepos(token),
  ]);

  if (repos.length === 0) {
    return [
      `GitHub · repositories (@${user.login})`,
      '',
      'No repositories found for this token. Check that the token has the repo scope.',
    ].join('\n');
  }

  return [
    `GitHub · repositories (@${user.login})`,
    '',
    ...repos.map(repo => {
      const vis = repo.private ? 'private' : 'public';
      const lang = repo.language ? ` · ${repo.language}` : '';
      return `• ${repo.full_name} — ${vis}${lang} · updated ${formatDate(repo.updated_at)}\n  ${repo.html_url}`;
    }),
    '',
    'Ask about open PRs or issues next. Live data from your GitHub account.',
  ].join('\n');
}

export function isGitHubIntent(userText: string) {
  const lower = userText.toLowerCase();
  return /github|repo|repositor|pull request|\bpr\b|issue/.test(lower);
}
