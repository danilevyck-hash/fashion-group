// ─────────────────────────────────────────────────────────────────────────────
// Marketing › PROVEEDORES — la ficha del proveedor (6-oct-2026). Módulo PURO:
// sin React, sin Supabase, sin fetch.
//
// Lo que Daniel decidió el 6-oct-2026, en sus palabras:
//
//   · El proveedor hoy es TEXTO LIBRE en cada factura. Pasa a ser una LISTA de
//     proveedores «con alias, para que "Krysthel", "Kristel" y "Changalo" sean
//     uno solo».
//   · Una FICHA por proveedor «con TODO lo que se le pagó». Al lado de cada
//     factura va a dónde fue: «a Tommy», «a City Mall» o a cargo de la empresa.
//   · Al pie, DOS totales: cuánto se le pagó y cuánto se recobró.
//   · Una factura puede quedar SIN MARCA: queda a cargo de la empresa.
//   · Nunca se reparte entre VARIAS MARCAS ni entre EMPRESAS. Se elige UNA
//     marca y cuánto se le cobra: el 100 % o el 50 %. Lo que no se le cobra
//     queda A CARGO DE LA EMPRESA, sin preguntar cuál (Daniel: «eso no debe de
//     importar, lo asumo y ya. No debes dividirlo ni nada»).
//   · Mobiliario NO se conecta. Daniel: «no es algo de siempre, que lo pueda
//     poner como gasto y en Mobiliario yo pongo la cantidad y listo para saber
//     cuánto tengo». La compra es un gasto más; el inventario lo escribe él.
//   · Los rótulos son de ERP: «A cargo de la empresa», nunca «mi costo».
//
// 🔴 POR QUÉ UNA LISTA ESCRITA A MANO Y NO UN PAREO POR PARECIDO.
//   `normalizarProveedor` (./proveedor.ts) ya junta «Impresora Comercial, S.A.»
//   con «IMPRESORA COMERCIAL S A»: mismas letras, distinta puntuación. Pero
//   «Krysthel» · «Kristel» · «Changalo» NO comparten letras —«Changalo» es el
//   apodo de la persona—, así que ninguna normalización los junta y ningún
//   `includes` debe intentarlo: es la trampa de «nova» → «Renovación» que este
//   repo ya pagó en Multifashion (`marcas-grupo.ts`).
//   Por eso el amarre es una LISTA ESCRITA A MANO, igual que `proveedor_amarre`
//   del módulo Proveedores y `DESTINOS_DEFINIDOS` de Guías: quién es quién lo
//   dice una persona, nunca el nombre ni el parecido.
//
// 🔴 LA LISTA SE DERIVA, EL AMARRE SE ESCRIBE. Los proveedores salen de las
//   facturas que ya existen (`SELECT DISTINCT proveedor FROM mk_facturas`, que
//   es lo que ya lee `sugerirProveedores`): no hay un catálogo que mantener al
//   día. Lo único que se guarda es el amarre de los alias.
//
// 🔴 NINGÚN CÁLCULO EXISTENTE CAMBIA. Este módulo solo AGRUPA y SUMA facturas
//   que ya estaban en la base; no toca `periodo-estado.ts`, ni el ZIP, ni el
//   papel de la marca, ni el stock.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizarProveedor } from "./proveedor";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 🔴 EL INTERRUPTOR. `false` = Marketing como el 5-oct-2026, intacto: el
 * proveedor sigue siendo texto libre, la marca sigue siendo obligatoria, una
 * factura sigue llevando UNA marca al 100 % y Mobiliario sigue sin margen.
 *
 * ✅ PRENDIDO el 7-oct-2026 con el «sí» de Daniel sobre el mockup aprobado.
 * Se aplicó antes la migración `20270101120000_mkt_proveedores.sql`, que es la
 * que trae `mk_facturas.pct_a_la_marca` y `mk_proveedor_alias`; sin ella el
 * módulo falla ABIERTO (`columnas-opcionales.ts`) y no se rompe, pero los dos
 * campos no tendrían dónde guardar.
 *
 * 🔑 LAS 108 FACTURAS DE ANTES NO SE TOCARON: las 108 quedaron con
 * `pct_a_la_marca = NULL`, que se lee EXACTAMENTE como hasta ayer —entera para
 * su marca—. El `NULL` no es un 0: `Number(null)` es 0, no NaN, así que el
 * corte es explícito (ver `cuantoSeLeCobra`). Sin ese corte una factura vieja
 * se habría reportado en $0.00 a su marca.
 *
 * 🩸 Y por eso NO se reusó `mk_factura_marcas.porcentaje`: medido de nuevo el
 * 7-oct-2026, después de migrar, esa tabla sigue con sus 108 filas y 58 de
 * ellas dicen 50 queriendo decir el 100 %. La columna vieja no se tocó ni se
 * lee para esto.
 *
 * ⚠️ AL PRENDERLO HUBO QUE ACTUALIZAR UN CANDADO, EN EL MISMO COMMIT:
 * `src/__tests__/components/marketing-puerta-gasto.test.tsx` fijaba la
 * pantalla de HOY (el campo «Marca», «De una tienda», «Falta: qué tipo de
 * gasto es…»). Medido el 6-oct-2026: con el interruptor en `true` caían 16 de
 * sus pruebas, y ninguna otra en todo el repo. Ya están actualizadas a la
 * pantalla nueva; que cayeran fue la prueba de que el interruptor aislaba.
 */
