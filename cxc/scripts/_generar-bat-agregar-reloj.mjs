// ─────────────────────────────────────────────────────────────────────────────
// Arma `agregar-reloj-multifashion.bat` con `agregar-reloj.mjs` ADENTRO.
//
// 🔑 POR QUÉ UN SOLO ARCHIVO. El .bat lo baja Daniel a su Mac y lo lleva él a
// la PC de la oficina. Dos archivos que tienen que viajar juntos son un archivo
// que se pierde en el camino, y el .bat solo no sirve para nada. Así que el
// programa viaja DENTRO del .bat, en base64 —el único formato que el `echo` de
// Windows no rompe: no tiene `<`, `>`, `|`, `&` ni `%`— y al correr se escribe
// en una carpeta temporal y se ejecuta desde ahí.
//
// 🔴 EL .BAT NO SE EDITA A MANO: se cambia `agregar-reloj.mjs` y se vuelve a
// correr esto. Hay candado (`agregar-reloj-bat.test.ts`) que decodifica lo que
// el .bat lleva adentro y lo compara byte a byte con el .mjs: si se separan, el
// build se pone ROJO.
//
//   node scripts/_generar-bat-agregar-reloj.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARPETA = join(RAIZ, "scripts", "agente-reloj");
const ORIGEN = join(CARPETA, "agregar-reloj.mjs");
const DESTINO = join(CARPETA, "agregar-reloj-multifashion.bat");

export const MARCA_INICIO = "REM ---8<--- EL PROGRAMA (base64) ---8<---";
export const MARCA_FIN = "REM ---8<--- FIN DEL PROGRAMA ---8<---";
export const MARCA_PAQUETE_INICIO = "REM ---8<--- EL AGENTE NUEVO (base64) ---8<---";
export const MARCA_PAQUETE_FIN = "REM ---8<--- FIN DEL AGENTE NUEVO ---8<---";

/**
 * Los archivos del agente que viajan adentro del .bat.
 *
 * 🔴 LA PC DE LA OFICINA TIENE LA VERSIÓN VIEJA (1.1.0), la que solo sabe leer
 * UN reloj. Agregarle el renglón del segundo no serviría de nada. El repo es
 * privado, así que esa PC no puede bajar el programa: tiene que viajar acá.
 *
 * ⚠️ Son TODOS los que `agente.mjs` importa, y ninguno más. El agente no usa una
 * sola librería de fuera (todo es `node:`), así que en esa PC no hay que correr
 * `npm install` ni hace falta un `package.json`.
 */
export const ARCHIVOS_DEL_AGENTE = [
  "agente.mjs",
  "config.mjs",
  "digest.mjs",
  "espera.mjs",
  "puente.mjs",
  "reloj.mjs",
  "ronda.mjs",
  "vuelta.mjs",

];
/** 76 caracteres por renglón: cómodo de leer y lejos del límite de `echo`. */
export const ANCHO_B64 = 76;

/** Corta el base64 en renglones de `echo`, con el redirect ADELANTE — así no se
 *  cuela un espacio al final de cada línea, que rompería el decodificado. */
export function renglonesBase64(contenido, ancho = ANCHO_B64) {
  const b64 = Buffer.from(contenido, "utf8").toString("base64");
  const out = [];
  for (let i = 0; i < b64.length; i += ancho) out.push(b64.slice(i, i + ancho));
  return out;
}

/** El base64 que el .bat lleva adentro, tal como se lee del archivo. */
export function base64DelBat(bat) {
  const i = bat.indexOf(MARCA_INICIO);
  const j = bat.indexOf(MARCA_FIN);
  if (i < 0 || j < 0 || j < i) return null;
  return bat
    .slice(i + MARCA_INICIO.length, j)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith(">>"))
    .map((l) => l.replace(/^>>"%B64%"\s+echo\s+/, ""))
    .join("");
}

