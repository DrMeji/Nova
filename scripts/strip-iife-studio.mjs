/**
 * Strip dead general/code micro+inspect from media IIFE (never reached after Wave 2 early return).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src', 'views', 'AIChat.tsx');
let s = fs.readFileSync(file, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';

const markerStart = '      // Bound micro UI edits before inspect/planning — never “still planning” after create.';
const markerStartAlt = '      // Bound micro UI edits before inspect/planning';
const markerEnd = '      if (!usedPlugin && pluginId) {';

let start = s.indexOf(markerStart);
if (start < 0) start = s.indexOf(markerStartAlt);
const end = s.indexOf(markerEnd, start);
if (start < 0 || end < 0) {
  console.error('markers missing', { start, end });
  process.exit(1);
}

const keepStudio = [
  '      // Prefer sticky map from resolveStudioFiles.',
  '      const studioFiles = Object.keys(resolvedStudio.files).length',
  '        ? resolvedStudio.files',
  '        : chatStudioFilesRef.current;',
  '      const hasStudioFiles = Object.keys(studioFiles).length > 0;',
  '      if (hasStudioFiles) {',
  '        chatStudioFilesRef.current = studioFiles;',
  '      }',
  '',
  '      // WAVE 2: studio micro/inspect owned by early dispatch — deleted from media IIFE.',
  '',
].join(nl);

// Also remove the preceding "Prefer sticky map" block that is now duplicated — find try { before marker
const tryIdx = s.lastIndexOf('      try {', start);
const preferIdx = s.indexOf('      // Prefer sticky map', tryIdx);
if (preferIdx >= 0 && preferIdx < start) {
  // Replace from prefer sticky through end-of-dead-block
  const out = s.slice(0, preferIdx) + keepStudio + s.slice(end);
  fs.writeFileSync(file, out);
  console.log(`stripped IIFE studio; lines ${s.split(/\r?\n/).length} → ${out.split(/\r?\n/).length}`);
} else {
  const out = s.slice(0, start) + keepStudio + s.slice(end);
  fs.writeFileSync(file, out);
  console.log(`stripped from marker; lines ${s.split(/\r?\n/).length} → ${out.split(/\r?\n/).length}`);
}
