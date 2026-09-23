// ============================================================================
// Marketing — LOS GASTOS DE UN PERÍODO, AGRUPADOS POR TIENDA. Módulo PURO.
//
// El período de una marca se lee por TIENDA (código del directorio) y el
// cajón «General» junta lo que no es de ninguna: impulsadoras, muebles de
// Boston, material de la marca. Daniel (22-sep-2026): *«a) Basta la tienda»*
// — el proyecto se fue, así que acá no existe `proyecto_id`, y hay candado.
//
// Cada grupo trae DOS totales separados: lo que se reporta y lo que no. No se
// suman entre sí, y el total del período es la suma de los REPORTADOS.
// ============================================================================

import { rotuloTienda, TIENDA_GENERAL } from "./gasto";
import { sumaEnElPeriodo } from "./periodo-estado";

/** Lo mínimo de un gasto para agruparlo. */
export interface GastoAgrupable {
  id: string;
  tiendaCodigo: string | null;
  /** Nombre de la tienda para mostrar, si se conoce. */
  tiendaNombre?: string | null;
  monto: number;
  seReporta?: boolean | null;
}

export interface GrupoPorTienda<T extends GastoAgrupable = GastoAgrupable> {
  /** Código del directorio, o `null` para «General». */
  tiendaCodigo: string | null;
  /** Lo que se dibuja: el nombre si vino, si no el código, si no «General». */
  rotulo: string;
  gastos: T[];
  totalReportado: number;
  totalNoReportado: number;
  cantidadReportada: number;
  cantidadNoReportada: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Agrupa por `tiendaCodigo`. Orden: las tiendas por total reportado de mayor
 * a menor (empate: por rótulo), y «General» SIEMPRE al final.
 */
export function agruparPorTienda<T extends GastoAgrupable>(
  gastos: ReadonlyArray<T>,
): GrupoPorTienda<T>[] {
  const grupos = new Map<string, GrupoPorTienda<T>>();
  for (const g of gastos) {
    const codigo = String(g.tiendaCodigo ?? "").trim().toUpperCase();
    const clave = codigo.length > 0 ? codigo : TIENDA_GENERAL;
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = {
        tiendaCodigo: codigo.length > 0 ? codigo : null,
        rotulo: codigo.length > 0 ? codigo : rotuloTienda(null),
        gastos: [],
        totalReportado: 0,
        totalNoReportado: 0,
        cantidadReportada: 0,
        cantidadNoReportada: 0,
      };
      grupos.set(clave, grupo);
    }
    const nombre = String(g.tiendaNombre ?? "").trim();
    if (codigo.length > 0 && nombre.length > 0) grupo.rotulo = nombre;
    grupo.gastos.push(g);
    const monto = Number(g.monto);
    if (!Number.isFinite(monto)) continue;
    if (sumaEnElPeriodo(g)) {
      grupo.totalReportado += monto;
      grupo.cantidadReportada += 1;
    } else {
      grupo.totalNoReportado += monto;
      grupo.cantidadNoReportada += 1;
    }
  }
  const lista = [...grupos.values()].map((gr) => ({
    ...gr,
    totalReportado: round2(gr.totalReportado),
    totalNoReportado: round2(gr.totalNoReportado),
  }));
  lista.sort((a, b) => {
    if (a.tiendaCodigo === null) return 1;
    if (b.tiendaCodigo === null) return -1;
    return b.totalReportado - a.totalReportado || a.rotulo.localeCompare(b.rotulo, "es");
  });
  return lista;
}

/** El total del período: la suma de lo REPORTADO de todos los grupos. */
export function totalReportadoDe(grupos: ReadonlyArray<GrupoPorTienda>): number {
  return round2(grupos.reduce((s, g) => s + g.totalReportado, 0));
}
