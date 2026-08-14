// ─────────────────────────────────────────────────────────────────────────────
// ¿ESTE UPDATE ESCRIBIRÍA EXACTAMENTE LO QUE YA ESTÁ? — módulo PURO.
//
// 🩸 POR QUÉ EXISTE (14-ago-2026). El sync de Tommy medía **107 s en producción**
// y ~50 de esos son sus **455 UPDATE de a uno** contra Supabase (medido con
// `?dryRun=1`, que corre el motor entero contra Switch y no escribe: la resta
// `corrida real − dryRun` ES el costo de las escrituras). Medido el mismo día:
// de **497 productos de Tommy solo cambiaron 54 campos**, todos de
// `disponibilidad`. O sea que ~90% de los UPDATE le escriben a la base el mismo
// valor que ya tenía.
//
// ⛔ **LO QUE ESTE MÓDULO NO HACE, Y ES LA MITAD DE POR QUÉ SE PUDO HACER.**
// Daniel lo autorizó con una condición textual: *"solo si no me daña nada"*. En
// ese write path viven la FOTO (`image_url`), el nombre editado
// (`nombre_manual`), la etiqueta (`badge`), el "ocultar" (`oculto_manual`) y el
// bulto (`bulto_pzas`) — trabajo hecho A MANO que **no vuelve de Switch si se
// pierde** (389 fotos de Tommy subidas una por una). Así que:
//   · NO se agrupan las escrituras en lotes (un `upsert` mal armado se lleva
//     puestas las fotos de 490 productos);
//   · NO cambia QUÉ columnas escribe un UPDATE ni con qué valores;
//   · NO se reordena el write path.
// **Lo único que cambia es CUÁNTAS escrituras se hacen**: la que guardaría
// exactamente el mismo valor que ya está, no se hace. Un UPDATE que no ocurre
// no puede pisar una foto.
//
// 🩸 EL RIESGO REAL DE ESTE CAMINO NO ES ESCRIBIR DE MÁS: ES NO ESCRIBIR NUNCA.
// Si la comparación se equivoca diciendo "igual" cuando no lo es, se saltea la
// actualización y **el catálogo se congela sin un solo error** — el "cero
// silencioso" que este repo ya pagó (sync-utilidad, barrido de páginas del
// #498). Por eso este módulo está escrito con UNA regla por encima de todas:
//
//   🔴 `campoIgual` devuelve `true` SOLO cuando puede PROBAR la igualdad.
//      Ante cualquier duda —tipo inesperado, columna que no está declarada,
//      columna que no se leyó— devuelve `false` y se escribe, que es
//      exactamente lo que se hacía ayer. El peor caso de un "false" de más es
//      una escritura de más; el peor caso de un "true" de más es un catálogo
//      congelado.
//
// Y el peor caso del acierto también es benigno: si por lo que sea se saltea
// una actualización que hacía falta, los 4 catálogos sincronizan **4×/día** y la
// corrida siguiente la agarra. No existe un camino donde esto borre una foto,
// porque no cambia lo que hace una escritura.
//
// COMPARACIÓN POR TIPO EXPLÍCITO, no `==` ni `JSON.stringify`. Los pares que
// engañan están todos en el test (`catalogo-igualdad.test.ts`): `0` vs `"0.00"`
// (iguales: es la misma plata), `null` vs `""` (DISTINTOS: uno es "sin dato" y
// el otro es un texto vacío), `"10"` vs `10` (iguales en un entero, porque
// PostgREST puede devolver el número de las dos formas), `"UNICA "` vs `"UNICA"`
// (DISTINTOS: el write path escribe el texto tal cual y ese espacio es un cambio
// real).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tipo de cada columna que el UPDATE del catálogo puede escribir. Es EXPLÍCITO
 * y por columna a propósito: el comparador no adivina por el `typeof` del valor
 * que llega, porque el mismo `"10"` significa cosas distintas en un entero y en
 * un texto.
 */
export type TipoCampo = "entero" | "monto" | "texto" | "booleano";

/**
 * Las columnas que los 4 catálogos escriben en el UPDATE, con el tipo REAL de la
 * base (verificado en las migraciones, no supuesto):
 *
 *   price          numeric(10,2)  →  monto      (20260724150000, joybees, products)
 *   name           text NOT NULL  →  texto
 *   active         boolean        →  booleano
 *   existencia     int            →  entero     (20260624120000 / 20260629140000)
 *   disponibilidad int            →  entero
 *   stock          int NOT NULL   →  entero     (joybees / tommy / calvin)
 *   category       text NOT NULL  →  texto      (derive de tommy / calvin)
 *   gender         text           →  texto      (derive de tommy / calvin)
 *   bulto_pzas     smallint       →  entero     (20260806120000)
 *   codigo_barra_id bigint        →  entero     (20260704080000, reebok)
 *
 * 🔴 UNA COLUMNA QUE NO ESTÉ ACÁ NUNCA SE DA POR IGUAL. Si mañana alguien suma
 * una columna al write path y se olvida de declararla, el sync vuelve a
 * escribir siempre esa fila — o sea, el comportamiento de ayer. Nunca al revés.
 */
