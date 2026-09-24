/**
 * Local teammate assignments for a Code project.
 * Who can edit is GitHub permission (read / write / full). Assignments are “work this area.”
 */

export type TeamAccess = 'read' | 'write' | 'full';

export type TeammateAssignment = {
  login: string;
  area: string;
};

export type NovaMember = {
  novaId: string;
  displayName: string;
  access: TeamAccess;
};

export type TeamState = {
  trusted: string[];
  assignments: TeammateAssignment[];
  arkMembers: NovaMember[];
};

function key(projectId: string) {
  return `NOVA:team:${projectId}`;
}

export function loadTeamState(projectId: string): TeamState {
  if (!projectId) return { trusted: [], assignments: [], arkMembers: [] };
  try {
    const raw = localStorage.getItem(key(projectId));
    if (!raw) return { trusted: [], assignments: [], arkMembers: [] };
    const parsed = JSON.parse(raw) as TeamState;
    return {
      trusted: Array.isArray(parsed.trusted) ? parsed.trusted : [],
      assignments: Array.isArray(parsed.assignments) ? parsed.assignments : [],
      arkMembers: Array.isArray(parsed.arkMembers) ? parsed.arkMembers : [],
    };
  } catch {
    return { trusted: [], assignments: [], arkMembers: [] };
  }
}

export function saveTeamState(projectId: string, state: TeamState) {
  if (!projectId) return;
  try {
    localStorage.setItem(key(projectId), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function accessLabel(access: TeamAccess) {
  if (access === 'full') return 'Full access';
  if (access === 'write') return 'Write';
  return 'Read';
}

export function accessDetail(access: TeamAccess) {
  if (access === 'full') return 'Can edit files, push, and manage the GitHub repo.';
  if (access === 'write') return 'Can edit and rewrite files, then push. Cannot change repo settings.';
  return 'Can open and discuss the code. Cannot edit or push.';
}

export const AREA_SUGGESTIONS = [
  'Search',
  'Header',
  'Home page',
  'Styles',
  'Preview',
  'Explorer',
  'Code editor',
  'Chat',
  'Git / ship',
];

export const BLANK_STARTER: Record<string, string> = {
  'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>New project</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <main class="wrap">
    <h1>Blank page</h1>
    <p>Tell NOVA what to add. a search bar, a dashboard, a chat-style layout, anything.</p>
  </main>
  <script src="js/app.js"></script>
</body>
</html>
`,
  'css/styles.css': `* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #0b1220;
  color: #e8eefc;
}
.wrap { max-width: 42rem; margin: 12vh auto; padding: 0 1.5rem; }
h1 { font-size: 1.75rem; font-weight: 600; }
p { color: #9aa8c7; line-height: 1.5; }
`,
  'js/app.js': `console.log('NOVA blank page ready');
`,
};
