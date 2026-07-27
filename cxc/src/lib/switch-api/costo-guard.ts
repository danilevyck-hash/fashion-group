// ─── Guard-rail de costos del sync de artículos (18-jul-2026) ────────────────
// Un decimal perdido al capturar el costo de un artículo en Switch (Boston,
// art. 0806: costo unitario 2,365,410 en vez de 2.36541 × 1,000 und) metió
// $2,365M de costo en un día y reventó el margen de Vista General (-567,838%).
// sync-articulos valida cada fila con esto antes del upsert: si el costo es
// absurdo, la fila se guarda con costo_total = 0 (venta/cantidad intactas) y
// se alerta a Telegram para corregirlo en Switch y relanzar el sync del día.
//
// Módulo puro (sin imports) para poder testearlo sin arrastrar supabase-server.

const COSTO_TOTAL_MAX = 500_000; // por artículo × día × tipo
const COSTO_UNITARIO_MAX = 5_000; // costo_total / cantidad_total

export function esCostoSospechoso(costoTotal: number, cantidadTotal: number): boolean {
  if (costoTotal > COSTO_TOTAL_MAX) return true;
  if (cantidadTotal > 0 && costoTotal / cantidadTotal > COSTO_UNITARIO_MAX) return true;
  return false;
}

// ─── Guard-rail del costo DIARIO por empresa (27-jul-2026) ───────────────────
//
// 🩸 Por qué existe: la certificación del 27-jul encontró en `switch_costo_diario`
// la fila `confecciones_boston · 2026-07-14 · costo_total = $1,000,000,049.22`
// contra una venta de $493.00. Viene tal cual del reporte "Total de ventas"
// (tipo=03) de Switch — se pidió en vivo y devuelve ese número —, y para el
// MISMO día el reporte de artículos dice $59.22. `syncCostoDiario` no pasaba por
// ningún guard: escribía lo que Switch le diera. No es un caso aislado: el
// endpoint de ingreso de mercancía de `active_shoes` devolvió el mismo día un
// documento con `total 1.000.000.000`. Switch produce cifras imposibles y hay
// que frenarlas ANTES de escribirlas.
//
// ── POR QUÉ UN UMBRAL RELATIVO Y NO UN NÚMERO FIJO ───────────────────────────
// Un "si es mayor a X" envejece mal: el grupo crece y algún día un día bueno lo
// cruza. El umbral se calcula contra el PROPIO histórico de esa empresa, así que
// sube solo cuando el negocio sube. El piso absoluto solo manda mientras la
// empresa es chica.
//
// ── LA CALIBRACIÓN, MEDIDA (736 filas, 2026-05-01 → 2026-07-31, 8 empresas) ──
//   • El día de costo más caro JAMÁS registrado en el grupo: $141,707.12
//     (active_wear, 13-may-2026, contra $181,650.00 de venta).
//   • p99 por empresa: entre $0 (joystep) y $55,951.41 (fashion_wear).
//   • El costo del grupo ENTERO en junio (mes cerrado, certificado): $489,788.26.
//
//   → El piso de $1,000,000 para UNA empresa en UN día es 7× el récord absoluto
//     y el doble del costo mensual de las 8 empresas juntas. Nada operativo real
//     lo alcanza; $1,000,000,049.22 sí. Es la frontera entre "grande" e
//     "imposible", que no son lo mismo — un mes fuerte NO puede quedar bloqueado.
//   • El factor 20× sobre el récord histórico de la empresa es lo que hace que el
//     umbral envejezca bien: si active_wear duplica su récord, el umbral la sigue
//     ($2.8M hoy) sin que nadie toque una constante.
//
// ── ANTI-ENVENENAMIENTO ──────────────────────────────────────────────────────
// El histórico sale de la misma tabla que se está protegiendo. Si una fila
// absurda ya guardada contara como historia, ella sola levantaría el umbral por
// encima de sí misma y desarmaría el guard para siempre. Por eso las filas ≥
// COSTO_DIARIO_TECHO_HISTORIA ($10M = 70× el récord real) NO cuentan como
// historia. El guard escribe solo lo válido, así que hacia adelante la historia
// nace limpia; esto cubre lo que ya estaba y cualquier carga manual.
//
// ── SE RECHAZA LA FILA, NO SE PONE EN CERO ───────────────────────────────────
// A diferencia del guard de artículos (que guarda costo 0), acá NO se escribe
// nada para ese día: el sync es un UPSERT que refresca el mes entero todos los
// días, así que no escribir CONSERVA el último valor bueno de ese día. Escribir
// un 0 lo destruiría. Los demás días del mes se guardan normal — una fila mala
// no puede tumbar el sync de la empresa.

/** Piso del umbral, por empresa × día. 7× el día más caro jamás medido. */
export const COSTO_DIARIO_PISO = 1_000_000;
/** Multiplicador sobre el récord histórico de la empresa. */
export const COSTO_DIARIO_FACTOR = 20;
/** Una fila por encima de esto no cuenta como historia (anti-envenenamiento). */
export const COSTO_DIARIO_TECHO_HISTORIA = 10_000_000;
/** Ventana de historia que se mira (≤366 filas por empresa: 1/día). */
export const COSTO_DIARIO_DIAS_HISTORIA = 365;
/** Cada cuánto se REPITE el aviso si el dato malo sigue llegando de Switch. */
export const COSTO_DIARIO_DIAS_ENTRE_AVISOS = 7;

/**
 * Umbral de costo diario para una empresa, a partir de su propio histórico.
 * Sin historia (empresa nueva) devuelve el piso. Fail-open por construcción:
 * un histórico vacío nunca hace el guard MÁS agresivo.
 */
export function umbralCostoDiario(historico: readonly number[]): number {
  let max = 0;
  for (const c of historico) {
    if (!Number.isFinite(c)) continue;
    const magnitud = Math.abs(c);
    if (magnitud >= COSTO_DIARIO_TECHO_HISTORIA) continue; // fila envenenada
    if (magnitud > max) max = magnitud;
  }
  return Math.max(COSTO_DIARIO_PISO, COSTO_DIARIO_FACTOR * max);
}

/**
 * ¿Este costo diario es IMPOSIBLE? Se mira la MAGNITUD: un día dominado por
 * notas de crédito da costo negativo legítimo, pero −$1,000,000,000 es tan
 * imposible como +$1,000,000,000.
 */
export function esCostoDiarioImposible(costoTotal: number, umbral: number): boolean {
  if (!Number.isFinite(costoTotal)) return true;
  return Math.abs(costoTotal) > umbral;
}

/**
 * Anti-loop del aviso. El reporte de Switch trae el mes en curso ENTERO todos
 * los días, así que un día mal cargado vuelve a llegar en cada corrida. Solo se
 * avisa por las fechas que no se avisaron en la ventana reciente; si el dato
 * sigue mal, el aviso reaparece a la semana en vez de todos los días.
 * Preserva el orden de entrada y no repite fechas.
 */
export function fechasPorAvisar(
  rechazadas: readonly string[],
  yaAvisadas: Iterable<string>,
): string[] {
  const vistas = new Set(yaAvisadas);
  const salida: string[] = [];
  for (const fecha of rechazadas) {
    if (vistas.has(fecha)) continue;
    vistas.add(fecha);
    salida.push(fecha);
  }
  return salida;
}
