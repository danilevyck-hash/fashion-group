/**
 * CANDADO — "un recibo de $0,00 no es un pago" + "última compra = la última FACTURA".
 *
 * 🩸 EL BUG (Daniel, 13-ago-2026): *"me sale en city mall paso canoas en fashion
 * wear ultimo pago 0.00 hace 15 dias, no hace sentido"*. La vista
 * `switch_ultimo_pago_cliente_v2` tomaba el recibo más reciente que no fuera
 * retención, y para D-25/fashion_wear ese era uno de **$0,00 del 29-jul**; el
 * pago de verdad son los **$187.651,51 del 22-jul**. Medido sobre la vista
 * COMPLETA (3.264 filas, paginadas): **166 clientes** mostraban como último pago
 * algo que no es un pago, algunos con fechas de 2024 y 2025.
 *
 * Estos tests EJECUTAN la conducta: llaman a los handlers reales con la base
 * mockeada y miran el JSON. Un barrido de texto no serviría — en este repo ya
 * pasó tres veces que el candado se cumpliera con el comentario que explica la
 * regla, o con un resultado calculado y tirado a la basura.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userName: "Daniel" }),
}));

/** Lo que la ruta le pidió a PostgREST: tabla, filtros y orden de cada página. */
interface Llamada {
  tabla: string;
  empresas?: string[];
  empresa?: string;
  orden: string[];
  desde: number;
}
const llamadas: Llamada[] = [];

/** Qué devuelve cada `.range()`: se resuelve por (tabla, desde). */
let responder: (tabla: string, desde: number) => { data: unknown[] | null; error?: unknown } = () => ({ data: [] });

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from(tabla: string) {
      const llamada: Llamada = { tabla, orden: [], desde: 0 };
      const chain: Record<string, unknown> = {
        select: () => chain,
        in: (_col: string, vals: string[]) => { llamada.empresas = vals; return chain; },
        eq: (_col: string, val: string) => { llamada.empresa = val; return chain; },
        order: (col: string) => { llamada.orden.push(col); return chain; },
        range: (desde: number) => {
          llamadas.push({ ...llamada, desde });
          const r = responder(tabla, desde);
          return Promise.resolve({ data: r.data, error: r.error ?? null });
        },
        // El cruce "también en el grupo" de Boston NO pagina: awaitea el select.
        then: (ok: (v: unknown) => unknown) => {
          llamadas.push({ ...llamada, desde: -1 });
          return Promise.resolve({ data: [], error: null }).then(ok);
        },
      };
      return chain;
    },
  },
}));

const deTabla = (t: string) => llamadas.filter((l) => l.tabla === t);

beforeEach(() => {
  llamadas.length = 0;
  responder = () => ({ data: [] });
});

/** Las filas REALES de producción (13-ago-2026) para los casos que importan. */
const FILAS_PAGO = [
  // El caso de Daniel: el recibo de $0,00 del 29-jul que tapaba el pago bueno.
  { empresa_key: "fashion_wear", cliente_codigo: "D-25", ultimo_pago_fecha: "2026-07-29", ultimo_pago_monto: 0 },
  // Un pago de verdad, que tiene que seguir llegando intacto.
  { empresa_key: "vistana", cliente_codigo: "D-122", ultimo_pago_fecha: "2026-07-23", ultimo_pago_monto: 3616.6 },
  // PostgREST manda `numeric` como STRING: "0" también es cero.
  { empresa_key: "fashion_shoes", cliente_codigo: "D-42", ultimo_pago_fecha: "2026-06-30", ultimo_pago_monto: "0" },
  { empresa_key: "active_shoes", cliente_codigo: "D-86", ultimo_pago_fecha: "2025-12-29", ultimo_pago_monto: "5000.00" },
];

type FilaPago = { empresa_key: string; cliente_codigo: string; ultimo_pago_monto: unknown };

async function getUltimoPago(): Promise<FilaPago[]> {
  const { GET } = await import("@/app/api/cxc/ultimo-pago/route");
  const res = await GET({} as never);
  return (await res.json()) as FilaPago[];
}

