// ═══════════════════════════════════════════════════════════════════════════
//   🩸 HAY TAREAS CUYO PRODUCTO ES EL MENSAJE. SI DEJAN DE CORRER, EL FALLO
//   ES EL SILENCIO MISMO — y no queda ni un dato viejo que alguien pueda
//   mirar después para darse cuenta.
// ═══════════════════════════════════════════════════════════════════════════
//
// ── POR QUÉ VUELVE A EXISTIR ESTE VIGÍA (7-sep-2026) ────────────────────────
// El 30-jul-2026 se apagó el aviso de «un cron lleva más de un día sin
// completarse» (`checkStaleCrons` sigue calculando, pero ya no manda Telegram) y
// se apagó BIEN: medía el MECANISMO y no el resultado, así que sonaba por syncs
// cuyo trabajo igual se había hecho. Lo reemplazó la regla 1 —«un dato que miras
// está viejo»— que pregunta por el RESULTADO.
//
// Pero esa mudanza dejó afuera a un puñado de tareas para las que la pregunta
// «¿el dato está viejo?» no se puede hacer, porque **no producen un dato: producen
// un mensaje**. Si `cheques-alert` deja de correr, el aviso de las 9 de la mañana
// simplemente no llega, no hay ninguna pantalla que quede desactualizada y nada
// —absolutamente nada— lo dice. Para ellas la única pregunta posible es la de
// siempre: **¿corrió?**
//
// 🔴 NO ES UNA REGLA NUEVA. La lista de alertas de 🔧 SISTEMA es cerrada (3 + 1)
// y no se amplía. Esto es la **regla 1** («un dato que miras está viejo»)
// aplicada a lo único que estas tareas producen. `datos-frescos.ts` mira la
// frescura de la cartera y de las ventas; acá se mira la frescura del AVISO.
//
// ── 🔴 LOS SYNCS DE SWITCH NO VUELVEN ────────────────────────────────────────
// Son exactamente los que provocaron que esto se apagara, y hoy tienen quien los
// mire por el resultado: la regla 2 (dos —o tres— fallos seguidos del par), la
// alerta A (trajo cero donde siempre trae cientos) y la alerta B (una tabla dejó
// de recibir escrituras). El candado estructural lo exige: **ningún cron de esta
// lista puede escribir en `switch_sync_log`**, y eso se comprueba contra
// `SYNC_TYPES_POR_CRON`, que es el registro del cronograma. Un cron de sync no
// puede entrar acá ni por descuido.
//
// ── QUIÉNES ENTRAN, Y POR QUÉ CADA UNO ──────────────────────────────────────
// Dos familias, y el motivo de las dos es el mismo: **su caída no deja rastro en
// ningún dato que otra regla mire**.
//
//   1. Los CINCO cuyo producto ES el mensaje. No hay dato que envejecer.
//   2. `acs-fidelizacion`, que sí mueve datos pero **no registra su corrida**:
//      medido contra producción el 7-sep-2026, en 90 días no hay una sola fila
//      suya en `switch_sync_log`, y la tabla que escribe no está entre las que
//      vigila la alerta B. O sea que ni la regla 2 ni A ni B pueden verlo: hoy
//      no lo mira nadie.
//
// ── EL UMBRAL NO SE INVENTA: ES EL QUE YA EXISTE ────────────────────────────
// Cada cron ya tiene su umbral de «lleva demasiado sin un éxito» en
// `cronStaleThresholdHours` — 26 h por defecto y **33 días** para el resumen
// mensual, que corre el día 1. Se reusa tal cual; inventar un segundo umbral
// sería garantizar que algún día digan cosas distintas. También se reusa
// `staleEsPendingRecovery`, que calla al cron cuya segunda entrada del día
// todavía viene en camino (`acs-fidelizacion` a las 16:30).
// ═══════════════════════════════════════════════════════════════════════════

import { cronIsStale, staleEsPendingRecovery, type HeartbeatRow } from "@/lib/cron-telemetry";

/**
 * 🔴 LA LISTA, EN UN SOLO LUGAR: el cron y QUÉ deja de pasar si no corre, dicho
 * como lo diría Daniel. Ese texto es el que va al celular — no hay una segunda
 * copia de la lista en ninguna parte, ni de los nombres ni de las frases.
 */
export const CRONS_CUYO_TRABAJO_ES_UN_MENSAJE: Readonly<Record<string, string>> = {
  // 14:00 UTC = 9:00 a.m. de Panamá. Cheques por vencer, cheques vencidos y los
  // recordatorios del día. Es EL mensaje diario del módulo Recordatorios.
  "cheques-alert": "el aviso de las 9 de la mañana con los cheques y los recordatorios",
  // 14:30 UTC. Las guías que quedaron sin despachar.
  "guias-pendientes": "el aviso de guías que quedaron sin despachar",
  // 01:00 UTC = 8:00 p.m. de Panamá, después de que la tienda cierra.
  "acs-resumen-diario": "el resumen de ventas de Multifashion de la noche",
  // Día 1 de cada mes, 13:00 UTC.
  "grupo-resumen-mensual": "el resumen del mes de las 8 empresas",
  // ⚠️ `prestamos-caducan` estuvo acá hasta el 11-sep-2026 (los préstamos que
  // llevaban 7 días esperando). Se retiró con la aprobación de préstamos
  // (Daniel: «Aprobar préstamos: eso también se quita»): ya no hay cron.
  // 🔑 Éste NO manda ningún mensaje: baja el directorio de clientes de
  // Multifashion y el descuento de fidelización. Entra por el otro motivo — no
  // deja fila en `switch_sync_log`, así que ninguna otra regla puede verlo.
  "acs-fidelizacion":
    "la actualización de los teléfonos y correos de los clientes de Multifashion",
};

