@echo off
cd /d "%~dp0"
set "RIVER_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%RIVER_NODE%" (
  "%RIVER_NODE%" server.mjs --open
) else (
  node server.mjs --open
)
pause
