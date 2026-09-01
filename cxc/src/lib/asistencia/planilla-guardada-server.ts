/* ─────────────────────────────────────────────────────────────────────────────
 * El I/O de la planilla congelada. La regla vive en `planilla-guardada.ts`, que
 * es puro; acá solo se junta y se escribe el dato.
 *
 * 🩸 IGUAL QUE `planilla-server.ts`, `config-server.ts` Y
 * `aprobador-empresa-server.ts`: si la migración todavía no corrió, esto NO
 * revienta. La planilla se sigue calculando EXACTAMENTE como hoy, lo único que
 * no se puede es guardarla, y se dice en pantalla con el nombre del archivo. En
 * este repo los DDL los corre Daniel a mano y varios se quedaron pendientes
 * semanas: que la pantalla entera se caiga por eso sería cambiar un aviso por
 * «Asistencia está rota».
 *
 * ⚠️ La degradación solo ocurre cuando el error NOMBRA la tabla. Tragarse
 * cualquier error convertiría un permiso, un timeout o un RLS en «todavía no se
 * puede guardar» — y acá eso es peor que en otros lados: la contadora leería
 * «falta correr el archivo», Daniel lo correría, y el problema real (que nadie
 * miró) seguiría ahí mientras la planilla no se guarda.
 * ────────────────────────────────────────────────────────────────────────── */

import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { esTablaFaltante } from "./config";
import type { LineaPlanilla } from "./planilla";
import {
  etiquetaRango,
  filaDeLinea,
  totalesDe,
  versionSiguiente,
  type CabeceraGuardada,
  type EstadoGuardado,
  type TotalesGuardados,
} from "./planilla-guardada";

export const TABLA_GUARDADA = "asistencia_planilla_guardada";
export const TABLA_GUARDADA_LINEA = "asistencia_planilla_guardada_linea";

/** Las columnas de la cabecera. Select EXPLÍCITO, nunca `*`. */
const COLS_CABECERA =
  "id, empresa, desde, hasta, quincena, version, estado, cerrada_por, cerrada_en, "
  + "reabierta_por, reabierta_en, motivo_reabrir, personas, total_bruto, "
  + "total_deducciones, total_neto, factor_base";

interface FilaCabecera {
  id: string;
  empresa: string;
  desde: string;
  hasta: string;
  quincena: string | null;
  version: number | string | null;
  estado: string;
  cerrada_por: string;
  cerrada_en: string;
  reabierta_por: string | null;
  reabierta_en: string | null;
  motivo_reabrir: string | null;
  personas: number | string | null;
  total_bruto: number | string | null;
  total_deducciones: number | string | null;
  total_neto: number | string | null;
  factor_base: number | string | null;
}

/** ⚠️ PostgREST devuelve los `numeric` como TEXTO. Convertir acá, una vez. */
const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function cabeceraDeFila(f: FilaCabecera): CabeceraGuardada {
  return {
    id: String(f.id),
    empresa: String(f.empresa),
    // `date` de Postgres vuelve como `YYYY-MM-DD`. Se corta por las dudas: con
    // una hora pegada, la comparación de texto del solapamiento seguiría siendo
    // correcta, pero lo que se muestra diría otra cosa.
    desde: String(f.desde).slice(0, 10),
    hasta: String(f.hasta).slice(0, 10),
    quincena: f.quincena ?? null,
    etiqueta: etiquetaRango({ desde: String(f.desde).slice(0, 10), hasta: String(f.hasta).slice(0, 10) }),
    version: Math.max(1, Math.round(num(f.version))),
    estado: String(f.estado) as EstadoGuardado,
    cerradaPor: String(f.cerrada_por),
    cerradaEn: String(f.cerrada_en),
    reabiertaPor: f.reabierta_por ?? null,
    reabiertaEn: f.reabierta_en ?? null,
    motivoReabrir: f.motivo_reabrir ?? null,
    personas: Math.round(num(f.personas)),
    totalBruto: num(f.total_bruto),
    totalDeducciones: num(f.total_deducciones),
    totalNeto: num(f.total_neto),
    factorBase: num(f.factor_base),
  };
}

export interface CabecerasLeidas {
  cabeceras: CabeceraGuardada[];
  faltaTabla: boolean;
}

/**
 * TODOS los cuadros de una empresa, del más nuevo al más viejo.
 *
 * 🔴 La lectura PAGINA aunque hoy sean cuatro filas: `db-max-rows` = 1000 corta
 * EN SILENCIO, y acá un truncado no da error — da una lista de guardadas
 * INCOMPLETA, o sea que el freno del solapamiento dejaría pasar un doble pago
 * justo cuando ya hay historia suficiente para que importe.
 */
