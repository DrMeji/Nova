import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const result = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '.', '--format', 'json'], {
  encoding: 'utf8', maxBuffer: 60 * 1024 * 1024,
});
if (result.error) throw result.error;
const reports = JSON.parse(result.stdout);
let filesChanged = 0;
let bindingsRemoved = 0;

for (const report of reports) {
  const unused = new Set(report.messages
    .filter((message) => message.ruleId === '@typescript-eslint/no-unused-vars')
    .map((message) => `${message.line}:${message.column}`));
  if (!unused.size) continue;
  const file = path.resolve(report.filePath);
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const unusedAt = (node) => {
    const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
    return unused.has(`${pos.line + 1}:${pos.character + 1}`);
  };

  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
      const discarded = node.name.elements.filter((element) => ts.isIdentifier(element.name) && unusedAt(element.name));
      if (!discarded.length) return ts.forEachChild(node, visit);
      const raw = node.getText(source);
      if (/\/\*|\/\//.test(raw) || node.name.elements.some((element) => !ts.isIdentifier(element.name))) return;
      const kept = node.name.elements.filter((element) => !discarded.includes(element));
      if (!kept.length) return ts.forEachChild(node, visit);
      const initializer = node.initializer?.getText(source) || '';
      const type = node.type ? `: ${node.type.getText(source)}` : '';
      const replacement = `{ ${kept.map((element) => element.getText(source)).join(', ')} }${type} = ${initializer}`;
      edits.push({ start: node.getStart(source), end: node.end, text: replacement });
      bindingsRemoved += discarded.length;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!edits.length) continue;
  let next = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
  fs.writeFileSync(file, next);
  filesChanged += 1;
}

console.log(`Removed ${bindingsRemoved} unused destructured bindings from ${filesChanged} files.`);
