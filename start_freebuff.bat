@echo off
TITLE FreeBuff Workspace
echo Verificando directorio de trabajo...

:: Crear el directorio si no existe
if not exist "%~dp0" (
    mkdir "%~dp0"
)

:: Cambiar al directorio
cd /d "%~dp0"

echo Iniciando FreeBuff en %CD%...
echo ===================================================

:: Ejecutar freebuff
call freebuff

echo ===================================================
pause
