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
$excludeDirs = @('node_modules','dist','release','.git')
$excludeNames = @('.env','.env.local','.env.production','.env.development')
Get-ChildItem -Force $root | ForEach-Object {
  if ($excludeDirs -contains $_.Name) { return }
  if ($excludeNames -contains $_.Name) { return }
  if ($_.Name -like '.env.*' -and $_.Name -ne '.env.example') { return }
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $staging $_.Name) -Recurse -Force
}
# Scrub any nested secrets that slipped through
Get-ChildItem -Path $staging -Recurse -Force -File | Where-Object {
  $_.Name -eq '.env' -or ($_.Name -like '.env.*' -and $_.Name -ne '.env.example')
} | Remove-Item -Force
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
