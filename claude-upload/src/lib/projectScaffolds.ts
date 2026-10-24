/**
 * Minimal project files — empty starting points only.
 * Product UI comes from the model (or later edits), never from canned landings.
 */

import type { ProjectKind } from '@/lib/createProjectIntent';
import type { ArtifactKind } from '@/lib/createArtifactKind';
import { slugifyProjectName } from '@/lib/projectNames';
import { prefersReactAppScaffold } from '@/lib/webLandingFromBrief';

export type ScaffoldFile = { path: string; content: string };

function pkgName(name: string): string {
  return slugifyProjectName(name).toLowerCase();
}

export function buildScaffoldFiles(
  kind: ProjectKind,
  opts: { name: string; summary?: string; preferredLanguage?: string; artifactKind?: ArtifactKind },
): ScaffoldFile[] {
  const title = opts.name.trim() || 'New Project';
  const pkg = pkgName(title);
  const summary = String(opts.summary || '');
  const preferTs = /typescript|\.tsx?\b|^ts$/i.test(String(opts.preferredLanguage || ''));
  const artifact = opts.artifactKind;

  // Prefer explicit artifactKind over ProjectKind collapse (node-cli shared by API/library/…).
  if (artifact === 'python') return pythonScaffold(title);
  if (artifact === 'node-api') return nodeApiScaffold(title, pkg, preferTs);
  if (artifact === 'library') return libraryScaffold(title, pkg, preferTs);
  if (artifact === 'extension') {
    return /\b(?:vs\s*code|vscode|visual\s+studio\s+code)\b/i.test(summary)
      ? vscodeExtensionScaffold(title, pkg)
      : extensionScaffold(title, pkg);
  }
  if (artifact === 'test-suite') {
    return /\b(?:pytest|python|\.py)\b/i.test(summary)
      ? pythonTestSuiteScaffold(title)
      : testSuiteScaffold(title, pkg, preferTs);
  }
  if (artifact === 'node-cli') return nodeCliScaffold(title, pkg);

  // Unknown coding (Go/Rust CLI, React Native, R Shiny, Qt, .NET, …) before Vite/react heuristics.
  // Always README-only when artifactKind is unknown — never fake a static/Vite storefront.
  if (artifact === 'unknown') {
    return codingUnknownScaffold(title, summary);
  }
  if (kind === 'unknown') {
    if (
      /\b(?:cli|command[\s-]?line|api|server|backend|library|package|bot|scraper|crawler|worker|lambda|cloudflare|docker|makefile|github\s+actions?|grpc|protobuf|react\s+native|flutter|android|ios|golang|\bgo\b|rust|cargo|kotlin|swift|bash|shell|tauri|terraform|helm|prisma|unity|godot|bevy|unreal|arduino|esp32|firmware|wordpress|shopify|figma|obsidian|raycast|userscript|tampermonkey|greasemonkey|shiny|\.net|qt\b|gtk|zig|haskell|ocaml|julia)\b/i.test(summary)
      || (
        /\b(?:build|create|make|scaffold|write|implement)\b/i.test(summary)
        && !/\b(?:website|landing|homepage|storefront|dashboard|react\s+app|vite\s+app)\b/i.test(summary)
      )
    ) {
      return codingUnknownScaffold(title, summary);
    }
  }

  // Non-web kinds first — never let prefersReactAppScaffold hijack CLI/API/library/python.
  if (kind === 'python') return pythonScaffold(title);
  if (kind === 'node-cli') {
    if (/\b(?:chrome\s+extension|browser\s+extension|firefox\s+(?:addon|extension)|edge\s+extension|web\s+extension)\b/i.test(summary)) {
      return extensionScaffold(title, pkg);
    }
    if (
      /\b(?:unit\s+tests?|test\s+suite|jest|vitest|pytest)\b/i.test(summary)
      && /\b(?:write|add|create|generate)\b/i.test(summary)
    ) {
      return testSuiteScaffold(title, pkg, preferTs);
    }
    if (
      /\b(?:express|fastify|koa|hono|rest\s+api|http\s+api|backend(?:\s+service)?|rest\s+service|\bapi\b)\b/i.test(summary)
      && !/\b(?:react\s+app|vite\s+app|frontend\s+app|dashboard|cli\s+tool)\b/i.test(summary)
      && !/\b(?:with|plus|and)\s+(?:a\s+)?(?:react|vite|frontend)\b/i.test(summary)
    ) {
      return nodeApiScaffold(title, pkg, preferTs);
    }
    if (
      /\b(?:npm\s+package|node\s+library|typescript\s+library|js\s+library|publishable\s+library)\b/i.test(summary)
      || (/\blibrary\b/i.test(summary) && /\b(?:build|create|make|scaffold|publish)\b/i.test(summary))
    ) {
      return libraryScaffold(title, pkg, preferTs);
    }
    return nodeCliScaffold(title, pkg);
  }

  // Interactive SPA / React briefs → Vite scaffold (empty App shell).
  // Electron / simple canvas games still get Vite React as the renderer host.
  if (
    kind === 'vite-react'
    || prefersReactAppScaffold(summary)
    || /\b(?:electron|ipc|desktop\s+app)\b/i.test(summary)
    || (/\b(?:game|playable|arcade|canvas\s+game)\b/i.test(summary) && !/\b(?:cli|api|library)\b/i.test(summary))
  ) {
    const base = viteReactScaffold(title, pkg, preferTs);
    if (/\b(?:electron|ipc|desktop\s+app)\b/i.test(summary)) {
      const withMain = base.map((f) => {
        if (f.path !== 'package.json') return f;
        try {
          const pkgJson = JSON.parse(f.content);
          pkgJson.main = 'electron/main.cjs';
          pkgJson.scripts = {
            ...(pkgJson.scripts || {}),
            electron: 'electron .',
            'electron:dev': 'vite build && electron .',
          };
          pkgJson.devDependencies = {
            ...(pkgJson.devDependencies || {}),
            electron: '^33.0.0',
          };
          return { path: f.path, content: `${JSON.stringify(pkgJson, null, 2)}\n` };
        } catch {
          return f;
        }
      });
      return [...withMain, ...electronMainExtras(title)];
    }
    return base;
  }

  if (kind === 'static-web') return staticWebScaffold(title);

  // Unknown web-ish: empty static stub — never force Vite React onto coding asks.
  return staticWebScaffold(title);
}

