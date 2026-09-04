/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/guias/facturas-cliente — el puente de las facturas del cliente.
 *
 * Se LLAMA al handler real con la base doblada — y el doble APLICA los filtros
 * capturados, así que cambiar el puente cambia el resultado (un barrido de
 * texto se cumple con su propio comentario; ya pasó cuatro veces acá).
 *
 * Lo que se congela:
 *   1. 🔴 El puente es por CÓDIGO (`switch_clientes.codigo`), JAMÁS por nombre
 *      — el invariante de `clientes_master`: un JOIN por nombre contra una
 *      tabla con homónimos multiplica la factura.
 *   2. 🔴 Solo las 6 del grupo, por INCLUSIÓN (`.in(empresa_key, B2B)`): un
 *      par de Boston con el mismo código NO entra.
 *   3. Solo `tipo_comprobante = 'Factura'`, orden por fecha DESC.
 *   4. «Ya salió» se marca por (EMPRESA, número): el mismo secuencial en otra
 *      empresa NO se marca. Y NUNCA bloquea: la factura marcada SE DEVUELVE
 *      igual — filtrarla sería decidir por la persona.
 *   5. Un renglón de una guía BORRADA (o un renglón borrado de una guía viva)
 *      no produce el aviso.
 *   6. Un código que no es del grupo (numérico de Boston) → 400, no una lista
 *      vacía que parezca «sin ventas».
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

vi.mock("@/lib/require-auth", () => ({
  requireAuth: () => null,
  getSession: () => ({ role: "secretaria", userName: "Angela" }),
}));

type Filtro = [op: string, ...resto: unknown[]];
interface Consulta {
  tabla: string;
  sel: string;
  filtros: Filtro[];
}

let consultas: Consulta[];

/** Las filas que la base "tiene" en cada tabla. */
let switchClientes: Array<{ empresa_key: string; cliente_switch_id: number; codigo: string }>;
let switchFacturas: Array<{
  empresa_key: string;
  cliente_switch_id: number;
  secuencial: string;
  tipo_comprobante: string;
  fecha: string;
  total: number;
  switch_factura_id: number;
}>;
let guiasVivas: Array<{
  numero: number;
  deleted: boolean;
  guia_items: Array<{ empresa: string; facturas: string; deleted: boolean }>;
}>;
let syncLog: Array<{ empresa_key: string; sync_type: string; status: string; finished_at: string }>;

/** Parsea el or() de tuplas: and(empresa_key.eq.X,cliente_switch_id.eq.N),... */
function paresDelOr(or: string): Array<{ empresa: string; cid: number }> {
  const pares: Array<{ empresa: string; cid: number }> = [];
  const re = /and\(empresa_key\.eq\.([^,]+),cliente_switch_id\.eq\.(\d+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(or))) pares.push({ empresa: m[1], cid: Number(m[2]) });
  return pares;
}

function resolver(q: Consulta): { data: unknown[]; error: null; count: number } {
  const eqs = Object.fromEntries(q.filtros.filter((f) => f[0] === "eq").map((f) => [f[1], f[2]]));
  const ins = Object.fromEntries(q.filtros.filter((f) => f[0] === "in").map((f) => [f[1], f[2]]));
  const or = q.filtros.find((f) => f[0] === "or")?.[1] as string | undefined;
  const limite = q.filtros.find((f) => f[0] === "limit")?.[1] as number | undefined;
  const ordenes = q.filtros.filter((f) => f[0] === "order") as Array<[string, string, boolean]>;

  let filas: unknown[] = [];
  if (q.tabla === "switch_clientes") {
    filas = switchClientes.filter(
      (r) =>
        (!("codigo" in eqs) || r.codigo === eqs.codigo) &&
        (!("empresa_key" in ins) || (ins.empresa_key as string[]).includes(r.empresa_key)),
    );
  } else if (q.tabla === "switch_facturas") {
    const pares = or ? paresDelOr(or) : [];
    filas = switchFacturas.filter(
      (r) =>
        (!("tipo_comprobante" in eqs) || r.tipo_comprobante === eqs.tipo_comprobante) &&
        (pares.length === 0 ||
          pares.some((p) => p.empresa === r.empresa_key && p.cid === r.cliente_switch_id)),
    );
    for (const [, col, asc] of [...ordenes].reverse()) {
      filas = [...filas].sort((a, b) => {
        const va = (a as Record<string, unknown>)[col] as string | number;
        const vb = (b as Record<string, unknown>)[col] as string | number;
        if (va === vb) return 0;
        return (va < vb ? -1 : 1) * (asc ? 1 : -1);
      });
    }
  } else if (q.tabla === "guia_transporte") {
    filas = guiasVivas.filter((g) => !("deleted" in eqs) || g.deleted === eqs.deleted);
  } else if (q.tabla === "switch_sync_log") {
    filas = syncLog.filter(
      (r) =>
        (!("sync_type" in eqs) || r.sync_type === eqs.sync_type) &&
        (!("status" in eqs) || r.status === eqs.status) &&
        (!("empresa_key" in ins) || (ins.empresa_key as string[]).includes(r.empresa_key)),
    );
  }
  const total = filas.length;
  if (typeof limite === "number") filas = filas.slice(0, limite);
  const rango = q.filtros.find((f) => f[0] === "range") as [string, number, number] | undefined;
  if (rango) filas = filas.slice(rango[1], rango[2] + 1);
  return { data: filas, error: null, count: total };
}

