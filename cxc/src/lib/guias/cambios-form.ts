// ─────────────────────────────────────────────────────────────────────────────
// ¿DE VERDAD CAMBIÓ ALGO EN EL FORMULARIO DE UNA GUÍA?  (módulo PURO)
//
// 🩸 POR QUÉ EXISTE. Hasta el 17-ago-2026 el formulario decidía que estaba
// "sucio" contando cuántas veces había corrido un `useEffect`
// (`changeCount.current > 1`). Eso NO mide que alguien haya cambiado algo: mide
// que el efecto corrió dos veces, y corre dos veces por motivos que no tienen
// nada que ver con el usuario (los datos de la guía terminan de cargar, React
// vuelve a montar el componente, la identidad del router cambia). Resultado
// medido: **abrir `/guias/[id]/editar` disparaba solo un `PUT /api/guias/[id]`**,
// y ese PUT manda `items`, que en el servidor es un REEMPLAZO COMPLETO — borra
// los renglones e inserta otros nuevos, o sea que abrir la pantalla y
// arrepentirse ya le había cambiado el id a cada línea.
//
// 🔑 LA REGLA DE ACÁ: "cambió" = **lo que se le mandaría al servidor es
// distinto de lo último que el servidor ya tiene**. Nada de contar renders.
// Por eso la instantánea se arma con EXACTAMENTE los campos que el PUT escribe,
// en el mismo orden, y con la misma normalización que usa `saveGuia` al armar
// el cuerpo. Si acá se comparara un campo que el PUT no manda, la pantalla
// diría "sin guardar" para siempre; si faltara uno que sí manda, un cambio real
// se perdería en silencio — que es el error caro.
//
// ⚠️ ANTE LA DUDA, CAMBIÓ. `hayCambios` sin instantánea de referencia devuelve
// `false` (todavía no se sabe qué se cargó, y no se puede afirmar un cambio),
// pero cualquier diferencia de texto cuenta como cambio: no hay "parecidos", ni
// tolerancias, ni campos que se ignoren.
// ─────────────────────────────────────────────────────────────────────────────

/** Un renglón, reducido a lo que el PUT de verdad escribe en `guia_items`. */
export interface RenglonComparable {
  cliente?: string | null;
  cliente_codigo?: string | null;
  direccion?: string | null;
  empresa?: string | null;
  facturas?: string | null;
  bultos?: number | null;
  numero_guia_transp?: string | null;
}

/** La cabecera, reducida a lo que el PUT de verdad escribe en `guia_transporte`. */
export interface CabeceraComparable {
  fecha?: string | null;
  modoEntrega?: string | null;
  transportistaId?: string | null;
  entregadoPor?: string | null;
  observaciones?: string | null;
  numeroGuiaTransp?: string | null;
}

export interface InstantaneaGuia {
  /** La guía entera: cabecera + renglones. */
  todo: string;
  /** Solo los renglones — para no mandar `items` cuando NO se tocó ninguno. */
  renglones: string;
}

function texto(v: string | null | undefined): string {
  // `null`, `undefined` y `""` son EL MISMO estado para el PUT (escribe `""` o
  // `null` según la columna), así que tienen que dar la misma instantánea. Si no,
  // una guía cargada con `cliente_codigo: null` se leería como distinta de la
  // misma guía con `""` en el formulario, y el formulario nacería sucio.
  return v == null ? "" : String(v);
}

function numero(v: number | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Una fila del formulario cuenta si tiene ALGO escrito. Es el MISMO filtro que
 * aplica `saveGuia` antes de mandar (`validItems`): las filas vacías no viajan,
 * así que agregar o quitar una fila vacía no puede contar como cambio — el
 * servidor recibiría lo mismo.
 */
export function renglonTieneAlgo(r: RenglonComparable): boolean {
  return Boolean(texto(r.cliente) || texto(r.direccion) || texto(r.facturas) || numero(r.bultos) > 0);
}

/** Los renglones que SÍ viajan, en su orden, reducidos a lo que el PUT escribe. */
export function instantaneaRenglones(items: readonly RenglonComparable[]): string {
  return JSON.stringify(
    items.filter(renglonTieneAlgo).map((r) => [
      texto(r.cliente),
      texto(r.cliente_codigo),
      texto(r.direccion),
      texto(r.empresa),
      texto(r.facturas),
      numero(r.bultos),
      texto(r.numero_guia_transp),
    ]),
  );
}

/** La cabecera, reducida a lo que el PUT escribe. */
export function instantaneaCabecera(c: CabeceraComparable): string {
  return JSON.stringify([
    texto(c.fecha),
    texto(c.modoEntrega),
    // El PUT manda `transportista_id: null` cuando el modo es entrega directa,
    // así que el transportista que quedó guardado en el formulario no cuenta
    // mientras el modo sea directo: mandarlo o no da el MISMO renglón en la base.
    c.modoEntrega === "transportista" ? texto(c.transportistaId) : "",
    texto(c.entregadoPor),
    texto(c.observaciones),
    // `numero_guia_transp` viaja como `.trim() || null`.
    texto(c.numeroGuiaTransp).trim(),
  ]);
}

/** Cabecera + renglones, listo para comparar contra lo último guardado. */
export function instantaneaGuia(
  cabecera: CabeceraComparable,
  items: readonly RenglonComparable[],
): InstantaneaGuia {
  const renglones = instantaneaRenglones(items);
  return { todo: `${instantaneaCabecera(cabecera)}|${renglones}`, renglones };
}

/**
 * ¿Hay algo sin guardar?
 *
 * `guardado === null` = todavía no se sabe qué se cargó → **no se afirma un
 * cambio**. Es la mitad que arregla el bug: mientras no haya una referencia de
 * lo que el servidor ya tiene, el formulario NO puede declararse sucio, y sin
 * sucio no hay autoguardado.
 */
export function hayCambios(guardado: InstantaneaGuia | null, actual: InstantaneaGuia): boolean {
  if (!guardado) return false;
  return guardado.todo !== actual.todo;
}

/**
 * ¿Cambió algún RENGLÓN? Solo si esto es `true` viaja `items` en el PUT.
 *
 * 🔴 `items` es un reemplazo completo: borra las filas de `guia_items` e inserta
 * otras nuevas, con ids nuevos. Cambiar la fecha o las observaciones no puede
 * costar el id de cada línea. Ante la duda —sin referencia de lo guardado— se
 * manda: perder un renglón es peor que reescribirlo igual.
 */
export function renglonesCambiaron(guardado: InstantaneaGuia | null, actual: InstantaneaGuia): boolean {
  if (!guardado) return true;
  return guardado.renglones !== actual.renglones;
}
