import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const lint = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '.', '--format', 'json'], {
  encoding: 'utf8', maxBuffer: 60 * 1024 * 1024,
});
if (lint.error) throw lint.error;
const reports = JSON.parse(lint.stdout);
let filesChanged = 0;
let bindingsRemoved = 0;
let paramsMarked = 0;

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
    const point = source.getLineAndCharacterOfPosition(node.getStart(source));
    return unused.has(`${point.line + 1}:${point.character + 1}`);
  };

  const visit = (node) => {
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && unusedAt(node.name) && !node.name.text.startsWith('_')) {
      edits.push({ start: node.name.getStart(source), end: node.name.end, text: `_${node.name.text}` });
      paramsMarked += 1;
      return;
    }
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)) {
      const discarded = node.name.elements.filter((element) => ts.isBindingElement(element) && ts.isIdentifier(element.name) && unusedAt(element.name));
      if (discarded.length) {
        const kept = node.name.elements.map((element) => discarded.includes(element) ? '' : element.getText(source));
        edits.push({ start: node.name.getStart(source), end: node.name.end, text: `[${kept.join(', ')}]` });
        bindingsRemoved += discarded.length;
        return;
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && unusedAt(node.name)) {
      const list = node.parent;
      const statement = list.parent;
      if (ts.isVariableDeclarationList(list) && ts.isVariableStatement(statement) && list.declarations.length === 1) {
        const initializer = node.initializer;
        const replacement = initializer && (ts.isCallExpression(initializer) || ts.isAwaitExpression(initializer))
          ? `${initializer.getText(source)};`
          : '';
        edits.push({ start: statement.getStart(source), end: statement.end, text: replacement });
        bindingsRemoved += 1;
        return;
      }
    }
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name && unusedAt(node.name)) {
      const modifiers = node.modifiers || [];
      const exported = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword);
      if (!exported) {
        edits.push({ start: node.getStart(source), end: node.end, text: '' });
        bindingsRemoved += 1;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!edits.length) continue;
  let next = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
  if (next !== text) {
    fs.writeFileSync(file, next);
    filesChanged += 1;
  }
}

console.log(`Removed ${bindingsRemoved} unused locals and marked ${paramsMarked} intentionally unused parameters in ${filesChanged} files.`);
