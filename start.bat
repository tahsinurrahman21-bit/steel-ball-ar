@echo off
rem Steel Ball AR: one-click start from the source code (needs Node.js 18+).
rem Most players should use the ready-made download from the Releases page instead.
cd /d "%~dp0"
title Steel Ball AR

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed.
  echo   Install the LTS version from https://nodejs.org/ , then double-click start.bat again.
  echo   Or download the ready-made SteelBallAR.exe from the GitHub Releases page instead.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\three" (
  echo Installing dependencies, this happens only once...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

node tools\launcher.cjs %*
pause