export const MKT_PROVEEDORES_2026_10 = true;

// ─── EL AMARRE: quién es quién ───────────────────────────────────────────────

/**
 * 🔴 LA LISTA ESCRITA A MANO. Clave = grafía normalizada que se encuentra en
 * las facturas; valor = la grafía normalizada CANÓNICA del proveedor.
 *
 * Se agrega una línea cuando una persona confirma que dos nombres son el mismo
 * proveedor. Nunca se deriva del parecido.
 *
 * Krysthel / Kristel / Changalo: Daniel, 6-oct-2026 — «para que "Krysthel",
 * "Kristel" y "Changalo" sean uno solo». «Changalo» es como se le dice a la
 * persona; es el mismo proveedor que firma «Krysthel».
 *
 * ⚠️ Fail-open: si mañana esto vive en `mk_proveedor_alias`, la tabla manda y
 * esta lista queda de respaldo (`alias-de-la-base.ts` lo resolvería). Hoy no
 * hay tabla: el amarre es este.
 */
export const ALIAS_DE_PROVEEDOR: Readonly<Record<string, string>> = {
  // 🔑 La clave canónica es la grafía que REALMENTE está en las facturas.
  // Medido contra producción el 6-oct-2026: las 17 facturas de Krysthel están
  // guardadas con su nombre completo, «Krysthel Yanneth Morales Martinez»
  // ($12.535,06 — el número que dijo Daniel). Apuntar el amarre a «krysthel»
  // a secas habría creado un proveedor vacío al lado del de verdad.
  krysthel: "krysthel yanneth morales martinez",
  kristel: "krysthel yanneth morales martinez",
  krystel: "krysthel yanneth morales martinez",
  changalo: "krysthel yanneth morales martinez",
  // Impreco es Impresora Comercial (`marketing-rediseno.md`: «Impreco
  // (Impresora Comercial) le hace el mismo trabajo…»). Medido: 47 facturas
  // firman «Impresora Comercial S a» y 6 firman «Impreco» — con el amarre son
  // 53 y $22.694,72. ⚠️ Daniel dijo «47»: este amarre sube el conteo a 53.
  impreco: "impresora comercial",
  // Daniel confirmó el 6-oct-2026 que es el mismo proveedor.
  "a g display venetto": "a g display",
};

/**
 * La clave de un proveedor: su nombre normalizado y, si está en el amarre, la
 * clave canónica de su grupo. Vacío si no hay nombre.
 *
 *   «Kristel»              → "krysthel"
 *   «Changalo»             → "krysthel"
 *   «Krysthel S.A.»        → "krysthel"
 *   «Impresora Comercial»  → "impresora comercial"
 */
export function claveDeProveedor(
  nombre: string | null | undefined,
  alias: Readonly<Record<string, string>> = ALIAS_DE_PROVEEDOR,
): string {
  const base = normalizarProveedor(nombre);
  if (base.length === 0) return "";
  // Una sola salto: el amarre apunta siempre a la clave canónica, no en cadena.
  const canonico = alias[base];
  return typeof canonico === "string" && canonico.length > 0 ? canonico : base;
}

