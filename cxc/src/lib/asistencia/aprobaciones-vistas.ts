/* ─────────────────────────────────────────────────────────────────────────────
 * APROBACIONES — LAS DOS VISTAS: POR COLABORADOR Y POR DÍA (10-sep-2026).
 *
 * Módulo PURO: sin base, sin red y sin `new Date()`.
 *
 * Daniel, textual: *«Aprobaciones es una sola lista de decisiones. Cada renglón
 * es una persona en la quincena, con sus horas extra sumadas. Dos botones: Sí y
 * No. Se decide, y el renglón se va»* · *«y si quiero poder ver por día y por
 * persona? con un tab arriba que diga colaborador / día»*.
 *
 * ── 🔴 UNA SOLA FUENTE, DOS AGRUPAMIENTOS ────────────────────────────────────
 *
 * Las dos vistas salen de los MISMOS `DiaAprobacion[]` que arma
 * `armarDiasAprobacion` (desde el MISMO `clasificarDia` que paga). Acá solo se
 * reacomodan: por colaborador (persona → sus días) o por día (día → su gente).
 * Un segundo camino de datos para una de las dos sería la forma de que digan
 * números distintos.
 *
 * ── 🔴 LO PENDIENTE ARRIBA, LO DECIDIDO ABAJO Y PLEGADO ──────────────────────
 *
 * «Se decide, y el renglón se va»: un renglón está POR DECIDIR mientras tenga
 * al menos un día sin decisión. Cuando todos sus días tienen Sí o No, pasa a
 * «Ya decididas (N)», plegado, con «cambiar» para volver atrás — un toque de más
 * no puede ser irreversible.
 * ────────────────────────────────────────────────────────────────────────── */

import {
  claveDia,
  decisionDe,
  type Decision,
  type DiaAprobacion,
  type PersonaEnDia,
  type ToqueAprobacion,
} from "./aprobaciones";

// ─────────────────────────────────────────────────────────────────────────────
// LA VISTA — el control de dos opciones, en la URL y recordado
// ─────────────────────────────────────────────────────────────────────────────

export type Vista = "colaborador" | "dia";

/** El parámetro de la URL (`?vista=`) y la llave con la que se recuerda. */
export const PARAM_VISTA = "vista";
export const RECORDAR_VISTA = "asistencia_aprobaciones_vista";

/** Las dos opciones, en el orden en que se dibujan. Colaborador es la de abrir. */
export const VISTAS: ReadonlyArray<{ key: Vista; etiqueta: string }> = [
  { key: "colaborador", etiqueta: "Colaborador" },
  { key: "dia", etiqueta: "Día" },
];

