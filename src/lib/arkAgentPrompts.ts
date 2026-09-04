/**
 * Project-kind system prompt hints for the agent loop.
 */

import { detectProjectKind, type ProjectKind } from '@/lib/projectKind';

export function detectKindFromFiles(files: Record<string, string>, brief = ''): ProjectKind {
  const paths = Object.keys(files || {}).join('\n').toLowerCase();
  if (files['package.json']) {
    const pkg = String(files['package.json'] || '');
    if (/react|vite/i.test(pkg) || /src\/app\.tsx|src\/main\.tsx/i.test(paths)) return 'vite-react';
    if (/"bin"\s*:/i.test(pkg) || /\bcommander\b|\byargs\b/i.test(pkg)) return 'node-cli';
  }
  if (/\.py\b/.test(paths) || files['requirements.txt'] || files['pyproject.toml']) return 'python';
  if (files['index.html'] && !files['package.json']) return 'static-web';
  const fromBrief = detectProjectKind(brief);
  return fromBrief;
}

export function agentKindGuidance(kind: ProjectKind): string {
  switch (kind) {
    case 'vite-react':
      return [
        'Stack: Vite + React. Prefer editing src/*.tsx / src/*.jsx and CSS modules.',
        'Be thorough: ship a usable first screen with real copy, layout, and working primary actions — not an empty shell or lorem placeholders.',
        'Verify with: npm run build (or npm run typecheck if present).',
        'Prefer TOOL: patch over rewriting whole components.',
        'Do not invent new package deps unless required; if needed run npm install <pkg>.',
      ].join('\n');
    case 'static-web':
      return [
        'Stack: static HTML/CSS/JS. Prefer index.html, css/, js/.',
        'No npm required unless package.json exists.',
        'Keep changes small; patch markup/CSS instead of regenerating the whole page when possible.',
      ].join('\n');
    case 'python':
      return [
        'Stack: Python. Prefer .py files, requirements.txt / pyproject.toml.',
        'Verify with: python -m py_compile <file> or pytest if present.',
        'Use pip install only when imports are missing.',
      ].join('\n');
    case 'node-cli':
      return [
        'Stack: Node CLI. Prefer bin entry + lib modules in package.json.',
        'Verify with: node <entry> --help or npm test.',
      ].join('\n');
    default:
      return [
        'Prefer read/grep before write. Prefer TOOL: patch for surgical edits.',
        'Run the lightest verify command that exists for this project.',
      ].join('\n');
  }
}
