// Candado de los seis ajustes «como Apple» (6-oct-2026, `AJUSTES_APPLE_6_2026_10`).
// Lo que no debe cambiar: los permisos de Pedidos, la venta y el Stock de
// Productos, y que apagado todo queda como antes.
import { describe, it, expect } from "vitest";
import fs from "fs";
import { AJUSTES_APPLE_6_2026_10 } from "@/lib/ajustes-apple-6-2026-10";
import { lineaDePendientesCorta, puedeMarcarPedidos } from "@/lib/guias/pedidos-bodega";
import { atencionMultifashion, articulosMultifashion } from "@/lib/multifashion/productos-filtros";
import type { RenglonRanking } from "@/lib/multifashion/productos-ranking";

describe("AJUSTES_APPLE_6_2026_10", () => {
  it("prendido (Daniel aprobó el 6-oct-2026)", () => {
    expect(AJUSTES_APPLE_6_2026_10).toBe(true);
  });

  it("1 · marcan los tres que preparan; el vendedor y contabilidad no", () => {
    // 🩸 7-oct-2026: el vendedor pasó a `false`. El 6-oct marcaban «todos los
    // que ven Guías», pero con bultos el servidor ya solo deja a
    // `ROLES_PREPARADO` (admin · secretaria · bodega) y el vendedor veía el
    // círculo prendido para recibir un 403.
    expect(["admin", "secretaria", "bodega", "vendedor"].map(puedeMarcarPedidos)).toEqual([true, true, true, false]);
    expect(["contabilidad", "gerente_acs", "gerente_boston", "marcacion", null].map(puedeMarcarPedidos)).toEqual([false, false, false, false, false]);
    const v = fs.readFileSync("src/app/despachos/components/PedidosView.tsx", "utf8");
    expect(v).toMatch(/if \(!puedeMarcar\) return <span/); // quien no marca ve el círculo quieto
  });

  it("2 · el título en una línea: «8 pendientes · el más viejo, 43 d»", () => {
    const hoy = "2026-10-06";
    const p = (fecha: string, estado: "pendiente" | "preparado" = "pendiente") => ({ fecha, estado });
    expect(lineaDePendientesCorta([p("2026-08-24T10:00:00-05:00"), p("2026-10-05T10:00:00-05:00"), p("2026-09-01", "preparado")], hoy))
      .toBe("2 pendientes · el más viejo, 43 d");
    expect(lineaDePendientesCorta([p("2026-10-06T08:00:00-05:00")], hoy)).toBe("1 pendiente · hoy");
    expect(lineaDePendientesCorta([], hoy)).toBe("Sin pedidos pendientes");
  });

  it("5 · «Toca para ver el detalle» solo se esconde en el celular", () => {
    for (const f of ["src/components/comisiones/ComisionesPorEmpresaView.tsx", "src/components/comisiones/ComisionesConsolidadoView.tsx"])
      expect(fs.readFileSync(f, "utf8")).toContain('AJUSTES_APPLE_6_2026_10 ? "hidden sm:flex" : "flex"');
  });

  it("6 · Sin venta en 90 días y Agotados con lo que ya se trae; la venta no cambia", () => {
    const ranking = [
      { clave: "A1", detalle: "POLO", unidades: 3, venta: 90, costo: 40 },
      { clave: "B2", detalle: "JEAN", unidades: 1, venta: 50, costo: 20 },
    ] as RenglonRanking[];
    const stock = { A1: 5, B2: 0, C3: 7, D4: 2, E5: 0 };
    const at = atencionMultifashion(
      [{ codigo: "A1" }, { codigo: " D4 " }],
      [
        { codigo: "A1", existencia: 5, articulo_id: 1, descripcion: "POLO" },
        { codigo: "B2", existencia: 0, articulo_id: 2, descripcion: "JEAN" },
        { codigo: "C3", existencia: 7, articulo_id: 3, descripcion: "GORRA" },
        { codigo: "D4", existencia: 2, articulo_id: 4, descripcion: "CORREA" },
        { codigo: "E5", existencia: 0, articulo_id: 5, descripcion: "MEDIA" },
      ],
      new Set(["A1", "B2"]),
      new Map([[3, "TH ACCESSORIES"]]),
    );
    expect(at.v90.sort()).toEqual(["A1", "D4"]);
    expect(at.solo).toEqual([["C3", "GORRA"], ["D4", "CORREA"]]); // con Stock y sin venta en el período
    const arts = articulosMultifashion(ranking, { n: [], c: {} }, stock, at);
    // La venta del período es la misma con y sin los chips.
    const sinChips = articulosMultifashion(ranking, { n: [], c: {} }, stock);
    const suma = (xs: typeof arts) => xs.reduce((s, a) => s + a.venta, 0);
    expect(suma(arts)).toBe(suma(sinChips));
    // «Sin venta en 90 días» = con Stock y sin venta en 90 días (la regla de FiltrosProductos).
    expect(arts.filter(a => (a.existencia ?? 0) > 0 && !a.vendio90).map(a => a.codigo)).toEqual(["C3"]);
    // «Agotados» = vendido en el período y sin Stock.
    expect(arts.filter(a => (a.unidades !== 0 || a.venta !== 0) && a.existencia != null && a.existencia <= 0).map(a => a.codigo)).toEqual(["B2"]);
  });
});
