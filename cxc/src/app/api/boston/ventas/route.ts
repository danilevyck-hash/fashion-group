import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { EMPRESA_BOSTON, rolesModuloBoston } from "@/lib/boston/rol";
import { empresasConUtilidad } from "@/lib/switch-api/empresas";

// ─────────────────────────────────────────────────────────────────────────────
// VENTAS DE CONFECCIONES BOSTON — mes a mes, y NADA del grupo.
//
// 🔴 POR QUÉ ES UNA RUTA APARTE Y NO UN `?empresa=` EN /api/ventas.
//
// Es la misma decisión —y por el mismo motivo— que ya tomó `/api/cxc/boston`:
// *"un parámetro es una puerta. Mientras sean dos rutas contra dos fuentes
// disjuntas, mezclar la plata de Boston con la del grupo no es algo que se
// pueda hacer por descuido — hay que proponérselo"*.
//
// Y acá el argumento es todavía más fuerte, porque el módulo Ventas **no tiene**
// esa puerta: `/ventas` es admin-only en el SSR, `fetchVentasResumen({ year })`
// no recibe empresa y nunca la recibió (llama RPCs de `p_anio` que abarcan
// siempre las 8), y de sus cinco pestañas TRES excluyen a Boston a propósito
// (Clientes esconde su píldora, Productos la deja fuera de
// `PRODUCTOS_EMPRESA_KEYS` porque `switch_articulo_diario` no se le backfilleó,
// y Comisiones la rechaza con 400 contra `B2B_EMPRESA_KEYS`). Abrirle ese
// módulo a David habría sido rediseñarlo para 8 empresas y después taparle 7.
//
// ═══ LA FUENTE: `ventas_rollup_mensual_mv`, LA MISMA DEL RESTO ═══════════════
//
// 🔑 No se inventa una cuenta nueva. La MV es el rollup mensual que ya usan
// `/api/ventas/resumen-anual`, `/api/ventas/mes-anio` y Vista General, con la
// llave `(empresa_key, mes)` y un índice por `(empresa_key, anio)`. Filtrarla
// por Boston es leer MENOS filas de lo que ya se lee, no una consulta nueva.
//
// ⚠️ Y es lo que evita el error de signo. `ventas_netas` sale de
// `switch_ventas_unificado_vw`, que suma `subtotal_descuento` y **RESTA las
// Notas de Crédito**. Medido el 27-ago-2026 contra la tabla cruda: Boston tiene
// 1.210 NCs guardadas en POSITIVO, así que un `sum(total)` a mano habría dado
// **$87.661,61 en agosto contra los $34.560,85 reales** — la clase de número
// que se lee como un mes bueno y no lo es. La regla de Daniel es literal: *lo
// que resta, RESTA*.
//
// ⚠️ Y también evita el otro error: `ventas_netas` es SIN ITBMS. En este
// sistema las ventas van sin impuesto y la cartera con él; sumar `total` habría
// mezclado las dos varas.
//
// ═══ 🔴 SIN COSTO Y SIN UTILIDAD — Y NO ES UN OLVIDO ═════════════════════════
//
// La MV trae `costo_total` y `utilidad` para Boston (salen de
// `switch_articulo_diario`, que sí la cubre: su venta cuadra al centavo con la
// de facturas mes a mes). Pero **Boston es `utilidad: false`** en
// `EMPRESA_SYNC_CAPABILITIES`: su reporte de utilidad de Switch nunca se
// sincronizó y nunca se certificó contra nada. Los márgenes que salen de ahí
// oscilan entre 12% y 53% de un mes al otro, y publicar un margen que nadie
// cuadró es peor que no publicarlo: se usa para decidir precios.
//
// 🔑 Se DERIVA de `empresasConUtilidad()` en vez de escribirse `false` acá. El
// día que Daniel encienda el sync de utilidad de Boston, esta pantalla se
// entera sola; una constante local se habría quedado vieja en silencio.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** ¿La utilidad de Boston está certificada? Hoy no, y la pantalla lo dice. */
const HAY_UTILIDAD = (empresasConUtilidad() as readonly string[]).includes(EMPRESA_BOSTON);

interface FilaMv {
  anio: number;
  mes_num: number;
  ventas_netas: number | string | null;
}

const MES_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export async function GET(req: NextRequest) {
  const auth = requireRole(req, rolesModuloBoston());
  if (auth instanceof NextResponse) return auth;

  // 🔴 `.eq(EMPRESA_BOSTON)` y no `.in(...)` ni un parámetro: la empresa es una
  // CONSTANTE del módulo. El barrido de `boston-acceso.test.ts` exige que
  // ninguna ruta de `/api/boston/**` lea la empresa de la URL.
  const { data, error } = await supabaseServer
    .from("ventas_rollup_mensual_mv")
    .select("anio, mes_num, ventas_netas")
    .eq("empresa_key", EMPRESA_BOSTON)
    .order("anio", { ascending: true })
    .order("mes_num", { ascending: true });

  if (error) {
    console.error(`[boston/ventas] ${error.message}`);
    return NextResponse.json({ error: "No se pudieron leer las ventas de Confecciones Boston" }, { status: 500 });
  }

  const filas = (data ?? []) as FilaMv[];

  // años → 12 meses. Un mes sin filas queda en 0 y NO se omite: un hueco en la
  // lista se lee como "no vendimos", y eso es una afirmación.
  const porAnio = new Map<number, number[]>();
  for (const f of filas) {
    const anio = Number(f.anio);
    if (!Number.isFinite(anio) || f.mes_num < 1 || f.mes_num > 12) continue;
    let meses = porAnio.get(anio);
    if (!meses) { meses = Array(12).fill(0); porAnio.set(anio, meses); }
    meses[f.mes_num - 1] += Number(f.ventas_netas ?? 0);
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const anios = [...porAnio.keys()].sort((a, b) => b - a);
  const años = anios.map((anio) => {
    const meses = porAnio.get(anio)!;
    return {
      anio,
      total: round2(meses.reduce((s, v) => s + v, 0)),
      meses: meses.map((v, i) => ({ mes: i + 1, label: MES_ABBR[i], ventas: round2(v) })),
    };
  });

  return NextResponse.json({
    empresa: EMPRESA_BOSTON,
    // La pantalla lo dice en una línea, en vez de mostrar una columna vacía.
    utilidadDisponible: HAY_UTILIDAD,
    años,
  });
}
