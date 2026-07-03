import { describe, it, expect, vi } from "vitest";

// sync-utilidad importa supabase-server en el top-level; lo mockeamos para que
// el import no intente construir el cliente real en el entorno de test.
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn() },
}));

import { mesesCronDiario } from "../../lib/switch-api/sync-utilidad";

// Ventana del cron diario: mes en curso + mes ANTERIOR durante los días 1-5 (UTC).
// Cierra el gap del último día del mes (docs emitidos después de la corrida de ~3am).
describe("mesesCronDiario", () => {
  it("días 1-5: incluye el mes anterior además del actual", () => {
    expect(mesesCronDiario(new Date("2026-07-01T08:00:00Z"))).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]);
    expect(mesesCronDiario(new Date("2026-07-05T23:59:59Z"))).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]);
  });

  it("día 6 en adelante: solo el mes en curso", () => {
    expect(mesesCronDiario(new Date("2026-07-06T00:00:00Z"))).toEqual([{ year: 2026, month: 7 }]);
    expect(mesesCronDiario(new Date("2026-07-30T08:00:00Z"))).toEqual([{ year: 2026, month: 7 }]);
  });

  it("cruce de año: enero 1-5 incluye diciembre del año anterior", () => {
    expect(mesesCronDiario(new Date("2027-01-03T08:00:00Z"))).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
  });

  it("usa el día UTC, no el local (el cron corre ~08:00 UTC)", () => {
    // 5-jul 22:00 Panamá = 6-jul 03:00 UTC → ya es día 6 en UTC → solo mes actual.
    expect(mesesCronDiario(new Date("2026-07-06T03:00:00Z"))).toEqual([{ year: 2026, month: 7 }]);
  });
});
