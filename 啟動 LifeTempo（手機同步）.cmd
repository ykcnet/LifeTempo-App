@echo off
setlocal
cd /d "%~dp0"

set PORT=4173
set HOST=0.0.0.0
set NGROK_URL=https://bulldozer-gathering-spectator.ngrok-free.dev

echo ================================================
echo  LifeTempo phone sync
echo  Server : http://0.0.0.0:4173
echo  Tunnel : %NGROK_URL%
echo ================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  if exist "C:\dev\tools\node\node.exe" (
    set NODE_EXE=C:\dev\tools\node\node.exe
  ) else (
    echo Node.js not found. Install Node.js 24+ first.
    pause
    exit /b 1
  )
) else (
  set NODE_EXE=node
)

echo Starting server...
start "LifeTempo server" cmd /k "cd /d %~dp0 && set PORT=4173 && set HOST=0.0.0.0 && "%NODE_EXE%" server.mjs"

timeout /t 3 >nul

echo Starting ngrok tunnel...
start "ngrok" cmd /k "ngrok http --url=%NGROK_URL% 4173"

echo.
echo Both windows must stay open while syncing.
echo Phone URL: %NGROK_URL%
echo.
pause
