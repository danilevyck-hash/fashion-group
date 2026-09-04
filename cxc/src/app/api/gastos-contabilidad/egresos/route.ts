import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { hoyPanama } from "@/lib/fecha-panama";
import { leerEgresosMes } from "@/lib/egresos/leer";
import { lineaDeNoLeidos } from "@/lib/rechazos-de-switch";
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
 * Historia (ago-2026): DEGRADABA LIMPIO — mientras la migración
 * `20260813120000_egresos_varios.sql` no corriera, respondía **200** con
 * `{ instalado: false, empresas: [] }` y la pantalla ponía su cartel. Tolerancia
 * retirada el 3-sep-2026: las tablas existen desde esa migración (verificado en
 * producción). Hoy un "no existe esa tabla" es un permiso, un timeout o un
 * cambio de esquema, y CUALQUIER error sale como 500 con el mensaje humano del
 * módulo — nunca como una pantalla vacía y tranquila que dice "todavía no está
 * instalado" sobre un SQL que ya corrió. `instalado` sigue viajando (siempre
 * `true`) porque la pantalla y Vista General lo leen.
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
    // Los dos en paralelo: el aviso es una consulta de 1 fila contra el log y no
    // tiene por qué alargar la pantalla. Falla al silencio (ver
    // `rechazos-de-switch.ts`), así que no puede romper el total.
    //
    // 🔴 SIN `empresas`: el módulo muestra las 8 y el aviso también las mira. Lo
    // que NUNCA hace es juntarlas en un número — la línea cuenta los renglones
    // de cada empresa por separado (`textoDeNoLeidos`).
    const [body, avisoNoLeidos] = await Promise.all([
      leerEgresosMes(mes),
      lineaDeNoLeidos({ familias: ["egreso_vario"] }),
    ]);
    const respuesta: RespuestaEgresos = { ...body, avisoNoLeidos };
    return NextResponse.json(respuesta);
  } catch (e) {
    // El truncado de PostgREST y cualquier error de la base llegan acá como
    // Error, y todos son errores de verdad (tolerancia a DDL retirada).
    console.error("[gastos-contabilidad/egresos]", e);
    return NextResponse.json(
      { error: "No se pudo cargar la información. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}
