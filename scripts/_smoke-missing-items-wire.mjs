/**
 * Missing items staging must exist and merge discovered coding-deep gaps.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
function check(ok, name) {
  console.log(ok ? 'PASS' : 'FAIL', name);
  if (!ok) fail += 1;
}

const catalog = path.join(root, 'src/lib/missingItemsCatalog.ts');
const view = path.join(root, 'src/views/MissingItemsView.tsx');
const discovered = path.join(root, 'src/lib/missingItemsDiscovered.generated.ts');
const shell = path.join(root, 'src/components/AppShell.tsx');

check(fs.existsSync(catalog), 'missingItemsCatalog.ts');
check(fs.existsSync(view), 'MissingItemsView.tsx');
check(fs.existsSync(shell), 'AppShell.tsx');
const cat = fs.readFileSync(catalog, 'utf8');
check(/MISSING_ITEMS/.test(cat), 'exports MISSING_ITEMS');
check(/missingItemsDiscovered|DISCOVERED_MISSING/.test(cat), 'merges discovered missing items');
check(fs.existsSync(discovered), 'missingItemsDiscovered.generated.ts');
check(/Missing items|missing-items/.test(fs.readFileSync(shell, 'utf8')), 'shell routes Missing items');

if (fail) process.exit(1);
console.log('ALL PASS missing-items-wire');
