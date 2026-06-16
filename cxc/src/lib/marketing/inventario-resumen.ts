// ============================================================================
// Marketing — agregación "Resumen por tienda" (por marca)
// ============================================================================
// Puro, sin Supabase. Toma entregas + proyectos + productos + marcas y devuelve
// una fila por tienda con el total de Paneles y el monto (al 100%) por marca.
//
// Registro de gastos (jun 2026): se retiró el reparto 50/50 marca↔empresa
// (FW/Vistana). El monto por marca = total_por_marca + el interno pareja de esa
// marca (total_por_empresa_interna[empresa_codigo]) — así las entregas viejas
// (50/50) y nuevas (100%) cuadran al gasto completo de cada marca.
//
// Reglas:
//   - tienda = proyecto.tienda (toda entrega va atada a un proyecto).
//   - Producto "Paneles" se reconoce por nombre (contiene "panel").
//   - Agrupado case-insensitive + trim para colapsar variantes.
// ============================================================================

import type {
  EntregaConItems,
  MkInventarioProducto,
  MkMarca,
  MkProyecto,
} from "./types";

export interface FilaResumenTienda {
  /** Display name (con capitalización del primer encuentro) */
  tienda: string;
  totalPaneles: number;
  /** marcaId → monto (al 100%) */
  montoPorMarca: Record<string, number>;
  totalMonto: number;
  /** Entregas que entraron en esta fila (para hojas de detalle del Excel) */
  entregas: EntregaConItems[];
}

const SIN_ASIGNAR = "(sin asignar)";

function tiendaDeEntrega(
  e: EntregaConItems,
  proyectoById: Map<string, MkProyecto>,
): string {
  if (e.proyecto_id) {
    const p = proyectoById.get(e.proyecto_id);
    if (p && p.tienda) return p.tienda;
  }
  return SIN_ASIGNAR;
}

function esProductoPaneles(nombre: string): boolean {
  return /panel/i.test(nombre);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function resumirPorTienda(
  entregas: ReadonlyArray<EntregaConItems>,
  proyectos: ReadonlyArray<MkProyecto>,
  productos: ReadonlyArray<MkInventarioProducto>,
  marcas: ReadonlyArray<MkMarca>,
): { filas: FilaResumenTienda[]; marcas: MkMarca[] } {
  const proyectoById = new Map(proyectos.map((p) => [p.id, p]));
  const productoById = new Map(productos.map((p) => [p.id, p]));
  const empresaByMarca = new Map(marcas.map((m) => [m.id, m.empresa_codigo]));
  const marcaById = new Map(marcas.map((m) => [m.id, m]));

  const acum = new Map<
    string,
    {
      tienda: string;
      totalPaneles: number;
      montoPorMarca: Record<string, number>;
      entregas: EntregaConItems[];
    }
  >();
  const marcasUsadas = new Set<string>();

  for (const e of entregas) {
    const display = tiendaDeEntrega(e, proyectoById);
    const key = display.toLowerCase();
    const fila =
      acum.get(key) ??
      {
        tienda: display,
        totalPaneles: 0,
        montoPorMarca: {} as Record<string, number>,
        entregas: [] as EntregaConItems[],
      };
    fila.entregas.push(e);

    // Total de paneles (cualquier marca).
    for (const it of e.items) {
      const prod = productoById.get(it.producto_id);
      if (!prod || !esProductoPaneles(prod.nombre)) continue;
      for (const r of it.reparto ?? []) {
        const cant = Number(r.cantidad ?? 0);
        if (Number.isFinite(cant) && cant > 0) fila.totalPaneles += cant;
      }
    }

    // Monto por marca = total_por_marca + interno pareja (entregas viejas 50/50).
    const tpm = e.total_por_marca ?? {};
    const tpe = e.total_por_empresa_interna ?? {};
    for (const [marcaId, v] of Object.entries(tpm)) {
      const emp = empresaByMarca.get(marcaId);
      const interna = emp && tpe[emp] ? Number(tpe[emp]) : 0;
      const monto = Number(v) + interna;
      fila.montoPorMarca[marcaId] = (fila.montoPorMarca[marcaId] ?? 0) + monto;
      if (monto !== 0) marcasUsadas.add(marcaId);
    }

    acum.set(key, fila);
  }

  const filas: FilaResumenTienda[] = [];
  for (const v of acum.values()) {
    const montoPorMarca: Record<string, number> = {};
    let totalMonto = 0;
    for (const [mid, m] of Object.entries(v.montoPorMarca)) {
      montoPorMarca[mid] = round2(m);
      totalMonto += m;
    }
    filas.push({
      tienda: v.tienda,
      totalPaneles: v.totalPaneles,
      montoPorMarca,
      totalMonto: round2(totalMonto),
      entregas: v.entregas,
    });
  }

  filas.sort((a, b) => {
    if (a.tienda === SIN_ASIGNAR && b.tienda !== SIN_ASIGNAR) return 1;
    if (b.tienda === SIN_ASIGNAR && a.tienda !== SIN_ASIGNAR) return -1;
    return a.tienda.localeCompare(b.tienda, "es");
  });

  const marcasOrden = Array.from(marcasUsadas)
    .map((id) => marcaById.get(id))
    .filter((m): m is MkMarca => !!m)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return { filas, marcas: marcasOrden };
}
