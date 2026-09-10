#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// AGREGAR EL RELOJ DE MULTIFASHION — todo solo, sin preguntar nada.
//
// Lo dispara `agregar-reloj-multifashion.bat` (doble clic). Este archivo tiene
// las decisiones; el .bat solo busca Node y lo lanza.
//
// 🔑 POR QUÉ NO LE PREGUNTA DÓNDE ESTÁ LA CARPETA. Daniel no sabe dónde quedó
// instalado el agente —es la razón por la que este archivo existe—, así que la
// carpeta se DEDUCE de la tarea programada de Windows, que es quien lo lanza al
// prender la PC. Preguntar por una ruta que él no conoce sería el mismo
// problema con otra ventana.
//
// Lo que hace, en orden, diciendo cada paso en pantalla:
//   1. encuentra la carpeta del agente (tarea programada → plan B: buscarla)
//   2. 🔴 PONE EL PROGRAMA NUEVO. La PC de la oficina tiene la versión 1.1.0,
//      que solo sabe leer UN reloj: agregarle el renglón del segundo no serviría
//      de nada. El repo es privado y esa PC no puede bajarlo, así que el
//      programa entero viaja adentro de este archivo.
//   3. comprueba que el `.env` tenga el reloj 1
//   4. agrega los DOS renglones del reloj 2 (con respaldo, y sin repetir)
//   5. prueba los dos relojes
//   6. reinicia la tarea
//   7. resume en tres líneas
//
// 🔴 IDEMPOTENTE: correrlo dos veces no duplica un renglón ni rompe nada.
// 🔴 NO TOCA NI UNA LÍNEA que no sea la del reloj 2.
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

/* ── Lo que se va a agregar. Un solo lugar. ──────────────────────────────── */

export const RELOJ_2 = {
  host: "192.168.20.98",
  dispositivo: "reloj acs",
};

/** El nombre de la tarea que registró el instalador. */
export const TAREA = "FashionGroup-AgenteReloj";

/**
 * Dónde suele estar Node en Windows. La mira el .bat ANTES de poder correr
 * este archivo (sin Node no hay JavaScript), y hay candado que compara las dos
 * listas: escribirlas dos veces distintas es cómo una se queda vieja.
 */
export const RUTAS_TIPICAS_DE_NODE = [
  "C:\\Program Files\\nodejs\\node.exe",
  "C:\\Program Files (x86)\\nodejs\\node.exe",
];

/** Cómo se lee cada reloj en pantalla. Espejo del que usa la web. */
export const NOMBRE_DE_RELOJ = {
  "reloj cboston": "Reloj de Boston",
  "reloj acs": "Reloj de Multifashion",
};

export const nombreDeReloj = (clave) => NOMBRE_DE_RELOJ[clave] ?? clave;

/* ── 1. Encontrar la carpeta ─────────────────────────────────────────────── */

/**
 * 🩸 `schtasks /XML` DEVUELVE UTF-16, NO UTF-8.
 *
 * Leerlo como texto normal da un XML con un `\0` entre cada letra: ninguna
 * búsqueda encuentra nada y parece que la tarea no existe. Se reconoce por el
 * BOM (`FF FE`) o porque el segundo byte es cero.
 */
export function decodificarSalida(buffer) {
  if (!buffer || buffer.length === 0) return "";
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer), "utf8");
  const esUtf16 = (b[0] === 0xff && b[1] === 0xfe) || (b.length > 1 && b[1] === 0x00);
  const texto = esUtf16 ? b.toString("utf16le") : b.toString("utf8");
  return texto.replace(/^\uFEFF/, "");
}

const etiqueta = (xml, nombre) => {
  const m = xml.match(new RegExp(`<${nombre}>([\\s\\S]*?)</${nombre}>`, "i"));
  return m ? m[1].trim() : "";
};

