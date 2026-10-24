#!/usr/bin/env node
/**
 * Nova headless auto — non-interactive craft driver.
 * Exit 0 when invent-demo + invent logo lock signals are present.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = ['src/App.jsx', 'src/App.tsx']
  .map((rel) => {
    const p = path.join(root, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  })
  .join('\n');
const logoPath = path.join(root, 'public/logo.svg');
const logo = fs.existsSync(logoPath) ? fs.readFileSync(logoPath, 'utf8') : '';
const ok = /data-nova-invent-demo\s*=\s*["']1["']/.test(app)
  && /data-nova-invent-logo\s*=\s*["']1["']/.test(logo);
console.log(ok ? 'nova-auto: invent Ready signals present' : 'nova-auto: invent signals missing');
process.exit(ok ? 0 : 1);
