// ─────────────────────────────────────────────────────────────────────────────
// CUÁNDO NO HAY QUE VOLVER A PREGUNTARLE AL RELOJ.
//
// 🩸 EL POZO SIN FONDO, VISTO EN VIVO EL 7-AGO-2026.
//
// El reloj Hikvision bloquea la cuenta cuando acumula intentos de login
// fallidos (`retryLoginTime`), y mientras está bloqueado **rechaza también la
// contraseña correcta**. El agente daba una vuelta cada 3 minutos y cada vuelta
// volvía a intentar: el castigo se renovaba solo, para siempre. Medido en la PC
// de la oficina — 16:43, 16:46, 16:49, 16:52, y así hasta que alguien lo paró a
// mano. El reloj NO se iba a destrabar nunca por su cuenta.
//
// Lo peor del caso es cómo se leía: "Usuario o contraseña del reloj
// incorrectos". La contraseña estaba perfecta. Se revisó el archivo, se
// reescribió a mano, se cambió la llave — y el problema era que el propio
// agente mantenía el castigo vivo.
//
// La regla, entonces: **ante un rechazo de credenciales se ESPERA, no se
// insiste.** Y se espera más que el castigo del aparato, para que la primera
// vuelta después de la espera lo encuentre libre.
//
// Módulo PURO a propósito: sin relojes, sin red, sin estado global. Todo lo que
// necesita entra por parámetro y así se puede probar entero.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cuánto esperar según cuántos rechazos seguidos van.
 *
 * El primer escalón son **45 minutos**: el castigo típico del aparato son 30,
 * y quedarse corto significa gastar el intento justo cuando todavía está
 * castigado — o sea, renovarlo. 45 deja 15 de margen.
 *
 * Sube porque las dos causas se ven igual: si de verdad la contraseña está mal,
 * ninguna espera lo arregla y lo único sensato es dejar de golpear el aparato.
 * El tope son 4 horas: más que eso sería un agente que ya no vuelve.
 */
export const ESCALONES_MIN = [45, 90, 180, 240];

/** Minutos de espera para el N-ésimo rechazo seguido (N empieza en 1). */
export function minutosDeEspera(fallosSeguidos) {
  const n = Math.max(1, Math.floor(Number(fallosSeguidos) || 1));
  return ESCALONES_MIN[Math.min(n, ESCALONES_MIN.length) - 1];
}

/**
 * El estado que el bucle lleva entre vueltas. Se crea UNA vez al arrancar.
 *
 * No se guarda en disco a propósito: si alguien reinicia el agente a mano es
 * porque quiere reintentar ya, y hacerle esperar 45 minutos después de haber
 * arreglado la contraseña sería exactamente el castigo que este módulo evita.
 */
export function nuevoEstadoReloj() {
  return { fallosAuth: 0, esperarHastaMs: 0 };
}

/** ¿Toca preguntarle al reloj en esta vuelta? */
export function puedeConsultarReloj(estado, ahoraMs) {
  return !(estado?.esperarHastaMs > 0) || ahoraMs >= estado.esperarHastaMs;
}

/** Minutos que faltan para poder volver a preguntar (0 si ya se puede). */
export function minutosQueFaltan(estado, ahoraMs) {
  if (puedeConsultarReloj(estado, ahoraMs)) return 0;
  return Math.ceil((estado.esperarHastaMs - ahoraMs) / 60_000);
}

/**
 * El reloj rechazó la contraseña: se anota y se fija hasta cuándo no se
 * vuelve a intentar. Devuelve los minutos de espera, para poder decirlo.
 */
/**
 * ⚠️ EL AVISO NO NECESITA SU PROPIO FRENO, y llegó a tener uno.
 *
 * Se escribió un `debeAvisar()` con una bandera para "avisar una vez por
 * espera". Era peso muerto: durante la espera las vueltas ni siquiera llegan a
 * la rama de credenciales, así que el aviso ya sale como mucho UNA vez cada
 * 45 minutos por construcción. Se quitó — un candado que no puede fallar da
 * confianza falsa, y se detectó porque al romperlo a propósito ningún test se
 * puso rojo.
 */
export function anotarRechazo(estado, ahoraMs) {
  estado.fallosAuth += 1;
  const min = minutosDeEspera(estado.fallosAuth);
  estado.esperarHastaMs = ahoraMs + min * 60_000;
  return min;
}

/**
 * El reloj contestó bien: se borra el castigo entero.
 *
 * ⚠️ Va en el camino del ÉXITO y no en el del error. Si solo se limpiara al
 * fallar, un agente que arranca bien y se rompe después arrastraría para
 * siempre el contador de una racha vieja.
 */
export function anotarExito(estado) {
  estado.fallosAuth = 0;
  estado.esperarHastaMs = 0;
}

/** El texto que se escribe en el log mientras se está esperando. */
export function textoEspera(estado, ahoraMs) {
  const faltan = minutosQueFaltan(estado, ahoraMs);
  return (
    `El reloj rechazó la contraseña. NO se le vuelve a preguntar por ${faltan} minuto(s): ` +
    `insistir mantendría el bloqueo vivo. Las marcaciones no se pierden — el reloj las guarda.`
  );
}
