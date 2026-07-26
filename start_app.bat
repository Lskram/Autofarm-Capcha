@echo off
title Farming Controller Launcher
color 0A
cd /d "%~dp0"
start "" /b node server.js
timeout /t 2 /nobreak >nul
start http://localhost:3000
