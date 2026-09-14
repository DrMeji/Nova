/**
 * Zip full Nova source (no node_modules/dist/release) into Desktop/Nova-Grok-Upload.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(process.env.USERPROFILE || '', 'Desktop', 'Nova-Grok-Upload');
fs.mkdirSync(outDir, { recursive: true });
const zipPath = path.join(outDir, 'Nova-full-source.zip');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const ps = `
$ErrorActionPreference = 'Stop'
$root = '${root.replace(/'/g, "''")}'
$zip = '${zipPath.replace(/'/g, "''")}'
$staging = Join-Path $env:TEMP ('nova-grok-' + [guid]::NewGuid().ToString('n'))
New-Item -ItemType Directory -Path $staging | Out-Null
$exclude = @('node_modules','dist','release','.git','website\\node_modules','website\\dist')
Get-ChildItem -Force $root | ForEach-Object {
  if ($exclude -contains $_.Name) { return }
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $staging $_.Name) -Recurse -Force
}
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zip -CompressionLevel Optimal
Remove-Item $staging -Recurse -Force
Write-Output $zip
(Get-Item $zip).Length
`;

const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(1);
}
console.log(r.stdout.trim());
