// 🔴 LA SALIDA NUNCA ANTES DE LA ENTRADA + EL RASTRO DE QUIÉN GUARDÓ (16-nov-2026)
// 🩸 La salida de Ariel (65) quedó a las 04:30 en vez de 16:30 y le contó 12 h
// de extra. La ruta contesta 400 y cada guardado queda en `activity_logs`.

import { describe, it, expect, vi, beforeEach } from "vitest";

const upserts: Array<Record<string, unknown>> = [];
const logs: Array<unknown[]> = [];
let previa: Record<string, unknown> | null = null;

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "contabilidad", userName: "yulissa", userId: "1", sessionToken: "t", modules: ["asistencia"] }),
}));
vi.mock("@/lib/asistencia/guard", () => ({
  requireAsistencia: () => ({ role: "contabilidad", userName: "yulissa", userId: "1", sessionToken: "t" }),
}));
vi.mock("@/lib/asistencia/alcance-boston-server", () => ({
  alcanceDelRol: () => null,
  empresaEnAlcance: () => true,
  rechazarFueraDeAlcance: async () => null,
}));
vi.mock("@/lib/log-activity", () => ({
  logActivity: async (...a: unknown[]) => { logs.push(a); },
}));
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    from: (tabla: string) => ({
      upsert: (fila: Record<string, unknown>) => { upserts.push(fila); return Promise.resolve({ error: null }); },
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: tabla === "asistencia_personas" ? null : previa, error: null }) }),
      }),
    }),
  },
}));

import { PUT } from "@/app/api/asistencia/horarios/route";
import { errorSalidaAntesDeEntrada } from "@/lib/asistencia/horario-configurable";

const pedido = (body: unknown) => ({ json: async () => body }) as never;

beforeEach(() => { upserts.length = 0; logs.length = 0; previa = null; });

describe("errorSalidaAntesDeEntrada", () => {
  it("sugiere la tarde cuando la salida cayó en la mañana", () => {
    expect(errorSalidaAntesDeEntrada("08:00", "04:30")).toBe(
      "La salida (4:30 a. m.) es antes de la entrada (8:00 a. m.). ¿Quisiste decir 4:30 p. m.?",
    );
  });
  it("igual a la entrada tampoco vale; después sí", () => {
    expect(errorSalidaAntesDeEntrada("08:00", "08:00")).not.toBeNull();
    expect(errorSalidaAntesDeEntrada("08:00", "16:30")).toBeNull();
  });
});

describe("PUT /api/asistencia/horarios", () => {
  it("rechaza 400 una salida antes de la entrada y no escribe nada", async () => {
    const r = await PUT(pedido({ codigo: "65", entrada: "08:00", salida: "04:30" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("¿Quisiste decir 4:30 p. m.?");
    expect(upserts).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it("rechaza 400 el horario de afuera al revés", async () => {
    const r = await PUT(pedido({ codigo: "65", entrada: "08:00", salida: "16:30", entradaAfuera: "09:00", salidaAfuera: "05:00" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("por el teléfono");
    expect(upserts).toHaveLength(0);
  });

  it("guarda y deja rastro: quién, antes y después", async () => {
    previa = { entrada: "08:00:00", salida: "04:30:00", dias_laborables: null, entrada_afuera: null, salida_afuera: null };
    const r = await PUT(pedido({ codigo: "65", entrada: "08:00", salida: "16:30" }));
    expect(r.status).toBe(200);
    expect(upserts).toHaveLength(1);
    expect(logs).toHaveLength(1);
    const [rol, accion, modulo, detalle, usuario] = logs[0] as [string, string, string, Record<string, unknown>, string];
    expect([rol, accion, modulo, usuario]).toEqual(["contabilidad", "guardar_horario", "asistencia", "yulissa"]);
    expect(detalle.empleado_codigo).toBe("65");
    expect(detalle.antes).toMatchObject({ entrada: "08:00", salida: "04:30" });
    expect(detalle.despues).toMatchObject({ entrada: "08:00", salida: "16:30" });
  });
});
