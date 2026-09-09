@echo off
title NOVA Packaged Installer
cd /d "%~dp0"

echo.
echo  ========================================
echo   NOVA - packaged installer build
echo  ========================================
echo.
echo  Builds release\NOVA-Setup.exe from your
echo  current code. No menu — just builds.
echo.
echo  Day-to-day UI: Open-NOVA-Build.bat
echo.
echo  Code signing: if CSC_LINK and
echo  CSC_KEY_PASSWORD are set, electron-builder
echo  will sign the installer automatically.
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

if defined CSC_LINK (
  echo  Signing: CSC_LINK is set — installer will be signed.
) else (
  echo  Signing: CSC_LINK not set — unsigned build ^(Windows SmartScreen may warn^).
)

echo Typechecking...
call npm run typecheck
if errorlevel 1 (
  echo ERROR: Typecheck failed. Fix errors before packaging.
  pause
  exit /b 1
)

echo Building Windows installer to release\ ...
call npm run electron:build
if errorlevel 1 (
  echo ERROR: Packaged build failed.
  pause
  exit /b 1
)

echo.
echo  Done. Installer: release\NOVA-Setup.exe
echo  1^) Install that build
echo  2^) Open Settings - Check for updates
echo  3^) Confirm update splash, then reopen
echo.
echo  To publish + generate delta ^(latest.yml^):
echo    npm run electron:publish
echo  ^(needs GitHub auth for DrMeji/Nova^)
echo.
pause
exit /b 0
