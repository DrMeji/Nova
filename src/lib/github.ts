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
  size?: number;
  created_at?: string;
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
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (window.arkDesktop?.httpRequest) {
    const res = await window.arkDesktop.httpRequest(url, { method: 'GET', headers });
    if (!res.ok) {
      const msg =
        typeof res.data === 'object' && res.data && 'message' in res.data
          ? String((res.data as { message: string }).message)
          : `GitHub error ${res.status}`;
      throw new Error(msg);
    }
    return res.data as T;
  }

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

async function githubSend<T>(token: string, path: string, method: string, body?: unknown): Promise<T> {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (window.arkDesktop?.httpRequest) {
    const res = await window.arkDesktop.httpRequest(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const msg =
        typeof res.data === 'object' && res.data && 'message' in res.data
          ? String((res.data as { message: string }).message)
          : `GitHub error ${res.status}`;
      throw new Error(msg);
    }
    return (res.data || {}) as T;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `GitHub error ${res.status}`);
  }
  return data as T;
}

export async function commentOnIssue(
  token: string,
  owner: string,
  repo: string,
  number: number,
  body: string,
) {
  return githubSend<{ html_url?: string; id?: number }>(
    token,
    `/repos/${owner}/${repo}/issues/${number}/comments`,
    'POST',
    { body: body.slice(0, 65000) },
  );
}

export async function createGitHubRepo(
  token: string,
  name: string,
  opts?: { private?: boolean; description?: string },
) {
  return githubSend<{
    html_url?: string;
    clone_url?: string;
    full_name?: string;
    private?: boolean;
    name?: string;
  }>(token, '/user/repos', 'POST', {
    name: name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'ark-project',
    private: opts?.private !== false,
    description: opts?.description?.slice(0, 350) || 'Created from ARK',
    auto_init: false,
  });
}

export async function createGitHubPullRequest(
  token: string,
  owner: string,
  repo: string,
  opts: { title: string; head: string; base?: string; body?: string },
) {
  return githubSend<{ html_url?: string; number?: number; title?: string }>(
    token,
    `/repos/${owner}/${repo}/pulls`,
    'POST',
    {
      title: opts.title.slice(0, 256),
      head: opts.head,
      base: opts.base || 'main',
      body: opts.body?.slice(0, 65000) || undefined,
    },
  );
}

export async function createGitHubIssue(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body?: string,
) {
  return githubSend<{ html_url?: string; number?: number; title?: string }>(
    token,
    `/repos/${owner}/${repo}/issues`,
    'POST',
    {
      title: title.slice(0, 256),
      body: body?.slice(0, 65000) || undefined,
    },
  );
}

export type TeamAccess = 'read' | 'write' | 'full';

export type GitHubCollaborator = {
  login: string;
  avatar_url: string;
  html_url: string;
  role_name?: string;
  permissions?: { admin?: boolean; maintain?: boolean; push?: boolean; pull?: boolean };
};

export function githubPermissionToAccess(c: GitHubCollaborator): TeamAccess {
  if (c.permissions?.admin || c.role_name === 'admin') return 'full';
  if (c.permissions?.push || c.role_name === 'write' || c.role_name === 'maintain') return 'write';
  return 'read';
}

export function accessToGithubPermission(access: TeamAccess): 'pull' | 'push' | 'admin' {
  if (access === 'full') return 'admin';
  if (access === 'write') return 'push';
  return 'pull';
}

export async function listGitHubCollaborators(
  token: string,
  owner: string,
  repo: string,
): Promise<GitHubCollaborator[]> {
  const people = await githubGet<GitHubCollaborator[]>(
    token,
    `/repos/${owner}/${repo}/collaborators?per_page=50`,
  );
  return Array.isArray(people) ? people : [];
}

export async function inviteGitHubCollaborator(
  token: string,
  owner: string,
  repo: string,
  username: string,
  access: TeamAccess,
) {
  const permission = accessToGithubPermission(access);
  return githubSend<{ id?: number; html_url?: string }>(
    token,
    `/repos/${owner}/${repo}/collaborators/${encodeURIComponent(username)}`,
    'PUT',
    { permission },
  );
}

export async function getGitHubRepoAccess(
  token: string,
  owner: string,
  repo: string,
): Promise<{ access: TeamAccess; full_name: string }> {
  const data = await githubGet<{
    full_name?: string;
    permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
  }>(token, `/repos/${owner}/${repo}`);
  const p = data.permissions || {};
  const access: TeamAccess = p.admin ? 'full' : p.push ? 'write' : 'read';
  return { access, full_name: data.full_name || `${owner}/${repo}` };
}

