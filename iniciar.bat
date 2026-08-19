@echo off
setlocal
cd /d "%~dp0"

title Grimorio de Missoes - Chronicles of Focus
color 0E

:: Ensure Node.js paths are in PATH
set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"

echo =============================================================
echo   GRIMORIO DE MISSOES: CHRONICLES OF FOCUS
echo =============================================================
echo   Sistema Gamificado de Produtividade
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no sistema.
    echo Por favor, instale o Node.js ou verifique se esta em C:\Program Files\nodejs
    echo.
    pause
    exit /b 1
)

echo [1/2] Iniciando servidor em http://localhost:3000...
echo [2/2] Abrindo navegador padrao...
echo.
echo =============================================================
echo   Pressione CTRL+C ou feche esta janela para encerrar o jogo.
echo =============================================================
echo.

start "" "http://localhost:3000"
node server/index.js

pause
