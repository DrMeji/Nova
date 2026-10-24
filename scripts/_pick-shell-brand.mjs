import { inventFloorShellId } from '../src/lib/atelierInventShells.ts';
const names = [
  'Prism', 'Mercer', 'Jade', 'Copper', 'Vellum', 'Amber', 'Pine', 'Opal',
  'Quartz', 'Flint', 'Grove', 'Lumen', 'Nimbus', 'Ridge', 'Harbor', 'Indigo',
];
for (const n of names) {
  const brand = `${n} Latch Atelier`;
  console.log(`${inventFloorShellId(brand).padEnd(12)} ${brand}`);
}
