@echo off
title PALMPLAY - Start Both Server and Web App
echo Starting PALMPLAY backend signaling server on port 4000...
start "PALMPLAY Server" cmd /k "cd /d D:\GestureProjects\PALMPLAY && npm run dev:server"
timeout /t 2 /nobreak >nul
echo Starting PALMPLAY client on http://localhost:3000...
start "PALMPLAY Web App" cmd /k "cd /d D:\GestureProjects\PALMPLAY && npm run dev:client"
timeout /t 3 /nobreak >nul
echo Opening PALMPLAY in browser...
start http://localhost:3000
exit
