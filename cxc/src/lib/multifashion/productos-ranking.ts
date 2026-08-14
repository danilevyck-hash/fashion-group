// ─────────────────────────────────────────────────────────────────────────────
// RANKING de lo más vendido de Multifashion (american_classic), en las DOS
// alturas que pidió Daniel:
//
//   · POR CATEGORÍA — agrupa por `descripcion` ("Women-Bags", "Men-T-Shirts S/S")
//   · POR ARTÍCULO  — agrupa por `codigo` (el SKU suelto)
//
// Módulo PURO: recibe las filas ya leídas y devuelve los renglones con unidades,
// venta, costo, utilidad y margen. No toca base ni red, así que el candado prueba
// la matemática con filas escritas a mano.
//
// ── LAS CUATRO COSAS QUE ACÁ NO SE PUEDEN HACER MAL ─────────────────────────
//
// 1. 🩸 EL SIGNO NO ESTÁ EN LOS DATOS — LAS NOTAS DE CRÉDITO LLEGAN POSITIVAS.
//    `switch_articulo_diario` guarda `cantidad_total`, `venta_total` y
//    `costo_total` como MAGNITUD, tal como los manda `/apireporte/ventasucursal`
//    (verificado en src/lib/switch-api/client.ts:840). La columna `tipo` vale
//    `FA` o `NC`, y el signo contable lo pone la LECTURA. Sumar sin mirar `tipo`
//    no "se queda corto": INFLA la venta, porque cada devolución se cuenta como
//    una venta más.
//
//    LA FIRMA DE ESTE ERROR, ya pagada en este repo (CLAUDE.md, "Signos
//    contables"): la diferencia contra la fuente da EXACTAMENTE EL DOBLE de las
//    notas de crédito. Si al cuadrar contra Switch aparece esa proporción, el
//    bug es éste y no otro. MEDIDO contra producción el 7-ago-2026, ventana
//    2025-08-01 → 2026-08-07: 766 filas NC de 21.749 (3,5%), $26.770,50 de
//    venta. Neto $729.455,44 contra $782.996,44 sumando a ciegas — **$53.541,00
//    de más, que es exactamente 2 × las NC.**
//
// 2. EL MARGEN SE CALCULA SOBRE EL AGREGADO, NO SE PROMEDIA.
//    `margen = (venta − costo) / venta` del grupo ENTERO. Promediar los márgenes
//    de cada renglón le daría a un artículo de $8 el mismo peso que a uno de
//    $8.000. Con venta ≤ 0 (un grupo que quedó en devolución neta) el margen es
//    `null` y se muestra "—": un porcentaje sobre una base negativa no significa
//    nada, y un 0% sería mentira.
//
// 3. LAS DESCRIPCIONES SE MUESTRAN TAL CUAL VIENEN. Medido: de las 667
//    descripciones distintas de la ventana, solo 223 siguen el patrón
//    "Género-Categoría" ("Men-T-Shirts S/S"); las otras 444 son nombres reales
//    de producto (`REEBOK BB 1000`, `CLASSIC LEATHER`), español (`CAMISETAS P/H
//    U4001 3PZ`) y promociones. Normalizarlas, traducirlas o agruparlas por
//    parecido sería INVENTAR estructura de negocio que nadie definió. Se agrupa
//    por el texto que manda Switch, y se acabó.
//
//    ⚠️ LA ÚNICA EXCEPCIÓN, y no es normalizar: se colapsan las CORRIDAS DE
//    ESPACIOS. Switch manda tanto `"Men-T-Shirts S/S"` como `"Men-T-Shirts  S/S"`
//    (dos espacios). Medido: 667 descripciones distintas por texto crudo contra
//    601 colapsando — 66 se estaban partiendo en dos. Y no colapsarlas no es
//    "ser fiel al dato": el
//    NAVEGADOR colapsa los espacios al dibujar, así que Daniel vería DOS FILAS
//    IDÉNTICAS —"Men-T-Shirts S/S" con 2.135 u y "Men-T-Shirts S/S" con 869 u—
//    sin ninguna forma de distinguirlas ni de entender por qué su categoría más
//    vendida aparece partida. El texto que se guarda y se muestra es el
//    colapsado; ninguna palabra cambia.
//
// 4. NO SE SEPARA MAYOREO DE RETAIL, Y ES UNA DECISIÓN MEDIDA — NO UN OLVIDO.
//    Esta tabla viene de `/apireporte/ventasucursal` YA AGREGADA por artículo ×
//    día: no trae cliente ni vendedor, y el mayoreo se define justamente por
//    vendedor='DEFAULT' + cliente en `clientes_master`. O sea que desde esta
//    fuente separarlo es IMPOSIBLE, no difícil. Y da igual: solo 7 de las 14.314
//    facturas de american_classic en 12 meses son mayoreo (0,05%).
// ─────────────────────────────────────────────────────────────────────────────

