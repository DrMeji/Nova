import fs from 'node:fs';

const files = [
  'src/components/SettingsAdvanced.tsx',
  'src/components/SettingsGeneral.tsx',
  'src/components/SettingsModels.tsx',
  'src/components/SettingsPrivacy.tsx',
];
let removed = 0;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const next = source.replace(/:\s*any\b/g, () => { removed += 1; return ''; });
  fs.writeFileSync(file, next);
}
console.log(`Removed ${removed} redundant explicit callback annotations.`);
