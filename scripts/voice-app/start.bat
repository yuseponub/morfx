@echo off
cd /d "%~dp0"

echo Verificando voice-server en localhost:9922...
curl -s http://localhost:9922 >nul 2>&1
if %errorlevel% neq 0 (
    echo [AVISO] voice-server no esta corriendo en localhost:9922
    echo Inicia el servidor primero: node scripts/voice-server.mjs
    echo.
    echo Continuando de todas formas...
    echo.
)

echo Iniciando Voice Input Flotante...
npx electron .
