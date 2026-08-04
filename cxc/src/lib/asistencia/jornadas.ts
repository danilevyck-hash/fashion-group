// ─────────────────────────────────────────────────────────────────────────────
// De marcaciones sueltas a JORNADAS (día por empleado, con horas trabajadas).
//
// Una lista cruda de marcaciones no le sirve a nadie: lo que se mira es "quién
// vino, a qué hora entró y salió, y cuántas horas hizo". Este módulo hace esa
// traducción.
//
// ⚠️ SE ASUME LO MENOS POSIBLE. El reloj puede o no distinguir entrada de
// salida (`attendanceStatus` viene vacío en muchas configuraciones), así que NO
// se depende de ese campo: se toma la PRIMERA marcación del día como entrada y
// la ÚLTIMA como salida. Es lo que hace cualquier planilla, y funciona igual si
// el equipo etiqueta o no.
//
// ⚠️ EL DÍA SE CORTA EN PANAMÁ (UTC−5 fijo). Agrupar por el día UTC pondría
// todo lo marcado después de las 7 p.m. en el día siguiente.
//
// Módulo PURO: sin base, sin red, testeable con horas fijas.
// ─────────────────────────────────────────────────────────────────────────────

const PANAMA_OFFSET_MS = 5 * 60 * 60 * 1000;

export interface MarcacionCruda {
  empleado_codigo: string | null;
  empleado_nombre: string | null;
  ocurrio_en: string;
  tipo: string | null;
}

export interface Jornada {
  /** Día calendario de Panamá, YYYY-MM-DD. */
  dia: string;
  empleadoCodigo: string | null;
  empleadoNombre: string | null;
  /** Primera y última marcación del día, en ISO. */
  entrada: string;
  salida: string | null;
  /** Todas las marcaciones del día, ordenadas. */
  marcaciones: string[];
  /** Horas entre la primera y la última. `null` si solo hay una marcación. */
  horas: number | null;
  /** true si el día tiene UNA sola marcación: entró y no marcó salida (o al revés). */
  incompleta: boolean;
}

/** El día-calendario de Panamá de un instante. */
export function diaPanama(iso: string): string {
  return new Date(Date.parse(iso) - PANAMA_OFFSET_MS).toISOString().slice(0, 10);
}

/** La hora HH:MM de Panamá de un instante. */
export function horaPanama(iso: string): string {
  const d = new Date(Date.parse(iso) - PANAMA_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function armarJornadas(marcaciones: readonly MarcacionCruda[]): Jornada[] {
  // Llave: empleado + día. El código manda; si no hay, se usa el nombre — pero
  // NO se mezclan: dos empleados sin código y con el mismo nombre son el mismo
  // renglón, y eso es preferible a inventarles identidades distintas.
  const porClave = new Map<string, MarcacionCruda[]>();
  for (const m of marcaciones) {
    if (!m.ocurrio_en) continue;
    const quien = m.empleado_codigo ?? m.empleado_nombre ?? "?";
    const clave = `${quien}|${diaPanama(m.ocurrio_en)}`;
    const lista = porClave.get(clave);
    if (lista) lista.push(m);
    else porClave.set(clave, [m]);
  }

  const out: Jornada[] = [];
  for (const lista of porClave.values()) {
    const ord = [...lista].sort((a, b) => a.ocurrio_en.localeCompare(b.ocurrio_en));
    const primera = ord[0];
    const ultima = ord[ord.length - 1];
    const sola = ord.length === 1;
    // Redondeo a 2 decimales: 8.333333 horas no le dice nada a nadie.
    const horas = sola
      ? null
      : Math.round(((Date.parse(ultima.ocurrio_en) - Date.parse(primera.ocurrio_en)) / 3_600_000) * 100) / 100;

    out.push({
      dia: diaPanama(primera.ocurrio_en),
      empleadoCodigo: primera.empleado_codigo,
      // El nombre puede faltar en unas filas y venir en otras: se toma el
      // primero que exista para no mostrar "—" cuando el dato sí está.
      empleadoNombre: ord.find((m) => m.empleado_nombre)?.empleado_nombre ?? null,
      entrada: primera.ocurrio_en,
      salida: sola ? null : ultima.ocurrio_en,
      marcaciones: ord.map((m) => m.ocurrio_en),
      horas,
      incompleta: sola,
    });
  }

  // Lo más reciente primero, y dentro del día por nombre para que sea estable.
  return out.sort(
    (a, b) =>
      b.dia.localeCompare(a.dia) ||
      (a.empleadoNombre ?? a.empleadoCodigo ?? "").localeCompare(b.empleadoNombre ?? b.empleadoCodigo ?? ""),
  );
}

export interface ResumenJornadas {
  dias: number;
  empleados: number;
  horasTotales: number;
  incompletas: number;
}

export function resumir(jornadas: readonly Jornada[]): ResumenJornadas {
  const dias = new Set<string>();
  const empleados = new Set<string>();
  let horas = 0;
  let incompletas = 0;
  for (const j of jornadas) {
    dias.add(j.dia);
    empleados.add(j.empleadoCodigo ?? j.empleadoNombre ?? "?");
    horas += j.horas ?? 0;
    if (j.incompleta) incompletas++;
  }
  return {
    dias: dias.size,
    empleados: empleados.size,
    horasTotales: Math.round(horas * 100) / 100,
    incompletas,
  };
}
