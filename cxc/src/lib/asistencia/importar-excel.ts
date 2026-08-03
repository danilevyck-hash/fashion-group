// ─────────────────────────────────────────────────────────────────────────────
// PUENTE: marcaciones desde el Excel que exporta iVMS-4200.
//
// 🩸 POR QUÉ EXISTE. La contraseña de red del reloj se perdió (3-ago-2026) y
// recuperarla depende de Hikvision o del instalador. Mientras tanto iVMS SÍ
// tiene las marcaciones y las exporta a Excel, así que se suben a mano y el
// negocio no se queda esperando.
//
// ⚠️ NO ES TRABAJO TIRADO: escribe en la MISMA tabla que va a usar el agente
// automático, con la MISMA protección anti-duplicados. Cuando aparezca la
// contraseña, el agente empieza a llenar lo mismo y el Excel deja de hacer
// falta — sin migrar nada. Y queda como respaldo para el día que el reloj o la
// PC fallen.
//
// ── LA DECISIÓN QUE HACE QUE LAS DOS FUENTES CONVIVAN ────────────────────────
// El Excel NO trae el `serialNo` del evento, que es lo que el agente usa como
// llave. Si acá se inventara un id cualquiera (un correlativo, un random), la
// misma marcación entraría DOS VECES: una por Excel y otra por el agente, y las
// horas trabajadas saldrían dobles justo en el período de transición.
//
// Por eso el id se DERIVA DEL CONTENIDO: `empleado + instante exacto`. Es la
// identidad natural de una marcación —la misma persona no puede marcar dos
// veces en el mismo segundo— así que:
//   · subir el mismo Excel dos veces no duplica nada;
//   · subir Excels con días solapados tampoco;
//   · y cuando el agente use este mismo esquema, las dos fuentes convergen
//     solas en la misma fila.
//
// Módulo PURO: recibe filas ya leídas del Excel, devuelve filas listas. Sin
// imports de red ni de base, para poder testearlo con casos reales.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "crypto";

/** Una fila del Excel, con los encabezados tal como vengan. */
export type FilaExcel = Record<string, unknown>;

export interface MarcacionImportada {
  dispositivo: string;
  evento_id: string;
  empleado_codigo: string | null;
  empleado_nombre: string | null;
  ocurrio_en: string;
  tipo: string | null;
  raw: FilaExcel;
}

export interface ResultadoImport {
  filas: MarcacionImportada[];
  descartadas: Array<{ fila: number; motivo: string }>;
  /** Encabezados que se usaron, para mostrárselos al usuario antes de guardar. */
  columnas: { codigo: string | null; nombre: string | null; fecha: string | null; tipo: string | null };
}

// iVMS exporta con encabezados distintos según idioma y versión. En vez de
// exigir un formato exacto —que obligaría a Daniel a renombrar columnas a mano
// cada vez— se reconocen los nombres conocidos, sin acentos ni mayúsculas.
const CANDIDATOS = {
  codigo: ["no. de persona", "person no", "employee no", "employeeno", "no. empleado", "id de persona", "person id", "codigo", "código", "no"],
  nombre: ["nombre", "name", "nombre de persona", "person name", "first name"],
  fecha: ["hora de asistencia", "attendance time", "hora", "time", "fecha y hora", "date and time", "fecha", "date", "check time", "hora de marcaje"],
  tipo: ["tipo de asistencia", "attendance status", "estado", "status", "tipo", "check type", "punto de asistencia"],
} as const;

const norm = (s: unknown): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/** Elige, entre los encabezados del archivo, el que corresponde a cada campo. */
export function detectarColumnas(encabezados: readonly string[]): ResultadoImport["columnas"] {
  const elegir = (opciones: readonly string[]): string | null => {
    // Primero coincidencia exacta; después "empieza con". El orden importa:
    // "hora" coincide dentro de "hora de asistencia" y elegiría la equivocada.
    for (const o of opciones) {
      const hit = encabezados.find((h) => norm(h) === o);
      if (hit) return hit;
    }
    for (const o of opciones) {
      const hit = encabezados.find((h) => norm(h).startsWith(o));
      if (hit) return hit;
    }
    return null;
  };
  return {
    codigo: elegir(CANDIDATOS.codigo),
    nombre: elegir(CANDIDATOS.nombre),
    fecha: elegir(CANDIDATOS.fecha),
    tipo: elegir(CANDIDATOS.tipo),
  };
}