/** Fila cruda de `switch_articulo_diario` — solo las columnas que se usan. */
export interface FilaArticuloDiario {
  articulo_id: number;
  codigo: string | null;
  descripcion: string | null;
  /** `FA` | `NC` — SOLO 'NC' resta (ver el punto 1 del encabezado). */
  tipo: string | null;
  cantidad_total: number | string | null;
  venta_total: number | string | null;
  costo_total: number | string | null;
}

export type ModoRanking = "categoria" | "codigo";

export interface RenglonRanking {
  /** Clave de agrupación: la descripción o el código, ya recortados. */
  clave: string;
  /** Lo que se muestra en la primera columna. */
  etiqueta: string;
  /** Segunda línea: en "por artículo", su descripción. En "por categoría", "". */
  detalle: string;
  unidades: number;
  venta: number;
  costo: number;
  utilidad: number;
  /** `utilidad / venta`. `null` si la venta no es > 0 (ver punto 2). */
  margen: number | null;
  /** Cuántos códigos distintos aportaron. Solo tiene sentido por categoría. */
  articulos: number;
}

export interface TotalesRanking {
  unidades: number;
  venta: number;
  costo: number;
  utilidad: number;
  margen: number | null;
  /** Cuántos grupos quedaron (categorías o códigos distintos). */
  grupos: number;
}

export interface ResumenRanking {
  totales: TotalesRanking;
  filas: RenglonRanking[];
}

/** El ÚNICO tipo que resta. Constante y no un literal suelto: es la regla. */
export const TIPO_QUE_RESTA = "NC";

/** Etiqueta de las filas que llegaron sin descripción / sin código. */
export const SIN_DATO = "(sin descripción)";
export const SIN_CODIGO = "(sin código)";

/**
 * Texto de agrupación: recorta las puntas y colapsa las corridas de espacios
 * internas. Ver el punto 3 del encabezado — dos filas que el navegador dibuja
 * IDÉNTICAS no pueden ser dos renglones distintos del informe.
 */
