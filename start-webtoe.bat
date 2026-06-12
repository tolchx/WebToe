@echo off
cd /d "C:\Users\Tolch\Documents\AI_Code\WebToe\apps\web"
echo Starting WebToe dev server...
echo MCP Bridge will auto-start on port 3001
echo.
echo Open: http://localhost:8643/WebToe/
echo.
node ..\..\node_modules\vite\bin\vite.js --port 8643 --strictPort
pause
