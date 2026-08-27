// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — el usuario `david` NACE SIN PODER ENTRAR.
//
// La migración `20260827120000` lo crea con un centinela en vez de una
// contraseña, porque escribir una de verdad la dejaría en texto plano dentro
// del repo y del historial de git, para siempre. La contraseña se la pone
// Daniel en `/admin/usuarios`.
//
// 🩸 ESO SOLO SIRVE SI EL LOGIN DE VERDAD LO RECHAZA, y eso no se comprueba
// mirando el `if`: se comprueba LLAMANDO al handler. Un centinela que el login
// aceptara sería una cuenta abierta con una contraseña que está escrita en el
// repo — exactamente lo contrario de lo que se quiso hacer.
//
// El candado va en las DOS direcciones: el centinela no entra, y una contraseña
// bien hasheada SÍ entra. Sin la segunda mitad, un login roto que rechace a
// todo el mundo pasaría en verde.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import path from "path";

/** El MISMO centinela que escribe la migración. Se lee del .sql para que no
 *  puedan separarse: si alguien cambia uno, el otro deja de encontrarlo. */
const MIGRACION = path.join(
  process.cwd(),
  "supabase/migrations/20260827120000_boston_rol_y_usuario_david.sql",
);
const CENTINELA = "PENDIENTE-DANIEL-PONE-LA-CONTRASENA-EN-ADMIN-USUARIOS";

// Fila de david tal como la migración la deja en producción, más un usuario con
// contraseña de verdad para probar el otro lado.
const HASH_REAL = bcrypt.hashSync("una-clave-de-verdad", 10);
const USUARIOS = [
  { id: "u-david", name: "david", role: "gerente_boston", password: CENTINELA, active: true, is_owner: false, associated_company: null, modulos_override: null },
  { id: "u-otro", name: "otro", role: "secretaria", password: HASH_REAL, active: true, is_owner: false, associated_company: null, modulos_override: null },
];

function chain(result: unknown) {
  const self: Record<string, unknown> = {};
  const paso = () => () => self;
  Object.assign(self, {
    select: paso(), eq: paso(), insert: async () => ({ error: null }),
    update: paso(), single: async () => ({ data: null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
  });
  return self;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (tabla: string) =>
      chain(tabla === "fg_users" ? { data: USUARIOS, error: null } : { data: [], error: null }),
  },
  HAS_SERVICE_ROLE: true,
}));
vi.mock("@/lib/log-activity", () => ({ logActivity: async () => {} }));
vi.mock("@/lib/login-rate-limit", () => ({
  getLoginLock: async () => ({ locked: false, retryAfter: 0 }),
  registerLoginFailure: async () => ({ locked: false, retryAfter: 0 }),
  clearLoginAttempts: async () => {},
}));

import { POST as login } from "@/app/api/auth/route";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-david"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

const intentar = (password: string) =>
  login(new NextRequest("https://fashiongr.com/api/auth", {
    method: "POST",
    body: JSON.stringify({ password }),
    headers: { "content-type": "application/json" },
  }));

describe("david nace sin poder entrar", () => {
  it("la migración escribe EXACTAMENTE ese centinela", () => {
    const sql = readFileSync(MIGRACION, "utf-8");
    expect(sql).toContain(CENTINELA);
    // Y no un hash de bcrypt de verdad metido en el repo.
    expect(sql).not.toMatch(/\$2[ab]\$\d{2}\$/);
  });

  it("🔴 el centinela NO abre la sesión: 401", async () => {
    const res = await intentar(CENTINELA);
    expect(res.status).toBe(401);
  });

  it("🔴 tampoco en minúsculas (el login prueba las dos formas)", async () => {
    const res = await intentar(CENTINELA.toLowerCase());
    expect(res.status).toBe(401);
  });

  it("y no es que el login rechace a todos: una contraseña real SÍ entra", async () => {
    const res = await intentar("una-clave-de-verdad");
    expect(res.status).toBe(200);
    const j = await res.json();
    // Entra el OTRO usuario, nunca david.
    expect(j.userName).toBe("otro");
    expect(j.role).not.toBe("gerente_boston");
  });

  it("cuando Daniel le ponga una de verdad, david entra con SUS módulos", async () => {
    USUARIOS[0].password = bcrypt.hashSync("la-de-david", 10);
    try {
      const res = await intentar("la-de-david");
      expect(res.status).toBe(200);
      const j = await res.json();
      expect(j.userName).toBe("david");
      expect(j.role).toBe("gerente_boston");
      // 🔴 Y con SUS módulos: `boston` + `catalogos`.
      //
      // ⚠️ CAMBIÓ DE DIRECCIÓN el 27-ago-2026. Exigía UN solo módulo —lo que
      // disparaba el auto-redirect de «rol de módulo único»— y Daniel decidió
      // después: «catalogo para david si, solo eso». Con dos módulos ese
      // redirect ya no lo alcanza: lo que lo aterriza en /boston es su CASA
      // (`moduloCasaDeRol`), y eso lo vigila `boston-acceso.test.ts`. Lo que NO
      // se aflojó es el invariante: la lista sigue siendo EXACTA, así que un
      // tercer módulo pone el build rojo.
      expect([...j.modules].sort()).toEqual(["boston", "catalogos"]);
    } finally {
      USUARIOS[0].password = CENTINELA;
    }
  });
});