function tablaDoble(tabla: string) {
  const q: Consulta & Record<string, unknown> = { tabla, sel: "", filtros: [] };
  const cadena = {
    select: (sel: string) => {
      q.sel = sel;
      return cadena;
    },
    eq: (c: string, v: unknown) => {
      q.filtros.push(["eq", c, v]);
      return cadena;
    },
    in: (c: string, v: unknown) => {
      q.filtros.push(["in", c, v]);
      return cadena;
    },
    or: (f: string) => {
      q.filtros.push(["or", f]);
      return cadena;
    },
    order: (c: string, o?: { ascending?: boolean }) => {
      q.filtros.push(["order", c, o?.ascending !== false]);
      return cadena;
    },
    limit: (n: number) => {
      q.filtros.push(["limit", n]);
      return cadena;
    },
    range: (a: number, b: number) => {
      q.filtros.push(["range", a, b]);
      return cadena;
    },
    then: (res: (v: unknown) => unknown) => {
      consultas.push(q);
      return Promise.resolve(resolver(q)).then(res);
    },
  };
  return cadena;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (tabla: string) => tablaDoble(tabla) },
}));

beforeEach(() => {
  consultas = [];
  switchClientes = [
    { empresa_key: "vistana", cliente_switch_id: 101, codigo: "D-24" },
    { empresa_key: "fashion_wear", cliente_switch_id: 202, codigo: "D-24" },
    // 🔴 el mismo código EXISTE en Boston: el .in() de inclusión lo deja afuera
    { empresa_key: "confecciones_boston", cliente_switch_id: 303, codigo: "D-24" },
  ];
  switchFacturas = [
    { empresa_key: "vistana", cliente_switch_id: 101, secuencial: "2535", tipo_comprobante: "Factura", fecha: "2026-09-03T20:00:00Z", total: 100, switch_factura_id: 1 },
    { empresa_key: "vistana", cliente_switch_id: 101, secuencial: "2536", tipo_comprobante: "Factura", fecha: "2026-09-04T15:00:00Z", total: 200, switch_factura_id: 2 },
    // el MISMO secuencial "2535" en OTRA empresa: no puede heredar el «ya salió»
    { empresa_key: "fashion_wear", cliente_switch_id: 202, secuencial: "2535", tipo_comprobante: "Factura", fecha: "2026-09-01T15:00:00Z", total: 300, switch_factura_id: 3 },
    // una Nota de Crédito del mismo cliente: NO se ofrece
    { empresa_key: "vistana", cliente_switch_id: 101, secuencial: "NC-9", tipo_comprobante: "Nota de Crédito", fecha: "2026-09-02T15:00:00Z", total: -50, switch_factura_id: 4 },
    // otro cliente_switch_id de la misma empresa: el OR de tuplas lo deja afuera
    { empresa_key: "vistana", cliente_switch_id: 999, secuencial: "8888", tipo_comprobante: "Factura", fecha: "2026-09-04T16:00:00Z", total: 999, switch_factura_id: 5 },
    // Boston: aunque el puente se abriera, esta fila delataría la fuga
    { empresa_key: "confecciones_boston", cliente_switch_id: 303, secuencial: "70001", tipo_comprobante: "Factura", fecha: "2026-09-04T17:00:00Z", total: 777, switch_factura_id: 6 },
  ];
  guiasVivas = [
    {
      numero: 204,
      deleted: false,
      guia_items: [
        { empresa: "Vistana International", facturas: "2535, 9999", deleted: false },
        // un renglón BORRADO de una guía viva no produce aviso
        { empresa: "Fashion Wear", facturas: "2535", deleted: true },
      ],
    },
  ];
  syncLog = [
    { empresa_key: "vistana", sync_type: "facturas", status: "success", finished_at: "2026-09-04T15:00:00Z" },
    { empresa_key: "fashion_wear", sync_type: "facturas", status: "success", finished_at: "2026-09-04T14:00:00Z" },
  ];
});

async function pedir(codigo: string) {
  const { GET } = await import("@/app/api/guias/facturas-cliente/route");
  const req = {
    nextUrl: new URL(`http://x/api/guias/facturas-cliente?codigo=${encodeURIComponent(codigo)}`),
  } as never;
  const res = await GET(req);
  return { status: res.status, body: await res.json() };
}

interface FacturaRespuesta {
  empresa_key: string;
  empresa: string;
  secuencial: string;
  fecha: string;
  total: number;
  yaSalioEn: number | null;
}

