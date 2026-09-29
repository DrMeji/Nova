/**
 * Scaffold NovaClinicGym — a half-working React SPA (~100+ files) for testing
 * NOVA chat diagnose → explain → fix. Lives next to Nova under Desktop/Projects.
 *
 * Run: node scripts/scaffold-nova-clinic-gym.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', 'NovaClinicGym');

function write(rel, body) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body.replace(/^\n/, ''), 'utf8');
}

const workingPages = [
  'Home', 'Dashboard', 'Reports', 'Billing', 'Notifications', 'Help',
  'About', 'Pricing', 'Docs', 'Changelog', 'Status', 'Support',
];

const brokenFeatures = [
  {
    file: 'src/pages/SettingsPage.jsx',
    note: 'BUG: Settings ↔ Profile switch uses mismatched tab keys (settings vs profile vs account).',
  },
  {
    file: 'src/pages/ProfilePage.jsx',
    note: 'BUG: Profile save button has no onClick; form never persists.',
  },
  {
    file: 'src/components/SearchBar.jsx',
    note: 'BUG: Search UI present but no submit/change handler.',
  },
  {
    file: 'src/components/NavTabs.jsx',
    note: 'BUG: Tab buttons use href="#" with no real navigation.',
  },
  {
    file: 'src/lib/apiClient.js',
    note: 'BUG: Hardcoded API key + eval of response snippets.',
  },
  {
    file: 'src/hooks/useAuth.js',
    note: 'BUG: login() is a stub (TODO) — never sets session.',
  },
  {
    file: 'src/pages/LoginPage.jsx',
    note: 'BUG: Submit calls preventDefault but never invokes login().',
  },
  {
    file: 'src/utils/unsafeHtml.js',
    note: 'BUG: innerHTML assignment without sanitization.',
  },
];

fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

write('package.json', `{
  "name": "nova-clinic-gym",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0"
  }
}
`);

write('vite.config.js', `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5179 },
});
`);

write('index.html', `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nova Clinic Gym</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`);

write('README.md', `# Nova Clinic Gym

Half-built demo app for testing **NOVA chat diagnose → explain → fix**.

## Intentionally broken

Open this folder in NOVA, then try asks like:

- "I'm having a problem switching between Settings and Profile — can you help?"
- "Search does nothing when I click it. What's wrong?"
- "Can you fix the login form? It never signs me in."
- "Add a logout button to the header."
- "Remove the hardcoded API key."

Working areas: Home, Dashboard, Reports, Billing, Notifications, Help, About, Pricing, Docs.

Broken areas: Settings↔Profile tabs, Profile save, Search, Nav tabs, API client secrets/eval, auth stub, Login submit, unsafe HTML helper.

## Run (optional)

\`\`\`bash
npm install
npm run dev
\`\`\`
`);

write('.gitignore', `node_modules
dist
.DS_Store
.env
.env.local
`);

write('src/main.jsx', `import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
`);

write('src/index.css', `:root {
  font-family: "Segoe UI", system-ui, sans-serif;
  color: #0f172a;
  background: #f8fafc;
}
* { box-sizing: border-box; }
body { margin: 0; }
a { color: inherit; }
.app-shell { min-height: 100vh; display: flex; flex-direction: column; }
.app-header {
  display: flex; gap: 1rem; align-items: center; padding: 0.75rem 1.25rem;
  border-bottom: 1px solid #e2e8f0; background: #fff;
}
.app-header nav { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.app-main { padding: 1.25rem; max-width: 960px; margin: 0 auto; width: 100%; }
.card {
  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem;
}
.btn {
  border: 0; border-radius: 8px; padding: 0.5rem 0.9rem; background: #0f766e; color: #fff; cursor: pointer;
}
.muted { color: #64748b; }
.tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.tab {
  padding: 0.4rem 0.8rem; border-radius: 999px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer;
}
.tab.active { background: #0f766e; color: #fff; border-color: #0f766e; }
`);

write('src/App.jsx', `import { Routes, Route, NavLink } from 'react-router-dom';
import { AppHeader } from './components/AppHeader.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { ProfilePage } from './pages/ProfilePage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { ReportsPage } from './pages/ReportsPage.jsx';
import { BillingPage } from './pages/BillingPage.jsx';
import { NotificationsPage } from './pages/NotificationsPage.jsx';
import { HelpPage } from './pages/HelpPage.jsx';
import { AboutPage } from './pages/AboutPage.jsx';
import { PricingPage } from './pages/PricingPage.jsx';
import { DocsPage } from './pages/DocsPage.jsx';
import { ChangelogPage } from './pages/ChangelogPage.jsx';
import { StatusPage } from './pages/StatusPage.jsx';
import { SupportPage } from './pages/SupportPage.jsx';

export default function App() {
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/support" element={<SupportPage />} />
        </Routes>
      </main>
    </div>
  );
}
`);

write('src/components/AppHeader.jsx', `import { NavLink } from 'react-router-dom';
import { SearchBar } from './SearchBar.jsx';
import { NavTabs } from './NavTabs.jsx';

export function AppHeader() {
  return (
    <header className="app-header">
      <strong>Nova Clinic Gym</strong>
      <nav>
        <NavLink to="/">Home</NavLink>
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <NavLink to="/profile">Profile</NavLink>
        <NavLink to="/login">Login</NavLink>
      </nav>
      <SearchBar />
      <NavTabs />
    </header>
  );
}
`);

// --- Intentionally broken files ---
write('src/pages/SettingsPage.jsx', `import { useState } from 'react';

/**
 * Settings ↔ Profile switcher.
 * FIXME: switching between Settings and Profile does nothing useful —
 * active tab key is "settings" / "profile" but the panels check "account" / "user".
 * Having a problem with switching between settings and user profile.
 */