/** Lo que venga (URL, recordado, basura) → una vista válida. Colaborador por defecto. */
export function vistaElegida(v: unknown): Vista {
  return v === "dia" ? "dia" : "colaborador";
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS PALABRAS
// ─────────────────────────────────────────────────────────────────────────────

/** Horas en «3:45». Es como se lee un rato, no como se lee un decimal. */
export function hm(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** «4 días · 2:25 h» / «1 día · 0:15 h». */
export function textoDiasYHoras(dias: number, minutos: number): string {
  return `${dias} ${dias === 1 ? "día" : "días"} · ${hm(minutos)} h`;
}

/** «N por decidir · H:MM h», o «Todo decidido». */
export function textoPorDecidir(renglones: number, minutos: number): string {
  if (renglones === 0) return "Todo decidido";
  return `${renglones} por decidir · ${hm(minutos)} h`;
}

/** Lo que dice un renglón ya decidido: «Sí», «No» o, con días de los dos, «Sí y No». */
export function resumenDecision(dias: ReadonlyArray<{ decision?: Decision; aprobado?: boolean }>): "Sí" | "No" | "Sí y No" | "Pendiente" {
  const set = new Set(dias.map((d) => decisionDe(d)));
  if (set.has(null)) return "Pendiente";
  if (set.has("si") && set.has("no")) return "Sí y No";
  return set.has("no") ? "No" : "Sí";
}

// ─────────────────────────────────────────────────────────────────────────────
// POR COLABORADOR
// ─────────────────────────────────────────────────────────────────────────────

/** Un día de UNA persona, tal como se despliega bajo su renglón. */
export interface DiaDePersona {
  fecha: string;
  /** «lun 17 ago» */
  etiqueta: string;
  minutos: number;
  tipo: PersonaEnDia["tipo"];
  salida: string | null;
  decision: Decision;
  por: string | null;
  cuando: string | null;
  cambio: boolean;
  minutosVistos: number | null;
}

/** Un renglón: una persona en el período, con sus horas extra sumadas. */
export interface PersonaAprobacion {
  codigo: string;
  etiqueta: string;
  empresa: string | null;
  empresaEtiqueta: string | null;
  /** Todos sus días con extra, en orden de calendario. */
  dias: DiaDePersona[];
  /** Cuántos días le quedan SIN decidir, y cuántos minutos suman. */
  diasPendientes: number;
  minutosPendientes: number;
  /** Todos sus minutos (decididos o no). */
  minutos: number;
}

function diaDePersona(d: DiaAprobacion, g: PersonaEnDia): DiaDePersona {
  return {
    fecha: d.fecha,
    etiqueta: d.etiqueta,
    minutos: g.minutos,
    tipo: g.tipo,
    salida: g.salida,
    decision: decisionDe(g),
    por: g.por,
    cuando: g.cuando,
    cambio: g.cambio,
    minutosVistos: g.minutosVistos,
  };
}

/**
 * Persona → sus días. Devuelve TODAS las personas (con y sin pendientes):
 * `separarPorDecidir` las reparte. Más minutos pendientes arriba: si alguien
 * mira un solo renglón, que sea ése.
 */
export function agruparPorColaborador(dias: readonly DiaAprobacion[]): PersonaAprobacion[] {
  const porCodigo = new Map<string, PersonaAprobacion>();
  const orden = [...dias].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const d of orden) {
    for (const g of d.gente) {
      const p = porCodigo.get(g.codigo) ?? {
        codigo: g.codigo,
        etiqueta: g.etiqueta,
        empresa: g.empresa,
        empresaEtiqueta: g.empresaEtiqueta,
        dias: [],
        diasPendientes: 0,
        minutosPendientes: 0,
        minutos: 0,
      };
      const dd = diaDePersona(d, g);
      p.dias.push(dd);
      p.minutos += dd.minutos;
      if (dd.decision === null) {
        p.diasPendientes += 1;
        p.minutosPendientes += dd.minutos;
      }
      porCodigo.set(g.codigo, p);
    }
  }
  return [...porCodigo.values()].sort((x, y) =>
    x.minutosPendientes !== y.minutosPendientes
      ? y.minutosPendientes - x.minutosPendientes
      : x.minutos !== y.minutos
        ? y.minutos - x.minutos
        : x.etiqueta.localeCompare(y.etiqueta, "es"),
  );
}

/**
 * 🔴 POR DECIDIR arriba, YA DECIDIDAS abajo. Un renglón está por decidir mientras
 * tenga UN día sin decisión; con todos decididos (Sí, No o mezcla) se va abajo.
 */
export function separarPorDecidir(personas: readonly PersonaAprobacion[]): {
  porDecidir: PersonaAprobacion[];
  decididas: PersonaAprobacion[];
} {
  const porDecidir = personas.filter((p) => p.diasPendientes > 0);
  const decididas = personas
    .filter((p) => p.diasPendientes === 0)
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
  return { porDecidir, decididas };
}

/** «N por decidir · H:MM h» cuenta RENGLONES (colaboradores), en las dos vistas. */
export function resumenPorDecidir(dias: readonly DiaAprobacion[]): { renglones: number; minutos: number } {
  const { porDecidir } = separarPorDecidir(agruparPorColaborador(dias));
  return {
    renglones: porDecidir.length,
    minutos: porDecidir.reduce((a, p) => a + p.minutosPendientes, 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POR DÍA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Día → su gente, SOLO lo pendiente: el mismo «se decide, y el renglón se va»
 * de la otra vista. Un día que quedó sin nadie por decidir no se dibuja. Lo ya
 * decidido vive en «Ya decididas», que es la misma lista en las dos vistas.
 */
export function agruparPorDia(dias: readonly DiaAprobacion[]): DiaAprobacion[] {
  return dias
    .map((d) => {
      const gente = d.gente.filter((g) => decisionDe(g) === null);
      return { ...d, gente, minutos: gente.reduce((a, g) => a + g.minutos, 0) };
    })
    .filter((d) => d.gente.length > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SE MANDA AL TOCAR
// ─────────────────────────────────────────────────────────────────────────────

/** Los toques de una persona: solo sus días pendientes, o todos. */
export function toquesDePersona(p: PersonaAprobacion, soloPendientes: boolean): ToqueAprobacion[] {
  return p.dias
    .filter((d) => !soloPendientes || d.decision === null)
    .map((d) => ({ codigo: p.codigo, fecha: d.fecha, minutos: d.minutos }));
}

/** Los toques de un día: toda su gente (la vista por día ya trae solo lo pendiente). */
export function toquesDeDia(d: DiaAprobacion): ToqueAprobacion[] {
  return d.gente.map((g) => ({ codigo: g.codigo, fecha: d.fecha, minutos: g.minutos }));
}

/** Los toques de TODO lo pendiente del período: es «Sí a todo lo pendiente». */
export function toquesPendientes(dias: readonly DiaAprobacion[]): ToqueAprobacion[] {
  const out: ToqueAprobacion[] = [];
  for (const d of dias) for (const g of d.gente) {
    if (decisionDe(g) === null) out.push({ codigo: g.codigo, fecha: d.fecha, minutos: g.minutos });
  }
  return out;
}

/** `codigo|fecha` de cada toque, para saber qué está viajando. */
export function clavesDe(items: readonly ToqueAprobacion[]): string[] {
  return items.map((i) => claveDia(i.codigo, i.fecha));
}

// ─────────────────────────────────────────────────────────────────────────────
// CUÁNDO SE DECIDIÓ
// ─────────────────────────────────────────────────────────────────────────────

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «27 ago 15:19», en hora de Panamá (UTC−5 fijo). Vacío sin dato. */
export function cuandoBonito(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) - 5 * 3600_000);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${hh}:${mm}`;
}

/** «Decidido por Julio · 27 ago 15:19», o vacío si nadie firmó. */
export function textoFirma(por: string | null, cuando: string | null): string {
  if (!por) return "";
  const c = cuandoBonito(cuando);
  return c ? `Decidido por ${por} · ${c}` : `Decidido por ${por}`;
}
