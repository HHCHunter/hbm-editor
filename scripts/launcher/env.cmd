@echo off
rem Shared by start.bat and dev.bat. Puts a usable Node.js (22 or newer) on PATH for this
rem window only, downloading a portable copy into .runtime\ if needed. Nothing is installed
rem system-wide.

for %%I in ("%~dp0..\..") do set "HBM_ROOT=%%~fI"
set "HBM_RUNTIME=%HBM_ROOT%\.runtime"
set "NODE_VERSION=22.14.0"

if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" (
  set "NODE_DIST=node-v%NODE_VERSION%-win-arm64"
  set "NODE_SHA256=2d71f5f9b2fffa33baa108c07d74b0d24e0c3dd8f441d567772ae0e3dd4b1a22"
) else (
  set "NODE_DIST=node-v%NODE_VERSION%-win-x64"
  set "NODE_SHA256=55b639295920b219bb2acbcfa00f90393a2789095b7323f79475c9f34795f217"
)
set "PORTABLE_NODE=%HBM_RUNTIME%\node\%NODE_DIST%"

rem A portable copy from an earlier run wins, so the version stays the one we tested.
if exist "%PORTABLE_NODE%\node.exe" goto use_portable

where node >nul 2>nul
if errorlevel 1 goto download
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
if not errorlevel 1 goto node_ready
echo Your installed Node.js is older than version 22, so a portable copy will be used.

:download
echo Downloading portable Node.js %NODE_VERSION% (about 30 MB, first run only)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0get-node.ps1" -Dist "%NODE_DIST%" -Version "%NODE_VERSION%" -Sha256 "%NODE_SHA256%" -Dest "%HBM_RUNTIME%\node"
if errorlevel 1 exit /b 1

:use_portable
set "PATH=%PORTABLE_NODE%;%PATH%"

:node_ready
rem corepack fetches the pnpm version pinned in package.json into .runtime\ on first use.
rem The pnpm shims go in .runtime\bin rather than Node's own folder, which may need admin
rem rights, and that folder goes on PATH so package scripts that call pnpm find it too.
set "COREPACK_HOME=%HBM_RUNTIME%\corepack"
set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
if not exist "%HBM_RUNTIME%\bin\pnpm.cmd" (
  if not exist "%HBM_RUNTIME%\bin" mkdir "%HBM_RUNTIME%\bin"
  call corepack enable pnpm --install-directory "%HBM_RUNTIME%\bin"
  if errorlevel 1 exit /b 1
)
set "PATH=%HBM_RUNTIME%\bin;%PATH%"
exit /b 0