export async function leerCabeceras(empresa: string): Promise<CabecerasLeidas> {
  try {
    const filas = await leerTodoPaginado<FilaCabecera>(
      `${TABLA_GUARDADA} (${empresa})`,
      (pedirCount, desde, hasta) =>
        supabaseServer
          .from(TABLA_GUARDADA)
          .select(COLS_CABECERA, pedirCount ? { count: "exact" } : {})
          .eq("empresa", empresa)
          // Orden de NEGOCIO (la más nueva primero) + la columna única como
          // DESEMPATE, que es lo que hace la paginación estable.
          .order("desde", { ascending: false })
          .order("id", { ascending: true })
          .range(desde, hasta),
    );
    return { cabeceras: filas.map(cabeceraDeFila), faltaTabla: false };
  } catch (e) {
    // `leerTodoPaginado` envuelve el error de PostgREST en un `Error`, así que
    // acá se mira el TEXTO — y se sigue exigiendo que NOMBRE la tabla.
    if (esTablaFaltante({ message: e instanceof Error ? e.message : String(e) }, TABLA_GUARDADA)) {
      return { cabeceras: [], faltaTabla: true };
    }
    throw e;
  }
}

/** Una cabecera por id. `null` = no existe. */
export async function leerCabecera(id: string): Promise<{ cabecera: CabeceraGuardada | null; faltaTabla: boolean }> {
  const { data, error } = await supabaseServer
    .from(TABLA_GUARDADA)
    .select(COLS_CABECERA)
    .eq("id", id);

  if (error) {
    if (esTablaFaltante(error, TABLA_GUARDADA)) return { cabecera: null, faltaTabla: true };
    throw new Error(`No se pudo leer ${TABLA_GUARDADA}: ${error.message}`);
  }
  const filas = (data ?? []) as unknown as FilaCabecera[];
  return { cabecera: filas.length ? cabeceraDeFila(filas[0]) : null, faltaTabla: false };
}

/** Los renglones congelados de un cuadro, tal cual quedaron escritos. */
export async function leerLineasGuardadas(id: string): Promise<Record<string, unknown>[]> {
  return leerTodoPaginado<Record<string, unknown>>(
    `${TABLA_GUARDADA_LINEA} (${id})`,
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from(TABLA_GUARDADA_LINEA)
        .select("*", pedirCount ? { count: "exact" } : {})
        .eq("planilla_id", id)
        .order("id", { ascending: true })
        .range(desde, hasta),
  );
}

export interface ResultadoGuardado {
  ok: boolean;
  /** `true` = la migración no corrió. La pantalla avisa y NADIE creyó que guardó. */
  faltaTabla?: boolean;
  /** `true` = alguien más guardó un rango que se pisa mientras tanto (409). */
  choque?: boolean;
  id?: string;
  version?: number;
  totales?: TotalesGuardados;
  error?: string;
}

/** ¿Este error es el EXCLUDE del solapamiento? (23P01 = exclusion_violation) */
function esChoqueDeRango(err: { code?: string | null; message?: string | null }): boolean {
  return String(err.code ?? "") === "23P01"
    || /exclusion constraint|sin_solape/i.test(String(err.message ?? ""));
}

/**
 * CIERRA un cuadro (lo congela). Escribe la cabecera, después los renglones, y
 * recién entonces la marca como `cerrada`.
 *
 * 🔴 ESE ORDEN ES LA MITAD DEL DISEÑO. PostgREST no da transacción: si la
 * cabecera naciera ya en `cerrada` y los renglones fallaran, quedaría una
 * planilla firmada **sin una sola persona adentro** — que se lee como «se pagó
 * $0» y es exactamente la clase de mentira que este módulo existe para no
 * escribir. Naciendo en `cerrando` no estorba ningún rango, no la ve nadie, y
 * un corte en el medio deja basura inerte.
 *
 * 🔴 Y LOS MONTOS QUE SE ESCRIBEN SON LOS QUE LE LLEGAN CALCULADOS, nunca los
 * que mandó el navegador. Ver la ruta.
 */
