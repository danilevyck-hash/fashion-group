// ============================================================================
// Marketing — Export ZIP "todo en uno" (server-side).
//
//   resumen_gastos.xlsx                          (hoja Gastos + hoja Fotos,
//                                                 con hyperlinks a cada PDF/foto)
//   <Cliente>/
//       fotos/<archivo>.jpg                      (foto_proyecto, comprimidas)
//       <fecha · concepto>/factura.pdf           (pdf_factura del gasto)
//   Sin cliente/ …                               (proyectos sin tienda_codigo)
//
// El contenido cuelga DIRECTO de la carpeta del cliente — sin nivel de carpeta
// por proyecto. Los gastos y proyectos ANULADOS se excluyen por completo (no se
// descargan ni aparecen en el Excel). La hoja Gastos incluye facturas
// (mk_facturas) Y gastos de muebles (mk_entregas_muebles, Proveedor "Mobiliario")
// para que el TOTAL cuadre con el "Gastado" de la pantalla. Patrón basado en
// src/lib/reclamos/
// zip-bulk.ts (jszip nodebuffer + sharp + concurrencia). Respeta el filtro de
// pantalla (busqueda + marca). Los links del Excel son signed URLs de larga
// duración (1 año) — las carpetas del ZIP son el respaldo permanente.
// ============================================================================

import JSZip from "jszip";
import sharp from "sharp";
import XLSX from "xlsx-js-style";
import { supabaseServer } from "@/lib/supabase-server";
import type { MkAdjunto, MkFactura, MkProyecto } from "./types";
import { esPathStorage } from "./storage";
import { signGalleryToken } from "./gallery-token";

const BUCKET = "marketing";
const MAX_DIM = 1600; // px — lado mayor de la foto tras redimensionar
const JPEG_QUALITY = 70;
const CONCURRENCY = 4; // descargas/compresiones simultáneas
const LINK_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 año
// Base para los links de galería del Excel (la galería re-firma fotos al abrir).
const GALERIA_BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.fashiongr.com";

export interface ExportFiltro {
  busqueda?: string;
  marcaId?: string | null;
}