export async function verifyGitHubToken(token: string): Promise<GitHubUser> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Paste a GitHub personal access token');
  return githubGet<GitHubUser>(trimmed, '/user');
}

export async function listGitHubRepos(token: string, limit = 20): Promise<GitHubRepo[]> {
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

  // comment on owner/repo#123: hello
  const commentMatch = userText.match(
    /(?:comment|post)\s+on\s+([\w.-]+)\/([\w.-]+)#(\d+)\s*[:\-]?\s*(.+)$/i,
  );
  if (commentMatch) {
    if (perms.length > 0 && !perms.includes('write')) {
      return [
        'GitHub · permission needed',
        '',
        'Commenting needs Write. Enable it under Plugins → GitHub → Permissions.',
      ].join('\n');
    }
    const [, owner, repo, num, body] = commentMatch;
    const user = await verifyGitHubToken(token);
    const posted = await commentOnIssue(token, owner, repo, Number(num), body.trim());
    return [
      `GitHub · commented (@${user.login})`,
      '',
      `${owner}/${repo}#${num}`,
      posted.html_url || '',
      '',
      'Live write via GitHub issues comments API.',
    ].filter(Boolean).join('\n');
  }

  const createRepoMatch = userText.match(
    /create\s+(?:a\s+)?(public|private)?\s*(?:github\s+)?repo(?:sitory)?(?:\s+(?:named|called)\s+)?[:\s]+([\w.-]+)/i,
  );
  if (createRepoMatch || /\bcreate (a )?(public |private )?(github )?repo\b/.test(lower)) {
    if (perms.length > 0 && !perms.includes('write')) {
      return [
        'GitHub · permission needed',
        '',
        'Creating a repository needs Write. Enable it under Plugins → GitHub → Permissions.',
      ].join('\n');
    }
    const vis = /public/i.test(userText) ? false : true;
    const named = createRepoMatch?.[2] || userText.match(/repo(?:sitory)?\s+(?:named|called)\s+([\w.-]+)/i)?.[1];
    const name = (named || 'ark-project').replace(/[^A-Za-z0-9._-]+/g, '-');
    const user = await verifyGitHubToken(token);
    const created = await createGitHubRepo(token, name, { private: vis, description: 'Created from ARK' });
    return [
      `GitHub · created ${vis ? 'private' : 'public'} repo (@${user.login})`,
      '',
      created.full_name || `${user.login}/${name}`,
      created.html_url || '',
      '',
      'In Code, say “push this folder” to send the local files here.',
    ].filter(Boolean).join('\n');
  }

  const createPrMatch = userText.match(
    /(?:create|open|make)\s+(?:a\s+)?(?:pr|pull request)\s+(?:on|in|for)\s+([\w.-]+)\/([\w.-]+)/i,
  );
  if (createPrMatch) {
    return [
      'GitHub · pull request',
      '',
      'Open this project in Code, then say “create a pull request” so ARK can use the local branch and diff.',
      `Repo: ${createPrMatch[1]}/${createPrMatch[2]}`,
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

  // create issue in owner/repo: title  |  create issue owner/repo title
  const createIssueMatch = userText.match(
    /create\s+(?:an?\s+)?issue\s+(?:in\s+)?([\w.-]+)\/([\w.-]+)\s*[:\-]?\s*(.+)/i,
  );
  if (createIssueMatch) {
    if (perms.length > 0 && !perms.includes('write')) {
      return [
        'GitHub · permission needed',
        '',
        'Creating issues needs Write. Enable it under Plugins → GitHub → Permissions.',
      ].join('\n');
    }
    const [, owner, repo, rest] = createIssueMatch;
    const titleBody = rest.trim();
    const split = titleBody.split(/\n+/);
    const title = (split[0] || 'New issue from ARK').slice(0, 256);
    const body = split.slice(1).join('\n').trim() || undefined;
    const user = await verifyGitHubToken(token);
    const created = await createGitHubIssue(token, owner, repo, title, body);
    return [
      `GitHub · created issue (@${user.login})`,
      '',
      `${owner}/${repo}#${created.number ?? '?'} “${created.title || title}”`,
      created.html_url || '',
      '',
      'Live write via GitHub issues API.',
    ].filter(Boolean).join('\n');
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
    'Say **open owner/repo in Code** to clone it and start adding, removing, or upgrading files. Empty repos are fine — we start from a blank page.',
    '',
    'Ask about open PRs or issues next. Live data from your GitHub account.',
  ].join('\n');
}

export function isGitHubIntent(userText: string) {
  const lower = userText.toLowerCase();
  return /github|repo|repositor|pull request|\bpr\b|issue|clone |commit |git push/.test(lower);
}
