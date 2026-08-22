/**
 * Deterministic project scaffolds — valid trees ARK writes before optional model pass.
 */

import type { ProjectKind } from '@/lib/createProjectIntent';
import { slugifyProjectName } from '@/lib/projectNames';

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
  const summary = String(opts.summary || '').trim();

  if (kind === 'python') return pythonScaffold(title, pkg, summary);
  if (kind === 'static-web') return staticWebScaffold(title, summary);
  if (kind === 'node-cli') return nodeCliScaffold(title, pkg, summary);
  return viteReactScaffold(title, pkg, summary);
}

function gitignore(kind: 'node' | 'python' | 'web'): string {
  const common = ['.DS_Store', 'Thumbs.db', '*.log', '.env', '.env.*', '!.env.example'];
  if (kind === 'node') {
    return [...common, 'node_modules/', 'dist/', 'build/', '.vite/'].join('\n') + '\n';
  }
  if (kind === 'python') {
    return [...common, '__pycache__/', '*.pyc', '.venv/', 'venv/'].join('\n') + '\n';
  }
  return common.join('\n') + '\n';
}

function readme(title: string, body: string): string {
  return `# ${title}\n\n${body}\n`;
}

function staticWebScaffold(title: string, summary: string): ScaffoldFile[] {
  const hint = summary ? `\n> ${summary.slice(0, 200)}\n` : '';
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
  <main class="wrap">
    <h1>${title}</h1>
    <p>Your site is ready — edit <code>index.html</code> and <code>css/styles.css</code>.</p>
  </main>
  <script src="js/app.js"></script>
</body>
</html>
`,
    },
    {
      path: 'css/styles.css',
      content: `* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background: #0b1020;
  color: #e8ecf4;
  min-height: 100vh;
}
.wrap {
  max-width: 42rem;
  margin: 0 auto;
  padding: 3rem 1.25rem;
}
h1 { font-size: 2rem; margin-bottom: 0.5rem; }
code { background: rgba(255,255,255,0.08); padding: 0.15rem 0.35rem; border-radius: 0.35rem; }
`,
    },
    {
      path: 'js/app.js',
      content: `document.title = ${JSON.stringify(title)};\nconsole.log('${title} loaded');\n`,
    },
    {
      path: 'README.md',
      content: readme(title, `${hint}\nOpen \`index.html\` in a browser or serve this folder with any static server.`),
    },
    { path: '.gitignore', content: gitignore('web') },
  ];
}

function viteReactScaffold(title: string, pkg: string, summary: string): ScaffoldFile[] {
  const chatLike = /\b(discord|call|chat|webrtc)\b/i.test(summary);
  const files: ScaffoldFile[] = [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: pkg,
        private: true,
        version: '0.1.0',
        type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
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
    <div className="app">
      <header>
        <h1>${title}</h1>
        <p>Scaffold ready — run <code>npm install</code> then <code>npm run dev</code>.</p>
      </header>
    </div>
  );
}
`,
    },
    {
      path: 'src/App.css',
      content: `.app {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem;
  text-align: center;
}
header h1 { font-size: 2rem; margin-bottom: 0.5rem; }
code { background: rgba(255,255,255,0.08); padding: 0.15rem 0.35rem; border-radius: 0.35rem; }
`,
    },
    {
      path: 'src/index.css',
      content: `body {
  margin: 0;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background: #0b1020;
  color: #e8ecf4;
}
`,
    },
    {
      path: 'README.md',
      content: readme(
        title,
        `Vite + React scaffold created by ARK.\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\nThen open the local URL Vite prints.`,
      ),
    },
    { path: '.gitignore', content: gitignore('node') },
  ];

  if (chatLike) {
    files.push(
      {
        path: 'src/pages/Chat.jsx',
        content: `export default function Chat() {
  return (
    <section>
      <h2>Chat</h2>
      <p>Placeholder — wire messaging UI here.</p>
    </section>
  );
}
`,
      },
      {
        path: 'src/pages/Call.jsx',
        content: `export default function Call() {
  return (
    <section>
      <h2>Call</h2>
      <p>Placeholder — WebRTC / voice can be added in a follow-up Agent turn.</p>
    </section>
  );
}
`,
      },
    );
  }

  return files;
}

function pythonScaffold(title: string, pkg: string, summary: string): ScaffoldFile[] {
  return [
    {
      path: 'app/__init__.py',
      content: `"""${title}"""\n`,
    },
    {
      path: 'app/main.py',
      content: `"""${title} entrypoint."""

def main() -> None:
    print("Hello from ${title}!")
    print("Edit app/main.py and iterate from Chat.")


if __name__ == "__main__":
    main()
`,
    },
    {
      path: 'requirements.txt',
      content: '# Add dependencies here, e.g. requests>=2.31\n',
    },
    {
      path: 'run.bat',
      content: `@echo off
cd /d "%~dp0"
python app\\main.py
pause
`,
    },
    {
      path: 'README.md',
      content: readme(
        title,
        `Python project scaffold.\n\n\`\`\`bash\npip install -r requirements.txt\npython app/main.py\n\`\`\`\n\nOr double-click \`run.bat\` on Windows.`,
      ),
    },
    { path: '.gitignore', content: gitignore('python') },
  ];
}

function nodeCliScaffold(title: string, pkg: string, summary: string): ScaffoldFile[] {
  return [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: pkg,
        version: '0.1.0',
        private: true,
        type: 'module',
        bin: { [pkg]: './bin/cli.js' },
        scripts: { start: 'node bin/cli.js' },
      }, null, 2) + '\n',
    },
    {
      path: 'bin/cli.js',
      content: `#!/usr/bin/env node
console.log('${title} CLI ready');
`,
    },
    {
      path: 'README.md',
      content: readme(title, 'Node CLI scaffold. Run `node bin/cli.js`.'),
    },
    { path: '.gitignore', content: gitignore('node') },
  ];
}
