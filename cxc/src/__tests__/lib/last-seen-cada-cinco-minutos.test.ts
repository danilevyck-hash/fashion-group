/**
 * 🔴 `last_seen` NO SE ESCRIBE EN CADA PETICIÓN (19-sep-2026).
 *
 * 🩸 El middleware disparaba un PATCH a `user_sessions` en CADA petición con
 * sesión, de CADA persona, sin esperar la respuesta. Sentry lo reportó como el
 * renglón más caro de la semana: p95 de 2 minutos y 2,3 días de duración total
 * en promesas abandonadas en el borde. La base contesta en ~200 ms: no era una
 * consulta lenta, eran demasiadas.
 *
 * La regla desde entonces: como mucho UN PATCH cada 5 minutos por sesión, sin
 * agregar un `await` en el camino de la petición (eso le costaría ~200 ms a cada
 * navegación de cada persona), y fallando siempre hacia ESCRIBIR.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  COOKIE_ULTIMO_TOQUE,
  INTERVALO_TOQUE_MS,
  debeTocarSesion,
  marcaDeToque,
} from "@/lib/session-touch";
import { DIAS_INACTIVIDAD } from "@/lib/session-retention";

const raiz = join(__dirname, "..", "..", "..");
const middleware = readFileSync(join(raiz, "src", "middleware.ts"), "utf8");

const AHORA = Date.parse("2026-09-19T12:00:00.000Z");

describe("last_seen · como mucho una vez cada 5 minutos por sesión", () => {
  it("el intervalo es de 5 minutos", () => {
    expect(INTERVALO_TOQUE_MS).toBe(5 * 60 * 1000);
  });

  it("recién tocada (hace 1 minuto) → NO se vuelve a escribir", () => {
    expect(debeTocarSesion(marcaDeToque(AHORA - 60_000), AHORA)).toBe(false);
  });

  it("justo en el borde de los 5 minutos → se escribe", () => {
    expect(debeTocarSesion(marcaDeToque(AHORA - INTERVALO_TOQUE_MS), AHORA)).toBe(true);
    expect(debeTocarSesion(marcaDeToque(AHORA - INTERVALO_TOQUE_MS + 1), AHORA)).toBe(false);
  });

  it("hace media hora → se escribe", () => {
    expect(debeTocarSesion(marcaDeToque(AHORA - 30 * 60_000), AHORA)).toBe(true);
  });

  it("ante la duda, ESCRIBIR: sin marca, ilegible, vacía o del futuro", () => {
    expect(debeTocarSesion(undefined, AHORA)).toBe(true);
    expect(debeTocarSesion(null, AHORA)).toBe(true);
    expect(debeTocarSesion("", AHORA)).toBe(true);
    expect(debeTocarSesion("ayer", AHORA)).toBe(true);
    expect(debeTocarSesion("12.5", AHORA)).toBe(true);
    expect(debeTocarSesion("-1000", AHORA)).toBe(true);
    // Marca del futuro (reloj corrido o cookie tocada a mano): se escribe igual.
    expect(debeTocarSesion(marcaDeToque(AHORA + 60_000), AHORA)).toBe(true);
  });

  it("5 minutos de retraso caben de sobra en los 14 días de la retención", () => {
    // `session-retention.ts` revoca a los DIAS_INACTIVIDAD sin `last_seen`, y su
    // comentario dice que ese margen existe «por si el PATCH fire-and-forget
    // falla». Mientras el intervalo sea una fracción mínima de esa ventana,
    // atrasar el toque no puede desloguear a nadie.
    const ventanaMs = DIAS_INACTIVIDAD * 24 * 60 * 60 * 1000;
    expect(INTERVALO_TOQUE_MS).toBeLessThan(ventanaMs / 1000);
  });
});

describe("middleware · el PATCH está detrás de la regla", () => {
  it("no llama touchSession sin preguntar antes", () => {
    const llamadas = middleware.match(/^\s*(?:if \([^)]*\) )?touchSession\(/gm) ?? [];
    expect(llamadas.length, "se esperaba UNA sola llamada a touchSession").toBe(1);
    expect(llamadas[0]).toMatch(/if \(\w+\) touchSession\(/);
  });

  it("la regla la decide `debeTocarSesion`, no una copia local del número", () => {
    expect(middleware).toMatch(/import \{[\s\S]*debeTocarSesion[\s\S]*\} from "@\/lib\/session-touch"/);
    expect(middleware).toContain("debeTocarSesion(req.cookies.get(");
    // El intervalo no se re-escribe a mano en el middleware.
    expect(middleware).not.toMatch(/5\s*\*\s*60\s*\*\s*1000/);
  });

  it("la marca viaja con la petición (cookie), no en memoria del borde", () => {
    expect(COOKIE_ULTIMO_TOQUE).toBe("cxc_ultimo_toque");
    expect(middleware).toContain("res.cookies.set(COOKIE_ULTIMO_TOQUE");
    // Y muere con la sesión: el próximo login escribe en su primera petición.
    expect(middleware).toContain("res.cookies.delete(COOKIE_ULTIMO_TOQUE)");
  });

  it("sigue SIN `await` en el camino de la petición (eso costaría ~200 ms)", () => {
    expect(middleware).not.toMatch(/await\s+touchSession\(/);
    const cuerpo = middleware.slice(middleware.indexOf("function touchSession"));
    const fin = cuerpo.indexOf("\nfunction ", 1);
    expect(cuerpo.slice(0, fin === -1 ? undefined : fin)).not.toContain("await");
  });
});
