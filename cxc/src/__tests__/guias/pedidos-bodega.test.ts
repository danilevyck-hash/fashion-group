// Candado de Guías › «Pedidos» (5-oct-2026, `PEDIDOS_BODEGA_2026_10`).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  CODIGOS_EXCLUIDOS,
  ESTADOS_PEDIDO,
  PEDIDOS_BODEGA_2026_10,
  diasDesde,
  fechaSwitchAIso,
  lineaDePendientes,
  ordenarPedidos,
  pedidoEntra,
  puedeVerPedidosBodega,
} from "@/lib/guias/pedidos-bodega";

const leer = (p: string) => fs.readFileSync(path.resolve(__dirname, "../../..", p), "utf8");

describe("pedidos de bodega — reglas de Daniel", () => {
  it("nace APAGADO hasta su «sí»", () => {
    expect(PEDIDOS_BODEGA_2026_10).toBe(false);
    expect(puedeVerPedidosBodega("admin")).toBe(false);
  });

  it("SOLO dos estados", () => {
    expect([...ESTADOS_PEDIDO]).toEqual(["pendiente", "preparado"]);
  });

  it("fuera TCKCTA, 12188 y quien no tiene ficha; por CÓDIGO", () => {
    const fichas = new Set(["D-25", "TCKCTA", "12188"]);
    expect([...CODIGOS_EXCLUIDOS]).toEqual(["TCKCTA", "12188"]);
    expect(pedidoEntra("D-25", fichas)).toBe(true);
    expect(pedidoEntra(" d-25 ", fichas)).toBe(true);
    expect(pedidoEntra("TCKCTA", fichas)).toBe(false);
    expect(pedidoEntra("12188", fichas)).toBe(false);
    expect(pedidoEntra("D-80", fichas)).toBe(false);
    expect(pedidoEntra(undefined, fichas)).toBe(false);
  });

  it("del más viejo al más nuevo", () => {
    const r = ordenarPedidos([
      { fecha: "2026-10-02T11:00:00-05:00", secuencial: "B" },
      { fecha: "2026-08-24T16:00:00-05:00", secuencial: "A" },
    ]);
    expect(r.map((x) => x.secuencial)).toEqual(["A", "B"]);
  });

  it("la línea de arriba cuenta solo los pendientes y dice el más viejo", () => {
    const rows = [
      { fecha: "2026-09-10T10:00:00-05:00", estado: "pendiente" as const },
      { fecha: "2026-08-24T16:00:00-05:00", estado: "preparado" as const },
      { fecha: "2026-10-02T11:00:00-05:00", estado: "pendiente" as const },
    ];
    expect(lineaDePendientes(rows, "2026-10-05")).toBe("2 pedidos pendientes · el más viejo, hace 25 días");
    expect(lineaDePendientes([], "2026-10-05")).toBe("Sin pedidos pendientes");
    expect(diasDesde("2026-10-05T23:30:00-05:00", "2026-10-05")).toBe(0);
  });

  it("la fecha de Switch es hora de Panamá", () => {
    expect(fechaSwitchAIso("2026-10-05 12:03:11")).toBe("2026-10-05T12:03:11-05:00");
  });

  it("sin enlace a Etiquetas ni a Guías en la pantalla", () => {
    const src = leer("src/app/guias/components/PedidosView.tsx");
    expect(src).not.toMatch(/href=|router\.push|<Link|"\/guias/);
  });

  it("el sync nunca escribe lo que marcó bodega; la ruta no abre Switch", () => {
    expect(leer("src/lib/switch-api/sync-pedidos.ts")).not.toContain('from("pedidos_bodega_estado")');
    expect(leer("src/app/api/guias/pedidos/route.ts")).not.toMatch(/createSwitchClient|switch-api\/client/);
  });
});
