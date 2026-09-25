// ─────────────────────────────────────────────────────────────────────────────
// LA PESTAÑA «MARCACIONES» — LO QUE MANDÓ EL TELÉFONO, TAL CUAL (25-sep-2026).
//
// Daniel, después de mirar el mockup: **2a/2b en el celular y 2c en la
// computadora, y sexta pestaña de Asistencia, SOLO para él**.
//
// 🔴 POR QUÉ SOLO `admin`, Y NO «los que ven Asistencia». Cada marca del
// teléfono trae **una foto del lugar y una ubicación**. Eso no es un dato de planilla:
// es dónde estuvo una persona y qué cara tenía. La contadora no necesita verlo
// para pagar, y la secretaria tampoco. Hasta que Daniel diga otra cosa, la
// pestaña es de una sola persona, y el SERVIDOR lo comprueba igual que la
// pantalla — esconder la pestaña no cierra nada.
//
// 🔴 SOLO SE MIRA. Desde acá no se corrige una hora, no se borra una marca y no
// se justifica un día: eso sigue viviendo en Asistencia, con su motivo
// obligatorio y su firma. La marcación del reloj nunca se edita ni se borra, y
// la del teléfono tampoco.
//
// 🔴 SON LAS MARCAS DEL **TELÉFONO**, no las del reloj. Los relojes físicos
// mandan 8.138 de las 8.175 marcas de la base y no traen ni foto ni ubicación:
// dibujarlas acá sería llenar la pantalla de filas con «—» en las tres columnas
// que esta pestaña existe para mostrar. Medido el 25-sep-2026: **37 marcas de
// teléfono en toda la base**, de cinco personas.
//
// ⚠️ Interruptor: en `false` la pestaña no existe ni por la URL, y Asistencia
// vuelve a tener exactamente las pestañas de antes.
// ─────────────────────────────────────────────────────────────────────────────

/** Hoy prendido. `false` = Asistencia sin la pestaña, como el 24-sep-2026. */
export const MARCACIONES_PESTANA = true;

/** La clave de la pestaña en la URL (`?tab=marcaciones`). */
export const CLAVE_MARCACIONES = "marcaciones";

/** El rótulo, en el español de la casa. */
export const ROTULO_MARCACIONES = "Marcaciones";

/**
 * 🔴 QUIÉN ENTRA. Una sola lista, leída por la pantalla **y** por la ruta. Si
 * algún día entra alguien más, se agrega acá y en ningún otro lado.
 */
export const MARCACIONES_ROLES: readonly string[] = ["admin"];

export function vePestanaMarcaciones(rol: string | null | undefined): boolean {
  if (!MARCACIONES_PESTANA) return false;
  return MARCACIONES_ROLES.includes(String(rol ?? ""));
}

/** «Al instante» hasta acá: debajo de esto, la marca llegó sin demora. */
export const MINUTOS_AL_INSTANTE = 2;

/** Lo que dice la columna «Llegó» cuando no hubo demora. */
export const TEXTO_AL_INSTANTE = "al instante";

/**
 * Cuánto tardó una marca en llegar al servidor, en palabras.
 *
 * 🩸 POR QUÉ ESTA COLUMNA EXISTE. Medido el 24-sep-2026: la entrada de Ana
 * Trejos de las 8:59 a.m. llegó al servidor a las 6:01 p.m. — **9 horas
 * después** — porque su teléfono no logra mandarla y la cola solo se vacía
 * mientras la pantalla de marcación está abierta. Sus tres compañeras, en el
 * mismo local y a segundos de distancia, mandan todo al instante. La contadora
 * miraba el reporte incompleto sin ninguna pista de por qué.
 *
 * `ocurrioEn` es cuándo se marcó; `creadoEn`, cuándo entró a la base.
 */
export function demoraEnPalabras(
  ocurrioEn: string | null | undefined,
  creadoEn: string | null | undefined,
): string {
  const cuanto = cuantoDespues(ocurrioEn, creadoEn);
  return cuanto ? `llegó ${cuanto}` : TEXTO_AL_INSTANTE;
}

/**
 * 🔴 EL MISMO NÚMERO, SIN EL VERBO: «9 h después» · «6 min después», o `null`
 * cuando la marca entró al instante.
 *
 * Existe porque la pantalla nueva —agrupada por día, 25-sep-2026— dice **«la
 * entrada se envió 9 h después»**: la palabra «llegó» está prohibida ahí, y la
 * contadora la leería como que la persona llegó tarde a trabajar. A esa hora lo
 * que llegó fue el dato.
 *
 * 🔑 De aquí sale también `demoraEnPalabras`, para que las dos pantallas no
 * puedan decir números distintos: es UNA sola cuenta con dos redacciones.
 */
export function cuantoDespues(
  ocurrioEn: string | null | undefined,
  creadoEn: string | null | undefined,
): string | null {
  const a = Date.parse(String(ocurrioEn ?? ""));
  const b = Date.parse(String(creadoEn ?? ""));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const minutos = Math.round((b - a) / 60_000);
  if (minutos < MINUTOS_AL_INSTANTE) return null;
  if (minutos < 60) return `${minutos} min después`;
  return `${Math.round(minutos / 60)} h después`;
}

/** ¿Esta marca llegó tarde? Lo usa el chip gris de la fila. */
export function llegoTarde(
  ocurrioEn: string | null | undefined,
  creadoEn: string | null | undefined,
): boolean {
  return demoraEnPalabras(ocurrioEn, creadoEn) !== TEXTO_AL_INSTANTE;
}
