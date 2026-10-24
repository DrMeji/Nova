import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const root = process.cwd();
const lint = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '.', '--format', 'json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 60 * 1024 * 1024,
});
if (lint.error) throw lint.error;
if (!lint.stdout) throw new Error(lint.stderr || 'ESLint returned no JSON output');
const reports = JSON.parse(lint.stdout);
const removals = new Map();
for (const report of reports) {
  const positions = new Set(report.messages
    .filter((message) => message.ruleId === '@typescript-eslint/no-unused-vars')
    .map((message) => `${message.line}:${message.column}`));
  if (positions.size) removals.set(path.resolve(report.filePath), positions);
}

let changedFiles = 0;
let removedBindings = 0;
for (const [file, positions] of removals) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const locationMatches = (node) => {
    const start = source.getLineAndCharacterOfPosition(node.getStart(source));
    return positions.has(`${start.line + 1}:${start.character + 1}`);
  };

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const clause = statement.importClause;
    const bindings = [];
    if (clause.name) bindings.push({ node: clause.name, kind: 'default' });
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      bindings.push({ node: clause.namedBindings.name, kind: 'namespace' });
    } else if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) bindings.push({ node: element.name, kind: 'named', element });
    }
    const kept = bindings.filter((binding) => !locationMatches(binding.node));
    const removed = bindings.length - kept.length;
    if (!removed) continue;

    const raw = statement.getText(source);
    if (/\/\*|\/\//.test(raw) || statement.attributes || statement.assertClause) continue;
    removedBindings += removed;
    const moduleText = statement.moduleSpecifier.getText(source);
    let replacement;
    if (!kept.length) {
      replacement = clause.isTypeOnly ? '' : `import ${moduleText};`;
    } else {
      const defaultBinding = kept.find((binding) => binding.kind === 'default');
      const namespaceBinding = kept.find((binding) => binding.kind === 'namespace');
      const named = kept.filter((binding) => binding.kind === 'named');
      const prefix = clause.isTypeOnly ? 'import type ' : 'import ';
      const parts = [];
      if (defaultBinding) parts.push(defaultBinding.node.getText(source));
      if (namespaceBinding) parts.push(`* as ${namespaceBinding.node.getText(source)}`);
      if (named.length) {
        const specifiers = named.map(({ element }) => element.getText(source)).join(', ');
        parts.push(`{ ${specifiers} }`);
      }
      replacement = `${prefix}${parts.join(', ')} from ${moduleText};`;
    }
    edits.push({ start: statement.getStart(source), end: statement.end, text: replacement });
  }

  if (!edits.length) continue;
  let next = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
  if (next !== text) {
    fs.writeFileSync(file, next);
    changedFiles += 1;
  }
}

console.log(`Removed ${removedBindings} ESLint-confirmed unused import bindings from ${changedFiles} files.`);
