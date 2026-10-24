import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.app.json', '--pretty', 'false'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
for (const line of result.stdout.split(/\r?\n/)) {
  const match = line.match(/^(.*\.tsx?)\((\d+),(\d+)\): error (TS\d+): (.*)$/);
  if (!match || !match[1].endsWith('AIChatFrame.tsx')) continue;
  const source = fs.readFileSync(match[1], 'utf8').split(/\r?\n/);
  const number = Number(match[2]);
  console.log(`${number}: ${match[5]}\n  ${source[number - 1]?.trim()}\n`);
}
