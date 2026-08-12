// ============================================================================
// Marketing — LA MARCA ES LA UNIDAD. Un bloque = una marca.
//
// 🔑 EL MODELO, en palabras de Daniel: *"ellos facturan a mi bajo compañia
// diferentes. una por marca. cada marca tiene su encargado"*. O sea que Tommy,
// Calvin y Karl NO son tres marcas de un proveedor: son tres EMPRESAS, cada una
// con su encargado y su reporte. Cada una se cierra SOLA, con su propio botón —
// Daniel, textual (11-ago-2026): *"que sea por separado mejor no?"*. El atajo
// "Cerrar las tres" se retiró ese mismo día.
//
// 🩸 EL "PROVEEDOR" SE FUE, y no es un rename: era un concepto de más. Existía
// solo para agrupar el cierre, y el cierre agrupado ya no existe. Lo ÚNICO que
// queda de él es `CLAVE_LEGACY_POR_MARCA` (abajo): el mapeo HISTÓRICO con el
// que se escribieron los sellos viejos — 'pvh' para TH/CK/KL — y que sostiene
// el período cerrado "mid 2026" con sus $62.381,57 ya reportados. Eso NO es un
// grupo de cierre: es cómo se llama la marca en las filas que ya existen.
//
// 🔴 EL MAPA VA POR CÓDIGO, NUNCA POR NOMBRE. `mk_marcas.codigo` es único en la
// base (UNIQUE desde `marketing.sql`) y no lo edita nadie desde la pantalla; el
// `nombre` sí se cambia —`French Connection` se renombró a `Karl Lagerfeld` el
// 11-ago-2026— y atar el reparto de plata a un texto editable es atarlo a que
// nadie corrija una falta de ortografía.
//
// ⚠️ NADA de `startsWith` ni de prefijos: es el colador que ya documentó
// `multifashion/marcas-grupo.ts`. Igualdad exacta del código, en mayúsculas.
//
// 🩸 UNA MARCA QUE NO ESTÁ EN EL MAPA NO SE ESCONDE Y NO SE ADIVINA. `Otros`
// (OTR, `activo=false`) no tiene empresa y nadie sabe a quién se le reporta.
// Meterla en un bloque cualquiera mandaría plata en un reporte a una empresa
// que no la pidió; dejarla afuera en silencio la volvería invisible. Cae en
// `SIN_BLOQUE`, que se dibuja aparte, sin período y sin botón de cerrar.
//
// Módulo PURO. Sin base, sin I/O.
// ============================================================================

/**
 * Código de una marca que se reporta y se cierra.
 *
 * Es lo que se guarda en `mk_periodos.proveedor_key` y en
 * `mk_periodo_documentos.proveedor_key`. ⚠️ La COLUMNA conserva el nombre
 * viejo a propósito: renombrarla es una DDL que rompe las dos tablas para no
 * ganar nada, y la fila que de verdad no se puede tocar —el período cerrado
 * "mid 2026", con sus $62.381,57 ya reportados— sigue guardando `'pvh'` ahí.
 * Ver `supabase/migrations/20260811180000_marketing_periodos_por_marca.sql`.
 */
export type MarcaCodigo = "TH" | "CK" | "KL" | "RBK" | "J";

/** Bucket de Multifashion: tienda propia, no se le reporta a nadie. */
export const MULTIFASHION_KEY = "multifashion" as const;

/** Bucket de las marcas que todavía no tienen a quién reportarle. */
export const SIN_BLOQUE = "sin_bloque" as const;

/** Cualquiera de los bloques que dibuja el inicio. */
export type BloqueKey = MarcaCodigo | typeof MULTIFASHION_KEY | typeof SIN_BLOQUE;

export interface MarcaBloque {
  key: MarcaCodigo;
  /**
   * Cómo se llama si la base no dijera otra cosa. El nombre que MANDA es
   * `mk_marcas.nombre` — si Daniel renombra una marca, el bloque se renombra
   * con ella. Esto es el respaldo para cuando el catálogo no llegó.
   */
  nombreFallback: string;
}

/**
 * Las marcas del módulo, en el orden en que se dibujan.
 *
 * El orden es fijo: el de siempre (el orden en que Daniel las nombra). Que un
 * bloque salte de lugar porque este mes gastó menos hace que la pantalla se lea
 * distinta cada vez, y acá se entra a buscar una marca por su nombre, no por su
 * tamaño. Cada marca se cierra SOLA — no existe ningún cierre conjunto.
 */
export const MARCAS_BLOQUE: readonly MarcaBloque[] = [
  { key: "TH", nombreFallback: "Tommy Hilfiger" },
  { key: "CK", nombreFallback: "Calvin Klein" },
  { key: "KL", nombreFallback: "Karl Lagerfeld" },
  { key: "RBK", nombreFallback: "Reebok" },
  { key: "J", nombreFallback: "Joybees" },
] as const;

const MARCA_POR_CODIGO: ReadonlyMap<string, MarcaCodigo> = new Map(
  MARCAS_BLOQUE.map((m) => [m.key, m.key] as const),
);

/** ¿Es un código de marca conocido? */
export function esMarcaCodigo(x: unknown): x is MarcaCodigo {
  return typeof x === "string" && MARCA_POR_CODIGO.has(x.trim().toUpperCase());
}

/** ¿Es una clave de bloque que el inicio sabe dibujar? */
export function esBloqueKey(x: unknown): x is BloqueKey {
  return esMarcaCodigo(x) || x === MULTIFASHION_KEY || x === SIN_BLOQUE;
}

export function marcaBloquePorKey(key: string): MarcaBloque | null {
  const k = String(key ?? "").trim().toUpperCase();
  return MARCAS_BLOQUE.find((m) => m.key === k) ?? null;
}

