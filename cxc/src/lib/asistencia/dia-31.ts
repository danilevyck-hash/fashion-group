// ─────────────────────────────────────────────────────────────────────────────
// EL DÍA 31 NO SE PAGA, PERO SÍ SE DESCUENTA (15-sep-2026). Módulo PURO.
//
// Sin base, sin red, sin `new Date()`. Es el ÚNICO lugar donde vive la regla:
// la pantalla (los botones de quincena, el corte) y el motor (hasta dónde se
// lee el reloj) leen de acá. Repetir la condición en dos lados es cómo nace
// una planilla que dice una cosa y paga otra.
//
// ── 🔴 LO QUE DANIEL DEFINIÓ, TEXTUAL (15-sep-2026) ─────────────────────────
//
//   *«Que el 31 no se pague nunca»*
//   *«el día 31 no se paga, pero si no viene o llega tarde se descuenta»*
//
// Y, sobre las horas extra de un 31 (eligió la opción a):
//
//   *«el día no suma sueldo, pero las horas extra son horas trabajadas»*
//
// O sea, la tabla completa:
//
//   | Concepto                                  | El 31            |
//   |-------------------------------------------|------------------|
//   | Sueldo del día                            | NO               |
//   | Ausencia                                  | SÍ se descuenta  |
//   | Tardanza                                  | SÍ se descuenta  |
//   | Salida temprana                           | SÍ se descuenta  |
//   | Horas extra, domingo, feriado, excedente  | SÍ se pagan      |
//
// ── ⚠️ ES ASIMÉTRICA A PROPÓSITO: NO SUMA, PERO SÍ RESTA ────────────────────
//
// No es un error de signo ni un caso olvidado. Está comprobado contra los tres
// Excel reales de la contadora: los de agosto —que tiene 31 días— dicen todos
// **«DEL 16 AL 30 DE AGOSTO»**. Ella paga quince días y mide dieciséis. Que a
// nadie se le ocurra "arreglar" la asimetría el año que viene.
//
// ── 🔑 CÓMO QUEDA IMPLEMENTADO, Y POR QUÉ NO MUEVE UN CENTAVO ───────────────
//
// El quincenal SIEMPRE fue `salario ÷ 2 × factorBase`, y una quincena entera da
// factor **exactamente 1**: el día 31 nunca sumó sueldo. Lo que estaba mal era
// lo que la pantalla PROPONÍA —«16 – 31 ago»— y lo que eso invita a hacer.
//
// 🩸 Y LA TRAMPA, MEDIDA: recortar la quincena a 16–30 **sin nada más** hace que
// `factorBaseDeRango` valga 15/16 = 0,9375 y **todo el mundo cobre un 6,25 %
// menos**. Medido contra producción el 15-sep-2026, quincena 16–31 ago, las
// cuatro empresas: el neto pasa de **$10.421,28 a $9.641,04, −$780,24**. Por eso
// el recorte va en `quincena()` —que es de donde `factorBaseDeRango` saca los
// días de la quincena— y no en el llamador: así 16–30 ES la quincena entera y
// el factor sigue siendo 1.
//
// Y por eso el 31 se sigue MIDIENDO: `finDeLaMedicion` devuelve el día de más,
// y el reloj, las correcciones, las aprobaciones, las justificaciones, las
// vacaciones y los feriados se leen hasta ahí. Medido el mismo día: el 31 de
// agosto mueve **+$54,90** en 28 líneas (más extras que tardanzas y ausencias)
// — exactamente la plata que Daniel quiere que se pague y que se descuente.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Último día del mes. Febrero y los meses de 30 salen solos.
 *
 * 🔑 Vive acá y no en `planilla.ts` para que este módulo no dependa de nadie:
 * `planilla.ts` lo re-exporta, así que quien lo importaba de allá sigue igual.
 */
export function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * 🔴 EL ÚLTIMO DÍA QUE PAGA SUELDO. Nunca el 31.
 *
 * ⚠️ Es un TOPE, no un número fijo: febrero sigue cerrando el 28 (o el 29 en
 * bisiesto) y un mes de 30 días, el 30. El recorte es solo del 31.
 */
export const ULTIMO_DIA_QUE_SE_PAGA = 30;

/** El último día de ESTE mes que paga sueldo: 28, 29 o 30. Nunca 31. */
export function ultimoDiaQueSePaga(anio: number, mes: number): number {
  return Math.min(ultimoDiaDelMes(anio, mes), ULTIMO_DIA_QUE_SE_PAGA);
}

const p2 = (n: number) => String(n).padStart(2, "0");
const ES_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * ¿Este período mide un día MÁS del que paga? Solo cuando termina el 30 de un
 * mes de 31 días. Un 28 de febrero, un 30 de septiembre y un 31 escrito a mano
 * contestan `false`.
 */
export function mideUnDiaDeMas(hasta: string): boolean {
  const m = ES_FECHA.exec(String(hasta ?? ""));
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12) return false;
  return dia === ULTIMO_DIA_QUE_SE_PAGA && ultimoDiaDelMes(anio, mes) === 31;
}

/**
 * 🔴 HASTA DÓNDE SE MIDE un período que se PAGA hasta `hasta`.
 *
 * El 31 de un mes de 31 días; en cualquier otro caso, el mismo `hasta`. Es lo
 * que la ruta le pasa a `armarReporte` y a las seis lecturas del reloj, y lo
 * que `diasSinMedir` usa para saber qué días le quedan a la quincena siguiente.
 */
export function finDeLaMedicion(hasta: string): string {
  if (!mideUnDiaDeMas(hasta)) return String(hasta ?? "");
  return `${hasta.slice(0, 8)}${p2(31)}`;
}

/**
 * La línea que la pantalla dice cuando la quincena mide un día de más. `null`
 * cuando no lo mide — un aviso que sale siempre deja de avisar.
 *
 * ⚠️ Va a la VISTA, no a un `title`: en el iPad no hay mouse, y esto es plata.
 */
export function textoDelDia31(hasta: string): string | null {
  if (!mideUnDiaDeMas(hasta)) return null;
  return "El 31 no paga sueldo, pero sus ausencias, tardanzas, salidas tempranas y horas extra sí entran.";
}
