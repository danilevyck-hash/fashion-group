// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE DICE DÓNDE MARCÓ CADA QUIEN (25-sep-2026).
//
// 🔴 LA REGLA SALIÓ DE UNA FRASE DE DANIEL: *«Todos salen de la tienda, para eso
// es la app»*. Las cinco personas que marcan por teléfono **no tienen un local
// propio**: Ana, Cindy y Yeisibeth son impulsadoras en tiendas de clientes (hoy
// City Mall David) y Ángel y Rodrigo van adonde toque. O sea que «¿está en su
// tienda?» era la pregunta equivocada. La buena es **en qué lugar estaba**:
//
//     City Mall David
//     Vía Interamericana, David · a 46,7 km
//
// 🔴 EL NOMBRE DEL LUGAR ES LO PRINCIPAL, Y SALE DEL SERVICIO DE MAPAS. Se le
// pregunta UNA vez por marca —el negocio o centro comercial si lo hay, y si no
// la dirección en palabras—, se guarda en `asistencia_marcaciones.lugar_texto` y
// no se vuelve a preguntar nunca.
//
// 🔴 LA DISTANCIA ES UN DATO SECUNDARIO Y OPCIONAL. Solo se agrega cuando la
// empresa tiene un punto de referencia cargado (`asistencia_lugares_referencia`)
// **y** la marca cayó fuera de su radio. Sin referencia no se dice ninguna
// distancia: no hay contra qué medir, y un «a N km» de un punto arbitrario sería
// un número que no significa nada.
//
// 🔴 FALLA ABIERTA, SIEMPRE. Sin coordenada, sin llave del servicio de mapas o
// sin fila de referencia, la celda dice «—» o dice menos, nunca algo inventado.
//
// ⚠️ ESTE MÓDULO ES PURO: no lee la base, no llama a nadie, no sabe qué hora es.
// Quien lo usa le pasa la marca y la referencia ya leídas.
// ─────────────────────────────────────────────────────────────────────────────

/** Un punto de referencia, tal como vive en `asistencia_lugares_referencia`. */
export interface LugarReferencia {
  empresa_key: string;
  nombre: string;
  lat: number;
  lng: number;
  /** Metros dentro de los cuales NO se dice ninguna distancia. */
  radio_m: number;
}

/** Lo que hace falta de una marca para decir dónde fue. */
export interface MarcaConUbicacion {
  lat?: number | null;
  lng?: number | null;
  /** El nombre del lugar, si ya se preguntó alguna vez. */
  lugar_texto?: string | null;
}

/** Lo que se escribe cuando no se sabe. Una raya, nunca un cero ni un invento. */
export const SIN_LUGAR = "—";

/** Radio por omisión, el mismo que el DEFAULT de la columna. */
export const RADIO_REFERENCIA_M = 200;

export interface LugarDeMarca {
  /** Lo que se dibuja en la celda o en la tarjeta. */
  texto: string;
  /** Cayó dentro del radio de la referencia de su empresa. */
  cercaDeLaReferencia: boolean;
  /** Metros hasta la referencia. `null` cuando no hay contra qué medir. */
  metros: number | null;
  /**
   * Hace falta preguntarle el lugar al servicio de mapas. Es `true` para toda
   * marca con coordenada que todavía no tiene `lugar_texto` guardado — donde
   * sea que haya caído.
   */
  pideDireccion: boolean;
}

const RADIO_TIERRA_M = 6_371_000;
const aRadianes = (g: number): number => (g * Math.PI) / 180;

/**
 * Metros en línea recta entre dos puntos (haversine). La Tierra como esfera
 * alcanza de sobra: acá la pregunta es «¿está cerca o está lejos?», no medir un
 * terreno.
 */
export function distanciaMetros(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
): number {
  const dLat = aRadianes(latB - latA);
  const dLng = aRadianes(lngB - lngA);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(latA)) * Math.cos(aRadianes(latB)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Cuánto hay, en palabras. Bajo el kilómetro se dice en metros redondeados a la
 * decena: «a 350 m» se entiende de un vistazo y «a 0,3 km» no. De ahí para
 * arriba, kilómetros con un decimal y **coma**, como se escriben acá.
 */
export function distanciaEnPalabras(metros: number): string {
  if (metros < 1000) {
    const m = Math.max(10, Math.round(metros / 10) * 10);
    return `a ${m} m`;
  }
  const km = (metros / 1000).toFixed(1).replace(".", ",");
  return `a ${km} km`;
}

const hayNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const limpio = (v: string | null | undefined): string => String(v ?? "").trim();

/**
 * Dónde fue esta marca, en una línea.
 *
 * Los cuatro casos, y ninguno inventa nada:
 *   1. sin coordenada                     → «—», y no se pregunta nada.
 *   2. con lugar, sin referencia          → «City Mall David».
 *   3. con lugar, dentro del radio        → «City Mall David» (sin distancia).
 *   4. con lugar, fuera del radio         → «Vía Interamericana, David · a 46,7 km».
 *
 * Y si el lugar todavía no se preguntó, sale lo que se sepa: la distancia sola,
 * o «—». Nunca una calle inventada.
 */
export function lugarDeMarca(
  marca: MarcaConUbicacion,
  referencia: LugarReferencia | null | undefined,
): LugarDeMarca {
  const lugar = limpio(marca.lugar_texto);

  if (!hayNumero(marca.lat) || !hayNumero(marca.lng)) {
    return { texto: SIN_LUGAR, cercaDeLaReferencia: false, metros: null, pideDireccion: false };
  }

  // 🔴 TODA marca con coordenada quiere su nombre de lugar, esté donde esté.
  const pideDireccion = lugar === "";

  if (!referencia || !hayNumero(referencia.lat) || !hayNumero(referencia.lng)) {
    return {
      texto: lugar || SIN_LUGAR,
      cercaDeLaReferencia: false,
      metros: null,
      pideDireccion,
    };
  }

  const metros = distanciaMetros(marca.lat, marca.lng, referencia.lat, referencia.lng);
  const radio =
    hayNumero(referencia.radio_m) && referencia.radio_m > 0 ? referencia.radio_m : RADIO_REFERENCIA_M;
  const cerca = metros <= radio;

  if (cerca) {
    return { texto: lugar || SIN_LUGAR, cercaDeLaReferencia: true, metros, pideDireccion };
  }

  const lejos = distanciaEnPalabras(metros);
  return {
    texto: lugar ? `${lugar} · ${lejos}` : lejos,
    cercaDeLaReferencia: false,
    metros,
    pideDireccion,
  };
}

/**
 * La referencia que le toca a una marca: la de la EMPRESA de su ficha. Se busca
 * en el mapa ya leído; sin fila, `null` y la marca sale sin distancia.
 */
export function referenciaDeLaEmpresa(
  empresaKey: string | null | undefined,
  referencias: ReadonlyMap<string, LugarReferencia> | null | undefined,
): LugarReferencia | null {
  const k = limpio(empresaKey);
  if (!k || !referencias) return null;
  return referencias.get(k) ?? null;
}
