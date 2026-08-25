// ─────────────────────────────────────────────────────────────────────────────
// CANDADO de "el mismo producto, un solo renglón" — LA RUTA.
//
// 🔴 LO QUE ESTE ARCHIVO EXISTE PARA CAZAR:
//   · que la ruta vuelva a pedir la función VIEJA y el producto siga partido;
//   · que SIN la migración (que la corre Daniel a mano) la pantalla se caiga en
//     vez de verse como ayer;
//   · que un TIMEOUT se lea como "la función no existe" y dispare una segunda
//     consulta contra una base que ya está sufriendo;
//   · que el aviso se calcule solo, sin el catálogo aprobado;
//   · que la respuesta del comparativo (`previo=1`) gaste una consulta de
//     catálogo que nadie va a mirar.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";

const estado = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  tablas: [] as string[],
  /** Cuando true, la función NUEVA no existe (la DDL todavía no corrió). */
  sinMigracion: false,
  /** Cuando true, la función nueva contesta con un timeout. */
  timeout: false,
  /** Cuando true, la lectura del catálogo aprobado falla. */
  catalogoRoto: false,
  filas: [] as Record<string, unknown>[],
  catalogo: [] as { descripcion: string; activa?: boolean }[],
}));

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      estado.rpc.push({ fn, args });
      if (fn === "switch_top_descripciones_reciente") {
        if (estado.timeout) {
          return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
        }
        if (estado.sinMigracion) {
          return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
        }
        return { data: estado.filas, error: null };
      }
      if (fn === "switch_top_descripciones") {
        // La vieja NO trae `grafias`: es exactamente la pantalla de ayer.
        return { data: estado.filas.map(({ grafias: _g, ...r }) => r), error: null };
      }
      return { data: [], error: null };
    },
    from: (tabla: string) => {
      estado.tablas.push(tabla);
      return {
        select: async () =>
          estado.catalogoRoto
            ? { data: null, error: { message: "permission denied" } }
            : { data: estado.catalogo, error: null },
      };
    },
  },
}));

const { GET } = await import("@/app/api/ventas/productos/route");

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-reciente"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

beforeEach(() => {
  estado.rpc.length = 0;
  estado.tablas.length = 0;
  estado.sinMigracion = false;
  estado.timeout = false;
  estado.catalogoRoto = false;
  estado.catalogo = [{ descripcion: "Women-Sandals" }, { descripcion: "Women-Flip Flops" }];
  estado.filas = [
    {
      descripcion: "Women-Flip Flops", num_codigos: 2, cantidad: 10, venta: 500, costo: 300, margen: 0.4,
      grafias: [{ otra: "Women-Sandals", codigo: "FW0FW05034-DW5" }],
    },
    {
      descripcion: "Agua Dana 600 Ml 20 Und", num_codigos: 1, cantidad: 20, venta: 100, costo: 60, margen: 0.4,
      grafias: [{ otra: "Agua Dana 600 ml 20 Und ", codigo: "3631" }],
    },
  ];
});

function req(url: string) {
  const cookie = signSession({ role: "admin", userId: "u1", userName: "t", sessionToken: "t1" });
  return new NextRequest(`https://fashiongr.com${url}`, { headers: { cookie: `cxc_session=${cookie}` } });
}
const URL_BASE = "/api/ventas/productos?empresa=fashion_shoes&year=2026";

describe("se pide la función que UNE, no la que parte", () => {
  it("la primera llamada es switch_top_descripciones_reciente", async () => {
    await GET(req(URL_BASE));
    expect(estado.rpc[0].fn).toBe("switch_top_descripciones_reciente");
  });

  it("con la migración corrida NO se llama a la vieja", async () => {
    await GET(req(URL_BASE));
    expect(estado.rpc.some(r => r.fn === "switch_top_descripciones")).toBe(false);
  });
});

describe("SIN la migración la pantalla es la de ayer, y no se cae", () => {
  it("cae a switch_top_descripciones y contesta 200", async () => {
    estado.sinMigracion = true;
    const res = await GET(req(URL_BASE));
    expect(res.status).toBe(200);
    expect(estado.rpc.map(r => r.fn)).toEqual([
      "switch_top_descripciones_reciente",
      "switch_top_descripciones",
    ]);
  });

  it("sin la migración NO hay aviso, y ni siquiera se pide el catálogo", async () => {
    estado.sinMigracion = true;
    const body = await (await GET(req(URL_BASE))).json();
    expect(body.productos.every((p: { aviso?: unknown }) => p.aviso === undefined)).toBe(true);
    expect(estado.tablas).toEqual([]);
  });

  it("los números llegan enteros igual", async () => {
    estado.sinMigracion = true;
    const body = await (await GET(req(URL_BASE))).json();
    expect(body.totales.venta).toBe(600);
    expect(body.productos).toHaveLength(2);
  });
});

describe("⛔ un timeout NO es 'la función no existe'", () => {
  it("no dispara la segunda consulta: devuelve el error", async () => {
    estado.timeout = true;
    const res = await GET(req(URL_BASE));
    expect(res.status).toBe(500);
    expect(estado.rpc.map(r => r.fn)).toEqual(["switch_top_descripciones_reciente"]);
  });
});

describe("el aviso sale del CATÁLOGO APROBADO, no de un parecido", () => {
  it("avisa en la categoría real y NO en el tipeo", async () => {
    const body = await (await GET(req(URL_BASE))).json();
    expect(estado.tablas).toEqual(["depurador_descripciones"]);
    const flip = body.productos.find((p: { descripcion: string }) => p.descripcion === "Women-Flip Flops");
    expect(flip.aviso).toEqual([{ otra: "Women-Sandals", codigo: "FW0FW05034-DW5" }]);
    const agua = body.productos.find((p: { descripcion: string }) => p.descripcion.startsWith("Agua Dana"));
    expect(agua.aviso).toBeUndefined();
  });

  it("🔴 si el catálogo no se puede leer, NO se avisa nada — y la pantalla vive", async () => {
    estado.catalogoRoto = true;
    const res = await GET(req(URL_BASE));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.productos.every((p: { aviso?: unknown }) => p.aviso === undefined)).toBe(true);
    expect(body.totales.venta).toBe(600);
  });

  it("sin grafías no se pide el catálogo (una consulta menos por pantalla)", async () => {
    estado.filas = estado.filas.map(({ grafias: _g, ...r }) => r);
    await GET(req(URL_BASE));
    expect(estado.tablas).toEqual([]);
  });

  it("el comparativo (previo=1) no gasta la consulta del catálogo", async () => {
    await GET(req(`${URL_BASE}&previo=1`));
    expect(estado.tablas).toEqual([]);
  });
});

describe("🔴 el aviso no toca un solo número", () => {
  it("los totales son los mismos con aviso y sin aviso", async () => {
    const con = await (await GET(req(URL_BASE))).json();
    estado.catalogo = [];
    estado.rpc.length = 0;
    const sin = await (await GET(req(URL_BASE))).json();
    expect(con.totales).toEqual(sin.totales);
    expect(con.productos.map((p: { venta: number }) => p.venta))
      .toEqual(sin.productos.map((p: { venta: number }) => p.venta));
  });
});
