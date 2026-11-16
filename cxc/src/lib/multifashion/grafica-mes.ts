// ─────────────────────────────────────────────────────────────────────────────
// LA GRÁFICA DE VENTAS DIARIAS (9-oct-2026, propuesta). Una sola pregunta:
// «¿cómo va el mes día por día?». La misma en la computadora y en el celular.
//
// Lo que cambia contra la de hoy (recharts con eje en $7,104, línea del año
// pasado ondulada sobre los días que faltan, hoy sin marcar y los días en $0
// todos iguales):
//   · Barras por día, sin eje: la escala la dan el promedio diario (línea
//     tenue) y el monto del día tocado, arriba, como Apple Salud.
//   · El último día cerrado, destacado; el día de hoy, marcado en el eje.
//   · Un día en $0: ámbar si es hábil y no feriado (la MISMA regla de
//     `diasSinVenta`), gris si es domingo o feriado.
//   · El año pasado sale de la gráfica: el % contra el año pasado ya está en
//     el número grande del mes.
//
// 🔴 NINGÚN NÚMERO SE RECALCULA: los días, montos y tiquetes son los MISMOS de
// `detalle-mensual`; el promedio es la venta de los días ya cerrados entre esos
// días. `false` = la gráfica de hoy. Candado `multifashion-grafica.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { esDiaHabilTienda } from "@/lib/multifashion/resumen-minimo";
import { deltaCorto, lineaDelDia, montoCorto } from "@/lib/multifashion/celular";
import { variacionPct } from "@/lib/variacion";

/** `false` = la gráfica de antes. Nació apagado, separado del rediseño; PRENDIDO el 9-oct-2026 (Daniel aprobó). */
export const MULTIFASHION_GRAFICA_2026_10 = true;

/**
 * «vs año pasado» (propuesta 15-nov-2026): una marca por día con lo vendido la
 * MISMA FECHA del año pasado (`ventas_anio_anterior`, ya viene de
 * `detalle-mensual`). Por fecha y no por día de semana: los feriados de
 * Panamá caen en fecha fija. `false` = la gráfica de hoy.
 */
export const MULTIFASHION_VS_ANIO_PASADO = true;

export type EstadoDia =
  | "venta"       // cerrado, con venta
  | "ultimo"      // el último día cerrado, destacado
  | "sin-venta"   // hábil, no feriado, en $0 y sin tiquetes (pide mirar)
  | "cerrado"     // domingo o feriado en $0 (esperado)
  | "hoy"         // el día en curso (todavía no entra al detalle)
  | "futuro";

export interface DiaGrafica {
  dia: number;
  ventas: number;
  tickets: number;
  /** 0–1 contra el mejor día del mes. */
  alto: number;
  estado: EstadoDia;
  feriado: boolean;
  /** Lo vendido la misma fecha del año pasado (null = sin dato o sin comparar). */
  ventasAA: number | null;
  /** 0–1, a la misma escala que las barras. */
  altoAA: number | null;
}

export interface Grafica {
  dias: DiaGrafica[];
  /** Venta promedio de los días cerrados (null sin días cerrados con venta). */
  promedio: number | null;
  /** 0–1, a la misma escala que las barras. */
  promedioAlto: number | null;
  diasCerrados: number;
}

