// ─────────────────────────────────────────────────────────────────────────────
// EL MISMO NÚMERO EN DOS RELOJES ES DOS PERSONAS (11-nov-2026). Módulo PURO.
//
// 🩸 LO QUE PASÓ. El motor agrupa las marcas SOLO por `empleado_codigo`, y el
// número del reloj no es único entre aparatos: el 5 del reloj de Boston es
// Jorman (ficha 5, Vistana) y el 5 del reloj de Multifashion es Silenys,
// colaboradora nueva sin ficha. Medido el 11-nov-2026: 114 marcas de Silenys
// (1-oct → 2-nov) cayeron en los días de Jorman; la contadora «quitó» 57 de
// ellas a mano, una por una, y sus horas extra de octubre se aprobaron con las
// dos personas mezcladas.
//
// 🔴 LA REGLA. Un mapeo escrito a mano, `(reloj, número) → colaborador`
// (`asistencia_codigo_por_reloj`): si el par está en el mapeo, la marca es de
// ese colaborador; si no, es del número tal cual, como siempre. Se aplica al
// LEER, en una copia: la fila de `asistencia_marcaciones` no se edita ni se
// borra (append-only, con barrido). Las correcciones siguen atadas por `id`,
// así que viajan con la marca a su dueño.
//
// 🔑 UN SOLO LUGAR. Todo lector de marcas pasa por `conCodigoPorReloj` antes de
// agrupar: Reporte, Planilla, «quién marcó», Horarios, Configuración, la ficha
// de una persona, la quincena del teléfono y la validación de una corrección.
// El interruptor vive en el lector del servidor (`leerMapaDeReloj`): apagado,
// el mapa viene vacío y esta función devuelve la MISMA lista que recibió.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 `false` = exactamente lo de hoy: nadie consulta la tabla y nada se mueve.
 *  Se prende DESPUÉS de aplicar la migración y cargar las filas del mapeo. */
export const MARCAS_POR_RELOJ_Y_NUMERO = false;

export const TABLA_CODIGO_POR_RELOJ = "asistencia_codigo_por_reloj";
export const MIGRACION_CODIGO_POR_RELOJ = "20270111120000_asistencia_codigo_por_reloj.sql";

/** Una fila del mapeo, tal como se lee. */
export interface AliasDeReloj {
  dispositivo: string;
  codigo_reloj: string;
  empleado_codigo: string;
}

/** `dispositivo|codigo_reloj` → `empleado_codigo`. */
export type MapaDeReloj = ReadonlyMap<string, string>;

export const SIN_MAPA: MapaDeReloj = new Map();

export function llaveDeReloj(dispositivo: string | null | undefined, codigoReloj: string | null | undefined): string {
  return `${String(dispositivo ?? "").trim()}|${String(codigoReloj ?? "").trim()}`;
}

export function armarMapaDeReloj(filas: readonly AliasDeReloj[]): MapaDeReloj {
  const m = new Map<string, string>();
  for (const f of filas) {
    const a = String(f.empleado_codigo ?? "").trim();
    if (!a) continue;
    m.set(llaveDeReloj(f.dispositivo, f.codigo_reloj), a);
  }
  return m;
}

/**
 * La lista con el código RESUELTO. Copia solo las filas que cambian; con el mapa
 * vacío devuelve la misma lista que entró (ni copia ni toca nada).
 * Una marca sin `dispositivo` (agregada a mano) nunca se mueve.
 */
export function conCodigoPorReloj<T extends { empleado_codigo: string | null; dispositivo?: string | null }>(
  filas: readonly T[],
  mapa: MapaDeReloj,
): T[] {
  if (mapa.size === 0) return filas as T[];
  return filas.map((f) => {
    if (!f.dispositivo) return f;
    const a = mapa.get(llaveDeReloj(f.dispositivo, f.empleado_codigo));
    return a === undefined ? f : { ...f, empleado_codigo: a };
  });
}

/**
 * Qué códigos crudos hay que PEDIR a la base para ver a una persona: el suyo
 * más los números de reloj que le pertenecen. Quien lo use filtra después con
 * `conCodigoPorReloj`, porque el mismo número crudo puede ser de otro en otro
 * reloj.
 */
export function codigosQueCaenEn(codigo: string, mapa: MapaDeReloj): string[] {
  const c = String(codigo ?? "").trim();
  const out = new Set<string>([c]);
  for (const [llave, a] of mapa) {
    if (a === c) out.add(llave.slice(llave.indexOf("|") + 1));
  }
  return [...out];
}