/** ¿Son el mismo proveedor, contando los alias? Igualdad, nunca `includes`. */
export function mismoProveedorConAlias(
  a: string | null | undefined,
  b: string | null | undefined,
  alias: Readonly<Record<string, string>> = ALIAS_DE_PROVEEDOR,
): boolean {
  const ca = claveDeProveedor(a, alias);
  return ca.length > 0 && ca === claveDeProveedor(b, alias);
}

// ─── A DÓNDE FUE CADA FACTURA ────────────────────────────────────────────────

/**
 * 🔴 A dónde fue el gasto, DERIVADO de lo que la factura ya trae. No hay una
 * columna nueva de «destino» para la marca ni para la tienda: si tiene marca,
 * se le reporta a esa marca; si no tiene marca pero sí tienda, es de esa
 * tienda; si no tiene ninguna, queda a cargo de la empresa.
 *
 * Lo ÚNICO que se guarda es CUÁNTO se le cobra a la marca
 * (`mk_facturas.pct_a_la_marca`), porque la base no lo puede adivinar.
 */
/**
 * 🔴 DOS CAMPOS, CON NOMBRES DE ERP (6-oct-2026). Daniel, al ver el mockup:
 * «porque no termino ERP yaaa».
 *
 * `docs/nombres-erp.md` › «Rótulos de formulario»: sustantivos cortos y
 * estándar, NUNCA preguntas. Por eso «¿A quién se le pasa?» se fue y quedó
 * **«Se cobra a»**, que además absorbe al viejo campo «Marca»: eran la misma
 * pregunta hecha dos veces.
 *
 *   · «Se cobra a» → una marca, o «A cargo de la empresa».
 *   · «Porcentaje» → 100 % o 50 %, solo con una marca elegida. Nace en 100 %.
 *
 * Daniel, textual: «eso no debe de importar, lo asumo y ya. No debes dividirlo
 * ni nada. Solo que algunas se registran para cobrar la mitad y algunas muy
 * pocas no, como el caso de la barra». O sea: NO se elige empresa, NO se
 * escriben montos y NO se reparte entre dos marcas.
 */
export const ROTULO_SE_COBRA_A = "Se cobra a";

/**
 * 🔴 NADA DE PORCENTAJES EN PANTALLA (6-oct-2026). Daniel: «¿por qué los
 * porcentajes? Es o le cobro la mitad a la marca, o todo, o nada».
 *
 * El segundo campo se llama **«Se cobra»** y dice **Completo** o **Mitad**.
 * El número (100 · 50 · 0) vive SOLO por dentro, en `mk_facturas.pct_a_la_marca`:
 * la base necesita un número para repartir, la persona no.
 */
export const ROTULO_SE_COBRA = "Se cobra";

export const CUANTO_SE_COBRA = ["completo", "mitad"] as const;
export type CuantoSeCobra = (typeof CUANTO_SE_COBRA)[number];

export const ROTULO_CUANTO: Record<CuantoSeCobra, string> = {
  completo: "Completo",
  mitad: "Mitad",
};

/** Lo que se guarda por dentro para cada opción. No se enseña. */
export const PCT_DE_CUANTO: Record<CuantoSeCobra, number> = {
  completo: 100,
  mitad: 50,
};

/** Lo que se cobra por omisión: la factura completa. */
export const CUANTO_POR_OMISION: CuantoSeCobra = "completo";

export function esCuantoSeCobra(v: unknown): v is CuantoSeCobra {
  return typeof v === "string" && (CUANTO_SE_COBRA as readonly string[]).includes(v);
}

/**
 * 🔴 EL RÓTULO DE LO QUE NO SE LE COBRA A NADIE. Daniel lo dice «mi costo»; en
 * pantalla, en el Excel y en el papel va **«A cargo de la empresa»**. Ni un
 * coloquialismo suyo sale a la pantalla; hay barrido
 * (`nombres-erp-prohibidos.test.ts` y `marketing-proveedores-2026-10.test.ts`).
 */
export const ROTULO_A_CARGO_EMPRESA = "A cargo de la empresa";

/** El valor del desplegable que quiere decir «no se le cobra a ninguna marca». */
export const VALOR_A_CARGO_EMPRESA = "__empresa__";

