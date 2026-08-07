// ─────────────────────────────────────────────────────────────────────────────
// Autenticación Digest para el reloj Hikvision.
//
// Medido contra el equipo real (DS-K1T804AEF, firmware V1.4.1): responde
// `WWW-Authenticate: Digest qop="auth"`. NO acepta Basic. Por eso hace falta
// implementar el baile de dos pasos: primero se pide sin credenciales, el reloj
// contesta 401 con un desafío, y recién ahí se firma.
//
// Se escribe a mano y sin dependencias A PROPÓSITO: este archivo va a vivir en
// una PC de la oficina donde nadie va a correr `npm install` nunca más. Cero
// dependencias = cero mantenimiento = el programita sigue andando en dos años.
//
// Módulo PURO: no toca la red. Los tests lo prueban con el desafío textual que
// devolvió el reloj real.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, randomBytes } from "node:crypto";

const md5 = (s) => createHash("md5").update(s, "utf8").digest("hex");

/**
 * Parte el header `WWW-Authenticate` en sus pedazos.
 *
 * ⚠️ Los valores pueden venir con comillas o sin ellas según el firmware, y el
 * `nonce` de Hikvision trae `=` adentro (es base64). Por eso se corta en el
 * PRIMER `=` de cada par y no se hace `split("=")` a lo bruto: eso partiría el
 * nonce a la mitad y la firma saldría mal sin ningún mensaje de error útil.
 */
export function parseDesafio(header) {
  if (!header) return null;
  const sinPrefijo = String(header).replace(/^\s*Digest\s+/i, "");
  const salida = {};
  // Separa por comas que NO estén dentro de comillas.
  for (const trozo of sinPrefijo.match(/(?:[^,"]|"[^"]*")+/g) ?? []) {
    const i = trozo.indexOf("=");
    if (i < 0) continue;
    const clave = trozo.slice(0, i).trim().toLowerCase();
    let valor = trozo.slice(i + 1).trim();
    if (valor.startsWith('"') && valor.endsWith('"')) valor = valor.slice(1, -1);
    salida[clave] = valor;
  }
  return salida.nonce && salida.realm ? salida : null;
}

/** Un cnonce nuevo por request. No hace falta que sea criptográfico, pero sale
 *  gratis y evita que dos vueltas seguidas firmen igual. */
export const nuevoCnonce = () => randomBytes(8).toString("hex");

/**
 * Arma el header `Authorization`. Solo implementa `qop="auth"` con MD5, que es
 * lo que contesta este reloj; si algún día contestara `auth-int` o SHA-256 se
 * vería acá y no en un 401 sin explicación.
 */
export function construirAutorizacion({ desafio, usuario, clave, metodo, uri, nc = 1, cnonce }) {
  const { realm, nonce, qop, opaque, algorithm } = desafio;
  const ha1 = md5(`${usuario}:${realm}:${clave}`);
  const ha2 = md5(`${metodo}:${uri}`);
  const ncHex = String(nc).padStart(8, "0");
  const cn = cnonce ?? nuevoCnonce();

  // Sin qop el esquema es el viejo (RFC 2069). Se soporta por si un firmware
  // distinto lo usa: son dos líneas y evita un fallo total.
  const respuesta = qop
    ? md5(`${ha1}:${nonce}:${ncHex}:${cn}:${qop.includes("auth") ? "auth" : qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);

  const partes = [
    `username="${usuario}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${respuesta}"`,
  ];
  if (algorithm) partes.push(`algorithm=${algorithm}`);
  if (qop) partes.push(`qop=auth`, `nc=${ncHex}`, `cnonce="${cn}"`);
  if (opaque) partes.push(`opaque="${opaque}"`);
  return `Digest ${partes.join(", ")}`;
}

/**
 * Un cliente que se acuerda del desafío entre llamadas.
 *
 * 🩸 Sin esto, cada página de la paginación pagaría un 401 extra: 371 eventos
 * en páginas de 30 son 13 requests, o sea 26 con el baile completo. Guardando
 * el desafío se hace UNA vez y después solo sube el contador `nc`.
 *
 * Si el nonce se vence (el reloj contesta 401 otra vez), se rehace el baile una
 * sola vez y se reintenta. Un segundo 401 ya es credencial mala, y ahí sí se
 * dice claro: "usuario o contraseña del reloj incorrectos".
 */
export function crearClienteDigest({ usuario, clave, fetchImpl = fetch, timeoutMs = 20_000 }) {
  let desafio = null;
  let nc = 0;

  async function pedir(url, opciones = {}) {
    const metodo = opciones.method ?? "GET";
    const uri = new URL(url).pathname + new URL(url).search;
    const base = {
      ...opciones,
      signal: opciones.signal ?? AbortSignal.timeout(timeoutMs),
    };

    if (desafio) {
      nc += 1;
      const r = await fetchImpl(url, {
        ...base,
        headers: {
          ...(opciones.headers ?? {}),
          Authorization: construirAutorizacion({ desafio, usuario, clave, metodo, uri, nc }),
        },
      });
      if (r.status !== 401) return r;
      desafio = null; // nonce vencido: se rehace el baile abajo
      nc = 0;
    }

    // Paso 1: sin credenciales, para que el reloj mande el desafío.
    const primera = await fetchImpl(url, base);
    if (primera.status !== 401) return primera;

    desafio = parseDesafio(
      primera.headers.get("www-authenticate") ?? primera.headers.get("WWW-Authenticate"),
    );
    if (!desafio) {
      throw new Error("El reloj pidió autenticación pero no se entendió el desafío (WWW-Authenticate).");
    }

    // Paso 2: firmado.
    nc = 1;
    const segunda = await fetchImpl(url, {
      ...base,
      headers: {
        ...(opciones.headers ?? {}),
        Authorization: construirAutorizacion({ desafio, usuario, clave, metodo, uri, nc }),
      },
    });
    if (segunda.status === 401) {
      desafio = null;
      throw new Error("Usuario o contraseña del reloj incorrectos (401).");
    }
    return segunda;
  }

  return { pedir };
}
