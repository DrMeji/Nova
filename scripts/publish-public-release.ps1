# Publish installer-only assets to GitHub Releases (public and/or private).
# Never uploads source. Run from the checkout after electron-builder.
param(
  [Parameter(Mandatory = $true)]
  [string]$Tag,
  [string[]]$Repos = @('DrMeji/Ark'),
  [string]$Setup = 'release/ARK-Setup.exe',
  [string]$Title = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if ($Tag -notmatch '^v\d+\.\d+\.\d+') {
  throw "Tag must look like v0.1.154 (got: $Tag)"
}

if (-not (Test-Path $Setup)) {
  throw "Missing $Setup - run npm run electron:build first."
}

$ver = $Tag.TrimStart('v')
if (-not $Title) { $Title = "ARK $ver" }

$files = @($Setup)
foreach ($extra in @('release/ARK-Setup.exe.blockmap', 'release/latest.yml', 'release/ARK-Portable.exe')) {
  if (Test-Path $extra) { $files += $extra }
}

$notes = @"
## ARK $Tag

Windows desktop installer.

- ARK-Setup.exe - install ARK
- After install: Settings -> Updates -> Check -> Download for newer builds

Source code is not included in the public DrMeji/Ark repository.
"@

function Publish-ToRepo([string]$PublicRepo) {
  if ($PublicRepo -eq 'DrMeji/Ark') {
    $names = @(gh api "repos/$PublicRepo/contents" --jq '.[].name' 2>$null)
    $blocked = @($names | Where-Object { $_ -match '^(src|electron|package\.json|dist|node_modules)$' })
    if ($blocked.Count -gt 0) {
      throw "Public repo $PublicRepo looks like it contains source ($($blocked -join ', ')). Aborting."
    }
  }

  # gh writes "release not found" to stderr; do not treat that as a terminating error.
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  gh release view $Tag --repo $PublicRepo 1>$null 2>$null
  $exists = ($LASTEXITCODE -eq 0)
  $ErrorActionPreference = $prevEap

  if ($exists) {
    & gh release upload $Tag @files --repo $PublicRepo --clobber
    if ($LASTEXITCODE -ne 0) { throw "Failed uploading assets to $PublicRepo $Tag (exit $LASTEXITCODE)" }
    Write-Host "Updated assets on $PublicRepo $Tag"
  } else {
    & gh release create $Tag @files --repo $PublicRepo --title $Title --notes $notes
    if ($LASTEXITCODE -ne 0) { throw "Failed creating release $PublicRepo $Tag (exit $LASTEXITCODE)" }
    Write-Host "Created $PublicRepo $Tag"
  }

  Write-Host "Download: https://github.com/$PublicRepo/releases/tag/$Tag"
}

foreach ($repo in $Repos) {
  Publish-ToRepo $repo
}
