/* ─────────────────────────────────────────────────────────────────────────────
 * LAS MARCAS DE UN DÍA SE VEN TODAS (18-sep-2026). Módulo PURO: sin base, sin
 * red, sin `new Date()`.
 *
 * ── 🩸 DE DÓNDE SALE ────────────────────────────────────────────────────────
 *
 * La contadora, por WhatsApp, 17-sep-2026, textual:
 *
 *     «el motivo de que no me deja cerrar es porque hay marcaciones de mas y no
 *      me deja eliminar»
 *
 * y al día siguiente, mirando el archivo que descarga:
 *
 *     «y como veo quien marco de mas? en el excel solo salen max 4 marcaciones
 *      el excel que descargo»
 *
 * Daniel, aclarando de cuáles habla: *«las marcaciones del reloj, no las del
 * app que hicimos»*.
 *
 * Son dos problemas encadenados y el primero es peor: **no se podían VER**. La
 * pantalla y el Excel dibujaban CUATRO horas, elegidas por ÍNDICE —la 1.ª, la
 * 2.ª, la 3.ª y la ÚLTIMA—, así que un día de 5 marcas mostraba la 1, la 2, la
 * 3 y la 5: **la CUARTA, que suele ser justo la repetida, era invisible**. Y un
 * día de 3 marcas escondía la del medio, por la misma cuenta.
 *
 * ── 🔴 ACÁ NO SE DECIDE NI UN CENTAVO ───────────────────────────────────────
 *
 * Este módulo solo dice QUÉ SE DIBUJA. El motor sigue leyendo la ÚLTIMA marca
 * como la salida y el almuerzo entre la 2.ª y la 3.ª (`reporte.ts`, regla 5);
 * `revisar` sigue siendo «no tiene exactamente 4 marcas». Mostrar lo que ya
 * está guardado no mueve un número.
 *
 * ⚠️ Quién FRENA el cierre se decide en `marcas-impares.ts`, que el mismo día
 * pasó de «impar» a «impar O más de 4» por decisión de Daniel: *«las quincena
 * solo cierran con 4, hay q quitar hasta que llegue a 4 maximo. cuando hay 5 o
 * mas es porq es error»*. Son dos cosas distintas y viven separadas: acá se
 * MUESTRA, allá se FRENA.
 *
 * ── 🔑 LO MEDIDO CONTRA PRODUCCIÓN (18-sep-2026) ────────────────────────────
 *
 * Ventana 19-ago → 17-sep, 3.248 marcaciones, 840 días-persona con marca
 * (`scripts/_medir-marcas-de-mas.ts`, solo lectura):
 *
 *     marcas por día:  1→9   2→48   3→49   4→679   5→50   6→5
 *     impares: 108 · más de 4: 55 (50 de cinco · 5 de seis · ninguno de 7+)
 *
 * O sea: **679 de 840 días (80,8 %) tienen exactamente 4 marcas y se ven IGUAL
 * que antes**. Los que cambian son los 161 días de 1, 2, 3, 5 o 6 marcas, y de
 * ésos los 104 de 3, 5 y 6 son los que escondían algo. Ejemplos reales de los
 * invisibles:
 *
 *     Ramón Miranda (21) · 26-ago       Alejandra Camaño (22) · 9-sep
 *        08:10:21                          07:59:20
 *        13:58:34                          13:03:44
 *        14:23:38  ←  se veía               13:33:07  ←  se veía
 *        14:23:39  ←  NO se veía            13:33:58  ←  NO se veía
 *        18:00:50                          16:58:25
 *
 * ── 🔑 «PEGADAS»: CINCO MINUTOS, Y EL NÚMERO NO ES INVENTADO ────────────────
 *
 * De los **55 días de más de 4 marcas**, cuántos tienen al menos DOS marcas a
 * menos de X una de otra:
 *
 *     ≤ 3 s → 27 · ≤ 30 s → 35 · ≤ 60 s → 38 · ≤ 2 min → 40
 *     ≤ 3 min → 42 · **≤ 5 min → 47** · ≤ 10 min → 50
 *
 * Los 27 días con un par a TRES SEGUNDOS o menos son el dedo que tocó dos
 * veces, y no hay nada que discutir ahí. El corte va en **5 minutos** por dos
 * razones, y ninguna es que sea un número redondo:
 *
 *   · es el error REAL de Daniel, medido por él mismo el 14-sep-2026 al probar
 *     el reloj del teléfono: *marcó la SALIDA cinco minutos después de la
 *     entrada, por error de dedo* (ver `20261128120000_marcacion_deshacer.sql`);
 *   · atrapa 47 de los 55 días —los 8 que quedan no tienen ningún par cercano
 *     y piden ojo humano de todos modos—, mientras que 10 minutos ya empieza a
 *     señalar salidas cortas que pueden ser de verdad.
 *
 * 🔴 Es un AVISO para el ojo, nunca una regla: la marca pegada no se quita
 * sola, no cambia un minuto y no frena nada. Quién sobra lo decide la persona
 * que mira, y lo quita a mano.
 * ────────────────────────────────────────────────────────────────────────── */