/** Honest empty coding workspace — README only, no website shell. */
function codingUnknownScaffold(title: string, summary: string): ScaffoldFile[] {
  const hint = String(summary || title).trim().slice(0, 240);
  return [
    {
      path: 'README.md',
      content: `# ${title}\n\nScaffold for: ${hint || 'coding project'}\n\nNova left this as an empty coding workspace (not a website). Add the real entry files for this stack.\n`,
    },
    { path: '.gitignore', content: gitignore('node') },
  ];
}

function electronMainExtras(title: string): ScaffoldFile[] {
  return [
    {
      path: 'electron/main.cjs',
      content: `const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
    title: ${JSON.stringify(title)},
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
`,
    },
    {
      path: 'electron/preload.cjs',
      content: `const { contextBridge } = require('electron');\ncontextBridge.exposeInMainWorld('nova', { ping: () => 'pong' });\n`,
    },
  ];
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
/* index.css first — App.css must win the cascade for page canvas color. */
import './index.css';
import App from './App';

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
  return (
    <div className="app" id="root-app">
    </div>
  );
}
`,
    },
    {
      path: 'src/App.css',
      content: `/* Bare shell — craft owns palette/layout. Neutral canvas (not dark-neon bias). */
.app {
  min-height: 100vh;
  margin: 0;
  width: 100%;
  display: block;
  background: #f7f4ef;
  color: #1a1f2a;
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
      content: `#!/usr/bin/env node\nconsole.log('${title.replace(/'/g, "\\'")} cli');\n`,
    },
    { path: '.gitignore', content: gitignore('node') },
  ];
}

/** Chrome/browser extension — manifest + background, not a Vite marketing site. */
function extensionScaffold(title: string, pkg: string): ScaffoldFile[] {
  return [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: pkg,
        version: '0.1.0',
        private: true,
        scripts: { build: 'node -e "console.log(\'load unpacked extension\')"' },
      }, null, 2) + '\n',
    },
    {
      path: 'manifest.json',
      content: JSON.stringify({
        manifest_version: 3,
        name: title,
        version: '0.1.0',
        description: title,
        action: { default_popup: 'popup.html' },
        background: { service_worker: 'background.js' },
        permissions: [],
      }, null, 2) + '\n',
    },
    {
      path: 'background.js',
      content: `chrome.runtime.onInstalled.addListener(() => {\n  console.log(${JSON.stringify(title)} + ' installed');\n});\n`,
    },
    {
      path: 'popup.html',
      content: `<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>${title}</title></head><body><h1>${title}</h1></body></html>\n`,
    },
    { path: '.gitignore', content: gitignore('node') },
  ];
}

/** VS Code extension — package contributes + Node activate entry, no Chrome MV3 manifest. */
function vscodeExtensionScaffold(title: string, pkg: string): ScaffoldFile[] {
  return [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: pkg,
        displayName: title,
        version: '0.1.0',
        private: true,
        engines: { vscode: '^1.85.0' },
        main: './extension.js',
        activationEvents: ['onCommand:nova.hello'],
        contributes: {
          commands: [{ command: 'nova.hello', title: `${title}: Hello` }],
        },
        scripts: { build: 'node -e "console.log(\'package VSIX with vsce\')"' },
      }, null, 2) + '\n',
    },
    {
      path: 'extension.js',
      content: `const vscode = require('vscode');

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('nova.hello', () => {
      vscode.window.showInformationMessage(${JSON.stringify(title)} + ' is active');
    }),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
`,
    },
    { path: '.gitignore', content: gitignore('node') },
  ];
}

