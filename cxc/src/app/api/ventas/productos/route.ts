// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/productos?empresa=&year=&mes=&periodo=&previo=
//
// Nivel 1 del tab Productos: top por descripción + totales.
// Lee `switch_top_descripciones_reciente` sobre switch_articulo_diario (RLS
// service_role → server-only): una fila por descripción (sin límite; el cliente
// pagina con Top 20 + "Mostrar más"). La suma = total certificado del período.
// Totales se computan sumando el nivel 1 (0 filas con descripción/código NULL →
// cuadra al centavo con margen_mensual, la fuente validada).
//
// ── EL MISMO PRODUCTO, UN SOLO RENGLÓN (25-ago-2026) ────────────────────────
//
// 🩸 `Agua Dana 600 ml 20 Und ` y `Agua Dana 600 Ml 20 Und` eran DOS renglones
// de vistana. Es la misma agua, y en SWITCH tiene UNA SOLA descripción: el
// reporte le pega a toda la historia el nombre de HOY, pero nosotros guardamos
// el nombre del día en que bajamos la fila y el cron sólo re-mira 3 días.
// Por eso se agrupa por el nombre MÁS RECIENTE de cada CÓDIGO (nunca por
// parecido de textos: `Outlet Duty Free N2` y `N3` se parecen y son dos cosas).
//
// 🔴 LA VENTA TOTAL NO SE MUEVE: agrupar es juntar renglones. Medido contra
// producción, 6 empresas x 4 períodos, diferencia 0,000000
// (scripts/_verif-productos-descripcion-reciente.ts).
//
// ⛔ SIN LA MIGRACIÓN LA PANTALLA ES LA DE AYER. `rpcConFallbackDeVersion` cae
// sola a `switch_top_descripciones` cuando PostgREST dice que la función nueva
// no existe: el producto sigue partido, no hay aviso, y no se rompe nada.
//
// ⛔ YA NO SE PIDE `switch_articulo_margen_mensual` (25-ago-2026). Sólo servía
// para saber QUÉ MESES ofrecer en el selector de período, y Daniel mandó sacar
// los meses sueltos: *"solo dejame las 4 primeras, las otras quítamelas que
// sobran, nunca te las pedí"*. Era una consulta por carga de pantalla para una
// respuesta que ya no mira nadie — en una base en compute Micro eso no se
// regala. Ningún número de la pantalla salía de ahí.
//
// `periodo` (ytd | 6m | 12m | anio_pasado) elige la ventana; `mes` la acota a un
// mes calendario y solo aplica con `periodo=ytd` (el default, que es lo que la
// pantalla venía pidiendo). El parámetro SIGUE ACEPTÁNDOSE aunque la pantalla ya
// no lo mande: un `?mes=6` guardado en un marcador tiene que seguir contestando
// lo mismo, no romperse. `previo=1` devuelve LA MISMA ventana un año antes —
// es la que alimenta la columna Δ, y así el rango comparativo lo decide el
// servidor una sola vez en vez de que el cliente lo rearme y los dos diverjan.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import {
  PRODUCTOS_EMPRESA_KEYS,
  esProductosPeriodo,
  productosRangoPeriodo,
  productosRangoComparativo,
  type ProductosPeriodo,
  type ProductoNivel1,
  type ProductosResponse,
} from "@/lib/ventas/productos";
import { rpcConFallbackDeVersion } from "@/lib/ventas/rpc-version";
import {
  avisosDeClasificacion,
  catalogoAprobado,
  type GrafiaDelGrupo,
} from "@/lib/ventas/productos-clasificacion";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const empresa = sp.get("empresa") ?? "";
  const year = parseInt(sp.get("year") ?? "", 10);
  const mesRaw = sp.get("mes");
  const mes = mesRaw != null && mesRaw !== "" ? parseInt(mesRaw, 10) : null;

  if (!PRODUCTOS_EMPRESA_KEYS.includes(empresa)) {
    return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2024 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }
  if (mes !== null && (!Number.isInteger(mes) || mes < 1 || mes > 12)) {
    return NextResponse.json({ error: "mes inválido (1..12)" }, { status: 400 });
  }
  const periodoRaw = sp.get("periodo") ?? "ytd";
  if (!esProductosPeriodo(periodoRaw)) {
    return NextResponse.json({ error: "periodo inválido" }, { status: 400 });
  }
  const periodo: ProductosPeriodo = periodoRaw;
  const previo = sp.get("previo") === "1";

  const ahora = new Date();
  const { desde, hasta } = previo
    ? productosRangoComparativo(periodo, year, mes, ahora)
    : productosRangoPeriodo(periodo, year, mes, ahora);
  const comparativo = productosRangoComparativo(periodo, year, mes, ahora);

  const args = { p_empresa_key: empresa, p_desde: desde, p_hasta: hasta };
  const nivel1Res = await rpcConFallbackDeVersion<FilaNivel1[]>(
    () => supabaseServer.rpc("switch_top_descripciones_reciente", args),
    () => supabaseServer.rpc("switch_top_descripciones", args),
    { label: "switch_top_descripciones_reciente" },
  );

  if (nivel1Res.error) {
    console.error("[api/ventas/productos] nivel1:", nivel1Res.error.message);
    return NextResponse.json({ error: nivel1Res.error.message }, { status: 500 });
  }

  const crudas = (nivel1Res.data ?? []) as FilaNivel1[];

  // El catálogo aprobado sólo se pide si hay algo que clasificar: la respuesta
  // del comparativo (`previo=1`) se descarta entera salvo `productos`, y sin la
  // migración corrida ninguna fila trae grafías. Una consulta por carga de
  // pantalla para una respuesta que nadie mira no se regala en compute Micro.
  const hayGrafias = !previo && crudas.some(p => (p.grafias ?? []).length > 0);
  const aprobadas = hayGrafias ? await leerCatalogoAprobado() : null;

  const productos: ProductoNivel1[] = crudas.map(p => {
    const aviso = aprobadas
      ? avisosDeClasificacion(p.descripcion, p.grafias ?? [], aprobadas)
      : [];
    return {
      descripcion: p.descripcion,
      num_codigos: Number(p.num_codigos ?? 0),
      cantidad: Number(p.cantidad ?? 0),
      venta: Number(p.venta ?? 0),
      costo: Number(p.costo ?? 0),
      margen: p.margen != null ? Number(p.margen) : null,
      ...(aviso.length > 0 ? { aviso } : {}),
    };
  });

  // Totales = suma del nivel 1 (cuadra con la fuente certificada).
  const ventaTotal = productos.reduce((s, p) => s + p.venta, 0);
  const costoTotal = productos.reduce((s, p) => s + p.costo, 0);
  const margenTotal = ventaTotal > 0 ? (ventaTotal - costoTotal) / ventaTotal : null;

  const body: ProductosResponse = {
    empresa,
    year,
    mes,
    periodo,
    desde,
    hasta,
    comparativo,
    totales: { venta: ventaTotal, costo: costoTotal, margen: margenTotal },
    productos,
  };
  return NextResponse.json(body);
}

/** Lo que devuelve la RPC de nivel 1. `grafias` sólo llega con la nueva. */
interface FilaNivel1 extends ProductoNivel1 {
  grafias?: GrafiaDelGrupo[];
}

/**
 * El catálogo de descripciones APROBADAS — el árbitro del aviso.
 *
 * Es la MISMA tabla que usa el Depurador (`depurador_descripciones`, 240 filas)
 * y el MISMO árbitro que usó el diagnóstico. Un segundo criterio de "qué es una
 * categoría de verdad" es lo que no puede pasar.
 *
 * 🔴 SI ESTA LECTURA FALLA, NO SE AVISA NADA — y la pantalla no se cae. Sin el
 * catálogo no se puede distinguir un tipeo de una mala clasificación, y un
 * aviso adivinado es peor que ninguno.
 */
async function leerCatalogoAprobado(): Promise<Set<string> | null> {
  const { data, error } = await supabaseServer
    .from("depurador_descripciones")
    .select("descripcion, activa");
  if (error) {
    console.error("[api/ventas/productos] catálogo aprobado:", error.message);
    return null;
  }
  return catalogoAprobado(data ?? []);
}