/**
 * 🔴 EL COMPROBANTE (6-oct-2026). «Foto o factura (opcional)» y «Subir foto o
 * factura» eran descripciones, no nombres. En un ERP el adjunto de un gasto es
 * el **comprobante**. Lo «opcional» no se escribe: lo dicen el botón apagado y
 * el aviso al guardar (docs/diseno.md, regla 8).
 *
 * ⚠️ `rotuloDeLaPuerta`/`rotuloBotonDeLaPuerta` (`pdf-en-la-puerta.ts`) NO se
 * tocan: tienen candado propio y los usa también la pantalla de antes.
 */
export const ROTULO_COMPROBANTE = "Comprobante";
export const ROTULO_ADJUNTAR_COMPROBANTE = "Adjuntar comprobante";

/**
 * 🔴 LA TIENDA (6-oct-2026). «De una tienda» y «General» eran frases; en un ERP
 * son **Tienda** y **Sin tienda**.
 *
 * ⚠️ `TIENDA_GENERAL` («General») NO se toca: es el nombre del cajón en los
 * reportes, el ZIP y la ficha, y cambiarlo movería papeles ya enviados. Lo que
 * cambia es el rótulo de los DOS BOTONES del formulario.
 */
export const ROTULO_TIENDA = "Tienda";
export const ROTULO_SIN_TIENDA = "Sin tienda";

/**
 * El porcentaje que se guarda, a partir de los dos campos de la pantalla.
 * A cargo de la empresa → 0. Con marca → 100 (Completo) o 50 (Mitad).
 */
export function pctQueSeGuarda(e: {
  aCargoDeLaEmpresa: boolean;
  cuanto: unknown;
}): number {
  if (e.aCargoDeLaEmpresa) return 0;
  return esCuantoSeCobra(e.cuanto) ? PCT_DE_CUANTO[e.cuanto] : PCT_DE_CUANTO[CUANTO_POR_OMISION];
}

// ─── CUÁNTO SE LE COBRA A LA MARCA ───────────────────────────────────────────

/**
 * 🔴 EL PORCENTAJE SE GUARDA EN UNA COLUMNA NUEVA
 * (`mk_facturas.pct_a_la_marca`), Y NO EN `mk_factura_marcas.porcentaje`.
 *
 * 🩸 POR QUÉ, MEDIDO CONTRA PRODUCCIÓN EL 6-oct-2026: de las 108 filas de
 * `mk_factura_marcas`, **58 tienen `porcentaje = 50` y hoy significan el 100 %**
 * — `getCobrableByMarca` normaliza por la SUMA de los porcentajes de esa
 * factura, y como todas tienen UNA sola marca, 50/50 = el total. Si el 50
 * pasara a querer decir «la mitad», 58 facturas de plata real se partirían a la
 * mitad en silencio. Por eso el porcentaje viejo NO SE TOCA y el nuevo entra
 * por su propia columna.
 *
 * `null` = la factura es de antes de esta pieza y se lee EXACTAMENTE como hoy:
 * entera para su marca. Es lo que dicen las 107 facturas vivas.
 */
export function montoDeLaMarca(total: number, pctALaMarca: number | null | undefined): number {
  const t = Number(total);
  if (!Number.isFinite(t)) return 0;
  // 🩸 `Number(null)` es **0**, no NaN: sin este corte, una factura de ANTES
  // (`pct_a_la_marca` en NULL) se habría reportado en $0.00 a su marca. El
  // null se mira ANTES de convertir.
  if (pctALaMarca === null || pctALaMarca === undefined) return round2(t);
  const pct = Number(pctALaMarca);
  if (!Number.isFinite(pct)) return round2(t);
  return round2((t * Math.max(0, Math.min(100, pct))) / 100);
}

/** Lo que queda a cargo de la empresa. */
export function montoACargoDeLaEmpresa(
  total: number,
  pctALaMarca: number | null | undefined,
): number {
  const t = Number(total);
  if (!Number.isFinite(t)) return 0;
  return round2(t - montoDeLaMarca(t, pctALaMarca));
}

/** Lo que se escribe en `mk_facturas` por esta pieza. Vacío = no se escribe. */
export interface ColumnasDeProveedores {
  pct_a_la_marca?: number | null;
}

