// ─────────────────────────────────────────────────────────────────────────────
// UNA VUELTA del agente: preguntar, traer, mandar.
//
// Separado del `agente.mjs` (el que hace el bucle infinito) para que se pueda
// testear entero sin reloj, sin red y sin esperar tres minutos. Todo lo que
// habla con el mundo entra por `deps`.
// ─────────────────────────────────────────────────────────────────────────────

import {
  puedeConsultarReloj,
  minutosQueFaltan,
  textoEspera,
  anotarRechazo,
  anotarExito,
} from "./espera.mjs";

/**
 * ⚠️ VENTANA RODANTE, NO "DESDE LA ÚLTIMA VEZ".
 *
 * 🩸 Preguntar solo por lo nuevo desde `leido_hasta` parece más eficiente y es
 * una trampa: las marcaciones VIEJAS se corrigen. Alguien edita un evento en el
 * reloj, se repone un registro, o una vuelta se cae a la mitad y deja un hueco
 * — y con "desde la última vez" ese hueco queda tapado PARA SIEMPRE, porque el
 * punto de lectura ya pasó de largo.
 *
 * Pidiendo siempre los últimos N días, cualquier hueco se rellena solo en la
 * vuelta siguiente. Sale gratis: el índice único `(dispositivo, evento_id)`
 * hace que lo ya guardado se ignore en silencio.
 *
 * `piso` es la fecha antes de la cual no se pregunta nunca (útil para no
 * arrastrar años de historia). `null` = sin piso.
 *
 * Va tipado a mano porque este archivo es JS puro: sin la anotación TypeScript
 * deduce `null` del valor por defecto y rechaza un piso real en los tests.
 *
 * @param {{ ahoraMs: number, dias?: number, piso?: string | null }} args
 */
export function ventanaRodante({ ahoraMs, dias = 3, piso = null }) {
  // Panamá es UTC-5 todo el año (no hay horario de verano), así que restar 5
  // horas da el día local sin necesidad de una librería de zonas horarias.
  const enPanama = (ms) => new Date(ms - 5 * 3_600_000);
  const iso = (d) => d.toISOString().slice(0, 10);

  const hoy = iso(enPanama(ahoraMs));
  let desde = iso(enPanama(ahoraMs - Math.max(0, dias - 1) * 86_400_000));
  if (piso && desde < piso) desde = piso;

  return {
    // El offset va explícito: el reloj interpreta la hora como local, y sin
    // `-05:00` el rango se corre cinco horas y se pierde la primera entrada
    // de la mañana.
    desde: `${desde}T00:00:00-05:00`,
    hasta: `${hoy}T23:59:59-05:00`,
  };
}

/* ── La ventana larga: solo cuando falta algo de verdad ──────────────────── */

/**
 * 🩸 POR QUÉ LA VENTANA LARGA NO PUEDE SER LA VENTANA DE SIEMPRE.
 *
 * Si la PC queda apagada más días que la ventana, esas marcaciones NUNCA se
 * piden y se pierden para siempre. La tentación es subir la ventana de 3 a 15
 * días y listo. No se puede: el firmware devuelve **10 eventos por página pida
 * lo que pida** (medido, ver `POR_PAGINA` en `reloj.mjs`). O sea:
 *
 *   ·  3 días ≈   250 eventos ≈  25 páginas = 25 llamadas por vuelta
 *   · 15 días ≈ 1.250 eventos ≈ 125 páginas = 125 llamadas por vuelta
 *
 * A una vuelta cada 3 minutos (480 por día) eso pasa de ~12.000 a ~60.000
 * llamadas diarias contra el aparato de la entrada, para siempre, cuando el
 * hueco que justifica pedir 15 días pasa dos veces al año.
 *
 * Por eso la ventana normal sigue siendo corta y la larga se pide SOLO cuando
 * se detecta que falta algo. El detector sale gratis: el puente ya devuelve
 * `leido_hasta` en la consulta que abre cada vuelta (ver paso 1 de `darVuelta`),
 * así que no hay ni una llamada extra para saberlo.
 *
 * ⚠️ EL CANDADO DE LAS 6 HORAS NO ES OPCIONAL. `leido_hasta` avanza al último
 * evento TRAÍDO, no al momento actual: si la oficina cierra una semana por
 * fiestas y nadie marca, `leido_hasta` se queda quieto y el hueco no se cierra
 * nunca. Sin candado, el agente pediría 15 días cada 3 minutos justo en el caso
 * en que no hay nada que traer. Con candado, el peor caso son 4 barridos largos
 * por día (~500 llamadas, +4% sobre lo de hoy).
 */
export const RECUPERACION_CADA_HORAS = 6;

