/**
 * Sincronización AUTOMÁTICA de EGRESOS VARIOS de Switch (Caja y Bancos →
 * Reportes → Egresos Varios).
 *
 * ── 🩸 POR QUÉ EXISTE ───────────────────────────────────────────────────────
 *
 * El módulo Gastos se alimentaba SOLO del mayor contable, que únicamente tiene
 * lo que la contadora ya cerró — y va 7 meses atrasada. Medido el 13-ago-2026
 * pidiendo el AÑO 2026 COMPLETO a las 8 empresas: **135 renglones en total, casi
 * todos de enero** (vistana 44 · fashion_wear 33 · fashion_shoes 22 ·
 * american_classic 21 · active_wear 11 · active_shoes 2 · confecciones_boston 2 ·
 * joystep 0). El módulo estaba prácticamente vacío y no era culpa del código.
 *
 * Egresos Varios es el registro de lo que SALE de caja y banco, y ese SÍ se
 * lleva al día. Sobre el mismo rango y la misma empresa (Vistana):
 *
 *              MAYOR            EGRESOS VARIOS
 *   renglones   44               378
 *   meses       solo enero       los 7
 *   monto       —                $243.342,48
 *
 * ── 🔴 LAS DOS FUENTES CONVIVEN Y NO SE SUMAN ───────────────────────────────
 *
 * El mayor NO se apaga: enero está cerrado ahí y hay que poder comparar las dos
 * antes de decidir nada. Pero tampoco se suman — ver el encabezado de
 * `src/lib/egresos/reglas.ts`: son dos formas de medir lo mismo (devengado
 * contra caja), no dos pedazos de un total, y enero-2026 está en las DOS. La
 * pantalla muestra UNA a la vez y dice cuál.
 *
 * ── IDEMPOTENCIA: REEMPLAZO DE MES, igual que el mayor ──────────────────────
 *
 * `egresos_reemplazar_mes` borra e inserta el mes en UNA transacción, y se
 * recorren los 12 meses del año aunque vengan vacíos. Con eso:
 *   · re-leer un mes ACTUALIZA, nunca duplica;
 *   · un egreso ANULADO en Switch desaparece acá también (con una llave de
 *     contenido quedaría vivo para siempre);
 *   · un egreso al que le corrigieron la fecha y cambió de mes no queda
 *     duplicado en los dos, porque los 12 meses se reescriben en la misma
 *     corrida.
 *
 * ── SECUENCIAL, una empresa a la vez, y la sesión se CIERRA al terminar ─────
 *
 * El login web hace `changesession="SI"`, que TOMA la sesión y expulsa a quien
 * esté en el panel de esa empresa — y el usuario configurado es el de Daniel.
 * Dos empresas en paralelo son dos sesiones abiertas a la vez.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { loginSwitchWeb, fetchEgresosVarios, cerrarSesionWeb } from "./web-client";
import { createSwitchSyncLog, finishSwitchSyncLog } from "./sync-log";
import { parsearEgresosCsv, type EgresoLinea } from "@/lib/egresos/parser";
import { duplicadosExactos, claveIdentidad, esGasto } from "@/lib/egresos/reglas";
import { calibrarUmbral, detallesDeRechazo, avisarMontosImposibles } from "./monto-guard-io";
import { detallesDeIlegibles, avisarRenglonesIlegibles } from "./renglones-ilegibles";
import { particionarFilas } from "./monto-guard";
import { ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { empresasConEgresosEnCron } from "./empresas";
import { hoyPanama } from "@/lib/fecha-panama";
import { esTablaAusente } from "@/lib/contable/tabla-ausente";
import { syncCuentasContables, type ResultadoCuentas } from "./sync-cuentas-contables";

/**
 * Las MISMAS 8 empresas del mayor. Es el universo que el módulo MUESTRA y el que
 * el sync manual ACEPTA — no el que corre solo.
 *
 * El pedido hablaba de 7 (las 6 de Fashion Group + american_classic), pero el
 * módulo Gastos muestra 8 desde que existe —`confecciones_boston` incluida, con
 * su propio aviso de alquiler escrito a mano en `mayor/gastos.ts`— y el mayor la
 * sincroniza. Dejarla afuera de la fuente nueva haría imposible justo lo que
 * este cambio viene a permitir: comparar las dos fuentes empresa por empresa.
 * Boston va aparte en CXC, no en gastos.
 *
 * ⚠️ **Boston SÍ está acá y NO está en el CRON.** Daniel, 13-ago-2026: *"ve
 * avanzando con todas menos boston, ese usuario es mio y no entrare"*. La
 * descarga automática la acota `EMPRESAS_EGRESOS_FUERA_DE_CRON` (ver
 * `empresas.ts`); esta lista se queda en 8 para que la pestaña siga existiendo y
 * para que el sync manual la siga aceptando.
 */
