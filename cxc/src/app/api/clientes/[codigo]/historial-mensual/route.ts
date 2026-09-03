// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clientes/[codigo]/historial-mensual?empresa={empresaKey}
//
// Devuelve agregado mensual de ventas de los últimos 12 meses cerrados +
// el mes actual, para el cliente y empresa indicados. Pensado para alimentar
// la mini gráfica que aparece al hover sobre el nombre del cliente en
// la tab Clientes del módulo Ventas.
//
// [codigo] = código Switch Soft del cliente (ej. "D-04"), igual que Cliente.id
// del bundle del frontend de Ventas.
//
// Stats:
//   - promedio_mensual:        SUM(total) / COUNT(DISTINCT (anio, mes))
//                              denominador = meses CON compra (no 12 fijos).
//   - meses_activos:           COUNT(DISTINCT (anio, mes)) en últimos 12m, 0-12.
//   - dias_desde_ultima_compra: (CURRENT_DATE - MAX(fecha))::int
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { ALL_EMPRESA_KEYS, type EmpresaKey } from "@/lib/empresa-mapping";
import { esCodigoDelGrupo } from "@/lib/clientes/mundos";

export const dynamic = "force-dynamic";

const READ_ROLES = ["admin", "contabilidad", "secretaria", "vendedor"];

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

  // 1. Resolver cliente (para el nombre) a partir del codigo (Switch Soft)
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

  // 🔴 La MISMA puerta de mundo que la ficha: esta ruta devuelve el nombre del
  // cliente y 25 meses de su venta, así que es otra "ficha por dirección".
  // Mismo 404 que un código inexistente — ver `esCodigoDelGrupo`.
  if (!(await esCodigoDelGrupo(codigo))) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // 2. Ventana de 25 meses (mes actual + 24 atrás) — la primera mitad
  //    (meses 0-12) alimenta total_12m y la serie del HoverCard; la segunda
  //    mitad (meses 13-24) alimenta total_12m_prior para el delta del
  //    bloque Ventas. El primer día del mes de hace 24 meses, YYYY-MM-DD.
  const now = new Date();
  const fromDate = new Date(now.getFullYear(), now.getMonth() - 24, 1);
  const fromIso = fromDate.toISOString().slice(0, 10);

  // 3. Fuente única switch_facturas (historia completa backfilleada del API),
  //    puenteada por ID vía switch_clientes. Base pre-impuesto neto
  //    (subtotal_descuento firmado por tipo). Proyecto Fuente Única API.

  // 3a. Puente: cids del cliente para esta empresa. empresa es fija (una sola),
  //     así que (empresa_key + cliente_switch_id) mapea sin ambigüedad.
  const { data: pares, error: pErr } = await supabaseServer
    .from("switch_clientes")
    .select("cliente_switch_id")
    .eq("codigo", codigo)
    .eq("empresa_key", empresaKey);
  if (pErr) {
    console.error("[historial-mensual] bridge query error:", pErr.message);
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  const cids = (pares ?? [])
    .map(p => (p as { cliente_switch_id: number | null }).cliente_switch_id)
    .filter((x): x is number => typeof x === "number");

  const rows: VentaRow[] = [];

  // 3b. switch_facturas — neto por tipo sobre subtotal_descuento.
  if (cids.length > 0) {
    const { data: sf, error: sErr } = await supabaseServer
      .from("switch_facturas")
      .select("fecha, tipo_comprobante, subtotal_descuento")
      .eq("empresa_key", empresaKey)
      .in("cliente_switch_id", cids)
      .gte("fecha", fromIso);
    if (sErr) {
      console.error("[historial-mensual] switch_facturas query error:", sErr.message);
      return NextResponse.json({ error: sErr.message }, { status: 500 });
    }
    for (const f of (sf ?? []) as {
      fecha: string | null;
      tipo_comprobante: string | null;
      subtotal_descuento: number | string | null;
    }[]) {
      const base = Number(f.subtotal_descuento ?? 0);
      const signed =
        f.tipo_comprobante === "Nota de Crédito"
          ? -base
          : f.tipo_comprobante === "Factura" ||
              f.tipo_comprobante === "Tiquete" ||
              f.tipo_comprobante === "Transacción" ||
              f.tipo_comprobante === "Nota de Débito"
            ? base
            : 0;
      // fecha de switch es timestamptz → recortar a YYYY-MM-DD para el bucketing.
      rows.push({ anio: null, mes: null, fecha: f.fecha ? String(f.fecha).slice(0, 10) : null, total: signed });
    }
  }

  // 3. Agregar por (anio, mes) y trackear fecha máxima
  const bucket = new Map<string, MesAgg>();
  let maxFechaIso: string | null = null;
  for (const r of (rows ?? []) as VentaRow[]) {
    let anio = r.anio ?? 0;
    let mes = r.mes ?? 0;
    if ((!anio || !mes) && r.fecha) {
      const d = new Date(r.fecha);
      anio = d.getUTCFullYear();
      mes = d.getUTCMonth() + 1;
    }
    if (!anio || !mes) continue;

    if (r.fecha && (!maxFechaIso || r.fecha > maxFechaIso)) {
      maxFechaIso = r.fecha;
    }

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

  // 4. Generar serie completa de 25 meses, rellenando huecos con 0. La serie
  //    incluye los 12 meses previos al período actual para poder calcular
  //    total_12m_prior. El frontend del HoverCard sólo consume total_12m,
  //    total_12m_prior y meses_activos — meses[] queda como ventana 13 más
  //    recientes para back-compat con consumidores que esperen la serie corta.
  const allMeses: MesAgg[] = [];
  for (let i = 24; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const anio = d.getFullYear();
    const mes = d.getMonth() + 1;
    const found = bucket.get(`${anio}-${mes}`);
    allMeses.push({
      anio,
      mes,
      total: Math.round((found?.total ?? 0) * 100) / 100,
      facturas: found?.facturas ?? 0,
    });
  }
  // Particionar: prior 12 (idx 0-11) y current 13 (idx 12-24)
  const priorMeses = allMeses.slice(0, 12);
  const meses = allMeses.slice(12);

  // 5. Stats accionables
  const total12m = meses.reduce((s, m) => s + m.total, 0);
  const total12mPrior = priorMeses.reduce((s, m) => s + m.total, 0);
  // meses_activos: distinct (anio, mes) con compra en la ventana actual (13m)
  const mesesActivos = meses.filter(m => m.total > 0).length;
  // promedio sobre meses activos (no sobre 12 fijos): refleja ticket-mes real
  const promedioMensual = mesesActivos > 0 ? total12m / mesesActivos : 0;
  // días desde la última factura (no desde el inicio del mes)
  let diasDesdeUltimaCompra: number | null = null;
  if (maxFechaIso) {
    const ms = Date.parse(maxFechaIso);
    if (!Number.isNaN(ms)) {
      diasDesdeUltimaCompra = Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));
    }
  }

  return NextResponse.json({
    cliente_nombre: cliente.nombre as string,
    meses,
    total_12m: Math.round(total12m * 100) / 100,
    total_12m_prior: Math.round(total12mPrior * 100) / 100,
    promedio_mensual: Math.round(promedioMensual * 100) / 100,
    meses_activos: mesesActivos,
    dias_desde_ultima_compra: diasDesdeUltimaCompra,
  });
}