// Gasto de muebles (submódulo Mobiliario) — entra al Excel como fila más para
// que el TOTAL cuadre con el "Gastado" de la pantalla (Σ facturas + Σ muebles).
interface EntregaExport {
  proyecto_id: string;
  total: number;
  notas: string | null;
  created_at: string;
  total_por_marca: Record<string, number> | null;
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

// ── Construcción principal ───────────────────────────────────────────────────

export async function buildMarketingZip(filtro: ExportFiltro): Promise<ExportResult> {
  const busqueda = (filtro.busqueda || "").trim();
  const marcaId = filtro.marcaId || null;

  // 1. Carga base (volumen chico: ~70 facturas / 18 proyectos / 122 adjuntos).
  const [facturasRes, proyectosRes, adjuntosRes, fmRes, entregasRes, marcasRes] = await Promise.all([
    supabaseServer.from("mk_facturas").select("*"),
    supabaseServer.from("mk_proyectos").select("*"),
    supabaseServer
      .from("mk_adjuntos")
      .select("*")
      .in("tipo", ["pdf_factura", "foto_proyecto"]),
    // Marca por factura (SIEMPRE — alimenta la columna Marca y el filtro por marca).
    supabaseServer.from("mk_factura_marcas").select("factura_id, marca_id"),
    // Gastos de muebles asignados a un proyecto (proyecto_id no nulo = no
    // pendientes). mk_entregas_muebles NO tiene columna de anulado.
    supabaseServer
      .from("mk_entregas_muebles")
      .select("proyecto_id, total, notas, created_at, total_por_marca")
      .not("proyecto_id", "is", null),
    // Catálogo de marcas (id → nombre completo + sigla) para las columnas Marca/Marcas.
    supabaseServer.from("mk_marcas").select("id, nombre, codigo"),
  ]);
  if (facturasRes.error) throw new Error(`facturas: ${facturasRes.error.message}`);
  if (proyectosRes.error) throw new Error(`proyectos: ${proyectosRes.error.message}`);
  if (adjuntosRes.error) throw new Error(`adjuntos: ${adjuntosRes.error.message}`);
  if (fmRes.error) throw new Error(`factura_marcas: ${fmRes.error.message}`);
  if (entregasRes.error) throw new Error(`entregas: ${entregasRes.error.message}`);
  if (marcasRes.error) throw new Error(`marcas: ${marcasRes.error.message}`);

  const facturas = (facturasRes.data ?? []) as MkFactura[];
  const proyectos = (proyectosRes.data ?? []) as MkProyecto[];
  const adjuntos = (adjuntosRes.data ?? []) as MkAdjunto[];
  const entregas = (entregasRes.data ?? []) as EntregaExport[];
  const proyectoById = new Map(proyectos.map((p) => [p.id, p]));

  // Marca: catálogo id→nombre completo y lista de marca_id por factura.
  const marcaCat = (marcasRes.data ?? []) as Array<{ id: string; nombre: string; codigo: string }>;
  const marcaNombreById = new Map(marcaCat.map((m) => [String(m.id), String(m.nombre)]));
  const marcaCodigoById = new Map(marcaCat.map((m) => [String(m.id), String(m.codigo)]));
  const marcasByFactura = new Map<string, string[]>();
  for (const r of (fmRes.data ?? []) as Array<{ factura_id: string; marca_id: string }>) {
    const arr = marcasByFactura.get(String(r.factura_id)) ?? [];
    arr.push(String(r.marca_id));
    marcasByFactura.set(String(r.factura_id), arr);
  }

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

  // Proyectos/gastos ANULADOS se excluyen por completo del ZIP y del Excel.
  // Un gasto se excluye si está anulado él mismo o si su proyecto está en
  // papelera (anulado_en). Un proyecto anulado no aporta fotos ni gastos.
  const fotosPorProyecto = new Map<string, MkAdjunto[]>();
  for (const a of adjuntos) {
    if (a.tipo === "foto_proyecto" && a.proyecto_id) {
      const arr = fotosPorProyecto.get(a.proyecto_id) ?? [];
      arr.push(a);
      fotosPorProyecto.set(a.proyecto_id, arr);
    }
  }
  const facturasActivas = facturas.filter(
    (f) => !f.anulado_en && !proyectoById.get(f.proyecto_id)?.anulado_en,
  );
  const facturasPorProyecto = new Map<string, MkFactura[]>();
  for (const f of facturasActivas) {
    const arr = facturasPorProyecto.get(f.proyecto_id) ?? [];
    arr.push(f);
    facturasPorProyecto.set(f.proyecto_id, arr);
  }
  // Entregas de muebles activas (proyecto no en papelera).
  const entregasActivas = entregas.filter(
    (e) => !proyectoById.get(e.proyecto_id)?.anulado_en,
  );
  const entregasPorProyecto = new Map<string, EntregaExport[]>();
  for (const e of entregasActivas) {
    const arr = entregasPorProyecto.get(e.proyecto_id) ?? [];
    arr.push(e);
    entregasPorProyecto.set(e.proyecto_id, arr);
  }
  const pdfsPorFactura = new Map<string, MkAdjunto[]>();
  for (const a of adjuntos) {
    if (a.tipo === "pdf_factura" && a.factura_id) {
      const arr = pdfsPorFactura.get(a.factura_id) ?? [];
      arr.push(a);
      pdfsPorFactura.set(a.factura_id, arr);
    }
  }

  // Proyectos seleccionados: NO anulados, pasan filtro y tienen ≥1 gasto
  // activo (factura o mueble) o ≥1 foto.
  const proyectosSel = proyectos.filter(
    (p) =>
      !p.anulado_en &&
      proyectoPasa(p.id) &&
      ((facturasPorProyecto.get(p.id)?.length ?? 0) > 0 ||
        (fotosPorProyecto.get(p.id)?.length ?? 0) > 0 ||
        (entregasPorProyecto.get(p.id)?.length ?? 0) > 0),
  );
  if (proyectosSel.length === 0) {
    throw new Error("SIN_RESULTADOS");
  }
  const proyectoIdsSel = new Set(proyectosSel.map((p) => p.id));
  const facturasSel = facturasActivas
    .filter((f) => proyectoIdsSel.has(f.proyecto_id))
    .sort((a, b) => (a.fecha_factura < b.fecha_factura ? -1 : 1));
  const entregasSel = entregasActivas
    .filter((e) => proyectoIdsSel.has(e.proyecto_id))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  // 5. Firmar en lote todos los paths (PDFs de gastos + fotos de proyectos).
  const pathsAFirmar: string[] = [];
  for (const f of facturasSel) {
    for (const pdf of pdfsPorFactura.get(f.id) ?? []) pathsAFirmar.push(pdf.url);
  }
  for (const p of proyectosSel) {
    for (const foto of fotosPorProyecto.get(p.id) ?? []) pathsAFirmar.push(foto.url);
  }
  const urlFirmada = await firmarLote(pathsAFirmar);

  // 6. Nombre de carpeta de cliente. El contenido cuelga DIRECTO aquí — sin
  //    nivel de carpeta por proyecto.
  const clienteFolder = (p: MkProyecto): string => {
    const nombre = p.tienda_codigo ? clienteNombrePorCodigo.get(p.tienda_codigo) : null;
    return nombre ? sanitizeName(nombre, "Cliente") : "Sin cliente";
  };

  // 7. Armar el ZIP.
  const zip = new JSZip();
  let fotosIncluidas = 0;
  let fotosOmitidas = 0;
  let pdfsIncluidos = 0;
  let pdfsOmitidos = 0;

  // Carpeta destino por proyecto = SOLO la del cliente (sin nivel de proyecto).
  // El dedupe de subcarpetas de gasto y de nombres de foto es POR CLIENTE,
  // porque varios proyectos del mismo cliente comparten su carpeta.
  const rutaCliente = new Map<string, string>();
  const usadosGastoPorCliente = new Map<string, Set<string>>();
  const usadosFotoPorCliente = new Map<string, Set<string>>();
  const getSet = (map: Map<string, Set<string>>, key: string): Set<string> => {
    let s = map.get(key);
    if (!s) {
      s = new Set<string>();
      map.set(key, s);
    }
    return s;
  };
  for (const p of proyectosSel) {
    rutaCliente.set(p.id, clienteFolder(p));
  }

  // 7a. PDFs de cada gasto.
  await mapLimit(facturasSel, CONCURRENCY, async (f) => {
    const pdfs = pdfsPorFactura.get(f.id) ?? [];
    if (pdfs.length === 0) return;
    const baseDir = rutaCliente.get(f.proyecto_id)!;
    const usados = getSet(usadosGastoPorCliente, baseDir);
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

  // 7b. Fotos de cada proyecto (comprimidas). Cuelgan de <Cliente>/fotos/ —
  // dedupe de nombre por cliente para no pisar fotos de otro proyecto.
  for (const p of proyectosSel) {
    const fotos = fotosPorProyecto.get(p.id) ?? [];
    const baseDir = rutaCliente.get(p.id)!;
    const usadosFoto = getSet(usadosFotoPorCliente, baseDir);
    await mapLimit(fotos, CONCURRENCY, async (foto, i) => {
      const raw = await descargar(foto.url);
      const out = raw ? await comprimirFoto(raw) : null;
      if (!out) {
        fotosOmitidas++;
        return;
      }
      const original = sanitizeName(foto.nombre_original?.replace(/\.[^.]+$/, ""), `foto_${i + 1}`);
      const nombreUnico = unico(original, usadosFoto);
      zip.file(`${baseDir}/fotos/${nombreUnico}.jpg`, out);
      fotosIncluidas++;
    });
  }

  // 8. Excel resumen_gastos.xlsx — hoja "Resumen" (1 fila por cliente) + 1
  //    pestaña por cliente (sección Gastos + sección Fotos). Minimalista. NO
  //    unifica tablas: facturas y muebles son filas distintas que solo conviven.
  const wb = XLSX.utils.book_new();

  // Marca de una factura: nombres completos (1 tras la corrección; " / " si
  // hubiera varias). Marca de un mueble: desde total_por_marca con su %.
  const marcaFactura = (fid: string): string => {
    const nombres = (marcasByFactura.get(fid) ?? [])
      .map((mid) => marcaNombreById.get(mid))
      .filter((n): n is string => !!n);
    return nombres.length ? nombres.join(" / ") : "—";
  };
  const marcaMueble = (tpm: Record<string, number> | null): string => {
    const ent = Object.entries(tpm ?? {}).filter(([, v]) => Number(v) > 0);
    if (ent.length === 0) return "—";
    const suma = ent.reduce((s, [, v]) => s + Number(v), 0) || 1;
    return ent
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([mid, v]) => `${marcaNombreById.get(mid) ?? "—"} ${Math.round((Number(v) / suma) * 100)}%`)
      .join(" / ");
  };

  // Agrupar gastos (facturas + muebles) y fotos por CLIENTE (misma clave que la
  // carpeta del ZIP → pestañas alineadas con las carpetas).
  interface GastoXlsx {
    fecha: string; concepto: string; proveedor: string; marca: string;
    numero: string; total: number; signed?: string;
  }
  interface FotoXlsx { archivo: string; signed?: string }
  interface ClienteBucket { gastos: GastoXlsx[]; fotos: FotoXlsx[]; marcaIds: Set<string> }
  const buckets = new Map<string, ClienteBucket>();
  const bucket = (nombre: string): ClienteBucket => {
    let b = buckets.get(nombre);
    if (!b) { b = { gastos: [], fotos: [], marcaIds: new Set() }; buckets.set(nombre, b); }
    return b;
  };
  // Siglas (codigo) de las marcas que toca un cliente, en orden canónico.
  const MARCA_ORDEN = ["TH", "CK", "RBK", "FC", "J", "OTR"];
  const siglasCliente = (ids: Set<string>): string => {
    const cods = Array.from(
      new Set(
        Array.from(ids)
          .map((id) => marcaCodigoById.get(id))
          .filter((c): c is string => !!c),
      ),
    );
    cods.sort((a, b) => {
      const ia = MARCA_ORDEN.indexOf(a);
      const ib = MARCA_ORDEN.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    return cods.length ? cods.join(", ") : "—";
  };
  for (const f of facturasSel) {
    const pdfPath = (pdfsPorFactura.get(f.id) ?? [])[0]?.url;
    const b = bucket(clienteFolder(proyectoById.get(f.proyecto_id)!));
    for (const mid of marcasByFactura.get(f.id) ?? []) b.marcaIds.add(mid);
    b.gastos.push({
      fecha: f.fecha_factura || "",
      concepto: f.concepto || "",
      proveedor: f.proveedor || "",
      marca: marcaFactura(f.id),
      numero: f.numero_factura || "",
      total: Number(f.total ?? 0),
      signed: pdfPath ? urlFirmada.get(pdfPath) : undefined,
    });
  }
  for (const e of entregasSel) {
    const b = bucket(clienteFolder(proyectoById.get(e.proyecto_id)!));
    for (const [mid, v] of Object.entries(e.total_por_marca ?? {})) {
      if (Number(v) > 0) b.marcaIds.add(mid);
    }
    b.gastos.push({
      fecha: (e.created_at || "").slice(0, 10),
      concepto: e.notas?.trim() || "Entrega de muebles",
      proveedor: "Mobiliario",
      marca: marcaMueble(e.total_por_marca),
      numero: "",
      total: Number(e.total ?? 0),
    });
  }
  for (const p of proyectosSel) {
    const b = bucket(clienteFolder(p));
    for (const foto of fotosPorProyecto.get(p.id) ?? []) {
      b.fotos.push({
        archivo: foto.nombre_original || "foto",
        signed: foto.url ? urlFirmada.get(foto.url) : undefined,
      });
    }
  }

  const totalDe = (b: ClienteBucket): number =>
    b.gastos.reduce((s, g) => s + g.total, 0);
  // Orden: por total desc; "Sin cliente" al final.
  const clientes = Array.from(buckets.keys()).sort((a, b) => {
    if (a === "Sin cliente") return 1;
    if (b === "Sin cliente") return -1;
    return totalDe(buckets.get(b)!) - totalDe(buckets.get(a)!);
  });
  // Código D-XXX por nombre de cliente (todos sus proyectos comparten código).
  // Null = "Sin cliente" → sin galería (links de foto individuales).
  const codigoDeCliente = new Map<string, string | null>();
  for (const p of proyectosSel) {
    const n = clienteFolder(p);
    if (!codigoDeCliente.has(n)) codigoDeCliente.set(n, p.tienda_codigo ?? null);
  }

  // ── Estilos minimalistas (gris suave en headers, links azules, sin grid pesado) ──
  const money = "$#,##0.00";
  const fontBase = { name: "Arial", sz: 10, color: { rgb: "111111" } };
  const headFill = { patternType: "solid", fgColor: { rgb: "F2F2F2" } };
  const sectionFill = { patternType: "solid", fgColor: { rgb: "E6E6E6" } };
  const ruleBottom = { bottom: { style: "thin", color: { rgb: "D9D9D9" } } };
  const ruleTop = { top: { style: "thin", color: { rgb: "BFBFBF" } } };
  const linkFontX = { name: "Arial", sz: 10, color: { rgb: "1155CC" }, underline: true };
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
  // muebles), igual que los chips de la pantalla.
  const headRes = ["Cliente", "Marcas", "# Gastos", "# Fotos", "Total"];
  const filasRes = clientes.map((nombre) => {
    const b = buckets.get(nombre)!;
    return [nombre, siglasCliente(b.marcaIds), b.gastos.length, b.fotos.length, totalDe(b)] as (string | number)[];
  });
  const granGastos = filasRes.reduce((s, r) => s + Number(r[2]), 0);
  const granFotos = filasRes.reduce((s, r) => s + Number(r[3]), 0);
  const granTotal = filasRes.reduce((s, r) => s + Number(r[4]), 0);
  const aoaRes = [headRes, ...filasRes, ["TOTAL", "", granGastos, granFotos, granTotal]];
  const wsR = XLSX.utils.aoa_to_sheet(aoaRes);
  wsR["!cols"] = [{ wch: 32 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 16 }];
  wsR["!freeze"] = { xSplit: 0, ySplit: 1 } as unknown as Record<string, unknown>;
  const totalRowR = aoaRes.length - 1;
  const esTextoCol = (c: number): boolean => c === 0 || c === 1; // Cliente, Marcas
  for (let c = 0; c < headRes.length; c++) {
    styleCell(wsR, 0, c, {
      font: { ...fontBase, bold: true },
      fill: headFill,
      alignment: { horizontal: esTextoCol(c) ? "left" : "right" },
      border: ruleBottom,
    });
  }
  for (let r = 1; r < aoaRes.length; r++) {
    const esTotal = r === totalRowR;
    for (let c = 0; c < headRes.length; c++) {
      styleCell(wsR, r, c, {
        font: { ...fontBase, bold: esTotal },
        alignment: { horizontal: esTextoCol(c) ? "left" : "right" },
        ...(esTotal ? { border: ruleTop } : {}),
      });
    }
    fmtCell(wsR, r, 4, money);
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
  const headG = ["Fecha", "Concepto", "Proveedor", "Marca", "N° Factura", "Total", "Factura"];
  for (const nombre of clientes) {
    const b = buckets.get(nombre)!;
    const codigo = codigoDeCliente.get(nombre) ?? null;
    // Galería = 1 link por cliente (requiere código). "Sin cliente" / sin código
    // → links individuales por foto (no hay galería sin código de cliente).
    const usarGaleria = !!codigo && b.fotos.length > 0;

    const aoa: (string | number)[][] = [["GASTOS"], headG];
    const gastoStart = aoa.length; // índice 0-based de la 1ª fila de gasto
    for (const g of b.gastos) {
      aoa.push([g.fecha, g.concepto, g.proveedor, g.marca, g.numero, g.total, g.signed ? "Ver factura" : "—"]);
    }
    const gastoEnd = gastoStart + b.gastos.length - 1;
    aoa.push(["", "", "", "", "Subtotal", totalDe(b), ""]);
    const subtotalRow = aoa.length - 1;
    aoa.push([""]);
    const fotosTitle = aoa.length;
    aoa.push(["FOTOS"]);
    let galeriaRow = -1;
    let fotoHeader = -1;
    let fotoStart = -1;
    if (usarGaleria) {
      galeriaRow = aoa.length;
      aoa.push([`Ver todas las fotos (${b.fotos.length})`]);
    } else {
      aoa.push(["Archivo", "Foto"]);
      fotoHeader = aoa.length - 1;
      fotoStart = aoa.length;
      for (const f of b.fotos) {
        aoa.push([f.archivo, f.signed ? "Ver foto" : "—"]);
      }
      if (b.fotos.length === 0) aoa.push(["(sin fotos)", ""]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 12 }, { wch: 42 }, { wch: 22 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

    // Links de gasto (col 6) + SUM del subtotal (col 5).
    b.gastos.forEach((g, i) => {
      if (g.signed) {
        setCell(ws, gastoStart + i, 6, { t: "s", v: "Ver factura", l: { Target: g.signed, Tooltip: "Abrir PDF de la factura" } });
      }
    });
    if (b.gastos.length > 0) {
      const L = XLSX.utils.encode_col(5);
      setCell(ws, subtotalRow, 5, { t: "n", f: `SUM(${L}${gastoStart + 1}:${L}${gastoEnd + 1})` });
    }

    // Estilos comunes.
    styleCell(ws, 0, 0, { font: { ...fontBase, bold: true, sz: 11 }, fill: sectionFill });
    styleCell(ws, fotosTitle, 0, { font: { ...fontBase, bold: true, sz: 11 }, fill: sectionFill });
    for (let c = 0; c < headG.length; c++) {
      styleCell(ws, 1, c, { font: { ...fontBase, bold: true }, fill: headFill, alignment: { horizontal: c === 5 ? "right" : "left" }, border: ruleBottom });
    }
    for (let i = 0; i < b.gastos.length; i++) {
      const r = gastoStart + i;
      for (let c = 0; c < headG.length; c++) {
        const esLink = c === 6 && !!b.gastos[i].signed;
        styleCell(ws, r, c, {
          font: esLink ? linkFontX : fontBase,
          alignment: { horizontal: c === 5 ? "right" : "left", wrapText: c === 1 },
        });
      }
      fmtCell(ws, r, 5, money);
    }
    styleCell(ws, subtotalRow, 4, { font: { ...fontBase, bold: true }, alignment: { horizontal: "right" } });
    styleCell(ws, subtotalRow, 5, { font: { ...fontBase, bold: true }, alignment: { horizontal: "right" }, border: ruleTop });
    fmtCell(ws, subtotalRow, 5, money);

    // Sección de fotos: galería (1 link) o links individuales.
    if (usarGaleria) {
      const url = `${GALERIA_BASE}/marketing/galeria/${encodeURIComponent(codigo!)}?t=${signGalleryToken(codigo!)}`;
      setCell(ws, galeriaRow, 0, { t: "s", v: `Ver todas las fotos (${b.fotos.length})`, l: { Target: url, Tooltip: "Abrir galería del cliente" } });
      styleCell(ws, galeriaRow, 0, { font: linkFontX });
    } else {
      b.fotos.forEach((f, i) => {
        if (f.signed) {
          setCell(ws, fotoStart + i, 1, { t: "s", v: "Ver foto", l: { Target: f.signed, Tooltip: "Abrir foto" } });
        }
      });
      for (let c = 0; c < 2; c++) {
        styleCell(ws, fotoHeader, c, { font: { ...fontBase, bold: true }, fill: headFill, border: ruleBottom });
      }
      for (let i = 0; i < b.fotos.length; i++) {
        const r = fotoStart + i;
        styleCell(ws, r, 0, { font: fontBase, alignment: { horizontal: "left", wrapText: true } });
        styleCell(ws, r, 1, { font: b.fotos[i].signed ? linkFontX : fontBase });
      }
    }

    ws["!freeze"] = { xSplit: 0, ySplit: 2 } as unknown as Record<string, unknown>;
    XLSX.utils.book_append_sheet(wb, ws, tabName(nombre));
  }

  const xlsxBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  zip.file("resumen_gastos.xlsx", xlsxBuf);

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return {
    buffer,
    gastos: facturasSel.length + entregasSel.length,
    proyectos: proyectosSel.length,
    fotosIncluidas,
    fotosOmitidas,
    pdfsIncluidos,
    pdfsOmitidos,
  };
}