export const EGRESOS_EMPRESA_KEYS = [...ALL_EMPRESA_KEYS] as string[];

/** Las que el CRON baja solo: las 7 que no son Boston. */
export const EGRESOS_EMPRESA_KEYS_CRON = empresasConEgresosEnCron() as string[];

/** Tope de sanidad. Vistana hace ~380 renglones al año; 200.000 es absurdo. */
const MAX_LINEAS = 200_000;

/**
 * Guard del BARRIDO CORTO. Si el reporte trae menos del 70% de lo que la tabla
 * ya sabe de ese año, no se escribe NADA y la corrida queda `error`.
 *
 * 🩸 Sin esto, una descarga truncada a mitad de camino (el acumulador que corta
 * antes de tiempo, un `/log/` a medias) borraría los meses que faltan en el
 * archivo y se anotaría `success`. El 70% es holgado a propósito: los egresos de
 * un año pasado no bajan, y en el año en curso solo pueden bajar por
 * anulaciones — perder un tercio de un año por anulaciones no es un cambio de
 * negocio plausible. Es el mismo guard de `sync-articulo-marca`.
 */
export const UMBRAL_BARRIDO_CORTO = 0.7;

export interface ResultadoEgresosEmpresa {
  empresaKey: string;
  ok: boolean;
  /** Meses efectivamente reemplazados (los que traen renglones). */
  meses: string[];
  renglones: number;
  /** De esos, los que son GASTO (grupo 6). */
  renglonesGasto: number;
  totalCent: number;
  totalGastoCent: number;
  rutaUsada?: string;
  error?: string;
  /** Renglones del CSV que no se pudieron leer (se reportan, no se descartan). */
  erroresParseo?: number;
  /** Renglones con la MISMA identidad exacta. Debería ser 0 siempre. */
  duplicados?: number;
  /** Renglones rechazados por el guard de montos imposibles. */
  montosImposibles?: number;
  /** Qué pasó con el catálogo de cuentas, que viaja en la MISMA sesión.
   *  Nunca cambia `ok`: los nombres son cómo se lee la plata, no la plata. */
  cuentas?: ResultadoCuentas;
}

/** El rango que se le pide a Switch: el año entero. */
export function rangoDelAnio(anio: number): { desde: string; hasta: string } {
  return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
}

