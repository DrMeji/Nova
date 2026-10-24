import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const lint = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '.', '--format', 'json'], { encoding: 'utf8', maxBuffer: 60 * 1024 * 1024 });
if (lint.error) throw lint.error;
const reports = JSON.parse(lint.stdout);
let removed = 0;
for (const report of reports) {
  const names = new Set(report.messages.filter((m) => m.ruleId === '@typescript-eslint/no-unused-vars').map((m) => `${m.line}:${m.column}`));
  if (!names.size) continue;
  const file = path.resolve(report.filePath);
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const walk = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const p = source.getLineAndCharacterOfPosition(node.name.getStart(source));
      const mods = node.modifiers || [];
      const exported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword);
      if (!exported && names.has(`${p.line + 1}:${p.character + 1}`)) {
        edits.push({ start: node.getStart(source), end: node.end });
        return;
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
  if (!edits.length) continue;
  let next = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) next = next.slice(0, edit.start) + next.slice(edit.end);
  fs.writeFileSync(file, next);
  removed += edits.length;
}
console.log(`Removed ${removed} unreferenced private function declarations.`);
