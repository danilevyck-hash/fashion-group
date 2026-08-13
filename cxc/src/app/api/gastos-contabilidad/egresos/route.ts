import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { hoyPanama } from "@/lib/fecha-panama";
import { esTablaAusente } from "@/lib/contable/tabla-ausente";
import { leerEgresosMes } from "@/lib/egresos/leer";
import { mesEgresosValido } from "@/lib/egresos/reglas";
import type { RespuestaEgresos } from "@/app/gastos-contabilidad/components/tipos";

export const dynamic = "force-dynamic";

/**
 * EGRESOS VARIOS por empresa, para UN mes — la segunda fuente del módulo Gastos.
 *
 * 🔴 POR QUÉ ES UNA RUTA APARTE Y NO UN `?fuente=` DE `/resumen`.
 * Las dos fuentes CONVIVEN y no se suman (ver `src/lib/egresos/reglas.ts`): son
 * dos formas distintas de medir —el mayor es contabilidad devengada, esto es
 * caja— y enero-2026 está en las dos. Con una sola ruta que devuelve "una u
 * otra" según un parámetro, el día que alguien quisiera pintar las dos juntas
 * tendría el camino servido; con dos rutas y dos formas de respuesta distintas,
 * sumarlas exige escribirlo a propósito. Además la respuesta de egresos NO tiene
 * la misma forma (no hay estado "cerrado", no hay ISR, y hay renglones que no
 * son gasto), así que forzarlas al mismo tipo perdería información.
 *
 * 🔴 DEGRADACIÓN LIMPIA: la migración `20260813120000_egresos_varios.sql` la
 * corre Daniel A MANO. Mientras las tablas no existan, esta ruta responde **200**
 * con `{ instalado: false, empresas: [] }`. Un 500 dejaría la pantalla rota; así
 * se ve entera, con su cartel.
 */
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const mesParam = req.nextUrl.searchParams.get("mes");
  const mes = mesParam ?? hoyPanama().slice(0, 7);
  if (!mesEgresosValido(mes)) {
    return NextResponse.json(
      { error: "Mes inválido. Usa el formato AAAA-MM (ej: 2026-07)." },
      { status: 400 },
    );
  }

  try {
    const body: RespuestaEgresos = await leerEgresosMes(mes);
    return NextResponse.json(body);
  } catch (e) {
    // El truncado de PostgREST y la tabla ausente llegan acá como Error; sólo la
    // segunda es "todavía no instalado". Todo lo demás es un error de verdad.
    if (esTablaAusente(e)) {
      const noInstalado: RespuestaEgresos = { instalado: false, mes, empresas: [] };
      return NextResponse.json(noInstalado);
    }
    console.error("[gastos-contabilidad/egresos]", e);
    return NextResponse.json(
      { error: "No se pudo cargar la información. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}