export function textoAgrupable(s: string | null | undefined): string {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

/** Los montos llegan de PostgREST como string (`numeric`). Nunca `NaN`. */
function num(x: number | string | null | undefined): number {
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  const n = parseFloat(String(x ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Signo contable de una fila. `NC` resta; todo lo demás suma.
 *
 * La comparación es sobre el tipo NORMALIZADO (trim + mayúsculas): un `" nc "`
 * que se colara desde Switch se leería como "no es NC" y sumaría una devolución
 * — el error caro con la cara de un detalle de formato.
 */
export function signoDeTipo(tipo: string | null | undefined): 1 | -1 {
  return String(tipo ?? "").trim().toUpperCase() === TIPO_QUE_RESTA ? -1 : 1;
}

/** Redondeo a centavos: evita que la suma de floats saque un `-0.0000001`. */
const centavos = (n: number): number => Math.round(n * 100) / 100;

/** Unidades a 4 decimales (la columna es `numeric(14,4)`). */
const unidades4 = (n: number): number => Math.round(n * 10000) / 10000;

/**
 * Margen del grupo. `null` cuando la venta no es positiva — ver punto 2.
 * Es la ÚNICA definición de margen de la pantalla: la usan el total, cada
 * renglón y el ordenamiento.
 */
export function margenDe(venta: number, utilidad: number): number | null {
  return venta > 0 ? utilidad / venta : null;
}

interface Acum {
  clave: string;
  etiqueta: string;
  detalle: string;
  unidades: number;
  venta: number;
  costo: number;
  codigos: Set<string>;
}

/**
 * Agrega las filas del período por categoría (`descripcion`) o por artículo
 * (`codigo`).
 *
 * @param filas TODAS las filas del período, ya paginadas — leer 1.000 de 21.709
 *              no da error, da un número equivocado (ver `leerTodoPaginado`).
 * @param modo  "categoria" agrupa por descripción; "codigo" por SKU.
 *
 * El orden de salida es el DEFAULT que pidió Daniel: **unidades descendente**.
 * Las otras columnas se ordenan con `ordenarRanking`, sin volver a pedir datos.
 */
export function agregarRanking(
  filas: readonly FilaArticuloDiario[],
  modo: ModoRanking,
): ResumenRanking {
  const grupos = new Map<string, Acum>();
  let tUnidades = 0;
  let tVenta = 0;
  let tCosto = 0;

  for (const f of filas) {
    const signo = signoDeTipo(f.tipo);
    const u = num(f.cantidad_total) * signo;
    const v = num(f.venta_total) * signo;
    const c = num(f.costo_total) * signo;
    tUnidades += u;
    tVenta += v;
    tCosto += c;

    const desc = textoAgrupable(f.descripcion);
    const cod = textoAgrupable(f.codigo);
    const clave = modo === "categoria" ? desc || SIN_DATO : cod || SIN_CODIGO;

    const prev = grupos.get(clave);
    if (prev) {
      prev.unidades += u;
      prev.venta += v;
      prev.costo += c;
      if (cod) prev.codigos.add(cod);
      // En "por artículo" la descripción se conserva de la PRIMERA fila que la
      // traiga: si alguien renombró el artículo en Switch a mitad de mes quedan
      // las dos en la tabla y hay que elegir una — no se promedia texto.
      if (modo === "codigo" && !prev.detalle && desc) prev.detalle = desc;
    } else {
      grupos.set(clave, {
        clave,
        etiqueta: clave,
        detalle: modo === "codigo" ? desc : "",
        unidades: u,
        venta: v,
        costo: c,
        codigos: cod ? new Set([cod]) : new Set(),
      });
    }
  }

  // Se descartan los grupos que quedaron en CERO NETO (vendido y devuelto dentro
  // del mismo período): no son un renglón, son un no-evento. Los que quedan
  // NEGATIVOS sí se conservan — una devolución neta es información real.
  const out: RenglonRanking[] = [];
  for (const g of grupos.values()) {
    const unidades = unidades4(g.unidades);
    const venta = centavos(g.venta);
    const costo = centavos(g.costo);
    if (unidades === 0 && venta === 0 && costo === 0) continue;
    const utilidad = centavos(venta - costo);
    out.push({
      clave: g.clave,
      etiqueta: g.etiqueta,
      detalle: g.detalle,
      unidades,
      venta,
      costo,
      utilidad,
      margen: margenDe(venta, utilidad),
      articulos: g.codigos.size,
    });
  }

  const totalVenta = centavos(tVenta);
  const totalCosto = centavos(tCosto);
  const totalUtilidad = centavos(totalVenta - totalCosto);

  return {
    totales: {
      unidades: unidades4(tUnidades),
      venta: totalVenta,
      costo: totalCosto,
      utilidad: totalUtilidad,
      margen: margenDe(totalVenta, totalUtilidad),
      grupos: out.length,
    },
    filas: ordenarRanking(out, "unidades", "desc"),
  };
}

// ── Ordenamiento ─────────────────────────────────────────────────────────────

/** Columnas por las que se puede ordenar con un clic. */
export type ColumnaRanking = "etiqueta" | "unidades" | "venta" | "costo" | "utilidad" | "margen";
export type DireccionOrden = "asc" | "desc";

/** El orden con el que se abre la pantalla — decisión de Daniel. */
export const ORDEN_DEFAULT: { col: ColumnaRanking; dir: DireccionOrden } = {
  col: "unidades",
  dir: "desc",
};

/**
 * Ordena SIN mutar la entrada (devuelve un arreglo nuevo).
 *
 * Dos detalles que no son cosméticos:
 *  · **Los márgenes `null` van SIEMPRE al final**, ordene como ordene. Un margen
 *    desconocido no es "el más chico": ponerlo primero en ascendente llenaría la
 *    parte de arriba de la tabla con rayitas y escondería lo que se buscaba.
 *  · **Desempate estable por etiqueta**: sin él, dos artículos con las mismas
 *    unidades pueden intercambiarse entre un render y otro y la fila que Daniel
 *    estaba mirando se le mueve sola.
 */
export function ordenarRanking(
  filas: readonly RenglonRanking[],
  col: ColumnaRanking,
  dir: DireccionOrden,
): RenglonRanking[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...filas].sort((a, b) => {
    if (col === "etiqueta") {
      const c = a.etiqueta.localeCompare(b.etiqueta, "es");
      return c !== 0 ? c * factor : 0;
    }
    if (col === "margen") {
      if (a.margen == null && b.margen == null) return a.etiqueta.localeCompare(b.etiqueta, "es");
      if (a.margen == null) return 1;
      if (b.margen == null) return -1;
      const c = (a.margen - b.margen) * factor;
      return c !== 0 ? c : a.etiqueta.localeCompare(b.etiqueta, "es");
    }
    const c = (a[col] - b[col]) * factor;
    return c !== 0 ? c : a.etiqueta.localeCompare(b.etiqueta, "es");
  });
}

// ── Búsqueda y filtro ────────────────────────────────────────────────────────

/**
 * Normaliza para buscar: sin acentos, sin mayúsculas, sin espacios de sobra.
 * Sin esto, buscar "sandalia" no encuentra "Sandalias Niño" ni "SANDALIA", y el
 * buscador parece roto justo cuando más se usa.
 */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export interface FiltroRanking {
  /** Texto libre: busca en el código Y en la descripción. */
  texto?: string;
  /** Descripción exacta (el filtro por categoría de "Por artículo"). */
  categoria?: string;
}

/** Filtra sin mutar. Los filtros vacíos no filtran (no "no devuelven nada"). */
export function filtrarRanking(
  filas: readonly RenglonRanking[],
  filtro: FiltroRanking,
): RenglonRanking[] {
  const texto = normalizar(filtro.texto ?? "");
  const categoria = (filtro.categoria ?? "").trim();
  if (!texto && !categoria) return [...filas];

  return filas.filter(f => {
    if (categoria && f.detalle !== categoria && f.etiqueta !== categoria) return false;
    if (!texto) return true;
    return normalizar(f.etiqueta).includes(texto) || normalizar(f.detalle).includes(texto);
  });
}

// ── Ventana de 12 meses ──────────────────────────────────────────────────────

/** Panamá = UTC-5 fijo, todo el año (ver CLAUDE.md § Base de datos). */
const PANAMA_OFFSET_MS = 5 * 60 * 60 * 1000;

export interface RangoFechas {
  /** YYYY-MM-DD, inclusivo. */
  desde: string;
  /** YYYY-MM-DD, inclusivo. */
  hasta: string;
}

/**
 * Los últimos 12 meses de CALENDARIO, incluido el mes en curso.
 *
 * Se cortan en el 1 del mes y no "hace 365 días" a propósito: un ranking cuyo
 * piso se corre un día por día es un ranking que cambia solo, y "del 8 de agosto
 * de 2025 al 7 de agosto de 2026" no es un período que nadie sepa repetir. Así,
 * el 7-ago-2026 la ventana es **1-sep-2025 → 7-ago-2026**: once meses cerrados
 * más el mes en curso, y el rótulo de la pantalla lo dice con esas dos fechas.
 *
 * PURO: recibe `ahora` explícito (nunca `new Date()` adentro) para poder probarlo
 * con fechas fijas — el bug de un borde de mes solo aparece 1 día de cada 30.
 */
export function rango12Meses(ahora: Date): RangoFechas {
  const hoy = diaPanama(ahora);
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  // 11 meses hacia atrás desde el 1 del mes en curso.
  const inicio = new Date(Date.UTC(anio, mes - 1 - 11, 1)).toISOString().slice(0, 10);
  return { desde: inicio, hasta: hoy };
}

/** Día de calendario en Panamá (UTC-5 fijo) para un instante dado. */
function diaPanama(ahora: Date): string {
  return new Date(ahora.getTime() - PANAMA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Último día del mes (1..31). Aritmética en UTC, sin zona horaria local. */
function ultimoDia(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

const dd2 = (n: number): string => String(n).padStart(2, "0");

/** La misma fecha un año antes. El 29-feb cae en el 28 del año no bisiesto. */
function unAnioAntes(fecha: string): string {
  const anio = Number(fecha.slice(0, 4)) - 1;
  const mes = Number(fecha.slice(5, 7));
  const dia = Math.min(Number(fecha.slice(8, 10)), ultimoDia(anio, mes));
  return `${anio}-${dd2(mes)}-${dd2(dia)}`;
}

export interface RangoComparativo extends RangoFechas {
  /** El período actual todavía no cerró, así que la comparación se recortó a
   *  los MISMOS días del mes. Ver el punto 2 del bloque de abajo. */
  parcial: boolean;
}

/**
 * El MISMO período, un año antes. Es contra lo que se mide "qué cambió".
 *
 * ── LAS DOS COSAS QUE HACEN QUE ESTA COMPARACIÓN NO MIENTA ──────────────────
 *
 * 1. **Un año atrás, no "el mes anterior".** En una tienda de ropa el mes
 *    anterior no es comparable con el actual —la temporada manda—, y además es
 *    el único período que el rol acotado (`gerente_acs`) puede ver: su ventana
 *    es exactamente "mes en curso + el mismo mes del año pasado". Comparar
 *    contra el mes anterior habría sido, para ese rol, un bypass.
 *
 * 2. 🩸 **Un mes empezado se compara contra los MISMOS DÍAS del año pasado.**
 *    El 7 de agosto, medir 7 días contra los 31 del agosto pasado daría una
 *    caída de ~78% que no ocurrió — el error más caro posible en esta pantalla,
 *    porque se ve como un dato y es un artefacto del calendario. Se recorta el
 *    período de COMPARACIÓN al mismo día del mes; nunca se infla el actual con
 *    una proyección. Un mes ya cerrado se compara entero contra entero.
 *
 * Para la ventana de 12 meses el corte ya es "el 1 del mes hasta hoy", así que
 * la comparación es esa misma ventana corrida 12 meses: mismo largo, mismo
 * corte de día, sin recorte que anunciar.
 *
 * PURO: `ahora` explícito, como todo lo que decide fechas en este módulo.
 */
export function rangoComparativo(
  periodo: "mes" | "12m",
  actual: { year: number; mes: number; desde: string; hasta: string },
  ahora: Date,
): RangoComparativo {
  if (periodo === "12m") {
    return {
      desde: unAnioAntes(actual.desde),
      hasta: unAnioAntes(actual.hasta),
      parcial: false,
    };
  }

  const hoy = diaPanama(ahora);
  const finMes = ultimoDia(actual.year, actual.mes);
  // Hasta dónde llega el período actual DE VERDAD: un mes en curso se corta hoy.
  const finReal = actual.hasta < hoy ? actual.hasta : hoy;
  // Un mes enteramente futuro (`hoy` antes del 1) no tiene días transcurridos:
  // no hay nada que recortar y se compara contra el mes completo.
  const diaCorte = finReal >= actual.desde ? Number(finReal.slice(8, 10)) : finMes;

  const anioAnt = actual.year - 1;
  const diaAnt = Math.min(diaCorte, ultimoDia(anioAnt, actual.mes));
  return {
    desde: `${anioAnt}-${dd2(actual.mes)}-01`,
    hasta: `${anioAnt}-${dd2(actual.mes)}-${dd2(diaAnt)}`,
    parcial: diaCorte < finMes,
  };
}
