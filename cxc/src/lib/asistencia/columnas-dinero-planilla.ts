// ─────────────────────────────────────────────────────────────────────────────
// LAS COLUMNAS DE DINERO DE LA PLANILLA — UNA lista, para las DOS pantallas.
//
// Módulo PURO: sin base, sin red, sin React.
//
// 🩸 POR QUÉ EXISTE (11-sep-2026). La planilla del grupo (`PlanillaTab`) y la de
// Confecciones Boston (`PlanillaBoston`, la que ve David) tenían cada una SU
// lista de encabezados, escrita a mano «en el mismo orden». El 10-sep la del
// grupo pasó a 19 columnas con «Salida temprana» —una deducción real:
// `totalBruto = … − ausencias − tardanzas − salidaTemprana`— y la de Boston se
// quedó en 18. Con cualquiera que saliera temprano, las columnas visibles de
// David no daban el Total bruto ni el Neto, y la novedad que se le mostró decía
// lo contrario («con el mismo total que en el resto del sistema»). El
// `Pick<DineroLinea, …>` no lo cazó: quitar un campo rompe, agregar uno no.
//
// Desde hoy las DOS pantallas leen ESTA lista, y hay candado que lo exige
// (`boston-planilla-mismas-columnas.test.tsx`). Agregar una columna de plata es
// agregarla acá, una sola vez.
//
// ⚠️ Solo lo que se DIBUJA: `rataHora`, `valorMinuto`, `ausenciaPorTardanza`,
// `ausenciaDeDiaCompleto`, `vacacionesYaPagadas` y `baseSeguros` son cifras
// internas o testigos que se muestran de otra forma (el asterisco, el chip).
// ─────────────────────────────────────────────────────────────────────────────

import type { DineroLinea } from "./planilla";

/** Los 19 campos que la tabla dibuja, en su orden. */
export const CAMPOS_DINERO_PLANILLA = [
  "salarioQuincenal", "extraDiurno", "ausencias", "tardanzas", "salidaTemprana",
  "extraNocturno", "excedente", "domingos", "feriados", "totalBruto",
  "seguroSocial", "seguroEducativo", "isr", "prestamo", "terceros",
  "mercancia", "totalDeducciones", "otrosServicios", "netoPagar",
] as const satisfies readonly (keyof DineroLinea)[];

export type CampoDineroPlanilla = (typeof CAMPOS_DINERO_PLANILLA)[number];

export interface ColumnaDineroPlanilla {
  campo: CampoDineroPlanilla;
  /** El encabezado tal cual se dibuja (con su salto de línea). */
  rotulo: string;
}

/**
 * Las 19 columnas, en el orden EXACTO de la tabla.
 *
 * El «(+)» de «Otros servicios» no es adorno: es la única señal en la tabla de
 * que esa columna SUMA mientras las cuatro de al lado restan.
 */
export const COLUMNAS_DINERO_PLANILLA: readonly ColumnaDineroPlanilla[] = [
  { campo: "salarioQuincenal", rotulo: "Salario\nquincenal" },
  { campo: "extraDiurno", rotulo: "Extra\n1.25" },
  { campo: "ausencias", rotulo: "Ausen-\ncias" },
  { campo: "tardanzas", rotulo: "Tar-\ndanzas" },
  // 🔴 10-sep-2026: la salida antes de la hora se descuenta. Es la columna que
  // a Boston le faltó.
  { campo: "salidaTemprana", rotulo: "Salida\ntemprana" },
  { campo: "extraNocturno", rotulo: "Extra\n1.50" },
  { campo: "excedente", rotulo: "Exce-\ndente" },
  { campo: "domingos", rotulo: "Domin-\ngos" },
  { campo: "feriados", rotulo: "Feria-\ndos" },
  { campo: "totalBruto", rotulo: "Total\nbruto" },
  { campo: "seguroSocial", rotulo: "Seguro\nsocial" },
  { campo: "seguroEducativo", rotulo: "Seguro\neducativo" },
  { campo: "isr", rotulo: "ISR" },
  { campo: "prestamo", rotulo: "Prés-\ntamo" },
  { campo: "terceros", rotulo: "Ter-\nceros" },
  { campo: "mercancia", rotulo: "Mercan-\ncía" },
  { campo: "totalDeducciones", rotulo: "Total\ndeducc." },
  { campo: "otrosServicios", rotulo: "Otros\nservicios (+)" },
  { campo: "netoPagar", rotulo: "Neto a\npagar" },
];

/** Solo los encabezados, en orden — lo que las dos `<thead>` dibujan. */
export const ROTULOS_DINERO_PLANILLA: readonly string[] = COLUMNAS_DINERO_PLANILLA.map((c) => c.rotulo);

/**
 * Lo mínimo que hace falta para dibujar una fila o el pie: los 19 números.
 * 🔑 Tipo ESTRUCTURAL: lo cumplen `DineroLinea` (una fila) y `TotalesPlanilla`
 * (el pie) sin castear nada. `salidaTemprana` es opcional porque una respuesta
 * guardada de antes del 10-sep no la trae: ahí vale 0.
 */
export type MontosPlanilla =
  & Pick<DineroLinea, Exclude<CampoDineroPlanilla, "salidaTemprana">>
  & { salidaTemprana?: number };

/** Los 19 montos, en el MISMO orden que `COLUMNAS_DINERO_PLANILLA`. */
export function montosDePlanilla(d: MontosPlanilla): number[] {
  return COLUMNAS_DINERO_PLANILLA.map((c) => Number(d[c.campo] ?? 0));
}
