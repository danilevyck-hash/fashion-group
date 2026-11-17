// @vitest-environment node
//
// 🔴 CANDADO — «PROBAR AVISO» (17-nov-2026). Exige sesión, manda solo a la
// suscripción de ESTE teléfono (la guarda a nombre del código de la SESIÓN si
// tiene ficha) y sin ficha no guarda nada.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse, NextRequest } from "next/server";

const enviados: { endpoint: string; cuerpo: string }[] = [];
const guardadas: { codigo: string; endpoint: string }[] = [];
let sesion: unknown = { role: "admin", userId: "u-daniel", userName: "daniel" };
let codigo: string | null = null;

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (s: { endpoint: string }, cuerpo: string) => void enviados.push({ endpoint: s.endpoint, cuerpo }),
  },
}));
vi.mock("@/lib/marcacion/acceso", () => ({
  requireMarcacion: () => sesion,
  leerEmpleadoCodigo: async () => codigo,
}));
vi.mock("@/lib/marcacion/recordatorios-server", async () => {
  const real = await vi.importActual<typeof import("@/lib/marcacion/recordatorios-server")>("@/lib/marcacion/recordatorios-server");
  return { validarSuscripcion: real.validarSuscripcion, guardarSuscripcion: async (c: string, s: { endpoint: string }) => void guardadas.push({ codigo: c, endpoint: s.endpoint }) };
});
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

const SUB = { endpoint: "https://web.push.apple.com/abc", keys: { p256dh: "p", auth: "a" } };
const pedir = (cuerpo: unknown) =>
  new NextRequest("http://x/api/marcacion/recordatorios/probar", { method: "POST", body: JSON.stringify(cuerpo) });

describe("Probar aviso", () => {
  beforeEach(() => {
    enviados.length = 0;
    guardadas.length = 0;
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    sesion = { role: "admin", userId: "u-daniel", userName: "daniel" };
    codigo = null;
  });

  it("sin sesión no manda nada", async () => {
    sesion = NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const { POST } = await import("@/app/api/marcacion/recordatorios/probar/route");
    expect((await POST(pedir({ suscripcion: SUB }))).status).toBe(401);
    expect(enviados).toEqual([]);
  });

  it("sin ficha (Daniel): manda a ESTE teléfono con el texto de prueba y no guarda nada", async () => {
    const { POST } = await import("@/app/api/marcacion/recordatorios/probar/route");
    expect((await POST(pedir({ suscripcion: SUB }))).status).toBe(200);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].endpoint).toBe(SUB.endpoint);
    const c = JSON.parse(enviados[0].cuerpo);
    expect(`${c.title} · ${c.body}`).toBe("Aviso de prueba · Así te llegará el recordatorio de marcación");
    expect(guardadas).toEqual([]);
  });

  it("con ficha: la guarda a nombre del código de la SESIÓN, aunque el cuerpo diga otro", async () => {
    codigo = "3";
    const { POST } = await import("@/app/api/marcacion/recordatorios/probar/route");
    await POST(pedir({ suscripcion: SUB, codigo: "306", empleado_codigo: "306" }));
    expect(guardadas).toEqual([{ codigo: "3", endpoint: SUB.endpoint }]);
    expect(enviados).toHaveLength(1);
  });

  it("sin suscripción válida: 400 y no manda", async () => {
    const { POST } = await import("@/app/api/marcacion/recordatorios/probar/route");
    expect((await POST(pedir({}))).status).toBe(400);
    expect(enviados).toEqual([]);
  });
});
