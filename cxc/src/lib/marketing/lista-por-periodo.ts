// ============================================================================
// Marketing — la lista de proyectos de una marca, PARTIDA POR PERÍODO
// (12-ago-2026). Módulo PURO: sin base, sin I/O.
//
// Daniel, textual: *"nova lux si era de verdad, pero esta mezclado en el
// cierre anterior… creo q no se entendio el orden. no quiero friccion, quiero
// orden simple"*. La lista queda en dos secciones: PERÍODO ACTUAL arriba y
// YA REPORTADO · <nombre del período> abajo (una subsección por período
// cerrado, del más nuevo al más viejo).
//
// 🔴 QUIÉN DECIDE "actual" vs "reportado": el CLASIFICADOR único
// (`crearClasificadorPeriodos` en resumen-bloques.ts). La regla es "¿tiene
// sello a un período CERRADO?" — un sello a un período ABIERTO (incluido el
// fantasma `pvh · abierto` que hoy llevan 16/17 pagos de impulsadora) cuenta
// como actual, así que la pantalla se ve bien ANTES y DESPUÉS de que Daniel
// repare esos sellos. Acá solo se decide la SECCIÓN de cada proyecto a partir
// de lo que el clasificador ya dijo documento por documento.
//
// 🔴 UN PROYECTO CON GASTO EN EL ACTUAL **Y** EN UN CERRADO VA EN EL ACTUAL
// (es donde se trabaja), con la lista de períodos donde también reportó
// (`tambienEn`) para que la fila pueda decirlo sin ensuciar.
// ============================================================================

/** Referencia a un período cerrado tal como la necesita la lista. */
export interface PeriodoCerradoRef {
  /** `null` = el archivo legacy ("Gastos Tommy y Calvin"), sin fila propia. */
  id: string | null;
  nombre: string;
  cerradoEn: string | null;
}

export interface SeccionDeProyecto {
  seccion: "actual" | "cerrado";
  /** Solo cuando `seccion === "cerrado"`: el período bajo el que se lista. */
  periodo: PeriodoCerradoRef | null;
  /** Solo cuando `seccion === "actual"`: nombres de períodos cerrados donde
   *  este proyecto TAMBIÉN tiene gasto ya reportado (sin duplicados). */
  tambienEn: string[];
}

/** Llave estable de un período cerrado (el legacy no tiene id). */
export function claveDePeriodo(p: PeriodoCerradoRef): string {
  return p.id ? String(p.id) : `legacy::${p.nombre}`;
}

/**
 * Más nuevo primero. El archivo legacy (sin `cerrado_en`) va al final: es lo
 * más viejo que existe por definición.
 */
export function compararPeriodosCerrados(
  a: PeriodoCerradoRef,
  b: PeriodoCerradoRef,
): number {
  return (
    (b.cerradoEn ?? "").localeCompare(a.cerradoEn ?? "") ||
    a.nombre.localeCompare(b.nombre)
  );
}

/**
 * ¿En qué sección va este proyecto?
 *
 *  - Con ≥1 documento del período abierto → ACTUAL (y `tambienEn` dice dónde
 *    más reportó, si reportó).
 *  - Sin documentos de ningún tipo → ACTUAL: un proyecto recién creado o
 *    vaciado se trabaja hoy, no pertenece a ningún archivo.
 *  - Solo documentos ya reportados → CERRADO, bajo el período MÁS NUEVO en el
 *    que tenga gasto (si tuviera en dos, el más reciente es donde alguien lo
 *    va a buscar).
 */
export function seccionDeProyecto(
  docsActual: number,
  cerrados: ReadonlyArray<PeriodoCerradoRef>,
): SeccionDeProyecto {
  const unicos = new Map<string, PeriodoCerradoRef>();
  for (const c of cerrados) {
    const k = claveDePeriodo(c);
    if (!unicos.has(k)) unicos.set(k, c);
  }
  const ordenados = [...unicos.values()].sort(compararPeriodosCerrados);

  if (docsActual > 0 || ordenados.length === 0) {
    return {
      seccion: "actual",
      periodo: null,
      tambienEn: ordenados.map((p) => p.nombre),
    };
  }
  return { seccion: "cerrado", periodo: ordenados[0], tambienEn: [] };
}

/**
 * Ordena las subsecciones de "Ya reportado" (llaves → períodos) del más nuevo
 * al más viejo, para dibujarlas en ese orden.
 */
export function ordenarSubsecciones(
  periodos: ReadonlyArray<PeriodoCerradoRef>,
): PeriodoCerradoRef[] {
  const unicos = new Map<string, PeriodoCerradoRef>();
  for (const p of periodos) {
    const k = claveDePeriodo(p);
    if (!unicos.has(k)) unicos.set(k, p);
  }
  return [...unicos.values()].sort(compararPeriodosCerrados);
}

// ----------------------------------------------------------------------------
// La fila "GENERAL": impulsadoras y gastos SIN cliente de la marca.
//
// 🔴 Daniel: *"las impulsadoras… no las veo en tommy ni nada"*. Hoy esos
// gastos son INVISIBLES en la página de la marca. La fila General los muestra
// en el período actual, con su total y conteo, y abre el detalle.
//
// 🔴 NO DEPENDE DEL SELLO PARA LA MARCA: la porción de cada gasto sale de
// `mk_factura_marcas` (la marca REAL del gasto), nunca de la clave del sello.
// El sello se usa SOLO para excluir lo ya reportado (período cerrado) — y un
// sello a un período abierto, sea de quien sea, deja el gasto en el actual.
// ----------------------------------------------------------------------------

export interface GastoGeneralItem {
  id: string;
  /** Fecha visible (fecha_factura si existe; si no, created_at). */
  fecha: string | null;
  /** Descripción para la lista: concepto, o proveedor, o el número. */
  descripcion: string;
  /** Porción de ESTA marca (total × % normalizado), a 2 decimales. */
  monto: number;
  esImpulsadora: boolean;
}

export interface GastoGeneral {
  count: number;
  total: number;
  items: GastoGeneralItem[];
}

/** Texto de un gasto suelto: lo primero que exista y diga algo. */
export function descripcionDeGastoSuelto(f: {
  concepto?: string | null;
  proveedor?: string | null;
  numero_factura?: string | null;
  esImpulsadora?: boolean;
}): string {
  const concepto = (f.concepto ?? "").trim();
  if (concepto) return concepto;
  const proveedor = (f.proveedor ?? "").trim();
  if (proveedor) return proveedor;
  const numero = (f.numero_factura ?? "").trim();
  if (numero) return `Factura ${numero}`;
  return f.esImpulsadora ? "Pago de impulsadora" : "Gasto sin detalle";
}

/** Suma y ordena los items (más nuevo primero) y redondea el total. */
export function armarGastoGeneral(
  items: ReadonlyArray<GastoGeneralItem>,
): GastoGeneral {
  const ordenados = [...items].sort((a, b) =>
    (b.fecha ?? "").localeCompare(a.fecha ?? ""),
  );
  const total = ordenados.reduce((s, x) => s + x.monto, 0);
  return {
    count: ordenados.length,
    total: Number(total.toFixed(2)),
    items: ordenados,
  };
}
