/**
 * 🔴 La sesión comprobada no se vuelve a preguntar a la base durante 60 s
 * (7-oct-2026). Medido: la pregunta del middleware tardaba 246 ms (p50) y
 * 358 ms (p95) en CADA petición. Solo se recuerda un «sí» definitivo.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  sesionValidaConCache,
  _vaciarCacheDeSesiones,
  TTL_SESION_VALIDA_MS,
  type Veredicto,
} from "@/lib/session-valid-cache";

const T0 = Date.parse("2026-10-07T15:00:00.000Z");

function base(respuesta: Veredicto) {
  const llamadas: string[] = [];
  const consultar = async (t: string) => { llamadas.push(t); return respuesta; };
  return { llamadas, consultar };
}

beforeEach(() => _vaciarCacheDeSesiones());

describe("sesión válida en caché", () => {
  it("un «sí» definitivo no se vuelve a preguntar dentro de los 60 s", async () => {
    const b = base({ valida: true, definitiva: true });
    expect(await sesionValidaConCache("a", b.consultar, T0)).toBe(true);
    expect(await sesionValidaConCache("a", b.consultar, T0 + TTL_SESION_VALIDA_MS - 1)).toBe(true);
    expect(b.llamadas).toEqual(["a"]);
  });

  it("a los 60 s se vuelve a preguntar (y una revocada deja de pasar)", async () => {
    const b = base({ valida: true, definitiva: true });
    await sesionValidaConCache("a", b.consultar, T0);
    const revocada = base({ valida: false, definitiva: true });
    expect(await sesionValidaConCache("a", revocada.consultar, T0 + TTL_SESION_VALIDA_MS)).toBe(false);
    expect(revocada.llamadas).toEqual(["a"]);
  });

  it("un «no» nunca se guarda: se pregunta cada vez", async () => {
    const b = base({ valida: false, definitiva: true });
    expect(await sesionValidaConCache("x", b.consultar, T0)).toBe(false);
    expect(await sesionValidaConCache("x", b.consultar, T0 + 1)).toBe(false);
    expect(b.llamadas.length).toBe(2);
  });

  it("el «sí por las dudas» (la base no contestó) deja pasar pero no se guarda", async () => {
    const b = base({ valida: true, definitiva: false });
    expect(await sesionValidaConCache("a", b.consultar, T0)).toBe(true);
    expect(await sesionValidaConCache("a", b.consultar, T0 + 1)).toBe(true);
    expect(b.llamadas.length).toBe(2);
  });

  it("las llamadas que salen juntas esperan UNA sola consulta", async () => {
    const b = base({ valida: true, definitiva: true });
    const r = await Promise.all([1, 2, 3, 4, 5].map(() => sesionValidaConCache("a", b.consultar, T0)));
    expect(r.every(Boolean)).toBe(true);
    expect(b.llamadas).toEqual(["a"]);
  });

  it("cada token es suyo: el de otra persona se pregunta aparte", async () => {
    const b = base({ valida: true, definitiva: true });
    await sesionValidaConCache("a", b.consultar, T0);
    await sesionValidaConCache("b", b.consultar, T0);
    expect(b.llamadas).toEqual(["a", "b"]);
  });

  it("el middleware pasa por la caché y no pregunta a la base por su cuenta", () => {
    const mw = readFileSync(join(__dirname, "..", "..", "middleware.ts"), "utf8");
    expect(mw).toMatch(/sesionValidaConCache\(parsed\.sessionToken, consultarSesion\)/);
    expect(mw).not.toMatch(/isSessionValid\(/);
  });
});
