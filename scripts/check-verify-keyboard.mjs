import { verifyAsk } from '../src/lib/verifyAsk.ts';

const files = {
  'src/App.jsx': '<img className="hero-photo" src="https://images.unsplash.com/x" alt="Gaming mouse product photo" /><h1 className="center-word">NOIR Gear</h1>',
};
const r = verifyAsk(
  'Under that, add a mechanical keyboard photo and a short tagline about precision and speed.',
  files,
);
console.log(r);
if (r.ok) {
  console.error('FAIL should miss keyboard+tagline');
  process.exit(2);
}
if (!r.missing.some((m) => /keyboard/i.test(m))) {
  console.error('FAIL missing keyboard reason', r.missing);
  process.exit(2);
}
console.log('PASS keyboard not falsely already-applied');
