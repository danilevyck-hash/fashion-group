// ─────────────────────────────────────────────────────────────────────────────
// GET /api/proveedores/compras-mes-a-mes?empresa=vistana (27-nov-2026,
// `MANTENER_PRESIONADO_2026_11`)
//
// Mantener presionada una empresa en Proveedores (celular): cuánta mercancía
// ENTRÓ cada mes este año contra el año pasado — `switch_ingresos_mercancia`,
// cantidad × costo CIF. El mes en curso, contra los mismos días (`hoyPanama`).
//
// 🔴 Una línea sin costo CIF deja su mes SIN NÚMERO (nunca un cero): medido el
// 27-nov-2026, Fashion Shoes no trae el CIF antes del 21-jul-2026 (3.493 de
// 3.735 líneas). Solo lectura; las mismas empresas y roles que Proveedores.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { empresasConCxp } from "@/lib/switch-api/empresas";
import { INGRESOS_EMPRESA_KEYS } from "@/lib/switch-api/ingresos-mercancia-web";
import { hoyPanama } from "@/lib/fecha-panama";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { desdeParaComparar, mesesContraAnioPasado } from "@/lib/mes-contra-anio-pasado";
import { MANTENER_PRESIONADO_2026_11 } from "@/lib/ui/mantener-presionado-2026-11";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Fila = { fecha: string; cantidad: unknown; costo_cif: unknown };

export async function GET(req: NextRequest) {
  if (!MANTENER_PRESIONADO_2026_11) return NextResponse.json({ error: "Apagado" }, { status: 404 });
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const empresa = (req.nextUrl.searchParams.get("empresa") ?? "").trim();
  if (!(empresasConCxp() as readonly string[]).includes(empresa)) {
    return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  }

  // Multifashion no trae sus ingresos al sistema (el sync es de las 6): se
  // dice, nunca una fila de ceros.
  if (!INGRESOS_EMPRESA_KEYS.includes(empresa)) return NextResponse.json({ empresa, sinDatos: true });

  const hoy = hoyPanama();
  try {
    const filas = await leerTodoPaginado<Fila>(`switch_ingresos_mercancia ${empresa}`, (pedirCount, a, b) =>
      supabaseServer
        .from("switch_ingresos_mercancia")
        .select("fecha,cantidad,costo_cif", pedirCount ? { count: "exact" } : {})
        .eq("empresa_key", empresa)
        .gte("fecha", desdeParaComparar(hoy))
        .lte("fecha", hoy)
        .order("n_interno", { ascending: true })
        .order("linea", { ascending: true })
        .range(a, b),
    );
    const compras = filas.map((r) => ({
      fecha: String(r.fecha),
      monto: r.costo_cif == null ? null : (Number(r.cantidad) || 0) * Number(r.costo_cif),
    }));
    return NextResponse.json({ empresa, ...mesesContraAnioPasado(compras, hoy) });
  } catch (e) {
    console.error(`[proveedores/compras-mes-a-mes] ${empresa}: ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ error: "No se pudieron leer las compras" }, { status: 500 });
  }
}
