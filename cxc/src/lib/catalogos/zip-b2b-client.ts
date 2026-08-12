// ─────────────────────────────────────────────────────────────────────────────
// Procesamiento del ZIP del banco B2B — SOLO NAVEGADOR (JSZip + canvas + fetch).
//
// El ZIP pesa 27-78 MB con ~2,500 fotos: NO puede ir a un endpoint (Vercel corta
// el body en ~4.5 MB). El pipeline completo corre en la pestaña del admin:
//
//   ZIP → descomprimir → por foto: decodificar, medir lifestyle, recortar y
//   redimensionar a 720px en canvas → subir con token firmado DIRECTO a Storage
//   → al final UN solo POST con el manifiesto (sku → variantes → elegida).
//
// Toda la lógica que se puede testear sin navegador (parseo del nombre, score
// de lifestyle, regla de elección, bbox y encuadre) vive en fotos-b2b.ts; aquí
// solo está el pegamento con las APIs del navegador.
// ─────────────────────────────────────────────────────────────────────────────

import {
  parseNombreArchivoB2B,
  normalizarCodigo,
  scoreLifestyle,
  LIFESTYLE_VAR_TOP_UMBRAL,
  elegirVistaDefault,
  colorFondo,
  detectarBBox,
  encuadrar,
  type RgbaImage,
  type ManifiestoItem,
} from "./fotos-b2b";
import { variantePath, type StorageMarcaKey } from "./variantes-paths";
import { medirRecorte } from "./foto-recorte";

/** Lado mayor de las fotos guardadas (variantes y foto elegida). */
export const LADO_MAYOR = 720;
const JPEG_QUALITY = 0.85;
/** Tamaño del lote de firmas/subidas (progreso fluido sin saturar la red). */
const LOTE = 100;
const SUBIDAS_EN_PARALELO = 6;

export interface ProgresoZip {
  fase: "leyendo" | "procesando" | "subiendo" | "guardando" | "listo";
  hechas: number;
  total: number;
}

export interface ResultadoZip {
  asignadas: number;
  manuales: number;
  sinMatch: string[];
  errores: string[];
  variantesSubidas: number;
  fotosLeidas: number;
}

interface FotoProcesada {
  codigo: string;
  vista: number;
  blob: Blob;
  lifestyle: boolean;
}

// ── Canvas ───────────────────────────────────────────────────────────────────

async function decodificar(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);
}

function pixelesDe(bmp: ImageBitmap): RgbaImage {
  // Se mide sobre una copia pequeña: el score de lifestyle solo necesita la
  // banda superior y así no se retienen 2,500 bitmaps a resolución completa.
  const escala = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * escala));
  const h = Math.max(1, Math.round(bmp.height * escala));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * Recorta al producto y lo reencuadra a 4:3 al 90%, rellenando con el color de
 * fondo detectado. El bbox se calcula sobre la versión pequeña (barato) y se
 * reescala al bitmap original antes de dibujar, para no perder nitidez.
 */
function recortarYEncuadrar(bmp: ImageBitmap, small: RgbaImage): Blob | Promise<Blob | null> {
  const fondo = colorFondo(small);
  // El fondo de estudio de PVH viene en DEGRADADO: detectarBBox (esquinas +
  // tolerancia fija) lo marca entero como producto y la caja da la imagen
  // completa. medirRecorte estima el fondo por fila y saca la caja real; si no
  // es confiable (fail-open), se cae al detector de siempre — nunca se pierde
  // una foto por esto.
  const med = medirRecorte(small, bmp.width, bmp.height);
  const bboxSmall = med.ok && med.caja ? med.caja : detectarBBox(small, fondo);
  const fx = bmp.width / small.width;
  const fy = bmp.height / small.height;
  const bbox = {
    x: Math.max(0, Math.floor(bboxSmall.x * fx)),
    y: Math.max(0, Math.floor(bboxSmall.y * fy)),
    w: Math.min(bmp.width, Math.ceil(bboxSmall.w * fx)),
    h: Math.min(bmp.height, Math.ceil(bboxSmall.h * fy)),
  };

  const enc = encuadrar(bbox, LADO_MAYOR);
  const c = document.createElement("canvas");
  c.width = enc.destW;
  c.height = enc.destH;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = `rgb(${fondo[0]},${fondo[1]},${fondo[2]})`;
  ctx.fillRect(0, 0, enc.destW, enc.destH);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, bbox.x, bbox.y, bbox.w, bbox.h, enc.dx, enc.dy, enc.dw, enc.dh);
  return new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", JPEG_QUALITY));
}

// ── Subida con token firmado ─────────────────────────────────────────────────