/**
 * La columna nueva, SOLO si la pantalla la mandó y SOLO con el interruptor
 * prendido. Mismo patrón que `columnasDelGasto` (`puerta-gasto.ts`).
 *
 * 🔴 Apagado devuelve `{}`: ni una columna nueva viaja a la base.
 * 🔴 Un valor que no sea 0, 50 o 100 se guarda como `null`: la lista es cerrada.
 */
export function columnasDeProveedores(input: {
  pctALaMarca?: unknown;
}): ColumnasDeProveedores {
  if (!MKT_PROVEEDORES_2026_10) return {};
  if (input.pctALaMarca === undefined) return {};
  const n = Number(input.pctALaMarca);
  const valido = n === 0 || Object.values(PCT_DE_CUANTO).includes(n);
  return { pct_a_la_marca: valido ? n : null };
}

/** ¿Vino? (Si no, no hay reintento «sin columnas» que hacer.) */
export function traeColumnasDeProveedores(cols: ColumnasDeProveedores): boolean {
  return Object.keys(cols).length > 0;
}

/** Una factura, con lo que hace falta para decir a dónde fue. */
export interface GastoDelProveedor {
  id: string;
  /** Nombre del proveedor tal como se guardó. */
  proveedor: string;
  /** "YYYY-MM-DD" de la factura. */
  fecha: string;
  numeroFactura: string;
  concepto: string;
  /** Total de la factura, en dólares. Lo que se le PAGÓ al proveedor. */
  monto: number;
  /** Nombre de la marca a la que se le reporta. `null` = sin marca. */
  marcaNombre: string | null;
  /** Nombre de la tienda del directorio. `null` = sin tienda («General»). */
  tiendaNombre: string | null;
  /**
   * Cuánto por ciento se le cobra a la marca: 100, 50 o 0. `null` = la factura
   * es de antes de esta pieza y se lee entera para su marca, como hoy.
   */
  pctALaMarca: number | null;
  /** ¿Se le pasa a la marca? Un gasto con `se_reporta` apagado no se recobra. */
  seReporta: boolean;
}

/**
 * A dónde fue esta factura, en una frase corta para la columna de la ficha.
 *
 *   marca Tommy, 100 % (o sin dato)  → «Tommy Hilfiger»
 *   marca Tommy, 50 % de $100        → «Tommy Hilfiger $50.00 · A cargo de la empresa $50.00»
 *   sin marca, tienda City Mall      → «City Mall»
 *   sin marca                        → «A cargo de la empresa»
 */
export function destinoDelGasto(
  g: {
    marcaNombre?: string | null;
    tiendaNombre?: string | null;
    monto?: number;
    pctALaMarca?: number | null;
  },
  formatear: (n: number) => string = (n) => `$${n.toFixed(2)}`,
): string {
  const marca = String(g.marcaNombre ?? "").trim();
  const pct = Number(g.pctALaMarca);
  if (marca.length > 0) {
    // Solo se desglosa cuando de verdad se parte: con 100 % o sin dato, la
    // frase es el nombre de la marca y nada más (sin datos repetidos).
    if (Number.isFinite(pct) && pct > 0 && pct < 100) {
      const total = Number(g.monto ?? 0);
      return (
        `${marca} ${formatear(montoDeLaMarca(total, pct))} · ` +
        `${ROTULO_A_CARGO_EMPRESA} ${formatear(montoACargoDeLaEmpresa(total, pct))}`
      );
    }
    return marca;
  }
  const tienda = String(g.tiendaNombre ?? "").trim();
  if (tienda.length > 0) return tienda;
  return ROTULO_A_CARGO_EMPRESA;
}

/**
 * 🔴 CUÁNTO SE RECOBRA de esta factura. Solo lo que se le cobra a una marca:
 *
 *   · Sin marca → 0: queda a cargo de la empresa.
 *   · Con `se_reporta` apagado → 0: se guarda y se ve, pero no va al ZIP ni
 *     suma en lo de la marca (`gasto.ts`).
 *   · Con el 50 % → la mitad; la otra mitad queda a cargo de la empresa.
 *
 * Un gasto con marca y tienda se recobra: la tienda dice DÓNDE se gastó, la
 * marca A QUIÉN se le pasa (docs/postmortems/marketing-rediseno.md: «DOS
 * PUERTAS»).
 */