const txt = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/**
 * ⚠️ EL EXCEL NO TRAE ZONA HORARIA. Una marcación dice "03/08/2026 14:32" y eso
 * es hora de PANAMÁ, no UTC. Se le agrega el offset −05:00 explícitamente.
 *
 * Interpretarla como UTC la guardaría 5 horas antes y el reporte de horas
 * saldría mal — el mismo error que se evitó en el camino del agente.
 * Panamá es UTC−5 fijo, sin horario de verano.
 */
export function instantePanama(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // xlsx puede entregar un Date ya construido (celda con formato fecha). Ese
    // Date viene con los componentes correctos pero en la zona del servidor:
    // se reconstruye desde sus partes y se le pone el offset de Panamá.
    const p = (n: number) => String(n).padStart(2, "0");
    return fabricar(
      v.getFullYear(), v.getMonth() + 1, v.getDate(),
      v.getHours(), v.getMinutes(), v.getSeconds(),
    ) ?? `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}T00:00:00.000Z`;
  }
  const s = txt(v);
  if (!s) return null;

  // Si ya trae zona, se respeta.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  // dd/mm/yyyy o yyyy-mm-dd, con hora opcional.
  const m =
    s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/) ??
    s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    return fabricar(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  }
  const d =
    s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/) ??
    s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (d) {
    return fabricar(+d[3], +d[2], +d[1], +(d[4] ?? 0), +(d[5] ?? 0), +(d[6] ?? 0));
  }
  return null;
}

function fabricar(
  y: number, mes: number, dia: number, h: number, min: number, seg: number,
): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || h > 23 || min > 59 || seg > 59) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = `${y}-${p(mes)}-${p(dia)}T${p(h)}:${p(min)}:${p(seg)}-05:00`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * El id derivado del contenido. Ver la nota del encabezado: es lo que hace que
 * el Excel y el agente automático no dupliquen la misma marcación.
 */
export function idDeContenido(empleado: string, instante: string): string {
  return createHash("sha1").update(`${empleado}|${instante}`).digest("hex").slice(0, 32);
}

export function importarFilas(
  dispositivo: string,
  filas: readonly FilaExcel[],
  encabezados: readonly string[],
): ResultadoImport {
  const columnas = detectarColumnas(encabezados);
  const out: MarcacionImportada[] = [];
  const descartadas: ResultadoImport["descartadas"] = [];
  const vistos = new Set<string>();

  filas.forEach((f, i) => {
    const numeroFila = i + 2; // +1 por encabezado, +1 porque Excel arranca en 1
    if (!columnas.fecha) {
      descartadas.push({ fila: numeroFila, motivo: "no se encontró la columna de fecha/hora" });
      return;
    }
    const instante = instantePanama(f[columnas.fecha]);
    if (!instante) {
      descartadas.push({ fila: numeroFila, motivo: "fecha/hora vacía o no reconocida" });
      return;
    }
    const codigo = columnas.codigo ? txt(f[columnas.codigo]) : null;
    const nombre = columnas.nombre ? txt(f[columnas.nombre]) : null;
    // Sin empleado no se puede saber de quién es la marcación, y sin eso no
    // sirve para nada ni se puede deduplicar bien.
    const quien = codigo ?? nombre;
    if (!quien) {
      descartadas.push({ fila: numeroFila, motivo: "sin código ni nombre de empleado" });
      return;
    }
    const eventoId = idDeContenido(quien, instante);
    if (vistos.has(eventoId)) return; // repetida dentro del mismo archivo
    vistos.add(eventoId);

    out.push({
      dispositivo,
      evento_id: eventoId,
      empleado_codigo: codigo,
      empleado_nombre: nombre,
      ocurrio_en: instante,
      tipo: columnas.tipo ? txt(f[columnas.tipo]) : null,
      raw: f,
    });
  });

  return { filas: out, descartadas, columnas };
}
