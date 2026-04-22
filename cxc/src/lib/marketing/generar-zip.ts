// ============================================================================
// Marketing — generación de ZIP por proyecto (client-side)
// ============================================================================
// Estructura del ZIP:
//   <Proyecto>.zip
//     ├── respaldo.xlsx                 (1 hoja, 1 fila por factura)
//     ├── <Marca>/<numero>.pdf          (PDFs directo dentro de la carpeta de marca)
//     └── fotos/                        (fotos del proyecto)
//
// Nota: ya no se genera "cobranza-<marca>.pdf" — simplificación pedida.
// Tampoco hay subcarpeta "facturas/" dentro de la marca — los PDFs van directo.
// ============================================================================

import XLSX from "xlsx-js-style";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import type {
  MarcaConPorcentaje,
  MkAdjunto,
  MkFactura,
  MkMarca,
  MkProyecto,
} from "./types";

type FetchFile = (url: string) => Promise<Blob>;

const fetchFile: FetchFile = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url}`);
  return res.blob();
};

function dataUrlABlob(dataUrl: string): { blob: Blob; mime: string; ext: string } {
  const idx = dataUrl.indexOf(",");
  if (!dataUrl.toLowerCase().startsWith("data:") || idx < 0) {
    throw new Error("data URL malformada");
  }
  const meta = dataUrl.slice(5, idx);
  const payload = dataUrl.slice(idx + 1);
  const mime = (meta.split(";")[0] || "application/octet-stream").trim();
  const esBase64 = /;base64/i.test(meta);
  let buffer: ArrayBuffer;
  if (esBase64) {
    const bin = atob(payload.replace(/\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  } else {
    const decoded = decodeURIComponent(payload);
    const bytes = new TextEncoder().encode(decoded);
    buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  }
  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/heic": "heic",
    "application/pdf": "pdf",
  };
  const ext = extMap[mime.toLowerCase()] ?? mime.split("/")[1] ?? "bin";
  return { blob: new Blob([buffer], { type: mime }), mime, ext };
}

async function resolverAdjunto(
  adj: MkAdjunto,
  fallbackName: string,
): Promise<{ blob: Blob; filename: string }> {
  const url = adj.url ?? "";
  if (url.toLowerCase().startsWith("data:")) {
    const { blob, ext } = dataUrlABlob(url);
    const baseNombre = adj.nombre_original
      ? sanitizar(adj.nombre_original.replace(/\.[^.]+$/, ""))
      : `legacy_${adj.id}`;
    const tieneExt = /\.[^.\\/]+$/.test(baseNombre);
    const filename = tieneExt ? baseNombre : `${baseNombre}.${ext}`;
    return { blob, filename };
  }
  const blob = await fetchFile(url);
  return { blob, filename: fallbackName };
}

interface FacturaConMarcas extends MkFactura {
  marcas: MarcaConPorcentaje[];
}

export interface DatosZipProyecto {
  proyecto: MkProyecto;
  facturas: FacturaConMarcas[];
  adjuntosFacturas: MkAdjunto[];
  fotosProyecto: MkAdjunto[];
  marcasInvolucradas: MkMarca[];
}

function sanitizar(s: string): string {
  return s.replace(/[<>:"/\\|?*]+/g, "_").trim();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Formato "abril 2026" en español desde una fecha ISO.
function mesEjecucion(isoString: string | null): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${meses[d.getMonth()]} ${d.getFullYear()}`;
}

