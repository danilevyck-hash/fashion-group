// ============================================================================
// LAS FOTOS DE UNA TIENDA (22-sep-2026).
//
// 🔴 Las fotos se pegan a la TIENDA, ya no al proyecto: la columna es
// `mk_adjuntos.tienda_codigo` (la migración `20261216120000` la copió del
// proyecto — medido: 60 de 60 fotos quedaron con su tienda).
//
// 🔴 Falla ABIERTA: sin la columna contesta 200 con lista vacía y lo dice en
// `sinMigracion`, igual que el resto del rediseño.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { firmarAdjuntos } from "@/lib/marketing/storage";
import { esColumnaAusente, sinColumnasDelRediseno } from "@/lib/marketing/columnas-opcionales";
import { esCodigoGeneral, VISTA_TIENDA } from "@/lib/marketing/vista-tienda";
import { TIENDA_GENERAL } from "@/lib/marketing/gasto";
import type { MkAdjunto } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { codigo: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!VISTA_TIENDA) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }
  const crudo = String(params.codigo ?? "").trim();
  if (crudo.length === 0 || crudo.length > 40) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }
  // 🔴 «General» TAMBIÉN es un cajón con fotos (22-sep-2026, los remates). Un
  // mueble que no es de ninguna tienda igual tiene su foto, y hasta hoy no
  // tenía de dónde colgarla: se guarda bajo el código `GENERAL`, que ningún
  // cliente del directorio puede usar (los suyos son D-xx).
  const codigo = esCodigoGeneral(crudo)
    ? TIENDA_GENERAL.toUpperCase()
    : crudo.toUpperCase();

  try {
    const { data, error } = await supabaseServer
      .from("mk_adjuntos")
      .select("*")
      .eq("tipo", "foto_proyecto")
      .eq("tienda_codigo", codigo)
      .order("created_at", { ascending: false });
    if (error) {
      if (esColumnaAusente(error)) return NextResponse.json([]);
      throw new Error(error.message);
    }
    const firmados = await firmarAdjuntos((data ?? []) as MkAdjunto[]);
    const res = NextResponse.json(firmados);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/tienda/[codigo]/fotos:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Registra una foto que YA se subió al bucket, colgada de la TIENDA.
 *
 * 🔴 Puerta propia y no `POST /api/marketing/adjuntos`: esa exige un
 * `proyecto_id` para una `foto_proyecto` (lo pide el CHECK del esquema y lo
 * repite `createAdjunto`), y el rediseño quitó el proyecto. Acá la foto nace
 * con su `tienda_codigo` y sin proyecto.
 *
 * 🔴 Falla ABIERTA: sin la columna, se guarda como antes —sin tienda— y se
 * dice en el log; la foto NO se pierde.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { codigo: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!VISTA_TIENDA) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }
  const crudo = String(params.codigo ?? "").trim();
  if (crudo.length === 0 || crudo.length > 40) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }
  // El cajón «General» guarda bajo `GENERAL`, igual que lo lee el GET.
  const codigo = esCodigoGeneral(crudo)
    ? TIENDA_GENERAL.toUpperCase()
    : crudo.toUpperCase();
  try {
    const body = (await req.json()) as {
      url?: string;
      nombreOriginal?: string;
      sizeBytes?: number;
    };
    const url = String(body?.url ?? "").trim();
    if (url.length === 0) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }
    const base = {
      proyecto_id: null,
      factura_id: null,
      tipo: "foto_proyecto" as const,
      url,
      nombre_original: String(body?.nombreOriginal ?? "").trim() || null,
      size_bytes: Number.isFinite(Number(body?.sizeBytes)) ? Number(body?.sizeBytes) : null,
    };
    let { data, error } = await supabaseServer
      .from("mk_adjuntos")
      .insert({ ...base, tienda_codigo: codigo })
      .select()
      .single();
    if (error && esColumnaAusente(error)) {
      console.warn(
        "[marketing/rediseño] mk_adjuntos.tienda_codigo no existe; la foto se guarda sin tienda.",
      );
      ({ data, error } = await supabaseServer
        .from("mk_adjuntos")
        .insert(sinColumnasDelRediseno(base))
        .select()
        .single());
    }
    if (error) throw new Error(error.message);
    const firmado = await firmarAdjuntos([data as MkAdjunto]);
    return NextResponse.json(firmado[0]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo registrar la foto";
    console.error("POST /api/marketing/tienda/[codigo]/fotos:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
