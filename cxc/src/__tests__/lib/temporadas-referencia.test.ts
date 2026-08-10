import { describe, it, expect } from "vitest";
import {
  TEMPORADAS,
  temporadaPorCodigo,
  ventanasTemporada,
  statsEnVentana,
  largoVentanaMeses,
} from "@/lib/ventas/temporadas-referencia";

// ─────────────────────────────────────────────────────────────────────────────
// Candados de las temporadas de compra (definidas por Daniel):
//   Tommy/Calvin:  PS ene–mar · SP abr–jun · PF jul–sep · FA oct–dic
//   Reebok:        SS ene–jun · FW jul–dic   (FW, no FA)
// Sin solaparse, y las ventanas son las 2 más recientes YA TERMINADAS.
// ─────────────────────────────────────────────────────────────────────────────

describe("definición de temporadas", () => {
  it("cada familia particiona los 12 meses EXACTAMENTE una vez (sin solapes, sin huecos)", () => {
    for (const familia of ["Tommy/Calvin", "Reebok"] as const) {
      const meses = TEMPORADAS.filter((t) => t.familia === familia)
        .flatMap((t) => t.meses)
        .sort((a, b) => a - b);
      expect(meses).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    }
  });

  it("los códigos son los que Daniel usa al comprar — y Reebok cierra con FW, no FA", () => {
    expect(TEMPORADAS.map((t) => t.codigo)).toEqual(["PS", "SP", "PF", "FA", "SS", "FW"]);
    expect(temporadaPorCodigo("FW")?.familia).toBe("Reebok");
    expect(temporadaPorCodigo("FW")?.meses).toEqual([7, 8, 9, 10, 11, 12]);
    expect(temporadaPorCodigo("FA")?.familia).toBe("Tommy/Calvin");
  });

  it("los meses de cada temporada son consecutivos", () => {
    for (const t of TEMPORADAS) {
      for (let i = 1; i < t.meses.length; i += 1) {
        expect(t.meses[i]).toBe(t.meses[i - 1] + 1);
      }
    }
  });
});

describe("ventanas — los 2 años más recientes ya ocurridos", () => {
  it("compra SP27 en ago-2026 → ve SP26 (abr–jun 26) y SP25 (abr–jun 25)", () => {
    const v = ventanasTemporada("SP", "2026-08");
    expect(v.map((x) => x.etiqueta)).toEqual(["SP26", "SP25"]);
    expect(v[0]).toMatchObject({ desde: "2026-04", hasta: "2026-06" });
    expect(v[1]).toMatchObject({ desde: "2025-04", hasta: "2025-06" });
  });

  it("una temporada EN CURSO no cuenta: SP en may-2026 → SP25 y SP24", () => {
    const v = ventanasTemporada("SP", "2026-05");
    expect(v.map((x) => x.etiqueta)).toEqual(["SP25", "SP24"]);
  });

  it("borde: en el mes exacto en que termina, todavía está en curso (jun-2026 → SP25/SP24; jul-2026 → SP26/SP25)", () => {
    expect(ventanasTemporada("SP", "2026-06").map((x) => x.etiqueta)).toEqual(["SP25", "SP24"]);
    expect(ventanasTemporada("SP", "2026-07").map((x) => x.etiqueta)).toEqual(["SP26", "SP25"]);
  });

  it("FW (jul–dic) en ago-2026: la de 2026 está en curso → FW25 y FW24", () => {
    const v = ventanasTemporada("FW", "2026-08");
    expect(v.map((x) => x.etiqueta)).toEqual(["FW25", "FW24"]);
    expect(v[0]).toMatchObject({ desde: "2025-07", hasta: "2025-12" });
  });

  it("código desconocido → sin ventanas (no se inventa nada)", () => {
    expect(ventanasTemporada("XX", "2026-08")).toEqual([]);
  });
});

describe("suma dentro de una ventana", () => {
  const serie = [
    { mes: "2025-03", unidades: 2, venta: 20 },
    { mes: "2025-04", unidades: 5, venta: 50 },
    { mes: "2025-06", unidades: 3, venta: 30 },
    { mes: "2025-07", unidades: 9, venta: 90 },
  ];

  it("incluye ambos extremos y nada fuera (rango sobre YYYY-MM)", () => {
    const [sp25] = ventanasTemporada("SP", "2026-08").filter((v) => v.etiqueta === "SP25");
    const s = statsEnVentana(serie, sp25);
    expect(s.unidades).toBe(8); // abr(5) + jun(3); mar y jul quedan fuera
    expect(s.venta).toBe(80);
  });

  it("el largo de la ventana permite leer u/mes comparable", () => {
    const [sp26] = ventanasTemporada("SP", "2026-08");
    expect(largoVentanaMeses(sp26)).toBe(3);
    const [ss] = ventanasTemporada("SS", "2026-08");
    expect(largoVentanaMeses(ss)).toBe(6);
  });
});
