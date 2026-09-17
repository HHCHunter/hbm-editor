# Downloads the official Node.js zip for Windows, checks it against the SHA256 pinned in
# env.cmd, and unpacks it into .runtime\node. Called by env.cmd; not meant to be run by hand.
param(
  [Parameter(Mandatory)] [string] $Dist,
  [Parameter(Mandatory)] [string] $Version,
  [Parameter(Mandatory)] [string] $Sha256,
  [Parameter(Mandatory)] [string] $Dest
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$url = "https://nodejs.org/dist/v$Version/$Dist.zip"
$zip = Join-Path $Dest "$Dist.zip"

try {
  New-Item -ItemType Directory -Force $Dest | Out-Null
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

  $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLowerInvariant()
  if ($actual -ne $Sha256.ToLowerInvariant()) {
    throw "The download of $Dist.zip doesn't match its expected checksum, so it wasn't used. Try again later."
  }

  Expand-Archive -Path $zip -DestinationPath $Dest -Force
  Write-Host "Portable Node.js $Version is ready."
  exit 0
}
catch {
  Write-Host "Couldn't install portable Node.js: $($_.Exception.Message)"
  exit 1
}
finally {
  Remove-Item $zip -ErrorAction SilentlyContinue
}
