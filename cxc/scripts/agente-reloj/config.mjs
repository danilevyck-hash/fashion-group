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
export const VERSION = "1.2.0";

/** Cada cuánto da una vuelta. Corto a propósito: es lo que hace que el botón
 *  "Traer ahora" se sienta inmediato sin que el botón toque el reloj. */
export const VUELTA_MIN_DEFAULT = 3;

/** Cuántos días para atrás se pregunta cada vez. Tres cubre un fin de semana
 *  largo con la PC apagada y sigue siendo barato (un día tiene ~300 eventos). */
export const VENTANA_DIAS_DEFAULT = 3;

/**
 * Cuántos días se piden cuando se detecta un hueco de verdad (ver
 * `decidirVentana` en `vuelta.mjs`). Quince cubre unas vacaciones enteras con la
 * PC apagada.
 *
 * ⚠️ NO es la ventana de siempre, y no puede serlo: el firmware devuelve 10
 * eventos por página pida lo que pida, así que 15 días (~1.250 eventos) son
 * ~125 llamadas al reloj. A una vuelta cada 3 minutos eso serían ~60.000
 * llamadas por día contra el aparato de la entrada. La ventana larga se pide
 * SOLO cuando falta algo, y vuelve sola a la corta.
 */
export const VENTANA_RECUPERACION_DIAS_DEFAULT = 15;

/**
 * Corrige la dirección de fashiongr antes de usarla.
 *
 * 🩸 MEDIDO EL 7-AGO-2026 EN LA PC DE LA OFICINA. `https://fashiongr.com` (sin
 * `www`) contesta **307** y manda a `https://www.fashiongr.com`. En un redirect
 * hacia OTRO host, `fetch` **descarta el encabezado `Authorization`** — lo manda
 * el estándar, no es un bug de Node. O sea: el agente llegaba al servidor SIN
 * credencial y recibía `No autorizado`, un mensaje que hace sospechar de la
 * llave cuando la llave estaba perfecta. Se perdió media hora buscando ahí.
 *
 * Por eso la corrección vive ACÁ y no en el `.env`: quien instale el agente
 * mañana puede copiar un ejemplo viejo o escribir la dirección a mano, y el
 * error no se ve — se ve como "la llave está mal".
 */
export function normalizarBase(url) {
  const crudo = String(url ?? "").trim().replace(/\/+$/, "");
  if (!crudo) return "https://www.fashiongr.com";
  const conEsquema = /^https?:\/\//i.test(crudo) ? crudo : `https://${crudo}`;
  try {
    const u = new URL(conEsquema);
    const host = u.hostname.toLowerCase();
    if (host === "fashiongr.com" || host === "www.fashiongr.com") {
      // `http://` también redirige (a `https://`), y un cambio de esquema es
      // igual de "otro origen" para el estándar: la llave se pierde igual.
      u.hostname = "www.fashiongr.com";
      u.protocol = "https:";
    }
    return u.origin + u.pathname.replace(/\/+$/, "");
  } catch {
    // Una dirección que ni siquiera se puede leer se devuelve tal cual: que
    // reviente al usarla, con su mensaje, en vez de inventar otra en silencio.
    return conEsquema;
  }
}

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

/* ── LOS RELOJES: una LISTA, no uno ─────────────────────────────────────────
 *
 * Desde el 10-sep-2026 la misma PC lee DOS relojes Hikvision: el de Confecciones
 * Boston (192.168.10.10, en la red de la oficina) y el de Multifashion
 * (192.168.20.98, que se ve por el túnel WireGuard). Los dos hablan ISAPI igual.
 *
 * 🔴 LA LISTA ES ADITIVA: el `.env` de la oficina, tal como está escrito hoy,
 * sigue valiendo sin tocar una letra. `RELOJ_HOST` / `RELOJ_USUARIO` /
 * `RELOJ_CLAVE` / `DISPOSITIVO` son el RELOJ 1 y no cambiaron de nombre. Un
 * reloj más se agrega con dos renglones (`RELOJ_2_HOST` y `RELOJ_2_DISPOSITIVO`);
 * el usuario y la contraseña se heredan del reloj 1 si no se escriben, porque
 * hoy son los mismos en los dos aparatos.
 *
 * 🔑 `dispositivo` NO ES UNA ETIQUETA: es la mitad de la llave anti-duplicado
 * `(dispositivo, evento_id)` del servidor. Dos relojes con el MISMO nombre
 * mezclarían sus `serialNo` —los dos numeran desde 1— y una marcación taparía a
 * la otra: alguien aparecería sin entrar. Por eso se rechaza el repetido acá,
 * antes de mandar nada, en vez de descubrirlo en la planilla.
 */

