@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0start-lifetempo.ps1" (
  echo LifeTempo startup script is missing. Keep this file inside LifeTempo-App.
  pause
  exit /b 1
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-lifetempo.ps1" %*
if errorlevel 1 (
  echo.
  echo Please copy the error above when reporting a problem.
  pause
  exit /b 1
)
exit /b 0