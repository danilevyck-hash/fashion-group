// Los meses que FALTAN de la matriz de 12 meses de Ventas › Resumen.
//
// Hasta el 5-sep-2026 esas celdas decían «—»: la pantalla tenía la proyección
// del año entero en una columna al final y ni una pista de CÓMO se llega ahí.
// Daniel lo definió así (5-sep-2026, ver docs/estado-actual.md): los meses que
// faltan se llenan EN GRIS con la forma del año pasado × un factor.
//
// LA CUENTA, en una línea:
//
//   factor = proyeccion_restante ÷ (cierre_del_año_pasado − lo_que_el_año_pasado
//                                   llevaba_al_mismo_día_de_corte)
//   mes futuro = ese MISMO mes del año pasado × factor
//
// El divisor es exactamente lo que el año pasado vendió DESPUÉS del día de
// corte: el pedazo del mes en curso que todavía no pasó, más los meses enteros
// que vienen. Por construcción, repartir `proyeccion_restante` con ese factor
// devuelve `proyeccion_restante` — ni un centavo más ni uno menos.
//
// 🔴 EL MES EN CURSO NO SE TOCA. Su celda sigue mostrando lo VENDIDO contra los
// mismos días del año pasado (que ya es día a día). El pedazo de ese mes que
// falta entra al DIVISOR pero no se dibuja en ninguna celda; ese es el motivo
// —aceptado por Daniel— de que la fila no sume exactamente la Proyección.
// «Total» sigue siendo lo vendido y «Proyección» el año completo: son dos
// preguntas distintas y dos columnas distintas.
//
// 🔴 Y NO ES UNA FÓRMULA NUEVA: `proyeccion_restante`, `ventas_prev_ytd_sp` y
// `cierre_anio_anterior` los calcula `ventas_proyeccion_cierre_v7/v8` y ya
// viajan en el payload. Acá solo se reparten. Si la proyección cambia, estos
// meses cambian con ella, sin una segunda verdad que se desincronice.

/** Lo que hace falta para repartir el resto del año de UNA empresa. */
export interface EntradaProyeccionMensual {
  /** Los 12 meses del año anterior, COMPLETOS. `null` = ese mes no tuvo filas. */
  prevFull: (number | null)[];
  /** Lo que el año anterior llevaba vendido al MISMO día de corte. */
  ventasPrevYtdSp: number;
  /** Cierre real del año anterior (un hecho, no una estimación). */
  cierreAnioAnterior: number;
  /** Lo que falta por vender según la proyección: max(0, proyección − vendido). */
  proyeccionRestante: number;
  /** La proyección salió de la rama lineal: no hay año base contra qué repartir. */
  esFallbackLineal: boolean;
  /** Mes del día de corte, 1-12. El mes en curso NO se proyecta. */
  mesCorte: number;
}

export const MESES_DEL_ANIO = 12;

/**
 * El divisor del factor: lo que el año anterior vendió DESPUÉS del día de corte.
 * `null` cuando no se puede saber o no sirve (cero o negativo).
 */
export function restoDelAnioAnterior(e: EntradaProyeccionMensual): number | null {
  if (!(e.cierreAnioAnterior > 0)) return null;
  const resto = e.cierreAnioAnterior - e.ventasPrevYtdSp;
  return resto > 0 ? resto : null;
}

/**
 * El factor de crecimiento con el que se estira la forma del año pasado.
 * `null` cuando no hay año base utilizable — y entonces los meses que faltan se
 * quedan en «—», nunca con un número inventado.
 */
export function factorDeReparto(e: EntradaProyeccionMensual): number | null {
  if (e.esFallbackLineal) return null;
  if (!(e.proyeccionRestante > 0)) return null;
  const resto = restoDelAnioAnterior(e);
  if (resto == null) return null;
  return e.proyeccionRestante / resto;
}

/**
 * Los 12 meses, con valor SOLO en los que faltan.
 *
 * - Meses ya vividos (incluido el mes EN CURSO): `null`. Los dibuja la matriz
 *   con lo vendido de verdad.
 * - Meses futuros: el mismo mes del año pasado × el factor. Un mes que el año
 *   pasado no vendió nada da **0**, y se deja así — Daniel, 5-sep-2026
 *   (*«1. a»*): Active Wear y Joystep vendieron $0 en noviembre de 2025 y esa
 *   es la verdad de lo que hicieron, no un dato roto.
 * - Sin año base utilizable: los 12 en `null`.
 */
export function mesesProyectados(e: EntradaProyeccionMensual): (number | null)[] {
  const vacio = Array<number | null>(MESES_DEL_ANIO).fill(null);
  // Sin mes de corte (un año sin una sola venta) no hay «meses que faltan»:
  // faltarían los doce, y eso no es una proyección, es el año entero inventado.
  if (!Number.isFinite(e.mesCorte) || e.mesCorte < 1) return vacio;
  const factor = factorDeReparto(e);
  if (factor == null) return vacio;
  return vacio.map((_, i) => (i + 1 <= e.mesCorte ? null : (e.prevFull[i] ?? 0) * factor));
}

/**
 * El renglón del Total Grupo: la SUMA de lo que se proyectó por empresa, mes a
 * mes. `null` en un mes donde ninguna empresa pudo proyectar — sumar sobre las
 * que sí pudieron y presentarlo como el grupo entero sería otro número.
 */
export function mesesProyectadosDelGrupo(porEmpresa: (number | null)[][]): (number | null)[] {
  return Array.from({ length: MESES_DEL_ANIO }, (_, i) => {
    let suma = 0;
    let hay = false;
    for (const fila of porEmpresa) {
      const v = fila[i];
      if (v == null) continue;
      suma += v;
      hay = true;
    }
    return hay ? suma : null;
  });
}

/** Lo mínimo que la pantalla sabe de la proyección de UNA empresa. */
export interface ProyeccionMinima {
  ventas_prev_ytd_sp: number;
  cierre_anio_anterior: number;
  proyeccion_restante: number;
  es_fallback_lineal: boolean;
}

/**
 * La matriz entera de una sola pasada: los meses que faltan de cada empresa y
 * los del Total Grupo.
 *
 * Vive acá y no en cada pantalla a propósito: el escritorio y el celular
 * dibujan los MISMOS números, y ya pasó una vez que dos vistas del Resumen
 * calcularan lo mismo por su cuenta y divergieran.
 */
export function mesesProyectadosPorFila(
  filas: { id: string; ventasPrevFull: (number | null)[] }[],
  mesCorte: number,
  buscar: (id: string) => ProyeccionMinima | null,
): { porFila: Record<string, (number | null)[]>; grupo: (number | null)[] } {
  const porFila: Record<string, (number | null)[]> = {};
  const lista: (number | null)[][] = [];
  for (const fila of filas) {
    const p = buscar(fila.id);
    const meses = p
      ? mesesProyectados({
          prevFull: fila.ventasPrevFull ?? [],
          ventasPrevYtdSp: p.ventas_prev_ytd_sp,
          cierreAnioAnterior: p.cierre_anio_anterior,
          proyeccionRestante: p.proyeccion_restante,
          esFallbackLineal: p.es_fallback_lineal,
          mesCorte,
        })
      : Array<number | null>(MESES_DEL_ANIO).fill(null);
    porFila[fila.id] = meses;
    lista.push(meses);
  }
  return { porFila, grupo: mesesProyectadosDelGrupo(lista) };
}

/** Lo que dice la leyenda del gris. Una línea, sin párrafo. */
export const LEYENDA_MESES_PROYECTADOS =
  "En gris, lo que falta del año: cada mes es el mismo mes del año pasado ajustado por la proyección.";
