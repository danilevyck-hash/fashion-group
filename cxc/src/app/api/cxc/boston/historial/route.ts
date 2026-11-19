// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cxc/boston/historial?cliente=5429&tipo=pagos|facturas
//
// El gemelo de `/api/cxc/historial` para la cartera APARTE de Confecciones
// Boston. 🔴 NO comparte ni una función de consulta con la del grupo: la
// empresa es un LITERAL en la cadena, y un parámetro sería una puerta (mismo
// criterio que `/api/cxc/boston/ultimos-pagos`).
//
// El cliente va por `cliente_switch_id` —el id de Switch de Boston—, no por
// código: el código de la cartera de Boston no coincide con el de los recibos.
// Los ids se REPITEN entre empresas, por eso la empresa va en cada consulta.
// Boston no tiene renglones de factura (`switch_factura_lineas` no la cubre).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { rolesBoston } from "@/lib/cxc/boston-roles";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { TIPOS_VENTA_CONOCIDOS } from "@/lib/ventas/tipos-comprobante";
import {
  HISTORIAL_CLIENTE_2026_11,
  historialDeFacturas,
  historialDePagos,
  type FacturaLeida,
} from "@/lib/cxc/historial-cliente";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** La ÚNICA empresa que esta ruta puede leer. Literal a propósito. */
const EMPRESA_BOSTON = "confecciones_boston";

export async function GET(req: NextRequest) {
  if (!HISTORIAL_CLIENTE_2026_11) return NextResponse.json({ error: "No disponible" }, { status: 404 });
  const auth = requireRole(req, rolesBoston());
  if (auth instanceof NextResponse) return auth;

  const raw = (req.nextUrl.searchParams.get("cliente") ?? "").trim();
  const cliente = /^\d+$/.test(raw) ? Number(raw) : NaN;
  const tipo = req.nextUrl.searchParams.get("tipo");
  if (!Number.isInteger(cliente) || cliente <= 0 || (tipo !== "pagos" && tipo !== "facturas")) {
    return NextResponse.json({ error: "Faltan el cliente o el tipo" }, { status: 400 });
  }

  try {
    if (tipo === "pagos") {
      const filas = await leerTodoPaginado<{ fecha: string; total: unknown }>(
        `switch_recibos (historial Boston ${cliente})`,
        (pedirCount, desde, hasta) =>
          supabaseServer
            .from("switch_recibos")
            .select("fecha,total", pedirCount ? { count: "exact" } : {})
            .eq("empresa_key", EMPRESA_BOSTON)
            .eq("cliente_switch_id", cliente)
            .eq("es_retencion", false)
            .neq("total", 0)
            .not("fecha", "is", null)
            .order("fecha", { ascending: false })
            .order("id", { ascending: true })
            .range(desde, hasta),
      );
      const meses = historialDePagos(
        filas.map((r) => ({ fecha: String(r.fecha), monto: Number(r.total) || 0, empresa: EMPRESA_BOSTON })),
      );
      return NextResponse.json({ cliente, tipo, meses });
    }

    const filas = await leerTodoPaginado<FacturaLeida>(
      `switch_facturas (historial Boston ${cliente})`,
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from("switch_facturas")
          .select(
            "empresa_key,switch_factura_id,secuencial,tipo_comprobante,fecha,total",
            pedirCount ? { count: "exact" } : {},
          )
          .eq("empresa_key", EMPRESA_BOSTON)
          .eq("cliente_switch_id", cliente)
          .in("tipo_comprobante", [...TIPOS_VENTA_CONOCIDOS])
          .order("fecha", { ascending: false })
          .order("id", { ascending: true })
          .range(desde, hasta),
    );
    return NextResponse.json({ cliente, tipo, meses: historialDeFacturas(filas) });
  } catch (e) {
    console.error(`[cxc/boston/historial] ${tipo} ${cliente}:`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo leer el historial" }, { status: 500 });
  }
}
