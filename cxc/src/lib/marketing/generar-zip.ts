// ============================================================================
// Marketing — generación de ZIP por proyecto (client-side)
// ============================================================================
// Estructura del ZIP:
//   <Proyecto>.zip
//     ├── respaldo.xlsx                 (todas las facturas con splits)
//     ├── <Marca>/
//     │     ├── cobranza-<marca>.pdf    (PDF consolidado de esa marca)
//     │     └── facturas/<numero>.pdf   (copias de PDFs originales)
//     └── fotos/                        (fotos del proyecto)
//
// Este reemplaza el flujo previo que dependía de mk_cobranzas.
// ============================================================================

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import XLSX from "xlsx-js-style";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } from "@/lib/pdf-logo";
import { formatearMonto, formatearFecha } from "./normalizar";
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

// Decodifica una data URL (data:<mime>;base64,<payload>) a Blob.
// Si el formato está corrupto tira Error — el caller decide si skippear.
function dataUrlABlob(dataUrl: string): { blob: Blob; mime: string; ext: string } {
  const idx = dataUrl.indexOf(",");
  if (!dataUrl.toLowerCase().startsWith("data:") || idx < 0) {
    throw new Error("data URL malformada");
  }
  const meta = dataUrl.slice(5, idx); // después de "data:"
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

// Devuelve { blob, nombreArchivo } para cualquier adjunto, sea Storage o data URL.
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

// ----------------------------------------------------------------------------
// PDF consolidado por marca
// ----------------------------------------------------------------------------
function generarPdfMarca(
  proyecto: MkProyecto,
  marca: MkMarca,
  facturas: FacturaConMarcas[],
): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  let y = 12;

  // FG_LOGO_BASE64 es JPEG (empieza con /9j/). Pasar "PNG" hacía que jsPDF
  // tirara "wrong PNG signature" + el browser hacía GET data:image/jpeg;...
  // → ERR_INVALID_URL. Confirmado: todos los demás módulos usan "JPEG".
  doc.addImage(FG_LOGO_BASE64, "JPEG", 12, y, FG_LOGO_WIDTH, FG_LOGO_HEIGHT);
  y += FG_LOGO_HEIGHT + 4;
  doc.setFontSize(14).setFont("helvetica", "bold");
  doc.text(`Cobranza — ${marca.nombre}`, 12, y);
  y += 6;
  doc.setFontSize(10).setFont("helvetica", "normal");
  doc.text(`Proyecto: ${proyecto.nombre ?? proyecto.tienda}`, 12, y);
  y += 5;
  doc.text(`Tienda: ${proyecto.tienda}`, 12, y);
  y += 5;
  doc.text(`Fecha: ${formatearFecha(new Date())}`, 12, y);
  y += 8;

  // Tabla de facturas: Nº | Fecha | Proveedor | Concepto | Total | % | Cobrable
  const rows = facturas
    .map((f) => {
      const mm = f.marcas.find((m) => m.marca.id === marca.id);
      if (!mm) return null;
      const cobrable = round2((f.total * mm.porcentaje) / 100);
      return [
        f.numero_factura,
        formatearFecha(f.fecha_factura),
        f.proveedor,
        f.concepto,
        formatearMonto(f.total),
        `${mm.porcentaje}%`,
        formatearMonto(cobrable),
      ];
    })
    .filter((r): r is string[] => r !== null);

  const totalCobrable = rows.reduce((acc, r) => {
    const n = Number(r[6].replace(/[^0-9.-]/g, ""));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);

  autoTable(doc, {
    startY: y,
    head: [["Nº Factura", "Fecha", "Proveedor", "Concepto", "Total", "%", "Cobrable"]],
    body: rows,
    foot: [["", "", "", "", "", "Total", formatearMonto(totalCobrable)]],
    headStyles: { fillColor: [31, 41, 55], textColor: 255 },
    footStyles: { fillColor: [243, 244, 246], textColor: 0, fontStyle: "bold" },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
    margin: { left: 12, right: 12 },
  });

  return doc.output("blob");
}

// ----------------------------------------------------------------------------
// Excel maestro de respaldo
// ----------------------------------------------------------------------------
function generarRespaldoExcel(
  proyecto: MkProyecto,
  facturas: FacturaConMarcas[],
  marcasInvolucradas: MkMarca[],
): Blob {
  // Hoja 1: resumen
  const resumenRows: (string | number)[][] = [
    ["Proyecto", proyecto.nombre ?? proyecto.tienda],
    ["Tienda", proyecto.tienda],
    ["Estado", proyecto.estado],
    [
      "Fecha enviado",
      proyecto.fecha_enviado ? formatearFecha(proyecto.fecha_enviado) : "—",
    ],
    [
      "Fecha cobrado",
      proyecto.fecha_cobrado ? formatearFecha(proyecto.fecha_cobrado) : "—",
    ],
    [],
    ["Totales por marca"],
    ["Marca", "Cobrable"],
  ];
  for (const marca of marcasInvolucradas) {
    const suma = facturas.reduce((acc, f) => {
      const mm = f.marcas.find((m) => m.marca.id === marca.id);
      if (!mm) return acc;
      return acc + (f.total * mm.porcentaje) / 100;
    }, 0);
    resumenRows.push([marca.nombre, round2(suma)]);
  }

  // Hoja 2: detalle por factura con split por marca
  const detalleHeader = [
    "Nº Factura",
    "Fecha",
    "Proveedor",
    "Concepto",
    "Subtotal",
    "ITBMS",
    "Total",
    ...marcasInvolucradas.flatMap((m) => [`% ${m.nombre}`, `Cobrable ${m.nombre}`]),
  ];
  const detalleRows = facturas.map((f) => {
    const base: (string | number)[] = [
      f.numero_factura,
      formatearFecha(f.fecha_factura),
      f.proveedor,
      f.concepto,
      f.subtotal,
      f.itbms,
      f.total,
    ];
    for (const marca of marcasInvolucradas) {
      const mm = f.marcas.find((m) => m.marca.id === marca.id);
      if (!mm) {
        base.push(0, 0);
      } else {
        base.push(mm.porcentaje, round2((f.total * mm.porcentaje) / 100));
      }
    }
    return base;
  });

  const wb = XLSX.utils.book_new();
  const wsResumen = XLSX.utils.aoa_to_sheet(resumenRows);
  const wsDetalle = XLSX.utils.aoa_to_sheet([detalleHeader, ...detalleRows]);
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
  XLSX.utils.book_append_sheet(wb, wsDetalle, "Facturas");

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

  // Una carpeta por marca
  for (const marca of marcasInvolucradas) {
    const slug = sanitizar(marca.nombre);
    const folder = zip.folder(slug);
    if (!folder) continue;

    // PDF consolidado
    const facturasDeMarca = vigentes.filter((f) =>
      f.marcas.some((m) => m.marca.id === marca.id),
    );
    if (facturasDeMarca.length > 0) {
      const pdf = generarPdfMarca(proyecto, marca, facturasDeMarca);
      folder.file(`cobranza-${slug.toLowerCase()}.pdf`, pdf);

      // Copias de facturas originales (Storage o data URL legacy)
      const facturasFolder = folder.folder("facturas");
      if (facturasFolder) {
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
              console.warn(
                `[zip] factura adjunto ${a.id} skip: ${razon}`,
              );
              errores.push({
                id: a.id,
                tipo: `pdf_factura (${f.numero_factura})`,
                razon,
              });
            }
          }
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

  // Si hubo adjuntos saltados, dejar README para el usuario.
  if (errores.length > 0) {
    const lineas = [
      "Algunos adjuntos no se pudieron empaquetar en este ZIP.",
      "El resto del contenido (facturas PDF, Excel, y demás fotos) está OK.",
      "",
      "Adjuntos saltados:",
      ...errores.map((e) => `  • [${e.tipo}] id=${e.id} — ${e.razon}`),
      "",
      "Si un adjunto aparece aquí repetidamente, probablemente está guardado",
      "en un formato legacy (data URL en mk_adjuntos.url) con data corrupta",
      "o falta el archivo en Storage. Reporta el id al equipo.",
    ];
    zip.file("README_errores.txt", lineas.join("\n"));
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const nombre = sanitizar(proyecto.nombre ?? proyecto.tienda ?? "proyecto");
  saveAs(blob, `${nombre}.zip`);
}
