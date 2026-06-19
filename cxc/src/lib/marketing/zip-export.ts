// ============================================================================
// Marketing — Export ZIP "todo en uno" (server-side).
//
//   resumen_gastos.xlsx                          (hoja Gastos + hoja Fotos,
//                                                 con hyperlinks a cada PDF/foto)
//   <Cliente>/<Proyecto>/
//       fotos/<archivo>.jpg                      (foto_proyecto, comprimidas)
//       <fecha · concepto>/factura.pdf           (pdf_factura del gasto)
//   Sin cliente/<tienda · proyecto>/ …           (proyectos sin tienda_codigo)
//
// Patrón basado en src/lib/reclamos/zip-bulk.ts (jszip nodebuffer + sharp +
// concurrencia). Respeta el filtro de pantalla (busqueda + marca); incluye
// anulados marcados. Los links del Excel son signed URLs de larga duración
// (1 año) — las carpetas del ZIP son el respaldo permanente.
// ============================================================================

import JSZip from "jszip";
import sharp from "sharp";
import XLSX from "xlsx-js-style";
import { supabaseServer } from "@/lib/supabase-server";
import type { MkAdjunto, MkFactura, MkProyecto } from "./types";
import { esPathStorage } from "./storage";

const BUCKET = "marketing";
const MAX_DIM = 1600; // px — lado mayor de la foto tras redimensionar
const JPEG_QUALITY = 70;
const CONCURRENCY = 4; // descargas/compresiones simultáneas
const LINK_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 año

export interface ExportFiltro {
  busqueda?: string;
  marcaId?: string | null;
}

