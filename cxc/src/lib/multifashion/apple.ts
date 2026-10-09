// ─────────────────────────────────────────────────────────────────────────────
// MULTIFASHION «COMO UN ERP HECHO POR APPLE» (4-oct-2026, propuesta).
//
// Daniel quiere todo el sistema rediseñado pestaña por pestaña con cinco reglas:
//   1. Lo importante primero, con un número grande.
//   2. Un toque para el detalle.
//   3. Frescura con el componente común (`LineaDeFrescura`).
//   4. El mismo selector de período.
//   5. Lo que requiere atención, arriba.
//
// Lo que cambia (8-oct-2026, puesto al día sobre el main de hoy; el porqué en
// `docs/postmortems/multifashion.md` § «Como un ERP hecho por Apple»):
//   · Resumen: lo que requiere atención ARRIBA, en <Aviso> (días hábiles sin
//     ventas que no son feriado, la meta que no llega) y el mes como EL número.
//   · Año (celular): el año como número grande y los meses en renglones;
//     tocar un mes lo abre.
//   · Vendedoras: la meta que no llega, arriba («Ver meta»). En el Resumen el
//     aviso va SIN «Ver meta» (Daniel, 9-oct-2026): la meta se ve en su lugar.
//   · Clientes: «No vuelven» como número grande (Daniel, 9-oct-2026), las
//     tres tarjetas en su línea, enseguida la lista; la cobertura baja al pie.
//   · Metas: el vendido sin negrita y la explicación de la cuenta detrás del ⓘ.
//   · Errores de carga: <Aviso tono="error"> con «Reintentar».
// Lo que ya publicó `main` (frescura en la computadora, ‹ › del período,
// Productos con filtros) NO se repite aquí.
//
// 🔴 NINGÚN CÁLCULO CAMBIA. Este módulo no suma ni compara nada nuevo: arma
// textos con los MISMOS números que ya trae cada pestaña.
// `false` = todo como hoy. Candado `multifashion-apple.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

import type { MetaConAvance } from "@/lib/multifashion/metas-lectura";
import type { RetailMonthly } from "@/components/ventas/types";
import { conteoPorChip } from "@/lib/multifashion/clientes-seguimiento";
import type { ClienteUniverso } from "@/lib/multifashion/clientes-universo";
import { baseDesdeRatio, variacionPct } from "@/lib/variacion";
import { deltaCorto, montoCorto, type TonoCelular } from "@/lib/multifashion/celular";

/** `false` = Multifashion como hoy. NACE APAGADO. */
export const MULTIFASHION_APPLE_2026_10 = false;

// ── Lo que requiere atención ────────────────────────────────────────────────

export interface Atencion {
  clave: "tienda-abrio" | "meta";
  texto: string;
}

/**
 * La meta viva que, así como van, NO llega. `alcanza` y la brecha los calcula
 * el servidor (`metas-avance.ts`); aquí solo se elige cuál y se escribe.
 */
export function metaQueNoLlega(metas: readonly MetaConAvance[] | null | undefined): MetaConAvance | null {
  return (
    (metas ?? []).find(
      (m) =>
        m.activa !== false &&
        m.avance.estado === "en-curso" &&
        !m.avance.cumplida &&
        m.avance.alcanza === false &&
        m.avance.proyeccion != null,
    ) ?? null
  );
}

/**
 * Lo que pide actuar, en el orden en que se lee: la tienda que quizá no abrió
 * (de `diasSinVenta`, la leyenda del gráfico, sin la pregunta) y la meta que no llega.
 */
export function atencionesMultifashion(args: {
  tiendaAbrio?: string | null;
  meta?: MetaConAvance | null;
}): Atencion[] {
  const out: Atencion[] = [];
  if (args.tiendaAbrio) {
    // Un aviso no pregunta (`docs/diseno.md`): «sáb 12 en $0 y no es feriado —
    // ¿la tienda abrió?» sale como «Sáb 12 sin ventas y no es feriado».
    const t = args.tiendaAbrio.replace(/ — ¿la tienda abrió\?$/, "").replace(" en $0 y ", " sin ventas y ");
    out.push({ clave: "tienda-abrio", texto: t.charAt(0).toUpperCase() + t.slice(1) });
  }
  const m = args.meta;
  if (m) {
    out.push({
      clave: "meta",
      texto: `Meta ${m.nombre}: faltante proyectado ${montoCorto(Math.abs(m.avance.brechaProyectada ?? 0))}`,
    });
  }
  return out;
}

// ── El año en el celular: los doce meses en renglones ───────────────────────

const MES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export interface FilaMesDelAnio {
  mes: number;
  titulo: string;
  monto: string;
  delta: { texto: string; tono: TonoCelular } | null;
}

/**
 * Los meses con venta, del más nuevo al más viejo. El % es el MISMO de la tabla
 * «Mes a mes» de la computadora: base despejada con `baseDesdeRatio` y
 * `variacionPct` (no hay otra cuenta).
 */
export function filasDelAnio(meses: readonly RetailMonthly[]): FilaMesDelAnio[] {
  return meses
    .map((m, i) => ({ m, mes: i + 1 }))
    .filter(({ m }) => m.ventas > 0 || m.tickets > 0)
    .map(({ m, mes }) => ({
      mes,
      titulo: MES_LARGO[mes - 1],
      monto: montoCorto(m.ventas),
      delta: deltaCorto(variacionPct(m.ventas, baseDesdeRatio(m.ventas, m.vs2025))),
    }))
    .reverse();
}

// ── Clientes: el número grande ──────────────────────────────────────────────

/** «No vuelven»: el MISMO conteo que el chip (`conteoPorChip`), sobre la misma lista. */
export function numeroNoVuelven(clientes: readonly ClienteUniverso[]): number {
  return conteoPorChip(clientes).no_vuelven;
}

// ── Las líneas del pie ──────────────────────────────────────────────────────

/** Clientes: «62% de los tickets con nombre — el 70% de la venta · mostrador $X · N tickets aparte». */
export function pieClientes(args: {
  cobertura: string | null;
  ventasAnonimas: number;
  ticketsAnonimos: number;
}): string | null {
  const partes: string[] = [];
  if (args.cobertura) partes.push(args.cobertura);
  if (args.cobertura && (args.ventasAnonimas > 0 || args.ticketsAnonimos > 0)) {
    partes.push(`mostrador ${montoCorto(args.ventasAnonimas)}`);
    partes.push(`${args.ticketsAnonimos.toLocaleString("en-US")} tickets aparte`);
  }
  return partes.length > 0 ? partes.join(" · ") : null;
}