/** Los 12 meses `YYYY-MM` de un año. */
function mesesDelAnio(anio: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`);
}

/** Cuántos renglones tiene YA la tabla para ese año y empresa. */
async function renglonesGuardados(empresaKey: string, anio: number): Promise<number> {
  const { count, error } = await supabaseServer
    .from("egresos_varios")
    .select("id", { count: "exact", head: true })
    .eq("empresa_key", empresaKey)
    .gte("mes", `${anio}-01-01`)
    .lte("mes", `${anio}-12-01`);
  // No poder contar NO puede convertirse en un fallo inventado: se deja pasar y
  // queda el rastro. El guard no debe reventar por un problema de lectura suyo.
  if (error) {
    console.error(`[sync-egresos ${empresaKey}] renglonesGuardados: ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

/**
 * Sincroniza UNA empresa. Abre su sesión, baja el año, escribe y cierra.
 * Nunca lanza: devuelve el resultado para que una empresa mala no tumbe al resto.
 */
export async function syncEmpresaEgresos(
  empresaKey: string,
  anio: number,
  rango?: { desde: string; hasta: string },
): Promise<ResultadoEgresosEmpresa> {
  const { desde, hasta } = rango ?? rangoDelAnio(anio);
  const logId = await createSwitchSyncLog({
    empresaKey,
    syncType: "egresos_varios",
    rangeFrom: desde,
    rangeTo: hasta,
  });
  let session: Awaited<ReturnType<typeof loginSwitchWeb>> | null = null;

  const vacio = {
    empresaKey,
    meses: [] as string[],
    renglones: 0,
    renglonesGasto: 0,
    totalCent: 0,
    totalGastoCent: 0,
  };

  // El catálogo de cuentas viaja en ESTA MISMA sesión (ver
  // `sync-cuentas-contables.ts`): es un GET y cero logins extra. Va acá arriba,
  // apenas hay sesión, para que los nombres se refresquen también los días en
  // que los egresos fallan — y NUNCA lanza, así que no puede tocar la plata.
  let cuentas: ResultadoCuentas | undefined;

  try {
    session = await loginSwitchWeb(empresaKey);
    cuentas = await syncCuentasContables(session);
    const { csv, rutaUsada } = await fetchEgresosVarios(session, desde, hasta);

    const parsed = parsearEgresosCsv(csv);
    if (parsed.lineas.length === 0 && parsed.errores.length > 0) {
      throw new Error(`el archivo no se pudo leer: ${parsed.errores[0].motivo}`);
    }
    if (parsed.lineas.length > MAX_LINEAS) {
      throw new Error(
        `el reporte trajo ${parsed.lineas.length} renglones (tope ${MAX_LINEAS}); no se escribió nada`,
      );
    }

    const yaGuardados = await renglonesGuardados(empresaKey, anio);

    // ── Guard del CERO SILENCIOSO ──
    // Un reporte vacío es LEGÍTIMO cuando la empresa no movió caja (joystep tuvo
    // 0 líneas de mayor en todo 2026). Deja de serlo cuando ya teníamos
    // renglones de ese año: ahí el cero es nuestro, no del negocio, y borrar el
    // año sería destruir el último dato bueno anotándose `success`.
    if (parsed.lineas.length === 0 && yaGuardados > 0) {
      throw new Error(
        `el reporte vino vacío pero ya había ${yaGuardados} egresos cargados de ${anio}; no se tocó nada`,
      );
    }

    // ── Guard del BARRIDO CORTO ──
    if (yaGuardados > 0 && parsed.lineas.length < yaGuardados * UMBRAL_BARRIDO_CORTO) {
      throw new Error(
        `el reporte trajo ${parsed.lineas.length} renglones contra ${yaGuardados} ya cargados de ${anio} ` +
          `(menos del ${Math.round(UMBRAL_BARRIDO_CORTO * 100)}%); parece una descarga a medias, no se escribió nada`,
      );
    }

    // ── Guard de MONTOS IMPOSIBLES ──
    // Se aplica ANTES de escribir. Una fila mala no tumba el sync: las buenas
    // entran igual. Acá no hay valor anterior que conservar (es reemplazo de
    // mes), así que la fila rechazada simplemente no entra.
    const umbral = await calibrarUmbral("egreso_vario", empresaKey);
    const { buenas, rechazadas } = particionarFilas(
      "egreso_vario",
      parsed.lineas.map((l) => ({ ...l, total: l.totalCent / 100 })),
      umbral,
      (l) => l.nInterno,
    );
    const lineas: EgresoLinea[] = buenas;

    // ── Anti-duplicado, verificado contra el dato real ──
    // No se descarta nada: se REPORTA. En los 378 renglones de Vistana no hay
    // ni uno, así que si aparece hay que mirarlo, no taparlo (un egreso repartido
    // en dos cuentas es legítimo y colapsarlo perdería plata — ver `reglas.ts`).
    const duplicados = duplicadosExactos(lineas);

    const totalCent = lineas.reduce((a, l) => a + l.totalCent, 0);
    const deGasto = lineas.filter((l) => esGasto(l.cuenta));
    const totalGastoCent = deGasto.reduce((a, l) => a + l.totalCent, 0);

    // Registrar la importación ANTES de escribir: es lo que deja constancia de
    // QUÉ RANGO se pidió, y de eso depende poder decir "sin movimientos" en vez
    // de "no sabemos nada".
    const { data: imp, error: impErr } = await supabaseServer
      .from("egresos_importaciones")
      .insert({
        empresa_key: empresaKey,
        rango_desde: desde,
        rango_hasta: hasta,
        origen: "cron",
        renglones_total: lineas.length,
        renglones_gasto: deGasto.length,
        creado_por: "cron:sync-egresos-varios",
      })
      .select("id")
      .single();
    if (impErr) throw new Error(`no se pudo registrar la importación: ${impErr.message}`);

    // ── Reemplazo mes a mes, atómico ──
    // Se recorren los 12 meses, no solo los que traen renglones: un mes que
    // quedó vacío en Switch (todo anulado) tiene que quedar vacío acá también.
    const porMes = new Map<string, EgresoLinea[]>();
    for (const l of lineas) {
      porMes.set(l.mes, [...(porMes.get(l.mes) ?? []), l]);
    }

    const mesesEscritos: string[] = [];
    for (const mes of mesesDelAnio(anio)) {
      const delMes = porMes.get(mes) ?? [];
      const { error: rpcErr } = await supabaseServer.rpc("egresos_reemplazar_mes", {
        p_empresa_key: empresaKey,
        p_mes: `${mes}-01`,
        p_importacion_id: imp.id,
        p_lineas: delMes.map((l) => ({
          fecha: l.fecha,
          n_interno: l.nInterno,
          cuenta: l.cuenta,
          sucursal: l.sucursal,
          proveedor: l.proveedor,
          referencia: l.referencia,
          // A dólares con 2 decimales exactos, desde los centavos enteros.
          total: (l.totalCent / 100).toFixed(2),
          linea_nro: l.linea,
        })),
      });
      if (rpcErr) throw new Error(`mes ${mes}: ${rpcErr.message}`);
      if (delMes.length > 0) mesesEscritos.push(mes);
    }

    // ── LO QUE NO ENTRÓ QUEDA ESCRITO, LAS DOS CLASES ──
    //
    // 🩸 `records_skipped` YA CONTABA LOS ERRORES DE PARSEO, PERO SIN DETALLE.
    // Hasta el 2-sep-2026 `erroresParseo` viajaba solo en la respuesta HTTP del
    // cron —que nadie lee— y `skipDetails` llevaba únicamente los montos
    // imposibles. O sea: si Switch hubiera cambiado el formato en 3 renglones
    // de 378 en vez de en los 378, esos tres gastos se caían EN SILENCIO y la
    // corrida se anotaba `success`. Nos salvó que el cambio fue del 100% y el
    // sync se cortó entero. Ahora el descarte se escribe con su documento y su
    // motivo, y de ahí lo leen la pantalla y el aviso.
    const skipDetails = [
      ...(rechazadas.length > 0 ? detallesDeRechazo("egreso_vario", rechazadas, umbral) : []),
      ...detallesDeIlegibles(parsed.errores),
    ];

    await finishSwitchSyncLog(logId, "success", {
      inserted: lineas.length,
      skipped: parsed.errores.length + rechazadas.length,
      skipDetails: skipDetails.length > 0 ? skipDetails : undefined,
    });

    // Los avisos nunca pueden tumbar una corrida que ya escribió bien.
    if (rechazadas.length > 0) {
      try {
        await avisarMontosImposibles({
          familia: "egreso_vario",
          empresaKey,
          syncType: "egresos_varios",
          rechazadas,
          umbral,
          logId,
        });
      } catch (e) {
        console.error(`[sync-egresos ${empresaKey}] aviso de montos: ${String(e)}`);
      }
    }

    if (parsed.errores.length > 0) {
      try {
        await avisarRenglonesIlegibles({
          empresaKey,
          syncType: "egresos_varios",
          que: "lo que salió de caja y del banco",
          donde: "Gastos",
          ilegibles: parsed.errores,
          entraron: lineas.length,
          logId,
        });
      } catch (e) {
        console.error(`[sync-egresos ${empresaKey}] aviso de renglones ilegibles: ${String(e)}`);
      }
    }

    return {
      ...vacio,
      ok: true,
      meses: mesesEscritos,
      renglones: lineas.length,
      renglonesGasto: deGasto.length,
      totalCent,
      totalGastoCent,
      rutaUsada,
      erroresParseo: parsed.errores.length,
      duplicados: duplicados.length,
      montosImposibles: rechazadas.length,
      cuentas,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishSwitchSyncLog(logId, "error", { errorMessage: msg });
    return { ...vacio, ok: false, error: msg, cuentas };
  } finally {
    // Siempre: dejar la sesión abierta alarga el despojo a Daniel.
    if (session) await cerrarSesionWeb(session);
  }
}

/**
 * Sincroniza todas las empresas, UNA DETRÁS DE OTRA.
 * Nada de `Promise.all`: serían N sesiones simultáneas contra Switch.
 */
export async function syncAllEgresos(
  empresas: string[] = EGRESOS_EMPRESA_KEYS,
  anio: number = Number(hoyPanama().slice(0, 4)),
  rango?: { desde: string; hasta: string },
): Promise<ResultadoEgresosEmpresa[]> {
  const out: ResultadoEgresosEmpresa[] = [];
  for (const empresaKey of empresas) {
    out.push(await syncEmpresaEgresos(empresaKey, anio, rango));
  }
  return out;
}

/**
 * ¿Ya corrió la DDL de egresos varios?
 *
 * 🔴 SE PREGUNTA ANTES DE TOCAR SWITCH. La migración la corre Daniel A MANO, y
 * hasta entonces este sync no tiene dónde escribir. Sin este chequeo, el cron
 * abriría 8 sesiones web —expulsando a quien esté en el panel— para tirar todo a
 * la basura y anotarse 8 errores por día. Mismo patrón que `calvin-catalogo`:
 * mientras la DDL no corra, el cron se omite LIMPIO.
 */
export async function egresosInstalado(): Promise<boolean> {
  const { error } = await supabaseServer.from("egresos_varios").select("id").limit(1);
  if (!error) return true;
  if (esTablaAusente(error)) return false;
  // Un error que NO es "la tabla no existe" (timeout, permisos) no puede leerse
  // como "todavía no está instalado": eso apagaría el cron en silencio.
  throw new Error(error.message);
}
