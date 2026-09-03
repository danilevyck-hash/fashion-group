// ─────────────────────────────────────────────────────────────────────────────
// CANDADO de /api/ventas/productos/por-cliente — el camino INVERSO del #591.
//
// Lo que existe para cazar:
//
//  1. 🔴 QUE EL RANGO LO RESUELVA EL SERVIDOR CON LA MISMA FUNCIÓN que el nivel
//     1. Si el cliente rearmara las fechas, el filtro y la tabla que filtra
//     podrían mirar días distintos sin que nadie se entere.
//  2. 🔴 QUE `ventana=previa` SIEMPRE VAYA CON UN CLIENTE. Sin ese filtro sería
//     traerse el período entero por segunda vez para una lista de media
//     pantalla — en una base en compute Micro eso no se regala.
//  3. Que la ruta funcione SIN la RPC (la DDL la corre Daniel a mano), y que un
//     error DE VERDAD (un timeout) NO dispare el camino largo.
//  4. Que el camino sin RPC pida el mapa de códigos ACOTADO cuando hay un
//     cliente: es la diferencia entre 2 viajes y 22.
//  5. Que la fecha entre en hora de PANAMÁ, no en UTC pelado.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";

const estado = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  modo: "ok" as "ok" | "no-existe" | "revienta",
  lecturas: [] as Record<string, unknown>[],
  lineas: [] as Record<string, unknown>[],
  diario: [] as Record<string, unknown>[],
  /** Último día cargado de `switch_articulo_diario` que "devuelve" la base. */
  ultimoDiaCargado: "2026-03-01" as string,
}));

vi.mock("@/lib/supabase-server", () => {
  const consulta = (tabla: string) => {
    const filtros: Record<string, unknown> = { tabla };
    const q: Record<string, unknown> = {
      select: (_c: string, o?: { count?: string }) => { filtros.count = o?.count; return q; },
      eq: (c: string, v: unknown) => { filtros[`eq:${c}`] = v; return q; },
      in: (c: string, v: unknown) => { filtros[`in:${c}`] = v; return q; },
      gte: (c: string, v: unknown) => { filtros[`gte:${c}`] = v; return q; },
      lt: (c: string, v: unknown) => { filtros[`lt:${c}`] = v; return q; },
      lte: (c: string, v: unknown) => { filtros[`lte:${c}`] = v; return q; },
      order: (c: string) => { filtros.order = c; return q; },
      // `.limit(1)` es la consulta chica del CORTE (`ultimoDiaArticuloDiario`:
      // MAX(fecha) de la ventana). Se anota aparte, con `corte: true`, para
      // que los conteos de lecturas del mapa de códigos no la confundan.
      limit: () => {
        estado.lecturas.push({ ...filtros, corte: true });
        return Promise.resolve({ data: [{ fecha: estado.ultimoDiaCargado }], error: null });
      },
      range: () => {
        estado.lecturas.push({ ...filtros });
        const d = tabla === "switch_articulo_diario" ? estado.diario : estado.lineas;
        return Promise.resolve({ data: d, error: null, count: d.length });
      },
    };
    return q;
  };
  return {
    supabaseServer: {
      from: (tabla: string) => consulta(tabla),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        estado.rpc.push({ fn, args });
        if (estado.modo === "no-existe") {
          return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
        }
        if (estado.modo === "revienta") {
          return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
        }
        return {
          data: {
            filas: [
              { cliente_switch_id: 12, cliente_nombre: "City Mall Paso Canoa", descripcion: "Men-Boxer Brief", cantidad: 80, venta: 2400 },
            ],
            sin_descripcion: 3,
          },
          error: null,
        };
      },
    },
  };
});

const { GET } = await import("@/app/api/ventas/productos/por-cliente/route");
const { productosRangoPeriodo, productosRangoComparativo } = await import("@/lib/ventas/productos");

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-por-cliente"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });
beforeEach(() => {
  estado.rpc.length = 0;
  estado.lecturas.length = 0;
  estado.modo = "ok";
  estado.lineas = [
    { tipo_comprobante: "Factura", cliente_switch_id: 12, cliente_nombre: "City Mall Paso Canoa", codigo: "A-1", cantidad: 100, subtotal_con_descuento: 3000 },
    { tipo_comprobante: "Nota de Crédito", cliente_switch_id: 12, cliente_nombre: "City Mall Paso Canoa", codigo: "A-1", cantidad: 20, subtotal_con_descuento: 600 },
  ];
  estado.diario = [{ codigo: "A-1", descripcion: "Men-Boxer Brief", fecha: "2026-03-01" }];
});

