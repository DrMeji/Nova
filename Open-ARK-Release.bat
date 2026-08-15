@echo off
title ARK Release Package
cd /d "%~dp0"

echo.
echo  ========================================
echo   ARK - Package Release
echo  ========================================
echo.
echo  Builds the real Windows app into
echo  the release\ folder (installer + portable).
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

echo Packaging with electron-builder...
call npm run electron:build
set EXITCODE=%ERRORLEVEL%

if not "%EXITCODE%"=="0" (
  echo.
  echo ERROR: Release package failed.
  pause
  exit /b %EXITCODE%
)

echo.
echo  Done. Open the release\ folder for:
echo    ARK-Setup-*.exe     - installer
echo    ARK-Portable-*.exe  - portable
echo.
explorer "release"
pause
exit /b 0