/** Hasta cuántos relojes se buscan en el `.env` (RELOJ_2_… hasta RELOJ_9_…). */
export const MAX_RELOJES = 9;

/** El nombre del reloj de siempre. Ver el 🔑 de arriba: no se cambia. */
export const DISPOSITIVO_POR_DEFECTO = "reloj cboston";

const conEsquema = (h) => (String(h).startsWith("http") ? String(h) : `http://${h}`);

/**
 * Arma la lista de relojes a partir de las variables del `.env`.
 *
 * PURA a propósito (recibe el objeto ya leído): así se prueba entera sin
 * escribir archivos, que es lo único que se puede hacer desde fuera de la
 * oficina.
 */
export function armarRelojes(env) {
  const uno = {
    dispositivo: (env.DISPOSITIVO || DISPOSITIVO_POR_DEFECTO).trim(),
    host: conEsquema(String(env.RELOJ_HOST ?? "").trim()),
    usuario: env.RELOJ_USUARIO,
    clave: env.RELOJ_CLAVE,
  };
  const relojes = [uno];

  for (let i = 2; i <= MAX_RELOJES; i++) {
    const host = String(env[`RELOJ_${i}_HOST`] ?? "").trim();
    if (!host) continue;
    const dispositivo = String(env[`RELOJ_${i}_DISPOSITIVO`] ?? "").trim();
    if (!dispositivo) {
      throw new Error(
        `Falta RELOJ_${i}_DISPOSITIVO. Cada reloj necesita su propio nombre ` +
          `(por ejemplo "reloj acs"): es lo que evita que las marcaciones de un ` +
          `reloj tapen las del otro.`,
      );
    }
    relojes.push({
      dispositivo,
      host: conEsquema(host),
      // Se heredan del reloj 1 si no se escriben: hoy los dos aparatos tienen
      // el mismo usuario y la misma contraseña, y repetir una contraseña en el
      // archivo es una copia más que se puede quedar vieja.
      usuario: env[`RELOJ_${i}_USUARIO`] || uno.usuario,
      clave: env[`RELOJ_${i}_CLAVE`] || uno.clave,
    });
  }

  const nombres = new Set();
  const direcciones = new Set();
  for (const r of relojes) {
    if (nombres.has(r.dispositivo)) {
      throw new Error(
        `Hay dos relojes con el mismo nombre "${r.dispositivo}". Cada uno tiene ` +
          `que tener el suyo, o las marcaciones de uno tapan las del otro.`,
      );
    }
    if (direcciones.has(r.host)) {
      throw new Error(
        `Hay dos relojes con la misma dirección ${r.host}. Es el mismo aparato ` +
          `dos veces: se guardaría cada marcación dos veces y las horas saldrían ` +
          `al doble.`,
      );
    }
    nombres.add(r.dispositivo);
    direcciones.add(r.host);
  }
  return relojes;
}

/**
 * La configuración de UN reloj, lista para `darVuelta`.
 *
 * Cada vuelta trabaja con un solo reloj: así el que se cae no arrastra al otro
 * y cada uno lleva su propio "hasta dónde leí", su propio castigo de espera y
 * su propia línea en el log.
 */
export function configDeReloj(config, reloj) {
  return {
    dispositivo: reloj.dispositivo,
    host: reloj.host,
    usuario: reloj.usuario,
    clave: reloj.clave,
    base: config.base,
    secret: config.secret,
    ventanaDias: config.ventanaDias,
    ventanaRecuperacionDias: config.ventanaRecuperacionDias,
    piso: config.piso,
    version: config.version,
  };
}

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
    // 🔑 El nombre de cada reloj tiene que ser EXACTAMENTE el que ya está
    // guardado en las marcaciones. Otro nombre = el índice único no reconoce
    // nada y se vuelve a insertar la historia entera: horas al doble.
    relojes: armarRelojes(env),
    base: normalizarBase(env.FASHIONGR_URL),
    secret: env.FASHIONGR_SECRET,
    vueltaMin: numero(env.VUELTA_MINUTOS, VUELTA_MIN_DEFAULT),
    ventanaDias: numero(env.VENTANA_DIAS, VENTANA_DIAS_DEFAULT),
    // 🔑 SIN TOCAR EL .env DE LA OFICINA. La PC ya tiene su `.env` escrito con
    // `VENTANA_DIAS=3`; esta es una variable NUEVA, así que al no estar en ese
    // archivo toma el default de 15 y la recuperación queda activa sola.
    ventanaRecuperacionDias: numero(
      env.VENTANA_RECUPERACION_DIAS,
      VENTANA_RECUPERACION_DIAS_DEFAULT,
    ),
    // Fecha (YYYY-MM-DD) antes de la cual no se pregunta nunca. Vacío = sin piso.
    piso: env.DESDE_FECHA || null,
    version: VERSION,
  };
}
