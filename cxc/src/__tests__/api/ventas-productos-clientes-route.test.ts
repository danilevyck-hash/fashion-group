// ─────────────────────────────────────────────────────────────────────────────
// CANDADO del drill-down /api/ventas/productos/codigos — la parte de CLIENTES.
//
// Lo que esto existe para cazar:
//
//  1. 🔑 QUE LOS CLIENTES SE PIDAN CON LOS MISMOS CÓDIGOS QUE SE MUESTRAN. Es
//     todo el diseño: las dos tablas nombran distinto al mismo producto
//     ("Men-Shirts / Woven Tops L/S" contra "Men-Shirts Woven Tops L/S"), así
//     que cruzar por TEXTO dejaba 39 de 136 descripciones de vistana sin un
//     solo cliente — $184.164,23, el 7,66% de la pantalla. Si alguien vuelve a
//     cruzar por descripción, la lista se vacía en silencio.
//  2. Que un fallo leyendo clientes NO se lleve puestos los códigos: son dos
//     preguntas y la de arriba ya estaba contestada.
//  3. Que la ruta siga funcionando SIN la RPC (la DDL la corre Daniel a mano).
//  4. Que `?mes=6` siga contestando lo mismo aunque la pantalla ya no lo mande.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";

const estado = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  /** Qué le pasa a la RPC de clientes: "ok" | "no-existe" | "revienta" */
  modoClientes: "ok" as "ok" | "no-existe" | "revienta",
  /** Filtros que recibió la lectura paginada del camino sin RPC. */
  lecturas: [] as Record<string, unknown>[],
  /** Las otras grafías del mismo producto que devuelve la RPC. */
  grafias: [] as { otra: string; codigo: string }[],
  /** Lo que devuelve switch_articulo_diario en el camino sin RPC. */
  filasDiario: [] as { codigo: string; descripcion: string }[],
}));

vi.mock("@/lib/supabase-server", () => {
  const filas = [
    {
      tipo_comprobante: "Factura",
      cliente_switch_id: 1,
      cliente_nombre: "City Mall Paso Canoa",
      cantidad: 100,
      subtotal_con_descuento: 3000,
    },
    // La NC del MISMO cliente: si el signo se pierde, la venta da 3.600 (= el
    // doble de la NC de más) en vez de 2.400.
    {
      tipo_comprobante: "Nota de Crédito",
      cliente_switch_id: 1,
      cliente_nombre: "City Mall Paso Canoa",
      cantidad: 20,
      subtotal_con_descuento: 600,
    },
  ];
  const consulta = (tabla: string) => {
    const filtros: Record<string, unknown> = {};
    const q: Record<string, unknown> = {
      select: (_c: string, o?: { count?: string }) => {
        filtros.count = o?.count;
        return q;
      },
      eq: (c: string, v: unknown) => { filtros[`eq:${c}`] = v; return q; },
      in: (c: string, v: unknown) => { filtros[`in:${c}`] = v; return q; },
      gte: (c: string, v: unknown) => { filtros[`gte:${c}`] = v; return q; },
      lt: (c: string, v: unknown) => { filtros[`lt:${c}`] = v; return q; },
      lte: (c: string, v: unknown) => { filtros[`lte:${c}`] = v; return q; },
      order: (c: string) => { filtros.order = c; return q; },
      range: () => {
        estado.lecturas.push({ ...filtros, tabla });
        const d = tabla === "switch_articulo_diario" ? estado.filasDiario : filas;
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
        if (fn === "switch_articulos_por_descripcion") {
          return {
            data: [
              { codigo: "AAA-1", descripcion: "Men-T-Shirts S/S", cantidad: 10, venta: 300, costo: 180, margen: 0.4 },
              { codigo: "BBB-2", descripcion: "Men-T-Shirts S/S", cantidad: 5, venta: 150, costo: 90, margen: 0.4 },
            ],
            error: null,
          };
        }
        if (fn === "switch_clientes_por_codigos") {
          if (estado.modoClientes === "no-existe") {
            return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
          }
          if (estado.modoClientes === "revienta") {
            return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
          }
          return {
            data: {
              clientes: [{ cliente_switch_id: 1, cliente_nombre: "City Mall Paso Canoa", cantidad: 80, venta: 2400 }],
              grafias: estado.grafias,
            },
            error: null,
          };
        }
        return { data: [], error: null };
      },
    },
  };
});

const { GET } = await import("@/app/api/ventas/productos/codigos/route");

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-clientes"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });
beforeEach(() => {
  estado.rpc.length = 0;
  estado.lecturas.length = 0;
  estado.modoClientes = "ok";
  estado.grafias = [];
  estado.filasDiario = [
    { codigo: "AAA-1", descripcion: "Men-T-Shirts S/S" },
    { codigo: "BBB-2", descripcion: "Men-T-Shirts S/S" },
  ];
});

function req(url: string) {
  const cookie = signSession({ role: "admin", userId: "u1", userName: "test", sessionToken: "t1" });
  return new NextRequest(`https://fashiongr.com${url}`, { headers: { cookie: `cxc_session=${cookie}` } });
}

