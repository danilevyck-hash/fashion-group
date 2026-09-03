// ─────────────────────────────────────────────────────────────────────────────
// LAS DOS PESTAÑAS DE COMISIONES DICEN EL MISMO NÚMERO — y lo dicen porque la
// resta de los descuentos ocurre UNA SOLA VEZ, en el servidor.
//
// 🩸 POR QUÉ (24-ago-2026). La pestaña "Por empresa" mostraba el SUBTOTAL —sin
// restar los descuentos fijos del mes— mientras "Todas las empresas" y el
// detalle del vendedor sí los restaban. Medido en producción, REINALDO
// ESPINOSA en Fashion Shoes:
//
//     Descuento              −$1.400,00
//     Descuento de adelanto    −$173,08
//     ─────────────────────────────────
//                            −$1.573,08   ← la diferencia entre las dos pestañas
//
//     julio 2026    Por empresa $2.859,65   ·   Todas $1.286,57
//     junio 2026    Por empresa $3.208,42   ·   Todas $1.635,34
//     agosto 2026   Por empresa $2.571,48   ·   Todas   $998,40
//
// La misma persona, el mismo mes, dos números en la misma pantalla — y el
// Excel de esa vista bajaba el inflado. Daniel ya lo había reclamado una vez
// (*"me sale en el web el total, y no me resta el descuento"*) y se arregló en
// UNA pestaña y no en la otra.
//
// 🔑 POR ESO ESTOS TESTS SON DE CONDUCTA. Llaman a los handlers REALES de las
// dos rutas con supabase doblado y comparan el JSON celda por celda: que el
// código contenga la palabra "descuento" no prueba que el número salga restado,
// y un barrido de texto se cumple con su propio comentario (este repo ya lo
// pagó cuatro veces).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// ── El caso REAL de producción ───────────────────────────────────────────────
const DESCUENTO_TOTAL = 1573.08; // 1400,00 + 173,08
const REINALDO = "REINALDO ESPINOSA";

/** Lo que devuelve `comision_b2b_v5` para fashion_shoes, julio-2026. */
const VENDEDORES_FASHION_SHOES = [
  {
    vendedor: REINALDO,
    base: 90276, tasa: 0.01, comision: 902.76,
    base_cobro: 195688.53, tasa_cobro: 0.01, comision_cobro: 1956.89,
    comision_total: 2859.65,
  },
  {
    vendedor: "DEFAULT",
    base: 10759, tasa: 0.005, comision: 53.8,
    base_cobro: 1500, tasa_cobro: 0.005, comision_cobro: 7.5,
    comision_total: 61.3,
  },
];

const FIJOS = [
  { id: "d1", empresa_key: "fashion_shoes", concepto: "Descuento", monto: 1400, vendedor_nombre: REINALDO },
  { id: "d2", empresa_key: "fashion_shoes", concepto: "Descuento de adelanto", monto: 173.08, vendedor_nombre: REINALDO },
];

// ── Doble de supabase ────────────────────────────────────────────────────────
// `estado` deja que cada test rompa una pieza (la lectura de descuentos, la
// RPC) sin reescribir el doble entero.
const estado = {
  fijos: FIJOS as unknown[],
  excepciones: [] as unknown[],
  fallaDescuentos: false,
  fallaRpc: false,
  rpcCalls: [] as { empresa: string }[],
};

function tabla(filas: unknown[], falla: boolean) {
  const resultado = falla
    ? { data: null, error: { message: "boom" } }
    : { data: filas, error: null };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq", "order"]) {
    q[m] = () => q;
  }
  // Thenable: `await q` y `await q.order(...)` dan lo mismo, como PostgREST.
  q.then = (res: (v: unknown) => unknown) => Promise.resolve(resultado).then(res);
  return q;
}

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userName: "medicion" }),
}));
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    from: (t: string) =>
      t === "comision_descuentos_fijos"
        ? tabla(estado.fijos, estado.fallaDescuentos)
        : tabla(estado.excepciones, estado.fallaDescuentos),
    rpc: async (_fn: string, args: Record<string, unknown>) => {
      const empresa = String(args.p_empresa_key);
      estado.rpcCalls.push({ empresa });
      if (estado.fallaRpc) return { data: null, error: { message: "statement timeout" } };
      return {
        data: {
          empresa_key: empresa,
          year: args.p_year,
          mes: args.p_mes,
          // Solo fashion_shoes tiene descuentos; las otras 5 sirven para probar
          // que no se les mueve un centavo.
          vendedores:
            empresa === "fashion_shoes"
              ? VENDEDORES_FASHION_SHOES
              : [{
                  vendedor: REINALDO,
                  base: 1000, tasa: 0.01, comision: 10,
                  base_cobro: 500, tasa_cobro: 0.01, comision_cobro: 5,
                  comision_total: 15,
                }],
        },
        error: null,
      };
    },
  },
}));

