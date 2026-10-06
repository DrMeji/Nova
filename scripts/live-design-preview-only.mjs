/**
 * Design-only preview — no coder model, no full create.
 * Renders Nova Design Spine shell for Luna and opens it in a browser window.
 *
 *   npx tsx --tsconfig tsconfig.app.json scripts/live-design-preview-only.mjs
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { buildDesignPlan, renderDesignShell, lintDesignSystem } from '../src/lib/createDesignSystem.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'scripts', '_design-preview-luna');
const PORT = Number(process.env.NOVA_DESIGN_PREVIEW_PORT || 5179);

const brief = 'Build a homepage for a skincare brand called Luna';
const product = 'Luna';
const plan = buildDesignPlan({ brief, productName: product });
const shell = renderDesignShell(plan);
const lint = lintDesignSystem(shell, plan);

console.log('Family:', plan.family);
console.log('Tone:', plan.tokens.tone, plan.tokens.atmosphere);
console.log('Palette:', plan.tokens.bg, plan.tokens.ink, plan.tokens.accent);
console.log('Lint OK:', lint.ok, lint.reasons.join('; ') || '(clean)');
console.log('Reference overlay:', plan.referenceOverlay || '(none — quality floor only)');

fs.mkdirSync(path.join(OUT_DIR, 'src'), { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Luna — Design Spine preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`);
fs.writeFileSync(path.join(OUT_DIR, 'src/main.jsx'), `import { createRoot } from 'react-dom/client'
import App from './App.jsx'
createRoot(document.getElementById('root')).render(<App />)
`);
fs.writeFileSync(path.join(OUT_DIR, 'src/App.jsx'), shell['src/App.tsx']);
fs.writeFileSync(path.join(OUT_DIR, 'src/App.css'), shell['src/App.css']);
fs.writeFileSync(path.join(OUT_DIR, 'package.json'), JSON.stringify({
  name: 'luna-design-spine-preview',
  private: true,
  type: 'module',
  scripts: { dev: 'vite --host 127.0.0.1 --port ' + PORT },
  dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
  devDependencies: { vite: '^6.0.0', '@vitejs/plugin-react': '^4.0.0' },
}, null, 2));
const nm = path.join(ROOT, 'node_modules').replace(/\\/g, '/');
fs.writeFileSync(path.join(OUT_DIR, 'vite.config.js'), `
import { defineConfig } from '${nm}/vite/dist/node/index.js'
import react from '${nm}/@vitejs/plugin-react/dist/index.js'
import path from 'path'
const nm = ${JSON.stringify(path.join(ROOT, 'node_modules'))}
export default defineConfig({
  root: ${JSON.stringify(OUT_DIR.replace(/\\/g, '/'))},
  plugins: [react()],
  resolve: {
    alias: {
      react: path.join(nm, 'react'),
      'react-dom': path.join(nm, 'react-dom'),
      'react/jsx-runtime': path.join(nm, 'react/jsx-runtime'),
      'react/jsx-dev-runtime': path.join(nm, 'react/jsx-dev-runtime'),
    },
  },
  server: { host: '127.0.0.1', port: ${PORT}, strictPort: true },
})
`);

// Serve with Vite from repo node_modules (no separate npm install)
const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(process.execPath, [
  viteBin,
  '--config', path.join(OUT_DIR, 'vite.config.js'),
], {
  cwd: ROOT,
  env: { ...process.env },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: false,
});

let ready = false;
const onData = (buf) => {
  const s = String(buf);
  process.stdout.write(s);
  if (/Local:|ready in/i.test(s)) ready = true;
};
child.stdout?.on('data', onData);
child.stderr?.on('data', onData);

const t0 = Date.now();
while (!ready && Date.now() - t0 < 45000) {
  await new Promise((r) => setTimeout(r, 400));
  try {
    await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${PORT}/`, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve(true);
        else reject(new Error('bad status'));
      }).on('error', reject);
    });
    ready = true;
  } catch { /* wait */ }
}

const url = `http://127.0.0.1:${PORT}/`;
console.log('\nDESIGN PREVIEW READY — watch this URL:');
console.log(url);
console.log('(Nova Design Spine shell only — no coder model, no create job)\n');

// Open default browser on Windows
spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });

// Keep server alive for watching
console.log('Preview server running — Ctrl+C to stop.');
await new Promise(() => {});
