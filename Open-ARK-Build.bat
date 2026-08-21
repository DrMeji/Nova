@echo off
title ARK Desktop
cd /d "%~dp0"

echo.
echo  ========================================
echo   ARK - building your latest changes
echo  ========================================
echo.
echo  Day-to-day testing: this bat builds THIS folder
echo  and opens Electron. Do not use the installed
echo  Start Menu ARK — that is the old GitHub build.
echo.
echo  Signing: set CSC_LINK and CSC_KEY_PASSWORD
echo  before Open-ARK-Packaged.bat for SmartScreen.
echo.
echo  For Check-Update testing, run Open-ARK-Packaged.bat
echo  then install release\ARK-Setup.exe.
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

echo Stopping any old Electron window...
taskkill /F /IM electron.exe >nul 2>&1

echo Building...
call npm run build
if errorlevel 1 (
  echo ERROR: Build failed.
  pause
  exit /b 1
)

REM Launch Electron binary directly — never "npx electron" on Windows.
REM npx resolves to npx.ps1 which can open in Notepad instead of running ARK.
set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_EXE%" (
  echo ERROR: Electron not found at:
  echo   %ELECTRON_EXE%
  echo Run npm install, then try again.
  pause
  exit /b 1
)

echo.
echo  Build OK - launching ARK with your current code.
echo  Close the app window when you are done testing.
echo.
start "" "%ELECTRON_EXE%" "%~dp0."
exit /b 0