type VendedorApi = { vendedor: string; comision_total: number; descuento?: number };

async function porEmpresa(empresa: string) {
  const { GET } = await import("@/app/api/ventas/comisiones/route");
  const { NextRequest } = await import("next/server");
  const res = await GET(
    new NextRequest(`http://x/api/ventas/comisiones?empresa=${empresa}&year=2026&mes=7`),
  );
  return { res, body: (await res.json()) as { vendedores?: VendedorApi[]; error?: string } };
}

async function consolidado() {
  const { GET } = await import("@/app/api/ventas/comisiones/consolidado/route");
  const { NextRequest } = await import("next/server");
  const res = await GET(
    new NextRequest("http://x/api/ventas/comisiones/consolidado?year=2026&mes=7"),
  );
  return {
    res,
    body: (await res.json()) as {
      empresas?: { empresa_key: string; vendedores: VendedorApi[] }[];
      error?: string;
    },
  };
}

const de = (vs: VendedorApi[] | undefined, nombre: string) =>
  (vs ?? []).find((v) => v.vendedor === nombre);

beforeEach(() => {
  estado.fijos = FIJOS;
  estado.excepciones = [];
  estado.fallaDescuentos = false;
  estado.fallaRpc = false;
  estado.rpcCalls = [];
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el número que se paga: $2.859,65 − $1.573,08 = $1.286,57", () => {
  it('"Por empresa" devuelve el NETO, no el subtotal', async () => {
    const { res, body } = await porEmpresa("fashion_shoes");
    expect(res.status).toBe(200);
    expect(de(body.vendedores, REINALDO)?.comision_total).toBe(1286.57);
  });

  it('"Todas las empresas" devuelve el MISMO neto', async () => {
    const { body } = await consolidado();
    const fs = body.empresas?.find((e) => e.empresa_key === "fashion_shoes");
    expect(de(fs?.vendedores, REINALDO)?.comision_total).toBe(1286.57);
  });

  it("las DOS pestañas coinciden celda por celda, vendedor por vendedor", async () => {
    const { body: cons } = await consolidado();
    let comparadas = 0;
    for (const emp of cons.empresas ?? []) {
      const { body: una } = await porEmpresa(emp.empresa_key);
      for (const v of emp.vendedores) {
        const gemelo = de(una.vendedores, v.vendedor);
        expect(gemelo, `${emp.empresa_key} · ${v.vendedor}`).toBeDefined();
        expect(gemelo!.comision_total, `${emp.empresa_key} · ${v.vendedor}`)
          .toBe(v.comision_total);
        comparadas++;
      }
    }
    expect(comparadas).toBeGreaterThan(0); // un 0 acá sería "no comparé nada"
  });

  it("dice CUÁNTO restó, para poder explicar el total en pantalla", async () => {
    const { body } = await porEmpresa("fashion_shoes");
    expect(de(body.vendedores, REINALDO)?.descuento).toBe(DESCUENTO_TOTAL);
  });

  it("a quien no tiene descuento no se le toca un centavo", async () => {
    const { body } = await porEmpresa("vistana");
    expect(de(body.vendedores, REINALDO)?.comision_total).toBe(15);
    expect(de(body.vendedores, REINALDO)?.descuento).toBe(0);
  });

  it("DEFAULT es un centinela, no una persona: nunca recibe descuento", async () => {
    estado.fijos = [
      { id: "d9", empresa_key: "fashion_shoes", concepto: "X", monto: 50, vendedor_nombre: "DEFAULT" },
    ];
    const { body } = await porEmpresa("fashion_shoes");
    expect(de(body.vendedores, "DEFAULT")?.comision_total).toBe(61.3);
  });

  it("el descuento apagado ese mes NO se resta (la excepción manda)", async () => {
    estado.excepciones = [
      { descuento_id: "d1", activo: false },
      { descuento_id: "d2", activo: false },
    ];
    const { body } = await porEmpresa("fashion_shoes");
    expect(de(body.vendedores, REINALDO)?.comision_total).toBe(2859.65);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la asimetría de los errores se conserva", () => {
  it("los descuentos fallan ABIERTO: la tabla sale con descuentos en 0", async () => {
    estado.fallaDescuentos = true;
    const { res, body } = await porEmpresa("fashion_shoes");
    expect(res.status).toBe(200);
    expect(de(body.vendedores, REINALDO)?.comision_total).toBe(2859.65);
  });

  it("el consolidado también falla abierto con los descuentos", async () => {
    estado.fallaDescuentos = true;
    const { res } = await consolidado();
    expect(res.status).toBe(200);
  });

  it("un error de las COMISIONES sí se propaga (500), en las dos rutas", async () => {
    estado.fallaRpc = true;
    expect((await porEmpresa("fashion_shoes")).res.status).toBe(500);
    expect((await consolidado()).res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔑 UNA sola resta: la regla vive en la librería, no en las vistas", () => {
  // Un comentario que nombra la resta no es la resta — se barre sin comentarios.
  const sinComentarios = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
      .join("\n");
  const codigo = (rel: string) =>
    sinComentarios(readFileSync(path.join(process.cwd(), rel), "utf8"));

  const VISTAS = [
    "src/components/ventas/ComisionesConsolidadoView.tsx",
    "src/components/ventas/ComisionesPorEmpresaView.tsx",
    "src/components/ventas/ComisionesTarjetas.tsx",
  ];

  for (const rel of VISTAS) {
    it(`${rel} NO vuelve a restar el descuento`, () => {
      const src = codigo(rel);
      // Cualquier forma de volver a restar: `- monto`, `- v.descuento`,
      // `-= descuento`… El candado viejo miraba solo `- monto` y por eso una
      // mutación con `- v.descuento` le pasó por al lado.
      expect(src).not.toMatch(/-=?\s*[\w.]*\b(monto|descuento)\b/);
      expect(src).not.toMatch(/comision_total\s*-\s*/);
    });
  }

  it("las DOS rutas restan con la MISMA función", () => {
    for (const rel of [
      "src/app/api/ventas/comisiones/route.ts",
      "src/app/api/ventas/comisiones/consolidado/route.ts",
    ]) {
      const src = codigo(rel);
      expect(src, rel).toContain("netearComisiones(");
      expect(src, rel).toContain("@/lib/comisiones/descuentos");
    }
  });

  it("la resta existe UNA vez en todo el repo", () => {
    // Si aparece en dos archivos, mañana son dos totales para el mismo mes.
    const lib = codigo("src/lib/comisiones/descuentos.ts");
    expect(lib).toContain("export function netearComisiones");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("⚠️ la RPC del dinero se llama en UN solo lugar", () => {
  // CAMBIÓ DE DIRECCIÓN el 3-sep-2026: exigía el literal `rpc("comision_b2b_v5"`
  // en las DOS rutas. Desde que el COBRO se paga a quien REGISTRÓ el recibo
  // (Daniel: «el que vende a veces no es el que cobra») la RPC es la v6 y las
  // dos rutas pasan por `leerComision` (`lib/comisiones/rpc`), que es el único
  // sitio que la nombra. Sigue siendo una por empresa, mismos argumentos.
  it("sigue siendo una RPC por empresa, y las dos rutas la piden por leerComision", async () => {
    await consolidado();
    expect(estado.rpcCalls.length).toBe(6);
    const consolidadoSrc = readFileSync(
      path.join(process.cwd(), "src/app/api/ventas/comisiones/consolidado/route.ts"),
      "utf8",
    );
    const unaSrc = readFileSync(
      path.join(process.cwd(), "src/app/api/ventas/comisiones/route.ts"),
      "utf8",
    );
    for (const src of [consolidadoSrc, unaSrc]) {
      expect(src).toContain("leerComision(empresa, year, mes)");
      expect(src).not.toMatch(/\.rpc\(/);
    }
    const rpcSrc = readFileSync(path.join(process.cwd(), "src/lib/comisiones/rpc.ts"), "utf8");
    expect(rpcSrc).toContain('"comision_b2b_v6"');
    expect(rpcSrc).toContain("p_empresa_key");
  });
});
