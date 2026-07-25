// ─────────────────────────────────────────────────────────────────────────────
// Tokens de subida firmados para las variantes del ZIP del B2B.
//
// POR QUÉ: el ZIP pesa 27-78 MB (~2,500 fotos) y Vercel corta el body de una
// función en ~4.5 MB. El ZIP se descomprime y se procesa EN EL NAVEGADOR, y
// cada foto ya recortada (~25 KB) se sube DIRECTO a Supabase Storage con un
// token firmado — la foto nunca pasa por nuestro servidor.
//
// POST { paths: [...] } → { firmados: [{ path, token }], rechazados: [...] }
//
// SEGURIDAD: un token firmado permite escribir ESE objeto saltándose RLS, así
// que cada path se valida contra el prefijo de variantes de ESTA marca
// (`{prefijo}/_v/{sku}/{n}.jpg`). Cualquier otra ruta se rechaza — nunca se
// firma la foto elegida, ni otra marca, ni nada fuera de `_v/`.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { storageDbDe, BUCKET } from "@/lib/catalogos/variantes-server";
import {
  variantesRoot,
  pathDeVarianteValido,
  type StorageMarcaKey,
} from "@/lib/catalogos/variantes-paths";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

/** Tope por petición — el cliente pide de a lotes y muestra progreso real. */
const MAX_LOTE = 200;

export async function POST(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { paths?: unknown } | null;
  const paths = Array.isArray(body?.paths) ? (body!.paths as unknown[]) : null;
  if (!paths || paths.length === 0) {
    return NextResponse.json({ error: "paths requerido" }, { status: 400 });
  }
  if (paths.length > MAX_LOTE) {
    return NextResponse.json({ error: `Máximo ${MAX_LOTE} por lote` }, { status: 400 });
  }

  const root = variantesRoot(cfg.marca as StorageMarcaKey);
  const validos: string[] = [];
  const rechazados: string[] = [];
  for (const p of paths) {
    if (typeof p === "string" && pathDeVarianteValido(p, root)) validos.push(p);
    else rechazados.push(String(p));
  }

  const db = await storageDbDe(cfg);
  const firmados: { path: string; signedUrl: string }[] = [];
  for (const path of validos) {
    // upsert:true → re-subir el mismo ZIP sobrescribe en vez de fallar
    // (la operación es idempotente a propósito).
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error || !data) {
      rechazados.push(path);
      continue;
    }
    // signedUrl absoluta: el navegador sube con un PUT plano, sin necesitar un
    // client de Supabase (ni la anon key) en el bundle del admin.
    firmados.push({ path, signedUrl: new URL(data.signedUrl, process.env.NEXT_PUBLIC_SUPABASE_URL).toString() });
  }

  return NextResponse.json({ firmados, rechazados });
}
