@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden.
  echo Bitte Node.js LTS von https://nodejs.org installieren.
  pause
  exit /b 1
)
start "FirmenPlaner Server + Updates" /D "%~dp0" cmd /k node manager.js
timeout /t 2 /nobreak >nul
start "" "http://localhost:4173"
