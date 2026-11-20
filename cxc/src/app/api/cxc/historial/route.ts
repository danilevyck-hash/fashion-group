// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cxc/historial?codigo=D-25&empresa=fashion_shoes&tipo=pagos|compras
//
// TODOS los pagos o TODAS las compras de un cliente del GRUPO en UNA empresa,
// desde oct-2022, agrupados por mes (`lib/cxc/historial-cliente.ts`). Lo abren
// «Últ. pago» y «Últ. compra» de la tabla «Por empresa» de CxC.
//
// 🔴 LA EMPRESA SE VALIDA AQUÍ: solo una de las 6 del grupo
// (`CXC_GRUPO_EMPRESA_KEYS`); Boston, ACS o cualquier otra → 400. Solo admin y
// secretaria: el vendedor y el `gerente_boston` reciben 403 (19-nov-2026).
//
// 🔴 LA IDENTIDAD ES EL CÓDIGO: los recibos llevan `cliente_codigo`; las
// facturas se puentean por ID (`switch_clientes` → `(empresa_key,
// cliente_switch_id)`), nunca por nombre.
//
// 🩸 `db-max-rows` = 1000 corta EN SILENCIO: D-151 tiene 1.714 recibos y D-25
// 1.937 facturas (medido 19-nov-2026). Todo se lee con `leerTodoPaginado`,
// orden de negocio + `id` de desempate.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_HISTORIAL_GRUPO } from "@/lib/cxc/historial-servidor";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { TIPOS_VENTA_CONOCIDOS } from "@/lib/ventas/tipos-comprobante";
import {
  HISTORIAL_CLIENTE_2026_11,
  historialDeCompras,
  historialDePagos,
  type FacturaLeida,
} from "@/lib/cxc/historial-cliente";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function leerPagos(codigo: string, empresas: string[]) {
  const filas = await leerTodoPaginado<{ fecha: string; total: unknown; empresa_key: string }>(
    `switch_recibos (historial ${codigo})`,
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from("switch_recibos")
        .select("fecha,total,empresa_key", pedirCount ? { count: "exact" } : {})
        .in("empresa_key", empresas)
        .eq("cliente_codigo", codigo)
        .eq("es_retencion", false)
        .neq("total", 0)
        .not("fecha", "is", null)
        .order("fecha", { ascending: false })
        .order("id", { ascending: true })
        .range(desde, hasta),
  );
  return historialDePagos(
    filas.map((r) => ({ fecha: String(r.fecha), monto: Number(r.total) || 0, empresa: r.empresa_key })),
  );
}

async function leerCompras(codigo: string, empresas: string[]) {
  const { data: pares, error } = await supabaseServer
    .from("switch_clientes")
    .select("empresa_key, cliente_switch_id")
    .eq("codigo", codigo)
    .in("empresa_key", empresas);
  if (error) throw new Error(error.message);
  const validos = ((pares ?? []) as { empresa_key: string; cliente_switch_id: number | null }[])
    .filter((p) => empresas.includes(p.empresa_key) && Number.isInteger(p.cliente_switch_id));
  if (validos.length === 0) return [];
  // Tuplas (empresa, id): un mismo id es OTRO cliente en otra empresa.
  const tuplas = validos
    .map((p) => `and(empresa_key.eq.${p.empresa_key},cliente_switch_id.eq.${p.cliente_switch_id})`)
    .join(",");
  const filas = await leerTodoPaginado<FacturaLeida>(
    `switch_facturas (historial ${codigo})`,
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from("switch_facturas")
        .select(
          "empresa_key,switch_factura_id,secuencial,tipo_comprobante,fecha,total",
          pedirCount ? { count: "exact" } : {},
        )
        .in("empresa_key", empresas)
        .in("tipo_comprobante", [...TIPOS_VENTA_CONOCIDOS])
        .or(tuplas)
        .order("fecha", { ascending: false })
        .order("id", { ascending: true })
        .range(desde, hasta),
  );
  return historialDeCompras(filas);
}

export async function GET(req: NextRequest) {
  if (!HISTORIAL_CLIENTE_2026_11) return NextResponse.json({ error: "No disponible" }, { status: 404 });
  const auth = requireRole(req, ROLES_HISTORIAL_GRUPO);
  if (auth instanceof NextResponse) return auth;

  const codigo = (req.nextUrl.searchParams.get("codigo") ?? "").trim();
  const empresa = req.nextUrl.searchParams.get("empresa") ?? "";
  const tipo = req.nextUrl.searchParams.get("tipo");
  if (!codigo || (tipo !== "pagos" && tipo !== "compras")) {
    return NextResponse.json({ error: "Faltan el código del cliente o el tipo" }, { status: 400 });
  }
  if (!(CXC_GRUPO_EMPRESA_KEYS as readonly string[]).includes(empresa)) {
    return NextResponse.json({ error: "Empresa no válida" }, { status: 400 });
  }
  const empresas = [empresa];

  try {
    const meses = tipo === "pagos" ? await leerPagos(codigo, empresas) : await leerCompras(codigo, empresas);
    return NextResponse.json({ codigo, empresa, tipo, meses });
  } catch (e) {
    console.error(`[cxc/historial] ${tipo} ${codigo}:`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo leer el historial" }, { status: 500 });
  }
}
