param([switch]$Uninstall, [switch]$Update)
$ErrorActionPreference = 'Stop'
if ($Uninstall -and $Update) { throw 'Choose either -Uninstall or -Update.' }
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
    # Release ZIPs have the compiled bundle next to this installer.
    if (-not (Test-Path -LiteralPath $bundlePath)) { $bundlePath = Join-Path $PSScriptRoot $extensionName }
    $downloadDirectory = $null
    if ($Update) {
        $release = Invoke-RestMethod 'https://api.github.com/repos/lucas98sf/pinned-playlist-plus/releases/latest'
        if ($release.draft -or $release.prerelease -or $release.tag_name -notmatch '^v\d+\.\d+\.\d+$') {
            throw 'GitHub returned an unsupported release.'
        }
        $downloadDirectory = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
        New-Item -ItemType Directory -Path $downloadDirectory | Out-Null
        $bundlePath = Join-Path $downloadDirectory $extensionName
        $baseURL = "https://github.com/lucas98sf/pinned-playlist-plus/releases/download/$($release.tag_name)"
        Invoke-WebRequest "$baseURL/$extensionName" -OutFile $bundlePath
        $checksums = (Invoke-WebRequest "$baseURL/SHA256SUMS").Content
        if ($checksums -is [byte[]]) { $checksums = [Text.Encoding]::UTF8.GetString($checksums) }
        $expectedHash = ($checksums -split '\s+')[0]
        if ($expectedHash -notmatch '^[a-fA-F0-9]{64}$' -or (Get-FileHash -LiteralPath $bundlePath -Algorithm SHA256).Hash -ne $expectedHash) {
            throw 'The release checksum did not match. Your installation is unchanged.'
        }
        Write-Host "Installing Save to Playlist $($release.tag_name)"
    }
    if (-not (Test-Path -LiteralPath $bundlePath)) {
        throw 'The compiled extension was not found. Run npm run build first.'
    }
    Copy-Item -LiteralPath $bundlePath -Destination (Join-Path $extensionDirectory $extensionName) -Force
    if ($downloadDirectory) { Remove-Item -LiteralPath $bundlePath -Force; Remove-Item -LiteralPath $downloadDirectory }
    & spicetify config extensions $extensionName
}
if ($LASTEXITCODE -ne 0) { throw 'Could not update the Spicetify extension configuration.' }
& spicetify apply
if ($LASTEXITCODE -ne 0) { throw 'Spicetify apply failed. Read its output above.' }
