// ============================================================================
// Marketing — generación de ZIP por proyecto (client-side)
// ============================================================================
// Estructura del ZIP:
//   <Proyecto>.zip
//     ├── respaldo.xlsx                 (1 hoja, 1 fila por factura)
//     ├── <Marca>/
//     │     └── facturas/<numero>.pdf   (copias de PDFs originales)
//     └── fotos/                        (fotos del proyecto)
//
// Nota: ya no se genera "cobranza-<marca>.pdf" — simplificación pedida.
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
// Excel maestro — 1 hoja, 1 fila por factura, fila TOTALES al final
// ----------------------------------------------------------------------------
function generarRespaldoExcel(
  proyecto: MkProyecto,
  facturas: FacturaConMarcas[],
  marcasDelProyecto: MkMarca[],
): Blob {
  const mes = mesEjecucion(proyecto.fecha_enviado ?? proyecto.created_at ?? null);
  const nombreProy = proyecto.nombre ?? proyecto.tienda ?? "";

  // Columnas fijas + dinámicas por marca + comentarios al final
  const header: string[] = [
    "Mes ejecución",
    "Proyecto",
    "Tienda",
    "Proveedor",
    "Factura N°",
    "Detalle",
    "Subtotal",
    "ITBMS",
    "Total",
    ...marcasDelProyecto.flatMap((m) => [`% ${m.nombre}`, `Cobrable ${m.nombre}`]),
    "Comentarios",
  ];

  // Body
  type Celda = string | number;
  const rows: Celda[][] = facturas.map((f) => {
    const row: Celda[] = [
      mes,
      nombreProy,
      proyecto.tienda,
      f.proveedor,
      f.numero_factura,
      nombreProy, // Detalle = mismo que Proyecto, confirmado por Daniel
      round2(f.subtotal),
      round2(f.itbms),
      round2(f.total),
    ];
    for (const marca of marcasDelProyecto) {
      const mm = f.marcas.find((m) => m.marca.id === marca.id);
      if (!mm) {
        row.push(0, 0);
      } else {
        row.push(mm.porcentaje, round2((f.total * mm.porcentaje) / 100));
      }
    }
    row.push(""); // Comentarios vacío
    return row;
  });

  // Fila TOTALES
  const sumCol = (idx: number): number =>
    round2(rows.reduce((acc, r) => acc + (Number(r[idx]) || 0), 0));
  const totalesRow: Celda[] = [
    "", "",
    "",
    "TOTALES", // en columna Proveedor
    "", "",
    sumCol(6), // Subtotal
    sumCol(7), // ITBMS
    sumCol(8), // Total
  ];
  for (let i = 0; i < marcasDelProyecto.length; i++) {
    const pctIdx = 9 + i * 2;
    const cobIdx = 10 + i * 2;
    totalesRow.push("");       // % — vacío
    totalesRow.push(sumCol(cobIdx));
  }
  totalesRow.push("");

  const aoa: Celda[][] = [header, ...rows, totalesRow];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Estilo: header bold + bordes simples. Bordes también en filas de datos.
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const borderThin = { style: "thin", color: { rgb: "000000" } };
  const borders = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin };

  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const addr = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = (ws as Record<string, unknown>)[addr] as
        | { v?: unknown; s?: unknown; t?: unknown }
        | undefined;
      if (!cell) continue;
      const esHeader = row === 0;
      const esTotales = row === range.e.r;
      cell.s = {
        font: { bold: esHeader || esTotales, sz: 10 },
        alignment: { vertical: "center", wrapText: true },
        border: borders,
      };
    }
  }

  // Anchos aproximados
  ws["!cols"] = [
    { wch: 16 }, // Mes ejecución
    { wch: 24 }, // Proyecto
    { wch: 16 }, // Tienda
    { wch: 24 }, // Proveedor
    { wch: 14 }, // Factura N°
    { wch: 24 }, // Detalle
    { wch: 12 }, { wch: 12 }, { wch: 12 }, // Subtotal/ITBMS/Total
    ...marcasDelProyecto.flatMap(() => [{ wch: 10 }, { wch: 14 }]),
    { wch: 24 }, // Comentarios
  ];

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
export async function generarZipProyecto(
  datos: DatosZipProyecto,
): Promise<void> {
  const { proyecto, facturas, adjuntosFacturas, fotosProyecto, marcasInvolucradas } = datos;
  const vigentes = facturas.filter((f) => !f.anulado_en);
  const zip = new JSZip();
  const errores: Array<{ id: string; tipo: string; razon: string }> = [];

  // Excel maestro
  const excelBlob = generarRespaldoExcel(proyecto, vigentes, marcasInvolucradas);
  zip.file("respaldo.xlsx", excelBlob);

  // Índice de adjuntos de factura por facturaId
  const adjuntosByFactura = new Map<string, MkAdjunto[]>();
  for (const a of adjuntosFacturas) {
    if (!a.factura_id) continue;
    const arr = adjuntosByFactura.get(a.factura_id) ?? [];
    arr.push(a);
    adjuntosByFactura.set(a.factura_id, arr);
  }

  // Una carpeta por marca, con los PDFs originales de sus facturas.
  for (const marca of marcasInvolucradas) {
    const slug = sanitizar(marca.nombre);
    const folder = zip.folder(slug);
    if (!folder) continue;

    const facturasDeMarca = vigentes.filter((f) =>
      f.marcas.some((m) => m.marca.id === marca.id),
    );
    if (facturasDeMarca.length === 0) continue;

    const facturasFolder = folder.folder("facturas");
    if (!facturasFolder) continue;

    for (const f of facturasDeMarca) {
      const adjs = adjuntosByFactura.get(f.id) ?? [];
      const pdfs = adjs.filter((a) => a.tipo === "pdf_factura");
      for (const a of pdfs) {
        try {
          const fallback = `${sanitizar(f.numero_factura)}.pdf`;
          const { blob, filename } = await resolverAdjunto(a, fallback);
          facturasFolder.file(filename, blob);
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

  // Fotos del proyecto
  if (fotosProyecto.length > 0) {
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

  const blob = await zip.generateAsync({ type: "blob" });
  const nombre = sanitizar(proyecto.nombre ?? proyecto.tienda ?? "proyecto");
  saveAs(blob, `${nombre}.zip`);
}