/**
 * Días entre dos avisos del MISMO cron. El mismo número y el mismo motivo que el
 * silencio de datos y el guard de montos imposibles: un cron que dejó de correr
 * sigue sin correr mañana, y repetirlo en cada pasada de la reconciliación —tres
 * veces al día— lo convierte en la alerta que suena para siempre y que nadie lee.
 * El propio mensaje lo dice.
 */
export const DIAS_ENTRE_AVISOS_CRON = 7;

/** `tipo` con el que se registra el aviso en `cron_email_errors`. Lleva el
 *  nombre del cron pegado, igual que `silencio_de_datos:<módulo>`: así el dedup
 *  filtra por `.eq("tipo", …)` y no por un LIKE sobre el texto. */
export const TIPO_CRON_SIN_CORRER = "cron_sin_correr";
export const tipoDeCron = (cronName: string): string => `${TIPO_CRON_SIN_CORRER}:${cronName}`;

/** Un cron de la lista que lleva demasiado sin un éxito. */
export interface CronCaido {
  cronName: string;
  /** Qué deja de pasar, en palabras de negocio. */
  que: string;
  /** Última vez que salió bien. `null` = nunca. */
  ultimaIso: string | null;
  /** Horas enteras desde ese éxito. `null` si nunca corrió. */
  horas: number | null;
}

/**
 * PURO. De las filas de `cron_heartbeats`, los crons de la lista que están
 * caídos.
 *
 * Se calla en dos casos, y los dos son prestados de la maquinaria que ya existe:
 *   · el cron no llegó a su umbral (`cronIsStale`, con el override del mensual);
 *   · su segunda entrada del día todavía viene en camino
 *     (`staleEsPendingRecovery`), que es lo que evita la alerta fantasma.
 *
 * 🔴 Un cron de la lista SIN fila en `cron_heartbeats` cuenta como CAÍDO
 * (`cronIsStale` devuelve `true` con la fecha ausente). Es fail-closed a
 * propósito: los seis llevan meses corriendo, así que la fila que falta no es
 * una siembra pendiente — es que no corrió nunca.
 */
export function cronsQueAvisanCaidos(
  filas: readonly HeartbeatRow[],
  ahoraMs: number = Date.now(),
): CronCaido[] {
  const porNombre = new Map(filas.map((f) => [f.cron_name, f.last_success_at]));
  const out: CronCaido[] = [];
  for (const [cronName, que] of Object.entries(CRONS_CUYO_TRABAJO_ES_UN_MENSAJE)) {
    const ultimaIso = porNombre.get(cronName) ?? null;
    if (!cronIsStale(cronName, ultimaIso, ahoraMs)) continue;
    if (staleEsPendingRecovery(cronName, ultimaIso, ahoraMs)) continue;
    const t = ultimaIso ? new Date(ultimaIso).getTime() : NaN;
    out.push({
      cronName,
      que,
      ultimaIso,
      horas: Number.isFinite(t) ? Math.floor((ahoraMs - t) / 3_600_000) : null,
    });
  }
  return out;
}

/** "5 sep 2026, 09:00" en hora de Panamá. */
function fmtPanama(iso: string): string {
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * El mensaje que va al celular. PURO, para poder revisar cómo se lee un aviso
 * que ojalá casi nunca salga.
 *
 * Qué pasó / qué significa / qué hacer, sin nombres de tabla, sin nombres de
 * cron y sin códigos: lo único que hace falta para actuar es qué aviso dejó de
 * llegar, desde cuándo y a quién avisarle.
 */
export function mensajeCronsSinCorrer(caidos: readonly CronCaido[]): string {
  const lineas: string[] = [];
  lineas.push(
    caidos.length === 1
      ? "Una tarea automática dejó de correr."
      : `${caidos.length} tareas automáticas dejaron de correr.`,
  );
  lineas.push("");
  for (const c of caidos) {
    lineas.push(
      c.ultimaIso === null || c.horas === null
        ? `• ${c.que}: no hay registro de que haya salido nunca.`
        : `• ${c.que}: lo último salió el ${fmtPanama(c.ultimaIso)}, hace ${c.horas} horas.`,
    );
  }
  lineas.push("");
  lineas.push(
    "Qué significa: esos avisos no te van a llegar, y no hay ninguna pantalla que lo diga. " +
      "Lo que se dejó de avisar sigue pasando igual — lo único que falta es el mensaje.",
  );
  lineas.push("Qué hacer: avísame para revisarlo.");
  lineas.push("Mientras siga así, este aviso se repite una vez por semana, no todos los días.");
  return lineas.join("\n");
}
