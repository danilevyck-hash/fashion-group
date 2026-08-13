import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

// Cartera de Confecciones Boston — la pestaña APARTE del CXC.
//
// Lee `switch_estadocuenta_aging_boston`, que por definición trae SOLO a Boston
// (ver la migración 20260728120000). Es su gemela de `switch_estadocuenta_aging`,
// con la misma forma de fila, y las dos son disjuntas por construcción: ninguna
// pantalla puede sumar las dos sin escribir la suma a mano.
//
// Por qué una ruta separada y no un parámetro `?empresa=` en la del grupo: un
// parámetro es una puerta. Mientras sean dos rutas contra dos vistas disjuntas,
// mezclar la plata de Boston con la del grupo no es algo que se pueda hacer por
// descuido — hay que proponérselo. Es la regla de Daniel: *"si un cliente esta en
// el grupo de 6 empresas y mismo cliente en conf boston, quiero q no se toque"*.
//
// Medido el 27-jul-2026 y cuadrado al centavo contra el reporte de Switch:
// 392 clientes · $224.749,88 (0-90 $97.354,17 · 91-120 $8.843,93 · 121+ $118.551,78).
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Boston es la cartera del negocio de la familia, no la del grupo: la ven los
// mismos roles que el CXC, menos `vendedor` — los vendedores del grupo no
// cobran esta cartera ni comisionan sobre ella.
const ROLES_BOSTON = ["admin", "secretaria"];

const COLS = "codigo,cliente_switch_id,nombre,nombre_normalized,d0_90,d91_120,d121_plus,total";
const PAGE = 1000;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ROLES_BOSTON);
  if (auth instanceof NextResponse) return auth;

  // Paginado: PostgREST corta en 1000 filas EN SILENCIO. Hoy Boston tiene 392
  // clientes con saldo, pero el tope no se pide por el tamaño de hoy.
  const filas: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseServer
      .from("switch_estadocuenta_aging_boston")
      .select(COLS)
      .order("codigo", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`[cxc/boston] ${error.message}`);
      return NextResponse.json({ error: "Error al leer la cartera de Boston" }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    filas.push(...data);
    if (data.length < PAGE) break;
  }

  // Último pago por cliente. Se acota a Boston explícitamente: la vista
  // `switch_ultimo_pago_cliente_v2` no filtra empresa (devuelve toda empresa con
  // filas en switch_recibos), así que sin el `.eq` traería también al grupo.
  //
  // 🩸 PAGINADO (13-ago-2026): esta lectura NO paginaba, y ya truncaba.
  // `db-max-rows` = 1000 corta EN SILENCIO y Boston tiene **1.947 filas** en la
  // vista: se leían 1.000 y las 947 restantes se veían en pantalla como "sin
  // último pago" — un cliente que pagó ayer parecía no haber pagado nunca. Orden
  // estable por `cliente_switch_id` (es la llave del DISTINCT ON de la vista, y
  // acotada a una empresa es única) para no repetir ni saltear filas.
  //
  // Un recibo de $0,00 NO es un pago: mismo criterio que /api/cxc/ultimo-pago,
  // red de seguridad hasta que corra la DDL 20260813170000 que lo pone en la
  // vista. Boston es el más afectado: 138 de los 166 clientes con un "último
  // pago" que no es un pago son suyos, algunos con fechas de 2024.
  const pagos = new Map<string, { fecha: string; monto: number }>();
  for (let from = 0; ; from += PAGE) {
    const { data: up, error: upErr } = await supabaseServer
      .from("switch_ultimo_pago_cliente_v2")
      .select("cliente_switch_id,ultimo_pago_fecha,ultimo_pago_monto")
      .eq("empresa_key", "confecciones_boston")
      .order("cliente_switch_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (upErr) {
      console.error(`[cxc/boston] último pago: ${upErr.message}`);
      break; // no-crítico: la cartera se muestra igual, sin la columna
    }
    if (!up || up.length === 0) break;
    for (const p of up) {
      if (p.cliente_switch_id == null) continue;
      const monto = Number(p.ultimo_pago_monto) || 0;
      if (monto === 0) continue; // aplicación/cruce o recibo anulado
      pagos.set(String(p.cliente_switch_id), {
        fecha: p.ultimo_pago_fecha as string,
        monto,
      });
    }
    if (up.length < PAGE) break;
  }

  // Chip "también en el grupo". Es SOLO una marca visual: dice que ese nombre
  // existe en las dos carteras, para que quien cobre sepa que hay otra relación
  // abierta. NO se suma nada — los dos saldos siguen viviendo cada uno en su
  // pestaña. Medido el 27-jul-2026: 10 clientes están en los dos lados (CITY
  // MALL DAVID, LA FRONTERA DUTY FREE, EL MACHETAZO-CALIDONIA, GOLDEN MALL...).
  const enGrupo = new Set<string>();
  const { data: g, error: gErr } = await supabaseServer
    .from("switch_estadocuenta_aging")
    .select("nombre_normalized");
  if (gErr) console.error(`[cxc/boston] cruce con el grupo: ${gErr.message}`);
  for (const r of g ?? []) if (r.nombre_normalized) enGrupo.add(String(r.nombre_normalized));

  const clientes = filas.map((r) => {
    const pago = pagos.get(String(r.cliente_switch_id));
    return {
      tambien_en_grupo: enGrupo.has(String(r.nombre_normalized)),
      codigo: r.codigo as string,
      nombre: (r.nombre as string) || (r.codigo as string),
      nombre_normalized: r.nombre_normalized as string,
      d0_90: Number(r.d0_90) || 0,
      d91_120: Number(r.d91_120) || 0,
      d121_plus: Number(r.d121_plus) || 0,
      total: Number(r.total) || 0,
      ultimo_pago_fecha: pago?.fecha ?? null,
      ultimo_pago_monto: pago?.monto ?? null,
    };
  });

  const suma = (k: "d0_90" | "d91_120" | "d121_plus" | "total") =>
    Math.round(clientes.reduce((s, c) => s + c[k], 0) * 100) / 100;

  return NextResponse.json({
    clientes,
    totales: {
      total: suma("total"),
      d0_90: suma("d0_90"),
      d91_120: suma("d91_120"),
      d121_plus: suma("d121_plus"),
      clientes: clientes.length,
    },
  });
}
