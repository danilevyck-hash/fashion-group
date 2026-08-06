// ─────────────────────────────────────────────────────────────────────────────
// Normalización de las marcaciones que manda el agente local.
//
// Módulo PURO (sin imports): recibe lo que devolvió el reloj y devuelve filas
// listas para guardar. Se testea sin base y sin red.
//
// El agente NO limpia nada: manda el evento tal como salió del reloj. Toda la
// interpretación vive acá, en un solo lugar, para que el día que Hikvision
// cambie un nombre de campo haya un archivo que tocar y un test que lo diga.
// ─────────────────────────────────────────────────────────────────────────────

/** Un evento crudo de ISAPI `AcsEvent`. Los nombres son los de Hikvision. */
export interface EventoCrudo {
  serialNo?: number | string;
  time?: string;
  employeeNoString?: string | number;
  name?: string;
  attendanceStatus?: string;
  [k: string]: unknown;
}

export interface MarcacionNormalizada {
  dispositivo: string;
  evento_id: string;
  empleado_codigo: string | null;
  empleado_nombre: string | null;
  ocurrio_en: string;
  tipo: string | null;
  raw: EventoCrudo;
}

export interface ResultadoNormalizacion {
  filas: MarcacionNormalizada[];
  /** Eventos que no se pudieron usar, con el motivo. NUNCA se descartan callados. */
  descartados: Array<{ motivo: string; evento: EventoCrudo }>;
}

const txt = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/**
 * ⚠️ La hora se conserva TAL CUAL la manda el reloj, con su offset.
 *
 * El reloj envía ISO 8601 con zona (ej. `2026-08-03T14:32:10-05:00`). Postgres
 * lo guarda como instante y la pantalla lo muestra en hora de Panamá. Lo que NO
 * se hace es recortar el offset y suponer: una marcación de las 14:32 leída como
 * UTC se mostraría a las 09:32 y el reporte de horas saldría mal por 5 horas.
 */
function instanteValido(v: unknown): string | null {
  const s = txt(v);
  if (!s) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function normalizarEventos(
  dispositivo: string,
  eventos: readonly EventoCrudo[],
): ResultadoNormalizacion {
  const filas: MarcacionNormalizada[] = [];
  const descartados: ResultadoNormalizacion["descartados"] = [];
  // Un mismo lote puede repetir un evento si el agente pidió rangos que se
  // solapan. Se dedup acá además de en la base: el upsert de PostgREST falla si
  // el MISMO lote trae la llave dos veces.
  const vistos = new Set<string>();

  for (const ev of eventos) {
    const eventoId = txt(ev.serialNo);
    if (!eventoId) {
      // Sin `serialNo` no hay forma de evitar duplicarlo mañana. Guardarlo sería
      // peor que perderlo: inflaría las horas en cada repaso nocturno.
      descartados.push({ motivo: "sin serialNo (no se puede evitar duplicarlo)", evento: ev });
      continue;
    }
    const ocurrio = instanteValido(ev.time);
    if (!ocurrio) {
      descartados.push({ motivo: "fecha/hora inválida o ausente", evento: ev });
      continue;
    }
    // 🩸 SIN CÓDIGO DE EMPLEADO NO ES UNA MARCACIÓN DE NADIE (6-ago-2026).
    //
    // Medido al cargar julio entero desde el reloj real: de 8.785 eventos,
    // **5.845 (el 66%) vienen sin `employeeNoString`**. Son huellas que el
    // lector no reconoció, puertas abiertas desde adentro y eventos del propio
    // aparato. Guardarlos llenaba la tabla de filas con la persona en blanco
    // que no le suman a nadie y que en el reporte solo estorban.
    //
    // Se DESCARTAN con motivo, no en silencio: si algún día el reloj dejara de
    // mandar el código de TODO el mundo, el conteo de descartados lo grita en
    // vez de dejar la asistencia vacía sin explicación.
    const codigo = txt(ev.employeeNoString);
    if (!codigo) {
      descartados.push({ motivo: "sin código de empleado (nadie identificado)", evento: ev });
      continue;
    }
    if (vistos.has(eventoId)) continue;
    vistos.add(eventoId);

    filas.push({
      dispositivo,
      evento_id: eventoId,
      empleado_codigo: codigo,
      empleado_nombre: txt(ev.name),
      ocurrio_en: ocurrio,
      tipo: txt(ev.attendanceStatus),
      raw: ev,
    });
  }

  return { filas, descartados };
}

/** El instante más nuevo del lote — el agente lo usa como punto de partida. */
export function ultimoInstante(filas: readonly MarcacionNormalizada[]): string | null {
  let max: string | null = null;
  for (const f of filas) if (!max || f.ocurrio_en > max) max = f.ocurrio_en;
  return max;
}
