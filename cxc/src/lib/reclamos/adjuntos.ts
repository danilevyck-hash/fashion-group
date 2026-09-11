// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — BAJAR LA FACTURA Y LAS FOTOS PARA ADJUNTARLAS AL CORREO
// (11-sep-2026). La decisión de QUÉ viaja y con qué nombre vive en el módulo
// puro `adjuntos-plan.ts`; acá solo se baja de Storage y se achica.
//
// 🔴 Los dos buckets son PRIVADOS (`reclamo-facturas` desde que nació, y
// `reclamo-fotos` desde el 11-sep-2026: *«Link público ciérralo»*). Se bajan
// con el service role del servidor — nunca se firma una URL para esto, porque
// el archivo no se le muestra a nadie: se mete adentro del correo.
//
// 🔴 LAS FOTOS SE ACHICAN ANTES DE VIAJAR (1600 px de lado mayor, JPEG 80),
// igual que en el ZIP de Marketing. Una foto de teléfono son 4-6 MB y seis
// reclamos con tres fotos cada uno reventarían el tope de Resend por algo que
// el proveedor mira en la pantalla. Si `sharp` no la puede leer, la foto viaja
// TAL CUAL: se prefiere mandarla pesada a no mandarla.
// ─────────────────────────────────────────────────────────────────────────────

import sharp from "sharp";
import { supabaseServer } from "@/lib/supabase-server";
import { FACTURA_BUCKET } from "./factura-storage";
import { FOTOS_BUCKET } from "./fotos-storage";
import {
  extensionDe,
  JPEG_QUALITY,
  MAX_DIM,
  nombreFactura,
  nombreFoto,
  type CandidatoAdjunto,
} from "./adjuntos-plan";

/** Descargas/compresiones simultáneas (mismo número que el ZIP de Marketing). */
const CONCURRENCIA = 4;

interface FotoDeReclamo {
  storage_path?: string | null;
  created_at?: string | null;
}

export interface ReclamoConArchivos {
  nro_reclamo?: string | null;
  factura_pdf_path?: string | null;
  reclamo_fotos?: FotoDeReclamo[] | null;
}

/** Baja un objeto de un bucket privado. `null` si no se puede (nunca lanza). */
async function bajar(bucket: string, path: string): Promise<Buffer | null> {
  try {
    const { data, error } = await supabaseServer.storage.from(bucket).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch (err) {
    console.warn("reclamos/adjuntos: no se pudo bajar", bucket, path, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Achica una foto a JPEG (~1600 px, q80) respetando la orientación EXIF. */
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

/** Corre `fn` sobre `items` con concurrencia acotada, conservando el orden. */
async function enTandas<T, R>(items: readonly T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(items.length);
  let siguiente = 0;
  const obreros = Array.from({ length: Math.min(CONCURRENCIA, items.length) }, async () => {
    for (;;) {
      const i = siguiente++;
      if (i >= items.length) return;
      salida[i] = await fn(items[i]);
    }
  });
  await Promise.all(obreros);
  return salida;
}

interface Pedido {
  bucket: string;
  path: string;
  nombre: string;
  clase: "factura" | "foto";
  nroReclamo: string;
}

/**
 * Los candidatos a adjunto de un lote de reclamos: la factura en PDF de cada
 * uno (si existe) y sus fotos, ya achicadas. Lo que no se pudo bajar NO aparece
 * —ni como incluido ni como omitido por tamaño—: se cuenta aparte en
 * `noSePudieronBajar`, porque «no cupo» y «no se pudo leer» son dos cosas
 * distintas y el cuerpo del correo solo puede prometer la primera.
 */
export async function candidatosDeReclamos(
  reclamos: readonly ReclamoConArchivos[],
): Promise<{ candidatos: CandidatoAdjunto[]; noSePudieronBajar: number }> {
  const pedidos: Pedido[] = [];
  for (const r of reclamos) {
    const nro = String(r.nro_reclamo ?? "");
    if (r.factura_pdf_path) {
      pedidos.push({
        bucket: FACTURA_BUCKET,
        path: r.factura_pdf_path,
        nombre: nombreFactura(nro),
        clase: "factura",
        nroReclamo: nro,
      });
    }
    // El orden de las fotos es el de la ficha (por `created_at`), para que
    // `-foto-1` sea la primera que subió Andrea y no una cualquiera.
    const fotos = (r.reclamo_fotos ?? [])
      .filter((f): f is FotoDeReclamo & { storage_path: string } => !!f?.storage_path)
      .slice()
      .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
    fotos.forEach((f, i) => {
      pedidos.push({
        bucket: FOTOS_BUCKET,
        path: f.storage_path,
        nombre: nombreFoto(nro, i + 1, extensionDe(f.storage_path)),
        clase: "foto",
        nroReclamo: nro,
      });
    });
  }

  const bajados = await enTandas(pedidos, async (p) => {
    const crudo = await bajar(p.bucket, p.path);
    if (!crudo) return null;
    if (p.clase !== "foto") return { ...p, contenido: crudo };
    const chica = await comprimirFoto(crudo);
    // Comprimida cambia de formato: el nombre pasa a .jpg. Si no se pudo, viaja
    // tal cual y conserva su extensión original.
    if (!chica) return { ...p, contenido: crudo };
    return { ...p, nombre: p.nombre.replace(/\.[A-Za-z0-9]+$/, ".jpg"), contenido: chica };
  });

  const candidatos: CandidatoAdjunto[] = [];
  let noSePudieronBajar = 0;
  for (const b of bajados) {
    if (!b) {
      noSePudieronBajar += 1;
      continue;
    }
    candidatos.push({ nombre: b.nombre, clase: b.clase, nroReclamo: b.nroReclamo, contenido: b.contenido });
  }
  return { candidatos, noSePudieronBajar };
}
