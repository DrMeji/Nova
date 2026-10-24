import {
  seedCompositionalInventFloor,
  looksLikeInventFloorTwin,
} from '../src/lib/createThinPath.ts';
import {
  hasAtelierLeatherPlateArt,
  atelierLeatherPlateDataUrl,
  leatherFormFromName,
} from '../src/lib/atelierLeatherPlate.ts';

const brief =
  'Create a parchment atelier leather-goods website for Garnet Latch with soft paper grounds, espresso type, warm brass, hero, shop grid, story, and footer contact. Skip Plan. Unique layout. Premium.';
const seeded = seedCompositionalInventFloor({}, brief, 'Garnet Latch Atelier');
const cat = seeded['src/sections/CatalogSection.jsx'] || '';
const hero = seeded['src/sections/HeroSection.jsx'] || '';
const skus = [...cat.matchAll(/name: "([^"]+)"/g)].map((m) => m[1]);
const arts = [0, 1, 2, 3].map((i) => atelierLeatherPlateDataUrl(`Garnet Latch X${i}`, 'hide', i));
console.log(JSON.stringify({
  twin: looksLikeInventFloorTwin(seeded),
  plateCat: hasAtelierLeatherPlateArt(cat),
  plateHero: /HERO_VISUAL/.test(hero) ? hasAtelierLeatherPlateArt(hero) : 'editorial-no-stage',
  skus,
  forms: skus.map((n) => leatherFormFromName(n)),
  artsDiffer: new Set(arts.map((a) => a.slice(80, 200))).size >= 3,
  salt: (hero.match(/data-nova-layout-salt="(\d)"/) || [])[1],
}, null, 2));
