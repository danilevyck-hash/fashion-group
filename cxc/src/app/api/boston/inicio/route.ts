import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { EMPRESA_BOSTON, rolesModuloBoston } from "@/lib/boston/rol";
import { hoyPanama } from "@/lib/fecha-panama";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

/** El nombre con el que Contabilidad guarda la empresa en `prestamos_empleados`. */
const NOMBRE_BOSTON = EMPRESA_KEY_TO_NAME[EMPRESA_BOSTON];

// ─────────────────────────────────────────────────────────────────────────────
// EL INICIO DE CONFECCIONES BOSTON — la primera pantalla de David.
//
// 🔴 ES LA FUGA Nº 2 DEL PEDIDO, Y SE TAPA ACÁ. El `/home` del sistema muestra
// los KPIs del GRUPO. David no llega nunca a esa pantalla: su único módulo es
// `boston`, y el auto-redirect de "rol con un solo módulo" —el mismo que ya
// manda a Jennifer a `/multifashion`— lo trae directo acá. Este endpoint es lo
// que hace que ese destino tenga algo que mostrar.
//
// ⚠️ NINGUNA de estas cuatro cifras es un número nuevo. Cada una sale de la
// MISMA fuente que ya la publica en su pestaña, para que Inicio no pueda decir
// algo distinto de la pestaña de al lado:
//
//   cartera   → `switch_estadocuenta_aging_boston`  (la misma de la pestaña CXC)
//   ventas    → `ventas_rollup_mensual_mv`          (la misma de la pestaña Ventas)
//   planilla  → `asistencia_personas`, empresa=confecciones_boston
//   préstamos → `prestamos_empleados` de Boston
//
// 🔑 Y las cuatro están ACOTADAS EN LA CONSULTA, no en el navegador. La lección
// del #522 es literal: las 382 filas de Boston llegaban al browser del panel
// del grupo y las descartaba un `useMemo`. La separación estaba a cargo de una
// proyección de React. Acá el filtro va en el `.eq`, así que lo que no
// corresponde no viaja.
//
// ⚠️ El préstamo se cuenta SOLO de Boston, aunque la PESTAÑA Préstamos muestre
// los de las 3 empresas. No es una contradicción: la pestaña es la excepción
// que Daniel pidió ("TODOS"), y el Inicio contesta "cómo va Boston". Un total
// de 3 empresas en la tarjeta de Boston sería exactamente el número mentiroso
// que la regla vieja prohíbe.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const PAGE = 1000;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, rolesModuloBoston());
  if (auth instanceof NextResponse) return auth;

  const hoy = hoyPanama();
  const anio = Number(hoy.slice(0, 4));
  const mesNum = Number(hoy.slice(5, 7));

  // ── Cartera: la vista de Boston, paginada (PostgREST corta en 1.000) ───────
  let cartera = { total: 0, d0_90: 0, d91_120: 0, d121_plus: 0, clientes: 0 };
  try {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabaseServer
        .from("switch_estadocuenta_aging_boston")
        .select("d0_90, d91_120, d121_plus, total")
        .order("codigo", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      for (const r of data) {
        cartera.total += Number(r.total ?? 0);
        cartera.d0_90 += Number(r.d0_90 ?? 0);
        cartera.d91_120 += Number(r.d91_120 ?? 0);
        cartera.d121_plus += Number(r.d121_plus ?? 0);
        cartera.clientes += 1;
      }
      if (data.length < PAGE) break;
    }
  } catch (e) {
    console.error(`[boston/inicio] cartera: ${e instanceof Error ? e.message : String(e)}`);
    // No-crítico: la tarjeta se dibuja en cero y las otras tres siguen.
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  cartera = {
    total: round2(cartera.total),
    d0_90: round2(cartera.d0_90),
    d91_120: round2(cartera.d91_120),
    d121_plus: round2(cartera.d121_plus),
    clientes: cartera.clientes,
  };

  // ── Ventas: mes en curso y año en curso, del MISMO rollup que la pestaña ───
  let ventasMes = 0;
  let ventasAnio = 0;
  {
    const { data, error } = await supabaseServer
      .from("ventas_rollup_mensual_mv")
      .select("mes_num, ventas_netas")
      .eq("empresa_key", EMPRESA_BOSTON)
      .eq("anio", anio);
    if (error) console.error(`[boston/inicio] ventas: ${error.message}`);
    for (const r of data ?? []) {
      const v = Number(r.ventas_netas ?? 0);
      ventasAnio += v;
      if (Number(r.mes_num) === mesNum) ventasMes += v;
    }
  }

  // ── Planilla: cuánta gente hay en la de Boston ─────────────────────────────
  // 🔴 Solo el CONTEO. Ni un salario, con o sin la línea de `VE_SUELDOS_DE_BOSTON`:
  // el Inicio no es la pantalla donde se decide eso, y un total de planilla en
  // la portada sería el sueldo promedio a una división de distancia.
  let personas = 0;
  {
    const { count, error } = await supabaseServer
      .from("asistencia_personas")
      .select("empleado_codigo", { count: "exact", head: true })
      .eq("empresa", EMPRESA_BOSTON)
      .eq("activo", true);
    if (error) console.error(`[boston/inicio] planilla: ${error.message}`);
    personas = count ?? 0;
  }

  // ── Préstamos DE BOSTON (ver la nota del encabezado) ──────────────────────
  let prestamos = { personas: 0 };
  {
    const { count, error } = await supabaseServer
      .from("prestamos_empleados")
      .select("id", { count: "exact", head: true })
      // Acá la columna guarda el NOMBRE, no la key. Sale de `EMPRESA_KEY_TO_NAME`
      // vía el import de arriba, para no escribir el string a mano.
      .eq("empresa", NOMBRE_BOSTON)
      .eq("activo", true);
    if (error) console.error(`[boston/inicio] prestamos: ${error.message}`);
    prestamos = { personas: count ?? 0 };
  }

  return NextResponse.json({
    empresa: EMPRESA_BOSTON,
    anio,
    mes: mesNum,
    cartera,
    ventas: { mes: round2(ventasMes), anio: round2(ventasAnio) },
    planilla: { personas },
    prestamos,
  });
}