/**
 * Saca la carpeta del agente del XML de la tarea programada.
 *
 * Se mira `WorkingDirectory` primero —es lo que el instalador escribe— y
 * después los `Arguments`, que traen la ruta del `agente.mjs` entre comillas.
 * El `Command` es `node.exe`, así que solo sirve si algún día alguien registró
 * la tarea de otra forma.
 *
 * ⚠️ Devuelve `null` en vez de adivinar: una carpeta equivocada escribiría un
 * `.env` que nadie lee y el reloj nuevo no entraría nunca.
 */
export function carpetaDesdeXml(xml) {
  if (!xml) return null;
  const trabajo = etiqueta(xml, "WorkingDirectory");
  if (trabajo && !/node\.exe$/i.test(trabajo)) return trabajo.replace(/[\\/]+$/, "");

  for (const campo of ["Arguments", "Command"]) {
    const crudo = etiqueta(xml, campo);
    if (!crudo) continue;
    const m = crudo.match(/"?([A-Za-z]:\\[^"]*?agente\.mjs)"?/i);
    // ⚠️ A mano y no con `dirname`: son rutas de WINDOWS, con contrabarra. En
    // cualquier otro sistema `dirname` no la reconoce como separador y devuelve
    // ".", que es una carpeta equivocada disfrazada de respuesta.
    if (m) return m[1].replace(/\\[^\\]*$/, "");
  }
  return null;
}

/**
 * Plan B: buscar `agente.mjs` a mano, acotado.
 *
 * ⚠️ ACOTADO A PROPÓSITO. Recorrer un disco entero puede tardar horas con
 * alguien mirando una ventana negra, así que se limita la profundidad y se
 * saltan las carpetas del sistema, que nunca lo van a tener.
 *
 * Si aparece más de uno, gana el que tenga un `.env` al lado: ese es el que
 * está configurado y corriendo.
 */
const CARPETAS_QUE_NO_SE_MIRAN = new Set([
  "windows", "$recycle.bin", "programdata", "system volume information",
  "node_modules", "appdata", "program files", "program files (x86)",
]);

export function buscarAgente(raices, { hondoMax = 4, leer = readdirSync, hayArchivo = existsSync } = {}) {
  const encontrados = [];
  const pendientes = raices.filter(Boolean).map((r) => ({ ruta: r, hondo: 0 }));

  while (pendientes.length > 0) {
    const { ruta, hondo } = pendientes.shift();
    let entradas;
    try {
      entradas = leer(ruta, { withFileTypes: true });
    } catch {
      continue; // sin permiso o unidad que no existe: se sigue
    }
    for (const e of entradas) {
      const hijo = join(ruta, e.name);
      if (e.isDirectory()) {
        if (hondo + 1 > hondoMax) continue;
        if (CARPETAS_QUE_NO_SE_MIRAN.has(e.name.toLowerCase())) continue;
        pendientes.push({ ruta: hijo, hondo: hondo + 1 });
      } else if (e.name.toLowerCase() === "agente.mjs") {
        encontrados.push(ruta);
      }
    }
  }

  if (encontrados.length === 0) return null;
  const conEnv = encontrados.find((c) => hayArchivo(join(c, ".env")));
  return conEnv ?? encontrados[0];
}

/* ── La tarea, cuando no se llama como esperábamos ───────────────────────── */

/**
 * Busca ENTRE TODAS las tareas de Windows la que corre `agente.mjs`.
 *
 * 🩸 Plan B de verdad: la tarea la registró el instalador con el nombre de
 * `TAREA`, pero nadie garantiza que alguien no la haya recreado a mano con otro
 * nombre. Se mira el XML de todas (`schtasks /Query /XML ONE`) y no el listado
 * de texto: el listado sale TRADUCIDO al idioma de Windows («Tarea que se
 * ejecutará:») y buscar por ese rótulo se rompe en la primera PC en inglés.
 */
