import { describe, it, expect, vi } from "vitest";

// acs-resumen-diario importa supabase-server en el top-level; se mockea para
// que el import no construya el cliente real en el entorno de test.
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn() },
}));

import {
  addDays,
  ventanasResumen,
  cierreUtcDe,
  buildMensaje,
  fmtDiaLabel,
  fmtDiaCorto,
  fmtDiaTitulo,
  fmtComparableDia,
  fmtRangoMesPrev,
  type AcsResumenDiario,
} from "@/lib/acs-resumen-diario";

describe("addDays", () => {
  it("suma y resta días cruzando mes y año", () => {
    expect(addDays("2026-07-04", 1)).toBe("2026-07-05");
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("-364 días cae en el mismo día de la semana del año anterior", () => {
    // 2026-07-04 es sábado → 2025-07-05 también es sábado
    expect(addDays("2026-07-04", -364)).toBe("2025-07-05");
  });
});

describe("ventanasResumen — same-period estricto 1..D vs 1..D", () => {
  it("mismo D en ambos lados (corte mitad de mes)", () => {
    const v = ventanasResumen("2026-07-15");
    expect(v.inicioMes).toBe("2026-07-01");
    expect(v.inicioMesPrev).toBe("2025-07-01");
    expect(v.cortePrev).toBe("2025-07-15"); // MISMO día 15
    expect(v.fechaComparable).toBe("2025-07-16"); // −364d, mismo día de semana
  });

  it("D=1: ventana de un solo día en ambos años", () => {
    const v = ventanasResumen("2026-07-01");
    expect(v.inicioMes).toBe("2026-07-01");
    expect(v.cortePrev).toBe("2025-07-01");
    expect(v.inicioMesPrev).toBe("2025-07-01");
  });

  it("cambio de mes: corte recortado a fin de mes anterior compara meses completos", () => {
    // Caso sync viejo el día 1: corte = fecha−1 = 31-jul → julio completo vs julio completo
    const v = ventanasResumen("2026-07-31");
    expect(v.inicioMes).toBe("2026-07-01");
    expect(v.cortePrev).toBe("2025-07-31");
    expect(v.inicioMesPrev).toBe("2025-07-01");
  });

  it("cambio de año: corte 1-ene compara contra 1-ene del año pasado", () => {
    const v = ventanasResumen("2026-01-01");
    expect(v.cortePrev).toBe("2025-01-01");
    expect(v.inicioMesPrev).toBe("2025-01-01");
  });

  it("29-feb: cortePrev se recorta a 28-feb (el año anterior no es bisiesto)", () => {
    const v = ventanasResumen("2028-02-29");
    expect(v.cortePrev).toBe("2027-02-28");
    expect(v.inicioMesPrev).toBe("2027-02-01");
  });
});

describe("cierreUtcDe", () => {
  it("el cierre del día Panamá es fecha+1 a las 00:00 UTC (19:00 Panamá = 7pm)", () => {
    expect(cierreUtcDe("2026-07-04")).toBe("2026-07-05T00:00:00.000Z");
    expect(cierreUtcDe("2026-12-31")).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("buildMensaje", () => {
  const base: AcsResumenDiario = {
    fecha: "2026-07-04",
    corte: "2026-07-04",
    syncFresco: true,
    hoy: 2186,
    hoyPrev: 2082,
    fechaComparable: "2025-07-05",
    mes: 9140,
    mesPrev: 8447,
  };

  it("sync fresco con ventas: formato normal de 3 líneas con comparables", () => {
    expect(buildMensaje(base)).toBe(
      "🏪 ACS · sábado 4 jul\n" +
        "Día:  $2,186  vs  $2,082 (sáb 5-jul-25) · +5%\n" +
        "Mes:  $9,140  vs  $8,447 (1-4 jul-25) · +8.2%",
    );
  });

  it("$0 real con sync fresco (tienda cerrada) SÍ se manda normal", () => {
    const msg = buildMensaje({ ...base, hoy: 0, hoyPrev: 970 });
    expect(msg).toContain("Día:  $0  vs  $970 (sáb 5-jul-25) · -100%");
  });

  it("sync viejo: omite la línea de Día y reporta el mes al último día completo", () => {
    const msg = buildMensaje({
      ...base,
      syncFresco: false,
      corte: "2026-07-03",
      hoy: 0,
      hoyPrev: 0,
      mes: 5298.25,
      mesPrev: 3809.86,
    });
    expect(msg).toBe(
      "🏪 ACS · sábado 4 jul\n" +
        "⏳ Ventas del día aún sincronizando\n" +
        "Mes (al 3-jul):  $5,298  vs  $3,810 (1-3 jul-25) · +39.1%",
    );
    expect(msg).not.toContain("Día:");
    expect(msg).not.toContain("-100%");
  });

  it("sin datos del año pasado (prev ≤ 0): 's/d año pasado' y sin 'vs …'", () => {
    const msg = buildMensaje({ ...base, hoyPrev: 0, mesPrev: 0 });
    expect(msg).toContain("Día:  $2,186 · s/d año pasado");
    expect(msg).toContain("Mes:  $9,140 · s/d año pasado");
    expect(msg).not.toContain("vs");
  });
});

describe("labels de fecha", () => {
  it("fmtDiaLabel y fmtDiaCorto en español", () => {
    expect(fmtDiaLabel("2026-07-04")).toBe("sáb 4-jul");
    expect(fmtDiaCorto("2026-07-03")).toBe("3-jul");
  });

  it("fmtDiaTitulo: día de semana completo, sin guiones", () => {
    expect(fmtDiaTitulo("2026-07-10")).toBe("viernes 10 jul");
    expect(fmtDiaTitulo("2026-07-04")).toBe("sábado 4 jul");
  });

  it("fmtComparableDia: mismo día de semana del año pasado con año corto", () => {
    expect(fmtComparableDia("2025-07-11")).toBe("vie 11-jul-25");
  });

  it("fmtRangoMesPrev: rango 1..D del mes de corte, año anterior", () => {
    expect(fmtRangoMesPrev("2026-07-10")).toBe("1-10 jul-25");
    expect(fmtRangoMesPrev("2026-07-01")).toBe("1-1 jul-25");
    // 29-feb → mismo recorte que ventanasResumen.cortePrev (28-feb)
    expect(fmtRangoMesPrev("2028-02-29")).toBe("1-28 feb-27");
  });
});
