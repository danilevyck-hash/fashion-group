// ─────────────────────────────────────────────────────────────────────────────
// «ÚLTIMOS PAGOS» POR FECHA — no por empresa. Módulo PURO.
//
// 🩸 POR QUÉ CAMBIÓ (5-sep-2026). El bloque anterior mostraba 3 pagos POR
// EMPRESA, y los clientes grandes le pagan a varias empresas el MISMO DÍA:
// el 29-jun-2026, D-25 pagó $241.857,77 repartidos en las SEIS. Con el corte
// por empresa eso son 6 bloques de 3 líneas = **18 líneas para decir lo que
// dicen 3**, y ninguna de las 18 dice cuánto entró ese día.
//
// Lo que se lee ahora, con los números reales de D-25:
//   20 ago · $234,189.21 · Vistana · Fashion Wear · Active Shoes · Fashion Shoes
//   29 jul · $70,129.85 · Vistana · Fashion Shoes
//   22 jul · $187,651.51 · Fashion Wear
//
// 🔴 EL FILTRO ES EL MISMO DE SIEMPRE: sin retenciones y sin recibos en cero.
// Si cambiara, esta lista diría una plata que el resto del módulo no dice.
//
// 🔴 BOSTON NO ENTRA. Este módulo solo ARMA el texto; quien lee la base ya
// acotó a las 6 del grupo, empresa por empresa. Meter una consulta acá sería
// abrir la puerta que el candado de Boston cierra.
// ─────────────────────────────────────────────────────────────────────────────

/** Cuántas FECHAS se muestran. Tres, como los tres pagos de antes. */
export const FECHAS_DE_PAGO = 3;

/** Un pago suelto, ya acotado a una empresa del grupo. */
export interface PagoDeEmpresa {
  /** `YYYY-MM-DD` del recibo. */
  fecha: string;
  monto: number;
  /** `empresa_key` — se traduce a nombre al dibujar, no acá. */
  empresa: string;
}

/** Un DÍA en que el cliente pagó, con lo que entró y dónde. */
export interface PagoDelDia {
  fecha: string;
  /** Suma de todos sus recibos de ese día, en todas las empresas. */
  monto: number;
  /** Las empresas donde pagó ese día, sin repetir, en el orden en que entraron. */
  empresas: string[];
}

/**
 * Agrupa por DÍA y devuelve las `FECHAS_DE_PAGO` más recientes.
 *
 * ⚠️ Ordena por fecha descendente con un desempate ESTABLE (la fecha es la
 * llave y es única después de agrupar), así que dos corridas sobre los mismos
 * datos dan siempre la misma lista.
 */
export function agruparPagosPorFecha(
  pagos: PagoDeEmpresa[],
  cuantas: number = FECHAS_DE_PAGO,
): PagoDelDia[] {
  const porDia = new Map<string, PagoDelDia>();
  for (const p of pagos) {
    const fecha = (p.fecha ?? "").slice(0, 10);
    if (!fecha) continue;
    let dia = porDia.get(fecha);
    if (!dia) { dia = { fecha, monto: 0, empresas: [] }; porDia.set(fecha, dia); }
    dia.monto = Math.round((dia.monto + (Number(p.monto) || 0)) * 100) / 100;
    if (p.empresa && !dia.empresas.includes(p.empresa)) dia.empresas.push(p.empresa);
  }
  return [...porDia.values()]
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
    .slice(0, cuantas);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * `20 ago` — día y mes, sin año. El bloque muestra los últimos tres pagos: el
 * año no aporta y sí roba ancho al renglón, que además lleva las empresas.
 * Un pago de otro año SÍ lleva el año, para que no se lea como de éste.
 */
export function fechaCortaPago(fecha: string, hoy: string): string {
  const [y, m, d] = fecha.slice(0, 10).split("-");
  const mes = MESES[Number(m) - 1] ?? m;
  const dia = String(Number(d));
  return y === hoy.slice(0, 4) ? `${dia} ${mes}` : `${dia} ${mes} ${y}`;
}
