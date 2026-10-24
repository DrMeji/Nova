import fs from 'fs'; import path from 'path'; import os from 'os';
import { gradeStorefrontQuality } from '@/lib/createStorefrontLadder';
const root = path.join(os.homedir(), 'Documents', 'NOVA Projects', 'FreshFlask');
const files = {};
for (const rel of ['src/App.jsx','src/App.css','src/data/products.ts','public/logo.svg','public/heroes/freshflask-hero.svg']) {
  const p = path.join(root, rel); if (fs.existsSync(p)) files[rel] = fs.readFileSync(p,'utf8');
}
console.log(JSON.stringify(gradeStorefrontQuality(files, 'insulated bottle e-commerce cart exactly 9 bottles cream ivory About Careers Help', 'FreshFlask'), null, 2));
