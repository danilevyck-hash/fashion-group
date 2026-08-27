// ─────────────────────────────────────────────────────────────────────────────
// LA PLANILLA DE BOSTON, SIN EL BLOQUE DE DINERO.
//
// 🔴 EL RECORTE VA EN EL SERVIDOR, NO EN LA PANTALLA. Esconder la columna
// dejaría el sueldo viajando en el JSON, a un "ver código fuente" de distancia.
// Es la MISMA decisión —y el mismo mecanismo— que ya tomó `soloApruebaRoles()`
// para el usuario `bodega`: Julio Garay aprueba horas extra y `/api/asistencia/
// planilla` le contesta SIN el bloque de dinero.
//
// ⚠️ LA DIFERENCIA CON EL CASO DE BODEGA, y por eso hace falta este módulo:
// a `bodega` la ruta le contesta con CUATRO claves (`periodo`, `aprobaciones`,
// `puedeAprobar`, `avisos`) y NI UNA línea — le alcanza, porque su pantalla es
// la de aprobar horas. **David sí necesita las líneas**: es la planilla de las
// 21 personas de Boston, con sus horas, sus tardanzas y sus ausencias. Lo único
// que no puede viajar es la plata.
//
// 🔑 SE ENUMERA LO QUE SE QUEDA, NUNCA LO QUE SE VA. Un `delete linea.dinero`
// deja pasar cualquier campo de dinero que alguien agregue mañana; una lista de
// campos permitidos obliga a decidir sobre el campo nuevo. Es la misma regla
// que el bloque `recortado` del route ya escribió: *lo que no se nombra, no
// viaja*.
//
// 🩸 Y NO ES SOLO `dinero`: la línea lleva SEIS campos con plata adentro
// (`salarioMensual`, `baseSeguros`, `quincenalReferencia`, `extraMedido.monto`,
// `dinero`, `manuales`). Quitar solo el obvio deja el sueldo mensual en el
// JSON, que es exactamente el dato que se está protegiendo.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que queda de una línea cuando el dinero no viaja. Solo horas y estado. */
export interface LineaSinDinero {
  codigo: string;
  etiqueta: string;
  nombre: string | null;
  empresa: string | null;
  empresaEtiqueta: string | null;
  jornadaSemanal: number | null;
  horas: unknown;
  faltaConfigurar: string[];
  fueraDePlanilla: boolean;
  noMarcaReloj: boolean;
  decidirAMano: string | null;
  /** Los MINUTOS de extra, nunca su monto: de la rata sale el mensual. */
  extraMedido: { minutos: number; diurnoMin: number; nocturnoMin: number } | null;
  extraAprobada: boolean;
}

/** Los campos de la línea que SÍ viajan. La lista es el candado. */
export const CAMPOS_SIN_DINERO = [
  "codigo",
  "etiqueta",
  "nombre",
  "empresa",
  "empresaEtiqueta",
  // ⚠️ `jornadaSemanal` (40 u 48) NO es plata: es el horario contratado, y es lo
  // que explica por qué a alguien se le cuentan horas extra desde las 40.
  // `salarioMensual` sí lo es y NO está en esta lista.
  "jornadaSemanal",
  "horas",
  "faltaConfigurar",
  "fueraDePlanilla",
  "noMarcaReloj",
  "decidirAMano",
  "extraAprobada",
] as const;

/**
 * Recorta una línea de planilla a lo que puede ver quien no ve sueldos.
 *
 * 🔴 `extraMedido` se reconstruye a mano en vez de copiarse: su `monto` es una
 * DIVISIÓN que devuelve el sueldo — 5,5 h a 1,25 por $43,45 dice que la rata es
 * $6,32, y de la rata sale el mensual. Es la misma advertencia que el route ya
 * tiene escrita para el caso de `bodega`.
 */
export function lineaSinDinero(linea: Record<string, unknown>): LineaSinDinero {
  const salida: Record<string, unknown> = {};
  for (const campo of CAMPOS_SIN_DINERO) salida[campo] = linea[campo];

  const em = linea.extraMedido as { minutos?: number; diurnoMin?: number; nocturnoMin?: number } | null;
  salida.extraMedido = em
    ? { minutos: em.minutos ?? 0, diurnoMin: em.diurnoMin ?? 0, nocturnoMin: em.nocturnoMin ?? 0 }
    : null;

  return salida as unknown as LineaSinDinero;
}

/** El cuadro entero, sin una sola cifra de dinero. */
export function lineasSinDinero(lineas: readonly Record<string, unknown>[]): LineaSinDinero[] {
  return lineas.map(lineaSinDinero);
}
