#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// EL AGENTE DEL RELOJ — el programita que corre en la PC de la oficina.
//
// Cada pocos minutos: le pregunta al reloj Hikvision de la entrada por las
// marcaciones de los últimos días y las manda a fashiongr.com.
//
// ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
// El reloj vive en `192.168.10.10`, una IP privada. Vercel no la alcanza. Y el
// reloj tampoco sabe empujar datos a una dirección web (solo habla el protocolo
// propio de Hikvision — verificado el 3-ago-2026 en el equipo real). Así que
// alguien DENTRO de la oficina tiene que hacer de puente. Este es ese alguien.
//
// ── LO QUE NO HACE, A PROPÓSITO ──────────────────────────────────────────────
//   · No interpreta ni filtra los eventos: los manda crudos y el servidor
//     decide. Un solo lugar que entienda de Hikvision.
//   · No lleva estado en disco: el "hasta dónde leí" vive en la base. Si
//     alguien formatea esta PC, no se pierde el hilo.
//   · No se muere nunca. Cualquier error se anota, se reporta y se sigue.
//
// ── CÓMO SE CORRE ────────────────────────────────────────────────────────────
//   node agente.mjs            → bucle infinito (así lo lanza Windows al prender)
//   node agente.mjs --una-vez  → una sola vuelta y sale (para probar)
//   node agente.mjs --probar   → solo verifica que se llega al reloj y al puente
//
// Instalación en Windows: ver INSTALAR-WINDOWS.md, en esta misma carpeta.
// ─────────────────────────────────────────────────────────────────────────────

import { appendFileSync, statSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CARPETA, leerConfig, VERSION } from "./config.mjs";
import { traerEventos, relojVivo } from "./reloj.mjs";
import { leerEstado, mandarEventos, reportarError } from "./puente.mjs";
import { darVuelta } from "./vuelta.mjs";
import { nuevoEstadoReloj } from "./espera.mjs";

const RUTA_LOG = join(CARPETA, "agente-reloj.log");
/** El log se rota a los 5 MB. Sin esto, en una PC que nadie mira, el archivo
 *  crecería para siempre hasta llenar el disco. */
const MAX_LOG_BYTES = 5 * 1024 * 1024;

function log(mensaje) {
  const t = new Date(Date.now() - 5 * 3_600_000).toISOString().replace("T", " ").slice(0, 19);
  const linea = `[${t}] ${mensaje}`;
  console.log(linea);
  try {
    if (existsSync(RUTA_LOG) && statSync(RUTA_LOG).size > MAX_LOG_BYTES) {
      renameSync(RUTA_LOG, `${RUTA_LOG}.viejo`);
    }
    appendFileSync(RUTA_LOG, `${linea}\n`, "utf8");
  } catch {
    /* si no se puede escribir el log, el agente sigue igual: el log es para
       mirar después, las marcaciones son lo que importa */
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const deps = { leerEstado, traerEventos, mandarEventos, reportarError };

async function probar(config) {
  log(`Agente v${VERSION}. Probando la conexión…`);
  log(`Reloj: ${config.host} (usuario ${config.usuario})`);
  try {
    await relojVivo({ host: config.host, usuario: config.usuario, clave: config.clave });
    log("✔ El reloj contesta.");
  } catch (e) {
    log(`✘ No se llegó al reloj: ${e.message}`);
    return false;
  }
  try {
    const estado = await leerEstado({
      base: config.base,
      secret: config.secret,
      dispositivo: config.dispositivo,
    });
    log(`✔ fashiongr contesta. Leído hasta: ${estado?.estado?.leido_hasta ?? "(nunca)"}`);
  } catch (e) {
    log(`✘ No se llegó a fashiongr: ${e.message}`);
    if (/no autorizado|401/i.test(e.message)) pistaLlave(config);
    return false;
  }
  log("Todo bien. Ya se puede instalar para que arranque solo.");
  return true;
}

/**
 * Qué mirar cuando el servidor dice "No autorizado".
 *
 * 🩸 Ese mensaje es de una sola palabra y tiene DOS causas muy distintas: la
 * llave no coincide con la de Vercel, o la dirección no es la buena y la llave
 * se perdió en el redirect (ver `normalizarBase`). Sin esta pista hay que
 * adivinar cuál de las dos, y la llave no se puede mirar por chat.
 *
 * ⚠️ NUNCA se imprime la llave. Solo su LARGO y sus dos extremos — alcanza para
 * cazar el error típico (se copió con un espacio, o quedó "PONER-LA-LLAVE-AQUI")
 * sin que quede escrita en un log que después se manda por WhatsApp.
 */
function pistaLlave(config) {
  const s = config.secret ?? "";
  const extremos = s.length >= 4 ? `${s.slice(0, 1)}…${s.slice(-1)}` : "(muy corta)";
  log("");
  log("Qué revisar en el archivo .env de esta carpeta:");
  log(`  1. FASHIONGR_SECRET — la que está puesta mide ${s.length} caracteres (${extremos}).`);
  log("     Tiene que ser IGUAL a ASISTENCIA_INGEST_SECRET en Vercel. Escríbela a");
  log("     mano: al copiar y pegar suele venirse un espacio pegado.");
  log(`  2. FASHIONGR_URL — tiene que ser https://www.fashiongr.com (ahora: ${config.base}).`);
  log("");
}

async function main() {
  const args = process.argv.slice(2);

  let config;
  try {
    config = leerConfig();
  } catch (e) {
    // Un error de configuración SÍ mata el proceso: seguir girando sin poder
    // hacer nada solo esconde el problema. Windows lo reintenta al reiniciar.
    console.error(`\n${e.message}\n`);
    process.exit(1);
  }

  if (args.includes("--probar")) {
    process.exit((await probar(config)) ? 0 : 1);
  }

  log(
    `Agente v${VERSION} arrancado. Reloj ${config.host} · dispositivo "${config.dispositivo}" · ` +
      `ventana ${config.ventanaDias} día(s) · vuelta cada ${config.vueltaMin} min.`,
  );

  const unaVez = args.includes("--una-vez");

  // La pista de la llave se imprime UNA vez, no en cada vuelta: con vueltas de
  // 3 minutos, repetirla convertiría el log en una pared de texto igual.
  let yaExpliqueLaLlave = false;

  // 🔑 El castigo del reloj vive ACÁ, no dentro de `darVuelta`: una vuelta sola
  // no puede saber que la anterior fue rechazada, y sin memoria entre vueltas el
  // agente vuelve a golpear el aparato cada 3 minutos (ver `espera.mjs`).
  const estadoReloj = nuevoEstadoReloj();

  // Bucle sin fin y sin salidas. Lo único que puede terminarlo es que Windows
  // apague la máquina, y en ese caso arranca solo cuando se prenda.
  for (;;) {
    try {
      const r = await darVuelta({ config, deps, estado: estadoReloj, log });
      if (r.ok) {
        log(
          `Vuelta lista: ${r.traidos} del reloj · ${r.guardados} nuevas · ` +
            `${r.descartados} descartadas${r.pedidoCerrado ? " · pedido 'Traer ahora' cumplido" : ""}.`,
        );
      } else if (!yaExpliqueLaLlave && /no autorizado|401/i.test(r.error ?? "")) {
        pistaLlave(config);
        yaExpliqueLaLlave = true;
      }
    } catch (e) {
      // Red de seguridad final. `darVuelta` promete no lanzar; si igual lanzara
      // (un bug nuestro), el agente NO puede morirse por eso.
      log(`Error inesperado en la vuelta: ${e?.message ?? e}`);
    }
    if (unaVez) break;
    await dormir(config.vueltaMin * 60_000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