export function tareasDelXml(xmlDeTodas) {
  if (!xmlDeTodas) return [];
  const salida = [];
  for (const trozo of String(xmlDeTodas).split(/<\/Task>/i)) {
    if (!/agente\.mjs/i.test(trozo)) continue;
    const carpeta = carpetaDesdeXml(`${trozo}</Task>`);
    if (!carpeta) continue;
    const uri = etiqueta(`${trozo}</Task>`, "URI");
    salida.push({ nombre: (uri || TAREA).replace(/^\\+/, ""), carpeta });
  }
  return salida;
}

/* ── El programa nuevo, que viaja adentro ────────────────────────────────── */

/** La versión que declara un `config.mjs`. `null` si no se puede leer. */
export function versionDe(textoConfig) {
  const m = String(textoConfig ?? "").match(/VERSION\s*=\s*["']([^"']+)["']/);
  return m ? m[1] : null;
}

/**
 * ¿Hay que reemplazar el programa de esa PC?
 *
 * 🔴 IDEMPOTENTE: si ya tiene la misma versión que viaja adentro, NO se toca
 * nada. Correr esto dos veces no puede dejar un respaldo encima del bueno.
 *
 * ⚠️ Cualquier versión DISTINTA se reemplaza, no solo una más vieja: en esa PC
 * no hay forma de que aparezca una más nueva que la del repo, y comparar
 * números de versión a mano es una regla más que se puede equivocar.
 */
export function hayQueActualizar(instalada, deAdentro) {
  if (!deAdentro) return false;
  return instalada !== deAdentro;
}

/** El paquete que el .bat dejó al lado: `{ "archivo.mjs": "contenido" }`. */
export function leerPaquete(rutaB64, leerArchivo = readFileSync) {
  try {
    const b64 = String(leerArchivo(rutaB64, "utf8")).replace(/\s+/g, "");
    if (!b64) return null;
    const json = Buffer.from(b64, "base64").toString("utf8");
    const paquete = JSON.parse(json);
    if (!paquete || typeof paquete !== "object" || !paquete["agente.mjs"]) return null;
    return paquete;
  } catch {
    // Un paquete que no se puede leer NO se adivina: se sigue sin actualizar y
    // se dice en pantalla. Escribir medio programa es peor que no escribirlo.
    return null;
  }
}

/* ── 2 y 3. El `.env` ────────────────────────────────────────────────────── */

/** Las líneas que cuentan: sin comentarios y sin espacios de más. */
const lineasVivas = (texto) =>
  texto.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

const tieneVariable = (texto, nombre) =>
  lineasVivas(texto).some((l) => l.toUpperCase().startsWith(`${nombre.toUpperCase()}=`) && l.split("=").slice(1).join("=").trim() !== "");

/**
 * Agrega el reloj 2 al `.env`, UNA sola vez.
 *
 * 🔴 No toca ninguna otra línea: se pega un bloque al final y listo. Reescribir
 * el archivo entero es cómo se pierde un ajuste que alguien puso a mano en esa
 * PC y que nadie sabe que está.
 *
 * 🔴 Se conserva el fin de línea del archivo (Windows usa `\r\n`): mezclarlos
 * deja un archivo que el Bloc de notas muestra todo en una sola línea.
 */
export function agregarReloj2(texto, reloj = RELOJ_2) {
  if (!tieneVariable(texto, "RELOJ_HOST")) {
    return { texto, resultado: "falta-reloj-1" };
  }
  // ⚠️ Se mira CADA renglón por separado, no "el reloj 2". Si una corrida
  // anterior quedó a medias —el `.env` con la dirección y sin el nombre— hay
  // que completar lo que falta, y no volver a escribir lo que ya está: dos
  // `RELOJ_2_HOST` en el mismo archivo son una configuración rota.
  const faltaHost = !tieneVariable(texto, "RELOJ_2_HOST");
  const faltaNombre = !tieneVariable(texto, "RELOJ_2_DISPOSITIVO");
  if (!faltaHost && !faltaNombre) {
    return { texto, resultado: "ya-estaba" };
  }

  const fin = texto.includes("\r\n") ? "\r\n" : "\n";
  const bloque = [
    "",
    "# ── RELOJ 2 — EL DE MULTIFASHION ────────────────────────────────────────────",
    "# Agregado por agregar-reloj-multifashion.bat. Se ve por el tunel WireGuard.",
    "# El usuario y la contrasena se toman del reloj 1: son los mismos aparatos.",
    ...(faltaHost ? [`RELOJ_2_HOST=${reloj.host}`] : []),
    ...(faltaNombre ? [`RELOJ_2_DISPOSITIVO=${reloj.dispositivo}`] : []),
    "",
  ].join(fin);

  const base = texto.replace(/[\r\n]+$/, "");
  return { texto: base + fin + bloque, resultado: "agregado" };
}

