// ─────────────────────────────────────────────────────────────────────────────
// CANDADO de "el mismo producto, un solo renglón" — LA RUTA.
//
// 🔴 LO QUE ESTE ARCHIVO EXISTE PARA CAZAR:
//   · que la ruta vuelva a pedir la función VIEJA y el producto siga partido;
//   · que SIN la migración (que la corre Daniel a mano) la pantalla se caiga en
//     vez de verse como ayer;
//   · que un TIMEOUT se lea como "la función no existe" y dispare una segunda
//     consulta contra una base que ya está sufriendo;
//   · ⚠️ que VUELVA el aviso de «código mal clasificado» — y con él la consulta
//     a `depurador_descripciones` en cada carga de pantalla.
//
// ⚠️ ESTE ÚLTIMO CANDADO CAMBIÓ DE DIRECCIÓN el 25-ago-2026. Hasta el #597 este
// archivo exigía que el aviso SE CALCULARA (y contra el catálogo aprobado, no
// por parecido de textos). Daniel mandó sacarlo: nació para que él revisara los
// 5 códigos mal clasificados en Switch y YA LOS REVISÓ — *"si lo más reciente
// es 17-ago alguien lo pasó a Flip Flop, entonces es Flip Flop"*, o sea que la
// clasificación de Switch es la correcta y no quedaba nada que corregir.
// Se invierte en vez de borrarse: si no, nada se pondría rojo al reponerlo.
//
// 🔴 LO QUE NO CAMBIÓ: la agrupación por el nombre MÁS RECIENTE, el fallback y
// los números. Esos candados quedan tal cual.
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
  filas: [] as Record<string, unknown>[],
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
    // 🔴 NINGUNA TABLA. Se deja el espía puesto a propósito: si alguien repone
    // la lectura de `depurador_descripciones`, `estado.tablas` deja de estar
    // vacío y el candado se pone rojo.
    from: (tabla: string) => {
      estado.tablas.push(tabla);
      return { select: async () => ({ data: [], error: null }) };
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
  // Las filas traen `grafias` A PROPÓSITO aunque la RPC ya no las devuelva
  // (migración 20260827120000): una base con la versión vieja de la función las
  // sigue mandando, y la ruta tiene que ignorarlas sin chistar.
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

  it("sin la migración tampoco hay aviso ni consulta de catálogo", async () => {
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

describe("⚠️ INVERTIDO — el aviso de «mal clasificado» NO vuelve", () => {
  it("🔴 con grafías en la respuesta, NINGUNA fila trae `aviso`", async () => {
    const body = await (await GET(req(URL_BASE))).json();
    expect(body.productos.every((p: { aviso?: unknown }) => p.aviso === undefined)).toBe(true);
  });

  it("🔴 y NO se consulta `depurador_descripciones` — una consulta menos", async () => {
    await GET(req(URL_BASE));
    expect(estado.tablas).toEqual([]);
  });

  it("tampoco en el comparativo (previo=1)", async () => {
    await GET(req(`${URL_BASE}&previo=1`));
    expect(estado.tablas).toEqual([]);
  });

  it("la ruta no lee NINGUNA tabla: sólo la RPC", async () => {
    await GET(req(URL_BASE));
    expect(estado.tablas).toEqual([]);
    expect(estado.rpc.map(r => r.fn)).toEqual(["switch_top_descripciones_reciente"]);
  });
});

describe("🔴 sacar el aviso no movió un solo número", () => {
  it("los totales y las ventas salen igual con grafías y sin ellas", async () => {
    const con = await (await GET(req(URL_BASE))).json();
    estado.filas = estado.filas.map(({ grafias: _g, ...r }) => r);
    estado.rpc.length = 0;
    const sin = await (await GET(req(URL_BASE))).json();
    expect(con.totales).toEqual(sin.totales);
    expect(con.totales.venta).toBe(600);
    expect(con.productos.map((p: { venta: number }) => p.venta))
      .toEqual(sin.productos.map((p: { venta: number }) => p.venta));
    // Y las filas siguen siendo DOS: agrupar por el nombre reciente no se tocó.
    expect(con.productos).toHaveLength(2);
    expect(con.productos.map((p: { descripcion: string }) => p.descripcion))
      .toEqual(["Women-Flip Flops", "Agua Dana 600 Ml 20 Und"]);
  });
});
