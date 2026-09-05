import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { rolesBoston } from "@/lib/cxc/boston-roles";

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

// Quién puede leer esta cartera vive en `lib/cxc/boston-roles.ts` — la MISMA
// lista de la que la pantalla deriva si dibuja o no la pestaña. Escrita acá a
// mano, la UI se la copiaba (o no) y el vendedor tocaba una pestaña que siempre
// le contestaba 403.
import { lineaDeRechazos } from "@/lib/rechazos-de-switch";
import { empresasCarteraAparte } from "@/lib/switch-api/empresas";

// ⚠️ `select("*")` a propósito desde el 5-sep-2026: la vista ganó los tramos
// FINOS (d0_30 · d31_60 · d61_90 · d121_180 · d181_270 · d271_365 · mas_365,
// migración `20260928120000`) y con una lista escrita a mano la pestaña se
// queda sin ellos el día que la DDL corra, sin que nada avise. Con `*`, cuando
// la migración corre el detalle aparece solo; mientras no corra, las columnas
// llegan `undefined` y la pestaña se ve exactamente como hoy.
const COLS = "*";
const PAGE = 1000;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, rolesBoston());
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

  // Teléfono/celular/correo de los clientes de Boston. 🔴 Salen de
  // `switch_clientes` con `.eq("empresa_key", "confecciones_boston")` EN LA
  // MISMA CADENA: `clientes_master` es el directorio del GRUPO y Boston no
  // está ahí a propósito. Medido el 5-sep-2026: de los 390 clientes con saldo,
  // 272 tienen teléfono y 113 correo. Falla abierto: sin esta lectura la
  // pestaña se dibuja igual, sin los botones de contacto.
  const contactos = new Map<string, { telefono: string; celular: string; email: string }>();
  for (let from = 0; ; from += PAGE) {
    const { data: cs, error: csErr } = await supabaseServer
      .from("switch_clientes")
      .select("codigo,telefono,celular,email")
      .eq("empresa_key", "confecciones_boston")
      .order("codigo", { ascending: true })
      .range(from, from + PAGE - 1);
    if (csErr) { console.error(`[cxc/boston] contactos: ${csErr.message}`); break; }
    if (!cs || cs.length === 0) break;
    for (const c of cs) {
      const cod = (c.codigo as string | null) ?? "";
      if (!cod) continue;
      contactos.set(cod, {
        telefono: ((c.telefono as string | null) ?? "").trim(),
        celular: ((c.celular as string | null) ?? "").trim(),
        email: ((c.email as string | null) ?? "").trim(),
      });
    }
    if (cs.length < PAGE) break;
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
      // El id de Switch viaja para que la pestaña pueda pedir los últimos 3
      // pagos de ESTE cliente a `/api/cxc/boston/ultimos-pagos` — los recibos
      // de Boston se cruzan por id, no por código (ver esa ruta).
      cliente_switch_id: r.cliente_switch_id == null ? null : Number(r.cliente_switch_id),
      nombre: (r.nombre as string) || (r.codigo as string),
      nombre_normalized: r.nombre_normalized as string,
      d0_90: Number(r.d0_90) || 0,
      d91_120: Number(r.d91_120) || 0,
      d121_plus: Number(r.d121_plus) || 0,
      total: Number(r.total) || 0,
      // Los tramos finos, para el detalle al pasar el mouse — los MISMOS
      // cortes que el grupo. `null` mientras la DDL 20260928120000 no corra.
      finos: r.d0_30 == null ? null : {
        d0_30: Number(r.d0_30) || 0,
        d31_60: Number(r.d31_60) || 0,
        d61_90: Number(r.d61_90) || 0,
        d121_180: Number(r.d121_180) || 0,
        d181_270: Number(r.d181_270) || 0,
        d271_365: Number(r.d271_365) || 0,
        mas_365: Number(r.mas_365) || 0,
      },
      // Teléfono y correo de ESTA cartera: salen de `switch_clientes` acotado a
      // Boston, nunca de `clientes_master` (donde Boston no está, a propósito).
      telefono: contactos.get(String(r.codigo))?.telefono ?? "",
      celular: contactos.get(String(r.codigo))?.celular ?? "",
      correo: contactos.get(String(r.codigo))?.email ?? "",
      ultimo_pago_fecha: pago?.fecha ?? null,
      ultimo_pago_monto: pago?.monto ?? null,
    };
  });

  const suma = (k: "d0_90" | "d91_120" | "d121_plus" | "total") =>
    Math.round(clientes.reduce((s, c) => s + c[k], 0) * 100) / 100;

  // Lo que el guard dejó AFUERA de esos totales. El total sigue siendo el real
  // —la cifra imposible no entra a la base y la cartera sigue sirviendo para
  // cobrar—, pero la pestaña lo DICE en vez de callarlo. Daniel: *"el sistema
  // debe de mostrar la info tal cual"*.
  //
  // 🔴 ACOTADO A BOSTON con la MISMA lista de la que sale su `SyncStatus`
  // (`empresasCarteraAparte()` = estadoCuenta:true + cxc:false, o sea SOLO
  // Boston). Una lista escrita a mano acá es la que un día se aparta en silencio
  // y mete una fila del grupo en la pestaña que Daniel prohibió mezclar.
  const avisoMontos = await lineaDeRechazos({
    familias: ["cxc"],
    empresas: empresasCarteraAparte(),
  });

  return NextResponse.json({
    clientes,
    avisoMontos,
    totales: {
      total: suma("total"),
      d0_90: suma("d0_90"),
      d91_120: suma("d91_120"),
      d121_plus: suma("d121_plus"),
      clientes: clientes.length,
    },
  });
}
