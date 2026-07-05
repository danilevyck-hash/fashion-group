import { describe, it, expect, vi } from "vitest";

// grupo-resumen-mensual importa supabase-server (directo y vía empresa-mapping
// y acs-resumen-diario); se mockea para que el import no construya el cliente
// real en el entorno de test.
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn(), rpc: vi.fn() },
}));

import {
  mesAnterior,
  fmtMesLabel,
  fmtMesCorto,
  buildMensajeMensual,
  type GrupoResumenMensual,
} from "@/lib/grupo-resumen-mensual";

describe("mesAnterior", () => {
  it("mes anterior dentro del año", () => {
    expect(mesAnterior("2026-07-03")).toEqual({ anio: 2026, mes: 6 });
    expect(mesAnterior("2026-12-03")).toEqual({ anio: 2026, mes: 11 });
  });

  it("enero cruza al diciembre del año anterior", () => {
    expect(mesAnterior("2027-01-03")).toEqual({ anio: 2026, mes: 12 });
  });
});

describe("labels de mes", () => {
  it("mes largo en español + año", () => {
    expect(fmtMesLabel(2026, 6)).toBe("junio 2026");
    expect(fmtMesLabel(2026, 1)).toBe("enero 2026");
  });

  it("mes corto para el comparativo", () => {
    expect(fmtMesCorto(2025, 6)).toBe("jun-2025");
    expect(fmtMesCorto(2025, 12)).toBe("dic-2025");
  });
});

function resumenBase(): GrupoResumenMensual {
  return {
    anio: 2026,
    mes: 6,
    total: 1021483.55,
    totalPrev: 943210.1,
    empresas: [
      { key: "vistana", label: "Vistana", monto: 212110.4, montoPrev: 189200 },
      { key: "fashion_wear", label: "Fashion Wear", monto: 350000, montoPrev: 360000 },
      { key: "joystep", label: "Joystep", monto: 0, montoPrev: 0 },
    ],
  };
}

describe("buildMensajeMensual", () => {
  it("formato compacto: header, total con vs, una línea por empresa", () => {
    const msg = buildMensajeMensual(resumenBase());
    const lines = msg.split("\n");
    expect(lines[0]).toBe("📊 Grupo · junio 2026");
    expect(lines[1]).toBe("Total: $1,021,484 · +8.3% vs jun-2025");
    expect(lines[2]).toBe("Vistana: $212,110 · +12.1%");
    expect(lines[3]).toBe("Fashion Wear: $350,000 · -2.8%");
    // Empresa sin data el año pasado: sin % inventado
    expect(lines[4]).toBe("Joystep: $0 · s/d año pasado");
    expect(lines).toHaveLength(5);
  });

  it("total sin año pasado no cuelga el 'vs'", () => {
    const r = { ...resumenBase(), totalPrev: 0 };
    const msg = buildMensajeMensual(r);
    expect(msg.split("\n")[1]).toBe("Total: $1,021,484 · s/d año pasado");
  });
});
