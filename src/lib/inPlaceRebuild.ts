/**
 * Same-chat product correction: wipe UI entrypoints and rebuild from the NEW brief.
 */

import type { ProjectKind } from '@/lib/createProjectIntent';
import type { ArtifactKind } from '@/lib/createArtifactKind';
import { resolveArtifactKind } from '@/lib/createArtifactKind';
import { buildScaffoldFiles } from '@/lib/projectScaffolds';

export type ProjectFileMap = Record<string, string>;

/** UI / entry files that define the product surface (safe to overwrite on scrap/rebuild). */
export const REBUILD_UI_PATHS = [
  'src/App.jsx',
  'src/App.tsx',
  'src/App.css',
  'src/index.css',
  'src/main.jsx',
  'src/main.tsx',
  'index.html',
  'css/styles.css',
  'js/app.js',
] as const;

/**
 * Reset product UI files to an empty scaffold for the target kind.
 * Keeps package.json / vite config when present so npm install is preserved.
 */
export function wipeProjectUiFiles(opts: {
  files: ProjectFileMap;
  name: string;
  summary: string;
  kind: ProjectKind;
  artifactKind?: ArtifactKind;
}): ProjectFileMap {
  const artifactKind = opts.artifactKind ?? resolveArtifactKind(opts.summary || '');
  const scaffold = buildScaffoldFiles(opts.kind, {
    name: opts.name,
    summary: opts.summary,
    artifactKind,
  });
  const next: ProjectFileMap = { ...opts.files };
  const scaffoldPaths = new Set(scaffold.map((f) => f.path.replace(/\\/g, '/')));

  for (const path of REBUILD_UI_PATHS) {
    if (path in next) delete next[path];
  }
  for (const key of Object.keys(next)) {
    const norm = key.replace(/\\/g, '/');
    if (
      /(^|\/)App\.(jsx|tsx|css)$/i.test(norm)
      || /(^|\/)index\.css$/i.test(norm)
      || /(^|\/)main\.(jsx|tsx)$/i.test(norm)
      || /(^|\/)styles\.css$/i.test(norm)
      || /(^|\/)app\.js$/i.test(norm)
    ) {
      if (!scaffoldPaths.has(norm)) delete next[key];
    }
  }

  for (const file of scaffold) {
    next[file.path] = file.content;
  }
  return next;
}

export function apologyRebuildLead(productName: string): string {
  const name = String(productName || '').trim() || 'your project';
  return (
    `Sorry — that wasn’t what you asked for. Scrapping the previous UI in this folder and rebuilding **${name}** from your new brief…`
  );
}

/** Extract a short product name from a correction brief when possible. */
export function extractCorrectionProductName(text: string, fallback = 'App'): string {
  const t = String(text || '');

  // Prefer explicit called/named titles ("called Lumen Band").
  const called = t.match(
    /\b(?:called|named)\s+["“']([^"”']{2,48})["”']|\b(?:called|named)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3})\b/,
  );
  const fromCalled = String(called?.[1] || called?.[2] || '').trim().replace(/[:.,;!?]+$/, '');
  if (fromCalled && !/^(Game|App|Site|Website|Project|Actual|Real|Wrong|Something|Professional)$/i.test(fromCalled)) {
    return fromCalled;
  }

  // "rebuild as Harbor" / "turn this into Pulse Shop" — require Title Case so
  // "rebuild as a professional…" does not become the product name.
  const asTitle = t.match(
    /\b(?:turn\s+(?:this|it)\s+into|rebuild\s+as|make\s+it)\s+(?:a|an|the)?\s*["“']?([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3})\b/,
  );
  if (asTitle?.[1] && !/^(Game|App|Site|Website|Project|Actual|Real)$/i.test(asTitle[1])) {
    return asTitle[1].trim();
  }

  if (/\bbracelet\b/i.test(t)) return 'Bracelet';
  const game = t.match(/\b(?:game|shooter|runner|arcade)\s+called\s+["“']?([A-Za-z][A-Za-z0-9 _-]{1,40})/i);
  if (game?.[1]) return game[1].trim().replace(/[:.,;!?]+$/, '');
  return fallback;
}
