// ─────────────────────────────────────────────────────────────────────────────
// INGRESO DE MERCANCÍA — el detalle LÍNEA POR ARTÍCULO de lo que entró a bodega.
//
// Este módulo es PURO: convierte el CSV de "Descargar Detalle" del reporte web
// de Switch en filas listas para `switch_ingresos_mercancia`. El I/O (login,
// descarga, escritura en Supabase) vive en `ingresos-mercancia-web.ts` y en el
// script de carga.
//
// ─── POR QUÉ EL REPORTE WEB Y NO EL API ──────────────────────────────────────
// `/apiingresomercancia/lista` e `/info` existen y responden 200, pero el
// detalle trae SOLO 10 campos escalares — `id, secuencial, fecha, subTotal,
// impuesto, total, proveedor, proveedorId, sucursal, sucursalId`. **CERO líneas
// por artículo.** Verificado en vivo contra 3 documentos de vistana: ningún
// array en la respuesta. La API sabe que entraron $542,08 de mercancía; no sabe
// de QUÉ artículo. Y el dato que hacía falta es exactamente ese: "compré X
// unidades tal fecha y se me acabaron en Y meses".
//
// El reporte web (`Stock → Reportes → Reporte ingreso mercancía`, botón
// **Descargar Detalle**) trae una fila por artículo por documento, con FOB y CIF
// separados y el costo promedio del momento de la compra.
//
// ─── EL CUADRE ES LA PRUEBA DE QUE NO SE PERDIÓ NADA ─────────────────────────
// El mismo reporte tiene DOS botones: "Descargar" (resumen, una fila por
// documento) y "Descargar Detalle" (una fila por artículo). Las unidades del
// detalle tienen que sumar EXACTAMENTE las del resumen, documento por documento.
// Medido sobre la muestra real que bajó Daniel a mano (vistana, 11-feb-2026 →
// 07-ago-2026): **1.477 líneas de detalle = 61.371 unidades = las 124 filas del
// resumen**. Si un extractor no reproduce ese cuadre, está perdiendo filas
// (paginación cortada, encoding, líneas partidas) y NO se debe cargar.
//
// ⚠️ El cuadre se hace por DOCUMENTO, no solo con el gran total: dos errores que
// se compensan (un documento de más y otro de menos) dan el mismo total y son
// dos documentos mal cargados.
//
// ─── LO QUE NO SE TOCA ───────────────────────────────────────────────────────
// 🔴 **FOB y CIF se guardan TAL COMO VIENEN. No se corrigen ni se estiman.**
// Son los del momento de la compra, que es mucho mejor que estimar CIF÷1,1.
// PERO en la muestra solo **104 de 1.477 líneas tienen FOB ≠ CIF**: en el 93%
// vienen iguales, y eso es un error de carga conocido del lado de Daniel, EN
// SWITCH. Arreglarlo acá sería inventar plata. `fobConfiable()` deja que quien
// lea después pueda distinguir "FOB confiable" de "FOB igual al CIF
// (sospechoso)" sin que este módulo decida por él.
//
// 🔴 **Los signos se MIDEN, no se asumen.** En este negocio ya hubo un error
// grave por sumar lo que había que restar, y su firma es que la diferencia da
// exactamente el DOBLE. Este módulo no le pone signo a nada: guarda la cantidad
// tal como viene y `resumirSignos()` reporta cuántas negativas hay para que una
// persona decida. Los ajustes de inventario NO son compras (son correcciones de
// conteo físico) y este reporte no debería traer ninguno — si aparece algo raro,
// se reporta.
// ─────────────────────────────────────────────────────────────────────────────

/** Separador del CSV de Switch. */
export const SEPARADOR = ";";

/**
 * Encabezados esperados, YA NORMALIZADOS (espacios colapsados, sin espacios en
 * los bordes). El CSV crudo los manda con DOBLES espacios adentro y espacios
 * alrededor: `; CODIGO  ARTICULO ;` → `CODIGO ARTICULO`.
 *
 * Se mapea por NOMBRE, nunca por posición a ciegas: si Switch agrega, saca o
 * reordena una columna, `parseDetalleCsv` corta con un error que dice cuál
 * falta, en vez de leer el precio como si fuera la cantidad.
 */
