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
 *
 * UNA PERSONA, UNA FILA (3-sep-2026, noche). Daniel: «¿por qué hay 4
 * Reinaldo?». Las grafías de Switch pasan por `comision_vendedor_alias`: la
 * migración 20260913120000 colapsa las filas de tasa a la persona, y aquí el
 * ORIGEN (en qué empresas está en el maestro) se junta por la persona también,
 * y lo que llega por PUT se escribe con el nombre canónico. Mientras la DDL no
 * corra, el alias es vacío y cada nombre queda como viene.
 *
 * Y los que NO SE PAGAN (DEFAULT y Daniel, lib/comisiones/sin-pago) no salen
 * en esta lista: Daniel, «quítalo». No hay tasa que editar para quien no
 * cobra; siguen en `VENDEDORES_SIN_PAGO` y en la tabla de comisiones (en gris).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { sePagaComision } from "@/lib/comisiones/sin-pago";
import { estaRetirado, AVISO_VENDEDOR_RETIRADO } from "@/lib/comisiones/retirados";
import { aplicarAlias } from "@/lib/comisiones/alias";
import { leerAliasOVacio } from "@/lib/comisiones/exclusiones-server";

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

  const [tasasRes, vendRes, alias] = await Promise.all([
    supabaseServer
      .from("comision_vendedor_tasa")
      .select("vendedor_nombre, tasa_venta, tasa_cobro, activo")
      .order("vendedor_nombre", { ascending: true }),
    supabaseServer.from("vendedores").select("nombre, empresa_key").eq("activo", true),
    leerAliasOVacio(),
  ]);

  if (tasasRes.error) {
    return NextResponse.json({ error: tasasRes.error.message }, { status: 500 });
  }
  if (vendRes.error) {
    return NextResponse.json({ error: vendRes.error.message }, { status: 500 });
  }

  // origen: empresas (nombres legibles) donde la PERSONA está activa en el
  // maestro — el maestro trae la grafía de cada empresa, así que se junta
  // por el alias.
  const origenMap = new Map<string, Set<string>>();
  for (const v of vendRes.data ?? []) {
    const nombre = aplicarAlias(String(v.nombre), alias);
    const set = origenMap.get(nombre) ?? new Set<string>();
    set.add(EMPRESA_KEY_TO_NAME[v.empresa_key] ?? v.empresa_key);
    origenMap.set(nombre, set);
  }

  // Una fila por persona. Si la DDL todavía no colapsó las grafías, dos filas
  // de tasa pueden caer en la misma persona: gana la primera (orden alfabético)
  // y las demás no se duplican en pantalla.
  const vistos = new Set<string>();
  const vendedores: ConfigRow[] = [];
  for (const t of tasasRes.data ?? []) {
    const nombre = aplicarAlias(String(t.vendedor_nombre), alias);
    // Tampoco los RETIRADOS de Comisiones (Aguas — Daniel: «te dije que
    // eliminaras Rey Stoute Aguas»): no existe, así que no tiene tasa que
    // editar. Lista en `lib/comisiones/retirados`, por el nombre canónico.
    if (!nombre || vistos.has(nombre) || !sePagaComision(nombre) || estaRetirado(nombre, alias)) continue;
    vistos.add(nombre);
    vendedores.push({
      vendedor_nombre: nombre,
      tasa_venta: Number(t.tasa_venta),
      tasa_cobro: Number(t.tasa_cobro ?? t.tasa_venta),
      activo: Boolean(t.activo),
      origen: [...(origenMap.get(nombre) ?? [])].sort(),
    });
  }

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

  const alias = await leerAliasOVacio();
  const rows: UpdateInput[] = [];
  const vistos = new Set<string>();
  for (const u of updates as unknown[]) {
    const r = u as Partial<UpdateInput>;
    const nombre = typeof r.vendedor_nombre === "string" ? aplicarAlias(r.vendedor_nombre, alias) : "";
    const tasa = Number(r.tasa_venta);
    if (!nombre) {
      return NextResponse.json({ error: "Falta el nombre del vendedor" }, { status: 400 });
    }
    // Quien no se paga no tiene tasa que guardar (no está en la lista).
    if (!sePagaComision(nombre)) continue;
    // Un retirado (Aguas) no existe en Comisiones: cargarle una tasa se
    // RECHAZA con mensaje, no se ignora en silencio. Se compara por el
    // canónico, así que vale para cualquier grafía.
    if (estaRetirado(nombre, alias)) {
      return NextResponse.json({ error: AVISO_VENDEDOR_RETIRADO }, { status: 400 });
    }
    // Dos grafías de la misma persona en el mismo PUT serían dos filas del
    // upsert con la MISMA llave: PostgREST lo rechaza. Se queda la primera.
    if (vistos.has(nombre)) continue;
    vistos.add(nombre);
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
  if (rows.length === 0) {
    return NextResponse.json({ error: "Sin cambios para guardar" }, { status: 400 });
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
