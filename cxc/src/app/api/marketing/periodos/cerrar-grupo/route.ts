import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { esFaltaDeTablas, periodoAbiertoDe } from "@/lib/marketing/periodos-io";
import { agregar, cargarDatosPeriodos } from "@/lib/marketing/periodos-reporte";
import { grupoCierrePorKey, nombreDeBloque } from "@/lib/marketing/bloques";
import {
  ErrorDeCierre,
  MSG_SIN_TABLAS,
  cerrarPeriodoDeMarca,
  validarNombreSiguiente,
  type ZipDelCierre,
} from "../cerrar";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

// POST /api/marketing/periodos/cerrar-grupo
//   body: { grupo: "pvh", nombreSiguiente: string }
//
// 🔑 "CERRAR LAS TRES" SON TRES CIERRES SEGUIDOS, NO UN CIERRE CONJUNTO.
// Daniel, textual: *"ellos facturan a mi bajo compañia diferentes. una por
// marca. cada marca tiene su encargado"*. Lo único que comparten Tommy, Calvin
// y Karl es el DÍA en que él las cierra. Cada una genera su reporte, su período
// nuevo y su ZIP, y la respuesta trae un botón de ZIP por marca cerrada.
//
// Reusa `cerrarPeriodoDeMarca` — la MISMA función del botón de una sola marca.
//
// 🩸 UNA MARCA SIN GASTO NO SE CIERRA. Karl hoy está en $0: cerrarla generaría
// un reporte vacío, un período nuevo y un archivo que no dice nada, y le
// ensuciaría el historial con cierres que nunca ocurrieron. Se informa y listo.
//
// 🔴 NO HAY ROLLBACK. Si la segunda falla, la primera QUEDA CERRADA: su reporte
// ya se generó y puede haberse mandado. Deshacerlo sería inventar que no pasó.
// Se para ahí (no se sigue insistiendo contra una base que acaba de fallar) y
// la respuesta dice exactamente cuál falló y cuáles no se intentaron.

