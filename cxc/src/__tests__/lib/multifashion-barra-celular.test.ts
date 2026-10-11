/**
 * 🔴 CANDADO — MULTIFASHION EN EL CELULAR CON EL ENCABEZADO COMPARTIDO
 * (`MULTIFASHION_BARRA_2026_10`, 11-oct-2026).
 *
 * Lo que no debe cambiar: los nombres de las secciones son los de las pestañas,
 * la línea de hoy lleva los MISMOS dos montos que la línea gris de antes, la
 * frescura sigue siendo `LineaDeFrescura`, y apagado queda el encabezado de antes.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { lineaDeHoy, montoCorto, seccionesDeLaBarra, subtituloHoyAyer } from "@/lib/multifashion/celular";
import { PESTANAS_MULTIFASHION } from "@/lib/multifashion/pestanas";

const shell = fs.readFileSync(path.join(process.cwd(), "src/app/multifashion/MultifashionShell.tsx"), "utf8");

describe("Multifashion › celular › encabezado compartido", () => {
  it("el título ofrece Resumen y los cuatro renglones, con los nombres de las pestañas", () => {
    expect(seccionesDeLaBarra(PESTANAS_MULTIFASHION, 2026).map((s) => s.label))
      .toEqual(["Resumen", "Año 2026", "Vendedoras", "Productos", "Clientes"]);
    expect(seccionesDeLaBarra(PESTANAS_MULTIFASHION, 2026).filter((s) => s.value !== "anio").map((s) => s.value))
      .toEqual(PESTANAS_MULTIFASHION.map((p) => p.id));
  });

  it("🔴 la línea de hoy dice los mismos montos que la línea gris de antes", () => {
    const hoy = { hayVentas: true, ventas: 1866.4, ayer: 1795.2 };
    const l = lineaDeHoy(hoy)!;
    expect(l).toEqual({ hoy: "$1,866", ayer: "ayer $1,795" });
    expect(`hoy ${l.hoy} · ${l.ayer}`).toBe(subtituloHoyAyer({ dias: 11, hoy }));
    expect(l.hoy).toBe(montoCorto(hoy.ventas));
  });

  it("sin ventas no se escribe $0, y fuera del mes de hoy no hay línea", () => {
    expect(lineaDeHoy({ hayVentas: false, ventas: 0, ayer: 1795 })!.hoy).toBe("sin ventas todavía");
    expect(lineaDeHoy(null)).toBeNull();
    expect(lineaDeHoy(undefined)).toBeNull();
  });

  it("el encabezado es la barra compartida, detrás del interruptor, y el de antes sigue para apagado", () => {
    expect(shell).toContain("useBarraCelular(MULTIFASHION_BARRA_2026_10)");
    expect(shell).toMatch(/\{barra && \(\s*<BarraDeControles/);
    expect(shell).toContain("{MULTIFASHION_CELULAR && !barra && (");
    // La frescura no se dibuja a mano: sigue siendo el componente común, uno solo en el celular.
    expect(shell.match(/<LineaDeFrescura\s+forma="celular"/g)).toHaveLength(1);
  });
});
