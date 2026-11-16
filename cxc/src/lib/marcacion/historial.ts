// ─────────────────────────────────────────────────────────────────────────────
// «MIS MARCACIONES» — la tabla de la quincena (16-nov-2026, aprobado por Daniel).
//
// Módulo PURO: sin base, sin red, sin `new Date()`. Recibe las marcas YA
// CORREGIDAS (`leerMarcasEfectivas`, el mismo orden que la planilla) y arma
// Día · Entrada · Almuerzo · Regreso · Salida. Solo horas: ni tardanzas ni plata.
//
//   · Los días sin marcas no salen.
//   · Un día YA CERRADO con menos de 4 marcas lleva «Falta una marca». Hoy no:
//     el día va corriendo.
//   · La historia empieza el 1-jul-2026 (`PRIMERA_QUINCENA`).
//
// 🔴 El botón de marcar NO lee esto: sigue con las horas del reloj
// (`estado-server.ts`). Son dos lecturas a propósito.
// ─────────────────────────────────────────────────────────────────────────────

import { diaCorto, diaPanamaDe, enDoceHoras, horaCorta, quincenaDeHoy, type MarcaSimple } from "./marcacion";

/** La primera quincena que se puede mirar. */
export const PRIMERA_QUINCENA = "2026-07-01";

export const TEXTO_FALTA_UNA_MARCA = "Falta una marca";

export interface Quincena {
  desde: string;
  hasta: string;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `2026-11-16` → `2026-11-2` (la clave que viaja en la URL). */
export function claveDeQuincena(q: Quincena): string {
  return `${q.desde.slice(0, 7)}-${Number(q.desde.slice(8, 10)) <= 15 ? 1 : 2}`;
}

/** `2026-11-2` → la quincena; cualquier otra cosa → `null`. */
export function quincenaDeClave(clave: string | null | undefined): Quincena | null {
  const m = /^(\d{4})-(\d{2})-([12])$/.exec(String(clave ?? "").trim());
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return quincenaDeHoy(`${m[1]}-${m[2]}-${m[3] === "1" ? "01" : "16"}`);
}

/** La quincena de antes. */
export function quincenaAnterior(q: Quincena): Quincena {
  const [a, m, d] = q.desde.split("-").map(Number);
  if (d === 16) return quincenaDeHoy(`${a}-${String(m).padStart(2, "0")}-01`);
  const prev = new Date(Date.UTC(a, m - 2, 16));
  return quincenaDeHoy(prev.toISOString().slice(0, 10));
}

/** La quincena de después. */
export function quincenaSiguiente(q: Quincena): Quincena {
  const [a, m, d] = q.hasta.split("-").map(Number);
  return quincenaDeHoy(new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10));
}

/**
 * La quincena que se pide, dentro de lo que se puede mirar: ni antes del
 * 1-jul-2026 ni después de la de hoy. Una clave mala = la de hoy.
 */
export function quincenaPedida(clave: string | null | undefined, hoy: string): Quincena {
  const actual = quincenaDeHoy(hoy);
  const q = quincenaDeClave(clave);
  if (!q || q.desde > actual.desde) return actual;
  if (q.desde < PRIMERA_QUINCENA) return quincenaDeHoy(PRIMERA_QUINCENA);
  return q;
}

/** «Esta quincena (16–30 nov)» · «Quincena anterior (1–15 nov)» · «16–31 oct». */
export function rotuloDelHistorial(q: Quincena, hoy: string): string {
  const mes = MESES_CORTOS[Number(q.desde.slice(5, 7)) - 1];
  const rango = `${Number(q.desde.slice(8, 10))}–${Number(q.hasta.slice(8, 10))} ${mes}`;
  const actual = quincenaDeHoy(hoy);
  if (q.desde === actual.desde) return `Esta quincena (${rango})`;
  if (q.desde === quincenaAnterior(actual).desde) return `Quincena anterior (${rango})`;
  return rango;
}

export interface FilaHistorial {
  fecha: string;
  /** «Lun 16» */
  dia: string;
  entrada: string | null;
  almuerzo: string | null;
  regreso: string | null;
  salida: string | null;
  /** Día cerrado con menos de 4 marcas. */
  faltaMarca: boolean;
}

/** «13:06» → «1:06», como en el mockup: 12 h sin «a. m.» (la columna ya dice qué es). */
function horaDeTabla(hhmm: string): string {
  return enDoceHoras(hhmm).replace(/ [ap]\. m\.$/, "");
}

/** Un renglón por día CON marcas, el más reciente arriba. */
export function filasDelHistorial(marcas: readonly MarcaSimple[], hoy: string): FilaHistorial[] {
  const porDia = new Map<string, number[]>();
  for (const m of marcas) {
    const t = Date.parse(m.ocurrioEn);
    if (!Number.isFinite(t)) continue;
    const dia = diaPanamaDe(m.ocurrioEn);
    porDia.set(dia, [...(porDia.get(dia) ?? []), t]);
  }
  return [...porDia.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([fecha, ts]) => {
      const h = ts
        .slice()
        .sort((x, y) => x - y)
        .map((t) => horaDeTabla(horaCorta(new Date(t).toISOString())));
      return {
        fecha,
        dia: diaCorto(fecha),
        entrada: h[0] ?? null,
        almuerzo: h[1] ?? null,
        regreso: h[2] ?? null,
        // Con más de 4 (un día del reloj a revisar), la salida es la última.
        salida: h.length >= 4 ? h[h.length - 1] : null,
        faltaMarca: h.length < 4 && fecha < hoy,
      };
    });
}
