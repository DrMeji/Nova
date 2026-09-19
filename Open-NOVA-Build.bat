@echo off
title NOVA Desktop (source build)
cd /d "%~dp0"

echo.
echo  ========================================
echo   NOVA - source build (Open-NOVA-Build)
echo  ========================================
echo.
echo  This is your day-to-day test path:
echo    - Builds THIS folder and opens Electron
echo    - Uses a separate dev profile from Start Menu NOVA
echo    - Models/keys do NOT mix with the installed app
echo.
echo  Do NOT run Start Menu NOVA at the same time.
echo  For installer/update testing use Open-NOVA-Packaged.bat
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

echo Typechecking...
call npm run typecheck
if errorlevel 1 (
  echo ERROR: Typecheck failed. Fix errors before launching.
  pause
  exit /b 1
)

echo Checking build env (VITE_SUPABASE_*)...
REM Prefer real cloud keys when .env.local is filled. Guest-local is only the fallback.
REM findstr with multiple /C: is OR — check URL and anon key as separate commands.
set "NOVA_ALLOW_LOCAL_ONLY=1"
if not exist ".env.local" (
  echo  WARNING: No .env.local - guest-local build ^(cloud sign-in off^).
  echo  Copy .env.example to .env.local and set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
  goto env_check_run
)
findstr /R /C:"^VITE_SUPABASE_URL=https://" ".env.local" >nul 2>&1
if errorlevel 1 (
  echo  WARNING: .env.local incomplete - missing VITE_SUPABASE_URL - guest-local build.
  goto env_check_run
)
findstr /R /C:"^VITE_SUPABASE_ANON_KEY=eyJ" ".env.local" >nul 2>&1
if errorlevel 1 (
  echo  WARNING: .env.local incomplete - missing VITE_SUPABASE_ANON_KEY - guest-local build.
  goto env_check_run
)
set "NOVA_ALLOW_LOCAL_ONLY="
echo  Found .env.local cloud keys - building with sign-in enabled.

:env_check_run
call node scripts/check-env-for-build.mjs
if errorlevel 1 (
  echo ERROR: Missing Supabase env. Copy .env.example to .env.local and fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
  echo Or set NOVA_ALLOW_LOCAL_ONLY=1 for guest-local desktop builds.
  pause
  exit /b 1
)

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
echo  Build OK - launching NOVA (dev profile).
echo  Settings - Testers is unlocked on source builds.
echo  Close the app window when you are done testing.
echo.
start "" "%ELECTRON_EXE%" "%~dp0." --remote-debugging-port=9229
exit /b 0
