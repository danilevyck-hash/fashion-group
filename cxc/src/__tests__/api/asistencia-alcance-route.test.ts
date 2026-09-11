// ─────────────────────────────────────────────────────────────────────────────
// GET /api/asistencia/alcance — contesta con la MISMA lectura que recorta la
// planilla y las aprobaciones (`leerAlcanceAprobador`), y nada más (11-sep-2026).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-alcance"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

// El reparto vivo: Bodega (Julio) → fashion_wear + vistana; david → boston.
const FILAS = [
  { usuario: "Bodega", empresa: "fashion_wear" },
  { usuario: "Bodega", empresa: "vistana" },
  { usuario: "david", empresa: "confecciones_boston" },
];
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: { from: () => ({ select: () => Promise.resolve({ data: FILAS, error: null }) }) },
}));

const { GET } = await import("@/app/api/asistencia/alcance/route");

function pedir(role: string, userName: string, modules: string[]) {
  const cookie = signSession({ role, userId: "u", userName, sessionToken: "t", modules });
  return GET(new NextRequest("http://x/api/asistencia/alcance", { headers: { cookie: `cxc_session=${cookie}` } }));
}

describe("GET /api/asistencia/alcance", () => {
  it("bodega (Julio): exactamente sus dos empresas", async () => {
    const r = await pedir("bodega", "bodega", ["asistencia"]);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect([...j.empresas].sort()).toEqual(["fashion_wear", "vistana"]);
  });
  it("admin: `null` = las cuatro, sin mirar la tabla", async () => {
    const r = await pedir("admin", "daniel", ["asistencia"]);
    expect((await r.json()).empresas).toBeNull();
  });
  it("contabilidad (quien cierra la planilla): `null`, las tres, Boston incluida", async () => {
    const r = await pedir("contabilidad", "yulissa", ["asistencia"]);
    expect((await r.json()).empresas).toBeNull();
  });
  it("🔴 David: Boston y nada más, por su rol", async () => {
    const r = await pedir("gerente_boston", "david", ["boston"]);
    expect((await r.json()).empresas).toEqual(["confecciones_boston"]);
  });
  it("sin sesión 401; con un rol sin el módulo, 403", async () => {
    expect((await GET(new NextRequest("http://x/api/asistencia/alcance"))).status).toBe(401);
    expect((await pedir("vendedor", "edwin", ["cxc"])).status).toBe(403);
  });
});
