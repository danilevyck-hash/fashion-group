// ─────────────────────────────────────────────────────────────────────────────
// CANDADO del route /api/ventas/productos — QUÉ VENTANA LE PIDE A LA BASE.
//
// La pantalla no puede probar esto sola: desde el navegador se ve la URL que se
// pide, no las FECHAS con las que el servidor termina llamando a la RPC. Acá se
// llama al handler REAL con una cookie firmada y se lee `p_desde` / `p_hasta`
// del doble de Supabase.
//
// 🩸 LO QUE ESTO EXISTE PARA CAZAR:
//   · que `previo=1` devuelva el MISMO período (un Δ que compara contra sí
//     mismo da +0% en todas las filas y se lee como "no cambió nada");
//   · que un período nuevo caiga en el rango de otro;
//   · que el camino VIEJO (año en curso y mes suelto) haya cambiado una fecha —
//     esos números ya están publicados y no se pueden mover.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";

const { llamadas } = vi.hoisted(() => ({
  llamadas: [] as { fn: string; args: Record<string, unknown> }[],
}));

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      llamadas.push({ fn, args });
      if (fn === "switch_top_descripciones") {
        return {
          data: [
            { descripcion: "CAMISA POLO", num_codigos: 2, cantidad: 10, venta: 500, costo: 300, margen: 0.4 },
          ],
          error: null,
        };
      }
      return { data: [{ mes: 3, venta: 100 }], error: null };
    },
  },
}));

const { GET } = await import("@/app/api/ventas/productos/route");
const { GET: GET_CODIGOS } = await import("@/app/api/ventas/productos/codigos/route");

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-productos"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });
beforeEach(() => { llamadas.length = 0; });

function req(url: string) {
  const cookie = signSession({ role: "admin", userId: "u1", userName: "test", sessionToken: "t1" });
  return new NextRequest(`https://fashiongr.com${url}`, { headers: { cookie: `cxc_session=${cookie}` } });
}

/** Las fechas con las que se llamó a la RPC del nivel 1. */
function rangoPedido(): { desde: string; hasta: string } {
  const l = llamadas.find(x => x.fn === "switch_top_descripciones");
  expect(l, "no se llamó a switch_top_descripciones").toBeTruthy();
  return { desde: String(l!.args.p_desde), hasta: String(l!.args.p_hasta) };
}

const HOY = new Date().toISOString().slice(0, 10); // sirve de cota superior

describe("el camino VIEJO no movió una sola fecha", () => {
  it("sin parámetros nuevos: el año en curso, de 1-ene a hoy", async () => {
    await GET(req("/api/ventas/productos?empresa=fashion_wear&year=2026"));
    const r = rangoPedido();
    expect(r.desde).toBe("2026-01-01");
    expect(r.hasta <= HOY).toBe(true);
  });

  it("un mes suelto sigue siendo el mes calendario entero", async () => {
    await GET(req("/api/ventas/productos?empresa=fashion_wear&year=2026&mes=6"));
    expect(rangoPedido()).toEqual({ desde: "2026-06-01", hasta: "2026-06-30" });
  });

  it("un año cerrado va entero", async () => {
    await GET(req("/api/ventas/productos?empresa=fashion_wear&year=2024"));
    expect(rangoPedido()).toEqual({ desde: "2024-01-01", hasta: "2024-12-31" });
  });
});

