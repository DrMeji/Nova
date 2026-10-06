/**
 * Minimal project files — empty starting points only.
 * Product UI comes from the model (or later edits), never from canned landings.
 */

import type { ProjectKind } from '@/lib/createProjectIntent';
import { slugifyProjectName } from '@/lib/projectNames';
import { prefersReactAppScaffold } from '@/lib/webLandingFromBrief';

export type ScaffoldFile = { path: string; content: string };

function pkgName(name: string): string {
  return slugifyProjectName(name).toLowerCase();
}

export function buildScaffoldFiles(
  kind: ProjectKind,
  opts: { name: string; summary?: string; preferredLanguage?: string },
): ScaffoldFile[] {
  const title = opts.name.trim() || 'New Project';
  const pkg = pkgName(title);
  const summary = String(opts.summary || '');
  const preferTs = /typescript|\.tsx?\b|^ts$/i.test(String(opts.preferredLanguage || ''));

  // Interactive SPA / React briefs → Vite scaffold (empty App shell).
  if (kind === 'vite-react' || prefersReactAppScaffold(summary)) {
    return viteReactScaffold(title, pkg, preferTs);
  }

  if (kind === 'python') return pythonScaffold(title);
  if (kind === 'static-web') return staticWebScaffold(title);
  if (kind === 'node-cli') return nodeCliScaffold(title, pkg);
  return viteReactScaffold(title, pkg, preferTs);
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
      content: `* { box-sizing: border-box; }
html, body {
  margin: 0;
  min-height: 100%;
}
#app { min-height: 100vh; }
`,
    },
    {
      path: 'js/app.js',
      content: `document.documentElement.dataset.arkReady = '1';
`,
    },
    { path: '.gitignore', content: gitignore('web') },
  ];
}

function viteReactScaffold(title: string, pkg: string, preferTs = false): ScaffoldFile[] {
  const mainExt = preferTs ? 'tsx' : 'jsx';
  const appExt = preferTs ? 'tsx' : 'jsx';
  const files: ScaffoldFile[] = [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: pkg,
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
        },
        dependencies: {
          react: '^18.3.1',
          'react-dom': '^18.3.1',
        },
        devDependencies: {
          '@vitejs/plugin-react': '^4.3.4',
          vite: '^5.4.11',
          ...(preferTs ? { typescript: '^5.6.3' } : {}),
        },
      }, null, 2) + '\n',
    },
    {
      path: preferTs ? 'vite.config.ts' : 'vite.config.js',
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
  <script type="module" src="/src/main.${mainExt}"></script>
</body>
</html>
`,
    },
    {
      path: `src/main.${mainExt}`,
      content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')${preferTs ? '!' : ''}).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    },
    {
      path: `src/App.${appExt}`,
      content: `import './App.css';

/** Bare Vite mount — craft owns the product UI (no phone-column title stub). */
export default function App() {
  return <div className="app" id="root-app" />;
}
`,
    },
    {
      path: 'src/App.css',
      content: `/* Bare shell — craft fills layout. Do not center a title stub. */
.app {
  min-height: 100vh;
  margin: 0;
  width: 100%;
  display: block;
  background: #0f1419;
  color: #f4f7fb;
}
`,
    },
    {
      path: 'src/index.css',
      content: `body { margin: 0; font-family: system-ui, sans-serif; }\n`,
    },
    { path: '.gitignore', content: gitignore('node') },
  ];
  if (preferTs) {
    files.push({
      path: 'tsconfig.json',
      content: JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          useDefineForClassFields: true,
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          isolatedModules: true,
          moduleDetection: 'force',
          noEmit: true,
          jsx: 'react-jsx',
          strict: true,
        },
        include: ['src'],
      }, null, 2) + '\n',
    });
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

/** Merge brief-driven npm deps into package.json (e.g. three for spatial apps). */
export function mergeBriefNpmDependencies(
  files: Record<string, string>,
  brief: string,
): Record<string, string> {
  const pkgPath = Object.keys(files).find((p) => /(^|\/)package\.json$/i.test(p.replace(/\\/g, '/')));
  if (!pkgPath) return files;
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(files[pkgPath] || '{}') as Record<string, unknown>;
  } catch {
    return files;
  }
  const deps = {
    ...((pkg.dependencies as Record<string, string> | undefined) || {}),
  };
  const t = String(brief || '').toLowerCase();
  let changed = false;
  if (/\b(3d|three\.?js|webgl|babylon|modeler|modeling\s+app|viewport|blender|mesh\s+editor)\b/.test(t)) {
    if (!deps.three) {
      deps.three = '^0.170.0';
      changed = true;
    }
  }
  // Canvas / arcade games stay on stock React — no extra deps required.
  // FPS / pointer-lock briefs also stay dependency-light (vanilla canvas).
  if (/\b(?:babylon\.?js|@babylonjs)\b/.test(t) && !deps['@babylonjs/core']) {
    deps['@babylonjs/core'] = '^7.0.0';
    changed = true;
  }
  if (!changed) return files;
  pkg.dependencies = deps;
  return {
    ...files,
    [pkgPath]: `${JSON.stringify(pkg, null, 2)}\n`,
  };
}
