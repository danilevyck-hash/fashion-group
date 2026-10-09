// @vitest-environment node
//
// 🔴 CANDADO — MÁXIMO 4 MARCAS POR DÍA DESDE EL TELÉFONO (9-oct-2026).
// Daniel: «cada persona debería de poder marcar 4 veces nada más». La pantalla
// apaga el botón, pero quien manda es el SERVIDOR: la 5.ª marca se rechaza con
// 409 y no se guarda nada.

import { describe, it, expect, vi, beforeEach } from "vitest";

const guardado: unknown[] = [];
let marcasHoy: { ocurrioEn: string }[] = [];

vi.mock("@/lib/marcacion/acceso", () => ({
  requireMarcacion: () => ({ role: "marcacion", userId: "u-1", userName: "ana" }),
  leerEmpleadoCodigo: async () => "2",
}));
vi.mock("@/lib/marcacion/selfie-servidor", () => ({
  subirSelfie: async (p: string) => ({ path: p, achicada: true }),
  borrarSelfies: async () => undefined,
}));
vi.mock("@/lib/asistencia/guardar-marcaciones", () => ({
  guardarMarcaciones: async (filas: unknown[]) => { guardado.push(...filas); return { error: null }; },
}));
vi.mock("@/lib/asistencia/mismo-aparato-io", () => ({ revisarMismoAparato: async () => undefined }));
vi.mock("@/lib/marcacion/lugar-al-marcar", () => ({ lugarTextoDeLaMarca: async () => null }));
vi.mock("@/lib/marcacion/estado-server", () => ({
  armarEstadoDeLaPantalla: async () => ({ codigo: "2" }),
  leerMarcasDeLaQuincena: async () => ({ quincena: { desde: "", hasta: "" }, marcas: marcasHoy }),
  marcaYaGuardada: async () => false,
  nombreDeLaFicha: async () => "ANA",
}));

function form(): FormData {
  const f = new FormData();
  f.set("eventoId", crypto.randomUUID());
  f.set("tipo", "salida");
  f.set("sinSenal", "0");
  f.set("lat", "8.98"); f.set("lng", "-79.52"); f.set("precisionM", "10");
  f.set("selfie", new File([new Uint8Array([1, 2, 3])], "s.jpg", { type: "image/jpeg" }));
  return f;
}

/** `n` marcas de HOY (Panamá), una por hora desde las 8:00. */
function marcasDeHoy(n: number) {
  const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  return Array.from({ length: n }, (_, i) => ({
    ocurrioEn: new Date(`${hoy}T${String(8 + i).padStart(2, "0")}:00:00-05:00`).toISOString(),
  }));
}

async function marcar() {
  const { POST } = await import("@/app/api/marcacion/route");
  const { NextRequest } = await import("next/server");
  return POST(new NextRequest("http://x/api/marcacion", { method: "POST", body: form() }));
}

describe("🔴 la 5.ª marca del teléfono se rechaza en el servidor", () => {
  beforeEach(() => { guardado.length = 0; });

  it("con 4 marcas hoy: 409, «Ya se registraron las 4 marcas del día», nada guardado", async () => {
    marcasHoy = marcasDeHoy(4);
    const res = await marcar();
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.error).toContain("Ya se registraron las 4 marcas del día.");
    expect(guardado).toHaveLength(0);
  });

  it("con 3 marcas hoy, la 4.ª entra", async () => {
    marcasHoy = marcasDeHoy(3);
    const res = await marcar();
    expect(res.status).toBe(200);
    expect(guardado).toHaveLength(1);
  });
});
