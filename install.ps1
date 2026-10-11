param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$extensionName = 'pinned-playlist-plus.js'
$configPath = (& spicetify -c | Select-Object -Last 1).Trim()
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $configPath)) {
    throw 'Could not locate the Spicetify configuration.'
}
$extensionDirectory = Join-Path (Split-Path -Parent $configPath) 'Extensions'
if ($Uninstall) {
    & spicetify config extensions "$extensionName-"
} else {
    New-Item -ItemType Directory -Path $extensionDirectory -Force | Out-Null
    $bundlePath = Join-Path $PSScriptRoot "dist/$extensionName"
    if (-not (Test-Path -LiteralPath $bundlePath)) {
        throw 'The compiled extension was not found. Run npm run build first.'
    }
    Copy-Item -LiteralPath $bundlePath -Destination (Join-Path $extensionDirectory $extensionName) -Force
    & spicetify config extensions $extensionName
}
if ($LASTEXITCODE -ne 0) { throw 'Could not update the Spicetify extension configuration.' }
& spicetify apply
if ($LASTEXITCODE -ne 0) { throw 'Spicetify apply failed. Read its output above.' }
