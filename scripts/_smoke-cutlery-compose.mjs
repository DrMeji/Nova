/**
 * Knife brief must compose cutlery layout — not textile atelier twin.
 */
import {
  composeInventDemoSite,
  detectInventGenre,
  inventBriefLayoutFidelity,
} from '../src/lib/createInventDemo.ts';

const brief =
  'Create a new website for Obsidian Edge Knives — a premium Japanese knife shop for chefs. Do NOT make a speakers showroom. Unique knife atelier look.';
const genre = detectInventGenre(brief);
console.log('genre', genre);
if (genre !== 'cutlery') {
  console.error('FAIL expected cutlery');
  process.exit(1);
}

const d = composeInventDemoSite({ brand: 'Obsidian Edge Knives', brief });
const app = d.files['src/App.jsx'] || d.files['src/App.tsx'] || '';
const css = d.files['src/App.css'] || '';
const layout = (app.match(/data-nova-layout=["']([^"']+)["']/) || [])[1];
console.log('layout', layout);
console.log('has textile?', /Quiet textiles|Undyed linen|handloom|swatch visit|How we weave/i.test(app));
console.log('has knife?', /Gyuto|Santoku|blade|forge|cutlery/i.test(app));
console.log('has cutlery css?', /layout-cutlery|blade-grid/i.test(css));

const fid = inventBriefLayoutFidelity({ brief, app });
console.log('fidelity', fid);

if (
  layout !== 'cutlery'
  || /Quiet textiles|Undyed linen|handloom atelier|Book a swatch visit/i.test(app)
  || !/Gyuto|Santoku/i.test(app)
  || !fid.ok
) {
  console.error('FAIL cutlery compose');
  process.exit(1);
}
console.log('COMPOSE PASS cutlery');
