/**
 * Ventas y comisión por vendedor de una fecha a otra — para CONSULTAR.
 * Lo que se paga sigue siendo el mes cerrado (`/api/ventas/comisiones*`, que
 * esta ruta no toca). Reglas y porqué: `lib/comisiones/vendedores-rango.ts`.
 *
 * GET ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&ambito=grupo|american_classic&atajo=
 *   → { desde, hasta, anterior: {desde, hasta}, actual: FilaRango[], previo: FilaRango[] }
 * Grupo y Multifashion son dos ámbitos: nunca salen en la misma respuesta.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_COMISIONES, ROLES_VENDEDORAS_ESPEJO } from "@/lib/multifashion/acceso";
import { hoyPanama } from "@/lib/fecha-panama";
import { marcarSePaga } from "@/lib/comisiones/sin-pago";
import {
  ATAJOS_RANGO,
  MAX_DIAS_RANGO,
  VENDEDORES_RANGO_2026_10,
  diasDelRango,
  esFechaIso,
  periodoAnterior,
  type ClaveAtajo,
} from "@/lib/comisiones/vendedores-rango";
import { leerRangoGrupo, leerRangoMultifashion } from "@/lib/comisiones/vendedores-rango-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const multifashion = sp.get("ambito") === "american_classic";
  const auth = requireRole(req, multifashion ? ROLES_VENDEDORAS_ESPEJO : ROLES_COMISIONES);
  if (auth instanceof NextResponse) return auth;
  if (!VENDEDORES_RANGO_2026_10) return NextResponse.json({ error: "no disponible" }, { status: 404 });

  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  if (!esFechaIso(desde) || !esFechaIso(hasta) || desde > hasta || hasta > hoyPanama()) {
    return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
  }
  if (diasDelRango(desde, hasta) > MAX_DIAS_RANGO || desde < "2024-01-01") {
    return NextResponse.json({ error: "El rango no puede pasar de dos años ni empezar antes de 2024" }, { status: 400 });
  }
  const atajoPedido = sp.get("atajo");
  const atajo = ATAJOS_RANGO.some((a) => a.clave === atajoPedido) ? (atajoPedido as ClaveAtajo) : null;
  const anterior = periodoAnterior({ desde, hasta, atajo });
  const leer = multifashion ? leerRangoMultifashion : leerRangoGrupo;

  try {
    const [actual, previo] = await Promise.all([
      leer(desde, hasta),
      // El período anterior anterior a 2024 no existe en la RPC: se compara contra vacío.
      anterior.desde < "2024-01-01" ? Promise.resolve([]) : leer(anterior.desde, anterior.hasta),
    ]);
    return NextResponse.json({ desde, hasta, anterior, actual: marcarSePaga(actual), previo });
  } catch (e) {
    console.error("[comisiones/rango]", e);
    return NextResponse.json({ error: "No se pudo calcular el rango. Intenta de nuevo." }, { status: 500 });
  }
}
