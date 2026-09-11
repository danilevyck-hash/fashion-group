/* ─────────────────────────────────────────────────────────────────────────────
 * LA RUTA GUARDA EL 0 Y LO DEVUELVE COMO 0 — no como vacío.
 *
 * `POST /api/asistencia/planilla` (11-sep-2026, migración 20261115120000):
 * «Préstamo» y «Terceros» tienen tres estados y el 0 es una decisión («esta
 * quincena no se descuenta»). Si la ruta lo normalizara a «vacío» —lo que hacía
 * hasta ese día— la decisión se perdería al guardar y la cuota volvería sola.
 *
 * Es un test de CONDUCTA: se llama al handler real con la base mockeada y se
 * mira qué fila fue al `upsert` y qué contestó.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/** La última fila que fue al upsert de `asistencia_planilla_manual`. */
let UPSERT: Record<string, unknown> | null = null;

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userName: "Daniel", userId: "1", sessionToken: "t", modules: [] }),
}));
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    from: (t: string) => ({
      upsert: (fila: Record<string, unknown>) => {
        if (t === "asistencia_planilla_manual") UPSERT = fila;
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

async function post(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/asistencia/planilla/route");
  const req = new NextRequest("http://x/api/asistencia/planilla", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  });
  const res = (await POST(req)) as NextResponse;
  return { status: res.status, json: await res.json() };
}

beforeEach(() => { UPSERT = null; });

describe("POST /api/asistencia/planilla — el 0 de préstamo/terceros se guarda y se devuelve como 0", () => {
  it("🔴 `prestamo: 0` → la fila lleva prestamo 0 y la respuesta dice 0 (no null, no vacío)", async () => {
    const r = await post({ quincena: "2026-09-1", codigo: "10", isr: 25.5, prestamo: 0, terceros: null, mercancia: 0, otrosServicios: 0 });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.manuales.prestamo).toBe(0);
    expect(r.json.manuales.terceros).toBeNull();
    expect(UPSERT).toMatchObject({ quincena: "2026-09-1", empleado_codigo: "10", isr: 25.5, prestamo: 0, terceros: null });
  });

  it("vacío (null, ausente o «») → null: vuelve la cuota automática", async () => {
    for (const cuerpo of [{}, { prestamo: null }, { prestamo: "" }]) {
      const r = await post({ quincena: "2026-09-1", codigo: "10", ...cuerpo });
      expect(r.json.manuales.prestamo, JSON.stringify(cuerpo)).toBeNull();
      expect(UPSERT!.prestamo, JSON.stringify(cuerpo)).toBeNull();
    }
  });

  it("un monto se guarda tal cual; «0» como texto también es 0; basura y negativos caen en null", async () => {
    expect((await post({ quincena: "2026-09-1", codigo: "10", prestamo: 35 })).json.manuales.prestamo).toBe(35);
    expect((await post({ quincena: "2026-09-1", codigo: "10", terceros: "0" })).json.manuales.terceros).toBe(0);
    expect((await post({ quincena: "2026-09-1", codigo: "10", prestamo: -5 })).json.manuales.prestamo).toBeNull();
    expect((await post({ quincena: "2026-09-1", codigo: "10", prestamo: "abc" })).json.manuales.prestamo).toBeNull();
  });

  it("CONTROL: en las otras tres casillas el 0 sigue siendo 0 y el vacío también (no hay null)", async () => {
    const r = await post({ quincena: "2026-09-1", codigo: "10", isr: "", mercancia: null, otrosServicios: -3 });
    expect(r.json.manuales.isr).toBe(0);
    expect(r.json.manuales.mercancia).toBe(0);
    expect(r.json.manuales.otrosServicios).toBe(0);
    expect(UPSERT).toMatchObject({ isr: 0, mercancia: 0, otros_servicios: 0 });
  });
});
