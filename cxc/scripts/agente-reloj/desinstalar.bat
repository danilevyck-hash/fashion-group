@echo off
REM ===========================================================================
REM  QUITAR EL AGENTE DEL RELOJ
REM
REM  Clic DERECHO -> "Ejecutar como administrador".
REM  Despues de esto las marcaciones dejan de entrar solas: habria que subir
REM  el Excel del iVMS a mano en la pantalla de Asistencia.
REM ===========================================================================

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo   Falta abrirlo como administrador: clic DERECHO -^> "Ejecutar como administrador".
  echo.
  pause
  exit /b 1
)

schtasks /End /TN "FashionGroup-AgenteReloj" >nul 2>&1
schtasks /Delete /TN "FashionGroup-AgenteReloj" /F
echo.
echo   Listo, el agente ya no arranca solo.
echo.
pause
