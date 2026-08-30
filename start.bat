@echo off
cd /d "%~dp0"

set "NODE_DIR=C:\Program Files\nodejs"
if exist "%NODE_DIR%\node.exe" (
  set "PATH=%NODE_DIR%;%PATH%"
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on this PC.
  echo Please restart the PC once, then try start.bat again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Setting up for the first time, please wait...
  call npm install
)

echo.
echo ============================================
echo   When you see a message below saying
echo   the app has started, open your web
echo   browser (Edge, etc.) and go to:
echo.
echo       http://localhost:3000
echo ============================================
echo.

call npm start

echo.
echo Server stopped. You can close this window.
pause