/* ── 4. El resultado de la prueba ────────────────────────────────────────── */

/**
 * Traduce lo que imprime `agente.mjs --probar` a una línea por reloj.
 *
 * El agente escribe `Reloj "reloj acs": http://…` y debajo `  ✔ …` o `  ✘ …`.
 * Acá solo se junta el nombre con lo que le pasó, en cristiano.
 */
export function resumenDeProbar(salida) {
  const lineas = String(salida ?? "").split(/\r?\n/);
  const out = [];
  let actual = null;
  for (const cruda of lineas) {
    const l = cruda.replace(/^\[[^\]]*\]\s*/, "");
    const inicio = l.match(/^Reloj "([^"]+)":/);
    if (inicio) {
      actual = { dispositivo: inicio[1], ok: null, motivo: "" };
      out.push(actual);
      continue;
    }
    if (!actual) continue;
    const bien = l.match(/^\s*✔\s*(.*)$/);
    const mal = l.match(/^\s*✘\s*(.*)$/);
    if (mal) {
      actual.ok = false;
      actual.motivo = mal[1].replace(/^No se lleg[oó] al reloj:\s*/i, "").trim();
    } else if (bien && actual.ok === null) {
      actual.ok = true;
    }
  }
  return out.map((r) => ({
    dispositivo: r.dispositivo,
    nombre: nombreDeReloj(r.dispositivo),
    ok: r.ok === true,
    linea:
      r.ok === true
        ? `✔ ${nombreDeReloj(r.dispositivo)} contesta`
        : `✗ ${nombreDeReloj(r.dispositivo)} no contesta${r.motivo ? `: ${r.motivo}` : ""}`,
  }));
}

/* ── El programa ─────────────────────────────────────────────────────────── */

let RUTA_LOG = null;
const hechos = [];

/** La carpeta donde el .bat dejó el paquete. La pasa como segundo argumento;
 *  corriendo el archivo del repo a mano, es la carpeta del propio programa. */
function carpetaDelPaquete() {
  return process.argv[2] || dirnameDe(process.argv[1] ?? "");
}

/** `dirname` de una ruta, sirva el separador que sirva en este sistema. */
const dirnameDe = (ruta) => ruta.replace(/[\\/][^\\/]*$/, "") || ".";

function decir(mensaje = "") {
  console.log(mensaje);
  hechos.push(mensaje);
  if (!RUTA_LOG) return;
  try {
    const t = new Date(Date.now() - 5 * 3_600_000).toISOString().replace("T", " ").slice(0, 19);
    appendFileSync(RUTA_LOG, `[${t}] ${mensaje}\n`, "utf8");
  } catch {
    /* si no se puede escribir el registro, el trabajo sigue igual */
  }
}

function correr(programa, argumentos, opciones = {}) {
  try {
    const salida = execFileSync(programa, argumentos, {
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      ...opciones,
    });
    return { ok: true, salida: decodificarSalida(salida) };
  } catch (e) {
    const texto = decodificarSalida(e?.stdout) + decodificarSalida(e?.stderr);
    return { ok: false, salida: texto, error: e?.message ?? String(e) };
  }
}

/** El nombre real de la tarea de Windows. Se descubre en el paso 1. */
let nombreTarea = TAREA;