function pythonTestSuiteScaffold(title: string): ScaffoldFile[] {
  void title;
  return [
    { path: 'requirements.txt', content: 'pytest>=8.0\n' },
    { path: 'pytest.ini', content: '[pytest]\ntestpaths = tests\n' },
    { path: 'tests/test_sample.py', content: 'def test_truth():\n    assert True\n' },
    { path: '.gitignore', content: gitignore('python') },
  ];
}

/** Minimal test-suite scaffold — vitest-style tests, not a Vite App shell. */
function testSuiteScaffold(title: string, pkg: string, preferTs = false): ScaffoldFile[] {
  const ext = preferTs ? 'ts' : 'js';
  return [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: pkg,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          test: preferTs ? 'npx --yes tsx --test src/*.test.ts' : 'node --test',
        },
      }, null, 2) + '\n',
    },
    {
      path: `src/sample.${ext}`,
      content: `export function add(a, b) {\n  return a + b;\n}\n`,
    },
    {
      path: `src/sample.test.${ext}`,
      content: `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from './sample.${ext}';\n\ntest('add', () => {\n  assert.equal(add(1, 2), 3);\n});\n`,
    },
    { path: '.gitignore', content: gitignore('node') },
  ];
}

/** Publishable library package — entry + package.json, not Vite SPA or CLI bin. */
function libraryScaffold(title: string, pkg: string, preferTs = false): ScaffoldFile[] {
  const entry = preferTs ? 'src/index.ts' : 'src/index.js';
  return [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: pkg,
        version: '0.1.0',
        private: true,
        type: 'module',
        main: preferTs ? './dist/index.js' : `./${entry}`,
        exports: { '.': preferTs ? './dist/index.js' : `./${entry}` },
        scripts: {
          build: preferTs ? 'tsc' : 'node -e "console.log(\'no build\')"',
          test: preferTs ? 'npm run build && node --test dist' : 'node --test',
        },
        ...(preferTs ? { devDependencies: { typescript: '^5.6.3' } } : {}),
      }, null, 2) + '\n',
    },
    {
      path: entry,
      content: `/** ${title} */\nexport function hello(name = 'world') {\n  return \`hello \${name}\`;\n}\n`,
    },
    ...(preferTs
      ? [{
          path: 'tsconfig.json',
          content: JSON.stringify({
            compilerOptions: {
              target: 'ES2020',
              module: 'NodeNext',
              moduleResolution: 'NodeNext',
              outDir: 'dist',
              rootDir: 'src',
              declaration: true,
              strict: true,
              skipLibCheck: true,
            },
            include: ['src'],
          }, null, 2) + '\n',
        }]
      : []),
    { path: '.gitignore', content: gitignore('node') },
  ];
}

/** Minimal Express-style API scaffold — not a Vite React SPA. */
function nodeApiScaffold(title: string, pkg: string, preferTs = false): ScaffoldFile[] {
  const ext = preferTs ? 'ts' : 'js';
  const files: ScaffoldFile[] = [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: pkg,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          start: preferTs ? 'tsx src/server.ts' : 'node src/server.js',
          dev: preferTs ? 'tsx watch src/server.ts' : 'node --watch src/server.js',
        },
        dependencies: {
          express: '^4.21.0',
        },
        ...(preferTs
          ? {
              devDependencies: {
                tsx: '^4.19.0',
                typescript: '^5.6.3',
                '@types/express': '^4.17.21',
                '@types/node': '^22.0.0',
              },
            }
          : {}),
      }, null, 2) + '\n',
    },
    {
      path: `src/server.${ext}`,
      content: `import express from 'express';

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, name: ${JSON.stringify(title)} });
});

app.listen(port, () => {
  console.log(${JSON.stringify(title)} + ' listening on ' + port);
});
`,
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
          module: 'NodeNext',
          skipLibCheck: true,
          moduleResolution: 'NodeNext',
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

/**
 * Whether this project should run npm install / Live npm bootstrap.
 * When `files` is provided, also require a package.json — pytest / Python /
 * README-only unknown scaffolds map to node-cli but must not get npm.
 */
export function projectUsesNpm(
  kind: ProjectKind,
  files?: Array<{ path: string }> | Record<string, string> | null,
): boolean {
  if (kind !== 'vite-react' && kind !== 'node-cli') return false;
  if (files == null) return true;
  const paths = Array.isArray(files)
    ? files.map((f) => String(f.path || '').replace(/\\/g, '/'))
    : Object.keys(files).map((p) => p.replace(/\\/g, '/'));
  if (!paths.length) return true;
  return paths.some((p) => /(^|\/)package\.json$/i.test(p));
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
