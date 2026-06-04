/**
 * Configuración de tasas de comisión GLOBALES por vendedor.
 * - GET: lista comision_vendedor_tasa + origen (empresas del maestro vendedores).
 * - PUT: actualiza tasa_venta / activo por vendedor.
 * Solo admin/director (admin pasa siempre por requireRole).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

interface ConfigRow {
  vendedor_nombre: string;
  tasa_venta: number;
  activo: boolean;
  origen: string[];
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["director"]);
  if (auth instanceof NextResponse) return auth;

  const [tasasRes, vendRes] = await Promise.all([
    supabaseServer
      .from("comision_vendedor_tasa")
      .select("vendedor_nombre, tasa_venta, activo")
      .order("vendedor_nombre", { ascending: true }),
    supabaseServer.from("vendedores").select("nombre, empresa_key").eq("activo", true),
  ]);

  if (tasasRes.error) {
    return NextResponse.json({ error: tasasRes.error.message }, { status: 500 });
  }
  if (vendRes.error) {
    return NextResponse.json({ error: vendRes.error.message }, { status: 500 });
  }

  // origen: empresas (nombres legibles) donde el vendedor está activo en el maestro.
  const origenMap = new Map<string, Set<string>>();
  for (const v of vendRes.data ?? []) {
    const nombre = String(v.nombre);
    const set = origenMap.get(nombre) ?? new Set<string>();
    set.add(EMPRESA_KEY_TO_NAME[v.empresa_key] ?? v.empresa_key);
    origenMap.set(nombre, set);
  }

  const vendedores: ConfigRow[] = (tasasRes.data ?? []).map((t) => ({
    vendedor_nombre: t.vendedor_nombre,
    tasa_venta: Number(t.tasa_venta),
    activo: Boolean(t.activo),
    origen: [...(origenMap.get(t.vendedor_nombre) ?? [])].sort(),
  }));

  return NextResponse.json({ vendedores });
}

interface UpdateInput {
  vendedor_nombre: string;
  tasa_venta: number;
  activo: boolean;
}

export async function PUT(req: NextRequest) {
  const auth = requireRole(req, ["director"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const updates = (body as { updates?: unknown })?.updates;
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "Sin cambios para guardar" }, { status: 400 });
  }

  const rows: UpdateInput[] = [];
  for (const u of updates as unknown[]) {
    const r = u as Partial<UpdateInput>;
    const nombre = typeof r.vendedor_nombre === "string" ? r.vendedor_nombre.trim() : "";
    const tasa = Number(r.tasa_venta);
    if (!nombre) {
      return NextResponse.json({ error: "Falta el nombre del vendedor" }, { status: 400 });
    }
    // tasa en decimal (0.0050 = 0.5%). Cap razonable 0..0.20 (20%).
    if (!Number.isFinite(tasa) || tasa < 0 || tasa > 0.2) {
      return NextResponse.json(
        { error: `Tasa inválida para ${nombre} (debe ser 0% a 20%)` },
        { status: 400 },
      );
    }
    rows.push({ vendedor_nombre: nombre, tasa_venta: tasa, activo: Boolean(r.activo) });
  }

  const nowIso = new Date().toISOString();
  const payload = rows.map((r) => ({
    vendedor_nombre: r.vendedor_nombre,
    tasa_venta: r.tasa_venta,
    activo: r.activo,
    updated_at: nowIso,
  }));

  const { error } = await supabaseServer
    .from("comision_vendedor_tasa")
    .upsert(payload, { onConflict: "vendedor_nombre" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: payload.length });
}
