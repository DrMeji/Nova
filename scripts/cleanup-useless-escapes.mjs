import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '.', '--format', 'json'], {
  encoding: 'utf8', maxBuffer: 60 * 1024 * 1024,
});
if (result.error) throw result.error;
const reports = JSON.parse(result.stdout);
let changed = 0;
let removed = 0;
for (const report of reports) {
  const positions = report.messages.filter((message) => message.ruleId === 'no-useless-escape');
  if (!positions.length) continue;
  const file = path.resolve(report.filePath);
  const lines = fs.readFileSync(file, 'utf8').split(/(?<=\n)/);
  for (const message of positions.sort((a, b) => b.line - a.line || b.column - a.column)) {
    const index = message.column - 1;
    const line = lines[message.line - 1];
    if (line[index] === '\\') {
      lines[message.line - 1] = line.slice(0, index) + line.slice(index + 1);
      removed += 1;
    }
  }
  fs.writeFileSync(file, lines.join(''));
  changed += 1;
}
console.log(`Removed ${removed} ESLint-confirmed unnecessary escapes from ${changed} files.`);
