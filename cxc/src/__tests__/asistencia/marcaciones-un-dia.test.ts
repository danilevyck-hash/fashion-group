// Candado: Asistencia › Marcaciones, un día a la vez y solo para admin (27-nov-2026).
import { describe, it, expect, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { MARCACIONES_UN_DIA, diaElegido, diaVecino } from "@/lib/ui/marcaciones-dia-2026-11";
import { hoyPanama } from "@/lib/fecha-panama";
import { vePestana } from "@/lib/asistencia/roles";

vi.mock("@/lib/supabase-server", () => {
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "gte", "lte", "order", "range", "in", "is"]) q[k] = () => q;
  q.then = (ok: (v: unknown) => unknown) => ok({ data: [], error: null, count: 0 });
  return { supabaseServer: { from: () => q } };
});
vi.mock("@/lib/asistencia/lugares-referencia-server", () => ({ leerLugaresReferencia: async () => [] }));
vi.mock("@/lib/asistencia/horarios-server", () => ({ leerHorarios: async () => ({ horarios: [] }) }));

let GET: (req: NextRequest) => Promise<Response>;
let sign: (p: Record<string, unknown>) => string;

beforeAll(async () => {
  process.env.SESSION_SECRET ||= "prueba-marcaciones";
  ({ signSession: sign } = await import("@/lib/session-cookie"));
  ({ GET } = await import("@/app/api/asistencia/marcaciones/route"));
});

const pedir = (role: string) =>
  GET(new NextRequest("http://x/api/asistencia/marcaciones?desde=2026-11-26&hasta=2026-11-26", {
    headers: { cookie: `cxc_session=${sign({ role, userId: "u1", userName: "x", sessionToken: "t", modules: ["asistencia", "boston"] })}` },
  }));

describe("el día que se mira", () => {
  it("está prendido", () => expect(MARCACIONES_UN_DIA).toBe(true));

  it("por defecto es HOY de Panamá, también a las 9 p. m. (ya es mañana en UTC)", () => {
    const noche = new Date("2026-11-27T02:00:00Z"); // 26-nov 21:00 en Panamá
    expect(hoyPanama(noche)).toBe("2026-11-26");
    expect(diaElegido(null, hoyPanama(noche))).toBe("2026-11-26");
    expect(diaElegido("", "2026-11-26")).toBe("2026-11-26");
    expect(diaElegido("basura", "2026-11-26")).toBe("2026-11-26");
  });

  it("respeta la URL pero nunca pasa de hoy", () => {
    expect(diaElegido("2026-11-20", "2026-11-26")).toBe("2026-11-20");
    expect(diaElegido("2026-12-01", "2026-11-26")).toBe("2026-11-26");
  });

  it("las flechas van de a un día, cruzan el mes y se frenan en hoy", () => {
    expect(diaVecino("2026-11-01", -1, "2026-11-26")).toBe("2026-10-31");
    expect(diaVecino("2026-11-25", 1, "2026-11-26")).toBe("2026-11-26");
    expect(diaVecino("2026-11-26", 1, "2026-11-26")).toBe("2026-11-26");
  });
});

describe("la pestaña es solo de admin", () => {
  for (const rol of ["contabilidad", "gerente_boston", "bodega", "secretaria", "vendedor"]) {
    it(`la ruta le contesta 403 a ${rol}, y la pantalla no le dibuja la pestaña`, async () => {
      expect((await pedir(rol)).status).toBe(403);
      expect(vePestana(rol, "marcaciones")).toBe(false);
    });
  }

  it("admin sí entra", async () => {
    expect((await pedir("admin")).status).toBe(200);
    expect(vePestana("admin", "marcaciones")).toBe(true);
  });

  it("la planilla y las aprobaciones siguen abiertas a quien las usa", () => {
    expect(vePestana("contabilidad", "planilla")).toBe(true);
    expect(vePestana("contabilidad", "aprobaciones")).toBe(true);
    expect(vePestana("bodega", "aprobaciones")).toBe(true);
    expect(vePestana("gerente_boston", "aprobaciones")).toBe(true);
  });
});
