// ─────────────────────────────────────────────────────────────────────────────
// UNA VUELTA del agente: preguntar, traer, mandar.
//
// Separado del `agente.mjs` (el que hace el bucle infinito) para que se pueda
// testear entero sin reloj, sin red y sin esperar tres minutos. Todo lo que
// habla con el mundo entra por `deps`.
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Da una vuelta completa. NUNCA lanza: cualquier problema se reporta al puente
 * (que lleva el contador de fallas) y se devuelve el resultado. Un `throw` acá
 * mataría el bucle y la PC quedaría "prendida pero muda", que es el peor de los
 * estados posibles porque no se distingue de "todo bien".
 */
export async function darVuelta({ config, deps, log = () => {} }) {
  const { leerEstado, traerEventos, mandarEventos, reportarError, ahora = Date.now } = deps;
  const ahoraMs = ahora();

  // ── 1. ¿Hay un "Traer ahora" esperando? ────────────────────────────────────
  // Se lee ANTES de trabajar y se guarda el instante: al terminar se manda ese
  // mismo valor para cerrarlo. Si alguien aprieta el botón mientras el agente
  // trabaja, el `pedido_en` de la base ya será más nuevo y NO se cerrará —
  // queda para la vuelta siguiente, como corresponde.
  let pedidoEn = null;
  try {
    const estado = await leerEstado({
      base: config.base,
      secret: config.secret,
      dispositivo: config.dispositivo,
    });
    if (estado?.pedidoPendiente) {
      pedidoEn = estado.pedidoEn;
      log("Hay un 'Traer ahora' esperando.");
    }
  } catch (e) {
    // El puente no contesta (internet caído, deploy en curso). No se puede ni
    // reportar el error —el reporte va por el mismo puente—, así que solo se
    // anota y se reintenta en la vuelta siguiente. El reloj guarda todo.
    log(`No se pudo consultar fashiongr: ${e.message}. Se reintenta en la próxima vuelta.`);
    return { ok: false, motivo: "puente-inalcanzable" };
  }

  // ── 2. Preguntarle al reloj ────────────────────────────────────────────────
  const { desde, hasta } = ventanaRodante({
    ahoraMs,
    dias: config.ventanaDias,
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
  } catch (e) {
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
