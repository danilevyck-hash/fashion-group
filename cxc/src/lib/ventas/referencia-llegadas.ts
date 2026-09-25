// ─────────────────────────────────────────────────────────────────────────────
// «EL 80 % SE VENDIÓ EN N SEMANAS» — módulo PURO, y una LECTURA APARTE.
//
// 🔴 ESTO NO CAMBIA NI UN NÚMERO DEL MÓDULO. Compré, Vendí, Stock, % vendido,
// el cuadre y los avisos de descuadre salen de `compras.ts` y no se tocan. Lo
// de acá es una lectura DE MÁS, y por eso en pantalla se dice «aprox.».
//
// 🔑 CONVIVE CON «NADA DE FIFO» (CLAUDE.md › Referencia). La regla prohibida es
// atribuirle a UNA venta la compra de la que salió — eso exigiría que alguien
// marcara las cajas, y nadie las marca. Acá no se atribuye ninguna venta a
// ninguna llegada: se mira la bodega como una FILA (lo que llegó primero sale
// primero) y se pregunta cuándo el consumo acumulado pasó por el 80 % del tramo
// que esa llegada ocupa en la fila. Es una aproximación declarada, no un dato.
//
// LA REGLA, ENTERA:
//
//   1. Lo que había ANTES de la primera llegada registrada:
//        stockPrevio = max(0, comprado − stock − vendido)
//      Es lo que estaba en bodega antes de que empezaran los ingresos (oct-2022)
//      más lo que entró por una vía que no es un ingreso de mercancía. Sin él,
//      la fila arranca corrida y ninguna llegada cuadra.
//   2. El consumo acumulado al día D = stockPrevio + ventas netas hasta D.
//   3. La llegada i ocupa el tramo [antes, antes + piezas) de esa fila, donde
//      `antes` es la suma de las llegadas anteriores. Su 80 % está en
//      `antes + 0,8 × piezas`.
//   4. `semanas` = semanas entre la fecha de la llegada y el PRIMER día (≥ esa
//      fecha) en que el consumo acumulado pasó ese punto. Si nunca lo pasó, es
//      `null` y la pantalla escribe «—».
//   5. `quedaPct` = cuánto del tramo sigue sin consumirse, con el consumo
//      total de hoy. 0 % = esa llegada ya se vendió entera.
//
// ✅ MEDIDO CONTRA PRODUCCIÓN (25-sep-2026, vistana, `NB2570`):
//   · Modelo NB2570 — comprado 5.856 · vendido 4.580 · stock 888 → stockPrevio
//     388. La llegada de **nov-2025 (360 pzas) hizo el 80 % en 21 semanas**; la
//     de **ago-2026 (360 pzas) va en «—», queda 100 %**.
//   · Color NB2570001 — comprado 935 · vendido 552 · stock 345 → stockPrevio
//     38. La última (feb-2026, 180 pzas) va en «—» y **queda 100 %**; la última
//     que SÍ se vendió (abr-2025, 240 pzas) tardó **52 semanas**.
// ─────────────────────────────────────────────────────────────────────────────

/** El corte: el 80 % de las piezas de la llegada. */
export const PARTE_MEDIDA = 0.8;

/** Una llegada agrupada por día: fecha y piezas. */
export interface Llegada {
  /** YYYY-MM-DD */
  fecha: string;
  unidades: number;
}

/** Un día de venta NETA (las notas de crédito ya restadas). */
export interface DiaVenta {
  /** YYYY-MM-DD */
  fecha: string;
  unidades: number;
}

export interface LlegadaMedida extends Llegada {
  /** Semanas hasta que el consumo acumulado pasó el 80 %. `null` = todavía no. */
  semanas: number | null;
  /** Qué parte de la llegada sigue sin consumirse, 0..100. `null` = sin piezas. */
  quedaPct: number | null;
  /** `true` = ya se consumió entera (quedaPct 0). */
  vendida: boolean;
}