async function pedirFirmas(
  apiBase: string,
  paths: string[],
): Promise<Map<string, string>> {
  const res = await fetch(`${apiBase}/products/variantes/firmar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.error || "No se pudieron preparar las subidas.");
  }
  const { firmados } = (await res.json()) as { firmados: { path: string; signedUrl: string }[] };
  return new Map(firmados.map((f) => [f.path, f.signedUrl]));
}

/** PUT plano a la URL firmada (mismo formato que uploadToSignedUrl de supabase-js). */
async function subirFirmado(signedUrl: string, blob: Blob): Promise<void> {
  const fd = new FormData();
  fd.append("cacheControl", "31536000");
  fd.append("", blob);
  const res = await fetch(signedUrl, { method: "PUT", body: fd, headers: { "x-upsert": "true" } });
  if (!res.ok) throw new Error(`subida ${res.status}`);
}

/** Ejecuta tareas con concurrencia acotada. */
async function enParalelo<T>(tareas: (() => Promise<T>)[], n: number, onCada: () => void): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, tareas.length) }, async () => {
    while (i < tareas.length) {
      const mio = i++;
      try {
        await tareas[mio]();
      } catch {
        // El fallo individual ya se contabiliza donde corresponde.
      }
      onCada();
    }
  });
  await Promise.all(workers);
}

// ── Pipeline completo ────────────────────────────────────────────────────────

export interface OpcionesZip {
  marca: StorageMarcaKey;
  /** Base de la API de la marca, ej. "/api/catalogo/tommy". */
  apiBase: string;
  /** SKUs reales de la marca (para el match y para no subir basura). */
  skusCatalogo: string[];
  onProgreso: (p: ProgresoZip) => void;
}

export async function procesarZipB2B(file: File, opts: OpcionesZip): Promise<ResultadoZip> {
  const { marca, apiBase, skusCatalogo, onProgreso } = opts;

  onProgreso({ fase: "leyendo", hechas: 0, total: 0 });
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);

  // Solo los archivos con forma de foto del banco.
  const entradas: { entry: import("jszip").JSZipObject; codigo: string; vista: number }[] = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    const parsed = parseNombreArchivoB2B(path);
    if (parsed) entradas.push({ entry, codigo: parsed.codigo, vista: parsed.vista });
  });

  // Match contra el catálogo por código normalizado. Lo que no casa NO se
  // procesa ni se sube (no ensuciar Storage con fotos de artículos ajenos).
  const skuPorCodigo = new Map<string, string>();
  for (const s of skusCatalogo) skuPorCodigo.set(normalizarCodigo(s), s);

  const utiles = entradas.filter((e) => skuPorCodigo.has(e.codigo));
  const sinMatch = [...new Set(entradas.filter((e) => !skuPorCodigo.has(e.codigo)).map((e) => e.codigo))];

  const total = utiles.length;
  onProgreso({ fase: "procesando", hechas: 0, total });

  // ── Procesar (decodificar + medir + recortar) ──
  const porCodigo = new Map<string, FotoProcesada[]>();
  let hechas = 0;
  for (const { entry, codigo, vista } of utiles) {
    try {
      const raw = await entry.async("blob");
      const bmp = await decodificar(raw);
      const small = pixelesDe(bmp);
      const lifestyle = scoreLifestyle(small) > LIFESTYLE_VAR_TOP_UMBRAL;
      const blob = await recortarYEncuadrar(bmp, small);
      bmp.close();
      if (blob) {
        const lista = porCodigo.get(codigo) ?? [];
        lista.push({ codigo, vista, blob, lifestyle });
        porCodigo.set(codigo, lista);
      }
    } catch {
      // Foto corrupta dentro del ZIP: se ignora, no tumba el proceso.
    }
    hechas++;
    if (hechas % 5 === 0 || hechas === total) onProgreso({ fase: "procesando", hechas, total });
  }

  // ── Subir variantes ──
  const todas: { path: string; blob: Blob }[] = [];
  for (const [codigo, fotos] of porCodigo) {
    const sku = skuPorCodigo.get(codigo)!;
    for (const f of fotos) todas.push({ path: variantePath(marca, sku, f.vista), blob: f.blob });
  }

  let subidas = 0;
  onProgreso({ fase: "subiendo", hechas: 0, total: todas.length });
  for (let i = 0; i < todas.length; i += LOTE) {
    const lote = todas.slice(i, i + LOTE);
    const firmas = await pedirFirmas(apiBase, lote.map((l) => l.path));
    await enParalelo(
      lote.map((l) => async () => {
        const url = firmas.get(l.path);
        if (!url) return;
        await subirFirmado(url, l.blob);
        subidas++;
      }),
      SUBIDAS_EN_PARALELO,
      () => onProgreso({ fase: "subiendo", hechas: Math.min(todas.length, subidas), total: todas.length }),
    );
  }

  // ── Manifiesto (una sola escritura a la DB) ──
  onProgreso({ fase: "guardando", hechas: todas.length, total: todas.length });
  const items: ManifiestoItem[] = [];
  for (const [codigo, fotos] of porCodigo) {
    items.push({
      sku: skuPorCodigo.get(codigo)!,
      variantes: fotos.map((f) => f.vista).sort((a, b) => a - b),
      elegida: elegirVistaDefault(fotos.map((f) => ({ vista: f.vista, lifestyle: f.lifestyle }))),
    });
  }

  const res = await fetch(`${apiBase}/products/variantes/manifiesto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.error || "Las fotos se subieron pero no se pudieron asignar.");
  }
  const guardado = (await res.json()) as {
    asignadas: number;
    manuales: number;
    sinMatch: string[];
    errores: string[];
  };

  onProgreso({ fase: "listo", hechas: total, total });
  return {
    asignadas: guardado.asignadas,
    manuales: guardado.manuales,
    sinMatch: [...new Set([...sinMatch, ...guardado.sinMatch])],
    errores: guardado.errores,
    variantesSubidas: subidas,
    fotosLeidas: entradas.length,
  };
}
