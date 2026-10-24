/**
 * Append-only discover: take capability strings (argv JSON file or stdin lines)
 * and add new stems to the honest catalog without touching existing grades.
 *
 * Usage:
 *   node scripts/_discover-append-catalog.mjs path/to/caps.json
 *   node scripts/_discover-append-catalog.mjs   # reads scripts/data/discover-batch.jsonl
 *
 * Each input line/object: { capability|stem, leader?, howTheyDoIt?, peerNote? }
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appendStems, catalogStats } from './lib/honestCatalog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
const defaultBatch = path.join(root, 'data', 'discover-batch.jsonl');
const inputPath = arg || defaultBatch;

if (!fs.existsSync(inputPath)) {
  console.log(JSON.stringify({ added: 0, note: `no input at ${inputPath}` }));
  process.exit(0);
}

const text = fs.readFileSync(inputPath, 'utf8').trim();
let candidates = [];
if (inputPath.endsWith('.json') && text.startsWith('[')) {
  candidates = JSON.parse(text);
} else {
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { candidates.push(JSON.parse(line)); } catch {
      candidates.push({ stem: line.trim() });
    }
  }
}

const meta = appendStems(candidates);
console.log(JSON.stringify({ ...meta, stats: catalogStats() }, null, 2));