/** Días entre dos YYYY-MM-DD, sin husos ni horario de verano. */
export function diasEntre(desde: string, hasta: string): number {
  const p = (f: string) => {
    const [y, m, d] = f.split("-").map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  return Math.round((p(hasta) - p(desde)) / 86_400_000);
}

/** Semanas redondeadas entre dos fechas. */
export function semanasEntre(desde: string, hasta: string): number {
  return Math.round(diasEntre(desde, hasta) / 7);
}

/**
 * Lo que había en bodega antes de la primera llegada registrada.
 *
 * ⚠️ Nunca negativo: si vendido + stock es MENOR que lo comprado, el hueco es
 * un ajuste de inventario (o una compra que no se registró) y no se le puede
 * poner signo. Se trata como cero y la medición queda del lado conservador.
 */
export function stockPrevio(
  comprado: number,
  vendido: number,
  stock: number | null,
): number {
  if (stock == null) return 0;
  return Math.max(0, comprado - stock - vendido);
}

/** Agrupa líneas de ingreso por DÍA: una llegada por fecha, ordenadas. */
export function agruparLlegadasPorDia(
  filas: readonly { fecha: string; unidades: number }[],
): Llegada[] {
  const porDia = new Map<string, number>();
  for (const f of filas) porDia.set(f.fecha, (porDia.get(f.fecha) ?? 0) + f.unidades);
  return [...porDia.entries()]
    .map(([fecha, unidades]) => ({ fecha, unidades }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Suma varios juegos de días de venta en uno solo (los colores de un modelo). */
export function sumarDias(juegos: readonly (readonly DiaVenta[])[]): DiaVenta[] {
  const porDia = new Map<string, number>();
  for (const j of juegos) {
    for (const d of j) porDia.set(d.fecha, (porDia.get(d.fecha) ?? 0) + d.unidades);
  }
  return [...porDia.entries()]
    .map(([fecha, unidades]) => ({ fecha, unidades }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * La medición, llegada por llegada. `llegadas` y `dias` pueden venir en
 * cualquier orden: acá se ordenan.
 */
export function medirLlegadas(
  llegadas: readonly Llegada[],
  dias: readonly DiaVenta[],
  stock: number | null,
): LlegadaMedida[] {
  const orden = [...llegadas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const diasOrden = [...dias].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const comprado = orden.reduce((s, l) => s + l.unidades, 0);
  const vendido = diasOrden.reduce((s, d) => s + d.unidades, 0);
  const previo = stockPrevio(comprado, vendido, stock);

  // El consumo acumulado, día por día.
  let corrido = previo;
  const consumo = diasOrden.map((d) => ({ fecha: d.fecha, acumulado: (corrido += d.unidades) }));
  const consumoFinal = corrido;

  const out: LlegadaMedida[] = [];
  let antes = 0;
  for (const l of orden) {
    if (!(l.unidades > 0)) {
      out.push({ ...l, semanas: null, quedaPct: null, vendida: false });
      continue;
    }
    const objetivo = antes + PARTE_MEDIDA * l.unidades;
    const punto = consumo.find((c) => c.fecha >= l.fecha && c.acumulado >= objetivo);
    const cubierto = Math.max(0, Math.min(l.unidades, consumoFinal - antes));
    const quedaPct = Math.round(100 * (1 - cubierto / l.unidades));
    out.push({
      ...l,
      semanas: punto ? semanasEntre(l.fecha, punto.fecha) : null,
      quedaPct,
      vendida: quedaPct === 0,
    });
    antes += l.unidades;
  }
  return out;
}

/**
 * La última llegada y la ANTERIOR QUE SÍ SE VENDIÓ.
 *
 * 🔴 La anterior no es «la de antes» a secas: es la más reciente, antes de la
 * última, que llegó a completar su 80 %. Si la de antes tampoco se movió, su
 * «—» al lado del «—» de la última no dice nada; la que sirve de vara es la
 * última que sí se vendió.
 */
export function ultimaYVara(medidas: readonly LlegadaMedida[]): {
  ultima: LlegadaMedida | null;
  vara: LlegadaMedida | null;
} {
  if (medidas.length === 0) return { ultima: null, vara: null };
  const ultima = medidas[medidas.length - 1];
  const vara = [...medidas.slice(0, -1)].reverse().find((m) => m.semanas != null) ?? null;
  return { ultima, vara };
}
