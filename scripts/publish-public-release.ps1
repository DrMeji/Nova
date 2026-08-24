# Publish installer-only assets to public DrMeji/Ark.
# Never uploads source. Run from the private Ark-Source checkout after electron:build.
param(
  [Parameter(Mandatory = $true)]
  [string]$Tag,
  [string]$PublicRepo = 'DrMeji/Ark',
  [string]$Setup = 'release/ARK-Setup.exe',
  [string]$Title = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if ($Tag -notmatch '^v\d+\.\d+\.\d+') {
  throw "Tag must look like v0.1.147 (got: $Tag)"
}

if (-not (Test-Path $Setup)) {
  throw "Missing $Setup — run npm run electron:build first."
}

$ver = $Tag.TrimStart('v')
if (-not $Title) { $Title = "ARK $ver" }

$files = @($Setup)
foreach ($extra in @('release/ARK-Setup.exe.blockmap', 'release/latest.yml', 'release/ARK-Portable.exe')) {
  if (Test-Path $extra) { $files += $extra }
}

# Guard: refuse if someone pointed this at a repo that already has source paths.
$names = @(gh api "repos/$PublicRepo/contents" --jq '.[].name' 2>$null)
$blocked = @($names | Where-Object { $_ -match '^(src|electron|package\.json|dist|node_modules)$' })
if ($blocked.Count -gt 0) {
  throw "Public repo $PublicRepo looks like it contains source ($($blocked -join ', ')). Aborting."
}

$notes = @"
## ARK $Tag

Windows desktop installer.

- **ARK-Setup.exe** — install ARK
- After install: **Settings → Updates → Check → Download** for newer builds

Source code is not included in this repository.
"@

$exists = $false
gh release view $Tag --repo $PublicRepo 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { $exists = $true }

if ($exists) {
  gh release upload $Tag @files --repo $PublicRepo --clobber
  Write-Host "Updated assets on $PublicRepo $Tag"
} else {
  gh release create $Tag @files --repo $PublicRepo --title $Title --notes $notes
  Write-Host "Created $PublicRepo $Tag"
}

Write-Host "Public download: https://github.com/$PublicRepo/releases/tag/$Tag"
