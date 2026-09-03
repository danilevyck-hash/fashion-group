// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cxc/boston/ultimos-pagos?cliente=5429
//
// Los ÚLTIMOS 3 PAGOS de un cliente de CONFECCIONES BOSTON — fecha y monto.
// Es el gemelo de `/api/cxc/ultimos-pagos` para la cartera APARTE, y vive
// bajo `/api/cxc/boston/` por la misma razón que la cartera: dos rutas contra
// dos filtros disjuntos, para que mezclar la plata de Boston con la del grupo
// no sea algo que se pueda hacer por descuido.
//
// 🔴 NO COMPARTE NI UNA FUNCIÓN DE CONSULTA con la ruta del grupo. La lectura
// está escrita aquí, completa, con `.eq("empresa_key", "confecciones_boston")`
// en la MISMA cadena. Un helper común "pagosDe(empresa, cliente)" sería un
// parámetro, y un parámetro es una puerta. Candado en las dos direcciones:
// `cxc-boston-ultimos-pagos-route.test.ts` (Boston no trae al grupo) y
// `cxc-ultimos-pagos-route.test.ts` (el grupo no trae a Boston).
//
// El cliente se identifica por `cliente_switch_id`, NO por código: la cartera
// de Boston (`switch_estadocuenta_aging_boston`) usa los ids numéricos de
// Switch y su `codigo` ("1", "3", "9") no coincide con el `cliente_codigo` de
// los recibos ("115429"). Medido en producción el 3-sep-2026 — es el mismo
// join que ya usa la columna «Último pago» de la pestaña.
//
// ⚠️ Los ids de Switch se REPITEN entre empresas (el 3 de Boston es otro
// cliente en Vistana): sin el filtro de empresa, la consulta traería pagos de
// otra cartera para un cliente que no es. `.limit(3)` en el servidor, nunca
// traer todo y recortar (`db-max-rows` = 1000 corta en silencio).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { rolesBoston } from "@/lib/cxc/boston-roles";
import { PAGOS_POR_EMPRESA, type PagoReciente } from "@/lib/cxc/ultimos-pagos";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** La ÚNICA empresa que esta ruta puede leer. Literal a propósito, igual que
 *  en la vista `switch_estadocuenta_aging_boston` y en la cartera. */
const EMPRESA_BOSTON = "confecciones_boston";

export async function GET(req: NextRequest) {
  // Quién puede leer la cartera de Boston vive en `lib/cxc/boston-roles.ts`.
  const auth = requireRole(req, rolesBoston());
  if (auth instanceof NextResponse) return auth;

  const raw = (req.nextUrl.searchParams.get("cliente") ?? "").trim();
  const cliente = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(cliente) || cliente <= 0) {
    return NextResponse.json({ error: "cliente requerido" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("switch_recibos")
    .select("fecha,total")
    .eq("empresa_key", EMPRESA_BOSTON)
    .eq("cliente_switch_id", cliente)
    // Retención de ITBMS no es cobro; $0,00 es aplicación/cruce o anulado.
    // Mismo criterio que la vista del último pago (20260813170000) — Boston
    // era el más afectado: 138 de 166 "últimos pagos" que no eran pagos.
    .eq("es_retencion", false)
    .neq("total", 0)
    .not("fecha", "is", null)
    .order("fecha_creacion", { ascending: false, nullsFirst: false })
    .limit(PAGOS_POR_EMPRESA);
  if (error) {
    console.error(`[cxc/boston/ultimos-pagos] ${cliente}: ${error.message}`);
    return NextResponse.json({ error: "No se pudieron leer los pagos" }, { status: 500 });
  }

  const pagos: PagoReciente[] = (data ?? []).map((r) => ({
    fecha: String((r as { fecha: string }).fecha),
    monto: Number((r as { total: unknown }).total) || 0,
  }));
  return NextResponse.json({ cliente, pagos });
}
