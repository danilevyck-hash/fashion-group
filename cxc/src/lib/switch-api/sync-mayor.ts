/**
 * Sincronización AUTOMÁTICA del MAYOR CONTABLE de Switch.
 *
 * Baja el reporte Contabilidad → Listado de Asientos de cada empresa, lo parsea
 * con `src/lib/mayor/parser.ts` (puro y testeado contra el archivo real) y lo
 * carga a `mayor_lineas`. Nadie sube nada a mano.
 *
 * ── Decisiones, y por qué ───────────────────────────────────────────────────
 *
 * **SECUENCIAL, una empresa a la vez, y la sesión se CIERRA al terminar.**
 * El login web hace `changesession="SI"`, que TOMA la sesión y expulsa a quien
 * esté adentro del panel de esa empresa — y el usuario configurado es el de
 * Daniel. Dos empresas en paralelo son dos sesiones abiertas a la vez, y dejar
 * una abierta alarga el despojo sin necesidad.
 *
 * **La ventana es EL AÑO ENTERO (1-ene al 31-dic), no "el mes en curso y el
 * anterior".** Es lo que más importa del diseño y va contra la intuición:
 *  · La contadora va MESES atrasada (a ago-2026 solo enero está cerrado). Una
 *    ventana de dos meses NUNCA vería el día que ella cierre febrero a julio de
 *    una sentada — el mes quedaría fuera de la ventana para siempre y el módulo
 *    seguiría diciendo "sin cerrar" con la contabilidad ya hecha. Ese fallo es
 *    SILENCIOSO, que es el peor tipo.
 *  · Cuesta lo mismo: es UN archivo por empresa. Todo 2026 de Vistana son 44
 *    líneas.
 *  · Es exactamente el rango que Daniel baja a mano, así que lo que carga el
 *    cron es comparable, archivo contra archivo, con lo que él ve en Switch.
 *  · Y deja TODOS los meses del año "cubiertos", que es lo que permite decir
 *    "se pidió y vino vacío" (sin cerrar) en vez de "no sabemos nada".
 *
 * **1 vez al día alcanza de sobra.** La contabilidad se cierra por mes, no por
 * hora. Más frecuencia solo multiplica las veces que se le toma la sesión a
 * Daniel sin traer un dato nuevo.
 *
 * **Idempotente por REEMPLAZO DE MES.** `mayor_reemplazar_mes` borra e inserta
 * el mes en UNA transacción. No se usa una llave única de contenido porque
 * (a) un mismo asiento repite la misma cuenta en varias líneas —el asiento
 * 02-012026 trae 6.03.41 dos veces, una por débito y otra por crédito—, así que
 * `(empresa, asiento, cuenta)` no identifica nada; y (b) una llave de contenido
 * dejaría vivas para siempre las líneas que la contadora corrija o borre.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { loginSwitchWeb, fetchMayorAsientos, cerrarSesionWeb } from "./web-client";
import { createSwitchSyncLog, finishSwitchSyncLog } from "./sync-log";
import { parsearMayorCsv, type MayorLinea } from "@/lib/mayor/parser";
import { esGasto } from "@/lib/mayor/gastos";
import { ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";

/** Las 8 empresas del grupo. El mayor es de todas. */
export const MAYOR_EMPRESA_KEYS = [...ALL_EMPRESA_KEYS] as string[];

/**
 * Tope de sanidad. El mayor de un año de una empresa grande no debería pasar de
 * unas decenas de miles de líneas; muy por encima es señal de que se pidió otra
 * cosa. Se corta con error en vez de escribir algo que nadie midió.
 */
const MAX_LINEAS = 200_000;

export interface ResultadoEmpresa {
  empresaKey: string;
  ok: boolean;
  /** Meses efectivamente reemplazados. */
  meses: string[];
  lineasTotal: number;
  lineasGasto: number;
  /** Ruta del reporte que respondió (para poder fijarla después). */
  rutaUsada?: string;
  error?: string;
  /** Líneas del CSV que no se pudieron leer (se reportan, no se descartan). */
  erroresParseo?: number;
}

/** El rango que se le pide a Switch: el año entero. */
export function rangoDelAnio(anio: number): { desde: string; hasta: string } {
  return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
}

