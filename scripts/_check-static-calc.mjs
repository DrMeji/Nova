import { detectProjectKind, resolveProjectKindForCreate } from '../src/lib/projectKind.ts';
import { projectUsesNpm, buildScaffoldFiles } from '../src/lib/projectScaffolds.ts';

const brief = 'Build a professional scientific calculator with history tape and trig';
const k = detectProjectKind(brief);
const r = resolveProjectKindForCreate(brief, 'vite-react', 'vite-react');
const files = buildScaffoldFiles(r, { name: 'ProCalcLive', summary: brief });
const hasPkg = files.some((f) => /package\.json$/i.test(f.path));
const uses = projectUsesNpm(r);

const ok = k === 'static-web' && r === 'static-web' && uses === false && hasPkg === false;
console.log(JSON.stringify({ k, r, uses, hasPkg, fileCount: files.length, ok }, null, 2));
process.exit(ok ? 0 : 1);
