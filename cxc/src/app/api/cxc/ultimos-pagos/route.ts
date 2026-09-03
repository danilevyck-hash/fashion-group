// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cxc/ultimos-pagos?codigo=D-25
//
// Los ÚLTIMOS 3 PAGOS de un cliente, POR EMPRESA del grupo — fecha y monto,
// nada más. Daniel (3-sep-2026), textual: *"no me interesa saber qué factura
// pagó, solo ver sus últimos 3 pagos y fecha en CXC"*. Por eso no viaja el
// número de recibo ni la factura: la pantalla no los pide y no tiene por qué
// recibirlos.
//
// Alimenta el bloque «Últimos pagos» de la fila expandida en Cuentas por Cobrar
// (escritorio y celular). La columna «Último pago · hace N días» que ya existía
// sigue saliendo de la vista `switch_ultimo_pago_cliente_v2`; esta ruta lee la
// TABLA (`switch_recibos`) porque la vista colapsa a UNA fila por cliente por
// construcción (DISTINCT ON) y no puede dar tres.
//
// 🔴 BOSTON NUNCA ENTRA AL CXC DEL GRUPO. `switch_recibos` SÍ tiene los recibos
// de confecciones_boston (7.662 al 3-sep-2026) y de american_classic (27.788):
// conviven en la misma tabla con los del grupo. Por eso la consulta se hace
// EMPRESA POR EMPRESA, con `.eq("empresa_key", <una de las 6>)` en la MISMA
// cadena, y las 6 salen de `CXC_GRUPO_EMPRESA_KEYS` — nunca de una lista
// escrita aquí. Un código de cliente NO es único entre empresas, así que sin
// ese filtro un cliente que exista en los dos lados vería la plata de Boston
// mezclada con la del grupo. Candado: `cxc-ultimos-pagos-route.test.ts`.
//
// ⚠️ `db-max-rows` = 1000 corta EN SILENCIO. Aquí no hay riesgo porque se piden
// 3 por empresa con `.limit(3)` en el servidor — no se traen todos los recibos
// del cliente para recortar después. Seis consultas chicas contra el índice
// (empresa_key, cliente_codigo) en vez de una grande que habría que repartir.
//
// Por qué una consulta POR EMPRESA y no una sola con `.in(...)` + `.limit(18)`:
// un cliente con 18 pagos en Fashion Wear dejaría a Vistana sin ninguno. El
// límite tiene que ser por empresa, y PostgREST no sabe hacer "3 por grupo".
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { PAGOS_POR_EMPRESA, type PagoReciente } from "@/lib/cxc/ultimos-pagos";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Los mismos roles que ven el CXC del grupo (`/api/cxc/ultimo-pago`).
const CXC_ROLES = ["admin", "secretaria", "vendedor"];

/** Últimos N pagos REALES de un cliente en UNA empresa del grupo. La empresa
 *  va en la cadena, no en una proyección posterior: es el filtro que separa
 *  la plata del grupo de la de Boston. */
async function pagosDe(empresa: string, codigo: string): Promise<PagoReciente[] | null> {
  const { data, error } = await supabaseServer
    .from("switch_recibos")
    .select("fecha,total")
    .eq("empresa_key", empresa)
    .eq("cliente_codigo", codigo)
    // Una retención de ITBMS no es un cobro, y un recibo de $0,00 es una
    // aplicación/cruce o un anulado — el mismo criterio que la vista del
    // último pago (migración 20260813170000). Es el bug que Daniel cazó:
    // "$0.00 hace 15 días" en vez de los $187.651,51 de verdad.
    .eq("es_retencion", false)
    .neq("total", 0)
    .not("fecha", "is", null)
    // `fecha_creacion` trae la hora: desempata dos pagos del mismo día.
    .order("fecha_creacion", { ascending: false, nullsFirst: false })
    .limit(PAGOS_POR_EMPRESA);
  if (error) {
    console.error(`[cxc/ultimos-pagos] ${empresa}/${codigo}: ${error.message}`);
    return null;
  }
  return (data ?? []).map((r) => ({
    fecha: String((r as { fecha: string }).fecha),
    monto: Number((r as { total: unknown }).total) || 0,
  }));
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  const codigo = (req.nextUrl.searchParams.get("codigo") ?? "").trim();
  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });

  // Vendedor: solo su empresa asociada (fuente de verdad: la base, no la
  // cookie). Mismo criterio que el estado de cuenta por cliente.
  let empresas: readonly string[] = CXC_GRUPO_EMPRESA_KEYS;
  if (auth.role === "vendedor" && auth.userId) {
    const { data: u } = await supabaseServer
      .from("fg_users")
      .select("associated_company")
      .eq("id", auth.userId)
      .maybeSingle();
    const asociada = u?.associated_company ?? null;
    if (asociada) {
      // Si la asociada no es del grupo, el vendedor no ve nada — nunca se
      // amplía a "todas" por defecto.
      empresas = (CXC_GRUPO_EMPRESA_KEYS as readonly string[]).includes(asociada) ? [asociada] : [];
    }
  }

  const resultados = await Promise.all(empresas.map((e) => pagosDe(e, codigo)));
  if (resultados.some((r) => r === null)) {
    return NextResponse.json({ error: "No se pudieron leer los pagos" }, { status: 500 });
  }

  // Solo las empresas donde el cliente tiene al menos un pago: la pantalla
  // dice «Sin pagos registrados» para las que falten.
  const porEmpresa: Record<string, PagoReciente[]> = {};
  empresas.forEach((e, i) => {
    const pagos = resultados[i] as PagoReciente[];
    if (pagos.length > 0) porEmpresa[e] = pagos;
  });
  return NextResponse.json({ codigo, porEmpresa });
}
