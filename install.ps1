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
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $extensionName) -Destination (Join-Path $extensionDirectory $extensionName) -Force
    & spicetify config extensions $extensionName
}
if ($LASTEXITCODE -ne 0) { throw 'Could not update the Spicetify extension configuration.' }
& spicetify apply
if ($LASTEXITCODE -ne 0) { throw 'Spicetify apply failed. Read its output above.' }
