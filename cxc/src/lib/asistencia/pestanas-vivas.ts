/* ─────────────────────────────────────────────────────────────────────────────
 * LAS PESTAÑAS DE ASISTENCIA NO SE DESARMAN AL DEJARLAS — el motor, PURO.
 *
 * Sin base, sin red, sin `new Date()`. Decide QUÉ pestaña se monta, cuál se
 * esconde y cómo viajan en la dirección la quincena y el corte de la Planilla.
 *
 * ── 🩸 EL DEFECTO, MEDIDO EL 24-sep-2026 ────────────────────────────────────
 *
 * `AsistenciaClient.tsx` dibujaba la pestaña activa con un `if`
 * (`{tab === "planilla" && <PlanillaTab …>}`), así que la pestaña que se deja
 * **se desarma entera** y lo que no viva en la dirección se pierde:
 *
 *   · De Planilla a Asistencia y de vuelta: se pierden la quincena elegida, el
 *     cuadro generado, «Antes de cerrar», el estado del cierre y **el corte
 *     del reloj vuelve al propuesto (13 / 28)**. Ése es el que cuesta plata:
 *     si la contadora lo había movido y vuelve a generar sin darse cuenta,
 *     está mirando una quincena leída hasta OTRO día, y nada lo avisa.
 *   · De Asistencia a Planilla y de vuelta: se pierden el colaborador abierto,
 *     lo escrito en el buscador y las horas a medio corregir.
 *
 * Medido: volver cuesta 2 toques (la quincena + «Generar»), 3 si tocó el
 * corte, y **3 llamadas al servidor** (≈3,1 s solo de lectura).
 *
 * ── 🔴 LA REGLA ─────────────────────────────────────────────────────────────
 *
 *   1. Una pestaña ya VISITADA queda montada y se esconde. No se desarma.
 *   2. Una pestaña que nadie tocó **no se monta**: entrar al módulo no puede
 *      disparar las cinco lecturas de golpe.
 *   3. La quincena y el corte de la Planilla viajan además en la dirección,
 *      para que sobrevivan al Atrás y a recargar. **El cuadro generado NO se
 *      guarda en ningún lado**: plata dibujada desde una copia es un número
 *      viejo con cara de nuevo. Al recargar se vuelve a generar, como hoy.
 *
 * 🔴 NINGÚN NÚMERO DE PLATA CAMBIA. Este módulo no calcula un centavo: decide
 * qué se dibuja y qué se escribe en la dirección.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * 🔴 EL INTERRUPTOR de las pestañas que no se desarman. En `false` el módulo es
 * EXACTAMENTE el de antes: se dibuja una pestaña y las otras no existen.
 */
export const ASISTENCIA_PESTANAS_VIVAS = true;

/**
 * 🔴 EL INTERRUPTOR de «guardar una hora no borra la tabla». En `false`, al
 * guardar vuelve el «Cargando…» que reemplaza la tabla entera, y la fila que
 * deja de tener días a revisar desaparece, como antes.
 */
export const ASISTENCIA_GUARDAR_SIN_SALTO = true;

/**
 * 🔴 EL INTERRUPTOR de «quien no marcó aparece igual». En `false` la lista sale
 * SOLO con quien tiene marcas en el período, como antes.
 */
export const ASISTENCIA_SIN_MARCAS_VISIBLE = true;

// ─────────────────────────────────────────────────────────────────────────────
// QUÉ SE MONTA Y QUÉ SE ESCONDE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las pestañas que hay que MONTAR: las ya visitadas más la que se mira ahora.
 *
 * 🔴 Con el interruptor apagado es SOLO la que se mira: el comportamiento de
 * siempre, una pestaña viva y nada más.
 */
export function pestanasMontadas(
  visitadas: Iterable<string> | null | undefined,
  tab: string,
  vivas: boolean = ASISTENCIA_PESTANAS_VIVAS,
): ReadonlySet<string> {
  if (!vivas) return new Set(tab ? [tab] : []);
  const out = new Set<string>();
  for (const v of visitadas ?? []) if (v) out.add(v);
  if (tab) out.add(tab);
  return out;
}

/**
 * ¿Esta pestaña montada está escondida? La que se mira, no; las demás, sí.
 *
 * 🔑 Esconder no es desarmar: el componente sigue vivo, con su estado, sus
 * datos ya cargados y el lugar donde estaba la página.
 */
export function seEsconde(clave: string, tab: string): boolean {
  return clave !== tab;
}

/**
 * Las visitadas, después de tocar una pestaña. Devuelve el MISMO conjunto
 * cuando no hay nada nuevo: así la pantalla no se vuelve a dibujar de gusto.
 */
export function recordarVisitada(
  visitadas: ReadonlySet<string>,
  tab: string,
): ReadonlySet<string> {
  if (!tab || visitadas.has(tab)) return visitadas;
  return new Set([...visitadas, tab]);
}