describe("previo=1 pide OTRA ventana: la del año anterior", () => {
  it("con el mes suelto, el mismo mes un año antes", async () => {
    await GET(req("/api/ventas/productos?empresa=fashion_wear&year=2026&mes=6&previo=1"));
    expect(rangoPedido()).toEqual({ desde: "2025-06-01", hasta: "2025-06-30" });
  });

  it("🩸 nunca devuelve el MISMO período (un Δ contra sí mismo da +0% siempre)", async () => {
    for (const p of ["ytd", "6m", "12m", "anio_pasado"]) {
      llamadas.length = 0;
      await GET(req(`/api/ventas/productos?empresa=fashion_wear&year=2026&periodo=${p}`));
      const actual = rangoPedido();
      llamadas.length = 0;
      await GET(req(`/api/ventas/productos?empresa=fashion_wear&year=2026&periodo=${p}&previo=1`));
      const previo = rangoPedido();
      expect(previo, `periodo=${p}`).not.toEqual(actual);
      expect(previo.hasta < actual.desde, `periodo=${p}: el comparativo se solapa`).toBe(true);
    }
  });

  it("la ventana relativa se corre 12 meses exactos, punta a punta", async () => {
    await GET(req("/api/ventas/productos?empresa=fashion_wear&year=2026&periodo=12m"));
    const actual = rangoPedido();
    llamadas.length = 0;
    await GET(req("/api/ventas/productos?empresa=fashion_wear&year=2026&periodo=12m&previo=1"));
    const previo = rangoPedido();
    expect(previo.desde.slice(4)).toBe(actual.desde.slice(4));               // mismo mes-día
    expect(Number(actual.desde.slice(0, 4)) - Number(previo.desde.slice(0, 4))).toBe(1);
  });
});

describe("cada período pide su propia ventana", () => {
  it("los cuatro dan cuatro rangos distintos", async () => {
    const rangos = new Set<string>();
    for (const p of ["ytd", "6m", "12m", "anio_pasado"]) {
      llamadas.length = 0;
      await GET(req(`/api/ventas/productos?empresa=fashion_wear&year=2026&periodo=${p}`));
      const r = rangoPedido();
      rangos.add(`${r.desde}..${r.hasta}`);
    }
    expect(rangos.size).toBe(4);
  });

  it("'año pasado' no toca el año en curso", async () => {
    await GET(req("/api/ventas/productos?empresa=fashion_wear&year=2026&periodo=anio_pasado"));
    const r = rangoPedido();
    expect(r.hasta.endsWith("-12-31")).toBe(true);
    expect(Number(r.hasta.slice(0, 4))).toBe(Number(HOY.slice(0, 4)) - 1);
  });

  it("la respuesta dice qué período resolvió y contra qué compara", async () => {
    const res = await GET(req("/api/ventas/productos?empresa=fashion_wear&year=2026&periodo=6m"));
    const body = await res.json();
    expect(body.periodo).toBe("6m");
    expect(body.comparativo.desde < body.desde).toBe(true);
    expect(body.comparativo.hasta < body.desde).toBe(true);
  });

  it("un período inventado se rechaza, no se cae en el default en silencio", async () => {
    const res = await GET(req("/api/ventas/productos?empresa=fashion_wear&year=2026&periodo=3m"));
    expect(res.status).toBe(400);
  });
});

describe("el desplegable de códigos mira EL MISMO rango que la fila de arriba", () => {
  it("nivel 1 y nivel 2 piden las mismas dos fechas, período por período", async () => {
    for (const p of ["ytd", "6m", "12m", "anio_pasado"]) {
      llamadas.length = 0;
      await GET(req(`/api/ventas/productos?empresa=fashion_wear&year=2026&periodo=${p}`));
      const nivel1 = rangoPedido();

      llamadas.length = 0;
      await GET_CODIGOS(req(
        `/api/ventas/productos/codigos?empresa=fashion_wear&year=2026&periodo=${p}&descripcion=CAMISA%20POLO`,
      ));
      const l = llamadas.find(x => x.fn === "switch_articulos_por_descripcion");
      expect(l, `periodo=${p}: no se llamó a la RPC del drill-down`).toBeTruthy();
      expect({ desde: String(l!.args.p_desde), hasta: String(l!.args.p_hasta) }, `periodo=${p}`).toEqual(nivel1);
    }
  });

  it("el mes suelto también manda al desplegable", async () => {
    await GET_CODIGOS(req(
      "/api/ventas/productos/codigos?empresa=fashion_wear&year=2026&mes=6&descripcion=CAMISA%20POLO",
    ));
    const l = llamadas.find(x => x.fn === "switch_articulos_por_descripcion")!;
    expect({ desde: String(l.args.p_desde), hasta: String(l.args.p_hasta) })
      .toEqual({ desde: "2026-06-01", hasta: "2026-06-30" });
  });
});
