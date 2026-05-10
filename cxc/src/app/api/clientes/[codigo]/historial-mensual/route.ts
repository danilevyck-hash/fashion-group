// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clientes/[id]/historial-mensual?empresa={empresaKey}
//
// Devuelve agregado mensual de ventas de los últimos 12 meses cerrados +
// el mes actual, para el cliente y empresa indicados. Pensado para alimentar
// la mini gráfica que aparece al hover sobre el nombre del cliente en
// la tab Clientes del módulo Ventas.
//
// [id] = código Switch Soft del cliente (ej. "D-04"), igual que Cliente.id
// del bundle del frontend de Ventas.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { ALL_EMPRESA_KEYS, type EmpresaKey } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

const READ_ROLES = ["admin", "director", "contabilidad", "secretaria", "vendedor"];

interface MesAgg {
  anio: number;
  mes: number;
  total: number;
  facturas: number;
}

interface VentaRow {
  anio: number | null;
  mes: number | null;
  fecha: string | null;
  total: number | null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const authError = requireAuth(req, READ_ROLES);
  if (authError) return authError;

  const { codigo } = await ctx.params;
  if (!codigo) {
    return NextResponse.json({ error: "codigo requerido" }, { status: 400 });
  }

  const empresa = req.nextUrl.searchParams.get("empresa") ?? "";
  if (!empresa || !(ALL_EMPRESA_KEYS as readonly string[]).includes(empresa)) {
    return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  }
  const empresaKey = empresa as EmpresaKey;

  // 1. Resolver cliente_id a partir del codigo (Switch Soft)
  const { data: cliente, error: cErr } = await supabaseServer
    .from("clientes_master")
    .select("id, codigo, nombre")
    .eq("codigo", codigo)
    .eq("deleted", false)
    .maybeSingle();

  if (cErr) {
    console.error("[historial-mensual] cliente lookup error:", cErr.message);
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  if (!cliente) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // 2. Ventana de 13 meses (mes actual + 12 atrás) — el primer día del mes
  //    de hace 12 meses, en formato YYYY-MM-DD.
  const now = new Date();
  const fromDate = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const fromIso = fromDate.toISOString().slice(0, 10);

  const { data: rows, error: vErr } = await supabaseServer
    .from("ventas_raw")
    .select("anio, mes, fecha, total")
    .eq("cliente_id", cliente.id)
    .eq("empresa", empresaKey)
    .gte("fecha", fromIso);

  if (vErr) {
    console.error("[historial-mensual] ventas query error:", vErr.message);
    return NextResponse.json({ error: vErr.message }, { status: 500 });
  }

  // 3. Agregar por (anio, mes)
  const bucket = new Map<string, MesAgg>();
  for (const r of (rows ?? []) as VentaRow[]) {
    let anio = r.anio ?? 0;
    let mes = r.mes ?? 0;
    if ((!anio || !mes) && r.fecha) {
      const d = new Date(r.fecha);
      anio = d.getUTCFullYear();
      mes = d.getUTCMonth() + 1;
    }
    if (!anio || !mes) continue;

    const key = `${anio}-${mes}`;
    const prev = bucket.get(key);
    const total = Number(r.total ?? 0);
    if (prev) {
      prev.total += total;
      prev.facturas += 1;
    } else {
      bucket.set(key, { anio, mes, total, facturas: 1 });
    }
  }

  // 4. Generar serie completa de 13 meses, rellenando huecos con 0
  const meses: MesAgg[] = [];
  for (let i = 12; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const anio = d.getFullYear();
    const mes = d.getMonth() + 1;
    const found = bucket.get(`${anio}-${mes}`);
    meses.push({
      anio,
      mes,
      total: Math.round((found?.total ?? 0) * 100) / 100,
      facturas: found?.facturas ?? 0,
    });
  }

  const total12m = meses.reduce((s, m) => s + m.total, 0);
  const mesesConVenta = meses.filter(m => m.total > 0);
  const promedioMensual = mesesConVenta.length
    ? total12m / mesesConVenta.length
    : 0;

  let mejor: MesAgg | null = null;
  let peor: MesAgg | null = null;
  for (const m of mesesConVenta) {
    if (!mejor || m.total > mejor.total) mejor = m;
    if (!peor || m.total < peor.total) peor = m;
  }

  return NextResponse.json({
    cliente_nombre: cliente.nombre as string,
    meses,
    total_12m: Math.round(total12m * 100) / 100,
    promedio_mensual: Math.round(promedioMensual * 100) / 100,
    mejor_mes: mejor,
    peor_mes: peor,
  });
}