/** Un día bien marcado: entra, sale a almorzar, vuelve, se va. */
export const MARCAS_NORMALES = 4;

/**
 * Dos marcas separadas por menos de esto se señalan como «pegadas». CINCO
 * minutos: el error que Daniel cometió él mismo probando el reloj del teléfono.
 * Ver el encabezado — sale de medir, no de elegir un número redondo.
 */
export const SEGUNDOS_PEGADAS = 300;

/**
 * Las CUATRO columnas de siempre —Entrada · Sale almuerzo · Vuelve · Salida—,
 * como índices dentro de `marcas`. `null` = esa celda va con raya.
 *
 * 🔴 Es EXACTAMENTE la cuenta que la pantalla hacía a mano desde que existe el
 * reporte, escrita en un solo lugar para poder preguntarle qué esconde. No se
 * cambió ni un caso: con 4 marcas devuelve [0, 1, 2, 3] y el día se dibuja
 * idéntico al de ayer.
 */
export function columnasClasicas(cuantas: number): (number | null)[] {
  const n = Math.max(0, Math.trunc(cuantas));
  return [
    n > 0 ? 0 : null,
    n >= MARCAS_NORMALES ? 1 : null,
    n >= MARCAS_NORMALES ? 2 : null,
    n > 1 ? n - 1 : null,
  ];
}

/**
 * Los índices que las cuatro columnas NO muestran.
 *
 * 🩸 No es solo el día de 5: con **3** marcas la del MEDIO también se perdía
 * (49 días en la ventana medida), porque las columnas 2.ª y 3.ª solo se
 * dibujan a partir de 4 marcas y la última se lleva el índice 2.
 */
export function marcasEscondidas(cuantas: number): number[] {
  const n = Math.max(0, Math.trunc(cuantas));
  const visibles = new Set(columnasClasicas(n).filter((i): i is number => i !== null));
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (!visibles.has(i)) out.push(i);
  return out;
}

/** ¿Este día entra ENTERO en las cuatro columnas de siempre? */
export function cabenEnLasCuatroColumnas(cuantas: number): boolean {
  return marcasEscondidas(cuantas).length === 0;
}