/** El programa que el .bat lleva adentro, ya decodificado. */
export function programaDelBat(bat) {
  const b64 = base64DelBat(bat);
  return b64 === null ? null : Buffer.from(b64, "base64").toString("utf8");
}

/** El paquete con el agente nuevo que el .bat lleva adentro, ya abierto. */
export function paqueteDelBat(bat) {
  const i = bat.indexOf(MARCA_PAQUETE_INICIO);
  const j = bat.indexOf(MARCA_PAQUETE_FIN);
  if (i < 0 || j < 0 || j < i) return null;
  const b64 = bat
    .slice(i + MARCA_PAQUETE_INICIO.length, j)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith(">>"))
    .map((l) => l.replace(/^>>"%PAQ%"\s+echo\s+/, ""))
    .join("");
  if (!b64) return null;
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

function armar(mjs, paquete, rutasDeNode) {
  const buscarNode = rutasDeNode.map(
    (r) => 'if not defined NODE if exist "' + r + '" set "NODE=' + r + '"',
  );
  const lineas = [
    "@echo off",
    "REM ===========================================================================",
    "REM  AGREGAR EL RELOJ DE MULTIFASHION",
    "REM",
    "REM  Que hace: le dice al programa del reloj que, ademas del reloj de Boston,",
    "REM  lea el de Multifashion. Encuentra todo solo; no hay nada que buscar.",
    "REM",
    'REM  Como se usa: DOBLE CLIC. Si Windows se queja de permisos, clic DERECHO',
    'REM  sobre este archivo y "Ejecutar como administrador".',
    "REM",
    "REM  Correrlo dos veces no rompe nada: si ya estaba agregado, lo dice y sigue.",
    "REM",
    "REM  ADENTRO de este archivo viaja el programa que hace el trabajo. NO se edita",
    "REM  a mano: se cambia scripts/agente-reloj/agregar-reloj.mjs en el repo y se",
    "REM  vuelve a correr scripts/_generar-bat-agregar-reloj.mjs.",
    "REM ===========================================================================",
    "",
    "chcp 65001 >nul 2>&1",
    "setlocal EnableExtensions",
    "",
    "echo.",
    "echo   Agregar el reloj de Multifashion",
    "echo   ================================",
    "echo.",
    "",
    "REM -- 0. Pedir permiso de administrador ---------------------------------------",
    "REM  MEDIDO EN LA PC DE LA OFICINA: consultar la tarea programada sin permisos",
    'REM  contesta "Acceso denegado", asi que sin esto no funciona ni el primer paso.',
    "REM  Se relanza este mismo archivo pidiendole permiso a Windows.",
    "REM",
    "REM  Adentro del bloque se usa `if errorlevel 1` y NO %errorlevel%: cmd",
    "REM  reemplaza las variables de todo el bloque ANTES de correr la primera",
    "REM  linea, asi que %errorlevel% traeria el resultado de `net session` y",
    "REM  diria siempre que fallo el permiso.",
    "net session >nul 2>&1",
    "if %errorlevel% neq 0 (",
    "  echo   Windows va a pedir permiso para hacer este cambio.",
    '  echo   Cuando aparezca la ventana azul, elige "Si".',
    "  echo.",
    "  powershell -NoProfile -ExecutionPolicy Bypass -Command \"Start-Process -FilePath '%~f0' -Verb RunAs\" >nul 2>&1",
    "  if errorlevel 1 (",
    "    echo   No se pudo pedir el permiso.",
    '    echo   Cierra esta ventana, haz clic DERECHO sobre este archivo y elige',
    '    echo   "Ejecutar como administrador".',
    "    echo.",
    "    pause",
    "  )",
    "  exit /b 0",
    ")",
    "",
    "REM -- 1. Buscar Node.js ------------------------------------------------------",
    'set "NODE="',
    'for %%N in (node.exe) do if not defined NODE set "NODE=%%~$PATH:N"',
    ...buscarNode,
    "if not defined NODE (",
    "  echo   No encontre Node.js en esta PC.",
    "  echo.",
    "  echo   Node.js es lo que hace funcionar el programa del reloj, asi que si el",
    "  echo   reloj esta andando tiene que estar instalado. Puede ser que el agente",
    "  echo   este en otra computadora de la oficina.",
    "  echo.",
    "  pause",
    "  exit /b 1",
    ")",
    "",
    "REM -- 2. Escribir el programa en una carpeta temporal -------------------------",
    "REM  Va en base64 porque es el unico formato que echo no rompe. La carpeta se",
    "REM  llama igual siempre: correrlo dos veces pisa lo de antes y no deja basura.",
    'set "TRABAJO=%TEMP%\\fg-agregar-reloj"',
    'set "B64=%TRABAJO%\\programa.b64"',
    'set "MJS=%TRABAJO%\\agregar-reloj.mjs"',
    'set "PAQ=%TRABAJO%\\paquete.b64"',
    'if not exist "%TRABAJO%" mkdir "%TRABAJO%" >nul 2>&1',
    'if exist "%B64%" del /q "%B64%" >nul 2>&1',
    'if exist "%MJS%" del /q "%MJS%" >nul 2>&1',
    'if exist "%PAQ%" del /q "%PAQ%" >nul 2>&1',
    "",
    MARCA_INICIO,
    ...renglonesBase64(mjs).map((t) => '>>"%B64%" echo ' + t),
    MARCA_FIN,
    "",
    "REM  Y el agente nuevo, en otro bloque. Este no se decodifica con certutil:",
    "REM  lo abre el propio programa, que ya sabe leer base64.",
    MARCA_PAQUETE_INICIO,
    ...renglonesBase64(JSON.stringify(paquete)).map((t) => '>>"%PAQ%" echo ' + t),
    MARCA_PAQUETE_FIN,
    "",
    'certutil -f -decode "%B64%" "%MJS%" >nul 2>&1',
    "",
    "REM  Plan B: si Windows no dejo usar certutil pero el programa esta al lado de",
    "REM  este archivo (la carpeta del repo), se usa ese.",
    'if not exist "%MJS%" if exist "%~dp0agregar-reloj.mjs" set "MJS=%~dp0agregar-reloj.mjs"',
    'if not exist "%MJS%" (',
    "  echo   No pude preparar el programa en esta PC.",
    '  echo   Vuelve a intentarlo con clic DERECHO ^> "Ejecutar como administrador".',
    "  echo.",
    "  pause",
    "  exit /b 1",
    ")",
    "",
    "REM -- 3. Hacer el trabajo ----------------------------------------------------",
    '"%NODE%" "%MJS%" "%TRABAJO%"',
    'set "SALIDA=%ERRORLEVEL%"',
    "",
    'if exist "%B64%" del /q "%B64%" >nul 2>&1',
    'if exist "%PAQ%" del /q "%PAQ%" >nul 2>&1',
    "echo.",
    "pause",
    "exit /b %SALIDA%",
    "",
  ];
  return lineas.join("\r\n");
}

if (process.argv[1] && process.argv[1].endsWith("_generar-bat-agregar-reloj.mjs")) {
  const { RUTAS_TIPICAS_DE_NODE } = await import(pathToFileURL(ORIGEN).href);
  const mjs = readFileSync(ORIGEN, "utf8");
  const paquete = {};
  for (const nombre of ARCHIVOS_DEL_AGENTE) {
    paquete[nombre] = readFileSync(join(CARPETA, nombre), "utf8");
  }
  const bat = armar(mjs, paquete, RUTAS_TIPICAS_DE_NODE);
  writeFileSync(DESTINO, bat, "utf8");
  console.log(
    `Listo: ${DESTINO} (${bat.length} bytes) — programa ${mjs.length} + agente ` +
      `${ARCHIVOS_DEL_AGENTE.length} archivos`,
  );
}
