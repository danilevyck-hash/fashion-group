// Mantener presionado = tarjeta de resumen (27-nov-2026, `GESTOS_IPHONE_2026_11`).
// Cada lista del celular arma su tarjeta SOLO con lo que ya trae la fila:
// ni `fetch(` ni `useSWR` nuevos en el archivo que la dibuja.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const leer = (r: string) => readFileSync(join(process.cwd(), "src", r), "utf8");

/** El trozo del archivo desde `desde` hasta el siguiente `hasta`. */
function trozo(src: string, desde: string, hasta: string): string {
  const i = src.indexOf(desde);
  expect(i, `no está «${desde}»`).toBeGreaterThan(-1);
  const j = src.indexOf(hasta, i + desde.length);
  return src.slice(i, j === -1 ? undefined : j);
}

const PANTALLAS = [
  { nombre: "Despachos › Guías", archivo: "app/despachos/components/GuiasList.tsx", desde: "{tarjetaGuia && (", hasta: "onCerrar=" },
  { nombre: "Proveedores", archivo: "app/proveedores/ProveedoresListClient.tsx", desde: "function TarjetaTramos", hasta: "\nfunction " },
];

describe("mantener presionado: tarjeta de resumen en las listas del celular", () => {
  for (const p of PANTALLAS) {
    it(`${p.nombre}: usa el gancho y la tarjeta compartidos, sin leer nada nuevo`, () => {
      const src = leer(p.archivo);
      expect(src).toMatch(/import \{ TarjetaResumen, useMantenerPresionado \} from "@\/components\/shared\/GestosIphone"/);
      const t = trozo(src, p.desde, p.hasta);
      expect(t).not.toMatch(/fetch\(|useSWR/);
    });
  }

  it("Proveedores: la tarjeta es EDAD, nunca «vencido»", () => {
    const t = trozo(leer("app/proveedores/ProveedoresListClient.tsx"), "function TarjetaTramos", "\nfunction ");
    expect(t.toLowerCase()).not.toContain("vencid");
    expect(t).toContain("TRAMOS.map");
  });

  it("Ventas › Clientes: la tarjeta mes a mes lee SOLO la ruta de la hoja del cliente", () => {
    const src = leer("components/ventas/celular/ClientesCelular.tsx");
    expect(src).toContain("useMantenerPresionado");
    expect(src).toContain("<TarjetaMesAMes");
    const fetches = src.match(/fetch\(`([^`]*)`/g) ?? [];
    expect(fetches).toEqual(["fetch(`/api/clientes/${encodeURIComponent(c.id)}/por-empresa-anual?year=${selectedYear}`"]);
  });

  it("Ventas › Resumen: la tarjeta mes a mes sale de las series de la tabla, sin leer nada", () => {
    const src = leer("components/ventas/celular/ResumenCelular.tsx");
    expect(src).toContain("mesesDeSeries(tarjeta.ventas2026, tarjeta.ventas2025");
    expect(src).not.toMatch(/fetch\(|useSWR/);
  });

  it("Despachos › Guías: sin SwipeableRow", () => {
    expect(leer("app/despachos/components/GuiasList.tsx")).not.toContain("SwipeableRow");
  });

  // 🔴 27-nov-2026: UNA sola tarjeta «mes a mes» para todas las pantallas, y
  // cada una lee SOLO su ruta de siempre.
  const MES_A_MES = [
    { archivo: "components/ventas/celular/ResumenCelular.tsx", lee: [] as string[] },
    { archivo: "components/ventas/celular/ClientesCelular.tsx", lee: ["/api/clientes/"] },
    { archivo: "app/clientes/ClientesListClient.tsx", lee: ["/api/clientes/${encodeURIComponent(x.codigo)}/por-empresa-anual"] },
    { archivo: "components/multifashion/celular/VendedorasCelular.tsx", lee: ["/api/multifashion/vendedoras?mesAMes=1"] },
    { archivo: "components/comisiones/ComisionesTarjetas.tsx", lee: ["/api/ventas/comisiones?empresa="] },
    { archivo: "components/referencia/ReferenciaModelo.tsx", lee: [] },
  ];
  for (const p of MES_A_MES) {
    it(`mes a mes · ${p.archivo}: la tarjeta compartida`, () => {
      const src = leer(p.archivo);
      expect(src).toContain("<TarjetaMesAMes");
      expect(src).toContain('from "@/components/shared/TarjetaMesAMes"');
      for (const ruta of p.lee) expect(src).toContain(ruta);
    });
  }

  it("Comisiones: la tarjeta mes a mes NO está en «Todas las empresas»", () => {
    const src = leer("components/comisiones/ComisionesTarjetas.tsx");
    expect(trozo(src, "function FilasConsolidadoV2", "\nfunction ")).not.toContain("TarjetaMesAMes");
    expect(trozo(src, "function FilasPorEmpresaV2", "\nfunction ")).toContain("cambio={null}");
  });
});
