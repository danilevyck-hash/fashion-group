// ─────────────────────────────────────────────────────────────────────────────
// La configuración del agente: se lee del archivo `.env` que está AL LADO de
// este archivo, en la PC de la oficina.
//
// 🔒 ESE ARCHIVO NUNCA VA A GIT. Tiene la contraseña del reloj y la llave de
// escritura de fashiongr. El `.gitignore` del repo lo cubre (`scripts/
// agente-reloj/.env`) y acá va un `.env.ejemplo` sin secretos para copiar.
//
// Sin dependencias a propósito (nada de `dotenv`): en esa PC nadie va a correr
// `npm install`. Son veinte líneas y se leen solas.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CARPETA = dirname(fileURLToPath(import.meta.url));

/** Versión del programita. Viaja en cada envío y queda guardada en
 *  `asistencia_dispositivos.agente_version`, para saber desde acá si la oficina
 *  quedó con una versión vieja después de un cambio. */
export const VERSION = "1.0.0";

/** Cada cuánto da una vuelta. Corto a propósito: es lo que hace que el botón
 *  "Traer ahora" se sienta inmediato sin que el botón toque el reloj. */
export const VUELTA_MIN_DEFAULT = 3;

/** Cuántos días para atrás se pregunta cada vez. Tres cubre un fin de semana
 *  largo con la PC apagada y sigue siendo barato (un día tiene ~300 eventos). */
export const VENTANA_DIAS_DEFAULT = 3;

function parsearEnv(texto) {
  const salida = {};
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const i = limpia.indexOf("=");
    if (i < 0) continue;
    const clave = limpia.slice(0, i).trim();
    let valor = limpia.slice(i + 1).trim();
    // Las comillas se quitan: una contraseña con espacios se escribe
    // entrecomillada y no tiene por qué llegar con las comillas puestas.
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    salida[clave] = valor;
  }
  return salida;
}

const numero = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};

/**
 * Lee y VALIDA. Si falta algo, se muere acá con un mensaje que dice qué falta y
 * en qué archivo — no cinco minutos después con un 401 sin contexto.
 */
export function leerConfig(ruta = join(CARPETA, ".env")) {
  if (!existsSync(ruta)) {
    throw new Error(
      `No encontré el archivo de configuración:\n  ${ruta}\n\n` +
        `Copia "\.env.ejemplo" a "\.env" (en esta misma carpeta) y llena los datos.`,
    );
  }
  const env = parsearEnv(readFileSync(ruta, "utf8"));

  const faltan = ["RELOJ_HOST", "RELOJ_USUARIO", "RELOJ_CLAVE", "FASHIONGR_SECRET"].filter(
    (k) => !env[k],
  );
  if (faltan.length) {
    throw new Error(`Falta llenar en ${ruta}: ${faltan.join(", ")}`);
  }

  return {
    host: env.RELOJ_HOST.startsWith("http") ? env.RELOJ_HOST : `http://${env.RELOJ_HOST}`,
    usuario: env.RELOJ_USUARIO,
    clave: env.RELOJ_CLAVE,
    base: (env.FASHIONGR_URL || "https://fashiongr.com").replace(/\/+$/, ""),
    secret: env.FASHIONGR_SECRET,
    // 🔑 Tiene que ser EXACTAMENTE el nombre con el que ya están guardadas las
    // 3.287 marcaciones. Otro nombre = el índice único no reconoce nada y se
    // vuelve a insertar la historia entera: las horas saldrían al doble.
    dispositivo: env.DISPOSITIVO || "reloj cboston",
    vueltaMin: numero(env.VUELTA_MINUTOS, VUELTA_MIN_DEFAULT),
    ventanaDias: numero(env.VENTANA_DIAS, VENTANA_DIAS_DEFAULT),
    // Fecha (YYYY-MM-DD) antes de la cual no se pregunta nunca. Vacío = sin piso.
    piso: env.DESDE_FECHA || null,
    version: VERSION,
  };
}
