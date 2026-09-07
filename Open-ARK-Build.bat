@echo off
title NOVA Desktop (source build)
cd /d "%~dp0"

echo.
echo  ========================================
echo   NOVA - source build (Open-ARK-Build)
echo  ========================================
echo.
echo  This is your day-to-day test path:
echo    - Builds THIS folder and opens Electron
echo    - Uses its own profile: %%AppData%%\ARK-Dev
echo    - Models/keys do NOT mix with Start Menu NOVA
echo.
echo  Do NOT run Start Menu NOVA at the same time.
echo  For installer/update testing use Open-ARK-Packaged.bat
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

set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_EXE%" (
  echo Downloading Electron binary...
  node "%~dp0node_modules\electron\install.js"
  if errorlevel 1 (
    echo ERROR: Electron download failed.
    pause
    exit /b 1
  )
)

echo Stopping any old Electron window...
taskkill /F /IM electron.exe >nul 2>&1

echo Building...
call npm run build
if errorlevel 1 (
  echo ERROR: Build failed.
  pause
  exit /b 1
)

if not exist "%ELECTRON_EXE%" (
  echo ERROR: Electron not found at:
  echo   %ELECTRON_EXE%
  echo Run: node node_modules\electron\install.js
  pause
  exit /b 1
)

echo.
echo  Build OK - launching NOVA (dev profile NOVA-Dev).
echo  Settings - Testers is unlocked on source builds.
echo  Close the app window when you are done testing.
echo.
start "" "%ELECTRON_EXE%" "%~dp0." --remote-debugging-port=9229
exit /b 0
