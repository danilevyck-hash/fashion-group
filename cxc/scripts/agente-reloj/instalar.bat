@echo off
REM ===========================================================================
REM  INSTALAR EL AGENTE DEL RELOJ  (Windows)
REM
REM  Que hace: deja el programita registrado para que ARRANQUE SOLO cada vez
REM  que se prenda esta PC, sin que nadie tenga que abrir nada.
REM
REM  Como se usa: clic DERECHO sobre este archivo -> "Ejecutar como
REM  administrador". Hace falta administrador porque registrar una tarea que
REM  arranca con Windows lo pide; es la unica vez que hace falta.
REM ===========================================================================

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo   ==========================================================
  echo    FALTA ABRIRLO COMO ADMINISTRADOR
  echo   ==========================================================
  echo.
  echo    Cierra esta ventana, haz clic DERECHO sobre "instalar.bat"
  echo    y elige "Ejecutar como administrador".
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
echo.
pause
