// ─────────────────────────────────────────────────────────────────────────────
// EL ÚNICO PUNTO DEL SISTEMA QUE LE PREGUNTA A GOOGLE «¿QUÉ LUGAR ES ESTE?».
//
// Se usa para una sola cosa: decir en palabras dónde estaba la persona cuando
// marcó («City Mall David», «Vía Interamericana, David»). Daniel, 25-sep-2026:
// *«Todos salen de la tienda, para eso es la app»* — las cinco personas que
// marcan por teléfono trabajan fuera de un local propio, así que **toda** marca
// del teléfono pasa por acá una vez.
//
// 🔴 SE PREFIERE EL NOMBRE DEL LUGAR ANTES QUE LA CALLE. De lo que contesta
// Google se busca primero un resultado de tipo NEGOCIO o CENTRO COMERCIAL
// («City Mall David»); solo si no hay ninguno se usa la dirección
// («Vía Interamericana, David»). Es lo que Daniel va a leer de un vistazo.
//
// 🔴 UN SOLO PUNTO DE LLAMADA, como el lector de facturas con Anthropic
// (`src/lib/ia/anthropic.ts`). Nadie más llama al servicio de mapas: si algún
// día cambia el proveedor, el precio o la forma de autenticarse, se cambia acá.
//
// 🔴 FALLA ABIERTA Y NUNCA LANZA. Sin `GOOGLE_MAPS_API_KEY`, con la llave
// vencida, sin red o con una respuesta que no se entiende, devuelve `null` y la
// pantalla escribe «—». Que no se sepa la calle no puede romper la pantalla de
// asistencia ni frenar una marca.
//
// 🔴 SE PREGUNTA UNA VEZ POR MARCA Y SE GUARDA. La respuesta cae en
// `asistencia_marcaciones.lugar_texto` y no se vuelve a preguntar nunca. Sin
// esa columna (migración `20261220120000_asistencia_lugar_y_aparato.sql` sin
// correr) la respuesta se pierde y se volvería a preguntar en la marca
// siguiente: es plata, no un defecto de datos.
//
// 💵 LO QUE CUESTA, dicho para que nadie se sorprenda: Google Geocoding cobra
// **≈ US$5 por cada 1.000 consultas**. Preguntando por TODA marca del teléfono
// —cinco personas × cuatro marcas al día— son unas **20 consultas por día**,
// ≈ 520 al mes: **≈ US$2,60**. La cuenta de Google regala US$200 al mes de
// crédito, así que hoy no se paga nada.
//
// 🔴 Y SE LE PONE UN TOPE A LA LLAVE, para que un defecto no se vuelva una
// factura: en Google Cloud → APIs & Services → **Geocoding API** → pestaña
// **Quotas & System Limits** → «Requests per day» se baja a **200** (diez veces
// lo que se usa, y lejos de cualquier sorpresa). Pasado el tope Google contesta
// `OVER_QUERY_LIMIT`, esto devuelve `null` y la pantalla dice «—»: se pierde el
// nombre del lugar de ese día, nunca una marca.
//
// 🔑 LA LLAVE NO EXISTE TODAVÍA (25-sep-2026). Hay que crear una en Google
// Cloud → APIs & Services → Credentials, con la **Geocoding API** habilitada, y
// cargarla en Vercel como `GOOGLE_MAPS_API_KEY` (Production). Hasta que exista,
// esto devuelve `null` y la columna «Lugar» dice «—» (o solo la distancia, si
// la empresa tiene punto de referencia).
// ⚠️ La llave NUNCA se escribe en el código ni viaja al navegador: esta función
// corre solo en el servidor (no lleva `NEXT_PUBLIC_`).
// ─────────────────────────────────────────────────────────────────────────────

/** ¿Hay con qué preguntar? Se contesta sin llamar a nadie. */
export function hayLlaveDeMapas(): boolean {
  return String(process.env.GOOGLE_MAPS_API_KEY ?? "").trim() !== "";
}

/** Cuánto se espera a Google antes de dejarlo por imposible. */
const TIMEOUT_MS = 5_000;

/** Idioma y región: las direcciones de Panamá, en español. */
const IDIOMA = "es";
const REGION = "pa";

/**
 * 🔴 LOS TIPOS QUE CUENTAN COMO «UN LUGAR CON NOMBRE». Google los devuelve en
 * `types[]` de cada resultado. Si alguno de los resultados trae uno de estos, su
 * dirección empieza con el NOMBRE del sitio («City Mall, Vía…»), que es lo que
 * hace falta. Si ninguno lo trae, se cae a la calle, que es honesto.
 */
const TIPOS_CON_NOMBRE = [
  "shopping_mall",
  "establishment",
  "point_of_interest",
  "store",
  "premise",
] as const;

/**
 * Recorta la dirección a lo que se lee de un vistazo. Google devuelve cosas
 * como «Vía Interamericana, David, Provincia de Chiriquí, Panamá»: el país
 * sobra —todo esto pasa en Panamá— y la provincia casi siempre también.
 * Se dejan los DOS primeros tramos.
 */
export function direccionCorta(formatted: string | null | undefined): string {
  const partes = String(formatted ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^panam(á|a)$/i.test(p));
  if (partes.length === 0) return "";
  return partes.slice(0, 2).join(", ");
}

interface ResultadoGoogle {
  formatted_address?: string;
  types?: string[];
}

interface RespuestaGoogle {
  status?: string;
  results?: ResultadoGoogle[];
}

/**
 * PURO. De lo que contestó Google, el texto que se va a guardar: el primer
 * resultado que sea un lugar CON NOMBRE y, si no hay ninguno, el primero de
 * todos. Devuelve `""` cuando no hay nada usable.
 */
export function mejorLugar(resultados: readonly ResultadoGoogle[] | undefined): string {
  const lista = resultados ?? [];
  const conNombre = lista.find((r) =>
    (r.types ?? []).some((t) => (TIPOS_CON_NOMBRE as readonly string[]).includes(t)),
  );
  return direccionCorta((conNombre ?? lista[0])?.formatted_address);
}

/**
 * El nombre del lugar de una coordenada, o `null`.
 *
 * ⚠️ NUNCA LANZA. Todo error —sin llave, red caída, `REQUEST_DENIED`,
 * `OVER_QUERY_LIMIT`, una respuesta que no se entiende— sale como `null`.
 */
export async function direccionDeCoordenada(
  lat: number,
  lng: number,
): Promise<string | null> {
  const llave = String(process.env.GOOGLE_MAPS_API_KEY ?? "").trim();
  if (!llave) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const url =
    "https://maps.googleapis.com/maps/api/geocode/json" +
    `?latlng=${encodeURIComponent(`${lat},${lng}`)}` +
    `&language=${IDIOMA}&region=${REGION}&key=${encodeURIComponent(llave)}`;

  try {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);
    let cuerpo: RespuestaGoogle;
    try {
      const r = await fetch(url, { signal: control.signal, cache: "no-store" });
      if (!r.ok) return null;
      cuerpo = (await r.json()) as RespuestaGoogle;
    } finally {
      clearTimeout(reloj);
    }

    if (cuerpo.status !== "OK") {
      // Se anota en el registro del servidor y se sigue: el estado de Google
      // dice si la llave está mal o si se pasó la cuota, y eso lo mira quien
      // programa, no quien abre la pantalla.
      if (cuerpo.status && cuerpo.status !== "ZERO_RESULTS") {
        console.warn(`[geocoding] Google contestó ${cuerpo.status}`);
      }
      return null;
    }

    const texto = mejorLugar(cuerpo.results);
    return texto || null;
  } catch {
    return null;
  }
}