function encontrarCarpeta() {
  decir("Paso 1 de 6 — Buscando el programa del reloj en esta PC…");
  const r = correr("schtasks", ["/Query", "/TN", TAREA, "/XML"]);
  if (r.ok) {
    const carpeta = carpetaDesdeXml(r.salida);
    if (carpeta && existsSync(join(carpeta, "agente.mjs"))) {
      decir(`  Lo encontré: ${carpeta}`);
      return carpeta;
    }
  }

  // La tarea puede llamarse distinto si alguien la recreó a mano. Se buscan
  // TODAS y se elige la que corra `agente.mjs`.
  const todas = correr("schtasks", ["/Query", "/XML", "ONE"]);
  if (todas.ok) {
    for (const t of tareasDelXml(todas.salida)) {
      if (existsSync(join(t.carpeta, "agente.mjs"))) {
        nombreTarea = t.nombre;
        decir(`  Lo encontré (la tarea se llama "${t.nombre}"): ${t.carpeta}`);
        return t.carpeta;
      }
    }
  }

  decir("  La tarea de Windows no dijo dónde está. Buscándolo en el disco…");
  const raices = [
    process.env.USERPROFILE,
    "C:\\FashionGroup",
    "C:\\",
    process.env.USERPROFILE ? join(process.env.USERPROFILE, "OneDrive") : null,
  ].filter(Boolean);
  const carpeta = buscarAgente(raices);
  if (carpeta) {
    decir(`  Lo encontré: ${carpeta}`);
    return carpeta;
  }
  decir("");
  decir("  No encontré el programa del reloj en esta PC.");
  decir("  Puede ser que esté en otra computadora de la oficina.");
  return null;
}

