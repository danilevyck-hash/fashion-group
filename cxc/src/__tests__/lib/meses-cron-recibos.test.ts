import { describe, it, expect, vi } from "vitest";

// sync-recibos importa supabase-server en el top-level; lo mockeamos para que
// el import no intente construir el cliente real en el entorno de test.
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn() },
}));

import { mesesCronRecibos } from "../../lib/switch-api/sync-recibos";

// Ventana rodante del cron de recibos: SIEMPRE mes en curso + 2 anteriores
// (orden viejo → nuevo). El delete+insert por (empresa, mes) re-sincroniza la
// ventana completa y corrige anulados/editados/retro-cargas (audit jul-2026).
describe("mesesCronRecibos", () => {
  it("siempre devuelve 3 meses: en curso + 2 anteriores, viejo → nuevo", () => {
    expect(mesesCronRecibos(new Date("2026-07-23T08:00:00Z"))).toEqual([
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]);
  });

  it("no depende del día del mes (a diferencia de mesesCronDiario)", () => {
    expect(mesesCronRecibos(new Date("2026-07-01T00:00:00Z"))).toEqual([
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]);
    expect(mesesCronRecibos(new Date("2026-07-31T23:59:59Z"))).toEqual([
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]);
  });

  it("cruce de año: enero y febrero incluyen meses del año anterior", () => {
    expect(mesesCronRecibos(new Date("2027-01-15T08:00:00Z"))).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
    expect(mesesCronRecibos(new Date("2027-02-10T08:00:00Z"))).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
    ]);
  });

  it("usa el día/mes UTC, no el local", () => {
    // 31-jul 22:00 Panamá = 1-ago 03:00 UTC → la ventana ya es jun-jul-ago.
    expect(mesesCronRecibos(new Date("2026-08-01T03:00:00Z"))).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
  });
});
