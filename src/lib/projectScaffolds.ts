/**
 * Minimal project files — empty starting point unless the brief describes a real landing page.
 */

import type { ProjectKind } from '@/lib/createProjectIntent';
import { slugifyProjectName } from '@/lib/projectNames';
import { buildLandingPageFiles, looksLikeLandingBrief, prefersReactAppScaffold } from '@/lib/webLandingFromBrief';
import { reactUiMicroAskEdits } from '@/lib/webProjectCanon';

export type ScaffoldFile = { path: string; content: string };

function pkgName(name: string): string {
  return slugifyProjectName(name).toLowerCase();
}

export function buildScaffoldFiles(
  kind: ProjectKind,
  opts: { name: string; summary?: string },
): ScaffoldFile[] {
  const title = opts.name.trim() || 'New Project';
  const pkg = pkgName(title);
  const summary = String(opts.summary || '');

  // Marketing landings win unless the brief clearly wants an interactive SPA / cockpit.
  if (/\b(watchlist|trading\s+cockpit|trade\s*rail|orders?\s+tab)\b/i.test(summary)) {
    return buildLandingPageFiles(title, summary);
  }
  if (/\bcalculator\b/i.test(summary)) {
    return buildLandingPageFiles(title, summary);
  }
  if (looksLikeLandingBrief(summary) && !prefersReactAppScaffold(summary)) {
    return buildLandingPageFiles(title, summary);
  }
  // Festival / event briefs even when marketing heuristic is weak.
  if (/\b(festival|lineup|ticket\s+cta|jazz|concert|velvet)\b/i.test(summary) && !prefersReactAppScaffold(summary)) {
    return buildLandingPageFiles(title, summary);
  }

  // Interactive SPA / React briefs → Vite scaffold.
  if (kind === 'vite-react' || prefersReactAppScaffold(summary)) {
    return viteReactScaffold(title, pkg, summary);
  }

  // Static-web with a long brief but weak marketing signals.
  if (kind === 'static-web' && summary.length > 120) {
    return buildLandingPageFiles(title, summary);
  }

  if (kind === 'python') return pythonScaffold(title);
  if (kind === 'static-web') return staticWebScaffold(title);
  if (kind === 'node-cli') return nodeCliScaffold(title, pkg);
  return viteReactScaffold(title, pkg, summary);
}

function gitignore(kind: 'node' | 'python' | 'web'): string {
  const common = ['.DS_Store', 'Thumbs.db', '*.log', '.env', '.env.*'];
  if (kind === 'node') {
    return [...common, 'node_modules/', 'dist/', 'build/', '.vite/'].join('\n') + '\n';
  }
  if (kind === 'python') {
    return [...common, '__pycache__/', '*.pyc', '.venv/', 'venv/'].join('\n') + '\n';
  }
  return common.join('\n') + '\n';
}

function staticWebScaffold(title: string): ScaffoldFile[] {
  return [
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <div id="app"></div>
  <script src="js/app.js"></script>
</body>
</html>
`,
    },
    {
      path: 'css/styles.css',
      content: `* { box-sizing: border-box; margin: 0; }
body { font-family: system-ui, sans-serif; min-height: 100vh; }
`,
    },
    {
      path: 'js/app.js',
      content: `const root = document.getElementById('app');\n`,
    },
    { path: '.gitignore', content: gitignore('web') },
  ];
}

function viteReactScaffold(title: string, pkg: string, summary = ''): ScaffoldFile[] {
  const files: ScaffoldFile[] = [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: pkg,
        private: true,
        version: '0.1.0',
        type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1', 'lucide-react': '^0.474.0' },
        devDependencies: { '@vitejs/plugin-react': '^4.3.4', vite: '^6.0.3' },
      }, null, 2) + '\n',
    },
    {
      path: 'vite.config.js',
      content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
    },
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
    },
    {
      path: 'src/main.jsx',
      content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    },
    {
      path: 'src/App.jsx',
      content: `import './App.css';

export default function App() {
  return (
    <div className="app" />
  );
}
`,
    },
    {
      path: 'src/App.css',
      content: `.app { min-height: 100vh; }\n`,
    },
    {
      path: 'src/index.css',
      content: `body { margin: 0; font-family: system-ui, sans-serif; }\n`,
    },
    { path: '.gitignore', content: gitignore('node') },
  ];

  // Chat / app briefs → replace empty App.jsx via reactUiMicroAskEdits (no-op if no match).
  if (summary.trim()) {
    const map = Object.fromEntries(files.map(f => [f.path, f.content]));
    const edits = reactUiMicroAskEdits(map, summary, { projectName: title });
    for (const e of edits) {
      const i = files.findIndex(f => f.path === e.path);
      if (i >= 0) files[i] = { path: e.path, content: e.content };
      else files.push({ path: e.path, content: e.content });
    }
  }

  return files;
}

function pythonScaffold(title: string): ScaffoldFile[] {
  return [
    {
      path: 'app/main.py',
      content: `"""${title}"""


def main() -> None:
    pass


if __name__ == "__main__":
    main()
`,
    },
    { path: 'requirements.txt', content: '' },
    { path: '.gitignore', content: gitignore('python') },
  ];
}

function nodeCliScaffold(title: string, pkg: string): ScaffoldFile[] {
  return [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: pkg,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: { start: 'node bin/cli.js' },
      }, null, 2) + '\n',
    },
    {
      path: 'bin/cli.js',
      content: `#!/usr/bin/env node\n`,
    },
    { path: '.gitignore', content: gitignore('node') },
  ];
}

export function projectUsesNpm(kind: ProjectKind): boolean {
  return kind === 'vite-react' || kind === 'node-cli';
}
