// ============================================================================
// Marketing — SE ANOTA CADA ZIP QUE SE BAJÓ (22-sep-2026).
//
// Daniel: *«el ZIP se baja cuando se quiera desde el período abierto; se GUARDA
// cada ZIP que se bajó»*. Medido el 22-sep-2026: `mk_periodos.reporte` está
// NULL en los 6 períodos, así que hoy no queda rastro de nada de lo que se le
// mandó a una marca.
//
// Lo que se anota es una lista append-only en `mk_periodos.zips_bajados`
// (columna de la migración `20261216120100`), y el archivo mismo queda en el
// bucket privado `marketing`, en `periodos/<id>/<fecha>.zip`.
//
// 🔴 SE RELEE LA FILA ANTES DE ESCRIBIR. La lista es un jsonb: escribir la que
// uno tenía en la mano borraría el ZIP que otra persona anotó mientras tanto.
// Se lee, se agrega al final (`anotarZip`) y se escribe.
//
// 🔴 FALLA ABIERTA, SIEMPRE. Anotar es un registro, no la descarga: si la
// columna no existe todavía, si la fila cambió o si Storage se niega, el ZIP
// igual sale. Nadie se queda sin su archivo porque la bitácora falle.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import { anotarZip, type RegistroZip } from "./periodo-estado";
import { completarPeriodo, esColumnaAusente } from "./columnas-opcionales";
import { guardarZipDelPeriodo } from "./storage";

export interface ZipQueSeBajo {
  periodoId: string;
  /** "YYYY-MM-DD" de Panamá. */
  fechaISO: string;
  bajadoPor: string;
  /** Instante, ISO. */
  ahoraISO: string;
  gastos: number;
  monto: number;
  bytes: Buffer;
}

/** Qué pasó al anotar. Sirve para el log y para el candado; nadie lo muestra. */
export interface ResultadoAnotarZip {
  guardado: boolean;
  anotado: boolean;
  archivoPath: string | null;
}

/**
 * Guarda el archivo y anota el registro. Nunca lanza.
 */
export async function anotarZipBajado(z: ZipQueSeBajo): Promise<ResultadoAnotarZip> {
  const periodoId = String(z.periodoId ?? "").trim();
  if (periodoId.length === 0) {
    // Multifashion no tiene período: no hay fila donde anotar, y no es un error.
    return { guardado: false, anotado: false, archivoPath: null };
  }

  const archivoPath = await guardarZipDelPeriodo(periodoId, z.fechaISO, z.bytes);

  try {
    const { data, error } = await supabaseServer
      .from("mk_periodos")
      .select("id, zips_bajados")
      .eq("id", periodoId)
      .maybeSingle();
    if (error) {
      if (!esColumnaAusente(error)) throw new Error(error.message);
      return { guardado: archivoPath !== null, anotado: false, archivoPath };
    }
    if (!data) return { guardado: archivoPath !== null, anotado: false, archivoPath };

    const fila = completarPeriodo(data as Record<string, unknown>);
    const registro: RegistroZip = {
      bajado_en: z.ahoraISO,
      bajado_por: String(z.bajadoPor ?? "").trim() || "sistema",
      gastos: Number(z.gastos) || 0,
      monto: Number(z.monto) || 0,
      archivo_path: archivoPath ?? "",
    };
    const lista = anotarZip(fila.zips_bajados, registro);

    const { error: errEscribir } = await supabaseServer
      .from("mk_periodos")
      .update({ zips_bajados: lista })
      .eq("id", periodoId);
    if (errEscribir) {
      if (!esColumnaAusente(errEscribir)) throw new Error(errEscribir.message);
      return { guardado: archivoPath !== null, anotado: false, archivoPath };
    }
    return { guardado: archivoPath !== null, anotado: true, archivoPath };
  } catch (err) {
    console.warn(
      "anotarZipBajado: no se pudo anotar el ZIP",
      err instanceof Error ? err.message : err,
    );
    return { guardado: archivoPath !== null, anotado: false, archivoPath };
  }
}
