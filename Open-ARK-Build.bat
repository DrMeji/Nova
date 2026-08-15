@echo off
title ARK Desktop (Built)
cd /d "%~dp0"

echo.
echo  ========================================
echo   ARK - Build + Launch
echo  ========================================
echo.
echo  Builds the UI once, then opens Electron.
echo  For an installable release, use
echo  Open-ARK-Release.bat instead.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not in PATH.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
)

taskkill /F /IM electron.exe >nul 2>&1

echo Building...
call npm run build
if errorlevel 1 (
  echo.
  echo ERROR: Build failed.
  pause
  exit /b 1
)

echo Launching...
call npx --yes electron .
set EXITCODE=%ERRORLEVEL%
exit /b %EXITCODE%