describe("el puente: por CÓDIGO, solo las 6 del grupo, solo Factura", () => {
  it("devuelve las facturas del cliente en las empresas donde compró, orden fecha DESC", async () => {
    const { status, body } = await pedir("D-24");
    expect(status).toBe(200);
    const facturas = body.facturas as FacturaRespuesta[];
    expect(facturas.map((f) => `${f.empresa_key}:${f.secuencial}`)).toEqual([
      "vistana:2536",
      "vistana:2535",
      "fashion_wear:2535",
    ]);
    // la empresa viaja con el nombre que escribe el <select> del formulario
    expect(facturas[0].empresa).toBe("Vistana International");
  });

  it("🔴 el puente pregunta por switch_clientes.codigo — jamás por nombre", async () => {
    await pedir("D-24");
    const puente = consultas.find((c) => c.tabla === "switch_clientes");
    expect(puente).toBeTruthy();
    expect(puente!.filtros).toContainEqual(["eq", "codigo", "D-24"]);
    // ninguna consulta del handler filtra por nombre, ni toca clientes_master
    for (const c of consultas) {
      expect(c.tabla).not.toBe("clientes_master");
      for (const f of c.filtros) {
        expect(String(f[1] ?? "")).not.toMatch(/nombre/);
      }
    }
  });

  it("🔴 la INCLUSIÓN es exactamente B2B_EMPRESA_KEYS: Boston y ACS no entran ni existiendo el código allá", async () => {
    const { body } = await pedir("D-24");
    const puente = consultas.find((c) => c.tabla === "switch_clientes");
    const inFiltro = puente!.filtros.find((f) => f[0] === "in");
    expect(inFiltro?.[1]).toBe("empresa_key");
    expect(inFiltro?.[2]).toEqual([...B2B_EMPRESA_KEYS]);
    const facturas = body.facturas as FacturaRespuesta[];
    expect(facturas.some((f) => f.empresa_key === "confecciones_boston")).toBe(false);
    expect(facturas.some((f) => f.secuencial === "70001")).toBe(false);
  });

  it("solo tipo Factura: la Nota de Crédito del mismo cliente no se ofrece", async () => {
    const { body } = await pedir("D-24");
    const facturas = body.facturas as FacturaRespuesta[];
    expect(facturas.some((f) => f.secuencial === "NC-9")).toBe(false);
    const fq = consultas.find((c) => c.tabla === "switch_facturas");
    expect(fq!.filtros).toContainEqual(["eq", "tipo_comprobante", "Factura"]);
  });

  it("el OR es de TUPLAS: otro cliente_switch_id de la misma empresa queda afuera", async () => {
    const { body } = await pedir("D-24");
    const facturas = body.facturas as FacturaRespuesta[];
    expect(facturas.some((f) => f.secuencial === "8888")).toBe(false);
  });
});

describe("«ya salió»: aviso por (empresa, número), y NUNCA bloqueo", () => {
  it("marca la factura que ya está en un renglón vivo de una guía viva — y la DEVUELVE igual", async () => {
    const { body } = await pedir("D-24");
    const facturas = body.facturas as FacturaRespuesta[];
    const vistana2535 = facturas.find((f) => f.empresa_key === "vistana" && f.secuencial === "2535");
    expect(vistana2535).toBeTruthy(); // 🔴 no se filtra: bloquear sería decidir por la persona
    expect(vistana2535!.yaSalioEn).toBe(204);
  });

  it("🔴 el MISMO secuencial en OTRA empresa NO hereda el aviso", async () => {
    const { body } = await pedir("D-24");
    const facturas = body.facturas as FacturaRespuesta[];
    const fw2535 = facturas.find((f) => f.empresa_key === "fashion_wear" && f.secuencial === "2535");
    // el único renglón vivo con "2535" de Fashion Wear está BORRADO
    expect(fw2535!.yaSalioEn).toBeNull();
  });

  it("una guía BORRADA no produce el aviso", async () => {
    guiasVivas = [
      {
        numero: 300,
        deleted: true,
        guia_items: [{ empresa: "Vistana International", facturas: "2536", deleted: false }],
      },
    ];
    const { body } = await pedir("D-24");
    const facturas = body.facturas as FacturaRespuesta[];
    const v2536 = facturas.find((f) => f.empresa_key === "vistana" && f.secuencial === "2536");
    expect(v2536!.yaSalioEn).toBeNull();
    // y el handler pidió guías con deleted=false
    const gq = consultas.find((c) => c.tabla === "guia_transporte");
    expect(gq!.filtros).toContainEqual(["eq", "deleted", false]);
  });
});

describe("los bordes", () => {
  it("un código que no es del grupo (numérico de Boston) → 400", async () => {
    expect((await pedir("111380")).status).toBe(400);
    expect((await pedir("")).status).toBe(400);
    expect((await pedir("TCKCTA")).status).toBe(400);
  });

  it("cliente sin puente → lista vacía con 200, no error", async () => {
    switchClientes = [];
    const { status, body } = await pedir("D-99");
    expect(status).toBe(200);
    expect(body.facturas).toEqual([]);
  });

  it("«hasta» = el sync exitoso más VIEJO entre las empresas (lo único que se puede prometer)", async () => {
    const { body } = await pedir("D-24");
    expect(body.hasta).toBe("2026-09-04T14:00:00Z");
  });
});