export function main() {
  decir("");
  decir("  Agregar el reloj de Multifashion");
  decir("  --------------------------------");
  decir("");

  const carpeta = encontrarCarpeta();
  if (!carpeta) return 1;
  RUTA_LOG = join(carpeta, "agregar-reloj.log");

  // ── 2. El programa nuevo
  //
  // 🔴 VA ANTES QUE EL `.env`. La PC tiene la versión 1.1.0, que solo sabe leer
  // UN reloj: escribirle el renglón del segundo antes de cambiar el programa
  // dejaría una configuración que nadie lee, y la prueba del paso 5 diría que
  // hay un solo reloj sin explicar por qué.
  decir("");
  decir("Paso 2 de 6 — Revisando el programa del reloj…");
  const paquete = leerPaquete(join(carpetaDelPaquete(), "paquete.b64"));
  const rutaConfig = join(carpeta, "config.mjs");
  const instalada = existsSync(rutaConfig) ? versionDe(readFileSync(rutaConfig, "utf8")) : null;

  let versionFinal = instalada;
  if (!paquete) {
    decir("  No traigo el programa nuevo adentro; dejo el que está.");
  } else {
    const deAdentro = versionDe(paquete["config.mjs"]);
    if (!hayQueActualizar(instalada, deAdentro)) {
      decir(`  Ya tiene la versión ${instalada}. No cambio nada.`);
    } else {
      decir(`  Tiene la versión ${instalada ?? "(no sé cuál)"} y traigo la ${deAdentro}.`);
      for (const [nombre, contenido] of Object.entries(paquete)) {
        const destino = join(carpeta, nombre);
        if (existsSync(destino)) {
          writeFileSync(`${destino}.antes-de-multifashion`, readFileSync(destino, "utf8"), "utf8");
        }
        writeFileSync(destino, contenido, "utf8");
      }
      versionFinal = deAdentro;
      decir(`  Listo: ahora tiene la versión ${deAdentro}, la que sabe leer dos relojes.`);
      decir("  Lo de antes quedó guardado con «.antes-de-multifashion» al final.");
    }
  }

  // ── 3. El .env
  decir("");
  decir("Paso 3 de 6 — Revisando la configuración…");
  const rutaEnv = join(carpeta, ".env");
  if (!existsSync(rutaEnv)) {
    decir("  Esa carpeta no tiene el archivo de configuración (.env).");
    decir("  El agente todavía no está configurado: no toco nada.");
    return 1;
  }
  const antes = readFileSync(rutaEnv, "utf8");
  const { texto, resultado } = agregarReloj2(antes);

  if (resultado === "falta-reloj-1") {
    decir("  La configuración no tiene el reloj de Boston (RELOJ_HOST).");
    decir("  No es la configuración que esperaba: no toco nada.");
    return 1;
  }
  decir("  Bien: el reloj de Boston está configurado.");

  // ── 3. Agregar
  decir("");
  decir("Paso 4 de 6 — Agregando el reloj de Multifashion…");
  if (resultado === "ya-estaba") {
    decir("  Ya estaba agregado. No cambio nada.");
  } else {
    const respaldo = `${rutaEnv}.antes-de-multifashion`;
    writeFileSync(respaldo, antes, "utf8");
    writeFileSync(rutaEnv, texto, "utf8");
    decir(`  Listo. La configuración de antes quedó guardada en:`);
    decir(`    ${basename(respaldo)}`);
  }

  // ── 4. Probar
  decir("");
  decir("Paso 5 de 6 — Probando los dos relojes (tarda unos segundos)…");
  const prueba = correr(process.execPath, [join(carpeta, "agente.mjs"), "--probar"], {
    cwd: carpeta,
  });
  const resumen = resumenDeProbar(prueba.salida);
  if (resumen.length === 0) {
    decir("  No pude leer el resultado de la prueba. Esto fue lo que dijo:");
    for (const l of String(prueba.salida).split(/\r?\n/).slice(0, 12)) decir(`    ${l}`);
  } else {
    for (const r of resumen) decir(`  ${r.linea}`);
  }

  // ── 5. Reiniciar
  decir("");
  decir("Paso 6 de 6 — Reiniciando el programa del reloj…");
  correr("schtasks", ["/End", "/TN", nombreTarea]);
  const arranque = correr("schtasks", ["/Run", "/TN", nombreTarea]);
  let reinicio = arranque.ok;
  if (!reinicio) {
    if (/denied|denegado|acceso/i.test(arranque.salida + (arranque.error ?? ""))) {
      decir("  Windows no me dejó (hace falta permiso de administrador).");
      decir("  Cierra esta ventana, haz clic DERECHO sobre el archivo");
      decir("  «agregar-reloj-multifashion.bat» y elige «Ejecutar como administrador».");
    } else {
      decir("  No pude reiniciarlo. Con reiniciar la PC alcanza.");
    }
  } else {
    decir("  Listo, ya está corriendo con los dos relojes.");
  }

  // ── 6. El resumen
  const buenos = resumen.filter((r) => r.ok).length;
  decir("");
  decir("  ══════════════════════════════════════════════════════");
  decir(
    `  1. Multifashion: ${resultado === "ya-estaba" ? "ya estaba agregado" : "agregado"}.`,
  );
  decir(
    `  2. Relojes que contestan: ${buenos} de ${resumen.length || 2}.` +
      (buenos < (resumen.length || 2) ? " Revisa el que falla." : ""),
  );
  decir(
    `  3. El programa ${reinicio ? "ya está corriendo" : "arranca al reiniciar la PC"}` +
      `${versionFinal ? ` (versión ${versionFinal})` : ""}.`,
  );
  decir("  ══════════════════════════════════════════════════════");
  decir("");
  decir(`  Todo esto quedó escrito en: ${RUTA_LOG}`);
  decir("");
  return buenos > 0 || resultado === "ya-estaba" ? 0 : 1;
}

// Solo cuando se ejecuta de verdad; importarlo desde un test no corre nada.
if (process.argv[1] && basename(process.argv[1]).toLowerCase() === "agregar-reloj.mjs") {
  try {
    process.exitCode = main();
  } catch (e) {
    console.log("");
    console.log(`  Algo salió mal y no pude terminar: ${e?.message ?? e}`);
    console.log("  No se perdió nada. Pídele ayuda a Claude con esta pantalla.");
    process.exitCode = 1;
  }
}
