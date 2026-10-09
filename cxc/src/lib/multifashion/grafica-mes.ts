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
import { lineaDelDia, montoCorto } from "@/lib/multifashion/celular";

/** `false` = la gráfica de antes. Nació apagado, separado del rediseño; PRENDIDO el 9-oct-2026 (Daniel aprobó). */
export const MULTIFASHION_GRAFICA_2026_10 = true;

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
  dias: readonly { dia: number; ventas: number; n_tickets: number }[];
  year: number;
  mes: number;
  esMesActual: boolean;
  /** El último día COMPLETO (`dia_actual`). */
  diaActual: number;
  feriados?: readonly string[] | null;
}): Grafica {
  const tope = e.esMesActual ? Math.max(0, Math.trunc(e.diaActual)) : Infinity;
  const feriados = new Set((e.feriados ?? []).map((f) => String(f).slice(0, 10)));
  const clave = (d: number) => `${e.year}-${String(e.mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const cerrados = e.dias.filter((d) => d.dia <= tope);
  const max = Math.max(0, ...cerrados.map((d) => Number(d.ventas) || 0));
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
    return { dia: d.dia, ventas, tickets, alto: max > 0 && d.dia <= tope ? ventas / max : 0, estado, feriado };
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
export function lineaDeLaGrafica(g: Grafica, year: number, mes: number, tocado: number | null): string | null {
  const d = tocado == null ? null : g.dias.find((x) => x.dia === tocado) ?? null;
  if (!d || d.estado === "hoy" || d.estado === "futuro") {
    if (g.promedio == null) return null;
    return `Promedio diario ${montoCorto(g.promedio)} · ${g.diasCerrados} ${g.diasCerrados === 1 ? "día" : "días"}`;
  }
  const linea = lineaDelDia({ anio: year, mes, dia: d.dia, ventas: d.ventas, tickets: d.tickets });
  const fecha = linea.split(" · ")[0];
  if (d.estado === "sin-venta") return `${fecha} · sin ventas y no es feriado`;
  if (d.estado === "cerrado") return `${fecha} · sin ventas${d.feriado ? " · feriado" : ""}`;
  return d.feriado ? `${fecha} · feriado · ${linea.split(" · ").slice(1).join(" · ")}` : linea;
}
