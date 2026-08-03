// Endpoint del sub-tab "Detalle mensual" de Multifashion.
// Wrapper de la RPC multifashion_detalle_mensual_v2(p_year, p_mes).
//
// Soporta cualquier mes histórico (no solo mes en curso). Reemplaza al
// endpoint /api/multifashion/mes-en-curso anterior.
//
// Query params:
//   year  int  default: año calendario actual
//   mes   int  default: si year=currentYear → mes actual, si no → 12
//
// La RPC es independiente de multifashion_dia_a_dia_v4, que sigue viva pero solo
// cubre el mes en curso. v2 cubre mes en curso + histórico + YoY, y compara mes
// COMPLETO en meses cerrados (v1 recortaba al último día con ventas).

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { clampAnioMes } from "@/lib/multifashion/ventana-gerente";

export const dynamic = "force-dynamic";
// Hace 2 llamados al RPC mensual (año actual + año anterior para la comparación
// YoY del gráfico) → más pesado. maxDuration explícito para no caer en timeout
// en cold-starts tras un deploy.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Multifashion es módulo admin-only por ahora (los demás roles se definen
  // después). overview queda compartido con Ventas, pero los sub-tabs son admin.
  const auth = requireRole(req, ["admin", "secretaria", "gerente_acs"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const yearParam = sp.get("year");
  const mesParam = sp.get("mes");
  const yearPedido = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(yearPedido) || yearPedido < 2000 || yearPedido > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }

  const now = new Date();
  const isCurrent = yearPedido === now.getFullYear();
  const mesFallback = isCurrent ? now.getMonth() + 1 : 12;
  const mesPedido = mesParam ? parseInt(mesParam, 10) : mesFallback;
  if (!Number.isFinite(mesPedido) || mesPedido < 1 || mesPedido > 12) {
    return NextResponse.json({ error: "mes inválido (1..12)" }, { status: 400 });
  }

  // CANDADO gerente_acs: mes en curso + mismo mes del año pasado, impuesto acá
  // (la UI que esconde el selector es cortesía, no candado). Admin no cambia.
  // Ver src/lib/multifashion/ventana-gerente.ts.
  const acotado = clampAnioMes(auth.role, { year: yearPedido, mes: mesPedido }, now);
  const year = acotado.year;
  const mes = acotado.mes as number;

  // Rango del mes para el desacople retail/mayoreo. El RPC de detalle ya da el
  // retail (totales.ventas, is_wholesale=false). El mayoreo lo sumamos aparte de
  // la MISMA vista (_multifashion_sf_vw, is_wholesale=true) por mes calendario —
  // mismo bucket que usa la fila Multifashion del grupo, así el titular "tienda
  // completa" cuadra al centavo con Ventas. NO toca vistas ni cálculos base.
  const mesNext = mes === 12 ? `${year + 1}-01-01` : `${year}-${String(mes + 1).padStart(2, "0")}-01`;
  const mesInicio = `${year}-${String(mes).padStart(2, "0")}-01`;

  // Detalle mensual + ventas por hora (hora pico) en paralelo. La hora pico es
  // aditiva: si su RPC falla, el detalle igual responde (la sección de horas
  // simplemente no se renderiza) — no bloquea el resto del subtab.
  // Detalle + hora pico + margen mensual tienda completa + mayoreo del mes +
  // cliente(s) de mayoreo, en paralelo. Todo lo extra es aditivo: si falla, el
  // detalle igual responde (el titular cae a retail puro y la nota no se muestra).
  const [detalleRes, horasRes, margenRes, mayoreoRes, mayoreoClienteRes, prevYearRes, retailProyRes] = await Promise.all([
    supabaseServer.rpc("multifashion_detalle_mensual_v2", { p_year: year, p_mes: mes }),
    supabaseServer.rpc("multifashion_horas_pico_v1", { p_year: year, p_mes: mes }),
    // _v2: margen mensual desde ventas_rollup_mensual_mv (híbrido cerrados/mes en
    // curso) — mismo número exacto, sin agregar las vistas en vivo. Fallback a la v1
    // si la migración aún no se aplicó (aditivo: si ambas fallan, la card cae a "—").
    (async () => {
      const v2 = await supabaseServer.rpc("multifashion_margen_tienda_mensual_v2", { p_year: year, p_mes: mes });
      if (!v2.error) return v2;
      return supabaseServer.rpc("multifashion_margen_tienda_mensual", { p_year: year, p_mes: mes });
    })(),
    // Mayoreo del mes: misma vista, is_wholesale=true. subtotal ya trae el signo
    // de NC (la vista lo resuelve). Mayoreo de Multifashion es escaso (≤ unas
    // pocas filas/mes), no requiere paginación.
    supabaseServer
      .from("_multifashion_sf_vw")
      .select("subtotal")
      .eq("anio", year)
      .eq("mes", mes)
      .eq("is_wholesale", true),
    // Nombre del/los cliente(s) de mayoreo para la nota (solo etiqueta). El monto
    // sale de la vista; el nombre de la tabla base (la vista no expone cliente).
    supabaseServer
      .from("switch_facturas")
      .select("cliente_nombre")
      .eq("empresa_key", "american_classic")
      .eq("is_wholesale", true)
      .gte("fecha", mesInicio)
      .lt("fecha", mesNext),
    // Comparación YoY día-por-día del gráfico (modo Mes): MISMO mes del AÑO
    // ANTERIOR. Reusa el MISMO RPC con year-1 → metodología idéntica (retail,
    // _multifashion_sf_vw, misma fuente y bucket de día). Aditivo: si falla o no
    // hay datos (año anterior < may 2024), la línea simplemente no se dibuja.
    supabaseServer.rpc("multifashion_detalle_mensual_v2", { p_year: year - 1, p_mes: mes }),
    // Proyección de cierre MÉTODO-B (pico fuera + run-rate plano + mayoreo). Reemplaza
    // la proyección lineal del titular (que se inflaba con días pico de feriado).
    supabaseServer.rpc("proyeccion_mensual_retail_v1", { p_anio: year, p_mes: mes }),
  ]);

  if (detalleRes.error) {
    console.error("[multifashion/detalle-mensual] rpc error", detalleRes.error);
    return NextResponse.json({ error: detalleRes.error.message }, { status: 500 });
  }

  if (horasRes.error) {
    console.error("[multifashion/detalle-mensual] horas rpc error", horasRes.error);
  }
  const horas = horasRes.error
    ? { horas: [], hora_pico: null, hora_pico_ventas: null }
    : (horasRes.data ?? { horas: [], hora_pico: null, hora_pico_ventas: null });

  // Inyectar el margen tienda completa del mes en totales.margen (el RPC de
  // detalle lo deja en null porque switch_facturas no trae costo per-factura).
  const detalle = detalleRes.data as Record<string, unknown>;
  const margenMes = margenRes.error
    ? null
    : ((margenRes.data as { margen?: number | null } | null)?.margen ?? null);
  const totales = (detalle?.totales ?? {}) as Record<string, unknown>;
  if (margenRes.error) {
    console.error("[multifashion/detalle-mensual] margen rpc error", margenRes.error);
  }

  // Mayoreo del mes (tienda completa = retail + mayoreo). retail = totales.ventas
  // (lo deja el RPC, is_wholesale=false). El titular VENTAS MES usará ventas_total;
  // los comparativos (MoM/YoY), ticket promedio y proyección siguen sobre ventas
  // (retail) → sus % NO se mueven.
  if (mayoreoRes.error) {
    console.error("[multifashion/detalle-mensual] mayoreo query error", mayoreoRes.error);
  }
  const mayoreoFilas = mayoreoRes.error
    ? []
    : ((mayoreoRes.data ?? []) as Array<{ subtotal: number | null }>);
  const mayoreoMes = mayoreoFilas.reduce((s, r) => s + Number(r.subtotal ?? 0), 0);
  // Cantidad de facturas de mayoreo del mes — alimenta el resumen "N facturas"
  // de la nota cuando hay más de un cliente.
  const mayoreoFacturas = mayoreoFilas.length;
  const retailVentas = Number(totales.ventas ?? 0);

  // Etiqueta del cliente de mayoreo (solo para la nota). 1 cliente → su nombre;
  // >1 → "N clientes mayoreo". Casing tal cual la DB (consistente con la nota del
  // grupo en Ventas).
  if (mayoreoClienteRes.error) {
    console.error("[multifashion/detalle-mensual] mayoreo cliente query error", mayoreoClienteRes.error);
  }
  const clientesMayoreo = mayoreoClienteRes.error
    ? []
    : [...new Set(
        ((mayoreoClienteRes.data ?? []) as Array<{ cliente_nombre: string | null }>)
          .map(r => (r.cliente_nombre ?? "").trim())
          .filter(Boolean),
      )];
  const mayoreoCliente = clientesMayoreo.length === 1
    ? clientesMayoreo[0]
    : clientesMayoreo.length > 1
      ? `${clientesMayoreo.length} clientes mayoreo`
      : null;

  // Serie de comparación YoY día-por-día (mismo mes, año anterior). Mapea por día
  // del mes y la inyecta como `ventas_anio_anterior` en cada día del mes actual.
  // Si el año anterior no tiene datos (ej. cae antes de may 2024), queda en null y
  // el gráfico no dibuja la línea (sin error).
  if (prevYearRes.error) {
    console.error("[multifashion/detalle-mensual] año anterior rpc error", prevYearRes.error);
  }
  const prevYear = prevYearRes.error ? null : (prevYearRes.data as Record<string, unknown> | null);
  const prevYearTotales = (prevYear?.totales ?? {}) as { ventas?: number | null };
  const anioAnteriorTieneData = Number(prevYearTotales.ventas ?? 0) > 0;
  const ventasPorDiaAA = new Map<number, number>();
  for (const d of (prevYear?.dias ?? []) as Array<{ dia: number; ventas: number | null }>) {
    ventasPorDiaAA.set(Number(d.dia), Number(d.ventas ?? 0));
  }
  const diasConYoY = ((detalle?.dias ?? []) as Array<Record<string, unknown>>).map((d) => ({
    ...d,
    ventas_anio_anterior: anioAnteriorTieneData
      ? (ventasPorDiaAA.get(Number(d.dia)) ?? 0)
      : null,
  }));

  // Proyección de cierre MÉTODO-B (validado backtest 8.6% vs 9.8% lineal): día pico
  // (>4× mediana, ≥10 días) entra al acumulado real pero NO se extrapola; el resto se
  // proyecta al run-rate plano normal; + mayoreo real (ya incluido en proyeccion_total).
  // Gate de mes en curso = el RPC lineal del detalle solo devuelve proyección para el
  // mes actual; en meses cerrados queda null y la respetamos.
  const esMesEnCurso = totales.proyeccion_cierre != null;
  //
  // RETAIL PURO (25-jul-2026): Multifashion mide la tienda, y el mayoreo
  // (intercompañía + Frontera) no es retail de mostrador. Por eso se usa
  // `proyeccion_retail` y NO `proyeccion_total` (que suma el mayoreo del mes).
  // Así la proyección queda en la misma base que el titular VENTAS MES.
  const retailProy = retailProyRes.error
    ? []
    : ((retailProyRes.data ?? []) as Array<{
        empresa_key: string;
        proyeccion_retail: number | null;
        suficiente_data: boolean;
      }>);
  const acProy = retailProy.find((r) => r.empresa_key === "american_classic");
  const proyeccionRetail =
    esMesEnCurso && acProy?.suficiente_data && acProy.proyeccion_retail != null
      ? Number(acProy.proyeccion_retail)
      : null;
  if (retailProyRes.error) {
    console.error("[multifashion/detalle-mensual] proyeccion_mensual_retail_v1", retailProyRes.error.message);
  }

  return NextResponse.json({
    ...detalle,
    dias: diasConYoY,
    anio_anterior: year - 1,
    anio_anterior_tiene_data: anioAnteriorTieneData,
    totales: {
      ...totales,
      margen: margenMes,
      mayoreo: mayoreoMes,
      ventas_total: retailVentas + mayoreoMes,
      proyeccion_cierre: proyeccionRetail,
    },
    mayoreo_cliente: mayoreoCliente,
    // Lista completa y conteo de facturas: la nota de Multifashion resume
    // ("N facturas") y deja el detalle de clientes accesible debajo.
    mayoreo_clientes: clientesMayoreo,
    mayoreo_facturas: mayoreoFacturas,
    ...(horas as Record<string, unknown>),
  });
}