export const COLUMNAS_DETALLE = [
  "FECHA",
  "N.INTERNO",
  "SUCURSAL",
  "PROVEEDOR",
  "CODIGO ARTICULO",
  "ARTICULO",
  "REFERENCIA",
  "PRECIO",
  "CANTIDAD",
  "COSTO FOB",
  "COSTO CIF",
  "COSTO PROMEDIO",
  "UTILIDAD %",
] as const;

export const COLUMNAS_RESUMEN = [
  "FECHA",
  "N.INTERNO",
  "SUCURSAL",
  "PROVEEDOR",
  "CANTIDAD",
  "COSTO FOB",
  "COSTO CIF",
  "TOTAL",
] as const;

// ─── 🔴 HAY DOS FORMAS DEL MISMO REPORTE, Y NO SE PUEDEN CONFUNDIR ───────────
//
// Medido el 11-ago-2026 bajando las 5 empresas alcanzables:
//   vistana · active_wear · fashion_wear · active_shoes → 13 columnas, con
//     `COSTO FOB` y `COSTO CIF` SEPARADOS.
//   fashion_shoes                                      → 12 columnas, con UNA
//     sola columna `COSTO`.
//
// 🔴 **NO SE ADIVINA SI ESE `COSTO` ES EL FOB O EL CIF.** Mapearlo a cualquiera
// de los dos sería inventar el dato que este trabajo vino a buscar: guardar un
// CIF en la columna de FOB haría que el margen de fashion_shoes salga mal y
// nadie tendría cómo notarlo. Se guarda aparte, en `costo_sin_desglosar`, con
// `costo_fob` y `costo_cif` en NULL — que es exactamente lo que sabemos: hay un
// costo, y no sabemos cuál de los dos es. Queda para que Daniel lo confirme
// contra Switch.
//
// (Pista de por dónde viene: el menú de Stock tiene un módulo aparte,
// `/imercanciafob`, o sea que el desglose FOB/CIF es una función que está
// prendida en unas empresas y no en otras.)

export const COLUMNAS_DETALLE_COSTO_UNICO = [
  "FECHA",
  "N.INTERNO",
  "SUCURSAL",
  "PROVEEDOR",
  "CODIGO ARTICULO",
  "ARTICULO",
  "REFERENCIA",
  "PRECIO",
  "CANTIDAD",
  "COSTO",
  "COSTO PROMEDIO",
  "UTILIDAD %",
] as const;

export const COLUMNAS_RESUMEN_COSTO_UNICO = [
  "FECHA",
  "N.INTERNO",
  "SUCURSAL",
  "PROVEEDOR",
  "CANTIDAD",
  "COSTO",
  "TOTAL",
] as const;

/** Qué forma tiene el reporte de esta empresa. */
export type VarianteReporte = "fob_cif" | "costo_unico";

/** Una línea del detalle, lista para `switch_ingresos_mercancia`. */
export interface LineaIngreso {
  empresa_key: string;
  /** `YYYY-MM-DD`. */
  fecha: string;
  /** Número interno del documento de ingreso, ej. `19-000000580`. */
  n_interno: string;
  /**
   * Orden de la línea DENTRO de su documento, 1-based.
   *
   * 🔴 Existe porque un mismo artículo SÍ se repite en el mismo documento. Medido
   * en producción: `active_wear` doc `19-000000014`, código `RBKFHJB`, DOS
   * renglones de 200 y 60 unidades. Con la llave `(empresa, n_interno, codigo)`
   * el upsert habría pisado uno con el otro y se habrían perdido 60 unidades en
   * silencio. La llave es `(empresa_key, n_interno, linea)` y la carga
   * REEMPLAZA el documento entero, así que reordenar no duplica nada.
   */
  linea: number;
  sucursal: string;
  proveedor: string;
  codigo_articulo: string;
  articulo: string;
  referencia: string | null;
  precio: number | null;
  /** Tal como viene. NO se le pone signo. */
  cantidad: number;
  /** Tal como viene de Switch. NO se corrige aunque sea igual al CIF.
   *  `null` en la variante `costo_unico` (fashion_shoes): ahí no existe. */
  costo_fob: number | null;
  /** Tal como viene de Switch. `null` en la variante `costo_unico`. */
  costo_cif: number | null;
  /** 🔴 El único costo de la variante `costo_unico`. NO se sabe si es FOB o CIF
   *  y por eso NO se copia a ninguno de los dos. `null` en la variante normal. */
  costo_sin_desglosar: number | null;
  costo_promedio: number | null;
  utilidad_pct: number | null;
}