export async function cerrarPlanilla(opts: {
  empresa: string;
  desde: string;
  hasta: string;
  quincena: string | null;
  factorBase: number;
  usuario: string;
  lineas: readonly LineaPlanilla[];
  /** Todas las cabeceras de esa empresa, ya leídas: de ahí sale la versión. */
  yaGuardadas: readonly CabeceraGuardada[];
}): Promise<ResultadoGuardado> {
  const id = randomUUID();
  const totales = totalesDe(opts.lineas);
  // 🔴 v2, v3… El cierre viejo NO se toca: reabrir dejó la v1 entera.
  const version = versionSiguiente(opts.empresa, { desde: opts.desde, hasta: opts.hasta }, opts.yaGuardadas);

  const { error: errCab } = await supabaseServer.from(TABLA_GUARDADA).insert({
    id,
    empresa: opts.empresa,
    desde: opts.desde,
    hasta: opts.hasta,
    quincena: opts.quincena,
    version,
    factor_base: opts.factorBase,
    estado: "cerrando",
    cerrada_por: opts.usuario,
    cerrada_en: new Date().toISOString(),
    personas: totales.personas,
    total_bruto: totales.totalBruto,
    total_deducciones: totales.totalDeducciones,
    total_neto: totales.totalNeto,
  });
  if (errCab) {
    if (esTablaFaltante(errCab, TABLA_GUARDADA)) return { ok: false, faltaTabla: true };
    if (esChoqueDeRango(errCab)) return { ok: false, choque: true };
    throw new Error(`No se pudo guardar en ${TABLA_GUARDADA}: ${errCab.message}`);
  }

  const filas = opts.lineas.map((l) => filaDeLinea(id, opts.empresa, l));
  // De a 500 para no armar un cuerpo enorme. Hoy son 40 personas; el día que
  // alguien guarde un rango largo de las tres empresas, esto no cambia de forma.
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabaseServer
      .from(TABLA_GUARDADA_LINEA)
      .insert(filas.slice(i, i + 500));
    if (error) {
      if (esTablaFaltante(error, TABLA_GUARDADA_LINEA)) return { ok: false, faltaTabla: true };
      throw new Error(`No se pudo guardar en ${TABLA_GUARDADA_LINEA}: ${error.message}`);
    }
  }

  // EL COMMIT. Recién acá el cuadro existe para el resto del sistema, y recién
  // acá el EXCLUDE de la base puede rechazarlo por pisarse con otro.
  const { error: errFin } = await supabaseServer
    .from(TABLA_GUARDADA)
    .update({ estado: "cerrada" })
    .eq("id", id);
  if (errFin) {
    if (esChoqueDeRango(errFin)) return { ok: false, choque: true };
    throw new Error(`No se pudo cerrar ${TABLA_GUARDADA}: ${errFin.message}`);
  }

  return { ok: true, id, version, totales };
}

/**
 * REABRIR. Cambia el estado y firma quién y cuándo.
 *
 * 🔴 NO BORRA NADA: ni la cabecera ni un solo renglón. El cuadro que se pagó se
 * sigue pudiendo leer entero, con sus montos, después de reabierto. Un botón que
 * hace desaparecer lo que se pagó no es un botón, es una pérdida de prueba — la
 * misma razón por la que deshacer una corrección de marcación escribe
 * `anulada_en` en vez de borrar la fila.
 *
 * ⚠️ Solo se reabre lo que está `cerrada`. Reabrir dos veces no es un error del
 * usuario que haya que castigar, pero tampoco puede pisar la firma de la
 * primera: el `.eq("estado", "guardada")` hace que la segunda no escriba nada.
 */
export async function reabrirPlanilla(
  id: string,
  usuario: string,
  motivo: string,
): Promise<{ ok: boolean; faltaTabla?: boolean; yaReabierta?: boolean }> {
  const { data, error } = await supabaseServer
    .from(TABLA_GUARDADA)
    .update({
      estado: "reabierta",
      reabierta_por: usuario,
      reabierta_en: new Date().toISOString(),
      // 🔴 OBLIGATORIO. La ruta ya lo exige y el CHECK de la base también: son
      // las mismas tres capas que el motivo de una corrección de marcación.
      motivo_reabrir: motivo,
    })
    .eq("id", id)
    // 🔴 Solo se reabre lo que está CERRADO. Sin este filtro, dos clics seguidos
    // pisan la firma del primero y el rastro dice que reabrió quien no reabrió.
    .eq("estado", "cerrada")
    .select("id");

  if (error) {
    if (esTablaFaltante(error, TABLA_GUARDADA)) return { ok: false, faltaTabla: true };
    throw new Error(`No se pudo reabrir en ${TABLA_GUARDADA}: ${error.message}`);
  }
  const tocadas = ((data ?? []) as unknown[]).length;
  return tocadas > 0 ? { ok: true } : { ok: false, yaReabierta: true };
}