/** Los 12 meses `YYYY-MM` de un año. */
function mesesDelAnio(anio: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * Sincroniza UNA empresa. Abre su sesión, baja el año, escribe y cierra.
 * Nunca lanza: devuelve el resultado para que una empresa mala no tumbe al resto.
 */
export async function syncEmpresaMayor(
  empresaKey: string,
  anio: number,
): Promise<ResultadoEmpresa> {
  const { desde, hasta } = rangoDelAnio(anio);
  const logId = await createSwitchSyncLog({
    empresaKey,
    syncType: "mayor",
    rangeFrom: desde,
    rangeTo: hasta,
  });
  let session: Awaited<ReturnType<typeof loginSwitchWeb>> | null = null;

  try {
    session = await loginSwitchWeb(empresaKey);
    const { csv, rutaUsada } = await fetchMayorAsientos(session, desde, hasta);

    const parsed = parsearMayorCsv(csv);
    if (parsed.lineas.length === 0 && parsed.errores.length > 0) {
      throw new Error(`el archivo no se pudo leer: ${parsed.errores[0].motivo}`);
    }
    if (parsed.lineas.length > MAX_LINEAS) {
      throw new Error(
        `el reporte trajo ${parsed.lineas.length} líneas (tope ${MAX_LINEAS}); no se escribió nada`,
      );
    }

    // ── Guard del CERO SILENCIOSO ──
    // Si el reporte vuelve vacío PERO ya teníamos líneas de ese año, algo salió
    // mal en el camino (sesión, filtro, ruta) y borrar el mes sería destruir el
    // último dato bueno. Cero es legítimo solo si tampoco había nada antes.
    if (parsed.lineas.length === 0) {
      const { count, error } = await supabaseServer
        .from("mayor_lineas")
        .select("id", { count: "exact", head: true })
        .eq("empresa_key", empresaKey)
        .gte("mes", `${anio}-01-01`)
        .lte("mes", `${anio}-12-01`);
      if (!error && (count ?? 0) > 0) {
        throw new Error(
          `el reporte vino vacío pero ya había ${count} líneas cargadas de ${anio}; no se tocó nada`,
        );
      }
    }

    const lineasGasto = parsed.lineas.filter((l) => esGasto(l.cuenta)).length;

    // Registrar la importación ANTES de escribir: es lo que deja constancia de
    // QUÉ RANGO se pidió, y de eso depende poder decir "sin cerrar".
    const { data: imp, error: impErr } = await supabaseServer
      .from("mayor_importaciones")
      .insert({
        empresa_key: empresaKey,
        rango_desde: desde,
        rango_hasta: hasta,
        origen: "cron",
        lineas_total: parsed.lineas.length,
        lineas_gasto: lineasGasto,
        creado_por: "cron:sync-mayor",
      })
      .select("id")
      .single();
    if (impErr) throw new Error(`no se pudo registrar la importación: ${impErr.message}`);

    // ── Reemplazo mes a mes, atómico ──
    // Se recorren los 12 meses, no solo los que traen líneas: un mes que quedó
    // vacío en Switch (porque la contadora lo deshizo) tiene que quedar vacío
    // acá también. Saltearlo dejaría datos viejos haciéndose pasar por buenos.
    const porMes = new Map<string, MayorLinea[]>();
    for (const l of parsed.lineas) {
      porMes.set(l.mes, [...(porMes.get(l.mes) ?? []), l]);
    }

    const mesesEscritos: string[] = [];
    for (const mes of mesesDelAnio(anio)) {
      const lineas = porMes.get(mes) ?? [];
      const { error: rpcErr } = await supabaseServer.rpc("mayor_reemplazar_mes", {
        p_empresa_key: empresaKey,
        p_mes: `${mes}-01`,
        p_importacion_id: imp.id,
        p_lineas: lineas.map((l) => ({
          fecha: l.fecha,
          asiento: l.asiento,
          descripcion: l.descripcion,
          cuenta: l.cuenta,
          cuenta_nombre: l.cuentaNombre,
          // A dólares con 2 decimales exactos, desde los centavos enteros.
          debito: (l.debitoCent / 100).toFixed(2),
          credito: (l.creditoCent / 100).toFixed(2),
          linea_nro: l.linea,
        })),
      });
      if (rpcErr) throw new Error(`mes ${mes}: ${rpcErr.message}`);
      if (lineas.length > 0) mesesEscritos.push(mes);
    }

    await finishSwitchSyncLog(logId, "success", {
      inserted: parsed.lineas.length,
      skipped: parsed.errores.length,
    });

    return {
      empresaKey,
      ok: true,
      meses: mesesEscritos,
      lineasTotal: parsed.lineas.length,
      lineasGasto,
      rutaUsada,
      erroresParseo: parsed.errores.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishSwitchSyncLog(logId, "error", { errorMessage: msg });
    return { empresaKey, ok: false, meses: [], lineasTotal: 0, lineasGasto: 0, error: msg };
  } finally {
    // Siempre: dejar la sesión abierta alarga el despojo a Daniel.
    if (session) await cerrarSesionWeb(session);
  }
}

/**
 * Sincroniza todas las empresas, UNA DETRÁS DE OTRA.
 * Nada de `Promise.all`: serían N sesiones simultáneas contra Switch.
 */
export async function syncAllMayor(
  empresas: string[] = MAYOR_EMPRESA_KEYS,
  anio: number = Number(hoyPanama().slice(0, 4)),
): Promise<ResultadoEmpresa[]> {
  const out: ResultadoEmpresa[] = [];
  for (const empresaKey of empresas) {
    out.push(await syncEmpresaMayor(empresaKey, anio));
  }
  return out;
}
