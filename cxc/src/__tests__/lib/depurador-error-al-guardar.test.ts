import { describe, it, expect } from "vitest";
import { mensajeDelServidor } from "@/lib/depurador/error-al-guardar";

describe("mensajeDelServidor", () => {
  it("usa el error que manda el servidor", async () => {
    const res = new Response(JSON.stringify({ error: "La base no acepta ese redondeo." }), { status: 500 });
    expect(await mensajeDelServidor(res, "respaldo")).toBe("La base no acepta ese redondeo.");
  });
  it("sin cuerpo legible, usa el respaldo", async () => {
    expect(await mensajeDelServidor(new Response("<html>", { status: 502 }), "respaldo")).toBe("respaldo");
    expect(await mensajeDelServidor(new Response(JSON.stringify({ error: "" }), { status: 500 }), "respaldo")).toBe("respaldo");
  });
});
