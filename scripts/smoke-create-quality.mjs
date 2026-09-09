import { prefersReactAppScaffold } from '../src/lib/webLandingFromBrief.ts';
import { detectProjectKind } from '../src/lib/projectKind.ts';
import { ensureViteReactProjectFiles, isPreviewReady, stripModelProseFromSource } from '../src/lib/createBuildQuality.ts';
import { formatMultiModelAttribution } from '../src/lib/chatMultiModelBuild.ts';

const brief = 'Create DualBrainCafe warm cafe landing page hero menu. Use src/App.jsx + App.css. Full desktop layout.';
console.log('prefersReact', prefersReactAppScaffold(brief));
console.log('kind', detectProjectKind(brief));
console.log('footer', formatMultiModelAttribution([]));

const css = stripModelProseFromSource(
  'src/App.css',
  ".a{color:red}\n\nThe updated file should now contain the necessary styles.\n",
);
console.log('stripCleared', !/updated file/i.test(css), css.trim().slice(0, 40));

const bad = {
  'index.html': 'To link to the updated src/App.css file…',
  'src/App.jsx': `import './App.css';
export default function App() {
  return (
    <div className="App">
      <h1>Cafe</h1>
      <nav><a href="#menu">Menu</a></nav>
      <main className="hero"><p>Welcome</p></main>
      <footer>© Cafe</footer>
    </div>
  );
}
`,
  'src/App.css': '.App{min-height:100vh}\n.hero{padding:2rem}\n',
};
const fixed = ensureViteReactProjectFiles(bad, 'Cafe');
console.log({
  pkg: Boolean(fixed.files['package.json']),
  idxRoot: /id=["']root["']/.test(fixed.files['index.html'] || ''),
  ready: isPreviewReady(fixed.files),
  repaired: fixed.repaired,
});
