import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { horaSinPartir, nombreConMayuscula } from "@/lib/ui/revision-110-despachos";
import { lineaDeLaPestana } from "@/lib/guias/pedidos-bodega";
import { unSoloOrigen } from "@/lib/catalogo/origen-comprobante";

const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");

describe("revisión 110 · Despachos, Catálogos y Plantilla", () => {
  it("n.º 62: «julio» → «Julio», y «4:00 p. m.» no se parte", () => {
    expect(nombreConMayuscula("julio")).toBe("Julio");
    expect(nombreConMayuscula("ana maría")).toBe("Ana María");
    expect(nombreConMayuscula("Angela")).toBe("Angela");
    expect(horaSinPartir("Preparado · Julio · 4:00 p. m.")).toBe("Preparado · Julio · 4:00 p. m.");
  });

  it("n.º 58: la línea habla de la pestaña abierta", () => {
    const hoy = "2026-11-14";
    const rows = [
      { fecha: "2026-10-28T10:00:00-05:00", estado: "en_preparacion" },
      { fecha: "2026-11-10T10:00:00-05:00", estado: "en_preparacion" },
      { fecha: "2026-11-12T10:00:00-05:00", estado: "pendiente" },
    ] as const;
    const enPrep = { singular: "en preparación", plural: "en preparación" };
    expect(lineaDeLaPestana(rows, "en_preparacion", enPrep, hoy)).toBe("2 en preparación · el más viejo, 17 d");
    expect(lineaDeLaPestana(rows, "pendiente", { singular: "pendiente", plural: "pendientes" }, hoy)).toBe("1 pendiente · 2 d");
    expect(lineaDeLaPestana(rows, "recibido", { singular: "recibido", plural: "recibidos" }, hoy)).toBe("Sin pedidos recibidos");
  });

  it("n.º 57: «Origen» se calla solo si todas las filas dirían lo mismo", () => {
    expect(unSoloOrigen([{ origen: "mio" }, { origen: "mio" }])).toBe(true);
    expect(unSoloOrigen([{ origen: "mio" }, { origen: "link" }])).toBe(false);
    expect(unSoloOrigen([{ origen: "link", confirmado_cliente_at: "x" }, { origen: "link", confirmado_cliente_at: null }])).toBe(false);
    expect(unSoloOrigen([])).toBe(true);
  });

  it("n.º 65: el refresco de fondo lee la BASE, nunca Switch, y el ↻ se queda", () => {
    const v = leer("src/app/despachos/components/PedidosView.tsx");
    const efecto = v.slice(v.indexOf("if (!PEDIDOS_REFRESCO_AUTOMATICO) return;"), v.indexOf("useEffect(() => { onDetalle?."));
    expect(efecto).toMatch(/void cargar\(true(, true)?\)/);
    expect(efecto).not.toMatch(/sync|switch/i);
    expect(v).toContain("<LineaDeFrescura");
  });
});