/**
 * ¿Esta vuelta pide la ventana normal o la larga?
 *
 * Pura a propósito (no toca `estado`): el que marca el barrido es
 * `anotarRecuperacion`, igual que `puedeConsultarReloj` / `anotarRechazo` en
 * `espera.mjs`. Así el test puede preguntar mil veces sin gastar el candado.
 *
 * El criterio NO es un umbral inventado de días: es exacto. Se compara
 * `leido_hasta` contra el arranque de la ventana normal. Si lo leído termina
 * ANTES de donde empieza a preguntar la ventana de siempre, hay un pedazo de
 * tiempo que nadie va a pedir nunca — ese y solo ese es el caso que merece la
 * ventana larga.
 *
 * @param {{
 *   leidoHasta?: string | null,
 *   ahoraMs: number,
 *   ventanaDias?: number,
 *   ventanaRecuperacionDias?: number,
 *   piso?: string | null,
 *   ultimaRecuperacionMs?: number,
 *   cadaHoras?: number,
 * }} args
 * @returns {{ dias: number, recupera: boolean }}
 */
export function decidirVentana({
  leidoHasta = null,
  ahoraMs,
  ventanaDias = 3,
  ventanaRecuperacionDias = 15,
  piso = null,
  ultimaRecuperacionMs = 0,
  cadaHoras = RECUPERACION_CADA_HORAS,
}) {
  const normal = { dias: ventanaDias, recupera: false };

  // Una "recuperación" más corta que lo de siempre no recupera nada.
  if (!(ventanaRecuperacionDias > ventanaDias)) return normal;

  // Sin `leido_hasta` no hay evidencia de hueco, y hay que asumir que no lo hay.
  //
  // 🩸 Esto NO es pereza. `leido_hasta` se queda en `null` mientras el reloj no
  // haya devuelto ni un evento (el servidor solo lo avanza si llegaron filas).
  // Tratar el `null` como "hueco" haría que un reloj recién puesto, o uno sin
  // marcaciones, barriera 15 días CADA 3 MINUTOS para siempre — el desastre
  // exacto que este archivo evita.
  if (!leidoHasta) return normal;
  const leido = Date.parse(leidoHasta);
  if (!Number.isFinite(leido)) return normal;

  const { desde } = ventanaRodante({ ahoraMs, dias: ventanaDias, piso });
  const arranqueNormal = Date.parse(desde);
  if (!Number.isFinite(arranqueNormal) || leido >= arranqueNormal) return normal;

  // Sí falta un pedazo. Pero de a un barrido largo cada tantas horas.
  if (ultimaRecuperacionMs > 0 && ahoraMs - ultimaRecuperacionMs < cadaHoras * 3_600_000) {
    return normal;
  }

  return { dias: ventanaRecuperacionDias, recupera: true };
}

/** Deja anotado que en esta vuelta ya se hizo el barrido largo. */
export function anotarRecuperacion(estado, ahoraMs) {
  if (estado) estado.ultimaRecuperacionMs = ahoraMs;
}

/**
 * Da una vuelta completa. NUNCA lanza: cualquier problema se reporta al puente
 * (que lleva el contador de fallas) y se devuelve el resultado. Un `throw` acá
 * mataría el bucle y la PC quedaría "prendida pero muda", que es el peor de los
 * estados posibles porque no se distingue de "todo bien".
 *
 * `estado` es la memoria entre vueltas del castigo del reloj (ver `espera.mjs`).
 * Va tipado a mano porque este archivo es JS puro: sin la anotación, TypeScript
 * deduce `null` del valor por defecto y rechaza el objeto real en los tests.
 *
 * @param {{
 *   config: Record<string, any>,
 *   deps: Record<string, any>,
 *   estado?: { fallosAuth: number, esperarHastaMs: number, ultimaRecuperacionMs?: number } | null,
 *   log?: (m: string) => void,
 * }} args
 */
