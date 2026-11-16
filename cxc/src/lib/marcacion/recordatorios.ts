// ─────────────────────────────────────────────────────────────────────────────
// RECORDATORIOS DE MARCACIÓN (16-nov-2026, aprobado por Daniel).
//
// Módulo PURO: sin base, sin red, sin `new Date()`.
//
// Cuatro renglones —Entrada · Salida a almuerzo · Regreso de almuerzo ·
// Salida—, cada uno con su interruptor APAGADO por defecto y su hora. Entrada
// y Salida vienen con la hora de su horario; la del almuerzo la selecciona cada
// persona (sin hora inventada).
//
// 🔴 A QUIÉN SE AVISA (`aQuienAvisar`): recordatorio prendido, su hora cayó en
// los últimos 5 minutos, NO marcó esa marca hoy, es día hábil SUYO y no es
// feriado ni día libre. Un aviso por persona, marca y día.
// ─────────────────────────────────────────────────────────────────────────────

import { esDiaLaborable, limpiaHora } from "@/lib/asistencia/horario-configurable";

/** 0 = Entrada · 1 = Salida a almuerzo · 2 = Regreso de almuerzo · 3 = Salida. */
export type MarcaDelDia = 0 | 1 | 2 | 3;
export const MARCAS_DEL_DIA: readonly MarcaDelDia[] = [0, 1, 2, 3];

export const ROTULOS_RECORDATORIO = ["Entrada", "Salida a almuerzo", "Regreso de almuerzo", "Salida"] as const;

const QUE_MARCAR = ["tu entrada", "tu salida a almuerzo", "tu regreso de almuerzo", "tu salida"] as const;

export const TITULO_AVISO = "Fashion Group";

/** «Recuerda marcar tu entrada». */
export function textoDelAviso(marca: MarcaDelDia): string {
  return `Recuerda marcar ${QUE_MARCAR[marca]}`;
}

export const TEXTO_PIE_RECORDATORIOS =
  "Solo te avisamos si todavía no has marcado. No avisa en feriados ni en tus días libres.";
export const TEXTO_INSTALAR_EN_IPHONE =
  "Para recibir avisos, agrega Fashion Group a tu pantalla de inicio.";
export const TEXTO_SELECCIONA_TU_HORA = "Selecciona tu hora";

/** Cuánto hacia atrás mira cada pasada (la llama la base cada 5 minutos). */
export const VENTANA_MIN = 5;

export interface Recordatorio {
  marca: MarcaDelDia;
  activo: boolean;
  /** «HH:MM», o `null` si todavía no se eligió. */
  hora: string | null;
}

/** La hora con la que viene el renglón: el horario para Entrada y Salida, nada para el almuerzo. */
export function horaPorDefecto(marca: MarcaDelDia, horario: { entrada: string; salida: string } | null): string | null {
  if (!horario) return null;
  if (marca === 0) return limpiaHora(horario.entrada);
  if (marca === 3) return limpiaHora(horario.salida);
  return null;
}

/** Los cuatro renglones: lo guardado, y si no hay, apagado con la hora por defecto. */
export function recordatoriosDe(
  guardados: readonly { marca: number; activo: boolean; hora: string | null }[],
  horario: { entrada: string; salida: string } | null,
): Recordatorio[] {
  return MARCAS_DEL_DIA.map((marca) => {
    const g = guardados.find((x) => Number(x.marca) === marca);
    return {
      marca,
      activo: Boolean(g?.activo),
      hora: limpiaHora(g?.hora) ?? horaPorDefecto(marca, horario),
    };
  });
}

/** Lo que viene en el cuerpo del PUT. `null` = algo no vale. */
export function validarRecordatorios(v: unknown): Recordatorio[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 4) return null;
  const out: Recordatorio[] = [];
  for (const x of v as { marca?: unknown; activo?: unknown; hora?: unknown }[]) {
    const marca = Number(x?.marca);
    if (!MARCAS_DEL_DIA.includes(marca as MarcaDelDia)) return null;
    const hora = x.hora == null || x.hora === "" ? null : limpiaHora(x.hora);
    if (x.hora != null && x.hora !== "" && !hora) return null;
    const activo = x.activo === true;
    // Un recordatorio prendido sin hora no puede avisar nunca.
    if (activo && !hora) return null;
    out.push({ marca: marca as MarcaDelDia, activo, hora });
  }
  return out;
}

/** «HH:MM» → minutos del día. */
function minutos(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/** ¿La hora cayó en los últimos `VENTANA_MIN` minutos (ambos bordes)? */
export function enLaVentana(hora: string | null, ahora: string): boolean {
  if (!hora) return false;
  const h = minutos(hora);
  const a = minutos(ahora);
  return h <= a && h >= a - VENTANA_MIN;
}

export interface EntradaAQuienAvisar {
  /** Día de Panamá, AAAA-MM-DD. */
  hoy: string;
  /** «HH:MM» de Panamá. */
  ahora: string;
  /** Los recordatorios PRENDIDOS de todos, ya con su hora resuelta. */
  recordatorios: readonly { codigo: string; marca: MarcaDelDia; hora: string | null }[];
  /** Código → días laborables (sin entrada = lunes a viernes). */
  diasLaborables: ReadonlyMap<string, readonly number[]>;
  /** Hoy es feriado o día libre de la empresa. */
  hoyNoSeTrabaja: boolean;
  /** Código → cuántas marcas lleva hoy (corregidas). */
  marcasHoy: ReadonlyMap<string, number>;
  /** `codigo|marca` ya avisados hoy. */
  yaAvisados: ReadonlySet<string>;
  /** Fichas de baja hoy: no se les avisa. */
  deBaja?: ReadonlySet<string>;
}

export function llaveAviso(codigo: string, marca: number): string {
  return `${codigo}|${marca}`;
}

/** A quién avisar en esta pasada. Ver el encabezado. */
export function aQuienAvisar(e: EntradaAQuienAvisar): { codigo: string; marca: MarcaDelDia }[] {
  if (e.hoyNoSeTrabaja) return [];
  const out: { codigo: string; marca: MarcaDelDia }[] = [];
  for (const r of e.recordatorios) {
    if (!enLaVentana(r.hora, e.ahora)) continue;
    if (e.deBaja?.has(r.codigo)) continue;
    if (!esDiaLaborable(e.hoy, e.diasLaborables.get(r.codigo))) continue;
    // Ya marcó esa: la marca N del día existe cuando lleva más de N.
    if ((e.marcasHoy.get(r.codigo) ?? 0) > r.marca) continue;
    if (e.yaAvisados.has(llaveAviso(r.codigo, r.marca))) continue;
    out.push({ codigo: r.codigo, marca: r.marca });
  }
  return out;
}
