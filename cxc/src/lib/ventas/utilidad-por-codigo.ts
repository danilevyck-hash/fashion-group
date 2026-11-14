// ─────────────────────────────────────────────────────────────────────────────
// La utilidad de UN cliente en la lista de Ventas › Clientes (revisión 110,
// mockup ventas-clientes-rec-c, 14-nov-2026).
//
// 🔴 NO SE CALCULA NADA NUEVO: es la SUMA de las filas que ya trae la vista
// Utilidad (una por cliente Y empresa) para ese código. El margen es la misma
// cuenta que hace el servidor por fila — utilidad ÷ venta CON costo — sobre
// esas sumas. Una fila sin código no se le pega a nadie: el cliente sale sin
// la línea, igual que los que no tienen dato de utilidad.
// ─────────────────────────────────────────────────────────────────────────────

import type { UtilidadClienteRow } from "./utilidad-cliente";

export interface UtilidadDelCliente {
  utilidad: number;
  margen: number | null;
  /** Las filas por empresa, para la hoja del cliente. */
  porEmpresa: UtilidadClienteRow[];
}

/** Agrupa por código; con `empresa` distinta de «todas», solo esa empresa. */
export function utilidadPorCodigo(
  rows: readonly UtilidadClienteRow[] | null | undefined,
  empresa: string = "todas",
): Map<string, UtilidadDelCliente> {
  const acc = new Map<string, { utilidad: number; base: number; porEmpresa: UtilidadClienteRow[] }>();
  for (const r of rows ?? []) {
    const codigo = r.codigo?.trim();
    if (!codigo) continue;
    if (empresa !== "todas" && r.empresaKey !== empresa) continue;
    const a = acc.get(codigo) ?? { utilidad: 0, base: 0, porEmpresa: [] };
    a.utilidad += r.utilidad;
    a.base += r.ventasConCosto ?? r.ventas;
    a.porEmpresa.push(r);
    acc.set(codigo, a);
  }
  const out = new Map<string, UtilidadDelCliente>();
  for (const [codigo, a] of acc) {
    out.set(codigo, {
      utilidad: a.utilidad,
      margen: a.base > 0 ? a.utilidad / a.base : null,
      porEmpresa: [...a.porEmpresa].sort((x, y) => y.ventas - x.ventas),
    });
  }
  return out;
}