export async function darVuelta({ config, deps, estado = null, log = () => {} }) {
  const { leerEstado, traerEventos, mandarEventos, reportarError, ahora = Date.now } = deps;
  const ahoraMs = ahora();

  // ── 1. ¿Hay un "Traer ahora" esperando? ────────────────────────────────────
  // Se lee ANTES de trabajar y se guarda el instante: al terminar se manda ese
  // mismo valor para cerrarlo. Si alguien aprieta el botón mientras el agente
  // trabaja, el `pedido_en` de la base ya será más nuevo y NO se cerrará —
  // queda para la vuelta siguiente, como corresponde.
  let pedidoEn = null;
  // Se aprovecha la MISMA consulta para saber hasta dónde se leyó. Es lo que
  // decide, más abajo, si esta vuelta tiene que barrer largo (ver
  // `decidirVentana`). Gratis: ya se estaba pidiendo.
  let leidoHasta = null;
  try {
    const remoto = await leerEstado({
      base: config.base,
      secret: config.secret,
      dispositivo: config.dispositivo,
    });
    leidoHasta = remoto?.estado?.leido_hasta ?? null;
    if (remoto?.pedidoPendiente) {
      pedidoEn = remoto.pedidoEn;
      log("Hay un 'Traer ahora' esperando.");
    }
  } catch (e) {
    // El puente no contesta (internet caído, deploy en curso). No se puede ni
    // reportar el error —el reporte va por el mismo puente—, así que solo se
    // anota y se reintenta en la vuelta siguiente. El reloj guarda todo.
    log(`No se pudo consultar fashiongr: ${e.message}. Se reintenta en la próxima vuelta.`);
    return { ok: false, motivo: "puente-inalcanzable", error: e.message };
  }

  // ── 2. Preguntarle al reloj ────────────────────────────────────────────────
  //
  // 🩸 Antes de nada: si el reloj rechazó la contraseña hace poco, NO se le
  // vuelve a preguntar. Insistir cada 3 minutos contra un reloj bloqueado
  // renueva el castigo y no se destraba nunca (ver `espera.mjs`).
  if (estado && !puedeConsultarReloj(estado, ahoraMs)) {
    log(textoEspera(estado, ahoraMs));
    // Se manda igual un lote VACÍO: marca que la PC está viva y con qué versión
    // corre. Sin esto, "esperando al reloj" se vería idéntico a "PC apagada".
    try {
      await mandarEventos({
        base: config.base,
        secret: config.secret,
        dispositivo: config.dispositivo,
        eventos: [],
        agenteVersion: config.version,
        log,
      });
    } catch {
      /* si tampoco hay internet, la vuelta siguiente reintenta */
    }
    return { ok: false, motivo: "esperando-al-reloj", faltanMin: minutosQueFaltan(estado, ahoraMs) };
  }

  // ── 2b. ¿Ventana normal o barrido largo? ───────────────────────────────────
  const { dias, recupera } = decidirVentana({
    leidoHasta,
    ahoraMs,
    ventanaDias: config.ventanaDias,
    ventanaRecuperacionDias: config.ventanaRecuperacionDias,
    piso: config.piso,
    ultimaRecuperacionMs: estado?.ultimaRecuperacionMs ?? 0,
  });
  if (recupera) {
    // Se anota ANTES de pedir. Si el barrido largo falla a la mitad, es
    // preferible esperar 6 horas al siguiente que reintentar 125 páginas cada
    // 3 minutos contra un reloj que ya está teniendo problemas.
    anotarRecuperacion(estado, ahoraMs);
    log(
      `Falta lo anterior a ${leidoHasta}: esta vuelta pregunta por ${dias} días ` +
        `en vez de ${config.ventanaDias}. Puede tardar varios minutos.`,
    );
  }

  const { desde, hasta } = ventanaRodante({
    ahoraMs,
    dias,
    piso: config.piso,
  });

  let eventos = [];
  try {
    const r = await traerEventos({
      host: config.host,
      usuario: config.usuario,
      clave: config.clave,
      desde,
      hasta,
      log,
    });
    eventos = r.eventos;
    if (estado) anotarExito(estado);
  } catch (e) {
    // Un rechazo de credenciales NO es "el reloj no contesta": es el que hay
    // que frenar. Los demás errores (red, timeout) sí se reintentan enseguida,
    // porque no dejan castigo en el aparato.
    if (estado && e?.codigo === "credenciales") {
      const min = anotarRechazo(estado, ahoraMs);
      log(`${e.message} No se le vuelve a preguntar por ${min} minutos.`);
      try {
        await reportarError({
          base: config.base,
          secret: config.secret,
          dispositivo: config.dispositivo,
          error: e.message,
        });
      } catch {
        /* sin internet no hay a quién avisarle */
      }
      return { ok: false, motivo: "reloj-rechazo-clave", error: e.message, esperaMin: min };
    }
    log(`El reloj no respondió: ${e.message}`);
    // Que quede registrado del otro lado: es lo que hace subir el contador y,
    // a la tercera seguida, lo que manda el Telegram.
    try {
      await reportarError({
        base: config.base,
        secret: config.secret,
        dispositivo: config.dispositivo,
        error: e.message,
      });
    } catch {
      /* si tampoco hay internet, ya no queda a quién avisarle */
    }
    return { ok: false, motivo: "reloj-sin-responder", error: e.message };
  }

  // ── 3. Mandarlas ───────────────────────────────────────────────────────────
  try {
    const resumen = await mandarEventos({
      base: config.base,
      secret: config.secret,
      dispositivo: config.dispositivo,
      eventos,
      atendioPedido: pedidoEn,
      agenteVersion: config.version,
      log,
    });
    return { ok: true, ...resumen, desde, hasta, traidos: eventos.length };
  } catch (e) {
    log(`No se pudieron guardar: ${e.message}`);
    // El reloj SÍ respondió; el que falló fue el guardado. Igual se reporta:
    // desde el lado del negocio el síntoma es el mismo (no entra la asistencia)
    // y `leido_hasta` no se movió, así que la vuelta siguiente lo reintenta
    // entero sin perder nada.
    try {
      await reportarError({
        base: config.base,
        secret: config.secret,
        dispositivo: config.dispositivo,
        error: e.message,
      });
    } catch {
      /* sin internet no hay a quién avisarle */
    }
    return { ok: false, motivo: "no-se-pudo-guardar", error: e.message };
  }
}