/** "HH:MM:SS" (o "HH:MM") → segundos desde medianoche. `null` si no es hora. */
export function segundosDeHora(hora: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(hora ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = m[3] === undefined ? 0 : Number(m[3]);
  if (h > 23 || mi > 59 || s > 59) return null;
  return h * 3600 + mi * 60 + s;
}

/**
 * Los índices de las marcas que quedaron PEGADAS a la anterior, con cuántos
 * segundos las separan.
 *
 * ⚠️ Se mira contra la marca INMEDIATAMENTE anterior y nada más: tres marcas
 * seguidas (18:27:46 · 18:27:49 · 18:27:57 — el colaborador 40, el 31-ago)
 * señalan la 2.ª y la 3.ª, cada una con su propia brecha. Una hora que no se
 * entiende no rompe nada: se salta.
 */
export function marcasPegadas(
  marcas: readonly string[],
  umbralSeg: number = SEGUNDOS_PEGADAS,
): Array<{ idx: number; segundos: number }> {
  const out: Array<{ idx: number; segundos: number }> = [];
  for (let i = 1; i < marcas.length; i++) {
    const a = segundosDeHora(marcas[i - 1]);
    const b = segundosDeHora(marcas[i]);
    if (a === null || b === null) continue;
    const d = b - a;
    // 🔑 Negativo no puede pasar (las marcas vienen ordenadas), pero si pasara
    // NO se señala: un orden raro es otro problema y no éste.
    if (d >= 0 && d <= umbralSeg) out.push({ idx: i, segundos: d });
  }
  return out;
}

/** `Set` de índices pegados, para preguntar rápido desde la pantalla. */
export function indicesPegados(
  marcas: readonly string[],
  umbralSeg: number = SEGUNDOS_PEGADAS,
): Set<number> {
  return new Set(marcasPegadas(marcas, umbralSeg).map((p) => p.idx));
}

/** «3 segundos» · «1 segundo» · «1 min 36 s». Para el título de la celda. */
export function cuantoDespues(segundos: number): string {
  const s = Math.max(0, Math.trunc(segundos));
  if (s < 60) return s === 1 ? "1 segundo" : `${s} segundos`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} min` : `${m} min ${r} s`;
}

/**
 * Lo que dice la celda pegada al pasar el cursor. 🔴 No afirma que sobre: dice
 * el hecho. Quién sobra lo decide quien mira.
 */
export function tituloPegada(segundos: number): string {
  return `Marcó otra vez ${cuantoDespues(segundos)} después. Si sobra, quítala con «Quitar esta marcación».`;
}

/** «5 marcas» · «1 marca». */
export function cuantasMarcasTexto(cuantas: number): string {
  const n = Math.max(0, Math.trunc(cuantas));
  return n === 1 ? "1 marca" : `${n} marcas`;
}

/**
 * TODAS las marcas del día en una celda del Excel: «08:10:21 · 13:58:34 · …».
 *
 * 🔴 Es lo que la contadora preguntó —*«como veo quien marco de mas?»*— y va al
 * ARCHIVO, no solo a la pantalla: el Excel es el que se descarga y sobrevive a
 * la conversación donde se explicó.
 */
export function textoTodasLasMarcas(marcas: readonly string[]): string {
  return marcas.join(" · ");
}

/**
 * ¿Este día tiene marcas de MÁS? Es la pregunta que ella hace, y se contesta
 * sola: más de las 4 normales.
 *
 * ⚠️ NO es lo mismo que `revisar`, que es «no tiene exactamente 4» y también
 * atrapa al que marcó de MENOS. Desde el 18-sep-2026 sí coincide con la mitad
 * «de más» del freno del cierre (`marcas-impares.ts`), que ahora incluye el día
 * de 6 marcas: es par, y sobra de todos modos.
 */
export function tieneMarcasDeMas(cuantas: number): boolean {
  return Math.trunc(cuantas) > MARCAS_NORMALES;
}

/**
 * 🔴 LAS DEL MEDIO (18-sep-2026). Cuando las marcas no entran en las cuatro
 * columnas de siempre, la PRIMERA se queda en «Entrada» y la ÚLTIMA en
 * «Salida» —eso no se adivina, es lo que el motor ya lee— y todo lo del medio
 * va junto en las dos columnas del almuerzo.
 *
 * 🩸 POR QUÉ. Hasta hoy un día que no entraba en las cuatro se dibujaba con
 * las CUATRO celdas fundidas en una sola, así que las horas quedaban corridas
 * a la derecha y el conteo («3 marcas») caía debajo de «Entrada». Daniel, con
 * la captura del 15 de septiembre de Yulissa: *«hay 3 marcas y no se puso en
 * orden… aparte que no está en su columna, se ve desordenado»*.
 *
 * ⚠️ **No se adivina cuál de las dos del almuerzo es.** Con tres marcas, la
 * del medio puede ser la salida a almorzar o el regreso, y el sistema no tiene
 * cómo saberlo: por eso van en una celda que cubre las dos columnas y no
 * repartidas. Lo mismo que hace `columnasClasicas`, que con 3 deja las dos del
 * almuerzo vacías en vez de inventar una.
 */
export function marcasDelMedio(cuantas: number): number[] {
  const n = Math.max(0, Math.trunc(cuantas));
  const out: number[] = [];
  for (let i = 1; i <= n - 2; i++) out.push(i);
  return out;
}

/**
 * 🔴 LA LÍNEA DE LAS MARCAS QUE NO ENTRAN EN LAS CUATRO COLUMNAS (18-sep-2026).
 *
 * 🩸 DOS INTENTOS ANTES DE ÉSTE, LOS DOS CORREGIDOS POR DANIEL CON LA CAPTURA
 * EN LA MANO. Primero las cuatro celdas se fundían en una y las horas quedaban
 * corridas a la derecha: *«hay 3 marcas y no se puso en orden… no está en su
 * columna, se ve desordenado»*. Después se fundieron solo las dos del almuerzo,
 * con el conteo adentro, y siguió igual: *«y aun se ve desordenado»*.
 *
 * 🔑 La cura es no romper la grilla NUNCA. Las cuatro columnas se dibujan
 * siempre —entrada, salida a almorzar, regreso, salida— y lo que no entra baja
 * a una línea debajo del día, que es donde esta pantalla ya cuenta las cosas de
 * una marca (las correcciones y las del teléfono viven ahí).
 *
 * 🔴 **LA HORA DE ESA LÍNEA SIGUE SIENDO UN BOTÓN.** Es la marca que suele
 * sobrar: si no se puede tocar para quitarla, la línea no sirve de nada. Por eso
 * el rótulo y la nota van APARTE —dos textos— y la hora se dibuja en el medio.
 *
 * ⚠️ El texto CAMBIA según el porqué, porque son dos problemas opuestos:
 *   · con menos de 4 FALTA una, y por eso no se sabe en cuál de las dos del
 *     almuerzo va la del medio;
 *   · con 5 o más SOBRA, y hay que quitarla.
 */
export function rotuloMarcasSueltas(cuantas: number, cuantasSueltas: number): string {
  const n = Math.max(0, Math.trunc(cuantas));
  if (n < MARCAS_NORMALES) return "Otra marca del día:";
  return cuantasSueltas === 1 ? "Marca de más:" : "Marcas de más:";
}

/** Lo que va DESPUÉS de la hora. Ver `rotuloMarcasSueltas`. */
export function notaMarcasSueltas(cuantas: number): string {
  const n = Math.max(0, Math.trunc(cuantas));
  if (n < MARCAS_NORMALES) {
    return "— le falta una marca, así que no se sabe si ésta es la salida a almorzar o el regreso";
  }
  return `— el día tiene ${n}, y son 4`;
}
