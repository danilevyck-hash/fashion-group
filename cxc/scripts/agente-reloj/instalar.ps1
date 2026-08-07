# ============================================================================
#  Registra el agente del reloj como tarea de Windows.
#
#  Lo lanza "instalar.bat" (que ya se aseguro de correr como administrador).
#
#  POR QUE UNA TAREA PROGRAMADA Y NO LA CARPETA DE INICIO:
#    - La carpeta de Inicio solo corre cuando ALGUIEN INICIA SESION. Si la PC
#      se prende sola despues de un corte de luz y se queda en la pantalla de
#      contrasena, no corre nada y nadie se entera.
#    - La tarea corre como SISTEMA al PRENDER la maquina, sin que nadie entre.
#    - Y si el programita se cae, Windows lo vuelve a levantar solo.
# ============================================================================

$ErrorActionPreference = "Stop"
$nombreTarea = "FashionGroup-AgenteReloj"
$carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
$script  = Join-Path $carpeta "agente.mjs"
$config  = Join-Path $carpeta ".env"

Write-Host ""
Write-Host "  Agente del reloj - instalacion" -ForegroundColor Cyan
Write-Host "  ------------------------------"
Write-Host ""

# ── 1. Node ──────────────────────────────────────────────────────────────────
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  foreach ($ruta in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe")) {
    if (Test-Path $ruta) { $node = $ruta; break }
  }
}
if (-not $node) {
  Write-Host "  FALTA INSTALAR NODE.JS." -ForegroundColor Red
  Write-Host ""
  Write-Host "  Bajalo de:  https://nodejs.org  (el boton grande, version LTS)"
  Write-Host "  Instalalo con Siguiente, Siguiente, Siguiente."
  Write-Host "  Despues volve a abrir este instalador."
  Write-Host ""
  exit 1
}
Write-Host "  OK  Node.js encontrado: $node"

# ── 2. La configuracion ──────────────────────────────────────────────────────
if (-not (Test-Path $config)) {
  Write-Host ""
  Write-Host "  FALTA EL ARCHIVO DE CONFIGURACION." -ForegroundColor Red
  Write-Host ""
  Write-Host "  En esta misma carpeta hay un archivo que se llama  .env.ejemplo"
  Write-Host "  Copialo, ponele de nombre  .env  (asi, con el punto adelante)"
  Write-Host "  y llena adentro la contrasena del reloj y la llave de fashiongr."
  Write-Host ""
  exit 1
}
Write-Host "  OK  Configuracion encontrada."

# ── 3. Probar que se llega al reloj ANTES de instalar nada ───────────────────
# Instalar algo que no funciona es peor que no instalarlo: queda corriendo en
# silencio y nadie se entera hasta que falta media planilla.
Write-Host ""
Write-Host "  Probando la conexion con el reloj y con fashiongr..."
& $node $script --probar
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "  NO SE PUDO CONECTAR. No se instalo nada." -ForegroundColor Red
  Write-Host "  Revisa arriba que dice, corregi el archivo .env y proba de nuevo."
  Write-Host ""
  exit 1
}

# ── 4. Registrar la tarea ────────────────────────────────────────────────────
$accion = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" -WorkingDirectory $carpeta

# Dos disparadores: al prender la maquina, y tambien cuando alguien inicia
# sesion. El segundo es el paraguas por si algun dia la tarea de arranque queda
# deshabilitada por una politica del sistema.
$disparadores = @(
  (New-ScheduledTaskTrigger -AtStartup),
  (New-ScheduledTaskTrigger -AtLogOn)
)

$opciones = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
  -MultipleInstances IgnoreNew

# SISTEMA (S-1-5-18): corre sin que nadie inicie sesion y sin guardar ninguna
# contrasena de usuario en ningun lado.
$quien = New-ScheduledTaskPrincipal -UserId "S-1-5-18" -LogonType ServiceAccount -RunLevel Highest

Unregister-ScheduledTask -TaskName $nombreTarea -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
  -TaskName $nombreTarea `
  -Action $accion `
  -Trigger $disparadores `
  -Settings $opciones `
  -Principal $quien `
  -Description "Trae las marcaciones del reloj de la entrada y las manda a fashiongr.com" | Out-Null

Start-ScheduledTask -TaskName $nombreTarea

Write-Host ""
Write-Host "  LISTO." -ForegroundColor Green
Write-Host ""
Write-Host "  El agente ya esta corriendo y va a arrancar solo cada vez que se"
Write-Host "  prenda esta PC. No hay que abrir nada nunca mas."
Write-Host ""
Write-Host "  Para ver que esta haciendo, abri este archivo:"
Write-Host "    $(Join-Path $carpeta 'agente-reloj.log')"
Write-Host ""