/** Una fila del resumen (un documento). Solo se usa para CUADRAR. */
export interface DocumentoResumen {
  fecha: string;
  n_interno: string;
  sucursal: string;
  proveedor: string;
  cantidad: number;
  costo_fob: number | null;
  costo_cif: number | null;
  total: number | null;
}

/** Una línea que no se pudo leer, con el motivo. Nunca se descarta en silencio. */
export interface SkipLinea {
  /** Número de línea dentro del CSV (1 = encabezado). */
  linea: number;
  motivo: string;
  /** Recorte del texto crudo, para poder auditar sin volver a Switch. */
  crudo: string;
}

export class IngresosCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngresosCsvError";
  }
}

// ─── Normalización ───────────────────────────────────────────────────────────

/**
 * Colapsa espacios y recorta. Los valores de texto del reporte vienen con dobles
 * espacios adentro (`American  Designer  Fashion`) y espacios alrededor.
 *
 * ⚠️ Se aplica también a los CÓDIGOS. No toca dígitos ni guiones: `T1A8-32600-313`
 * y `NB2568001` salen intactos. Lo único que cambia es el espaciado, que es
 * presentación del reporte y no parte del código.
 */
export function normalizarTexto(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Número del reporte. Devuelve `null` para vacío o no numérico — **nunca 0**:
 * un 0 es un dato ("costó cero") y `null` es "no vino", y confundirlos mete
 * ceros inventados en columnas de plata.
 */
export function parseNumero(s: unknown): number | null {
  const t = normalizarTexto(s).replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fecha del reporte. Viene en `YYYY-MM-DD`; se tolera `DD-MM-YYYY` por si algún
 * día cambia (es el formato que usa el estado de cuenta del API).
 */
export function parseFechaIngreso(s: unknown): string | null {
  const t = normalizarTexto(s);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{2})-(\d{2})-(\d{4})/.exec(t);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null;
}

/**
 * ¿El FOB de esta línea es un dato propio, o es el CIF repetido?
 *
 * NO corrige nada: solo permite que el módulo de Referencia distinga después.
 * `false` cuando los dos son iguales (el error de carga conocido) o cuando falta
 * alguno de los dos.
 */
export function fobConfiable(fila: Pick<LineaIngreso, "costo_fob" | "costo_cif">): boolean {
  const { costo_fob: fob, costo_cif: cif } = fila;
  if (fob === null || cif === null) return false;
  return fob !== cif;
}

// ─── Lectura del CSV ─────────────────────────────────────────────────────────

/** Parte el CSV en líneas no vacías, tolerando CRLF y BOM. */
function lineasDe(csv: string): string[] {
  return csv
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
}

/**
 * Mapa `nombre normalizado → índice de columna` a partir del encabezado.
 * Corta si falta alguna de las esperadas: leer por posición cuando el reporte
 * cambió de forma es cómo se mete un precio en la columna de cantidad.
 */
function indicesDe(encabezado: string, esperadas: readonly string[], que: string): Map<string, number> {
  const cols = encabezado.split(SEPARADOR).map(normalizarTexto);
  const idx = new Map<string, number>();
  cols.forEach((c, i) => {
    if (!idx.has(c)) idx.set(c, i);
  });
  const faltan = esperadas.filter((c) => !idx.has(c));
  if (faltan.length) {
    throw new IngresosCsvError(
      `el CSV de ${que} no tiene las columnas esperadas — faltan: ${faltan.join(", ")}. ` +
        `Vino: ${cols.join(" | ")}`,
    );
  }
  return idx;
}

export interface DetalleParseado {
  filas: LineaIngreso[];
  skips: SkipLinea[];
  /** Suma de `cantidad` de todas las filas leídas. Es lo que cuadra contra el resumen. */
  unidades: number;
  /** Documentos distintos (`n_interno`). */
  documentos: number;
  /** Con qué forma vino el reporte de esta empresa. */
  variante: VarianteReporte;
}

/**
 * ¿Con cuál de las dos formas vino este CSV? Se decide MIRANDO el encabezado, no
 * contando columnas: contar 12 o 13 lo haría igual de frágil que leer por
 * posición.
 */
function detectarVariante(
  encabezado: string,
  conFobCif: readonly string[],
  costoUnico: readonly string[],
  que: string,
): { variante: VarianteReporte; esperadas: readonly string[] } {
  const cols = new Set(encabezado.split(SEPARADOR).map(normalizarTexto));
  if (conFobCif.every((c) => cols.has(c))) return { variante: "fob_cif", esperadas: conFobCif };
  if (costoUnico.every((c) => cols.has(c))) return { variante: "costo_unico", esperadas: costoUnico };
  throw new IngresosCsvError(
    `el CSV de ${que} no tiene ninguna de las dos formas conocidas. ` +
      `Con FOB/CIF faltarían: ${conFobCif.filter((c) => !cols.has(c)).join(", ")}. ` +
      `Con costo único faltarían: ${costoUnico.filter((c) => !cols.has(c)).join(", ")}. ` +
      `Vino: ${[...cols].join(" | ")}`,
  );
}

/**
 * Lee el CSV de "Descargar Detalle".
 *
 * Una línea con la cantidad de columnas equivocada, sin fecha o sin `n_interno`
 * NO se descarta en silencio: va a `skips` con su motivo y su texto crudo. Una
 * línea perdida sin rastro rompería el cuadre y no habría forma de saber cuál.
 */
export function parseDetalleCsv(empresaKey: string, csv: string): DetalleParseado {
  const lineas = lineasDe(csv);
  if (lineas.length === 0) {
    throw new IngresosCsvError("el CSV de detalle vino vacío (ni siquiera el encabezado)");
  }
  const { variante, esperadas } = detectarVariante(
    lineas[0],
    COLUMNAS_DETALLE,
    COLUMNAS_DETALLE_COSTO_UNICO,
    "detalle",
  );
  const idx = indicesDe(lineas[0], esperadas, "detalle");
  const col = (partes: string[], nombre: string): string => partes[idx.get(nombre)!] ?? "";

  const filas: LineaIngreso[] = [];
  const skips: SkipLinea[] = [];
  const documentos = new Set<string>();
  /** Contador por documento: da el `linea` 1-based que va en la llave. */
  const nLinea = new Map<string, number>();
  let unidades = 0;

  for (let i = 1; i < lineas.length; i++) {
    const crudo = lineas[i];
    const partes = crudo.split(SEPARADOR);
    if (partes.length !== esperadas.length) {
      skips.push({
        linea: i + 1,
        motivo: `esperaba ${esperadas.length} columnas y vinieron ${partes.length}`,
        crudo: crudo.slice(0, 200),
      });
      continue;
    }
    const fecha = parseFechaIngreso(col(partes, "FECHA"));
    if (!fecha) {
      skips.push({ linea: i + 1, motivo: "fecha ilegible", crudo: crudo.slice(0, 200) });
      continue;
    }
    const nInterno = normalizarTexto(col(partes, "N.INTERNO"));
    if (!nInterno) {
      skips.push({ linea: i + 1, motivo: "sin N.INTERNO", crudo: crudo.slice(0, 200) });
      continue;
    }
    const cantidad = parseNumero(col(partes, "CANTIDAD"));
    if (cantidad === null) {
      skips.push({ linea: i + 1, motivo: "cantidad ilegible", crudo: crudo.slice(0, 200) });
      continue;
    }
    const codigo = normalizarTexto(col(partes, "CODIGO ARTICULO"));
    if (!codigo) {
      skips.push({ linea: i + 1, motivo: "sin CODIGO ARTICULO", crudo: crudo.slice(0, 200) });
      continue;
    }
    const referencia = normalizarTexto(col(partes, "REFERENCIA"));
    const orden = (nLinea.get(nInterno) ?? 0) + 1;
    nLinea.set(nInterno, orden);

    filas.push({
      empresa_key: empresaKey,
      fecha,
      n_interno: nInterno,
      linea: orden,
      sucursal: normalizarTexto(col(partes, "SUCURSAL")),
      proveedor: normalizarTexto(col(partes, "PROVEEDOR")),
      codigo_articulo: codigo,
      articulo: normalizarTexto(col(partes, "ARTICULO")),
      referencia: referencia === "" ? null : referencia,
      precio: parseNumero(col(partes, "PRECIO")),
      cantidad,
      // 🔴 En la variante `costo_unico` NO se copia el COSTO a fob ni a cif:
      // no sabemos cuál de los dos es. Ver el bloque de arriba.
      costo_fob: variante === "fob_cif" ? parseNumero(col(partes, "COSTO FOB")) : null,
      costo_cif: variante === "fob_cif" ? parseNumero(col(partes, "COSTO CIF")) : null,
      costo_sin_desglosar: variante === "costo_unico" ? parseNumero(col(partes, "COSTO")) : null,
      costo_promedio: parseNumero(col(partes, "COSTO PROMEDIO")),
      utilidad_pct: parseNumero(col(partes, "UTILIDAD %")),
    });
    documentos.add(nInterno);
    unidades += cantidad;
  }

  return { filas, skips, unidades: redondear(unidades), documentos: documentos.size, variante };
}

export interface ResumenParseado {
  documentos: DocumentoResumen[];
  skips: SkipLinea[];
  unidades: number;
  total: number;
  variante: VarianteReporte;
}

/** Lee el CSV de "Descargar" (resumen). Solo sirve para cuadrar. */
export function parseResumenCsv(csv: string): ResumenParseado {
  const lineas = lineasDe(csv);
  if (lineas.length === 0) {
    throw new IngresosCsvError("el CSV de resumen vino vacío (ni siquiera el encabezado)");
  }
  const { variante, esperadas } = detectarVariante(
    lineas[0],
    COLUMNAS_RESUMEN,
    COLUMNAS_RESUMEN_COSTO_UNICO,
    "resumen",
  );
  const idx = indicesDe(lineas[0], esperadas, "resumen");
  const col = (partes: string[], nombre: string): string => partes[idx.get(nombre)!] ?? "";

  const documentos: DocumentoResumen[] = [];
  const skips: SkipLinea[] = [];
  let unidades = 0;
  let total = 0;

  for (let i = 1; i < lineas.length; i++) {
    const crudo = lineas[i];
    const partes = crudo.split(SEPARADOR);
    if (partes.length !== esperadas.length) {
      skips.push({
        linea: i + 1,
        motivo: `esperaba ${esperadas.length} columnas y vinieron ${partes.length}`,
        crudo: crudo.slice(0, 200),
      });
      continue;
    }
    const fecha = parseFechaIngreso(col(partes, "FECHA"));
    const nInterno = normalizarTexto(col(partes, "N.INTERNO"));
    const cantidad = parseNumero(col(partes, "CANTIDAD"));
    if (!fecha || !nInterno || cantidad === null) {
      skips.push({ linea: i + 1, motivo: "fila de resumen incompleta", crudo: crudo.slice(0, 200) });
      continue;
    }
    const t = parseNumero(col(partes, "TOTAL"));
    documentos.push({
      fecha,
      n_interno: nInterno,
      sucursal: normalizarTexto(col(partes, "SUCURSAL")),
      proveedor: normalizarTexto(col(partes, "PROVEEDOR")),
      cantidad,
      costo_fob: variante === "fob_cif" ? parseNumero(col(partes, "COSTO FOB")) : null,
      costo_cif: variante === "fob_cif" ? parseNumero(col(partes, "COSTO CIF")) : null,
      total: t,
    });
    unidades += cantidad;
    total += t ?? 0;
  }

  return { documentos, skips, unidades: redondear(unidades), total: redondear(total), variante };
}

// ─── Cuadre detalle vs resumen ───────────────────────────────────────────────

export interface DiferenciaDocumento {
  n_interno: string;
  unidadesDetalle: number;
  unidadesResumen: number;
  /** detalle − resumen. */
  diferencia: number;
}

export interface Cuadre {
  ok: boolean;
  unidadesDetalle: number;
  unidadesResumen: number;
  /** detalle − resumen. Cero es lo único aceptable. */
  diferencia: number;
  documentosDetalle: number;
  documentosResumen: number;
  /** Documentos que están en el detalle y no en el resumen. */
  soloEnDetalle: string[];
  /** Documentos que están en el resumen y no en el detalle — los que faltan. */
  soloEnResumen: string[];
  /** Documentos presentes en los dos pero con distinta cantidad. */
  documentosDescuadrados: DiferenciaDocumento[];
}

/**
 * Cuadra el detalle contra el resumen, DOCUMENTO POR DOCUMENTO.
 *
 * ⚠️ El gran total solo no alcanza: un documento de más y otro de menos se
 * compensan y dan el mismo número siendo dos documentos mal cargados. `ok` exige
 * las tres cosas: mismo total, ningún documento suelto y ningún documento con
 * distinta cantidad.
 */
export function cuadrar(detalle: readonly LineaIngreso[], resumen: readonly DocumentoResumen[]): Cuadre {
  const porDocDetalle = new Map<string, number>();
  for (const f of detalle) {
    porDocDetalle.set(f.n_interno, (porDocDetalle.get(f.n_interno) ?? 0) + f.cantidad);
  }
  const porDocResumen = new Map<string, number>();
  for (const d of resumen) {
    porDocResumen.set(d.n_interno, (porDocResumen.get(d.n_interno) ?? 0) + d.cantidad);
  }

  const soloEnDetalle: string[] = [];
  const soloEnResumen: string[] = [];
  const documentosDescuadrados: DiferenciaDocumento[] = [];

  for (const [doc, uds] of porDocDetalle) {
    if (!porDocResumen.has(doc)) {
      soloEnDetalle.push(doc);
      continue;
    }
    const ur = porDocResumen.get(doc)!;
    if (redondear(uds - ur) !== 0) {
      documentosDescuadrados.push({
        n_interno: doc,
        unidadesDetalle: redondear(uds),
        unidadesResumen: redondear(ur),
        diferencia: redondear(uds - ur),
      });
    }
  }
  for (const doc of porDocResumen.keys()) {
    if (!porDocDetalle.has(doc)) soloEnResumen.push(doc);
  }

  const unidadesDetalle = redondear([...porDocDetalle.values()].reduce((a, b) => a + b, 0));
  const unidadesResumen = redondear([...porDocResumen.values()].reduce((a, b) => a + b, 0));
  const diferencia = redondear(unidadesDetalle - unidadesResumen);

  return {
    ok:
      diferencia === 0 &&
      soloEnDetalle.length === 0 &&
      soloEnResumen.length === 0 &&
      documentosDescuadrados.length === 0,
    unidadesDetalle,
    unidadesResumen,
    diferencia,
    documentosDetalle: porDocDetalle.size,
    documentosResumen: porDocResumen.size,
    soloEnDetalle: soloEnDetalle.sort(),
    soloEnResumen: soloEnResumen.sort(),
    documentosDescuadrados,
  };
}

// ─── Hallazgos que hay que MIRAR, no arreglar solos ──────────────────────────

export interface Hallazgos {
  /** Líneas con cantidad negativa (¿devolución de compra?). Se reportan, no se firman. */
  negativas: LineaIngreso[];
  /** Líneas con cantidad exactamente 0. */
  enCero: LineaIngreso[];
  /** Líneas con FOB distinto del CIF — o sea, las que tienen FOB de verdad. */
  fobDistintoDeCif: number;
  /** Líneas donde FOB y CIF vienen iguales (error de carga conocido, en Switch). */
  fobIgualACif: number;
  /** Líneas a las que les falta FOB o CIF teniendo la variante que SÍ los trae. */
  sinFobOCif: number;
  /** Líneas de la variante `costo_unico`: traen un costo que no sabemos si es
   *  FOB o CIF. No son "sin FOB": son "sin desglosar". */
  sinDesglosar: number;
  /** Pares (n_interno, codigo_articulo) que aparecen MÁS DE UNA VEZ. Es lo que
   *  decide si `(empresa, n_interno, codigo)` sirve como llave única. */
  codigosRepetidosEnDocumento: Array<{ n_interno: string; codigo_articulo: string; veces: number }>;
  /** Líneas con algún valor de plata absurdo (ver `UMBRAL_ABSURDO`). */
  montosAbsurdos: Array<{ fila: LineaIngreso; campo: string; valor: number }>;
}

/**
 * Piso a partir del cual un valor UNITARIO de este reporte deja de ser plausible.
 *
 * Estas columnas son costos y precios POR UNIDAD, no totales de documento: el
 * costo CIF más caro que maneja el negocio está en decenas de dólares. $100.000
 * de costo unitario deja cuatro órdenes de magnitud de aire y aun así atrapa el
 * tipo de basura que Switch ya mandó por otro endpoint (un documento con
 * `total: 4.460.999.999.999,55`).
 *
 * ⚠️ Esto NO rechaza ni corrige nada. Solo LISTA para que una persona mire. Un
 * valor grande no es un valor imposible, y en este reporte no hay ninguna
 * decisión automática que dependa de esto.
 */
export const UMBRAL_ABSURDO = 100_000;

/** Mide lo que no se debe asumir: signos, FOB duplicado, repetidos y absurdos. */
export function hallazgos(filas: readonly LineaIngreso[]): Hallazgos {
  const negativas: LineaIngreso[] = [];
  const enCero: LineaIngreso[] = [];
  const montosAbsurdos: Hallazgos["montosAbsurdos"] = [];
  let fobDistintoDeCif = 0;
  let fobIgualACif = 0;
  let sinFobOCif = 0;
  let sinDesglosar = 0;

  const cuenta = new Map<string, number>();

  for (const f of filas) {
    if (f.cantidad < 0) negativas.push(f);
    if (f.cantidad === 0) enCero.push(f);

    if (f.costo_sin_desglosar !== null) sinDesglosar++;
    else if (f.costo_fob === null || f.costo_cif === null) sinFobOCif++;
    else if (f.costo_fob === f.costo_cif) fobIgualACif++;
    else fobDistintoDeCif++;

    for (const campo of ["precio", "costo_fob", "costo_cif", "costo_sin_desglosar", "costo_promedio"] as const) {
      const v = f[campo];
      if (v !== null && Math.abs(v) > UMBRAL_ABSURDO) montosAbsurdos.push({ fila: f, campo, valor: v });
    }

    const k = `${f.n_interno} ${f.codigo_articulo}`;
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }

  const codigosRepetidosEnDocumento = [...cuenta.entries()]
    .filter(([, v]) => v > 1)
    .map(([k, veces]) => {
      const [n_interno, codigo_articulo] = k.split(" ");
      return { n_interno, codigo_articulo, veces };
    })
    .sort((a, b) => b.veces - a.veces);

  return {
    negativas,
    enCero,
    fobDistintoDeCif,
    fobIgualACif,
    sinFobOCif,
    sinDesglosar,
    codigosRepetidosEnDocumento,
    montosAbsurdos,
  };
}

/** Redondeo a 2 decimales, para que sumar coma flotante no invente centavos. */
function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