describe("/api/cxc/ultimo-pago — un recibo de $0,00 no es un pago", () => {
  beforeEach(() => {
    responder = (_t, desde) => ({ data: desde === 0 ? FILAS_PAGO : [] });
  });

  it("🔴 descarta el recibo de $0,00 de D-25/fashion_wear", async () => {
    const filas = await getUltimoPago();
    expect(filas.find((f) => f.cliente_codigo === "D-25")).toBeUndefined();
  });

  it("🔴 el $0 que llega como STRING también se descarta", async () => {
    const filas = await getUltimoPago();
    expect(filas.find((f) => f.cliente_codigo === "D-42")).toBeUndefined();
  });

  it("los pagos de verdad pasan intactos", async () => {
    const filas = await getUltimoPago();
    expect(filas.map((f) => f.cliente_codigo).sort()).toEqual(["D-122", "D-86"]);
    expect(filas.find((f) => f.cliente_codigo === "D-122")?.ultimo_pago_monto).toBe(3616.6);
  });

  it("ningún monto de la respuesta puede ser cero", async () => {
    const filas = await getUltimoPago();
    expect(filas.length).toBeGreaterThan(0);
    for (const f of filas) expect(Number(f.ultimo_pago_monto)).not.toBe(0);
  });

  it("🩸 el filtro NO corta la paginación: descartar filas no puede leerse como última página", async () => {
    // 1.000 filas EXACTAS y todas de $0: si el corte del bucle mirara lo
    // filtrado (0) en vez de lo leído (1.000), la 2ª página nunca se pediría y
    // los pagos buenos que viven ahí se perderían EN SILENCIO.
    const pagina1 = Array.from({ length: 1000 }, (_, i) => ({
      empresa_key: "confecciones_boston", cliente_codigo: `B-${i}`,
      ultimo_pago_fecha: "2025-01-01", ultimo_pago_monto: 0,
    }));
    const pagina2 = [{ empresa_key: "vistana", cliente_codigo: "D-13", ultimo_pago_fecha: "2026-02-23", ultimo_pago_monto: 4622.4 }];
    responder = (_t, desde) => ({ data: desde === 0 ? pagina1 : desde === 1000 ? pagina2 : [] });
    const filas = await getUltimoPago();
    expect(filas).toHaveLength(1);
    expect(filas[0].cliente_codigo).toBe("D-13");
  });

  it("sigue acotando la vista a las 6 empresas del grupo (Boston no se mezcla)", async () => {
    await getUltimoPago();
    const [primera] = deTabla("switch_ultimo_pago_cliente_v2");
    expect(primera.empresas).toEqual(
      expect.arrayContaining(["vistana", "fashion_wear", "fashion_shoes", "active_wear", "active_shoes", "joystep"]),
    );
    expect(primera.empresas).not.toContain("confecciones_boston");
    expect(primera.empresas).not.toContain("american_classic");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const FILAS_COMPRA = [
  { empresa_key: "fashion_wear", cliente_codigo: "D-25", ultima_compra_fecha: "2026-08-11", ultima_compra_monto: 6968.38 },
  { empresa_key: "active_shoes", cliente_codigo: "D-108", ultima_compra_fecha: "2026-08-06", ultima_compra_monto: 2684.63 },
];

async function getUltimaCompra() {
  const { GET } = await import("@/app/api/cxc/ultima-compra/route");
  const res = await GET({} as never);
  return { status: res.status, body: await res.json() };
}

describe("/api/cxc/ultima-compra", () => {
  beforeEach(() => {
    responder = (_t, desde) => ({ data: desde === 0 ? FILAS_COMPRA : [] });
  });

  it("devuelve la última factura por empresa+cliente", async () => {
    const { status, body } = await getUltimaCompra();
    expect(status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      empresa_key: "fashion_wear", cliente_codigo: "D-25",
      ultima_compra_fecha: "2026-08-11", ultima_compra_monto: 6968.38,
    });
  });

  it("🔴 acota a las 6 empresas del grupo — la cartera de Boston va aparte", async () => {
    await getUltimaCompra();
    const [primera] = deTabla("switch_ultima_compra_cliente_v1");
    expect(primera.empresas).toHaveLength(6);
    expect(primera.empresas).not.toContain("confecciones_boston");
    expect(primera.empresas).not.toContain("american_classic");
  });

  it("pide un orden ESTABLE para paginar (sin él PostgREST repite o saltea filas)", async () => {
    await getUltimaCompra();
    const [primera] = deTabla("switch_ultima_compra_cliente_v1");
    expect(primera.orden).toEqual(["empresa_key", "cliente_codigo"]);
  });

  // ⤺ CAMBIÓ DE DIRECCIÓN el 3-sep-2026. Hasta hoy este test exigía lo
  // CONTRARIO: "sin la DDL corrida devuelve [] y NO rompe el CXC". Era correcto
  // mientras la migración 20260813180000_ultima_compra_cliente.sql estuviera
  // pendiente. Ya corrió (la vista existe en producción), así que un PGRST205
  // que llegue hoy NO es "falta la DDL": es un permiso, un cambio de esquema o
  // un timeout mal leído. Devolver [] lo pintaba como "este cliente nunca
  // compró" y nadie se enteraba.
  it("🔴 un PGRST205 YA NO se traga: la vista existe, así que es un error de verdad", async () => {
    responder = () => ({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.switch_ultima_compra_cliente_v1' in the schema cache" },
    });
    const { status, body } = await getUltimaCompra();
    expect(status).toBe(500);
    expect(body.error).toBeTruthy();
    expect(body).not.toEqual([]);
  });

  it("🔴 tampoco un 42703 ni un 42P01 — ninguna forma de 'no existe' devuelve vacío", async () => {
    for (const error of [
      { code: "42P01", message: 'relation "switch_ultima_compra_cliente_v1" does not exist' },
      { code: "42703", message: "column ultima_compra_monto does not exist" },
    ]) {
      responder = () => ({ data: null, error });
      const { status } = await getUltimaCompra();
      expect(status, JSON.stringify(error)).toBe(500);
    }
  });

  it("🔴 un error DE VERDAD sigue siendo 500 — esconderlo sería agrandarlo", async () => {
    responder = () => ({
      data: null,
      error: { code: "57014", message: "canceling statement due to statement timeout" },
    });
    const { status, body } = await getUltimaCompra();
    expect(status).toBe(500);
    expect(body.error).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("/api/cxc/boston — el mismo criterio, y sin truncado silencioso", () => {
  /** Boston tiene 1.947 filas en la vista del último pago (medido 13-ago-2026):
   *  sin paginar se leen 1.000 y 947 clientes se ven como "sin último pago". */
  const cartera = [
    { codigo: "111412", cliente_switch_id: 1, nombre: "Cejisa Pma, S.A.", nombre_normalized: "CEJISA PMA SA", d0_90: 100, d91_120: 0, d121_plus: 0, total: 100 },
    { codigo: "112999", cliente_switch_id: 1500, nombre: "Cliente Lejano", nombre_normalized: "CLIENTE LEJANO", d0_90: 50, d91_120: 0, d121_plus: 0, total: 50 },
  ];
  const pagoCero = { cliente_switch_id: 1, ultimo_pago_fecha: "2026-07-24", ultimo_pago_monto: 0 };
  const relleno = Array.from({ length: 999 }, (_, i) => ({
    cliente_switch_id: 2 + i, ultimo_pago_fecha: "2025-01-01", ultimo_pago_monto: 10,
  }));
  const pagina2 = [{ cliente_switch_id: 1500, ultimo_pago_fecha: "2026-08-01", ultimo_pago_monto: 780.5 }];

  interface ClienteBoston { codigo: string; ultimo_pago_fecha: string | null; ultimo_pago_monto: number | null }

  async function getBoston(): Promise<ClienteBoston[]> {
    responder = (tabla, desde) => {
      if (tabla === "switch_estadocuenta_aging_boston") return { data: desde === 0 ? cartera : [] };
      if (tabla === "switch_ultimo_pago_cliente_v2")
        return { data: desde === 0 ? [pagoCero, ...relleno] : desde === 1000 ? pagina2 : [] };
      return { data: [] };
    };
    const { GET } = await import("@/app/api/cxc/boston/route");
    const res = await GET({} as never);
    const json = (await res.json()) as { clientes: ClienteBoston[] };
    return json.clientes;
  }

  it("🩸 pagina: el cliente de la fila 1.001 conserva su último pago", async () => {
    const clientes = await getBoston();
    const lejano = clientes.find((c) => c.codigo === "112999");
    expect(lejano?.ultimo_pago_fecha).toBe("2026-08-01");
    expect(lejano?.ultimo_pago_monto).toBe(780.5);
  });

  it("🔴 el recibo de $0,00 no se muestra como pago (138 de los 166 son de Boston)", async () => {
    const clientes = await getBoston();
    const cejisa = clientes.find((c) => c.codigo === "111412");
    expect(cejisa?.ultimo_pago_fecha).toBeNull();
    expect(cejisa?.ultimo_pago_monto).toBeNull();
  });

  it("sigue leyendo SOLO la cartera de Boston", async () => {
    await getBoston();
    for (const l of deTabla("switch_ultimo_pago_cliente_v2")) {
      expect(l.empresa).toBe("confecciones_boston");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const raiz = path.resolve(__dirname, "../../..");
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");
/** Los comentarios NO cuentan: este repo ya se quemó tres veces con candados
 *  que se cumplían a sí mismos con la nota que explicaba la regla. */
const sinComentarios = (sql: string) => sql.replace(/--[^\n]*/g, "");

const DDL_PAGO = "supabase/migrations/20260813170000_ultimo_pago_no_cuenta_recibos_cero.sql";
const DDL_COMPRA = "supabase/migrations/20260813180000_ultima_compra_cliente.sql";

describe("las DDL dicen la regla, no solo la explican", () => {
  it("la vista del último pago excluye los recibos de total 0", () => {
    const sql = sinComentarios(leer(DDL_PAGO));
    expect(sql).toMatch(/COALESCE\s*\(\s*r\.total\s*,\s*0\s*\)\s*<>\s*0/i);
  });

  it("🔴 y NO pierde la regla de las retenciones — Daniel: 'pago es sin contar retenciones'", () => {
    const sql = sinComentarios(leer(DDL_PAGO));
    expect(sql).toMatch(/r\.es_retencion\s*=\s*false/i);
  });

  it("🔴 la DDL del último pago NO toca las RPC de comisión (movería plata)", () => {
    // La base de cobro suma por `r.total`, así que un recibo de $0 ya aporta $0.
    // Tocar esas RPC acá cambiaría comisiones sin que nadie lo pidiera.
    const sql = sinComentarios(leer(DDL_PAGO));
    expect(sql.toLowerCase()).not.toContain("comision");
    expect(sql).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
  });

  it("🔴 la última compra son SOLO facturas — las notas de crédito no son compras", () => {
    const sql = sinComentarios(leer(DDL_COMPRA));
    expect(sql).toMatch(/tipo_comprobante\s*=\s*'Factura'/);
    // Ni una rama que las deje entrar por la puerta de al lado.
    expect(sql).not.toMatch(/tipo_comprobante\s*(IN|<>|!=)/i);
  });

  it("⚠️ la fecha de la última compra va en día PANAMÁ, no en UTC pelado", () => {
    const sql = sinComentarios(leer(DDL_COMPRA));
    expect(sql).toMatch(/AT TIME ZONE\s+'America\/Panama'/i);
  });

  it("la vista de última compra es una AGREGADA (una fila por empresa+cliente)", () => {
    const sql = sinComentarios(leer(DDL_COMPRA));
    expect(sql).toMatch(/DISTINCT ON\s*\(\s*f\.empresa_key\s*,\s*f\.cliente_switch_id\s*\)/i);
  });

  it("🩸 el código del cliente sale por SUBCONSULTA, no por JOIN (un JOIN duplicaría la fila)", () => {
    const sql = sinComentarios(leer(DDL_COMPRA));
    expect(sql).not.toMatch(/\bJOIN\b/i);
    expect(sql).toMatch(/SELECT\s+c\.codigo/i);
  });

  it("ninguna de las dos DDL vuelve a abrir la vista a anon", () => {
    for (const rel of [DDL_PAGO, DDL_COMPRA]) {
      const sql = sinComentarios(leer(rel));
      expect(sql, rel).not.toMatch(/GRANT[^;]*\bTO\b[^;]*\banon\b/i);
    }
  });
});

// ⤺ CAMBIÓ DE DIRECCIÓN el 3-sep-2026 (antes: "la app funciona SIN las DDL
// corridas"). La tolerancia era la correcta mientras la migración estaba
// pendiente; hoy la vista existe y esa rama solo podía esconder errores reales.
describe("la tolerancia a la DDL se RETIRÓ — la rama muerta no vuelve sola", () => {
  it("la ruta de última compra ya no reconoce 'la vista no existe'", () => {
    const src = sinComentarios(leer("src/app/api/cxc/ultima-compra/route.ts"));
    expect(src).not.toContain("esTablaAusente");
    expect(src).not.toContain("PGRST205");
  });

  it("🔴 y no quedó ningún camino que responda vacío ante un error", () => {
    const src = sinComentarios(leer("src/app/api/cxc/ultima-compra/route.ts"));
    // Un `return NextResponse.json([])` dentro del `if (error)` sería el mismo
    // silencio con otro nombre.
    const dentroDelIf = src.slice(src.indexOf("if (error)"), src.indexOf("if (!data"));
    expect(dentroDelIf).not.toMatch(/NextResponse\.json\(\[\]\)/);
    expect(dentroDelIf).toContain("500");
  });
});