// ─────────────────────────────────────────────────────────────────────────────
// LA QUINCENA Y EL CORTE, EN LA DIRECCIÓN
//
// 🔴 CLAVES PROPIAS. `quincena` ya está tomada por Préstamos › Movimientos y
// `desde`/`hasta` por Asistencia y Aprobaciones: reusarlas haría que dos
// pantallas se pisaran el período. Por eso `plQuincena` y `plCorte`.
//
// 🔴 SON FILTROS, NO PANTALLAS: van con `replace`, o sea que NO entran a
// `CLAVES_DE_PANTALLA` (`useUrlState`). En el celular la que empuja historial
// es `tab`, que ya lo hace desde el 24-sep-2026.
// ─────────────────────────────────────────────────────────────────────────────

/** La quincena elegida en la Planilla, por su PRIMER día (`2026-09-01`). */
export const PARAM_PLANILLA_QUINCENA = "plQuincena";
/** El corte del reloj de la Planilla. Ver `CORTE_ENTERA`. */
export const PARAM_PLANILLA_CORTE = "plCorte";

/**
 * 🔑 «La quincena entera» es un VALOR, no la ausencia del parámetro.
 *
 * El corte vacío (`""`) significa «se lee el reloj hasta el último día», y es
 * una elección de la contadora tan explícita como poner 13. Si se escribiera
 * como parámetro vacío, la dirección lo borraría y al volver reaparecería el
 * corte PROPUESTO — justo el defecto que esto viene a cerrar.
 */
export const CORTE_ENTERA = "0";

/** El corte, tal como se escribe en la dirección. */
export function corteALaUrl(corte: string): string {
  const c = String(corte ?? "").trim();
  return c === "" ? CORTE_ENTERA : c;
}

/**
 * El corte que trae la dirección (el MISMO formato del campo: `2026-09-13`).
 * Cualquier otra cosa cae en «la quincena entera», que es el comportamiento de
 * siempre: **falla ABIERTA**, nunca en un corte inventado.
 */
export function corteDeLaUrl(raw: string | null | undefined): string {
  const c = String(raw ?? "").trim();
  if (c === "" || c === CORTE_ENTERA) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(c) ? c : "";
}

/** La quincena, tal como se escribe en la dirección: su primer día. */
export function quincenaALaUrl(desde: string): string {
  return String(desde ?? "").trim();
}

/**
 * La quincena que trae la dirección, buscada entre las que HOY se pueden
 * elegir. Una que ya no está en la lista (un enlace del mes pasado) devuelve
 * `null` y la Planilla abre vacía, como cuando se entra de cero.
 */
export function quincenaDeLaUrl<T extends { desde: string; hasta: string }>(
  raw: string | null | undefined,
  opciones: readonly T[],
): T | null {
  const d = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return opciones.find((q) => q.desde === d) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA FILA QUE SE ACABA DE CORREGIR NO DESAPARECE
//
// 🩸 Con «Solo a revisar» prendido, guardar una hora que deja al colaborador
// sin días por revisar lo SACABA de la tabla: la persona corrige y la fila que
// estaba mirando ya no está. No es una sensación, la fila se va.
//
// 🔴 La fila anclada se queda hasta que quien mira cambie el filtro o recargue.
// No se toca la regla de qué es «a revisar» —la sigue poniendo el motor—: lo
// único que se agrega es que a lo filtrado se le devuelven los anclados, EN SU
// LUGAR de la lista.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo filtrado, más los anclados que el filtro se llevó, en el orden original.
 *
 * @param filtradas lo que el filtro dejó
 * @param todas la lista completa, en su orden
 * @param anclados los códigos que se acaban de corregir
 */
export function conAnclados<T extends { codigo: string }>(
  filtradas: readonly T[] | null | undefined,
  todas: readonly T[] | null | undefined,
  anclados: ReadonlySet<string>,
  activo: boolean = ASISTENCIA_GUARDAR_SIN_SALTO,
): T[] {
  const dejadas = [...(filtradas ?? [])];
  if (!activo || anclados.size === 0) return dejadas;
  const lista = [...(todas ?? [])];
  const yaEstan = new Set(dejadas.map((p) => p.codigo));
  const faltan = lista.filter((p) => !yaEstan.has(p.codigo) && anclados.has(p.codigo));
  if (faltan.length === 0) return dejadas;
  const deVuelta = new Set([...yaEstan, ...faltan.map((p) => p.codigo)]);
  return lista.filter((p) => deVuelta.has(p.codigo));
}

/** Los códigos que están en la tabla SOLO porque se los ancló. */
export function ancladosQueSeQuedan<T extends { codigo: string }>(
  filtradas: readonly T[] | null | undefined,
  anclados: ReadonlySet<string>,
): ReadonlySet<string> {
  const dejadas = new Set((filtradas ?? []).map((p) => p.codigo));
  const out = new Set<string>();
  for (const c of anclados) if (!dejadas.has(c)) out.add(c);
  return out;
}

/** El chip de la fila que se quedó por anclada. Corto: ya está corregida. */
export const ROTULO_ANCLADA = "listo";
/** Lo que dice el chip al pasar el cursor. */
export const TITULO_ANCLADA =
  "Se queda a la vista porque la acabas de corregir. Cambia el filtro o actualiza para que se vaya.";

/** El aviso chiquito de que se están trayendo los datos nuevos. */
export const TEXTO_ACTUALIZANDO = "Actualizando…";
