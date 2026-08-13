/**
 * ¿HASTA QUÉ MES ESTÁ AL DÍA cada empresa?
 *
 * Daniel confirmó que los gastos de las 8 empresas SÍ se registran en el mismo
 * lugar, y que lo que falta es que la contadora se ponga al día: *"por ahi mismo
 * pero no esta acutalizado aun, estamos en eso"*. Este módulo existe por UNA
 * razón: que él **vea ese avance sin preguntárselo a nadie**.
 *
 * ── 🔴 LA REGLA DE HONESTIDAD DE ESTE ARCHIVO ───────────────────────────────
 *
 * Lo único que este módulo AFIRMA es lo que el dato dice literalmente: **hasta
 * qué mes hay renglones cargados**. Todo lo demás se dice como sospecha, con el
 * número que la sostiene a la vista, o no se dice.
 *
 * ⚠️ **Un mes con renglones NO es un mes completo**, y eso NO se puede afirmar
 * con este dato: los egresos son pagos sueltos, no tienen un asiento de cierre
 * que diga "terminé" (eso sí existe en el mayor — ver `mayor/gastos.ts`
 * `esAsientoDeCierre`). Así que acá no hay semáforo: hay un mes, y —cuando el
 * propio historial de esa empresa lo justifica— una sospecha declarada como tal.
 *
 * 🩸 EL CASO QUE ORIGINÓ LA REGLA, medido en producción el 13-ago-2026 sobre los
 * 441 renglones de `egresos_varios` (`scripts/_diag-gastos-al-dia.ts`):
 *
 *   fashion_wear   ene $6.482,97 · feb $2.262,80 · mar $2.701,29 ·
 *                  abr $27,18 · **may $257,43**   → último mes: mayo
 *
 * Mayo trae 10% de lo que esa empresa gasta habitualmente. No PRUEBA que esté a
 * medio cargar —una empresa puede gastar menos— pero es exactamente lo que hay
 * que poner delante de los ojos. Se dice "puede estar", nunca "está".
 *
 * ── Por qué MEDIANA y no promedio ───────────────────────────────────────────
 *
 * Un solo mes atípico corre el promedio y tapa la caída. Vistana tiene un marzo
 * de $37.404 contra meses de ~$13.000: con promedio, su julio ($13.276) queda en
 * 75% y con mediana en 92% — la mediana describe mejor "lo habitual de ESTA
 * empresa", que es contra lo que hay que comparar. Nunca contra otra empresa:
 * los tamaños no se parecen en nada.
 */

/** Un mes de una empresa, con lo que se le cargó de GASTO (grupo 6). */
export interface MesDeGasto {
  /** `YYYY-MM`. */
  mes: string;
  /** Gasto del mes en centavos. Puede ser 0 con renglones cargados: pasa cuando
   *  todo lo que salió ese mes fue transferencia, pasivo o pago intercompañía. */
  gastoCent: number;
}

/**
 * Hasta dónde llega una empresa.
 *
 *  - `sin_nada`          → NUNCA se le cargó un renglón. **No es $0**: es que no
 *                          hay nada registrado, y decir cero sería inventar.
 *  - `al_dia`            → hay renglones hasta ese mes, y el mes se ve normal
 *                          contra el propio historial de esa empresa.
 *  - `mes_en_curso`      → el último mes cargado es el mes que todavía está
 *                          corriendo. No es una sospecha: es el calendario.
 *  - `quizas_incompleto` → hay renglones hasta ese mes, pero el mes trae MUY
 *                          poco contra lo habitual de esa empresa. Sospecha
 *                          declarada, con los dos números a la vista.
 */
export type AlDia =
  | { estado: "sin_nada" }
  | { estado: "al_dia"; mes: string }
  | { estado: "mes_en_curso"; mes: string }
  | { estado: "quizas_incompleto"; mes: string; gastoCent: number; habitualCent: number };

/**
 * Cuántos meses previos hacen falta para tener con qué comparar.
 *
 * Con uno o dos, "lo habitual de esta empresa" no existe todavía y la sospecha
 * sería ruido. Tres es el mínimo con el que una mediana significa algo.
 */
export const MIN_MESES_PREVIOS = 3;

/**
 * Por debajo de qué proporción de lo habitual se levanta la sospecha.
 *
 * 0,25 = el mes trae menos de la CUARTA PARTE. Elegido contra los datos reales
 * y verificado en las dos direcciones: marca `fashion_wear` (mayo al 10%) y
 * `active_wear` (abril al 0%), y NO marca `fashion_shoes` (abril al 75%) ni
 * `vistana` (julio al 92%). Un umbral flojo (0,80) marcaría a las cuatro y el
 * aviso dejaría de leerse.
 */
export const UMBRAL_INCOMPLETO = 0.25;

/** Mediana de una lista de números. Vacía → 0. */
export function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

/**
 * Calcula hasta dónde llega una empresa.
 *
 * `serie` son los meses que TIENEN renglones (en cualquier orden); los meses sin
 * un solo renglón no van en la lista. `mesEnCurso` es el mes de hoy en Panamá
 * (`YYYY-MM`) — se pasa como argumento para que esta función siga siendo pura y
 * se pueda probar sin viajar en el tiempo.
 */
export function alDiaDe(serie: MesDeGasto[], mesEnCurso: string): AlDia {
  if (serie.length === 0) return { estado: "sin_nada" };

  // `YYYY-MM` ordena igual como texto que como fecha.
  const orden = [...serie].sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
  const ultimo = orden[orden.length - 1];

  // El mes que todavía está corriendo no puede estar completo, y eso es un
  // HECHO del calendario — no hace falta ninguna estadística para decirlo.
  if (ultimo.mes >= mesEnCurso) return { estado: "mes_en_curso", mes: ultimo.mes };

  const previos = orden.slice(0, -1);
  if (previos.length < MIN_MESES_PREVIOS) return { estado: "al_dia", mes: ultimo.mes };

  // ⚠️ REDONDEADO A CENTAVO ENTERO. La mediana de una cantidad PAR de meses es
  // un promedio de dos, y sale con medio centavo (fashion_wear: 248.204,5). Ese
  // número se PINTA (`usd()`), y medio centavo en pantalla es exactamente la
  // clase de detalle que hace dudar de todo lo demás.
  const habitual = Math.round(mediana(previos.map((m) => m.gastoCent)));
  // Sin historial con monto no hay contra qué comparar: no se sospecha nada.
  if (habitual <= 0) return { estado: "al_dia", mes: ultimo.mes };

  if (ultimo.gastoCent < habitual * UMBRAL_INCOMPLETO) {
    return {
      estado: "quizas_incompleto",
      mes: ultimo.mes,
      gastoCent: ultimo.gastoCent,
      habitualCent: habitual,
    };
  }
  return { estado: "al_dia", mes: ultimo.mes };
}

/** Arma la serie por empresa a partir de renglones sueltos ya filtrados a
 *  GASTO. Los meses sin renglones no aparecen: "no hay fila" es el dato. */
export function serieDeGasto(
  renglones: readonly { mes: string; gastoCent: number }[],
): MesDeGasto[] {
  const porMes = new Map<string, number>();
  for (const r of renglones) {
    porMes.set(r.mes, (porMes.get(r.mes) ?? 0) + r.gastoCent);
  }
  return [...porMes.entries()]
    .map(([mes, gastoCent]) => ({ mes, gastoCent }))
    .sort((a, b) => (a.mes < b.mes ? -1 : 1));
}
