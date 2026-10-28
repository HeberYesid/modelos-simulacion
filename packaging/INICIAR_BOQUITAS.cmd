@echo off
setlocal

set "APP=%~dp0Boquitas.exe"
if not exist "%APP%" (
    echo No se encontro Boquitas.exe. Extraiga de nuevo el paquete completo.
    pause
    exit /b 1
)

"%APP%" %*
set "APP_EXIT=%ERRORLEVEL%"
if not "%APP_EXIT%"=="0" (
    echo.
    echo Boquitas termino con el codigo %APP_EXIT%.
    pause
)
exit /b %APP_EXIT%
