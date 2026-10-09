// ============================================================================
// Marketing — piezas del ZIP (server-side): descargar, comprimir, firmar y el
// Excel `resumen_gastos.xlsx`. Las usa `zip-marca.ts`, que arma el ZIP por
// marca. El ZIP «todo en uno» de antes (`buildMarketingZip`) no tenía quién lo
// llamara y se borró el 8-oct-2026; abajo, la estructura que tenía.
//
//   resumen_gastos.xlsx                          (hoja Resumen + 1 hoja por
//                                                 cliente, con hyperlinks a
//                                                 cada PDF/foto)
//   <Cliente>/
//       facturas/<fecha · concepto>.pdf          (pdf_factura del gasto)
//       fotos/<archivo>.jpg                      (foto_proyecto, comprimidas)
//   Multifashion/<Cliente>/ …                    (bucket independiente, ver
//                                                 lib/marketing/multifashion.ts)
//   Sin cliente/ …                               (proyectos sin tienda_codigo)
//
// Por cliente hay SOLO dos carpetas: facturas/ (todos los PDFs juntos) y fotos/
// — sin carpeta por factura ni por proyecto. Los gastos y proyectos ANULADOS se
// excluyen por completo (no se
// descargan ni aparecen en el Excel). La hoja Gastos incluye facturas
// (mk_facturas) Y gastos de muebles (mk_entregas_muebles, Proveedor "Mobiliario")
// para que el TOTAL cuadre con el "Gastado" de la pantalla. Patrón basado en
// src/lib/reclamos/
// zip-bulk.ts (jszip nodebuffer + sharp + concurrencia). Respeta el filtro de
// pantalla (busqueda + marca). Los links del Excel son signed URLs de larga
// duración (1 año) — las carpetas del ZIP son el respaldo permanente.
// ============================================================================

import sharp from "sharp";
import XLSX from "xlsx-js-style";
import { CASA_PALETTE, makeCellStyles, MONEY_FMT, MONEY_FMT_GUION } from "@/lib/excel-export";
import { supabaseServer } from "@/lib/supabase-server";
import { esPathStorage } from "./storage";
import { signGalleryToken, signFacturasToken } from "./gallery-token";
import {
  COL_CALVIN,
  COL_OTRAS,
  COL_SUBTOTAL,
  COL_TOMMY,
  splitMarcas,
  sumarSplits,
  type ParteMarca,
  type SplitMarcas,
} from "./columnas-marca";
import { MULTIFASHION_LABEL } from "./multifashion";
import { ttlDeLinkDelZip } from "./zip-e-impulsadoras";

const BUCKET = "marketing";
const MAX_DIM = 1600; // px — lado mayor de la foto tras redimensionar
const JPEG_QUALITY = 70;
export const CONCURRENCY = 4; // descargas/compresiones simultáneas
// 🔴 30 DÍAS desde el 22-sep-2026 (antes: 1 año). El número y el porqué viven
// en `zip-e-impulsadoras.ts`; con el interruptor apagado vuelve al año.
const LINK_TTL_SECONDS = ttlDeLinkDelZip();
// Base para los links de galería del Excel (la galería re-firma fotos al abrir).
const GALERIA_BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.fashiongr.com";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Limpia un texto para carpeta/archivo: conserva espacios y acentos, quita
 *  solo los caracteres peligrosos para rutas. */
