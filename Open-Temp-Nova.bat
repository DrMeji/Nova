@echo off
title Temp Nova
cd /d "%~dp0"

echo.
echo  Temp Nova — simple chat (Nova Brain + your models)
echo  Keep full Nova open.
echo.

if not exist "temp-nova\node_modules\electron\dist\electron.exe" (
  echo Installing Temp Nova...
  call npm --prefix temp-nova install
  if errorlevel 1 (
    echo ERROR: install failed.
    pause
    exit /b 1
  )
)

start "Temp Nova" "%~dp0temp-nova\node_modules\electron\dist\electron.exe" "%~dp0temp-nova"
timeout /t 2 /nobreak >nul
exit /b 0
