/**
 * CANDADO — MARKETING ESTILO APPLE (`MARKETING_APPLE_2026_10`, 1-oct-2026).
 * Solo cambia la PANTALLA: ningún número cambia, ninguna fila se pierde, y con
 * el interruptor en `false` todo es como hoy. Lo que se envía al guardar lo
 * cubre `components/marketing-puerta-gasto.test.tsx` › bloque 8.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  MARKETING_APPLE_2026_10,
  marcasConGastoPrimero,
  montoDelChip,
  mostrarBuscadorDeTiendas,
  observacionesAbiertas,
  seReportaAbierto,
  resumenCortoDeMeses,
  PESTANA_ACTIVA,
  PESTANA_INACTIVA,
  CHIP_ACTIVO,
  CHIP_INACTIVO,
  ENLACE,
} from "@/lib/marketing/marketing-2026-10";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("🔴 MARKETING_APPLE_2026_10", () => {
  it("nace en false: la pantalla de hoy", () => {
    expect(MARKETING_APPLE_2026_10).toBe(false);
  });

  it("cada pantalla tocada conserva su rama de hoy detrás del interruptor", () => {
    for (const f of [
      "src/app/marketing/components/PortadaTiendasYMarcas.tsx",
      "src/app/marketing/components/PortadaTiendas.tsx",
      "src/app/marketing/components/PortadaAbiertosCerrados.tsx",
      "src/app/marketing/tienda/[codigo]/FichaTienda.tsx",
      "src/app/marketing/components/PaginaMarca.tsx",
      "src/app/marketing/components/ImpulsadorasView.tsx",
      "src/app/marketing/mobiliario/page.tsx",
      "src/app/marketing/components/BloqueDatosDelGasto.tsx",
      "src/app/marketing/components/PuertaGasto.tsx",
    ]) {
      expect(leer(f), f).toContain("MARKETING_APPLE_2026_10");
    }
  });

  it("marcas con gasto primero: mismas filas, mismo orden dentro de cada grupo", () => {
    const filas = [
      { key: "TH", cantidadReportada: 21, cantidadNoReportada: 0 },
      { key: "KL", cantidadReportada: 0, cantidadNoReportada: 0 },
      { key: "RB", cantidadReportada: 0, cantidadNoReportada: 0 },
      { key: "JB", cantidadReportada: 1, cantidadNoReportada: 0 },
      { key: "XX", cantidadReportada: 0, cantidadNoReportada: 2 },
    ];
    const r = marcasConGastoPrimero(filas);
    expect(r.map((f) => f.key)).toEqual(["TH", "JB", "XX", "KL", "RB"]);
    expect(r).toHaveLength(filas.length);
    expect(filas.map((f) => f.key)).toEqual(["TH", "KL", "RB", "JB", "XX"]); // no muta
  });

  it("el monto del chip es el MISMO número que ya mostraba la tarjeta", () => {
    const porMarca = [
      { codigo: "TH", monto: 8994.54 },
      { codigo: "CK", monto: 3736.75 },
    ];
    expect(montoDelChip("todos", "todos", 12731.29, porMarca)).toBe(12731.29);
    expect(montoDelChip("th", "todos", 12731.29, porMarca)).toBe(8994.54);
    expect(montoDelChip("CK", "todos", 12731.29, porMarca)).toBe(3736.75);
    expect(montoDelChip("RB", "todos", 12731.29, porMarca)).toBeNull();
  });

  it("buscador solo con más de 10 tiendas", () => {
    expect(mostrarBuscadorDeTiendas(6)).toBe(false);
    expect(mostrarBuscadorDeTiendas(10)).toBe(false);
    expect(mostrarBuscadorDeTiendas(11)).toBe(true);
  });

  it("2-oct: la tarjeta de impulsadora cuenta los MISMOS meses y dice desde cuándo", () => {
    const meses = [{ mes: "2024-05-01" }, { mes: "2024-06-01" }, { mes: "2026-10-01" }];
    expect(resumenCortoDeMeses(meses, (m) => m.slice(0, 7))).toBe("3 meses pendientes · desde 2024-05");
    expect(resumenCortoDeMeses([{ mes: "2026-09-01" }], (m) => m)).toBe("1 mes pendiente · desde 2026-09-01");
    expect(resumenCortoDeMeses([], (m) => m)).toBe("");
  });

  it("2-oct: «Fotos · 0» SÍ se dibuja (el botón no depende del interruptor ni del cero)", () => {
    const src = leer("src/app/marketing/tienda/[codigo]/FichaTienda.tsx");
    expect(src).not.toMatch(/datos\?\.fotos \?\? 0\) > 0/);
    expect(src).toContain("Fotos{datos ? ` · ${datos.fotos}` : \"\"}");
  });

  it("2-oct: los colores salen de los tokens del sistema (negro y grises, sin teal/azul/fucsia)", () => {
    for (const c of [PESTANA_ACTIVA, PESTANA_INACTIVA, CHIP_ACTIVO, CHIP_INACTIVO, ENLACE]) {
      expect(c).not.toMatch(/teal|fuchsia|blue|emerald/);
    }
  });

  it("lo escondido se abre solo si se toca o si ya tiene algo (editar no lo tapa)", () => {
    expect(seReportaAbierto(true, false)).toBe(false);
    expect(seReportaAbierto(false, false)).toBe(true);
    expect(seReportaAbierto(true, true)).toBe(true);
    expect(observacionesAbiertas("", false)).toBe(false);
    expect(observacionesAbiertas("Apertura", false)).toBe(true);
    expect(observacionesAbiertas("  ", true)).toBe(true);
  });
});
