// ─────────────────────────────────────────────────────────────────────────────
// Endpoint del sub-tab "Productos" de Multifashion: lo más vendido del mes,
// agrupado por ARTÍCULO y por MARCA (unidades, monto y % del total).
//
// Fuente: `switch_articulo_diario` (american_classic), que mantiene al día el
// cron `switch-articulos` (08:40 UTC). No se le pide NADA a Switch en vivo.
//
// Query params (los mismos que overview / detalle-mensual, para que el selector
// de período del módulo sirva sin traducción):
//   year int — default: año actual
//   mes  int — 1..12, default: mes en curso (año actual) / 12 (año cerrado)
//
// ── LAS TRES COSAS QUE ESTA RUTA NO PUEDE HACER MAL ─────────────────────────
//
// 1. LA VENTANA DE `gerente_acs` SE ACOTA ACÁ, EN EL SERVIDOR. Jennifer ve el
//    mes en curso y el mismo mes del año pasado. Esconder el selector en la UI
//    no cierra nada: con su cookie se llama a esta URL a mano. (Ver
//    src/lib/multifashion/ventana-gerente.ts y el candado
//    multifashion-ventana-gerente.test.ts, que exige el clamp en toda ruta nueva.)
//
// 2. LAS NOTAS DE CRÉDITO RESTAN. La tabla guarda MAGNITUDES positivas y el
//    signo lo pone la lectura, mirando `tipo`. La matemática vive en
//    `src/lib/multifashion/productos.ts` — módulo puro, con su candado.
//
// 3. SE LEE PAGINADO. `db-max-rows` = 1000 y PostgREST corta EN SILENCIO. El mes
//    más grande medido (dic-2025) tiene 5.321 filas: sin paginar se leerían
//    1.000 y la pestaña mostraría el 19% de las ventas SIN UN SOLO ERROR. Por eso
//    va `leerTodoPaginado`, que además verifica contra un COUNT exacto.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { clampAnioMes } from "@/lib/multifashion/ventana-gerente";
import {
  agregarProductos,
  type FilaArticuloDiario,
  type FilaMarca,
} from "@/lib/multifashion/productos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** La empresa del módulo. Constante y no un parámetro: Multifashion ES
 *  american_classic, y aceptarla por query sería una fuga (gerente_acs solo
 *  puede ver esta tienda). */
const EMPRESA = "american_classic";

/** Cuántos renglones se devuelven por agrupador. El % ya se calculó contra el
 *  total COMPLETO del período antes de cortar (ver productos.ts). */
const TOP_N = 50;

const dd = (n: number) => String(n).padStart(2, "0");

export async function GET(req: NextRequest) {
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

  // CANDADO gerente_acs — ver el punto 1 del encabezado. Admin no cambia en nada.
  const acotado = clampAnioMes(auth.role, { year: yearPedido, mes: mesPedido }, now);
  const year = acotado.year;
  const mes = acotado.mes as number;

  // `fecha` es DATE pelado, así que el mes se acota con dos fechas de calendario
  // (nada de timestamps ni zonas horarias: no hay hora que correr).
  const desde = `${year}-${dd(mes)}-01`;
  const hasta = `${year}-${dd(mes)}-${dd(new Date(Date.UTC(year, mes, 0)).getUTCDate())}`;

  try {
    // ── Ventas del período. PAGINADO — ver el punto 3 del encabezado. El orden
    //    es el de la PAGINACIÓN (id, único y estable), no el de presentación:
    //    el orden que ve Daniel lo decide la agregación, por monto.
    const filas = await leerTodoPaginado<FilaArticuloDiario>(
      `switch_articulo_diario (${EMPRESA} ${desde}→${hasta})`,
      (pedirCount, ini, fin) =>
        supabaseServer
          .from("switch_articulo_diario")
          .select(
            "articulo_id, codigo, descripcion, tipo, cantidad_total, venta_total",
            pedirCount ? { count: "exact" } : {},
          )
          .eq("empresa_key", EMPRESA)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("id", { ascending: true })
          .range(ini, fin),
    );

    // ── Diccionario de marcas. ADITIVO: si todavía no existe la tabla (la DDL
    //    se aplica a mano en este proyecto) o está vacía, la pestaña sigue
    //    funcionando y el agrupador por marca lo DICE, en vez de inventar la
    //    marca a partir del código del proveedor.
    let marcas: FilaMarca[] = [];
    let marcaDisponible = true;
    let marcaError: string | null = null;
    try {
      marcas = await leerTodoPaginado<FilaMarca>(
        `switch_articulo_marca (${EMPRESA})`,
        (pedirCount, ini, fin) =>
          supabaseServer
            .from("switch_articulo_marca")
            .select("articulo_id, marca_id, marca_nombre", pedirCount ? { count: "exact" } : {})
            .eq("empresa_key", EMPRESA)
            .order("articulo_id", { ascending: true })
            .range(ini, fin),
      );
      marcaDisponible = marcas.length > 0;
    } catch (err) {
      marcaDisponible = false;
      marcaError = err instanceof Error ? err.message : "error inesperado";
      console.error("[multifashion/productos] diccionario de marcas no disponible", err);
    }

    const resumen = agregarProductos(filas, marcas, TOP_N);

    return NextResponse.json({
      year,
      mes,
      desde,
      hasta,
      /** Filas crudas leídas — el número que prueba que no hubo truncado. */
      filasLeidas: filas.length,
      marcaDisponible,
      marcaError,
      ...resumen,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error inesperado";
    console.error("[multifashion/productos] fetch failed", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
