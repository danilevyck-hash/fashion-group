// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — MULTIFASHION «COMO UN ERP HECHO POR APPLE» (4-oct-2026, propuesta).
//
// Detrás de `MULTIFASHION_APPLE_2026_10` (lib/multifashion/apple.ts), que NACE
// APAGADO. Lo que congela:
//   1. El interruptor está en `false` hasta el «sí» de Daniel.
//   2. Lo que requiere atención sale en orden (tienda en $0 → meta) y la meta
//      solo cuando el SERVIDOR dice que no llega (`alcanza === false`). El
//      aviso no pregunta: «sin ventas y no son feriado».
//   3. Los meses del «Año» usan la MISMA cuenta que «Mes a mes»
//      (`baseDesdeRatio` + `variacionPct`), del más nuevo al más viejo.
//   4. El espejo de Comisiones NO cambia (la llave es `conMetas`).
//   5. Ninguna pieza nueva se dibuja sin el interruptor: cada componente tocado
//      la condiciona a `MULTIFASHION_APPLE_2026_10`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { render, screen, cleanup } from "@testing-library/react";
import {
  MULTIFASHION_APPLE_2026_10, atencionesMultifashion, filasDelAnio, metaQueNoLlega, pieClientes,
} from "@/lib/multifashion/apple";
import { baseDesdeRatio, variacionPct } from "@/lib/variacion";
import { deltaCorto, montoCorto } from "@/lib/multifashion/celular";
import { NumeroGrande } from "@/components/multifashion/PiezasApple";
import type { MetaConAvance } from "@/lib/multifashion/metas-lectura";
import type { RetailMonthly } from "@/components/ventas/types";

afterEach(cleanup);

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

function meta(nombre: string, avance: Partial<MetaConAvance["avance"]>, extra: Partial<MetaConAvance> = {}): MetaConAvance {
  return {
    nombre,
    activa: true,
    avance: {
      estado: "en-curso", cumplida: false, alcanza: false, proyeccion: 388_326.47, brechaProyectada: -31_673.53,
      ...avance,
    },
    ...extra,
  } as unknown as MetaConAvance;
}

describe("el interruptor", () => {
  it("nace apagado", () => {
    expect(MULTIFASHION_APPLE_2026_10).toBe(false);
  });
});

describe("lo que requiere atención", () => {
  it("la meta solo cuando el servidor dice que no llega", () => {
    expect(metaQueNoLlega([meta("Viaje playa", {})])?.nombre).toBe("Viaje playa");
    expect(metaQueNoLlega([meta("A", { alcanza: true })])).toBeNull();
    expect(metaQueNoLlega([meta("B", { alcanza: null, proyeccion: null })])).toBeNull();
    expect(metaQueNoLlega([meta("C", { cumplida: true })])).toBeNull();
    expect(metaQueNoLlega([meta("D", { estado: "cerrada" })])).toBeNull();
    expect(metaQueNoLlega([meta("E", {}, { activa: false })])).toBeNull();
    expect(metaQueNoLlega(undefined)).toBeNull();
  });

  it("en orden: la tienda sin ventas primero, la meta después, sin preguntar; sin nada, nada", () => {
    const a = atencionesMultifashion({
      tiendaAbrio: "sáb 12 y lun 21 en $0 y no son feriado — ¿la tienda abrió?",
      meta: meta("Viaje playa", {}),
    });
    expect(a.map((x) => x.texto)).toEqual([
      "Sáb 12 y lun 21 sin ventas y no son feriado",
      "Meta Viaje playa: faltante proyectado $31,674",
    ]);
    expect(atencionesMultifashion({})).toEqual([]);
  });
});

describe("el año en el celular", () => {
  const mes = (ventas: number, vs2025: number | null): RetailMonthly =>
    ({ mes: "", ventas, tickets: ventas > 0 ? 1 : 0, ticketProm: 0, vs2025 }) as RetailMonthly;

  it("la MISMA cuenta que «Mes a mes», del más nuevo al más viejo, sin meses vacíos", () => {
    const meses = [mes(33_272.39, 0.5126), mes(38_381.69, -0.0872), mes(0, null)];
    const filas = filasDelAnio(meses);
    expect(filas.map((f) => f.titulo)).toEqual(["Febrero", "Enero"]);
    const esperado = deltaCorto(variacionPct(38_381.69, baseDesdeRatio(38_381.69, -0.0872)));
    expect(filas[0].delta).toEqual(esperado);
    expect(filas[0].monto).toBe(montoCorto(38_381.69));
    expect(filas[1].delta?.texto).toBe("▲ 51 %");
  });
});

describe("Clientes · la línea del pie", () => {
  it("cobertura y mostrador en una línea; sin cobertura, nada", () => {
    expect(pieClientes({ cobertura: "62% de los tickets con nombre — el 70% de la venta", ventasAnonimas: 4_210.4, ticketsAnonimos: 120 }))
      .toBe("62% de los tickets con nombre — el 70% de la venta · mostrador $4,210 · 120 tickets aparte");
    expect(pieClientes({ cobertura: null, ventasAnonimas: 10, ticketsAnonimos: 1 })).toBeNull();
  });
});

describe("el número grande", () => {
  it("sin negrita (barra v3.3)", () => {
    render(<NumeroGrande monto="$32,649" linea="ventas · 690 tickets" />);
    const p = screen.getByText("$32,649");
    expect(p.className).not.toMatch(/font-(bold|semibold)/);
  });
});

describe("nada nuevo sin el interruptor", () => {
  const archivos: Record<string, RegExp[]> = {
    "src/app/multifashion/MultifashionShell.tsx": [/\{fetchError && \(MULTIFASHION_APPLE_2026_10 \? \(/],
    "src/components/multifashion/MultifashionResumenView.tsx": [/const atencion = MULTIFASHION_APPLE_2026_10 \?/, /useMetaQueNoLlega\(MULTIFASHION_APPLE_2026_10\)/],
    "src/components/multifashion/VendedorasSubtab.tsx": [/const apple = MULTIFASHION_APPLE_2026_10 && conMetas === true;/],
    "src/components/multifashion/ClientesMultifashionSubtab.tsx": [/if \(MULTIFASHION_APPLE_2026_10\) \{/],
  };
  for (const [archivo, patrones] of Object.entries(archivos)) {
    it(archivo, () => {
      const src = leer(archivo);
      for (const p of patrones) expect(src).toMatch(p);
    });
  }

  it("el espejo de Comisiones no entra: monta Vendedoras sin `conMetas`", () => {
    const comisiones = leer("src/components/comisiones/ComisionesView.tsx");
    expect(comisiones).not.toMatch(/<VendedorasSubtab[^>]*conMetas/);
  });
});