export const TIPOS_CAMPO_CATALOGO: Readonly<Record<string, TipoCampo>> = Object.freeze({
  price: "monto",
  name: "texto",
  active: "booleano",
  existencia: "entero",
  disponibilidad: "entero",
  stock: "entero",
  category: "texto",
  gender: "texto",
  bulto_pzas: "entero",
  codigo_barra_id: "entero",
});

const ENTERO_RE = /^[+-]?\d+$/;
const DECIMAL_RE = /^[+-]?\d+(\.\d+)?$/;

/** `"007"` → `"7"`, `"-0"` → `"0"`, `"+5"` → `"5"`. Sin `Number` de por medio:
 *  un `bigint` de la base (codigo_barra_id) no cabe en un double y compararlo
 *  como número podría dar iguales dos IDs distintos. */
function canonEntero(s: string): string {
  const negativo = s.startsWith("-");
  const digitos = s.replace(/^[+-]/, "").replace(/^0+(?=\d)/, "");
  return digitos === "0" ? "0" : (negativo ? "-" : "") + digitos;
}

/**
 * Forma canónica de un entero, o `null` si el valor no ES demostrablemente un
 * entero. PostgREST devuelve un `int` como número JSON, pero un `bigint` o un
 * `numeric` pueden llegar como string según el driver y la escala — por eso se
 * aceptan las dos formas y se comparan como TEXTO canónico, que no puede perder
 * precisión.
 */
function comoEntero(v: unknown): string | null {
  if (typeof v === "number") return Number.isSafeInteger(v) ? String(v) : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!ENTERO_RE.test(s)) return null;
    return canonEntero(s);
  }
  return null;
}

/**
 * Centavos de un monto, o `null` si no se puede afirmar que sea un monto.
 *
 * 🩸 Se hace con ARITMÉTICA DE TEXTO y no con `Math.round(n * 100)`: en coma
 * flotante `16.555 * 100` da `1655.4999999999998` y redondearía a 1655 mientras
 * `numeric(10,2)` guarda `16.56` (1656). Eso no rompería nada —diría "distinto"
 * y se escribiría, que es el lado seguro— pero dejaría al precio sin poder
 * saltearse nunca. Redondeo medio-arriba en valor absoluto, que es lo que hace
 * Postgres al guardar en `numeric(10,2)`.
 */
export function centavosDeMonto(v: unknown): number | null {
  let texto: string;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    texto = v.toFixed(6);
  } else if (typeof v === "string") {
    texto = v.trim();
  } else {
    return null;
  }
  if (!DECIMAL_RE.test(texto)) return null;
  const negativo = texto.startsWith("-");
  const sinSigno = texto.replace(/^[+-]/, "");
  const [enteraRaw, fracRaw = ""] = sinSigno.split(".");
  const frac = `${fracRaw}000`.slice(0, 3);
  // Aritmética de ENTEROS sobre los dígitos: `entera * 100` es exacto mientras
  // el resultado sea un entero seguro, y un precio que no lo sea no es un
  // precio (el guard de montos imposibles ya lo habría rechazado antes).
  let centavos = Number(enteraRaw) * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) centavos += 1; // medio arriba, en valor absoluto
  if (!Number.isSafeInteger(centavos)) return null;
  return negativo ? -centavos : centavos;
}

/**
 * ¿El valor que el sync va a escribir en `columna` es DEMOSTRABLEMENTE el mismo
 * que ya está guardado? Ante la duda, `false` (se escribe).
 */