// ----------------------------------------------------------------------------
// Excel maestro — 1 hoja plana, 1 fila por factura, fila TOTALES con SUM().
//
// Columnas fijas:
//   1. Mes ejecución   (formato "abril 2026" desde fecha_enviado / created_at)
//   2. Cliente         (proyecto.tienda)
//   3. Proveedor       (factura.proveedor)
//   4. Detalle         (proyecto.nombre)
//   5. Monto factura dólares (factura.total)
// Columnas dinámicas (marcas asignadas al proyecto, en orden alfabético):
//   - Cobrable [Marca]  (total × 0.5 — regla 50/50)
// Última columna: Comentarios (vacía).
//
// Estilo: Arial 10/11, header fondo #1F1F1F texto blanco, bordes #BFBFBF,
// formato moneda $#,##0.00 en montos, alineación texto izq / monto der,
// freeze pane en fila 2.
// ----------------------------------------------------------------------------
function generarRespaldoExcel(
  proyecto: MkProyecto,
  facturas: FacturaConMarcas[],
  marcasDelProyecto: MkMarca[],
): Blob {
  const mes = mesEjecucion(proyecto.fecha_enviado ?? proyecto.created_at ?? null);
  const detalle = proyecto.nombre ?? proyecto.tienda ?? "";

  // Marcas en orden alfabético (estable entre descargas).
  const marcasOrden = [...marcasDelProyecto].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es"),
  );

  const header: string[] = [
    "Mes ejecución",
    "Cliente",
    "Proveedor",
    "Detalle",
    "Monto factura dólares",
    ...marcasOrden.map((m) => `Cobrable ${m.nombre}`),
    "Comentarios",
  ];

  type Celda = string | number;
  const rows: Celda[][] = facturas.map((f) => {
    const row: Celda[] = [
      mes,
      proyecto.tienda,
      f.proveedor,
      detalle,
      round2(f.total),
    ];
    for (const marca of marcasOrden) {
      const aplica = f.marcas.some((m) => m.marca.id === marca.id);
      row.push(aplica ? round2(f.total * 0.5) : 0);
    }
    row.push(""); // Comentarios
    return row;
  });

  // Construimos la matriz primero con valores numéricos para fila TOTALES,
  // luego inyectamos fórmulas SUM(...) reales en esas celdas.
  const placeholderTotales: Celda[] = [
    "", "", "TOTALES", "", 0,
    ...marcasOrden.map(() => 0),
    "",
  ];
  const aoa: Celda[][] = [header, ...rows, placeholderTotales];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const lastDataRow = 1 + rows.length; // 1-indexed: fila después del header
  const totalesRowIdx = range.e.r; // 0-indexed
  const numMontoCol = 4; // Monto factura dólares
  const cobrableCols: number[] = marcasOrden.map((_, i) => 5 + i);

  // Inyectar fórmulas SUM en la fila TOTALES.
  function colLetter(idx: number): string {
    return XLSX.utils.encode_col(idx);
  }
  function setFormulaSum(colIdx: number) {
    if (rows.length === 0) return;
    const addr = XLSX.utils.encode_cell({ r: totalesRowIdx, c: colIdx });
    const letter = colLetter(colIdx);
    const formula = `SUM(${letter}2:${letter}${lastDataRow})`;
    (ws as Record<string, unknown>)[addr] = { t: "n", f: formula };
  }
  setFormulaSum(numMontoCol);
  for (const c of cobrableCols) setFormulaSum(c);

  // ── Estilos ──
  const borderThin = { style: "thin", color: { rgb: "BFBFBF" } };
  const borders = {
    top: borderThin,
    bottom: borderThin,
    left: borderThin,
    right: borderThin,
  };
  const moneyFmt = "$#,##0.00";

  // Texto: alineación izquierda. Montos: derecha.
  const isMontoCol = (c: number): boolean =>
    c === numMontoCol || cobrableCols.includes(c);

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = (ws as Record<string, unknown>)[addr] as
        | { v?: unknown; s?: unknown; t?: unknown; f?: unknown; z?: string }
        | undefined;
      if (!cell) continue;

      const esHeader = r === 0;
      const esTotales = r === totalesRowIdx;
      const esMonto = isMontoCol(c);

      const baseFont = {
        name: "Arial",
        sz: esHeader ? 11 : 10,
        bold: esHeader || esTotales,
        color: esHeader ? { rgb: "FFFFFF" } : { rgb: "000000" },
      };

      const fill = esHeader
        ? { patternType: "solid", fgColor: { rgb: "1F1F1F" } }
        : esTotales
          ? { patternType: "solid", fgColor: { rgb: "EFEFEF" } }
          : undefined;

      cell.s = {
        font: baseFont,
        alignment: {
          vertical: "center",
          horizontal: esMonto && !esHeader ? "right" : "left",
          wrapText: true,
        },
        border: borders,
        ...(fill ? { fill } : {}),
      };

      if (esMonto && !esHeader) {
        cell.z = moneyFmt;
      }
    }
  }

  // Anchos de columna razonables.
  ws["!cols"] = [
    { wch: 16 }, // Mes ejecución
    { wch: 22 }, // Cliente
    { wch: 26 }, // Proveedor
    { wch: 30 }, // Detalle
    { wch: 18 }, // Monto factura dólares
    ...marcasOrden.map(() => ({ wch: 18 })), // Cobrable [Marca]
    { wch: 22 }, // Comentarios
  ];

  // Freeze pane: header siempre visible al hacer scroll.
  ws["!freeze"] = { xSplit: 0, ySplit: 1 } as unknown as Record<
    string,
    unknown
  >;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Facturas");

  const arrayBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ----------------------------------------------------------------------------
// Ensamblador principal
// ----------------------------------------------------------------------------

export type EtapaZip =
  | "Descargando facturas..."
  | "Procesando fotos..."
  | "Generando Excel..."
  | "Comprimiendo archivo...";