function req(url: string) {
  const cookie = signSession({ role: "admin", userId: "u1", userName: "test", sessionToken: "t1" });
  return new NextRequest(`https://fashiongr.com${url}`, { headers: { cookie: `cxc_session=${cookie}` } });
}

const BASE = "/api/ventas/productos/por-cliente?empresa=vistana&year=2026&periodo=12m";

describe("🔴 el rango lo resuelve el SERVIDOR, con la misma función que el nivel 1", () => {
  it("ventana=actual usa productosRangoPeriodo", async () => {
    const res = await GET(req(`${BASE}&ventana=actual`));
    const body = await res.json();
    const esperado = productosRangoPeriodo("12m", 2026, null, new Date());
    expect(body.desde).toBe(esperado.desde);
    expect(body.hasta).toBe(esperado.hasta);
    expect(estado.rpc[0].args.p_desde).toBe(esperado.desde);
  });

  it("ventana=previa usa productosRangoComparativo — la MISMA que la columna Δ", async () => {
    const res = await GET(req(`${BASE}&ventana=previa&cliente=12`));
    const body = await res.json();
    const esperado = productosRangoComparativo("12m", 2026, null, new Date(), estado.ultimoDiaCargado);
    expect(body.desde).toBe(esperado.desde);
    expect(body.hasta).toBe(esperado.hasta);
  });

  it("🩸 la ventana previa corta en el último día CARGADO de switch_articulo_diario, no en hoy", async () => {
    // La tabla llega hasta ayer (se carga a las 03:40 de Panamá). Si la ventana
    // previa cortara en hoy, «dejó de comprar» miraría un día que el nivel 1
    // no mira. El corte se pide a la MISMA tabla que suma la columna Δ.
    estado.ultimoDiaCargado = "2026-02-15";
    const res = await GET(req(`${BASE}&ventana=previa&cliente=12`));
    const body = await res.json();
    expect(body.hasta).toBe("2025-02-15");
    const corte = estado.lecturas.find(l => l.corte === true)!;
    expect(corte.tabla).toBe("switch_articulo_diario");
    expect(corte["eq:empresa_key"]).toBe("vistana");
    expect(corte.order).toBe("fecha");
    estado.ultimoDiaCargado = "2026-03-01";
  });

  it("ventana=actual NO pide el corte: no hay comparación que recortar", async () => {
    await GET(req(`${BASE}&ventana=actual`));
    expect(estado.lecturas.filter(l => l.corte === true)).toHaveLength(0);
  });

  it("las dos ventanas NO son la misma (si lo fueran, «dejó de comprar» saldría vacío siempre)", async () => {
    const a = await (await GET(req(`${BASE}&ventana=actual`))).json();
    const p = await (await GET(req(`${BASE}&ventana=previa&cliente=12`))).json();
    expect(p.desde).not.toBe(a.desde);
  });
});

describe("🔴 la ventana previa SIEMPRE va con un cliente", () => {
  it("sin cliente contesta 400 y no toca la base", async () => {
    const res = await GET(req(`${BASE}&ventana=previa`));
    expect(res.status).toBe(400);
    expect(estado.rpc).toHaveLength(0);
    expect(estado.lecturas).toHaveLength(0);
  });

  it("un cliente que no es número tampoco pasa", async () => {
    expect((await GET(req(`${BASE}&ventana=actual&cliente=sin-cliente`))).status).toBe(400);
  });

  it("ventana=actual SIN cliente sí puede: es la matriz de todos", async () => {
    const res = await GET(req(`${BASE}&ventana=actual`));
    expect(res.status).toBe(200);
    expect(estado.rpc[0].args.p_cliente_id).toBeNull();
  });

  it("y el id viaja a la RPC cuando está", async () => {
    await GET(req(`${BASE}&ventana=previa&cliente=12`));
    expect(estado.rpc[0].args.p_cliente_id).toBe(12);
  });
});

