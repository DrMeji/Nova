import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'nova-deep-rescan.jsonl');
const rows = [];
for (const line of fs.readFileSync(dataPath, 'utf8').split(/\n/)) {
  if (!line.trim()) continue;
  rows.push(JSON.parse(line));
}

const by = { worst: 0, weak: 0, partial: 0, strong: 0, other: 0 };
const lanes = {};
for (const r of rows) {
  if (by[r.nova] != null) by[r.nova]++;
  else by.other++;
  lanes[r.lane] = (lanes[r.lane] || 0) + 1;
}
const open = by.worst + by.weak + by.partial;
const craftHints = rows.filter((r) =>
  /image|logo|media|craft|atmospher|hero|product.?shot|visual|typograph|model|seat/i.test(
    `${r.capability} ${r.lane} ${r.novaNow}`,
  ),
);

console.log(
  JSON.stringify(
    {
      source: dataPath,
      bytes: fs.statSync(dataPath).size,
      rows: rows.length,
      open,
      by,
      lanes,
      craftHintRows: craftHints.length,
    },
    null,
    2,
  ),
);
