// ─────────────────────────────────────────────────────────────────────────────
// «CUÁNDO VENDE LA TIENDA» — UNA sección, y cada línea dice de qué período habla.
//
// 🩸 EL DEFECTO, medido el 6-sep-2026 con septiembre corriendo su quinto día:
//
//     Mejor día de semana ...... Sáb · $3.364,19 promedio
//     Mejor día del mes ........ $3.364,19 · el 5 de septiembre
//
// **Es el mismo número.** Ese «promedio» del sábado era UN solo sábado, porque
// la tarjeta miraba nada más el mes en curso y el mes llevaba 5 días. Lo mismo
// con la hora pico: septiembre decía las 4 pm con $1.624,40, o sea la hora más
// fuerte de cinco días sueltos, presentada como el hábito de la tienda.
//
// Un patrón necesita repeticiones. Por eso:
//
//   · «Día más fuerte» y «Hora pico» miran los ÚLTIMOS 3 MESES.
//     Medido jul–sep 2026: sábado $2.640,52 de promedio sobre **10 sábados**
//     (contra $3.364,19 sobre uno), y la hora pico pasa a las 3 pm con
//     $15.209,52 acumulados.
//   · «Mejor día» y «Peor día» siguen siendo DEL MES, que ahí sí es la pregunta
//     («¿qué día me fue mejor este mes?»), y no se tocan.
//
// 🔑 Y las cuatro van en UNA sección con el período escrito al lado de cada
// línea. Eso es lo que faltaba: tres tarjetas sueltas, sin decir de cuándo
// hablaban, hacían que un sábado pareciera un patrón.
//
// ── CÓMO SE JUNTAN LOS MESES, y por qué no se promedian promedios ────────────
// El promedio de N meses **no** es el promedio de sus promedios: cada mes tiene
// distinta cantidad de sábados. Se reconstruye la suma (`promedio × días`), se
// suman las sumas y los días, y recién ahí se divide. Un mes sin ningún sábado
// (count_dias = 0) no aporta ni suma ni divisor — no arrastra el promedio a cero.
//
// ⚠️ NO HAY RPC NUEVA NI DDL. Se piden los MISMOS dos procedimientos de siempre
// (`multifashion_detalle_mensual_v2` y `multifashion_horas_pico_v1`) una vez por
// mes de la ventana y se juntan acá. Medidos: 16 ms y 6,5 ms cada uno.
// ─────────────────────────────────────────────────────────────────────────────

/** Cuántos meses mira un patrón. Tres: lo mínimo para que un día se repita ~12 veces. */
export const MESES_DEL_PATRON = 3;

export interface DowMes {
  dow: number;
  dow_label: string;
  ventas_promedio: number;
  count_dias: number;
}

export interface HoraMes {
  hora: number;
  ventas: number;
  n_tickets?: number;
}

export interface MesPatron {
  heatmap: DowMes[];
  horas: HoraMes[];
}

export interface Patrones {
  /** Un renglón por día de la semana, con el promedio de TODA la ventana. */
  dow: DowMes[];
  /** El día de la semana más fuerte, o `null` si la ventana no tuvo ventas. */
  mejorDow: DowMes | null;
  horas: HoraMes[];
  horaPico: number | null;
  horaPicoVentas: number | null;
  /** Cuántos meses se pudieron juntar de verdad (los que llegaron con datos). */
  mesesUsados: number;
}

/**
 * Junta los patrones de varios meses. El orden de la lista no importa.
 *
 * Con UN solo mes devuelve exactamente lo que ese mes traía — así la función
 * sirve igual para la ventana de 3 meses y para cualquier otro largo.
 */
export function agregarPatrones(meses: MesPatron[]): Patrones {
  const porDow = new Map<number, { label: string; suma: number; dias: number }>();
  const porHora = new Map<number, { ventas: number; tickets: number }>();
  let mesesUsados = 0;

  for (const m of meses) {
    if (!m) continue;
    const tieneAlgo = (m.heatmap?.length ?? 0) > 0 || (m.horas?.length ?? 0) > 0;
    if (tieneAlgo) mesesUsados += 1;

    for (const d of m.heatmap ?? []) {
      const dias = Number(d.count_dias) || 0;
      const acc = porDow.get(d.dow) ?? { label: d.dow_label, suma: 0, dias: 0 };
      // 🔑 Un mes sin ese día de la semana no aporta ni suma ni divisor, y sale
      // solo de la aritmética: `promedio × 0` es 0 y `dias += 0` no mueve el
      // divisor. No hace falta un `if` — y uno acá sería una rama que ningún
      // dato puede recorrer, o sea un candado imposible de verificar.
      acc.suma += (Number(d.ventas_promedio) || 0) * dias;
      acc.dias += dias;
      if (!acc.label && d.dow_label) acc.label = d.dow_label;
      porDow.set(d.dow, acc);
    }

    for (const h of m.horas ?? []) {
      const acc = porHora.get(h.hora) ?? { ventas: 0, tickets: 0 };
      acc.ventas += Number(h.ventas) || 0;
      acc.tickets += Number(h.n_tickets) || 0;
      porHora.set(h.hora, acc);
    }
  }

  const dow: DowMes[] = [...porDow.entries()]
    .map(([k, v]) => ({
      dow: k,
      dow_label: v.label,
      ventas_promedio: v.dias > 0 ? v.suma / v.dias : 0,
      count_dias: v.dias,
    }))
    .sort((a, b) => a.dow - b.dow);

  const mejorDow = dow.reduce<DowMes | null>(
    (acc, d) => (d.count_dias > 0 && d.ventas_promedio > (acc?.ventas_promedio ?? 0) ? d : acc),
    null,
  );

  const horas: HoraMes[] = [...porHora.entries()]
    .map(([hora, v]) => ({ hora, ventas: v.ventas, n_tickets: v.tickets }))
    .sort((a, b) => a.hora - b.hora);

  // Misma regla que `multifashion_horas_pico_v1`: la hora con MÁS venta neta,
  // y solo si es positiva. Sin ventas → sin hora pico, nunca un cero grande.
  let horaPico: number | null = null;
  let horaPicoVentas: number | null = null;
  for (const h of horas) {
    if (h.ventas > 0 && (horaPicoVentas == null || h.ventas > horaPicoVentas)) {
      horaPico = h.hora;
      horaPicoVentas = h.ventas;
    }
  }

  return { dow, mejorDow, horas, horaPico, horaPicoVentas, mesesUsados };
}

/**
 * Los N meses que terminan en (anio, mes), del más viejo al más nuevo.
 * Cruza el año solo.
 */
export function mesesDeLaVentana(anio: number, mes: number, n: number): { anio: number; mes: number }[] {
  const out: { anio: number; mes: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const total = anio * 12 + (mes - 1) - i;
    out.push({ anio: Math.floor(total / 12), mes: (total % 12) + 1 });
  }
  return out;
}

/** El rótulo que va pegado a cada línea. Es lo que hoy falta. */
export const ROTULO_ESTE_MES = "este mes";
export const ROTULO_VENTANA = `últimos ${MESES_DEL_PATRON} meses`;
