// ─────────────────────────────────────────────────────────────────────────────
// JUSTIFICACIONES — CONDUCTA: la ruta REAL, mirando la fila que se escribe.
//
// 🔴 POR QUÉ ESTE ARCHIVO EXISTE. Que `MOTIVOS_JUSTIFICACION` tenga cuatro
// elementos no prueba NADA sobre lo que se puede guardar: esconder «Otro» del
// desplegable sin cerrar la ruta es cosmético, y en tres meses vuelve por la
// puerta de atrás —un script, un `curl`, una pantalla vieja en caché—. Lo
// mismo con el permiso de horas: si la ruta acepta media ventana, el CHECK de
// la base tira un 500 feo en vez de un mensaje que se entienda.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const insertados: Array<Record<string, unknown>> = [];
let respuestas: Array<{ error: unknown }> = [];

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userName: "Daniel", userId: "1", sessionToken: "t" }),
}));
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    from: () => ({
      insert: (fila: Record<string, unknown>) => {
        insertados.push(fila);
        return Promise.resolve(respuestas.shift() ?? { error: null });
      },
    }),
  },
}));

import { POST } from "@/app/api/asistencia/justificaciones/route";
import { MOTIVOS_RETIRADOS } from "@/lib/asistencia/motivos";
import { MIGRACION_PERMISO_HORAS } from "@/lib/asistencia/permiso-horas";

const pedido = (body: unknown) => ({ json: async () => body }) as never;
const base = { codigo: "44", desde: "2026-08-03", hasta: "2026-08-03", motivo: "Escolares" };

beforeEach(() => { insertados.length = 0; respuestas = []; });

describe("🔴 los motivos retirados no se pueden guardar, ni por la puerta de atrás", () => {
  it("un motivo que la pantalla ya no ofrece se rechaza con 400 y NO escribe", async () => {
    for (const m of MOTIVOS_RETIRADOS) {
      insertados.length = 0;
      const res = await POST(pedido({ ...base, motivo: m }));
      expect(res.status, `«${m}» entró`).toBe(400);
      expect(insertados).toHaveLength(0);
      const d = await res.json();
      // El mensaje dice cuáles SÍ se pueden, no solo que ése no.
      expect(d.error).toContain("Incapacidad");
    }
  });

  it("un motivo inventado tampoco entra", async () => {
    const res = await POST(pedido({ ...base, motivo: "Se le dañó el carro" }));
    expect(res.status).toBe(400);
    expect(insertados).toHaveLength(0);
  });

  it("los cuatro que sí se ofrecen entran", async () => {
    for (const m of ["Incapacidad", "Catástrofe", "Escolares", "Trabajo de vendedor"]) {
      insertados.length = 0;
      const res = await POST(pedido({ ...base, motivo: m }));
      expect(res.status, `«${m}» fue rechazado`).toBe(200);
      expect(insertados[0].motivo).toBe(m);
    }
  });
});

describe("🔴 el permiso de horas: las dos, o ninguna", () => {
  it("sin horas se guarda como siempre, y sin las columnas en el cuerpo", async () => {
    const res = await POST(pedido(base));
    expect(res.status).toBe(200);
    expect("hora_desde" in insertados[0]).toBe(false);
    expect("hora_hasta" in insertados[0]).toBe(false);
  });

  it("con las dos horas se guardan las dos", async () => {
    const res = await POST(pedido({ ...base, horaDesde: "08:00", horaHasta: "10:00" }));
    expect(res.status).toBe(200);
    expect(insertados[0].hora_desde).toBe("08:00");
    expect(insertados[0].hora_hasta).toBe("10:00");
  });

  it("media ventana y una ventana al revés se rechazan ANTES de tocar la base", async () => {
    for (const malo of [
      { horaDesde: "08:00" },
      { horaHasta: "10:00" },
      { horaDesde: "10:00", horaHasta: "08:00" },
      { horaDesde: "08:00", horaHasta: "08:00" },
      { horaDesde: "veinticinco", horaHasta: "10:00" },
    ]) {
      insertados.length = 0;
      const res = await POST(pedido({ ...base, ...malo }));
      expect(res.status, JSON.stringify(malo)).toBe(400);
      expect(insertados).toHaveLength(0);
    }
  });

  it("🩸 SIN LAS COLUMNAS: una justificación de día entero sigue guardándose", async () => {
    respuestas = [{ error: { code: "42703", message: "column hora_desde does not exist" } }];
    const res = await POST(pedido(base));
    expect(res.status).toBe(200);
    // Se reintentó sin las columnas, y la justificación quedó guardada.
    expect(insertados).toHaveLength(2);
    expect("hora_desde" in insertados[1]).toBe(false);
    expect(insertados[1].motivo).toBe("Escolares");
  });

  it("🔴 SIN LAS COLUMNAS: un permiso de horas NO se guarda a medias", async () => {
    // 🩸 Una justificación que se traga las horas pasa a justificar el DÍA
    // ENTERO —ocho horas de sueldo— y nadie sabría por qué.
    respuestas = [{ error: { code: "42703", message: "column hora_desde does not exist" } }];
    const res = await POST(pedido({ ...base, horaDesde: "08:00", horaHasta: "10:00" }));
    expect(res.status).toBe(503);
    const d = await res.json();
    expect(d.faltaMigracionHoras).toBe(true);
    expect(d.error).toContain(MIGRACION_PERMISO_HORAS);
    // Y NO se reintentó: una sola escritura, la que falló.
    expect(insertados).toHaveLength(1);
  });
});
