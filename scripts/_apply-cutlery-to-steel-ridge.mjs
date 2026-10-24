import fs from 'fs';
import path from 'path';
import os from 'os';
import { composeInventDemoSite } from '../src/lib/createInventDemo.ts';

const disk = path.join(os.homedir(), 'Documents', 'NOVA Projects', 'steel-ridge-knives');
const brief =
  'Create a new website for Steel Ridge Knives — premium Japanese knife shop for chefs. gyuto santoku forge.';
const d = composeInventDemoSite({ brand: 'Steel Ridge Knives', brief });
for (const [rel, body] of Object.entries(d.files)) {
  const p = path.join(disk, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}
const app = d.files['src/App.jsx'] || '';
console.log({
  disk,
  layout: (app.match(/data-nova-layout=["']([^"']+)/) || [])[1],
  textile: /Quiet textiles|Undyed linen|handloom/i.test(app),
  knife: /Gyuto|Santoku|forge/i.test(app),
  wrote: Object.keys(d.files).length,
});