describe("la ruta funciona SIN la RPC (la DDL la corre Daniel a mano)", () => {
  it("cae al camino largo y devuelve LO MISMO, con la NC restada", async () => {
    estado.modo = "no-existe";
    const res = await GET(req(`${BASE}&ventana=actual`));
    const body = await res.json();
    expect(body.filas).toHaveLength(1);
    expect(body.filas[0].descripcion).toBe("Men-Boxer Brief");
    // 3000 − 600 = 2400. Sin firmar daría 3600, o sea 2× la NC de más.
    expect(body.filas[0].venta).toBe(2400);
    expect(body.filas[0].cantidad).toBe(80);
  });

  it("🔴 un TIMEOUT no dispara el camino largo: sería empujar la caída", async () => {
    estado.modo = "revienta";
    const res = await GET(req(`${BASE}&ventana=actual`));
    expect(res.status).toBe(500);
    expect(estado.lecturas.filter(l => !l.corte)).toHaveLength(0);
  });

  it("🔑 con un cliente, el mapa de códigos se pide ACOTADO (2 viajes, no 22)", async () => {
    estado.modo = "no-existe";
    await GET(req(`${BASE}&ventana=previa&cliente=12`));
    const diario = estado.lecturas.filter(l => l.tabla === "switch_articulo_diario" && !l.corte);
    expect(diario).toHaveLength(1);
    expect(diario[0]["in:codigo"]).toEqual(["A-1"]);
  });

  it("sin cliente el mapa se pide ENTERO: hay que conocer toda la ventana", async () => {
    estado.modo = "no-existe";
    await GET(req(`${BASE}&ventana=actual`));
    const diario = estado.lecturas.filter(l => l.tabla === "switch_articulo_diario" && !l.corte);
    expect(diario).toHaveLength(1);
    expect(diario[0]["in:codigo"]).toBeUndefined();
  });

  it("las líneas entran filtradas por cliente cuando hay uno", async () => {
    estado.modo = "no-existe";
    await GET(req(`${BASE}&ventana=previa&cliente=12`));
    const lineas = estado.lecturas.find(l => l.tabla === "switch_factura_lineas")!;
    expect(lineas["eq:cliente_switch_id"]).toBe(12);
  });
});

describe("🩸 la fecha entra en hora de PANAMÁ, no en UTC pelado", () => {
  it("el borde lleva el −05:00 explícito y el techo es el día SIGUIENTE", async () => {
    estado.modo = "no-existe";
    const res = await GET(req(`${BASE}&ventana=actual`));
    const body = await res.json();
    const lineas = estado.lecturas.find(l => l.tabla === "switch_factura_lineas")!;
    expect(lineas["gte:fecha"]).toBe(`${body.desde}T00:00:00-05:00`);
    expect(String(lineas["lt:fecha"])).toMatch(/T00:00:00-05:00$/);
    expect(lineas["lt:fecha"]).not.toBe(`${body.hasta}T00:00:00-05:00`);
  });
});

describe("la puerta de entrada", () => {
  it("empresa, year, periodo y ventana se validan", async () => {
    expect((await GET(req("/api/ventas/productos/por-cliente?empresa=nope&year=2026"))).status).toBe(400);
    expect((await GET(req("/api/ventas/productos/por-cliente?empresa=vistana&year=1800"))).status).toBe(400);
    expect((await GET(req(`${BASE.replace("periodo=12m", "periodo=nope")}&ventana=actual`))).status).toBe(400);
    expect((await GET(req(`${BASE}&ventana=nope`))).status).toBe(400);
  });

  it("sin sesión de admin no contesta", async () => {
    const sinCookie = new NextRequest(`https://fashiongr.com${BASE}&ventana=actual`);
    expect((await GET(sinCookie)).status).not.toBe(200);
  });

  it("dice cuántas líneas quedaron sin descripción en vez de esconderlas", async () => {
    const body = await (await GET(req(`${BASE}&ventana=actual`))).json();
    expect(body.sinDescripcion).toBe(3);
  });
});
