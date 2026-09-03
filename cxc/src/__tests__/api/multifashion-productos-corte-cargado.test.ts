// ─────────────────────────────────────────────────────────────────────────────
// 🩸 Multifashion › Productos — el comparativo corta donde llegó la tabla.
//
// `switch_articulo_diario` se carga a las 03:40 de Panamá y llega hasta AYER.
// La ruta cortaba el año pasado en HOY, así que el año pasado llevaba un día
// de más, siempre. Medido el 3-sep-2026: septiembre decía +4,2% (1–3 sep 2025)
// y crecía +46,1% (1–2 sep 2025) — el Resumen de al lado ya decía lo segundo.
//
// Se llama al handler REAL con una cookie firmada y se mira qué ventana le
// pide a la RPC para el comparativo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";

const estado = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  ultimoDiaCargado: "2026-09-02" as string | null,
  corteFalla: false,
}));

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      estado.rpc.push({ fn, args });
      if (fn === "multifashion_articulo_diario_agrupado_v1") return { data: { n: 0, f: [] }, error: null };
      if (fn === "multifashion_articulo_marca_v1") return { data: [], error: null };
      return { data: null, error: { code: "PGRST202", message: "no existe" } };
    },
    from: () => {
      const q = {
        select: () => q, eq: () => q, gte: () => q, lte: () => q, order: () => q,
        limit: async () =>
          estado.corteFalla
            ? { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }
            : { data: estado.ultimoDiaCargado ? [{ fecha: estado.ultimoDiaCargado }] : [], error: null },
      };
      return q;
    },
  },
  HAS_SERVICE_ROLE: true,
}));

const { GET } = await import("@/app/api/multifashion/productos/route");

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-mf-corte"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });
afterEach(() => { vi.useRealTimers(); estado.rpc.length = 0; estado.corteFalla = false; estado.ultimoDiaCargado = "2026-09-02"; });

function req(url: string) {
  const cookie = signSession({ role: "admin", userId: "u1", userName: "test", sessionToken: "t1" });
  return new NextRequest(`https://fashiongr.com${url}`, { headers: { cookie: `cxc_session=${cookie}` } });
}

const ventanasPedidas = () =>
  estado.rpc.filter(r => r.fn === "multifashion_articulo_diario_agrupado_v1").map(r => `${r.args.p_desde}→${r.args.p_hasta}`);

describe("el comparativo del mes en curso", () => {
  it("🩸 corta en el último día CARGADO (2-sep), no en hoy (3-sep)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-03T18:18:00Z")); // 13:18 en Panamá
    const body = await (await GET(req("/api/multifashion/productos?year=2026&mes=9&periodo=mes"))).json();
    expect(ventanasPedidas()).toEqual(["2026-09-01→2026-09-30", "2025-09-01→2025-09-02"]);
    expect(body.comparativo).toMatchObject({ desde: "2025-09-01", hasta: "2025-09-02", parcial: true });
  });

  it("sin nada cargado el corte es hoy de Panamá (a las 9 p.m. sigue siendo el 3)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-04T02:00:00Z")); // 3-sep 21:00 en Panamá
    estado.ultimoDiaCargado = null;
    await GET(req("/api/multifashion/productos?year=2026&mes=9&periodo=mes"));
    expect(ventanasPedidas()[1]).toBe("2025-09-01→2025-09-03");
  });

  it("«12 meses» también recorta la punta de hoy a lo cargado", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-03T18:18:00Z"));
    await GET(req("/api/multifashion/productos?year=2026&mes=9&periodo=12m"));
    expect(ventanasPedidas()).toEqual(["2025-10-01→2026-09-03", "2024-10-01→2025-09-02"]);
  });

  it("🔴 si el corte no se puede leer, el comparativo FALLA ABIERTO: null y el motivo, no «hoy»", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-03T18:18:00Z"));
    estado.corteFalla = true;
    const res = await GET(req("/api/multifashion/productos?year=2026&mes=9&periodo=mes"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.comparativo).toBeNull();
    expect(body.comparativoError).toMatch(/switch_articulo_diario MAX\(fecha\)/);
    // El período actual sí se pidió; el comparativo, nunca.
    expect(ventanasPedidas()).toEqual(["2026-09-01→2026-09-30"]);
  });
});
