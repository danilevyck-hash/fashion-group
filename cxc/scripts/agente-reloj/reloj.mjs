// ─────────────────────────────────────────────────────────────────────────────
// Preguntarle al reloj por las marcaciones de un rango de fechas.
//
// Endpoint (medido contra el equipo real, DS-K1T804AEF firmware V1.4.1):
//   POST /ISAPI/AccessControl/AcsEvent?format=json
//   { "AcsEventCond": { searchID, searchResultPosition, maxResults,
//                       major: 5, minor: 0, startTime, endTime } }
//
// `major: 5` = eventos de control de acceso; `minor: 0` = todos los subtipos.
// ─────────────────────────────────────────────────────────────────────────────

import { randomBytes } from "node:crypto";
import { crearClienteDigest } from "./digest.mjs";

/**
 * 🩸 EL `searchID` NO PUEDE PASAR DE 20 CARACTERES — medido contra el equipo
 * real el 7-ago-2026, largo por largo: 1, 4, 8, 16 y **20 responden 200; 21 en
 * adelante responden 400** `badParameters`. No son los guiones (un `"abc-def"`
 * de 7 pasa): es puro largo.
 *
 * Acá se usaba `randomUUID()`, que mide **36**. O sea que el agente NUNCA pudo
 * traer una marcación: autenticaba bien, y la primera búsqueda moría con un
 * `400` que solo decía "badParameters" sin nombrar el campo. Se veía como un
 * problema de permisos o de firmware.
 *
 * 16 caracteres hexadecimales (8 bytes al azar) dejan 4 de margen y siguen
 * siendo irrepetibles de sobra: lo único que tienen que hacer es no chocar
 * entre dos búsquedas del mismo aparato, que corren de a una.
 */
const LARGO_MAX_SEARCH_ID = 20;
const nuevoSearchID = () => randomBytes(8).toString("hex"); // 16 caracteres

/**
 * Lo que el reloj dice que estuvo mal, para pegarlo al mensaje de error.
 * Devuelve "" si no se puede leer — el error principal nunca se pierde por
 * culpa de esta ayuda.
 */
export async function motivoDelReloj(res) {
  try {
    const t = (await res.text()).trim();
    if (!t) return "";
    try {
      const j = JSON.parse(t);
      const partes = [j.statusString, j.subStatusCode].filter(Boolean);
      if (partes.length) return ` El reloj dice: ${partes.join(" / ")}.`;
    } catch {
      /* no era JSON: se manda un pedacito crudo, que es mejor que nada */
    }
    return ` El reloj dice: ${t.replace(/\s+/g, " ").slice(0, 160)}`;
  } catch {
    return "";
  }
}

/**
 * Cuántos eventos se PIDEN por página.
 *
 * ⚠️ El firmware devuelve **10 pase lo que pase** — medido pidiendo 10, 30, 50
 * y 100: las cuatro veces devolvió 10. No es un problema: la paginación avanza
 * con lo que el reloj DEVOLVIÓ (`numOfMatches`), no con lo que se pidió, así
 * que traer un día entero solo cuesta más vueltas. Se deja en 30 para que el
 * día que un firmware nuevo respete el pedido, mejore solo.
 */
export const POR_PAGINA = 30;

/** Freno de mano. Un día muy movido tuvo 371 eventos (13 páginas); julio entero
 *  fueron 8.785 (~300 páginas). 3.000 páginas es imposible de alcanzar por las
 *  buenas: si se llega ahí es que el reloj está devolviendo siempre lo mismo y
 *  hay que salir en vez de girar para siempre. */
const MAX_PAGINAS = 3000;

/**
 * 🩸 LA TRAMPA DE LA PAGINACIÓN, QUE YA COSTÓ UNA MEDICIÓN MAL HECHA.
 *
 * Hay TRES cosas que hay que hacer bien a la vez, y fallar en cualquiera de las
 * tres devuelve un número que parece correcto:
 *
 *   1. MANTENER EL MISMO `searchID` en todas las páginas. Es el identificador
 *      de LA BÚSQUEDA, no de la página. Cambiándolo, cada request abre una
 *      búsqueda nueva y `searchResultPosition` deja de significar nada.
 *
 *   2. AVANZAR `searchResultPosition` con lo que el reloj DEVOLVIÓ, no con lo
 *      que se pidió. Si una página trae 28 en vez de 30, sumar 30 se salta 2
 *      eventos — dos marcaciones que nunca van a aparecer y nadie va a extrañar.
 *
 *   3. CORTAR CONTRA `totalMatches`, NUNCA contra `responseStatusStrg`.
 *      Fiarse de que `responseStatusStrg === "MORE"` significa "hay más" CORTA
 *      ANTES DE TIEMPO: se trajeron **40 eventos de un día que tenía 371**. El
 *      firmware manda "OK" en páginas intermedias. `totalMatches` es el único
 *      campo que dice la verdad.
 *
 * Este test existe justamente por eso: `agente-reloj.test.ts` reproduce el día
 * de los 371 y falla si alguien vuelve a mirar `responseStatusStrg`.
 */