/**
 * A qué bloque va una marca, por su CÓDIGO.
 *
 * Devuelve `SIN_BLOQUE` para todo código que no esté en el mapa — incluido uno
 * que aparezca mañana en `mk_marcas`. Nunca inventa un bloque.
 */
export function bloqueDeCodigo(codigo: string | null | undefined): BloqueKey {
  const c = (codigo ?? "").trim().toUpperCase();
  if (!c) return SIN_BLOQUE;
  return MARCA_POR_CODIGO.get(c) ?? SIN_BLOQUE;
}

/** Marca del catálogo, tal como la necesita el agrupador. */
export interface MarcaParaBloque {
  id: string;
  codigo?: string | null;
  nombre?: string | null;
}

/**
 * Índice `marca_id → bloque`, que es como el resto del módulo tiene los datos
 * (las facturas y las entregas guardan `marca_id`, no el código).
 */
export function indiceBloquePorMarcaId(
  marcas: ReadonlyArray<MarcaParaBloque>,
): Map<string, BloqueKey> {
  const out = new Map<string, BloqueKey>();
  for (const m of marcas) out.set(String(m.id), bloqueDeCodigo(m.codigo));
  return out;
}

/**
 * Nombre visible de un bloque.
 *
 * 🔑 El catálogo MANDA sobre la constante: si Daniel renombra la marca en
 * `mk_marcas`, el bloque, el reporte y el nombre del ZIP se renombran con ella.
 * La constante es el respaldo para cuando el catálogo no llegó, y sirve para
 * que la pantalla no muestre un código pelado.
 */
export function nombreDeBloque(
  key: string,
  marcas: ReadonlyArray<MarcaParaBloque> = [],
): string {
  if (key === MULTIFASHION_KEY) return "Multifashion";
  if (key === SIN_BLOQUE) return "Sin marca asignada";
  const codigo = String(key ?? "").trim().toUpperCase();
  const delCatalogo = marcas.find(
    (m) => (m.codigo ?? "").trim().toUpperCase() === codigo,
  );
  const nombre = String(delCatalogo?.nombre ?? "").trim();
  if (nombre) return nombre;
  return marcaBloquePorKey(codigo)?.nombreFallback ?? codigo;
}

// ----------------------------------------------------------------------------
// Compatibilidad con el sello viejo (por PROVEEDOR)
//
// 🔴 ESTO NO ES UN GRUPO DE CIERRE Y NO SE TOCA. El cierre conjunto ("Cerrar
// las tres") se retiró el 11-ago-2026; este mapeo es OTRA cosa: la clave con la
// que ya están escritas las filas históricas. La fila "mid 2026" de
// `mk_periodos` guarda `proveedor_key = 'pvh'` con $62.381,57 ya reportados
// (59 facturas: Tommy $44.539,43 + Calvin $17.842,14). Quitarle el 'pvh' a
// TH/CK/KL movería esa plata al período actual en pantalla.
// ----------------------------------------------------------------------------

/**
 * La clave con la que se sellaron los documentos ANTES del cambio por marca.
 *
 * 🔴 ESTO ES LO QUE HACE QUE LA PANTALLA FUNCIONE SIN LA DDL, y no es un
 * adorno: los 121 sellos que ya existen dicen `'pvh'`, `'reebok'` o
 * `'joybees'`. Si al buscar el sello de Tommy solo se preguntara por `'TH'`, no
 * se encontraría ninguno, los 59 documentos del período CERRADO se leerían como
 * "del período actual" y **el bloque de Tommy mostraría $102.904,43 en vez de su
 * parte abierta**. O sea: la plata se movería en pantalla por no haber corrido
 * una migración. Por eso se pregunta primero por el código de marca y, si no
 * hay nada, por la clave vieja.
 *
 * Después de la migración los sellos nuevos ganan por código y este camino deja
 * de usarse solo — sin que nadie tenga que acordarse de apagarlo.
 */
const CLAVE_LEGACY_POR_MARCA: ReadonlyMap<MarcaCodigo, string> = new Map([
  ["TH", "pvh"],
  ["CK", "pvh"],
  ["KL", "pvh"],
  ["RBK", "reebok"],
  ["J", "joybees"],
]);

/** La clave vieja (por proveedor) de una marca, o `null` si no la tiene. */
export function claveLegacyDeMarca(key: string): string | null {
  const k = String(key ?? "").trim().toUpperCase();
  if (!esMarcaCodigo(k)) return null;
  return CLAVE_LEGACY_POR_MARCA.get(k as MarcaCodigo) ?? null;
}

/**
 * Las claves con las que hay que buscar el sello de una marca, en orden de
 * prioridad: primero la de marca, después la vieja.
 */
export function clavesDeSello(key: string): string[] {
  const k = String(key ?? "").trim().toUpperCase();
  if (!esMarcaCodigo(k)) return [];
  const legacy = claveLegacyDeMarca(k);
  return legacy ? [k, legacy] : [k];
}

/**
 * Nombre de archivo del ZIP de una marca: `<Marca> · <Período>.zip`.
 *
 * Se limpia lo que rompe una ruta y se conservan acentos y espacios — el
 * archivo lo abre una persona, no un script.
 */
export function nombreZipDeMarca(nombreMarca: string, nombrePeriodo: string): string {
  const limpio = (s: string) =>
    String(s ?? "")
      .replace(/[/\\:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  const marca = limpio(nombreMarca) || "Marca";
  const periodo = limpio(nombrePeriodo);
  return periodo ? `${marca} · ${periodo}.zip` : `${marca}.zip`;
}
