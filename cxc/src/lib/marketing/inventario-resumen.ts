// ============================================================================
// Marketing — agregación "Resumen por tienda" estilo changalo
// ============================================================================
// Puro, sin Supabase. Toma entregas + proyectos + productos y devuelve una fila
// por tienda con cantidades de Paneles repartidas entre Fashion Wear y Vistana
// y montos absorbidos por cada empresa interna.
//
// Reglas:
//   - Si la entrega tiene proyecto_id NOT NULL → tienda = proyecto.tienda
//   - Si proyecto_id IS NULL → tienda derivada de notas:
//       * "Excel changalo: <X>"  → "<X>"
//       * cualquier otro contenido → notas (trim)
//       * vacío/null → "(sin asignar)"
//   - Agrupado case-insensitive + trim para colapsar variantes.
//   - Producto "Paneles" se reconoce por nombre (case-insensitive, contiene "panel").
// ============================================================================

import type {
  EntregaConItems,
  MkInventarioProducto,
  MkProyecto,
} from "./types";

export interface FilaResumenTienda {
  /** Display name (con capitalización del primer encuentro) */
  tienda: string;
  panelesFW: number;
  panelesVistana: number;
  totalPaneles: number;
  montoFW: number;
  montoVistana: number;
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
  const notas = (e.notas ?? "").trim();
  if (notas.length > 0) {
    const m = notas.match(/^excel\s*changalo\s*:\s*(.+)$/i);
    if (m) return m[1].trim();
    return notas;
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
): FilaResumenTienda[] {
  const proyectoById = new Map(proyectos.map((p) => [p.id, p]));
  const productoById = new Map(productos.map((p) => [p.id, p]));

  // key normalizada (lowercase trim) → fila acumuladora + display name original.
  const acum = new Map<
    string,
    {
      tienda: string;
      panelesFW: number;
      panelesVistana: number;
      montoFW: number;
      montoVistana: number;
      entregas: EntregaConItems[];
    }
  >();

  for (const e of entregas) {
    const display = tiendaDeEntrega(e, proyectoById);
    const key = display.toLowerCase();
    const fila =
      acum.get(key) ??
      {
        tienda: display,
        panelesFW: 0,
        panelesVistana: 0,
        montoFW: 0,
        montoVistana: 0,
        entregas: [] as EntregaConItems[],
      };
    fila.entregas.push(e);

    // Sumar paneles por empresa desde reparto.
    for (const it of e.items) {
      const prod = productoById.get(it.producto_id);
      if (!prod || !esProductoPaneles(prod.nombre)) continue;
      for (const r of it.reparto ?? []) {
        const cant = Number(r.cantidad ?? 0);
        if (!Number.isFinite(cant) || cant <= 0) continue;
        if (r.empresa === "fashion_wear") fila.panelesFW += cant;
        else if (r.empresa === "vistana") fila.panelesVistana += cant;
      }
    }

    // Sumar montos por empresa desde el snapshot total_por_empresa_interna.
    const tpe = e.total_por_empresa_interna ?? {};
    fila.montoFW += Number(tpe.fashion_wear ?? 0);
    fila.montoVistana += Number(tpe.vistana ?? 0);

    acum.set(key, fila);
  }

  const filas: FilaResumenTienda[] = [];
  for (const v of acum.values()) {
    filas.push({
      tienda: v.tienda,
      panelesFW: v.panelesFW,
      panelesVistana: v.panelesVistana,
      totalPaneles: v.panelesFW + v.panelesVistana,
      montoFW: round2(v.montoFW),
      montoVistana: round2(v.montoVistana),
      totalMonto: round2(v.montoFW + v.montoVistana),
      entregas: v.entregas,
    });
  }

  // Ordenar: tiendas asignadas (con proyecto) primero por nombre, "(sin asignar)"
  // al final. Mantener case-insensitive por display.
  filas.sort((a, b) => {
    if (a.tienda === SIN_ASIGNAR && b.tienda !== SIN_ASIGNAR) return 1;
    if (b.tienda === SIN_ASIGNAR && a.tienda !== SIN_ASIGNAR) return -1;
    return a.tienda.localeCompare(b.tienda, "es");
  });
  return filas;
}
