@echo off
echo Starting Backend Server...
start cmd /k "cd server && npm run dev"

echo Starting Frontend...
start cmd /k "cd instachat && npm run dev"

echo Both services started!