export function campoIgual(columna: string, nuevo: unknown, actual: unknown): boolean {
  const tipo = TIPOS_CAMPO_CATALOGO[columna];
  if (!tipo) return false; // columna no declarada → no se puede afirmar nada

  // `undefined` del lado guardado = la columna NO se leyó (o no existe todavía).
  // "No la leí" jamás puede significar "es igual".
  if (actual === undefined) return false;
  // Nulo contra nulo es igual; nulo contra cualquier valor, no (y `null` NUNCA
  // es `""` ni `0`: son estados distintos y escribirlos es un cambio real).
  if (nuevo === null || actual === null) return nuevo === null && actual === null;
  if (nuevo === undefined) return false;

  switch (tipo) {
    case "entero": {
      const a = comoEntero(nuevo);
      const b = comoEntero(actual);
      return a !== null && b !== null && a === b;
    }
    case "monto": {
      const a = centavosDeMonto(nuevo);
      const b = centavosDeMonto(actual);
      return a !== null && b !== null && a === b;
    }
    case "texto":
      // Comparación EXACTA, sin trim ni mayúsculas: el write path escribe el
      // texto tal cual viene y la base lo guarda tal cual. Normalizar acá haría
      // que `"Sandals "` y `"Sandals"` se vieran iguales y el cambio real nunca
      // se escribiría.
      return typeof nuevo === "string" && typeof actual === "string" && nuevo === actual;
    case "booleano":
      return typeof nuevo === "boolean" && typeof actual === "boolean" && nuevo === actual;
  }
}

export interface ResultadoFilaIgual {
  igual: boolean;
  /** Primera columna que NO se pudo dar por igual (para depurar y para el log). */
  motivo?: string;
}

/**
 * ¿El UPDATE completo escribiría exactamente lo que ya está? Solo `true` si
 * TODAS las columnas del payload se pueden dar por iguales contra la fila leída.
 *
 * Un payload vacío devuelve `false` a propósito: un UPDATE sin columnas no
 * debería existir en este motor, y tratarlo como "igual" sería estrenar un
 * camino donde "no hay nada que comparar" se lee como "está todo bien".
 */
export function filaIgual(
  payload: Record<string, unknown>,
  actual: Record<string, unknown> | null | undefined,
): ResultadoFilaIgual {
  if (!actual) return { igual: false, motivo: "sin fila guardada" };
  const columnas = Object.keys(payload);
  if (columnas.length === 0) return { igual: false, motivo: "payload vacío" };
  for (const col of columnas) {
    const presente = Object.prototype.hasOwnProperty.call(actual, col);
    if (!presente) return { igual: false, motivo: `${col}: no se leyó de la base` };
    if (!campoIgual(col, payload[col], actual[col])) {
      return { igual: false, motivo: `${col}: ${JSON.stringify(actual[col])} → ${JSON.stringify(payload[col])}` };
    }
  }
  return { igual: true };
}

/** Contadores de una corrida, para que se vea POR CORRIDA cuánto se escribió. */
export interface ContadoresEscritura {
  /** Productos existentes que pasaron por la comparación. */
  comparados: number;
  /** UPDATE que SÍ se hicieron (algo había cambiado). */
  escrituras: number;
  /** UPDATE que se ahorraron porque el valor guardado ya era el mismo. */
  sinCambios: number;
}

/**
 * GUARD DE SANIDAD: ¿esta corrida se salteó el 100%?
 *
 * 🔴 NO FALLA CERRADO, Y ES UNA DECISIÓN, NO UN OLVIDO. Un catálogo que de
 * verdad no cambió entre dos corridas es perfectamente posible —Joybees son 83
 * artículos y las 4 pasadas del día están a 2-3 h una de otra—, así que tumbar
 * la corrida convertiría un día normal en un error diario: la alerta que suena
 * para siempre, que en esta casa ya costó dos veces. Lo que sí hace falta es que
 * NO PASE INADVERTIDO, porque "se saltea el 100% todos los días" es exactamente
 * la firma del cero silencioso. Por eso queda registrado en dos lugares que se
 * miran: `switch_sync_log.skip_details` de cada corrida (con los tres números) y
 * un `console.warn` en el log de la función.
 */
export function todoSalteado(c: ContadoresEscritura): boolean {
  return c.comparados > 0 && c.escrituras === 0;
}

/** Marca del resumen de escrituras dentro de `switch_sync_log.skip_details`.
 *  Distinta de las de `monto-guard` / `costo-sospechoso`, que leen las suyas por
 *  este mismo campo para su anti-loop y no deben confundirse. */
export const CAMPO_SKIP_ESCRITURAS = "catalogo_escrituras";

/** La fila que se guarda en `switch_sync_log.skip_details` con los contadores. */
export function detalleEscrituras(c: ContadoresEscritura): Record<string, unknown> {
  return {
    facturaId: null,
    secuencial: null,
    campo: CAMPO_SKIP_ESCRITURAS,
    valorCrudo: {
      comparados: c.comparados,
      escrituras: c.escrituras,
      sinCambios: c.sinCambios,
      todoSalteado: todoSalteado(c),
    },
  };
}
