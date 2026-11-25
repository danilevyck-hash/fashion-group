// 🔴 «Muestras» detrás de `MUESTRAS_2026_11`: `false` = lo de antes (sin
// sección, la ruta no existe y vuelven los botones a mano de la espera).
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

vi.mock("@/lib/requireRole", () => ({ requireRole: () => ({ role: "admin", userId: "d", userName: "daniel" }) }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: () => { throw new Error("no debe leer la base"); } } }));

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("el interruptor de Muestras", () => {
  it("apagado: la ruta contesta 404 y no lee la base", async () => {
    vi.stubEnv("NEXT_PUBLIC_MUESTRAS", "0");
    vi.resetModules();
    const lib = await import("@/lib/guias/muestras");
    expect(lib.MUESTRAS_2026_11).toBe(false);
    expect(lib.veSeccionMuestras("rey", "vendedor")).toBe(false);
    const { GET, POST, PATCH } = await import("@/app/api/guias/muestras/route");
    expect((await GET(new NextRequest("http://x/api/guias/muestras"))).status).toBe(404);
    expect((await POST(new NextRequest("http://x/api/guias/muestras", { method: "POST", body: "{}" }))).status).toBe(404);
    expect((await PATCH(new NextRequest("http://x/api/guias/muestras", { method: "PATCH", body: "{}" }))).status).toBe(404);
  });

  it("prendido (lo publicado)", async () => {
    const lib = await import("@/lib/guias/muestras");
    expect(lib.MUESTRAS_EN_CODIGO).toBe(true);
    expect(lib.MUESTRAS_2026_11).toBe(true);
  });

  it("los botones a mano «En espera de muestra» / «Quitar espera» quedan detrás del interruptor", () => {
    const vista = leer("src/app/despachos/components/PedidosView.tsx");
    const i = vista.indexOf('{enEspera ? "Quitar espera" : "En espera de muestra"}');
    expect(i).toBeGreaterThan(0);
    expect(vista.lastIndexOf("{!MUESTRAS && (", i)).toBeGreaterThan(vista.lastIndexOf("</button>", i));
  });

  it("el servidor ya no deja marcar la espera a mano con el interruptor prendido", () => {
    const ruta = leer("src/app/api/guias/pedidos/route.ts");
    const i = ruta.indexOf('typeof body?.muestra === "boolean"');
    const tramo = ruta.slice(i, i + 400);
    expect(tramo).toMatch(/if \(MUESTRAS_2026_11\) return NextResponse\.json\([^)]*status: 409/);
  });

  it("entrar a En preparación prende la espera si hay muestras pendientes", () => {
    const ruta = leer("src/app/api/guias/pedidos/route.ts");
    expect(ruta).toMatch(/MUESTRAS_2026_11 && estado === "en_preparacion"[\s\S]{0,120}sincronizarEspera\(empresa, id, quienFirma\)/);
  });
});