interface FilaCierre {
  marcaCodigo: string;
  marcaNombre: string;
  periodoId: string | null;
  periodoNombre: string | null;
  total: number;
  cerrado: boolean;
  motivo?: string;
  zip?: ZipDelCierre;
  siguiente?: { id: string; nombre: string };
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  let grupoKey = "";
  let nombreSiguiente = "";
  try {
    const body = (await req.json()) as { grupo?: unknown; nombreSiguiente?: unknown };
    grupoKey = typeof body?.grupo === "string" ? body.grupo.trim() : "";
    nombreSiguiente = validarNombreSiguiente(body?.nombreSiguiente);
  } catch (err) {
    if (err instanceof ErrorDeCierre) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "No se recibió qué cerrar." },
      { status: 400 },
    );
  }

  const grupo = grupoCierrePorKey(grupoKey);
  if (!grupo) {
    return NextResponse.json(
      { error: "Ese grupo de marcas no existe." },
      { status: 400 },
    );
  }

  const cierres: FilaCierre[] = [];
  let fallo: string | null = null;
  // Períodos abiertos en ESTA corrida. Sin la migración por marca, Tommy,
  // Calvin y Karl comparten el período viejo 'pvh': cerrado el primero, el
  // segundo encontraría el período que se acaba de abrir y lo cerraría vacío.
  const reciénAbiertos = new Set<string>();
  let datos: Awaited<ReturnType<typeof cargarDatosPeriodos>> | null = null;

  try {
    for (const marca of grupo.marcas) {
      if (fallo) {
        cierres.push({
          marcaCodigo: marca,
          marcaNombre: nombreDeBloque(marca),
          periodoId: null,
          periodoNombre: null,
          total: 0,
          cerrado: false,
          motivo: `No se intentó: antes falló ${fallo}.`,
        });
        continue;
      }

      // Se RECARGA después de cada cierre a propósito: el cierre anterior movió
      // sellos, y leer una foto vieja le metería a Calvin los documentos que
      // Tommy acaba de reportar. Si el anterior NO cerró, la foto sigue siendo
      // válida y no se vuelve a barrer la base (que se satura fácil).
      if (!datos) datos = await cargarDatosPeriodos();
      if (!datos.hayTablas) {
        return NextResponse.json({ error: MSG_SIN_TABLAS }, { status: 409 });
      }
      const nombreMarca = nombreDeBloque(marca, datos.marcas);

      const periodo = await periodoAbiertoDe(marca);
      if (!periodo) {
        cierres.push({
          marcaCodigo: marca,
          marcaNombre: nombreMarca,
          periodoId: null,
          periodoNombre: null,
          total: 0,
          cerrado: false,
          motivo: "No tiene un período abierto.",
        });
        continue;
      }
      if (reciénAbiertos.has(String(periodo.id))) {
        cierres.push({
          marcaCodigo: marca,
          marcaNombre: nombreMarca,
          periodoId: String(periodo.id),
          periodoNombre: periodo.nombre,
          total: 0,
          cerrado: false,
          motivo:
            "Todavía comparte el período con las otras marcas del grupo, así que ya se cerró con ellas.",
        });
        continue;
      }

      const bloque = agregar(datos).bloques.find((b) => b.key === marca);
      const total = bloque?.total ?? 0;
      const sinGasto =
        !bloque || (bloque.facturas.count === 0 && bloque.muebles.count === 0);
      if (sinGasto) {
        cierres.push({
          marcaCodigo: marca,
          marcaNombre: nombreMarca,
          periodoId: String(periodo.id),
          periodoNombre: periodo.nombre,
          total: 0,
          cerrado: false,
          motivo: "No tiene gasto en este período, así que no se cerró.",
        });
        continue;
      }

      try {
        const r = await cerrarPeriodoDeMarca({
          periodoId: String(periodo.id),
          nombreSiguiente,
          cerradoPor: auth.userName || auth.role,
          datos,
        });
        reciénAbiertos.add(r.siguiente.id);
        datos = null; // el cierre movió sellos: la próxima marca relee
        cierres.push({
          marcaCodigo: r.cerrado.marcaCodigo,
          marcaNombre: r.cerrado.marcaNombre,
          periodoId: r.cerrado.id,
          periodoNombre: r.cerrado.nombre,
          total: r.cerrado.totales.total,
          cerrado: true,
          zip: r.zip,
          siguiente: r.siguiente,
        });
      } catch (err) {
        if (err instanceof ErrorDeCierre && err.status === 409) throw err;
        const msg =
          err instanceof ErrorDeCierre
            ? err.message
            : "No se pudo cerrar. Intenta de nuevo.";
        console.error(
          "POST /api/marketing/periodos/cerrar-grupo:",
          err instanceof Error ? err.message : err,
        );
        fallo = nombreMarca;
        cierres.push({
          marcaCodigo: marca,
          marcaNombre: nombreMarca,
          periodoId: String(periodo.id),
          periodoNombre: periodo.nombre,
          total,
          cerrado: false,
          motivo: msg,
        });
      }
    }
  } catch (err) {
    if (err instanceof ErrorDeCierre && err.status === 409) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (esFaltaDeTablas(err)) {
      return NextResponse.json({ error: MSG_SIN_TABLAS }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("POST /api/marketing/periodos/cerrar-grupo:", msg);
    return NextResponse.json(
      { error: "No se pudieron cerrar las marcas. Intenta de nuevo." },
      { status: 500 },
    );
  }

  const cerradas = cierres.filter((c) => c.cerrado);
  return NextResponse.json({
    ok: fallo === null,
    grupo: grupo.key,
    grupoEtiqueta: grupo.etiqueta,
    nombreSiguiente,
    cierres,
    cerradas: cerradas.length,
    ...(fallo
      ? {
          error: `Se cerró ${cerradas.length} de ${grupo.marcas.length}. Falló ${fallo}; lo que ya se cerró quedó cerrado.`,
        }
      : {}),
  });
}