export function montoRecobrado(g: {
  marcaNombre?: string | null;
  seReporta?: boolean;
  monto?: number;
  pctALaMarca?: number | null;
}): number {
  if (String(g.marcaNombre ?? "").trim().length === 0) return 0;
  if (g.seReporta === false) return 0;
  return montoDeLaMarca(Number(g.monto ?? 0), g.pctALaMarca);
}

/** ¿Algo de esta factura se recobra? */
export function seRecobra(g: {
  marcaNombre?: string | null;
  seReporta?: boolean;
  monto?: number;
  pctALaMarca?: number | null;
}): boolean {
  return montoRecobrado(g) > 0;
}

// ─── EL PROVEEDOR SE ELIGE DE UNA LISTA, CON AUTOCOMPLETADO ──────────────────

/**
 * 🔴 Daniel, 6-oct-2026: «el proveedor se elige al poner un gasto nuevo, de una
 * lista con autocompletado».
 *
 * `sugerirProveedores` (`proveedor.ts`) ya existía y ya agrupa por el
 * normalizado. Lo único que le falta es el AMARRE: sin él, «Impreco» y
 * «Impresora Comercial S a» se ofrecen como dos proveedores distintos. Esta
 * función hace lo mismo pero agrupando por la clave CANÓNICA, y devuelve
 * también la clave, para poder abrir la ficha desde ahí.
 *
 * 🔑 No reemplaza a `sugerirProveedores`: con el interruptor apagado se sigue
 * usando aquella, intacta.
 */
export interface SugerenciaConFicha {
  /** La grafía que se escribe al elegirla: la más usada del proveedor. */
  nombre: string;
  /** La clave canónica, para abrir su ficha. */
  clave: string;
  usos: number;
}

export function sugerirProveedoresConAlias(
  texto: string | null | undefined,
  historico: ReadonlyArray<string | null | undefined>,
  max = 8,
  alias: Readonly<Record<string, string>> = ALIAS_DE_PROVEEDOR,
): SugerenciaConFicha[] {
  const prefijo = normalizarProveedor(texto);
  const filas = listaDeProveedores(
    historico.map((n, i) => ({
      id: String(i),
      proveedor: String(n ?? ""),
      fecha: "",
      numeroFactura: "",
      concepto: "",
      monto: 0,
      marcaNombre: null,
      tiendaNombre: null,
      pctALaMarca: null,
      seReporta: true,
    })),
    alias,
  );
  return filas
    // Por PREFIJO del normalizado mientras la persona teclea, nunca `includes`.
    .filter((f) => prefijo.length === 0 || f.clave.startsWith(prefijo) ||
                   normalizarProveedor(f.nombre).startsWith(prefijo))
    .sort((a, b) => b.facturas - a.facturas || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, Math.max(0, max))
    .map((f) => ({ nombre: f.nombre, clave: f.clave, usos: f.facturas }));
}

// ─── LA LISTA DE PROVEEDORES ─────────────────────────────────────────────────

/** Una fila de la lista de proveedores. */
export interface FilaProveedor {
  /** Clave canónica del grupo (con alias resueltos). */
  clave: string;
  /** La grafía que se muestra: la más usada del grupo. */
  nombre: string;
  /** Las otras grafías del grupo, para decir «también: Kristel · Changalo». */
  alias: string[];
  /** Cuántas facturas tiene. */
  facturas: number;
  /** Lo que se le pagó: la suma de sus facturas. */
  pagado: number;
  /** Lo que se recobró: la suma de las que se le reportan a una marca. */
  recobrado: number;
}

/**
 * La lista de proveedores, derivada de las facturas. Una fila por proveedor
 * CANÓNICO (los alias caen en la misma fila).
 *
 * Orden: más pagado primero y, empatados, alfabético — la pregunta de la
 * pantalla es «¿a quién le pagamos más?».
 *
 * 🔑 El nombre que se muestra es la grafía MÁS USADA del grupo, igual que
 * `sugerirProveedores`: la lista no dice «Krysthel» y «Kristel» como si fueran
 * dos proveedores.
 */