export async function traerEventos({
  host,
  usuario,
  clave,
  desde,
  hasta,
  porPagina = POR_PAGINA,
  fetchImpl = fetch,
  log = () => {},
  timeoutMs = 20_000,
}) {
  const cliente = crearClienteDigest({ usuario, clave, fetchImpl, timeoutMs });
  const url = `${host.replace(/\/+$/, "")}/ISAPI/AccessControl/AcsEvent?format=json`;

  // Punto 1: UNO para toda la búsqueda. Y corto — ver `nuevoSearchID`.
  const searchID = nuevoSearchID();

  const eventos = [];
  let posicion = 0;
  let total = null;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const cuerpo = {
      AcsEventCond: {
        searchID,
        searchResultPosition: posicion,
        maxResults: porPagina,
        major: 5,
        minor: 0,
        startTime: desde,
        endTime: hasta,
      },
    };

    const res = await cliente.pedir(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });

    if (!res.ok) {
      // 🩸 El motivo del propio reloj VIAJA EN EL MENSAJE. Sin esto, el `400`
      // del `searchID` largo se leyó como "el reloj no responde" y mandó a
      // revisar contraseñas y permisos: el aparato SÍ decía `badParameters`,
      // pero el agente lo tiraba a la basura antes de que nadie lo viera.
      throw new Error(
        `El reloj respondió ${res.status} al pedir las marcaciones.${await motivoDelReloj(res)}`,
      );
    }

    const json = await res.json();
    const acs = json?.AcsEvent ?? {};
    const lista = Array.isArray(acs.InfoList) ? acs.InfoList : [];

    if (total === null) {
      total = Number.isFinite(Number(acs.totalMatches)) ? Number(acs.totalMatches) : null;
      log(`El reloj dice que hay ${total ?? "?"} eventos entre ${desde} y ${hasta}.`);
    }

    eventos.push(...lista);

    // Punto 2: avanzar con lo devuelto. `numOfMatches` es lo que el firmware
    // dice haber mandado; si no viniera, se cuenta la lista de verdad.
    const devueltos = Number.isFinite(Number(acs.numOfMatches))
      ? Number(acs.numOfMatches)
      : lista.length;
    posicion += devueltos > 0 ? devueltos : lista.length;

    // Corte A — una página vacía. Es la única señal que no puede mentir: si el
    // reloj no manda nada, no hay nada más que traer. Va primero porque también
    // es el freno contra un `totalMatches` inflado que haría girar sin fin.
    if (lista.length === 0) break;

    // Punto 3 / Corte B — contra el total. Nunca contra `responseStatusStrg`.
    if (total !== null && posicion >= total) break;

    // Corte C — sin `totalMatches` (firmware raro): se sigue mientras las
    // páginas vengan llenas. Una página corta es la última.
    if (total === null && lista.length < porPagina) break;
  }

  log(`Traídos ${eventos.length} eventos.`);
  return { eventos, totalSegunReloj: total };
}

/**
 * Un ping barato para saber si el reloj está vivo antes de hacer nada más.
 * Sirve para que el mensaje de error diga "el reloj no contesta" en vez de
 * "falló la búsqueda", que es lo que uno necesita leer a las 7 de la mañana.
 */
export async function relojVivo({ host, usuario, clave, fetchImpl = fetch, timeoutMs = 10_000 }) {
  const cliente = crearClienteDigest({ usuario, clave, fetchImpl, timeoutMs });
  const url = `${host.replace(/\/+$/, "")}/ISAPI/System/deviceInfo?format=json`;
  const res = await cliente.pedir(url, { method: "GET" });
  return res.ok;
}
