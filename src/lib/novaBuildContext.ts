/**
 * Smart context pack for create/edit agent turns.
 * Sends only the files that matter — cuts poison context that causes dump garbage.
 */

const ALWAYS = new Set([
  'package.json',
  'index.html',
  'vite.config.ts',
  'vite.config.js',
  'tsconfig.json',
  'tsconfig.app.json',
  'src/main.tsx',
  'src/main.jsx',
  'src/index.css',
  'src/App.tsx',
  'src/App.jsx',
  'src/App.css',
]);

const BINARY_OR_ASSET = /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|eot|mp4|webm|mp3|wav|pdf|zip)$/i;
const PUBLIC_MARKER = /^public\//i;

export function packNovaBuildContext(
  files: Record<string, string>,
  opts?: { extraPaths?: string[]; maxChars?: number },
): Record<string, string> {
  const maxChars = opts?.maxChars ?? 180_000;
  const out: Record<string, string> = {};
  const extras = new Set((opts?.extraPaths || []).map((p) => p.replace(/\\/g, '/')));

  for (const [rawPath, content] of Object.entries(files || {})) {
    const path = rawPath.replace(/\\/g, '/');
    if (BINARY_OR_ASSET.test(path)) continue;
    if (PUBLIC_MARKER.test(path) && !/\.(html?|json|txt|css|js|ts|tsx|jsx|md)$/i.test(path)) {
      // Keep tiny public text stubs; skip binary heroes (content may be empty presence).
      if (String(content || '').length > 400) continue;
    }
    const keep = ALWAYS.has(path)
      || extras.has(path)
      || /^src\/.*\.(tsx?|jsx?|css)$/i.test(path);
    if (!keep) continue;
    out[path] = String(content ?? '');
  }

  // Prefer App.tsx over App.jsx twin.
  if (out['src/App.tsx'] && out['src/App.jsx']) {
    delete out['src/App.jsx'];
  }

  let total = Object.values(out).reduce((n, c) => n + c.length, 0);
  if (total <= maxChars) return out;

  // Trim largest non-App files first.
  const ranked = Object.keys(out).sort((a, b) => (out[b]?.length || 0) - (out[a]?.length || 0));
  for (const path of ranked) {
    if (total <= maxChars) break;
    if (/^src\/App\.(tsx|jsx|css)$/i.test(path) || path === 'package.json') continue;
    const len = out[path]?.length || 0;
    if (len > 8_000) {
      out[path] = `${out[path].slice(0, 6_000)}\n\n/* …truncated for context pack… */\n`;
      total = Object.values(out).reduce((n, c) => n + c.length, 0);
    }
  }
  return out;
}

/** Paths the model should treat as write targets for a Vite React create. */
export function novaCreateWriteTargets(files: Record<string, string>): string[] {
  const preferTs = Boolean(files['src/App.tsx'] && !files['src/App.jsx']);
  return [
    preferTs ? 'src/App.tsx' : 'src/App.jsx',
    'src/App.css',
    'src/index.css',
    'index.html',
  ].filter((p) => p in files || /^src\/App\./.test(p));
}