export interface GenerarZipOptions {
  onEtapa?: (etapa: EtapaZip) => void;
}

// Pequeño yield al event loop para que React repinte el UI con la nueva etapa
// antes de bloquearse en el siguiente await pesado.
function yieldUI(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export async function generarZipProyecto(
  datos: DatosZipProyecto,
  opts: GenerarZipOptions = {},
): Promise<void> {
  const { proyecto, facturas, adjuntosFacturas, fotosProyecto, marcasInvolucradas } = datos;
  const { onEtapa } = opts;
  const vigentes = facturas.filter((f) => !f.anulado_en);
  const zip = new JSZip();
  const errores: Array<{ id: string; tipo: string; razon: string }> = [];

  // Índice de adjuntos de factura por facturaId
  const adjuntosByFactura = new Map<string, MkAdjunto[]>();
  for (const a of adjuntosFacturas) {
    if (!a.factura_id) continue;
    const arr = adjuntosByFactura.get(a.factura_id) ?? [];
    arr.push(a);
    adjuntosByFactura.set(a.factura_id, arr);
  }

  // ── Etapa 1: descargar PDFs de facturas ──────────────────────────────────
  onEtapa?.("Descargando facturas...");
  await yieldUI();

  for (const marca of marcasInvolucradas) {
    const slug = sanitizar(marca.nombre);
    const folder = zip.folder(slug);
    if (!folder) continue;

    const facturasDeMarca = vigentes.filter((f) =>
      f.marcas.some((m) => m.marca.id === marca.id),
    );
    if (facturasDeMarca.length === 0) continue;

    for (const f of facturasDeMarca) {
      const adjs = adjuntosByFactura.get(f.id) ?? [];
      const pdfs = adjs.filter((a) => a.tipo === "pdf_factura");
      for (const a of pdfs) {
        try {
          const fallback = `${sanitizar(f.numero_factura)}.pdf`;
          const { blob, filename } = await resolverAdjunto(a, fallback);
          folder.file(filename, blob);
        } catch (err) {
          const razon = err instanceof Error ? err.message : "desconocido";
          console.warn(`[zip] factura adjunto ${a.id} skip: ${razon}`);
          errores.push({
            id: a.id,
            tipo: `pdf_factura (${f.numero_factura})`,
            razon,
          });
        }
      }
    }
  }

  // ── Etapa 2: procesar fotos del proyecto ─────────────────────────────────
  if (fotosProyecto.length > 0) {
    onEtapa?.("Procesando fotos...");
    await yieldUI();

    const fotosFolder = zip.folder("fotos");
    if (fotosFolder) {
      for (let i = 0; i < fotosProyecto.length; i++) {
        const foto = fotosProyecto[i];
        try {
          const ext = foto.nombre_original?.split(".").pop() ?? "jpg";
          const base = foto.nombre_original
            ? sanitizar(foto.nombre_original.replace(/\.[^.]+$/, ""))
            : `foto-${i + 1}`;
          const fallback = `${base}.${ext}`;
          const { blob, filename } = await resolverAdjunto(foto, fallback);
          fotosFolder.file(filename, blob);
        } catch (err) {
          const razon = err instanceof Error ? err.message : "desconocido";
          console.warn(`[zip] foto ${foto.id} skip: ${razon}`);
          errores.push({
            id: foto.id,
            tipo: `foto_proyecto${foto.nombre_original ? ` (${foto.nombre_original})` : ""}`,
            razon,
          });
        }
      }
    }
  }

  // ── Etapa 3: generar Excel maestro ───────────────────────────────────────
  onEtapa?.("Generando Excel...");
  await yieldUI();
  const excelBlob = generarRespaldoExcel(proyecto, vigentes, marcasInvolucradas);
  zip.file("respaldo.xlsx", excelBlob);

  if (errores.length > 0) {
    const lineas = [
      "Algunos adjuntos no se pudieron empaquetar en este ZIP.",
      "El resto del contenido (Excel y demás archivos) está OK.",
      "",
      "Adjuntos saltados:",
      ...errores.map((e) => `  • [${e.tipo}] id=${e.id} — ${e.razon}`),
    ];
    zip.file("README_errores.txt", lineas.join("\n"));
  }

  // ── Etapa 4: comprimir ZIP final ─────────────────────────────────────────
  onEtapa?.("Comprimiendo archivo...");
  await yieldUI();
  const blob = await zip.generateAsync({ type: "blob" });
  const nombre = sanitizar(proyecto.nombre ?? proyecto.tienda ?? "proyecto");
  saveAs(blob, `${nombre}.zip`);
}