export function sanitizeName(s: string | null | undefined, fallback: string): string {
  const clean = (s || "")
    .trim()
    .replace(/[/\\:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return clean || fallback;
}

export function truncar(s: string, max: number): string {
  const t = (s || "").trim();
  return t.length > max ? `${t.slice(0, max).trim()}…` : t;
}

/** Garantiza un nombre único dentro de un Set (sufijo -2, -3, …). */
export function unico(nombre: string, usados: Set<string>): string {
  let candidato = nombre;
  let n = 2;
  while (usados.has(candidato.toLowerCase())) {
    candidato = `${nombre} (${n++})`;
  }
  usados.add(candidato.toLowerCase());
  return candidato;
}

/** Pool de concurrencia simple. */
export async function mapLimit<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

/** Descarga un adjunto del Storage (o vía fetch si ya es URL absoluta). */
export async function descargar(url: string): Promise<Buffer | null> {
  try {
    if (esPathStorage(url)) {
      const { data, error } = await supabaseServer.storage
        .from(BUCKET)
        .download(url);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Comprime una foto a JPEG (~1600px, q70), respetando orientación EXIF. */
export async function comprimirFoto(input: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(input)
      .rotate()
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}

/** Firma en lote (30 días). Devuelve mapa path→signedUrl. Los paths que ya son
 *  URL absoluta se mapean a sí mismos. Vencido, se vuelve a firmar por
 *  `POST /api/marketing/zip/firmar-de-nuevo`. */
export async function firmarLote(paths: ReadonlyArray<string>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const storagePaths: string[] = [];
  for (const p of paths) {
    if (esPathStorage(p)) storagePaths.push(p);
    else map.set(p, p);
  }
  if (storagePaths.length > 0) {
    const { data } = await supabaseServer.storage
      .from(BUCKET)
      .createSignedUrls(storagePaths, LINK_TTL_SECONDS);
    for (const row of data ?? []) {
      if (row.signedUrl && row.path) map.set(row.path, row.signedUrl);
    }
  }
  return map;
}

// ── Excel resumen_gastos.xlsx (construcción PURA de workbook, testeable) ─────
// Estilo de la casa (I11): headers y totales en banda navy PRI, secciones
// GASTOS/FOTOS en banda MID, Calibri 10. Se CONSERVAN los links azules 1155CC
// (PDF de factura, galería, PDF combinado) y la estructura de hojas: "Resumen"
// + 1 pestaña por cliente.

export interface GastoXlsx {
  fecha: string;
  /** Período trabajado que cubre el gasto ("1–15 jul 2026"). "" si no aplica. */
  periodo?: string;
  concepto: string;
  proveedor: string;
  marca: string;
  numero: string;
  /**
   * Gasto SIN ITBMS. Regla de la casa: ventas y gastos sin ITBMS, saldos con
   * ITBMS. En una factura es `mk_facturas.subtotal`; en una entrega de muebles
   * es el total (el mobiliario no lleva ITBMS).
   */
  subtotal: number;
  /** Reparto del SUBTOTAL por marca — alimenta las columnas Calvin / Tommy. */
  partes?: ParteMarca[];
  /** Total CON ITBMS (la columna que ya existía; no se toca). */
  total: number;
  /**
   * Formato C2: lo que dice la factura (columna «Monto»). La parte de la
   * empresa es `monto − subtotal`. Sin dato = `subtotal` (la empresa en $0).
   */
  monto?: number;
  signed?: string;
  /** Texto del link ("Ver factura" por default, "Ver comprobante" en muebles). */
  etiquetaLink?: string;
}

export interface FotoXlsx {
  archivo: string;
  signed?: string;
}

export interface ClienteResumenXlsx {
  /** Nombre display del cliente (misma clave que su carpeta del ZIP). */
  nombre: string;
  /** Código D-XXX; null = "Sin cliente" (sin galería ni PDF combinado). */
  codigo: string | null;
  /** Siglas de marcas ("TH, CK") para la columna Marcas del Resumen. */
  marcas: string;
  gastos: GastoXlsx[];
  fotos: FotoXlsx[];
  /** Bucket de impulsadoras (gastos sueltos sin cliente). Alimenta el desglose
   *  "Subtotal impulsadoras / Otros gastos" en la hoja Resumen. */
  esImpulsadoras?: boolean;
  /** Cliente Multifashion → bloque APARTE del grupo en la hoja Resumen. */
  esMultifashion?: boolean;
}

/** Σ sin ITBMS del bucket (la cifra nueva que pidió Daniel). */
const sumSubtotales = (gastos: ReadonlyArray<GastoXlsx>): number =>
  Math.round(gastos.reduce((s, g) => s + (Number(g.subtotal) || 0), 0) * 100) / 100;

/** Split Calvin / Tommy / otras del bucket, sobre el SUBTOTAL. */
const splitDeGastos = (gastos: ReadonlyArray<GastoXlsx>): SplitMarcas =>
  sumarSplits(gastos.map((g) => splitMarcas(Number(g.subtotal) || 0, g.partes ?? [])));

// ⚠️ NADA de explicaciones en el Excel: ni nota al pie sobre el ITBMS, ni hoja
// "Cómo leer esto". Daniel, textual: *"Excel de Marketing → gastos sin ITBMS,
// SIN nota al pie"*, y sobre la hoja explicativa: *"sobre el excel me referia a
// — Que el comprobante de mobiliario liste qué muebles incluye la entrega"*. O
// sea que el documento que pedía era el COMPROBANTE de mobiliario (ver
// lib/marketing/pdf-entrega-mueble.ts), no una hoja que explique el archivo.
// El Excel son números y nada más. No reintroducir ninguna de las dos.
//
// ⚠️ Y una SOLA columna de dinero por fila: el Subtotal (sin ITBMS). Textual:
// *"dame subtotal solamente, no total"*. La columna "Total" (con ITBMS) se quitó
// del Resumen y del detalle, y el GRAN TOTAL suma subtotales. No reponerla.

export interface OpcionesResumenGastos {
  /**
   * Encabezado de la ÚLTIMA columna de dinero.
   *
   * Default: `COL_SUBTOTAL` ("Subtotal (sin ITBMS)") — el ZIP global no cambia
   * ni un carácter. Existe solo para el ZIP POR MARCA, donde la cifra que se le
   * reporta al encargado es el TOTAL congelado del período (el mismo `total`
   * de la factura que ya viajó en el reporte), no el subtotal. Un encabezado
   * que dijera "sin ITBMS" sobre una columna con ITBMS sería una planilla de
   * plata mintiendo en su propio título — ver lib/marketing/zip-marca.ts.
   */
  etiquetaMonto?: string;
  /**
   * true = SIN las columnas de marca ("Marcas", Calvin, Tommy, Otras y la
   * columna "Marca" del detalle). Es para las descargas de UNA marca — Daniel,
   * textual (12-ago-2026): *"quiero el modo anterior, solo quitando las
   * columnas de las marcas ya que hoy en dia se descarga por marca"*. Cada
   * archivo ya es de una sola marca, así que el desglose por columnas era
   * redundante: la marca va en el título y nada más. El ZIP GLOBAL (sin esta
   * opción) no cambia ni un carácter.
   */
  sinColumnasDeMarca?: boolean;
  /**
   * Título y subtítulo arriba de la hoja Resumen ("FASHION GROUP — Tommy
   * Hilfiger" / "mid 2026 · cerrado el 12 ago 2026"). Es lo que el formato
   * nuevo hacía bien y se conserva: el archivo dice de qué marca y de qué
   * período es, y si fue congelado al cerrar o calculado hoy.
   */
  titulo?: string;
  subtitulo?: string;
  /**
   * 🔴 FORMATO C2 (Daniel, 8-oct-2026): en vez de UNA columna de dinero, tres —
   * «Monto» (lo que dice la factura) · <empresa> (lo que pone la empresa) ·
   * `etiquetaMonto` (lo que se le cobra a la marca). Solo con
   * `sinColumnasDeMarca`. Es el nombre de la empresa para el encabezado.
   */
  columnaEmpresa?: string;
}

/** Encabezado de la columna «lo que dice la factura» del formato C2. */
export const COL_MONTO_FACTURA = "Monto";

const r2 = (n: number): number => Math.round(n * 100) / 100;
/** Σ de lo que dice la factura (formato C2). */
const sumMontos = (gastos: ReadonlyArray<GastoXlsx>): number =>
  r2(gastos.reduce((s, g) => s + (Number(g.monto ?? g.subtotal) || 0), 0));

export function buildResumenGastosWorkbook(
  clientes: ReadonlyArray<ClienteResumenXlsx>,
  opciones: OpcionesResumenGastos = {},
): XLSX.WorkBook {
  const etiquetaMonto = opciones.etiquetaMonto || COL_SUBTOTAL;
  /** false = descarga de UNA marca: sin columnas de marca (ver la opción). */
  const conMarcas = !opciones.sinColumnasDeMarca;
  /** Formato C2: Monto · empresa · marca (ver la opción). */
  const conEmpresa = !conMarcas && !!opciones.columnaEmpresa;
  const colsDinero = conEmpresa ? [COL_MONTO_FACTURA, opciones.columnaEmpresa!, etiquetaMonto] : [etiquetaMonto];
  /** Las columnas de dinero de un grupo de gastos: [marca] o [monto, empresa, marca]. */
  const dinero = (gastos: ReadonlyArray<GastoXlsx>): number[] => {
    const marca = sumSubtotales(gastos);
    if (!conEmpresa) return [marca];
    const monto = sumMontos(gastos);
    return [monto, r2(monto - marca), marca];
  };
  const wb = XLSX.utils.book_new();

  // ── 🩸 "Otras marcas" APARECE SOLA CUANDO HAY ALGO QUE MOSTRAR ───────────
  //
  // `otras` es un RESIDUO (`subtotal − ck − th`): existe para que
  // `ck + th + otras` cuadre con el subtotal SIEMPRE, incluso si mañana entra
  // un gasto de una marca que no es Calvin ni Tommy. Hoy da 0 en todas las
  // filas —medido sobre el Excel real de Daniel— y por eso él pidió quitarla:
  // *"claramente no hay otras marcas"*.
  //
  // Pero quitarla PARA SIEMPRE haría que ese gasto futuro desapareciera en
  // silencio y el archivo dejara de cuadrar, que es el descuadre que un Excel
  // de gastos no puede tener. Así que la columna se dibuja solo si alguna fila
  // la necesita. Hoy: no aparece. El día que aparezca, cuadra.
  //
  // ⚠️ LA DECISIÓN ES GLOBAL, NO POR HOJA. Se mira TODO el export una sola vez:
  // si se decidiera por cliente, el Resumen podría traerla y la hoja de un
  // cliente no, y las dos vistas del mismo dato dirían cosas distintas.
  // (Sin columnas de marca no hay dónde dibujarla: queda en false.)
  const mostrarOtras = conMarcas && clientes.some((c) =>
    c.gastos.some((g) => splitMarcas(Number(g.subtotal) || 0, g.partes ?? []).otras > 0),
  );

  // ── Estilos de la casa (links azules conservados) ──
  const { B } = makeCellStyles(CASA_PALETTE);
  const fontBase = { name: "Calibri", sz: 10, color: { rgb: "333333" } };
  const headFont = { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } };
  const headFill = { patternType: "solid", fgColor: { rgb: CASA_PALETTE.pri } };
  const sectionFill = { patternType: "solid", fgColor: { rgb: CASA_PALETTE.mid } };
  const linkFontX = { name: "Calibri", sz: 10, color: { rgb: "1155CC" }, underline: true };
  const setCell = (ws: XLSX.WorkSheet, r: number, c: number, patch: Record<string, unknown>): void => {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cur = (ws as Record<string, unknown>)[addr] as Record<string, unknown> | undefined;
    (ws as Record<string, unknown>)[addr] = { ...(cur ?? {}), ...patch };
  };
  const styleCell = (ws: XLSX.WorkSheet, r: number, c: number, s: Record<string, unknown>): void => {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = (ws as Record<string, unknown>)[addr] as { s?: unknown } | undefined;
    if (cell) cell.s = s;
  };
  const fmtCell = (ws: XLSX.WorkSheet, r: number, c: number, z: string): void => {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = (ws as Record<string, unknown>)[addr] as { z?: string } | undefined;
    if (cell) cell.z = z;
  };

  // ── Hoja "Resumen" (vista de pájaro) ──
  // Columna "Marcas" = siglas de las marcas que toca cada cliente (facturas +
  // muebles), igual que los chips de la pantalla. Las columnas Calvin Klein /
  // Tommy Hilfiger / Otras marcas / Subtotal van SIN ITBMS (pedido de Daniel).
  // Con `sinColumnasDeMarca` las columnas de marca se van y queda Cliente /
  // # Gastos / # Fotos / monto.
  const headRes = [
    "Cliente",
    ...(conMarcas ? ["Marcas"] : []),
    "# Gastos",
    "# Fotos",
    ...(conMarcas ? [COL_CALVIN, COL_TOMMY, ...(mostrarOtras ? [COL_OTRAS] : [])] : []),
    ...colsDinero,
  ];
  /** Última columna de dinero (= Subtotal). */
  const C_RES_SUBTOTAL = headRes.length - 1;
  /** Primera columna de dinero: CK con marcas; el propio monto sin ellas. */
  const C_RES_CK = conMarcas ? 4 : C_RES_SUBTOTAL - (colsDinero.length - 1);
  const filaDeCliente = (c: ClienteResumenXlsx): (string | number)[] => {
    const s = conMarcas ? splitDeGastos(c.gastos) : null;
    return [
      c.nombre,
      ...(s ? [c.marcas] : []),
      c.gastos.length,
      c.fotos.length,
      ...(s ? [s.ck, s.th, ...(mostrarOtras ? [s.otras] : [])] : []),
      ...dinero(c.gastos),
    ];
  };

  // Multifashion es un BLOQUE aparte: su total no se suma al del grupo, y al
  // final va un gran total para que no parezca que la plata desapareció.
  const delGrupo = clientes.filter((c) => !c.esMultifashion);
  const deMultifashion = clientes.filter((c) => c.esMultifashion);
  const hayMultifashion = deMultifashion.length > 0;

  const totalesDe = (
    lista: ReadonlyArray<ClienteResumenXlsx>,
    etiqueta: string,
  ): (string | number)[] => {
    const todos = lista.flatMap((c) => c.gastos);
    const s = conMarcas ? splitDeGastos(todos) : null;
    return [
      etiqueta,
      ...(s ? [""] : []),
      todos.length,
      lista.reduce((n, c) => n + c.fotos.length, 0),
      ...(s ? [s.ck, s.th, ...(mostrarOtras ? [s.otras] : [])] : []),
      ...dinero(todos),
    ];
  };

  // Desglose impulsadoras: si hay ≥1 bucket de impulsadoras, antes del TOTAL se
  // insertan dos filas — "Subtotal impulsadoras" y "Otros gastos" (el resto).
  const impulsadoras = delGrupo.filter((c) => c.esImpulsadoras);
  const hayImpulsadoras = impulsadoras.length > 0;
  const vacias = (n: number) => Array.from({ length: n }, () => "" as string | number);
  const filaMonto = (etiqueta: string, sub: number): (string | number)[] => [
    etiqueta,
    ...vacias(C_RES_SUBTOTAL - 1),
    sub,
  ];
  const filasDesglose: (string | number)[][] = hayImpulsadoras
    ? [
        filaMonto(
          "Subtotal impulsadoras",
          sumSubtotales(impulsadoras.flatMap((c) => c.gastos)),
        ),
        filaMonto(
          "Otros gastos",
          Number(
            (
              sumSubtotales(delGrupo.flatMap((c) => c.gastos)) -
              sumSubtotales(impulsadoras.flatMap((c) => c.gastos))
            ).toFixed(2),
          ),
        ),
      ]
    : [];

  // Filas del bloque de Multifashion (título + clientes + su total).
  const filasMf: (string | number)[][] = hayMultifashion
    ? [
        vacias(headRes.length),
        [
          `${MULTIFASHION_LABEL} — marca independiente, fuera del grupo`,
          ...vacias(headRes.length - 1),
        ],
        ...deMultifashion.map(filaDeCliente),
        totalesDe(deMultifashion, `TOTAL ${MULTIFASHION_LABEL.toUpperCase()}`),
        vacias(headRes.length),
        totalesDe(clientes, "GRAN TOTAL (grupo + Multifashion)"),
      ]
    : [];

  // Título/subtítulo arriba de la hoja (solo cuando se piden — el ZIP global
  // sigue arrancando en el encabezado, como siempre).
  const filasTitulo: (string | number)[][] = opciones.titulo
    ? [
        [opciones.titulo],
        ...(opciones.subtitulo ? [[opciones.subtitulo]] : []),
        [""],
      ]
    : [];
  /** Fila del encabezado de la tabla del Resumen (0 sin título). */
  const OFS = filasTitulo.length;

  const aoaRes = [
    ...filasTitulo,
    headRes,
    ...delGrupo.map(filaDeCliente),
    ...filasDesglose,
    totalesDe(delGrupo, hayMultifashion ? "TOTAL GRUPO" : "TOTAL"),
    ...filasMf,
  ];
  const wsR = XLSX.utils.aoa_to_sheet(aoaRes);
  wsR["!cols"] = conMarcas
    ? [
        { wch: 32 },
        { wch: 16 },
        { wch: 9 },
        { wch: 8 },
        { wch: 15 },
        { wch: 15 },
        { wch: 14 },
        { wch: 18 },
      ]
    : conEmpresa
      ? [{ wch: 32 }, { wch: 9 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 18 }]
      : [{ wch: 32 }, { wch: 9 }, { wch: 8 }, { wch: 18 }];
  wsR["!freeze"] = { xSplit: 0, ySplit: OFS + 1 } as unknown as Record<string, unknown>;
  if (OFS > 0) {
    styleCell(wsR, 0, 0, {
      font: { name: "Calibri", sz: 13, bold: true, color: { rgb: CASA_PALETTE.pri } },
    });
    if (opciones.subtitulo) {
      styleCell(wsR, 1, 0, { font: { name: "Calibri", sz: 10, color: { rgb: "666666" } } });
    }
  }
  // Índices de las filas especiales, para estilarlas sin adivinar.
  const rTotalGrupo = OFS + 1 + delGrupo.length + filasDesglose.length;
  const desgloseStart = OFS + 1 + delGrupo.length;
  const desgloseEnd = desgloseStart + filasDesglose.length - 1;
  const rTituloMf = hayMultifashion ? rTotalGrupo + 2 : -1;
  const rTotalMf = hayMultifashion ? rTituloMf + 1 + deMultifashion.length : -1;
  const rGranTotal = hayMultifashion ? rTotalMf + 2 : -1;
  const esDesglose = (r: number): boolean =>
    hayImpulsadoras && r >= desgloseStart && r <= desgloseEnd;
  const esBandaTotal = (r: number): boolean =>
    r === rTotalGrupo || r === rTotalMf || r === rGranTotal;
  const esTextoCol = (c: number): boolean => c === 0 || (conMarcas && c === 1); // Cliente, Marcas
  for (let c = 0; c < headRes.length; c++) {
    styleCell(wsR, OFS, c, {
      font: headFont,
      fill: headFill,
      alignment: { horizontal: esTextoCol(c) ? "left" : "right", vertical: "center", wrapText: true },
      border: B,
    });
  }
  for (let r = OFS + 1; r < aoaRes.length; r++) {
    if (r === rTituloMf) {
      styleCell(wsR, r, 0, { font: { ...headFont, sz: 11 }, fill: sectionFill });
      for (let c = 1; c < headRes.length; c++) styleCell(wsR, r, c, { fill: sectionFill });
      continue;
    }
    for (let c = 0; c < headRes.length; c++) {
      styleCell(
        wsR,
        r,
        c,
        esBandaTotal(r)
          ? {
              font: headFont,
              fill: headFill,
              alignment: { horizontal: esTextoCol(c) ? "left" : "right", vertical: "center" },
              border: B,
            }
          : esDesglose(r)
            ? {
                font: { ...headFont, color: { rgb: "FFFFFF" } },
                fill: sectionFill,
                alignment: { horizontal: esTextoCol(c) ? "left" : "right", vertical: "center" },
                border: B,
              }
            : { font: fontBase, alignment: { horizontal: esTextoCol(c) ? "left" : "right" }, border: B },
      );
    }
    // Las columnas de MARCA muestran `–` cuando esa marca no gastó; el
    // Subtotal sigue con el formato de siempre. Es formato, no texto: la
    // celda sigue siendo 0 y las filas de TOTAL suman igual.
    for (let c = C_RES_CK; c <= C_RES_SUBTOTAL; c++)
      fmtCell(wsR, r, c, c < C_RES_SUBTOTAL && !conEmpresa ? MONEY_FMT_GUION : MONEY_FMT);
  }
  XLSX.utils.book_append_sheet(wb, wsR, "Resumen");

  // ── Una pestaña por cliente ──
  const tabsUsados = new Set<string>(["resumen"]);
  const tabName = (nombre: string): string => {
    const base = (nombre.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim() || "Cliente").slice(0, 31).trim();
    let cand = base;
    let n = 2;
    while (tabsUsados.has(cand.toLowerCase())) {
      const suf = ` (${n++})`;
      cand = `${base.slice(0, 31 - suf.length).trim()}${suf}`;
    }
    tabsUsados.add(cand.toLowerCase());
    return cand;
  };
  // "Período" = período trabajado que cubre el gasto (quincenas de impulsadora).
  // Los gastos que no tienen período muestran "—".
  const headG = [
    "Fecha",
    "Período",
    "Concepto",
    "Proveedor",
    ...(conMarcas ? ["Marca"] : []),
    "N° Factura",
    ...(conMarcas ? [COL_CALVIN, COL_TOMMY, ...(mostrarOtras ? [COL_OTRAS] : [])] : []),
    ...colsDinero,
    "Comprobante",
  ];
  // Índices con nombre: hay ~10 lugares que dependían del número crudo.
  const C_CONCEPTO = 2;
  const C_LINK = headG.length - 1;
  const C_SUBTOTAL = headG.length - 2;
  /** Primera columna de dinero: CK con marcas; el propio monto sin ellas. */
  const C_CK = conMarcas ? 6 : C_SUBTOTAL - (colsDinero.length - 1);
  /** Columnas de dinero de la hoja de detalle (todas van con formato moneda). */
  const esColMoneda = (c: number): boolean => c >= C_CK && c <= C_SUBTOTAL;
  for (const cli of clientes) {
    const codigo = cli.codigo;
    // Galería = 1 link por cliente (requiere código). "Sin cliente" / sin código
    // → links individuales por foto (no hay galería sin código de cliente).
    const usarGaleria = !!codigo && cli.fotos.length > 0;

    // Fila "Ver todas las facturas (N)" arriba de la tabla (solo si el cliente
    // tiene código y ≥1 factura con PDF). Abre el PDF combinado del cliente.
    //
    // ⚠️ Cuenta SOLO las facturas de proveedor, no los comprobantes de mobiliario:
    // el PDF combinado (`/api/marketing/facturas-pdf/[cliente]`) une los adjuntos
    // `pdf_factura` y los comprobantes de entrega no son adjuntos (se generan al
    // vuelo). Contarlos acá prometería páginas que ese PDF no trae.
    const nFacturasPdf = cli.gastos.filter(
      (g) => g.signed && (g.etiquetaLink ?? "Ver factura") === "Ver factura",
    ).length;
    const verFacturas = !!codigo && nFacturasPdf > 0;
    const aoa: (string | number)[][] = [["GASTOS"]];
    let verFacturasRow = -1;
    if (verFacturas) {
      verFacturasRow = aoa.length;
      aoa.push([`Ver todas las facturas (${nFacturasPdf})`]);
    }
    const headerRow = aoa.length;
    aoa.push(headG);
    const gastoStart = aoa.length; // índice 0-based de la 1ª fila de gasto
    for (const g of cli.gastos) {
      const s = conMarcas ? splitMarcas(Number(g.subtotal) || 0, g.partes ?? []) : null;
      aoa.push([
        g.fecha,
        g.periodo || "—",
        g.concepto,
        g.proveedor,
        ...(s ? [g.marca] : []),
        g.numero || "—",
        ...(s ? [s.ck, s.th, ...(mostrarOtras ? [s.otras] : [])] : []),
        ...dinero([g]),
        g.signed ? g.etiquetaLink || "Ver factura" : "—",
      ]);
    }
    const gastoEnd = gastoStart + cli.gastos.length - 1;
    const totalesCli = conMarcas ? splitDeGastos(cli.gastos) : null;
    aoa.push([
      ...vacias(C_CK - 1),
      // "Subtotal" a secas quedaría pegado a la columna "Subtotal (sin ITBMS)" y
      // se leería como su encabezado. Esta fila son los totales de TODAS las
      // columnas de dinero, así que dice eso.
      "TOTALES",
      ...(totalesCli
        ? [totalesCli.ck, totalesCli.th, ...(mostrarOtras ? [totalesCli.otras] : [])]
        : []),
      ...dinero(cli.gastos),
      "",
    ]);
    const subtotalRow = aoa.length - 1;
    aoa.push([""]);
    const fotosTitle = aoa.length;
    aoa.push(["FOTOS"]);
    let galeriaRow = -1;
    let fotoHeader = -1;
    let fotoStart = -1;
    if (usarGaleria) {
      galeriaRow = aoa.length;
      aoa.push([`Ver todas las fotos (${cli.fotos.length})`]);
    } else {
      aoa.push(["Archivo", "Foto"]);
      fotoHeader = aoa.length - 1;
      fotoStart = aoa.length;
      for (const f of cli.fotos) {
        aoa.push([f.archivo, f.signed ? "Ver foto" : "—"]);
      }
      if (cli.fotos.length === 0) aoa.push(["(sin fotos)", ""]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = conMarcas
      ? [
          { wch: 12 },
          { wch: 16 },
          { wch: 40 },
          { wch: 22 },
          { wch: 22 },
          { wch: 16 },
          { wch: 15 },
          { wch: 15 },
          { wch: 14 },
          { wch: 18 },
          { wch: 16 },
        ]
      : conEmpresa
        ? [
            { wch: 12 },
            { wch: 16 },
            { wch: 40 },
            { wch: 22 },
            { wch: 16 },
            { wch: 14 },
            { wch: 14 },
            { wch: 18 },
            { wch: 16 },
          ]
        : [
            { wch: 12 },
            { wch: 16 },
            { wch: 40 },
            { wch: 22 },
            { wch: 16 },
            { wch: 18 },
            { wch: 16 },
          ];

    // Links de gasto + SUM de cada columna de dinero en la fila Subtotal.
    cli.gastos.forEach((g, i) => {
      if (g.signed) {
        const etiqueta = g.etiquetaLink || "Ver factura";
        setCell(ws, gastoStart + i, C_LINK, {
          t: "s",
          v: etiqueta,
          l: {
            Target: g.signed,
            Tooltip:
              etiqueta === "Ver comprobante"
                ? "Abrir el comprobante de entrega del mueble"
                : "Abrir PDF de la factura",
          },
        });
      }
    });
    if (cli.gastos.length > 0) {
      for (let c = C_CK; c <= C_SUBTOTAL; c++) {
        const L = XLSX.utils.encode_col(c);
        setCell(ws, subtotalRow, c, {
          t: "n",
          f: `SUM(${L}${gastoStart + 1}:${L}${gastoEnd + 1})`,
        });
      }
    }

    // Estilos comunes: títulos de sección en banda MID, headers banda PRI.
    styleCell(ws, 0, 0, { font: { ...headFont, sz: 11 }, fill: sectionFill });
    styleCell(ws, fotosTitle, 0, { font: { ...headFont, sz: 11 }, fill: sectionFill });
    for (let c = 0; c < headG.length; c++) {
      styleCell(ws, headerRow, c, {
        font: headFont,
        fill: headFill,
        alignment: {
          horizontal: esColMoneda(c) ? "right" : "left",
          vertical: "center",
          wrapText: true,
        },
        border: B,
      });
    }
    for (let i = 0; i < cli.gastos.length; i++) {
      const r = gastoStart + i;
      for (let c = 0; c < headG.length; c++) {
        const esLink = c === C_LINK && !!cli.gastos[i].signed;
        styleCell(ws, r, c, {
          font: esLink ? linkFontX : fontBase,
          alignment: { horizontal: esColMoneda(c) ? "right" : "left", wrapText: c === C_CONCEPTO },
          border: B,
        });
        if (esColMoneda(c)) fmtCell(ws, r, c, c < C_SUBTOTAL && !conEmpresa ? MONEY_FMT_GUION : MONEY_FMT);
      }
    }
    // Fila Subtotal en banda PRI (totales estilo de la casa).
    for (let c = C_CK - 1; c <= C_SUBTOTAL; c++) {
      styleCell(ws, subtotalRow, c, {
        font: headFont,
        fill: headFill,
        alignment: { horizontal: "right", vertical: "center" },
        border: B,
      });
      if (esColMoneda(c)) fmtCell(ws, subtotalRow, c, c < C_SUBTOTAL && !conEmpresa ? MONEY_FMT_GUION : MONEY_FMT);
    }

    // Link "Ver todas las facturas (N)" → PDF combinado del cliente.
    if (verFacturas) {
      const url = `${GALERIA_BASE}/api/marketing/facturas-pdf/${encodeURIComponent(codigo!)}?t=${signFacturasToken(codigo!)}`;
      setCell(ws, verFacturasRow, 0, { t: "s", v: `Ver todas las facturas (${nFacturasPdf})`, l: { Target: url, Tooltip: "Abrir PDF combinado de las facturas" } });
      styleCell(ws, verFacturasRow, 0, { font: linkFontX });
    }

    // Sección de fotos: galería (1 link) o links individuales.
    if (usarGaleria) {
      const url = `${GALERIA_BASE}/marketing/galeria/${encodeURIComponent(codigo!)}?t=${signGalleryToken(codigo!)}`;
      setCell(ws, galeriaRow, 0, { t: "s", v: `Ver todas las fotos (${cli.fotos.length})`, l: { Target: url, Tooltip: "Abrir galería del cliente" } });
      styleCell(ws, galeriaRow, 0, { font: linkFontX });
    } else {
      cli.fotos.forEach((f, i) => {
        if (f.signed) {
          setCell(ws, fotoStart + i, 1, { t: "s", v: "Ver foto", l: { Target: f.signed, Tooltip: "Abrir foto" } });
        }
      });
      for (let c = 0; c < 2; c++) {
        styleCell(ws, fotoHeader, c, {
          font: headFont,
          fill: headFill,
          alignment: { horizontal: "left", vertical: "center" },
          border: B,
        });
      }
      for (let i = 0; i < cli.fotos.length; i++) {
        const r = fotoStart + i;
        styleCell(ws, r, 0, { font: fontBase, alignment: { horizontal: "left", wrapText: true }, border: B });
        styleCell(ws, r, 1, { font: cli.fotos[i].signed ? linkFontX : fontBase, border: B });
      }
    }

    ws["!freeze"] = { xSplit: 0, ySplit: headerRow + 1 } as unknown as Record<string, unknown>;
    XLSX.utils.book_append_sheet(wb, ws, tabName(cli.nombre));
  }

  return wb;
}
