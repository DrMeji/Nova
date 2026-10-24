/**
 * Step 3 (Scaffold) — peer bar vs Nova.
 * Re-run until zero FAIL before advancing to Craft.
 *
 * Peer bar (Bolt / Lovable / Vite create):
 *   package.json · vite.config · index.html#root · main.jsx · bare App.jsx · App.css
 *   → runnable empty shell BEFORE invent; no invent-demo twin stamps.
 */
import { buildScaffoldFiles } from '../src/lib/projectScaffolds.ts';
import { ensureViteReactProjectFiles } from '../src/lib/createBuildQuality.ts';
import { composeInventDemoSite } from '../src/lib/createInventDemo.ts';
import { understandCreateBrief } from '../src/lib/codingCreatePipeline.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

const scaffold = buildScaffoldFiles('vite-react', { name: 'Paper Shelf' });
const map = Object.fromEntries(scaffold.map((f) => [f.path.replace(/\\/g, '/'), f.content]));

console.log('\n=== Scaffold files ===');
console.log(Object.keys(map).sort().join('\n'));

const must = [
  'package.json',
  'vite.config.js',
  'index.html',
  'src/main.jsx',
  'src/App.jsx',
  'src/App.css',
  'src/index.css',
];
for (const p of must) {
  check(`has ${p}`, Boolean(map[p] && map[p].length > 20), map[p]?.slice(0, 40));
}

const pkg = JSON.parse(map['package.json']);
check('package.json has react', Boolean(pkg.dependencies?.react));
check('package.json has react-dom', Boolean(pkg.dependencies?.['react-dom']));
check('package.json has vite', Boolean(pkg.devDependencies?.vite));
check('package.json has @vitejs/plugin-react', Boolean(pkg.devDependencies?.['@vitejs/plugin-react']));
check('package.json scripts.dev is vite', pkg.scripts?.dev === 'vite');

check('index.html has #root', /id=["']root["']/.test(map['index.html']));
check('index.html loads main.jsx', /src\/main\.jsx/.test(map['index.html']));
check('index.html title is brand', /Paper Shelf/.test(map['index.html']));
check('vite.config uses plugin-react', /@vitejs\/plugin-react/.test(map['vite.config.js']));
check('main.jsx mounts App', /createRoot|ReactDOM/.test(map['src/main.jsx']) && /from ['"]\.\/App['"]/.test(map['src/main.jsx']));
check('App.jsx export default', /export\s+default\s+function\s+App/.test(map['src/App.jsx']));
check('App.jsx is bare shell (no invent twin)', map['src/App.jsx'].length < 400 && !/data-nova-invent|Gyuto|todo|spk-bay/i.test(map['src/App.jsx']));
check('App.css min-height shell', /min-height:\s*100vh/.test(map['src/App.css']));
check('App.css not dark-neon bias', !/#0f1419|#0a0a0a|#000/.test(map['src/App.css']) || /#f7f4ef|#fff|#fafafa/i.test(map['src/App.css']));

// ensureViteReact repairs missing entries
const thin = { 'src/App.jsx': map['src/App.jsx'] };
const repaired = ensureViteReactProjectFiles(thin, 'Paper Shelf');
check('ensureVite fills package.json', Boolean(repaired.files['package.json']));
check('ensureVite fills index.html', Boolean(repaired.files['index.html']) && /id=["']root["']/.test(repaired.files['index.html']));
check('ensureVite fills main.jsx', Boolean(repaired.files['src/main.jsx']));
check('ensureVite fills vite.config', Boolean(repaired.files['vite.config.js'] || repaired.files['vite.config.ts']));
check('ensureVite keeps App.jsx', Boolean(repaired.files['src/App.jsx']));

// invent-demo must stay dead — scaffold is the only pre-craft shell
const demo = composeInventDemoSite({ brand: 'X', brief: 'knife shop' });
check('invent-demo compose returns empty files', Object.keys(demo.files || {}).length === 0, demo.note);
check('invent-demo note says removed', /removed|invent from brief/i.test(demo.note || ''));

// Editorial filePlan expects README — scaffold may add later; craft/plan lists it
const plan = understandCreateBrief({
  brief: 'Create Paper Shelf soft paper navy brass grid of 4 book cards single page',
  brand: 'Paper Shelf',
});
check('editorial filePlan includes App+CSS+README', plan.filePlan.includes('src/App.jsx') && plan.filePlan.includes('README.md'));

if (failed) {
  console.error(`\nStep 3 scaffold: ${failed} check(s) failed — stay on Scaffold`);
  process.exit(1);
}
console.log('\nStep 3 scaffold: all checks passed — peer bar met for Scaffold');
