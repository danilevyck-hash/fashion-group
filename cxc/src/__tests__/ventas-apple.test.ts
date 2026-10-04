/**
 * 🔴 CANDADO — VENTAS «COMO LO HARÍA APPLE» (4-oct-2026). Nació apagado y se
 * PRENDIÓ el mismo día: Daniel aprobó el mockup («aprobado»). Ver
 * `lib/ventas/ventas-apple.ts`. Ningún número cambia: el número grande dice las
 * MISMAS cifras que la tira de cuatro, y hay UNA sola línea de frescura.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { VENTAS_APPLE_2026_10, lineaBajoElNumero } from "@/lib/ventas/ventas-apple";
import { numerosDelResumen } from "@/lib/ventas/resumen-mes";
import { cifraDeLaTira } from "@/lib/ventas/celular";
import type { VentasResumen } from "@/components/ventas/types";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const serie = (m9: number) => [100, 0, 0, 0, 0, 0, 0, 0, m9, null, null, null];

const data = {
  mesActual: 10,
  kpis: { ventasNetasYTD: 7_069_116.31, ventas2025YTD: 6_500_000, utilidadYTD: 2_030_000, utilidad2025YTD: 1_900_000, margenYTD: 0.287, margen2025YTD: 0.29 },
  empresas: [{
    empresa: { id: "vistana", nombre: "Vistana", tipo: "b2b" },
    ventas2026: serie(200), ventas2025: serie(100), ventasPrevFull: serie(100),
    utilidad2026: serie(50), utilidad2025: serie(20), ventasParaMargen: serie(200),
  }],
  proyeccion: { totales_grupo: { proyeccion_cierre: 9_100_000, delta_vs_anio_anterior_total: 800_000 } },
} as unknown as VentasResumen;

describe("VENTAS_APPLE_2026_10", () => {
  // 4-oct-2026: Daniel aprobó el mockup («aprobado»).
  it("prendido el 4-oct-2026", () => expect(VENTAS_APPLE_2026_10).toBe(true));

  it("el rollback sigue: apagado, el celular dibuja la tira de cuatro y la computadora sus tarjetas", () => {
    expect(leer("src/components/ventas/celular/ResumenCelular.tsx")).toContain(
      "{VENTAS_APPLE_2026_10 ? <NumeroDelResumen numeros={numeros} forma=\"celular\" /> : <TiraDeCuatro numeros={numeros} />}",
    );
    const resumen = leer("src/components/ventas/ResumenView.tsx");
    expect(resumen).toContain("{!VENTAS_APPLE_2026_10 && (\n      <div className=\"grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4\">");
    expect(leer("src/app/ventas/VentasShell.tsx")).toContain('VENTAS_APPLE_2026_10 && tab === "resumen" ? (');
  });

  it("UNA sola línea de frescura en el Resumen: la del número grande", () => {
    const resumen = leer("src/components/ventas/ResumenView.tsx");
    expect(resumen).toContain('derecha={<FrescuraVentasCel forma="computadora"');
    expect(resumen).toContain("{!VENTAS_APPLE_2026_10 && <FrescuraVentasCel forma=\"computadora\"");
    expect(leer("src/components/ventas/ResumenViewMobile.tsx")).toContain("{!sinKpis && <FrescuraVentasCel");
  });

  it("Clientes no repite la hora con «datos de hoy …»", () => {
    expect(leer("src/components/ventas/ClientesView.tsx")).toContain(
      "const frescura = VENTAS_APPLE_2026_10 ? null : textoFrescura(data.actualizadoAt);",
    );
  });
});

describe("el número grande dice lo mismo que la tira", () => {
  it("todo el año: la venta de los KPI, y la proyección al final", () => {
    const n = numerosDelResumen(data, 0, false);
    expect(n.map((x) => x.rotulo)).toEqual(["Ventas", "Utilidad", "Margen", "Proyección"]);
    expect(n[0].valor).toBe(cifraDeLaTira(7_069_116.31));
    expect(n[0].cambio).toBe("▲ +9%");
    expect(lineaBajoElNumero(n.slice(1))).toBe("Utilidad $2.03M · Margen 29% · Proyección $9.10M");
  });

  it("un mes: la venta de ese mes y sin proyección", () => {
    const n = numerosDelResumen(data, 9, false);
    expect(n.map((x) => x.rotulo)).toEqual(["Ventas", "Utilidad", "Margen"]);
    expect(n[0].valor).toBe(cifraDeLaTira(200));
    expect(n[0].cambio).toBe("▲ +100%");
  });

  it("año cerrado: sin proyección", () => {
    expect(numerosDelResumen(data, 0, true)).toHaveLength(3);
  });
});
