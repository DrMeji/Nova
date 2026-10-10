import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const auth = read('src/context/AuthContext.tsx');
const flags = read('src/lib/authFlags.ts');
const models = read('src/views/ModelsView.tsx');
const catalog = read('src/lib/cloudModelCatalog.ts');
const search = read('src/components/SearchPanel.tsx');

assert.doesNotMatch(auth, /export\s+(?:const|function|class)\s+isBypassEnabled/);
assert.match(auth, /import\s+\{\s*isBypassEnabled\s*\}\s+from\s+['"]@\/lib\/authFlags['"]/);
assert.match(flags, /export function isBypassEnabled\s*\(/);
assert.doesNotMatch(models, /export\s+const\s+CLOUD_MODELS\b/);
assert.match(models, /import\s+\{\s*CLOUD_MODELS,\s*type CloudModel\s*\}\s+from\s+['"]@\/lib\/cloudModelCatalog['"]/);
assert.match(catalog, /export const CLOUD_MODELS:\s*CloudModel\[\]\s*=/);
assert.equal((catalog.match(/\{ id: '/g) || []).length, 41, 'catalog row count should match former view constant');
assert.match(search, /from\s+['"]@\/lib\/cloudModelCatalog['"]/);
assert.ok(!search.includes("@/views/ModelsView"), 'SearchPanel must not import data from a React view');

console.log('smoke-fast-refresh-boundaries: ok');