export function SettingsPage() {
  const [tab, setTab] = useState('settings');

  return (
    <div className="card">
      <h1>Settings</h1>
      <p className="muted">General preferences for your clinic workspace.</p>
      <div className="tabs">
        <button type="button" className={tab === 'settings' ? 'tab active' : 'tab'} onClick={() => setTab('settings')}>
          Settings
        </button>
        <button type="button" className={tab === 'profile' ? 'tab active' : 'tab'} onClick={() => setTab('profile')}>
          Profile
        </button>
      </div>
      {/* BUG: wrong keys — panels never match the tab state above */}
      {tab === 'account' && (
        <div>
          <h2>Account settings</h2>
          <label>Timezone <input defaultValue="America/Los_Angeles" /></label>
        </div>
      )}
      {tab === 'user' && (
        <div>
          <h2>User profile</h2>
          <label>Display name <input defaultValue="Alex" /></label>
        </div>
      )}
      {tab !== 'account' && tab !== 'user' && (
        <p className="muted">Nothing to show — panels failed to bind to the active tab.</p>
      )}
    </div>
  );
}
`);

write('src/pages/ProfilePage.jsx', `import { useState } from 'react';

export function ProfilePage() {
  const [name, setName] = useState('Alex Rivera');
  const [bio, setBio] = useState('Clinic admin');

  return (
    <div className="card">
      <h1>User profile</h1>
      <p className="muted">Edit how you appear to other staff.</p>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Bio
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} />
      </label>
      {/* FIXME: Save profile button has no onClick — nothing happens when clicked */}
      <button type="button" className="btn">Save profile</button>
    </div>
  );
}
`);

write('src/components/SearchBar.jsx', `export function SearchBar() {
  return (
    <div className="search-bar">
      {/* Search UI is present but there is no click/submit handler in this file. */}
      <input type="search" placeholder="Search patients, notes…" aria-label="Search" />
      <button type="button">Search</button>
    </div>
  );
}
`);

write('src/components/NavTabs.jsx', `export function NavTabs() {
  return (
    <div className="nav-tabs">
      <a href="#">Reports</a>
      <a href="#">Billing</a>
      <a href="#">Help</a>
    </div>
  );
}
`);

write('src/lib/apiClient.js', `// FIXME: possible hardcoded secret in source — rotate and move to env.
export const API_KEY = 'sk_live_clinic_gym_demo_key_do_not_ship';

export async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: \`Bearer \${API_KEY}\`,
    },
  });
  const text = await res.text();
  // Line: uses eval/exec. risky if fed untrusted input.
  try {
    return eval('(' + text + ')');
  } catch {
    return { ok: false, raw: text };
  }
}
`);

write('src/hooks/useAuth.js', `import { useState } from 'react';

export function useAuth() {
  const [user, setUser] = useState(null);

  // TODO: finish login — currently a stub, session never sticks
  function login(_email, _password) {
    // unfinished marker
    return null;
  }

  function logout() {
    setUser(null);
  }

  return { user, login, logout, setUser };
}
`);

