/**
 * Configuración de tasas de comisión GLOBALES por vendedor.
 * - GET: lista comision_vendedor_tasa + origen (empresas del maestro vendedores).
 * - PUT: actualiza tasa_venta / tasa_cobro / activo por vendedor.
 * Solo admin (admin pasa siempre por requireRole).
 *
 * Venta y cobro son DOS tasas (3-sep-2026): la pantalla mostraba una sola y
 * escribía solo `tasa_venta`, con lo que la de cobro —que la RPC sí usa— solo
 * se podía tocar en la base. Ahora viajan y se guardan las dos. Si el PUT no
 * trae `tasa_cobro` (cliente viejo), se conserva la que ya tenía la fila.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

interface ConfigRow {
  vendedor_nombre: string;
  tasa_venta: number;
  tasa_cobro: number;
  activo: boolean;
  origen: string[];
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const [tasasRes, vendRes] = await Promise.all([
    supabaseServer
      .from("comision_vendedor_tasa")
      .select("vendedor_nombre, tasa_venta, tasa_cobro, activo")
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
    tasa_cobro: Number(t.tasa_cobro ?? t.tasa_venta),
    activo: Boolean(t.activo),
    origen: [...(origenMap.get(t.vendedor_nombre) ?? [])].sort(),
  }));

  return NextResponse.json({ vendedores });
}

interface UpdateInput {
  vendedor_nombre: string;
  tasa_venta: number;
  /** undefined = no se manda: se conserva la de la fila. */
  tasa_cobro?: number;
  activo: boolean;
}

export async function PUT(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
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
        { error: `Tasa de venta inválida para ${nombre} (debe ser 0% a 20%)` },
        { status: 400 },
      );
    }
    let tasaCobro: number | undefined;
    if (r.tasa_cobro !== undefined && r.tasa_cobro !== null) {
      tasaCobro = Number(r.tasa_cobro);
      if (!Number.isFinite(tasaCobro) || tasaCobro < 0 || tasaCobro > 0.2) {
        return NextResponse.json(
          { error: `Tasa de cobro inválida para ${nombre} (debe ser 0% a 20%)` },
          { status: 400 },
        );
      }
    }
    rows.push({ vendedor_nombre: nombre, tasa_venta: tasa, tasa_cobro: tasaCobro, activo: Boolean(r.activo) });
  }

  const nowIso = new Date().toISOString();
  // PostgREST exige que todas las filas del upsert tengan las MISMAS claves:
  // la de cobro viaja solo si vino en todas (la pantalla siempre la manda).
  const conCobro = rows.every((r) => r.tasa_cobro !== undefined);
  const payload = rows.map((r) => ({
    vendedor_nombre: r.vendedor_nombre,
    tasa_venta: r.tasa_venta,
    ...(conCobro ? { tasa_cobro: r.tasa_cobro } : {}),
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
