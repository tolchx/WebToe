@echo off
cd /d "%~dp0apps\web"

:: Kill existing vite/node on the target port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8645') do (
  if not "%%a"=="0" taskkill /f /pid %%a >nul 2>&1
)

echo Starting WebToe dev server...
echo MCP Bridge will auto-start on port 3001
echo.
echo Open: http://localhost:8645/webtoe/
echo.
node ..\..\node_modules\vite\bin\vite.js --port 8645 --strictPort
pause