export function graficaDelMes(e: {
  dias: readonly { dia: number; ventas: number; n_tickets: number; ventas_anio_anterior?: number | null }[];
  year: number;
  mes: number;
  esMesActual: boolean;
  /** El último día COMPLETO (`dia_actual`). */
  diaActual: number;
  feriados?: readonly string[] | null;
  /** Dibujar el año pasado: la escala pasa a ser el mejor día de los dos años. */
  vsAnioPasado?: boolean;
}): Grafica {
  const tope = e.esMesActual ? Math.max(0, Math.trunc(e.diaActual)) : Infinity;
  const feriados = new Set((e.feriados ?? []).map((f) => String(f).slice(0, 10)));
  const clave = (d: number) => `${e.year}-${String(e.mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const cerrados = e.dias.filter((d) => d.dia <= tope);
  const aa = (d: { ventas_anio_anterior?: number | null }) =>
    e.vsAnioPasado && d.ventas_anio_anterior != null ? Math.max(0, Number(d.ventas_anio_anterior) || 0) : null;
  const max = Math.max(0, ...cerrados.map((d) => Number(d.ventas) || 0), ...e.dias.map((d) => aa(d) ?? 0));
  const ultimo = cerrados.length ? Math.max(...cerrados.map((d) => d.dia)) : null;

  const dias: DiaGrafica[] = e.dias.map((d) => {
    const ventas = Math.max(0, Number(d.ventas) || 0);
    const tickets = Math.max(0, Number(d.n_tickets) || 0);
    const feriado = feriados.has(clave(d.dia));
    let estado: EstadoDia;
    if (d.dia > tope) estado = e.esMesActual && d.dia === tope + 1 ? "hoy" : "futuro";
    else if (ventas < 0.005 && tickets === 0) {
      // La MISMA regla que el aviso (`diasSinVenta`): sin feriados leídos no se acusa.
      estado = e.feriados != null && esDiaHabilTienda(e.year, e.mes, d.dia) && !feriado ? "sin-venta" : "cerrado";
    } else estado = e.esMesActual && d.dia === ultimo ? "ultimo" : "venta";
    const ventasAA = aa(d);
    return { dia: d.dia, ventas, tickets, alto: max > 0 && d.dia <= tope ? ventas / max : 0, estado, feriado,
      ventasAA, altoAA: ventasAA != null && max > 0 ? ventasAA / max : null };
  });

  // Venta del mes entre días cerrados: la MISMA base que la proyección del cierre.
  const suma = cerrados.reduce((s, d) => s + Math.max(0, Number(d.ventas) || 0), 0);
  const promedio = suma > 0 ? suma / cerrados.length : null;
  return {
    dias,
    promedio,
    promedioAlto: promedio != null && max > 0 ? promedio / max : null,
    diasCerrados: cerrados.length,
  };
}

/**
 * En el celular (31 barras en 358 px) el eje lleva solo 1, 8, 15, 22, 29 y
 * «Hoy»: el mes entero se lee sin que los números se encimen. En la
 * computadora, todos.
 */
export function etiquetaEnCelular(d: DiaGrafica, g: Grafica): boolean {
  if (d.estado === "hoy") return true;
  // Pegado a «Hoy» se encimaría: ese número se calla.
  const hoy = g.dias.find((x) => x.estado === "hoy")?.dia;
  return d.dia % 7 === 1 && (hoy == null || Math.abs(d.dia - hoy) > 2);
}

/** La línea de arriba de la gráfica: el día tocado o, sin tocar, el promedio. */
const MES_CORTO_GRAFICA = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * `conRango` (`MULTIFASHION_BARRA_2026_10`, celular): «Venta promedio diaria
 * $2,662 · 1–10 oct». Daniel, 11-oct-2026: «¿promedio diario qué?». Dice qué se
 * promedia y de qué días; el número es el MISMO.
 */
export function lineaDeLaGrafica(g: Grafica, year: number, mes: number, tocado: number | null, conRango = false): string | null {
  const d = tocado == null ? null : g.dias.find((x) => x.dia === tocado) ?? null;
  if (!d || d.estado === "hoy" || d.estado === "futuro") {
    // «vs año pasado» sin tocar: los días cerrados contra las MISMAS fechas del año pasado.
    const cerrados = g.dias.filter((x) => x.estado !== "hoy" && x.estado !== "futuro");
    if (cerrados.some((x) => x.ventasAA != null)) {
      const v = cerrados.reduce((s, x) => s + x.ventas, 0);
      const aa = cerrados.reduce((s, x) => s + (x.ventasAA ?? 0), 0);
      const delta = deltaCorto(variacionPct(v, aa))?.texto.replace(/ /g, "\u00a0") ?? null;
      return `1–${cerrados.length} ${MES_CORTO_GRAFICA[mes - 1]} ${montoCorto(v)} · ${year - 1} ${montoCorto(aa)}${delta ? ` ${delta}` : ""}`;
    }
    if (g.promedio == null) return null;
    if (conRango) {
      const dias = g.diasCerrados === 1 ? "1" : `1–${g.diasCerrados}`;
      return `Venta promedio diaria ${montoCorto(g.promedio)} · ${dias} ${MES_CORTO_GRAFICA[mes - 1]}`;
    }
    return `Promedio diario ${montoCorto(g.promedio)} · ${g.diasCerrados} ${g.diasCerrados === 1 ? "día" : "días"}`;
  }
  const linea = lineaDelDia({ anio: year, mes, dia: d.dia, ventas: d.ventas, tickets: d.tickets });
  const fecha = linea.split(" · ")[0];
  // «vs año pasado»: la misma fecha del año pasado al final («· 2025 $1,658 ▲ 3 %»).
  // El % sale de UN solo lugar (`variacionPct`: base mínima $100, nunca «0 %» por un null).
  const delta = d.ventas > 0 ? deltaCorto(variacionPct(d.ventas, d.ventasAA))?.texto.replace(/ /g, "\u00a0") : null;
  const aa = d.ventasAA == null ? "" : ` · ${year - 1} ${d.ventasAA > 0 ? montoCorto(d.ventasAA) : "sin ventas"}${delta ? ` ${delta}` : ""}`;
  if (d.estado === "sin-venta") return `${fecha} · sin ventas y no es feriado${aa}`;
  if (d.estado === "cerrado") return `${fecha} · sin ventas${d.feriado ? " · feriado" : ""}${aa}`;
  if (aa) return `${fecha} · ${montoCorto(d.ventas)}${aa}`;
  return d.feriado ? `${fecha} · feriado · ${linea.split(" · ").slice(1).join(" · ")}` : linea;
}
