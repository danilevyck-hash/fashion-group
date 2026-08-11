import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { hoyPanama } from "@/lib/fecha-panama";
import { esTablaAusente, leerMayorMes, mesMayorValido } from "@/lib/mayor/leer";
// Las formas de la respuesta viven en el módulo puro que también usa la
// pantalla: una sola definición, imposible que se desincronicen.
import type { RespuestaResumen } from "@/app/gastos-contabilidad/components/tipos";

export const dynamic = "force-dynamic";

/**
 * Resumen del MAYOR CONTABLE por empresa, para UN mes.
 *
 * Devuelve, por cada una de las 8 empresas del grupo: el `ResumenMes` completo
 * (cuentas de operación + ISR aparte + totales), los avisos, y el último mes
 * CERRADO que tenga esa empresa — que es lo que la pantalla necesita para poder
 * decir "la contabilidad llega hasta …" en vez de pintar un $0 mentiroso.
 *
 * 🔴 LA LECTURA VIVE EN `src/lib/mayor/leer.ts`, NO ACÁ. La comparte con
 * `/api/dashboard/vista-general`: dos consultas distintas para el mismo gasto es
 * cómo dos pantallas empiezan a decir números diferentes.
 *
 * 🔴 DEGRADACIÓN LIMPIA: la migración `20260810160000_mayor_contable.sql` la
 * corre Daniel A MANO y todavía no corrió. Mientras las tablas no existan, esta
 * ruta responde **200** con `{ instalado: false, empresas: [] }`. Un 500 dejaría
 * la pantalla rota; así se ve entera, con su cartel de "todavía no instalado".
 */

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const mesParam = req.nextUrl.searchParams.get("mes");
  const mes = mesParam ?? hoyPanama().slice(0, 7);
  if (!mesMayorValido(mes)) {
    return NextResponse.json(
      { error: "Mes inválido. Usa el formato AAAA-MM (ej: 2026-07)." },
      { status: 400 },
    );
  }

  try {
    const body: RespuestaResumen = await leerMayorMes(mes);
    return NextResponse.json(body);
  } catch (e) {
    // El truncado de PostgREST y la tabla ausente llegan acá como Error; sólo la
    // segunda es "todavía no instalado". Todo lo demás es un error de verdad.
    if (esTablaAusente(e)) {
      const noInstalado: RespuestaResumen = { instalado: false, mes, empresas: [] };
      return NextResponse.json(noInstalado);
    }
    console.error("[gastos-contabilidad/resumen]", e);
    return NextResponse.json(
      { error: "No se pudo cargar la información. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}
