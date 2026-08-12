// ============================================================================
// Marketing — LA MARCA ES LA UNIDAD. Un bloque = una marca.
//
// 🔑 EL MODELO, en palabras de Daniel: *"ellos facturan a mi bajo compañia
// diferentes. una por marca. cada marca tiene su encargado"*. O sea que Tommy,
// Calvin y Karl NO son tres marcas de un proveedor: son tres EMPRESAS, cada una
// con su encargado y su reporte. Lo único que comparten es el dueño, y eso se
// nota en una sola cosa — que él las cierra el mismo día.
//
// 🩸 EL "PROVEEDOR" SE FUE, y no es un rename: era un concepto de más. Existía
// solo para agrupar el cierre, y el cierre agrupado se resuelve con un botón
// ("Cerrar las tres") sin necesidad de una entidad intermedia que se metía en
// la pantalla, en el reporte y en el nombre del ZIP. Lo que queda de él es
// `GRUPOS_CIERRE`, que dice UNA cosa y solo esa: estas marcas se cierran juntas.
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

/**
 * Clave de un grupo de cierre conjunto.
 *
 * `'pvh'` es la clave HISTÓRICA del dueño de Tommy, Calvin y Karl, y se
 * conserva porque es la que ya está escrita en la fila del período cerrado.
 * No se muestra nunca en pantalla — para eso está `etiqueta`.
 */
export type GrupoCierreKey = "pvh";

export interface MarcaBloque {
  key: MarcaCodigo;
  /**
   * Cómo se llama si la base no dijera otra cosa. El nombre que MANDA es
   * `mk_marcas.nombre` — si Daniel renombra una marca, el bloque se renombra
   * con ella. Esto es el respaldo para cuando el catálogo no llegó.
   */
  nombreFallback: string;
  /** Con quién se cierra junta. `null` = se cierra sola. */
  grupoCierre: GrupoCierreKey | null;
}

/**
 * Las marcas del módulo, en el orden en que se dibujan.
 *
 * El orden es fijo: primero las tres que cierran juntas (en el orden en que
 * Daniel las nombra), después las que cierran solas. Que un bloque salte de
 * lugar porque este mes gastó menos hace que la pantalla se lea distinta cada
 * vez, y acá se entra a buscar una marca por su nombre, no por su tamaño.
 */
export const MARCAS_BLOQUE: readonly MarcaBloque[] = [
  { key: "TH", nombreFallback: "Tommy Hilfiger", grupoCierre: "pvh" },
  { key: "CK", nombreFallback: "Calvin Klein", grupoCierre: "pvh" },
  { key: "KL", nombreFallback: "Karl Lagerfeld", grupoCierre: "pvh" },
  { key: "RBK", nombreFallback: "Reebok", grupoCierre: null },
  { key: "J", nombreFallback: "Joybees", grupoCierre: null },
] as const;

export interface GrupoCierre {
  key: GrupoCierreKey;
  /** Lo que se lee en el botón. NUNCA el nombre del dueño. */
  etiqueta: string;
  marcas: readonly MarcaCodigo[];
}

/**
 * Los cierres conjuntos.
 *
 * 🔑 Es lo ÚNICO que queda del viejo "proveedor", y dice una sola cosa: estas
 * marcas se cierran el mismo día. No agrupa montos, no agrupa reportes y no
 * aparece en el nombre de ningún archivo — cada marca sigue teniendo su ZIP.
 */
export const GRUPOS_CIERRE: readonly GrupoCierre[] = [
  { key: "pvh", etiqueta: "Tommy · Calvin · Karl", marcas: ["TH", "CK", "KL"] },
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

/** El grupo de cierre de una marca, o `null` si cierra sola. */
export function grupoCierreDeMarca(key: string): GrupoCierre | null {
  const m = marcaBloquePorKey(key);
  if (!m || !m.grupoCierre) return null;
  return GRUPOS_CIERRE.find((g) => g.key === m.grupoCierre) ?? null;
}

export function grupoCierrePorKey(key: string): GrupoCierre | null {
  return GRUPOS_CIERRE.find((g) => g.key === String(key ?? "").trim()) ?? null;
}

/**
 * ¿Esta marca es la PRIMERA de su grupo de cierre?
 *
 * Sirve para dibujar el botón "Cerrar las tres" una sola vez, encima del
 * bloque de arriba, en vez de repetirlo en los tres.
 */
export function esCabezaDeGrupo(key: string): boolean {
  const g = grupoCierreDeMarca(key);
  return !!g && g.marcas[0] === String(key ?? "").trim().toUpperCase();
}

// ----------------------------------------------------------------------------
// Compatibilidad con el sello viejo (por PROVEEDOR)
// ----------------------------------------------------------------------------

/**
 * La clave con la que se sellaron los documentos ANTES de este cambio.
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
