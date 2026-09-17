@echo off
setlocal EnableExtensions
title Hitman: Blood Money Editor
cd /d "%~dp0"

rem Double-click to run the editor. Any arguments are passed to the server,
rem for example:  start.bat --port 5000

call "%~dp0scripts\launcher\env.cmd"
if errorlevel 1 goto fail_node

node "%~dp0scripts\launcher\check.mjs" needs install
if errorlevel 2 goto install
if errorlevel 1 goto fail
goto build

:install
echo Installing dependencies...
call pnpm install --frozen-lockfile
if errorlevel 1 goto fail_install
node "%~dp0scripts\launcher\check.mjs" mark install
if errorlevel 1 goto fail

:build
node "%~dp0scripts\launcher\check.mjs" needs build
if errorlevel 2 goto do_build
if errorlevel 1 goto fail
goto run

:do_build
echo Building the editor...
call pnpm build
if errorlevel 1 goto fail_build
node "%~dp0scripts\launcher\check.mjs" mark build
if errorlevel 1 goto fail

:run
echo.
echo Starting the editor. Close this window to stop it.
echo.
call pnpm --silent --filter @hbm/server run start %*
if errorlevel 1 goto fail_run
exit /b 0

:fail_node
echo.
echo Couldn't set up Node.js. Check your internet connection and try again,
echo or install Node.js 22 or newer from https://nodejs.org and run start.bat again.
goto stop

:fail_install
echo.
echo Installing dependencies failed. Check your internet connection and try again.
echo If it keeps failing, delete the .runtime and node_modules folders and retry.
goto stop

:fail_build
echo.
echo Building the editor failed. The errors are shown above.
goto stop

:fail_run
echo.
echo The editor stopped with an error. The details are shown above.
goto stop

:fail
echo.
echo Something went wrong while checking the installation. The details are shown above.

:stop
echo.
pause
exit /b 1