export function listaDeProveedores(
  gastos: ReadonlyArray<GastoDelProveedor>,
  alias: Readonly<Record<string, string>> = ALIAS_DE_PROVEEDOR,
): FilaProveedor[] {
  const porClave = new Map<
    string,
    { grafias: Map<string, number>; facturas: number; pagado: number; recobrado: number }
  >();
  for (const g of gastos) {
    const clave = claveDeProveedor(g?.proveedor, alias);
    if (clave.length === 0) continue;
    const nombre = String(g.proveedor ?? "").replace(/\s+/g, " ").trim();
    const acc =
      porClave.get(clave) ??
      { grafias: new Map<string, number>(), facturas: 0, pagado: 0, recobrado: 0 };
    acc.grafias.set(nombre, (acc.grafias.get(nombre) ?? 0) + 1);
    acc.facturas += 1;
    const monto = Number(g.monto);
    if (Number.isFinite(monto)) {
      acc.pagado += monto;
      acc.recobrado += montoRecobrado(g);
    }
    porClave.set(clave, acc);
  }
  const out: FilaProveedor[] = [];
  for (const [clave, acc] of porClave) {
    // Gana la grafía MÁS USADA. Empatadas, gana la que ES el proveedor
    // canónico («Krysthel Yanneth Morales Martinez» le gana a «Changalo»: el
    // alias es un apodo, el canónico es el nombre). Y después, alfabético —
    // para que el orden sea TOTAL y la lista no cambie entre cargas.
    const esCanonica = (g: string) => (normalizarProveedor(g) === clave ? 1 : 0);
    const ordenadas = [...acc.grafias.entries()].sort(
      (a, b) =>
        b[1] - a[1] ||
        esCanonica(b[0]) - esCanonica(a[0]) ||
        a[0].localeCompare(b[0], "es"),
    );
    const nombre = ordenadas.length > 0 ? ordenadas[0][0] : clave;
    out.push({
      clave,
      nombre,
      alias: ordenadas.slice(1).map(([g]) => g),
      facturas: acc.facturas,
      pagado: round2(acc.pagado),
      recobrado: round2(acc.recobrado),
    });
  }
  out.sort((a, b) => b.pagado - a.pagado || a.nombre.localeCompare(b.nombre, "es"));
  return out;
}

// ─── LA FICHA DE UN PROVEEDOR ────────────────────────────────────────────────

/** Un renglón de la ficha: la factura con su destino al lado. */
export interface RenglonDeFicha extends GastoDelProveedor {
  /** «Tommy Hilfiger» · «City Mall» · «A cargo de la empresa». */
  destino: string;
  /** ¿Entra en el total recobrado? */
  recobra: boolean;
}

/** La ficha completa de un proveedor. */
export interface FichaProveedor {
  clave: string;
  nombre: string;
  alias: string[];
  renglones: RenglonDeFicha[];
  /** 🔴 Los DOS totales del pie. */
  pagado: number;
  recobrado: number;
}

/**
 * La ficha de UN proveedor: todo lo que se le pagó, cada factura con a dónde
 * fue, y al pie los dos totales.
 *
 * Los renglones van del más nuevo al más viejo (es un estado de cuenta) y,
 * empatados en fecha, por número de factura, para que el orden sea TOTAL y no
 * cambie entre cargas.
 *
 * 🔑 `pagado` y `recobrado` son la suma de los renglones que se ven: el pie
 * cierra con la pantalla, como el Excel y el PDF de CxC.
 */
export function fichaDeProveedor(
  clave: string,
  gastos: ReadonlyArray<GastoDelProveedor>,
  alias: Readonly<Record<string, string>> = ALIAS_DE_PROVEEDOR,
): FichaProveedor {
  const buscada = String(clave ?? "").trim();
  const mios = gastos.filter((g) => claveDeProveedor(g?.proveedor, alias) === buscada);
  const fila = listaDeProveedores(mios, alias)[0];
  const renglones = mios
    .map((g) => ({
      ...g,
      destino: destinoDelGasto(g),
      recobra: seRecobra(g),
    }))
    .sort(
      (a, b) =>
        b.fecha.localeCompare(a.fecha) ||
        a.numeroFactura.localeCompare(b.numeroFactura, "es") ||
        a.id.localeCompare(b.id),
    );
  return {
    clave: buscada,
    nombre: fila?.nombre ?? buscada,
    alias: fila?.alias ?? [],
    renglones,
    pagado: fila?.pagado ?? 0,
    recobrado: fila?.recobrado ?? 0,
  };
}
