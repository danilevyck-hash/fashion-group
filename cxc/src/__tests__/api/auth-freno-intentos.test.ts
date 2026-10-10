// El freno por intentos fallidos del inicio de sesión (9-oct-2026).
// Daniel: «no permitas que se bloquee a todos por 15 minutos». El tope por red
// pasó de 5 a 100: una persona nunca lo alcanza; un programa sí.
//
// La cuenta vive en la base (`register_login_failure`, migración
// 20260608130000). Acá se imita esa función en memoria, con la misma regla
// (bloquea cuando la cuenta LLEGA a p_max), y se pasa por la ruta de verdad,
// que es la que le entrega el número.

import { describe, it, expect, vi, beforeEach } from "vitest";

const base = vi.hoisted(() => ({ filas: new Map<string, { cuenta: number; hasta: number }>() }));

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (tabla: string) => {
      if (tabla === "login_attempts") {
        return { select: () => ({ eq: (_c: string, ip: string) => ({ maybeSingle: async () => {
          const f = base.filas.get(ip);
          return { data: f?.hasta ? { locked_until: new Date(f.hasta).toISOString() } : null, error: null };
        } }) }) };
      }
      if (tabla === "fg_users") {
        return { select: () => ({ eq: async () => ({ data: [{ id: "1", name: "ana", role: "secretaria", password: "$2a$hash", active: true }], error: null }) }) };
      }
      return { insert: async () => ({ error: null }) };
    },
    rpc: async (fn: string, p: { p_ip: string; p_max: number; p_lockout_secs: number }) => {
      if (fn === "clear_login_attempts") { base.filas.delete(p.p_ip); return { error: null }; }
      const f = base.filas.get(p.p_ip) ?? { cuenta: 0, hasta: 0 };
      f.cuenta += 1;
      const bloquea = f.cuenta >= p.p_max;
      if (bloquea) f.hasta = Date.now() + p.p_lockout_secs * 1000;
      base.filas.set(p.p_ip, f);
      return { data: [{ locked: bloquea, retry_after: bloquea ? p.p_lockout_secs : 0 }], error: null };
    },
  },
}));
vi.mock("@/lib/log-activity", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/sesion-payload", () => ({ armarPayloadSesion: async () => ({ role: "secretaria", userName: "ana" }) }));
vi.mock("@/lib/session-cookie", () => ({ signSession: () => "firmada", verifySession: () => null }));
vi.mock("bcryptjs", () => ({ default: { compare: async (clave: string) => clave === "la-buena" } }));

import { POST } from "@/app/api/auth/route";
import { MAX_FAILS } from "@/lib/login-rate-limit";
import { NextRequest } from "next/server";

const intento = async (password: string, ip = "190.0.0.1") =>
  (await POST(new NextRequest("http://localhost/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ password }),
  }))).status;

async function fallar(veces: number, ip?: string) {
  const estados: number[] = [];
  for (let i = 0; i < veces; i++) estados.push(await intento("mala", ip));
  return estados;
}

describe("Inicio de sesión — el freno por intentos fallidos no bloquea a las personas", () => {
  beforeEach(() => base.filas.clear());

  it("el tope es 100", () => expect(MAX_FAILS).toBe(100));

  for (const n of [5, 10, 50]) {
    it(`${n} intentos fallidos seguidos no bloquean: todos «Contraseña incorrecta» y después se entra`, async () => {
      expect(new Set(await fallar(n))).toEqual(new Set([401]));
      expect(await intento("la-buena")).toBe(200);
    });
  }

  it("un acierto no se ve afectado por los fallos de otro en la misma red", async () => {
    await fallar(50);
    expect(await intento("la-buena")).toBe(200);
    expect(await intento("mala")).toBe(401);
  });

  it("99 fallos no bloquean; el fallo 100 activa el freno y el intento 101 ya no entra, ni con la contraseña correcta", async () => {
    expect(new Set(await fallar(99))).toEqual(new Set([401]));
    expect(await intento("mala")).toBe(429);
    expect(await intento("la-buena")).toBe(429);
  });

  it("el freno es por red: otra red sigue entrando", async () => {
    await fallar(100);
    expect(await intento("la-buena", "190.0.0.2")).toBe(200);
  });
});