export interface ExportResult {
  buffer: Buffer;
  gastos: number;
  proyectos: number;
  fotosIncluidas: number;
  fotosOmitidas: number;
  pdfsIncluidos: number;
  pdfsOmitidos: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Limpia un texto para carpeta/archivo: conserva espacios y acentos, quita
 *  solo los caracteres peligrosos para rutas. */
function sanitizeName(s: string | null | undefined, fallback: string): string {
  const clean = (s || "")
    .trim()
    .replace(/[/\\:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return clean || fallback;
}

function truncar(s: string, max: number): string {
  const t = (s || "").trim();
  return t.length > max ? `${t.slice(0, max).trim()}…` : t;
}

/** Garantiza un nombre único dentro de un Set (sufijo -2, -3, …). */
function unico(nombre: string, usados: Set<string>): string {
  let candidato = nombre;
  let n = 2;
  while (usados.has(candidato.toLowerCase())) {
    candidato = `${nombre} (${n++})`;
  }
  usados.add(candidato.toLowerCase());
  return candidato;
}

/** Pool de concurrencia simple. */
async function mapLimit<T, R>(
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
async function descargar(url: string): Promise<Buffer | null> {
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
async function comprimirFoto(input: Buffer): Promise<Buffer | null> {
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

/** Firma en lote (1 año). Devuelve mapa path→signedUrl. Los paths que ya son
 *  URL absoluta se mapean a sí mismos. */
async function firmarLote(paths: ReadonlyArray<string>): Promise<Map<string, string>> {
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

const moneyFmt = "$#,##0.00";
const borderThin = { style: "thin", color: { rgb: "BFBFBF" } };
const borders = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin };
const linkFont = { name: "Arial", sz: 10, color: { rgb: "0563C1" }, underline: true };

function estilarHoja(
  ws: XLSX.WorkSheet,
  opts: { montoCols: number[]; linkCols: number[]; totalesRow?: number },
): void {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = (ws as Record<string, unknown>)[addr] as
        | { v?: unknown; s?: unknown; z?: string; l?: unknown }
        | undefined;
      if (!cell) continue;
      const esHeader = r === 0;
      const esTotales = opts.totalesRow !== undefined && r === opts.totalesRow;
      const esMonto = opts.montoCols.includes(c);
      const esLink = opts.linkCols.includes(c) && !esHeader && !!cell.l;
      cell.s = {
        font: esLink
          ? linkFont
          : {
              name: "Arial",
              sz: esHeader ? 11 : 10,
              bold: esHeader || esTotales,
              color: esHeader ? { rgb: "FFFFFF" } : { rgb: "000000" },
            },
        alignment: {
          vertical: "center",
          horizontal: esMonto && !esHeader ? "right" : "left",
          wrapText: true,
        },
        border: borders,
        ...(esHeader
          ? { fill: { patternType: "solid", fgColor: { rgb: "1F1F1F" } } }
          : esTotales
            ? { fill: { patternType: "solid", fgColor: { rgb: "EFEFEF" } } }
            : {}),
      };
      if (esMonto && !esHeader) cell.z = moneyFmt;
    }
  }
}

// ── Construcción principal ───────────────────────────────────────────────────

export async function buildMarketingZip(filtro: ExportFiltro): Promise<ExportResult> {
  const busqueda = (filtro.busqueda || "").trim();
  const marcaId = filtro.marcaId || null;

  // 1. Carga base (volumen chico: ~70 facturas / 18 proyectos / 122 adjuntos).
  const [facturasRes, proyectosRes, adjuntosRes, fmRes] = await Promise.all([
    supabaseServer.from("mk_facturas").select("*"),
    supabaseServer.from("mk_proyectos").select("*"),
    supabaseServer
      .from("mk_adjuntos")
      .select("*")
      .in("tipo", ["pdf_factura", "foto_proyecto"]),
    marcaId
      ? supabaseServer.from("mk_factura_marcas").select("factura_id, marca_id")
      : Promise.resolve({ data: [] as Array<{ factura_id: string; marca_id: string }>, error: null }),
  ]);
  if (facturasRes.error) throw new Error(`facturas: ${facturasRes.error.message}`);
  if (proyectosRes.error) throw new Error(`proyectos: ${proyectosRes.error.message}`);
  if (adjuntosRes.error) throw new Error(`adjuntos: ${adjuntosRes.error.message}`);
  if (fmRes.error) throw new Error(`factura_marcas: ${fmRes.error.message}`);

  const facturas = (facturasRes.data ?? []) as MkFactura[];
  const proyectos = (proyectosRes.data ?? []) as MkProyecto[];
  const adjuntos = (adjuntosRes.data ?? []) as MkAdjunto[];
  const proyectoById = new Map(proyectos.map((p) => [p.id, p]));

  // 2. Nombres de cliente (clientes_master por tienda_codigo).
  const codigos = Array.from(
    new Set(proyectos.map((p) => p.tienda_codigo).filter((c): c is string => !!c)),
  );
  const clienteNombrePorCodigo = new Map<string, string>();
  if (codigos.length > 0) {
    const { data } = await supabaseServer
      .from("clientes_master")
      .select("codigo, nombre")
      .in("codigo", codigos);
    for (const c of (data ?? []) as Array<{ codigo: string; nombre: string }>) {
      clienteNombrePorCodigo.set(c.codigo, c.nombre);
    }
  }

  // 3. Filtro por marca → proyectos con ≥1 factura de esa marca (igual que la
  //    pantalla, que filtra proyectos y muestra todas sus facturas).
  let proyectoIdsMarca: Set<string> | null = null;
  if (marcaId) {
    const factIdsMarca = new Set(
      (fmRes.data ?? [])
        .filter((r) => r.marca_id === marcaId)
        .map((r) => String(r.factura_id)),
    );
    proyectoIdsMarca = new Set(
      facturas.filter((f) => factIdsMarca.has(f.id)).map((f) => f.proyecto_id),
    );
  }

  // 4. Filtro por búsqueda → proyectos cuyo nombre/tienda matchea, o que tienen
  //    ≥1 factura que matchea (número, concepto o monto exacto).
  let proyectoIdsBusqueda: Set<string> | null = null;
  if (busqueda) {
    const term = busqueda.toLowerCase();
    const montoNum = Number(busqueda.replace(/,/g, ""));
    const hasMonto = busqueda.replace(/,/g, "").trim() !== "" && Number.isFinite(montoNum);
    const set = new Set<string>();
    for (const f of facturas) {
      if (
        (f.numero_factura || "").toLowerCase().includes(term) ||
        (f.concepto || "").toLowerCase().includes(term) ||
        (hasMonto && Number(f.total) === montoNum)
      ) {
        set.add(f.proyecto_id);
      }
    }
    for (const p of proyectos) {
      if (
        (p.nombre || "").toLowerCase().includes(term) ||
        (p.tienda || "").toLowerCase().includes(term)
      ) {
        set.add(p.id);
      }
    }
    proyectoIdsBusqueda = set;
  }

  const proyectoPasa = (pid: string): boolean => {
    if (proyectoIdsMarca && !proyectoIdsMarca.has(pid)) return false;
    if (proyectoIdsBusqueda && !proyectoIdsBusqueda.has(pid)) return false;
    return true;
  };

  // Proyectos seleccionados: pasan filtro y tienen ≥1 factura o ≥1 foto.
  const fotosPorProyecto = new Map<string, MkAdjunto[]>();
  for (const a of adjuntos) {
    if (a.tipo === "foto_proyecto" && a.proyecto_id) {
      const arr = fotosPorProyecto.get(a.proyecto_id) ?? [];
      arr.push(a);
      fotosPorProyecto.set(a.proyecto_id, arr);
    }
  }
  const facturasPorProyecto = new Map<string, MkFactura[]>();
  for (const f of facturas) {
    const arr = facturasPorProyecto.get(f.proyecto_id) ?? [];
    arr.push(f);
    facturasPorProyecto.set(f.proyecto_id, arr);
  }
  const pdfsPorFactura = new Map<string, MkAdjunto[]>();
  for (const a of adjuntos) {
    if (a.tipo === "pdf_factura" && a.factura_id) {
      const arr = pdfsPorFactura.get(a.factura_id) ?? [];
      arr.push(a);
      pdfsPorFactura.set(a.factura_id, arr);
    }
  }

  const proyectosSel = proyectos.filter(
    (p) =>
      proyectoPasa(p.id) &&
      ((facturasPorProyecto.get(p.id)?.length ?? 0) > 0 ||
        (fotosPorProyecto.get(p.id)?.length ?? 0) > 0),
  );
  if (proyectosSel.length === 0) {
    throw new Error("SIN_RESULTADOS");
  }
  const proyectoIdsSel = new Set(proyectosSel.map((p) => p.id));
  const facturasSel = facturas
    .filter((f) => proyectoIdsSel.has(f.proyecto_id))
    .sort((a, b) => (a.fecha_factura < b.fecha_factura ? -1 : 1));

  // 5. Firmar en lote todos los paths (PDFs de gastos + fotos de proyectos).
  const pathsAFirmar: string[] = [];
  for (const f of facturasSel) {
    for (const pdf of pdfsPorFactura.get(f.id) ?? []) pathsAFirmar.push(pdf.url);
  }
  for (const p of proyectosSel) {
    for (const foto of fotosPorProyecto.get(p.id) ?? []) pathsAFirmar.push(foto.url);
  }
  const urlFirmada = await firmarLote(pathsAFirmar);

  // 6. Nombres de carpeta.
  const clienteFolder = (p: MkProyecto): string => {
    const nombre = p.tienda_codigo ? clienteNombrePorCodigo.get(p.tienda_codigo) : null;
    return nombre ? sanitizeName(nombre, "Cliente") : "Sin cliente";
  };
  const proyectoFolder = (p: MkProyecto): string => {
    const base = p.nombre?.trim() || p.tienda?.trim() || "Proyecto";
    if (!p.tienda_codigo) {
      const t = p.tienda?.trim();
      const label = t && base !== t ? `${t} · ${base}` : base;
      return sanitizeName(label, "Proyecto");
    }
    return sanitizeName(base, "Proyecto");
  };

  // 7. Armar el ZIP.
  const zip = new JSZip();
  let fotosIncluidas = 0;
  let fotosOmitidas = 0;
  let pdfsIncluidos = 0;
  let pdfsOmitidos = 0;

  // Carpetas por proyecto + dedupe de subcarpetas de gasto dentro de cada uno.
  const rutaProyecto = new Map<string, string>();
  const usadosPorProyecto = new Map<string, Set<string>>();
  for (const p of proyectosSel) {
    rutaProyecto.set(p.id, `${clienteFolder(p)}/${proyectoFolder(p)}`);
    usadosPorProyecto.set(p.id, new Set<string>());
  }

  // 7a. PDFs de cada gasto.
  await mapLimit(facturasSel, CONCURRENCY, async (f) => {
    const pdfs = pdfsPorFactura.get(f.id) ?? [];
    if (pdfs.length === 0) return;
    const baseDir = rutaProyecto.get(f.proyecto_id)!;
    const usados = usadosPorProyecto.get(f.proyecto_id)!;
    const sub = unico(
      sanitizeName(`${f.fecha_factura} · ${truncar(f.concepto, 50)}`, f.numero_factura || "gasto"),
      usados,
    );
    let idx = 0;
    for (const pdf of pdfs) {
      const buf = await descargar(pdf.url);
      if (!buf) {
        pdfsOmitidos++;
        continue;
      }
      const nombre = pdfs.length > 1 ? `factura-${++idx}.pdf` : "factura.pdf";
      zip.file(`${baseDir}/${sub}/${nombre}`, buf);
      pdfsIncluidos++;
    }
  });

  // 7b. Fotos de cada proyecto (comprimidas).
  for (const p of proyectosSel) {
    const fotos = fotosPorProyecto.get(p.id) ?? [];
    const baseDir = rutaProyecto.get(p.id)!;
    await mapLimit(fotos, CONCURRENCY, async (foto, i) => {
      const raw = await descargar(foto.url);
      const out = raw ? await comprimirFoto(raw) : null;
      if (!out) {
        fotosOmitidas++;
        return;
      }
      const original = sanitizeName(foto.nombre_original?.replace(/\.[^.]+$/, ""), `foto_${i + 1}`);
      zip.file(`${baseDir}/fotos/${original}.jpg`, out);
      fotosIncluidas++;
    });
  }

  // 8. Excel resumen_gastos.xlsx (hoja Gastos + hoja Fotos, con hyperlinks).
  const wb = XLSX.utils.book_new();

  // Hoja Gastos: 1 fila por gasto.
  const headGastos = [
    "Cliente", "Proyecto", "Fecha", "Concepto", "Proveedor", "N° Factura",
    "Subtotal", "ITBMS", "Total", "Estado pago", "Anulado", "Factura PDF",
  ];
  const filasGastos: (string | number)[][] = facturasSel.map((f) => {
    const p = proyectoById.get(f.proyecto_id);
    const nombreCliente = p?.tienda_codigo
      ? clienteNombrePorCodigo.get(p.tienda_codigo) ?? "Sin cliente"
      : "Sin cliente";
    const anulado = !!(f.anulado_en || p?.anulado_en);
    return [
      nombreCliente,
      p?.nombre?.trim() || p?.tienda || "—",
      f.fecha_factura || "",
      f.concepto || "",
      f.proveedor || "",
      f.numero_factura || "",
      Number(f.subtotal ?? 0),
      Number(f.itbms ?? 0),
      Number(f.total ?? 0),
      f.estado_pago === "pagado" ? "Pagado" : "Pendiente",
      anulado ? "ANULADO" : "",
      "", // link (se setea abajo)
    ];
  });
  const placeholderTot = [
    "", "", "", "", "", "TOTALES", 0, 0, 0, "", "", "",
  ];
  const aoaGastos = [headGastos, ...filasGastos, placeholderTot];
  const wsG = XLSX.utils.aoa_to_sheet(aoaGastos);
  const totalesRow = aoaGastos.length - 1;
  const lastDataRow = filasGastos.length + 1; // 1-indexed
  // Fórmulas SUM en Subtotal(6), ITBMS(7), Total(8).
  if (filasGastos.length > 0) {
    for (const c of [6, 7, 8]) {
      const letter = XLSX.utils.encode_col(c);
      const addr = XLSX.utils.encode_cell({ r: totalesRow, c });
      (wsG as Record<string, unknown>)[addr] = {
        t: "n",
        f: `SUM(${letter}2:${letter}${lastDataRow})`,
      };
    }
  }
  // Hyperlinks de la columna "Factura PDF" (col 11).
  facturasSel.forEach((f, i) => {
    const pdfs = pdfsPorFactura.get(f.id) ?? [];
    const path = pdfs[0]?.url;
    const signed = path ? urlFirmada.get(path) : undefined;
    const addr = XLSX.utils.encode_cell({ r: i + 1, c: 11 });
    if (signed) {
      (wsG as Record<string, unknown>)[addr] = {
        t: "s",
        v: "Ver factura",
        l: { Target: signed, Tooltip: "Abrir PDF de la factura" },
      };
    } else {
      (wsG as Record<string, unknown>)[addr] = { t: "s", v: "—" };
    }
  });
  wsG["!cols"] = [
    { wch: 24 }, { wch: 26 }, { wch: 12 }, { wch: 34 }, { wch: 22 }, { wch: 14 },
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 13 }, { wch: 11 }, { wch: 16 },
  ];
  wsG["!freeze"] = { xSplit: 0, ySplit: 1 } as unknown as Record<string, unknown>;
  estilarHoja(wsG, { montoCols: [6, 7, 8], linkCols: [11], totalesRow });
  XLSX.utils.book_append_sheet(wb, wsG, "Gastos");

  // Hoja Fotos: 1 fila por foto (link a cada una).
  const headFotos = ["Cliente", "Proyecto", "Archivo", "Foto"];
  const filasFotos: (string | number)[][] = [];
  const linksFotos: (string | undefined)[] = [];
  for (const p of proyectosSel) {
    const nombreCliente = p.tienda_codigo
      ? clienteNombrePorCodigo.get(p.tienda_codigo) ?? "Sin cliente"
      : "Sin cliente";
    const fotos = fotosPorProyecto.get(p.id) ?? [];
    fotos.forEach((foto, i) => {
      filasFotos.push([
        nombreCliente,
        p.nombre?.trim() || p.tienda || "—",
        foto.nombre_original || `foto_${i + 1}`,
        "",
      ]);
      linksFotos.push(foto.url ? urlFirmada.get(foto.url) : undefined);
    });
  }
  const aoaFotos = [headFotos, ...filasFotos];
  const wsF = XLSX.utils.aoa_to_sheet(aoaFotos);
  linksFotos.forEach((signed, i) => {
    const addr = XLSX.utils.encode_cell({ r: i + 1, c: 3 });
    if (signed) {
      (wsF as Record<string, unknown>)[addr] = {
        t: "s",
        v: "Ver foto",
        l: { Target: signed, Tooltip: "Abrir foto" },
      };
    } else {
      (wsF as Record<string, unknown>)[addr] = { t: "s", v: "—" };
    }
  });
  wsF["!cols"] = [{ wch: 24 }, { wch: 26 }, { wch: 32 }, { wch: 14 }];
  wsF["!freeze"] = { xSplit: 0, ySplit: 1 } as unknown as Record<string, unknown>;
  estilarHoja(wsF, { montoCols: [], linkCols: [3] });
  XLSX.utils.book_append_sheet(wb, wsF, "Fotos");

  const xlsxBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  zip.file("resumen_gastos.xlsx", xlsxBuf);

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return {
    buffer,
    gastos: facturasSel.length,
    proyectos: proyectosSel.length,
    fotosIncluidas,
    fotosOmitidas,
    pdfsIncluidos,
    pdfsOmitidos,
  };
}
