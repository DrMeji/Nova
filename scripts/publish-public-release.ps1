param(
  [Parameter(Mandatory = $true)]
  [string]$Tag,
  [string[]]$Repos = @('DrMeji/Ark-Source', 'DrMeji/Ark')
)

$ErrorActionPreference = 'Stop'

if ($Tag -notmatch '^v\d+\.\d+\.\d+$') {
  throw "Bad tag format: $Tag (expected vX.Y.Z)"
}

$releaseDir = Join-Path (Join-Path $PSScriptRoot '..') 'release'
$assets = @(
  'ARK-Setup.exe',
  'ARK-Setup.exe.blockmap',
  'latest.yml',
  'ARK-Portable.exe'
)

function Get-ReleaseAssets {
  $found = @()
  foreach ($name in $assets) {
    $p = Join-Path $releaseDir $name
    if (Test-Path -LiteralPath $p) { $found += $p }
  }
  return $found
}

foreach ($repo in $Repos) {
  Write-Host "Publishing $Tag to $repo ..."
  $version = if ($Tag.StartsWith('v')) { $Tag.Substring(1) } else { $Tag }
  $title = "ARK $version"

  gh release view $Tag --repo $repo 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  Release $Tag already exists on $repo - uploading assets if any."
    $files = Get-ReleaseAssets
    if ($files.Count -gt 0) {
      gh release upload $Tag @files --repo $repo --clobber
    }
    continue
  }

  $notes = @(
    "ARK $Tag",
    '',
    'Download ARK-Setup.exe for the Windows installer.',
    'Source code zip attachments on this public repo are README-only - not the app.'
  ) -join "`n"

  $files = Get-ReleaseAssets
  if ($repo -eq 'DrMeji/Ark' -and $files.Count -eq 0) {
    Write-Warning '  No installer files in release/ - creating release without assets (CI may upload later).'
    gh release create $Tag --repo $repo --title $title --notes $notes
  } elseif ($files.Count -gt 0) {
    gh release create $Tag --repo $repo --title $title --notes $notes @files
  } else {
    gh release create $Tag --repo $repo --title $title --notes $notes
  }
}

Write-Host 'Done.'
