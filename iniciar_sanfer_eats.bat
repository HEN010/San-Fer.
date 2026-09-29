@echo off
title SanFer Eats - Plataforma Local
echo ========================================================
echo                 SANFER EATS SERVER
echo           "Tu ciudad, en un solo lugar"
echo ========================================================
echo.
echo Iniciando servidor en http://localhost:3000 ...
echo Panel de Administrador disponible en http://localhost:3000/#admin
echo PIN de Administrador por defecto: 1234
echo.
"%APPDATA%\Antigravity\bin\agy-node.cmd" server.js
pause
