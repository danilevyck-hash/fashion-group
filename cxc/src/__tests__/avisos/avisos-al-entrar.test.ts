// 🔴 «Activa los avisos» al entrar, para TODOS (25-nov-2026, `AVISOS_AL_ENTRAR_2026_11`).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { AVISOS_AL_ENTRAR_2026_11, decididoReciente, queOfrecer, rutaSinAviso } from "@/lib/avisos/al-entrar";

const guardadas: Array<[string, string, string]> = [];
let sesion: { role: string; userId: string; userName: string } | null = null;
let codigo: string | null = null;

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));
vi.mock("@/lib/session-cookie", () => ({ verifySession: () => sesion }));
vi.mock("@/lib/marcacion/acceso", () => ({ leerEmpleadoCodigo: async () => codigo }));
vi.mock("@/lib/avisos/suscripciones-server", () => ({
  usuarioDeAviso: (n: string | null | undefined) => (n ?? "").trim().toLowerCase(),
  guardarSuscripcionDeUsuario: async (u: string, s: { endpoint: string }) => { guardadas.push(["usuario", u.toLowerCase(), s.endpoint]); },
}));
vi.mock("@/lib/marcacion/recordatorios-server", async () => {
  const real = await vi.importActual<typeof import("@/lib/marcacion/recordatorios-server")>("@/lib/marcacion/recordatorios-server");
  return { validarSuscripcion: real.validarSuscripcion, guardarSuscripcion: async (c: string, s: { endpoint: string }) => { guardadas.push(["marcacion", c, s.endpoint]); } };
});

const SUB = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } };
const put = async (cuerpo: unknown) => {
  const { PUT } = await import("@/app/api/avisos/route");
  return PUT(new NextRequest("http://x/api/avisos", { method: "PUT", body: JSON.stringify(cuerpo), headers: { "content-type": "application/json" } }));
};

beforeEach(() => { guardadas.length = 0; sesion = null; codigo = null; });

describe("qué se le ofrece a este aparato", () => {
  it("prendido (lo publicado)", () => expect(AVISOS_AL_ENTRAR_2026_11).toBe(true));
  it("sin permiso todavía → pedir; iPhone en Safari → instalar; bloqueado → nada", () => {
    expect(queOfrecer({ estado: "falta", iphoneSinInstalar: false, yaDecidido: false })).toBe("pedir");
    expect(queOfrecer({ estado: "no-puede", iphoneSinInstalar: true, yaDecidido: false })).toBe("instalar");
    expect(queOfrecer({ estado: "no-puede", iphoneSinInstalar: false, yaDecidido: false })).toBe("nada");
    expect(queOfrecer({ estado: "bloqueado", iphoneSinInstalar: false, yaDecidido: false })).toBe("nada");
  });
  it("«Ahora no» no insiste en la sesión; el que ya está activo se guarda a su nombre", () => {
    expect(queOfrecer({ estado: "falta", iphoneSinInstalar: false, yaDecidido: true })).toBe("nada");
    expect(queOfrecer({ estado: "activo", iphoneSinInstalar: false, yaDecidido: false })).toBe("sincronizar");
  });
  it("computadora o iPad: ni pedir ni instalar, pero sí sincronizar", () => {
    expect(queOfrecer({ estado: "falta", iphoneSinInstalar: false, yaDecidido: false, esComputadora: true })).toBe("nada");
    expect(queOfrecer({ estado: "no-puede", iphoneSinInstalar: true, yaDecidido: false, esComputadora: true })).toBe("nada");
    expect(queOfrecer({ estado: "activo", iphoneSinInstalar: false, yaDecidido: true, esComputadora: true })).toBe("sincronizar");
  });
  it("ya activado o bloqueado: nunca la ventana", () => {
    expect(queOfrecer({ estado: "activo", iphoneSinInstalar: false, yaDecidido: false, esComputadora: false })).toBe("sincronizar");
    expect(queOfrecer({ estado: "bloqueado", iphoneSinInstalar: true, yaDecidido: false, esComputadora: false })).toBe("nada");
  });
  it("«Ahora no» vale 7 días; después vuelve; lo ilegible no cuenta", () => {
    const ahora = Date.UTC(2026, 10, 26);
    const dia = 86_400_000;
    expect(decididoReciente(String(ahora - 6 * dia), ahora)).toBe(true);
    expect(decididoReciente(String(ahora - 7 * dia), ahora)).toBe(false);
    expect(decididoReciente(null, ahora)).toBe(false);
    expect(decididoReciente("1", ahora)).toBe(false);
    expect(decididoReciente("basura", ahora)).toBe(false);
    expect(decididoReciente(String(ahora + dia), ahora)).toBe(false);
  });
  it("ni en el login ni en Marcación (que trae su propio aviso)", () => {
    expect(rutaSinAviso("/")).toBe(true);
    expect(rutaSinAviso("/marcacion")).toBe(true);
    expect(rutaSinAviso("/despachos")).toBe(false);
  });
  it("está montado en el marco de toda la app", () => {
    expect(readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8")).toContain("<AvisosAlEntrar />");
  });
});

describe("/api/avisos", () => {
  it("sin sesión: 401 y no guarda nada", async () => {
    expect((await put({ suscripcion: SUB })).status).toBe(401);
    expect(guardadas).toEqual([]);
  });
  it("guarda el aparato a nombre del usuario de la SESIÓN, nunca del cuerpo", async () => {
    sesion = { role: "vendedor", userId: "u9", userName: "Rey" };
    expect((await put({ suscripcion: SUB, usuario: "edwin" })).status).toBe(200);
    expect(guardadas).toEqual([["usuario", "rey", SUB.endpoint]]);
  });
  it("quien marca asistencia queda también donde lo busca Marcación", async () => {
    sesion = { role: "marcacion", userId: "u7", userName: "silenys" };
    codigo = "308";
    expect((await put({ suscripcion: SUB })).status).toBe(200);
    expect(guardadas).toEqual([["usuario", "silenys", SUB.endpoint], ["marcacion", "308", SUB.endpoint]]);
  });
  it("una suscripción mala: 400", async () => {
    sesion = { role: "vendedor", userId: "u9", userName: "rey" };
    expect((await put({ suscripcion: { endpoint: "http://no" } })).status).toBe(400);
  });
});