write('src/pages/LoginPage.jsx', `import { useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="card">
      <h1>Login</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // FIXME: never calls login(email, password) — form does nothing
        }}
      >
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" className="btn">Sign in</button>
      </form>
    </div>
  );
}
`);

write('src/utils/unsafeHtml.js', `export function renderBanner(html) {
  const el = document.getElementById('banner');
  if (!el) return;
  // HTML injection risk (innerHTML / dangerouslySetInnerHTML).
  el.innerHTML = html;
}
`);

// Working pages
for (const name of workingPages) {
  write(`src/pages/${name}Page.jsx`, `export function ${name}Page() {
  return (
    <div className="card">
      <h1>${name}</h1>
      <p className="muted">This ${name.toLowerCase()} screen works for the clinic gym demo.</p>
      <ul>
        <li>Loaded from src/pages/${name}Page.jsx</li>
        <li>Safe placeholder content — no TODOs here</li>
      </ul>
    </div>
  );
}
`);
}

// Extra working components / libs / fixtures to reach 100+ files
const extraComponents = [
  'StatCard', 'EmptyState', 'Spinner', 'Badge', 'Avatar', 'ModalShell',
  'Toast', 'Pagination', 'Breadcrumbs', 'SidePanel', 'DataTable', 'FilterChip',
  'IconButton', 'FormField', 'Toggle', 'CheckboxRow', 'RadioGroup', 'SelectField',
  'DateField', 'TimeField', 'TagList', 'ProgressBar', 'Skeleton', 'Divider',
  'CardHeader', 'CardFooter', 'ListItem', 'MenuItem', 'Toolbar', 'FooterBar',
];

for (const name of extraComponents) {
  write(`src/components/${name}.jsx`, `export function ${name}({ children, label }) {
  return (
    <div className="${name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}">
      {label ? <span>{label}</span> : null}
      {children}
    </div>
  );
}
`);
}

const libFiles = [
  'formatDate', 'formatMoney', 'slugify', 'clamp', 'debounce', 'throttle',
  'parseQuery', 'buildQuery', 'storage', 'session', 'validators', 'permissions',
  'featureFlags', 'analytics', 'logger', 'errors', 'httpStatus', 'retry',
];

for (const name of libFiles) {
  write(`src/lib/${name}.js`, `export function ${name}(...args) {
  return args.length ? args[0] : null;
}
`);
}

const hookFiles = [
  'useLocalStorage', 'useDebounce', 'useMediaQuery', 'usePrevious',
  'useToggle', 'useInterval', 'useClipboard', 'useOnline',
];

for (const name of hookFiles) {
  write(`src/hooks/${name}.js`, `import { useState, useEffect } from 'react';

export function ${name}(initial) {
  const [value, setValue] = useState(initial);
  useEffect(() => {}, [value]);
  return [value, setValue];
}
`);
}

const utilFiles = [
  'arrays', 'objects', 'strings', 'numbers', 'colors', 'ids', 'time', 'url',
];

for (const name of utilFiles) {
  write(`src/utils/${name}.js`, `export const ${name} = {
  identity(x) { return x; },
};
`);

}

// Fixtures / sample data
for (let i = 1; i <= 12; i++) {
  write(`src/data/fixture${i}.json`, `${JSON.stringify({
    id: i,
    title: `Fixture ${i}`,
    ok: true,
    notes: 'Working sample data for NovaClinicGym',
  }, null, 2)}\n`);
}

// Styles per section
for (const name of ['home', 'dashboard', 'settings', 'profile', 'login', 'shared']) {
  write(`src/styles/${name}.css`, `.${name}-panel { padding: 0.5rem; }\n`);
}

write('src/config/routes.js', `export const ROUTES = [
  { path: '/', label: 'Home' },
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/settings', label: 'Settings' },
  { path: '/profile', label: 'Profile' },
  { path: '/login', label: 'Login' },
];
`);

write('src/config/theme.js', `export const theme = {
  primary: '#0f766e',
  surface: '#ffffff',
  text: '#0f172a',
};
`);

write('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#0f766e"/></svg>
`);

write('BUGS.md', `# Known planted bugs (for NOVA testing)

${brokenFeatures.map((b, i) => `${i + 1}. \`${b.file}\` — ${b.note}`).join('\n')}
`);

// Count files
function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT);
console.log(JSON.stringify({
  root: ROOT,
  fileCount: files.length,
  broken: brokenFeatures.map((b) => b.file),
}, null, 2));