const URL_BASE =
  "/api/ventas/productos/codigos?empresa=vistana&year=2026&periodo=12m&descripcion=Men-T-Shirts%20S%2FS";

describe("🔑 los clientes se cruzan por CÓDIGO, con los mismos que se muestran", () => {
  it("la RPC de clientes recibe EXACTAMENTE los códigos del bloque de arriba", async () => {
    const res = await GET(req(URL_BASE));
    const body = await res.json();

    const llamada = estado.rpc.find(r => r.fn === "switch_clientes_por_codigos");
    expect(llamada, "no se pidieron los clientes").toBeTruthy();
    expect(llamada!.args.p_codigos).toEqual(["AAA-1", "BBB-2"]);
    expect(body.codigos.map((c: { codigo: string }) => c.codigo)).toEqual(["AAA-1", "BBB-2"]);
  });

  it("⛔ la descripción NO es la llave del cruce: los códigos lo son", async () => {
    // La descripción viaja SOLO para saber cuál grafía es "esta" en el aviso.
    // El cruce lo hacen los códigos: si volviera a hacerlo el texto, la lista
    // se vaciaría para 39 de 136 descripciones y nadie lo vería.
    await GET(req(URL_BASE));
    const llamada = estado.rpc.find(r => r.fn === "switch_clientes_por_codigos")!;
    expect(llamada.args.p_codigos).toEqual(["AAA-1", "BBB-2"]);
    expect(llamada.args.p_descripcion).toBe("Men-T-Shirts S/S");
  });

  it("mismo rango que los códigos: las dos preguntas hablan del mismo período", async () => {
    await GET(req(URL_BASE));
    const cods = estado.rpc.find(r => r.fn === "switch_articulos_por_descripcion")!.args;
    const clis = estado.rpc.find(r => r.fn === "switch_clientes_por_codigos")!.args;
    expect(clis.p_desde).toBe(cods.p_desde);
    expect(clis.p_hasta).toBe(cods.p_hasta);
  });

  it("devuelve los clientes con la venta NETA", async () => {
    const body = await (await GET(req(URL_BASE))).json();
    expect(body.clientes).toEqual([
      { cliente_switch_id: 1, cliente_nombre: "City Mall Paso Canoa", cantidad: 80, venta: 2400 },
    ]);
  });
});

describe("la ruta funciona SIN la RPC (la DDL la corre Daniel a mano)", () => {
  it("cae a leer las líneas y agrupa igual, con la NC restando", async () => {
    estado.modoClientes = "no-existe";
    const body = await (await GET(req(URL_BASE))).json();
    // 3000 − 600 = 2400. Si el signo se perdiera daría 3600, o sea 2× la NC de más.
    expect(body.clientes).toEqual([
      { cliente_switch_id: 1, cliente_nombre: "City Mall Paso Canoa", cantidad: 80, venta: 2400 },
    ]);
    expect(estado.lecturas.length).toBeGreaterThan(0);
  });

  it("y esa lectura pagina bien: filtra por código, ordena estable y pide COUNT", async () => {
    estado.modoClientes = "no-existe";
    await GET(req(URL_BASE));
    const l = estado.lecturas[0];
    expect(l["in:codigo"]).toEqual(["AAA-1", "BBB-2"]);
    expect(l["eq:empresa_key"]).toBe("vistana");
    expect(l.order).toBe("id");          // sin orden estable, PostgREST repite o saltea
    expect(l.count).toBe("exact");       // sin COUNT, el truncado a 1000 pasa mudo
    expect(String(l["gte:fecha"])).toContain("-05:00"); // el día de Panamá, no el UTC
    expect(String(l["lt:fecha"])).toContain("-05:00");
  });

  it("⛔ un timeout NO dispara el camino largo (sería empujar la caída)", async () => {
    estado.modoClientes = "revienta";
    const body = await (await GET(req(URL_BASE))).json();
    expect(estado.lecturas).toHaveLength(0);
    expect(body.clientes).toBeNull(); // "no se pudo", distinto de "no hay"
  });
});

describe("un fallo en los clientes no se lleva los códigos", () => {
  it("los códigos siguen llegando completos", async () => {
    estado.modoClientes = "revienta";
    const body = await (await GET(req(URL_BASE))).json();
    expect(body.codigos).toHaveLength(2);
    expect(body.clientes).toBeNull();
  });
});

describe("el contrato viejo no se rompió", () => {
  it("?mes=6 sigue contestando el mes, aunque la pantalla ya no lo mande", async () => {
    await GET(req("/api/ventas/productos/codigos?empresa=vistana&year=2026&mes=6&descripcion=X"));
    const cods = estado.rpc.find(r => r.fn === "switch_articulos_por_descripcion")!.args;
    expect(cods.p_desde).toBe("2026-06-01");
    expect(cods.p_hasta).toBe("2026-06-30");
  });
});
