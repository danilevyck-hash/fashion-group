// ═════════════════════════════════════════════════════════════════════════════
// 🔴 CAMBIAR EL VENDEDOR DE UNA FACTURA (11-nov-2026) — comision_b2b_v10.
// ═════════════════════════════════════════════════════════════════════════════
// Daniel: en Comisiones, desde el detalle de la factura, SOLO admin pasa la
// comisión de UNA factura a otro vendedor. Lo que sostiene este candado:
//   1. El interruptor nace APAGADO (la DDL no está aplicada).
//   2. La migración: tabla con una sola ACTIVA por (empresa, switch_factura_id),
//      soft delete firmado, RLS, sin DELETE; la v10 es la v9 byte a byte salvo
//      el COALESCE del vendedor; el detalle cambia lo mismo y saca el id.
//   3. Conducta real (pglite): factura de A pasada a B → la comisión sale en B
//      y no en A; con el cliente excluido para B → no comisiona; devolverla la
//      regresa a A; la v9 no se entera. El COBRO no cambia.
//   4. La ruta: solo admin; POST valida; DELETE es soft delete, nunca .delete().
//   5. Barrido: nadie borra filas de comision_factura_vendedor.
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { globSync } from "glob";
import {
  COMISIONES_CAMBIAR_VENDEDOR_FACTURA,
  ROTULO_CAMBIAR_VENDEDOR,
  ROTULO_DEVOLVER_VENDEDOR,
  ROTULO_VENDEDOR_EN_SWITCH,
  claveDeFactura,
  validarCambioDeVendedor,
  validarDevolucion,
  vendedorConCambio,
} from "@/lib/comisiones/cambiar-vendedor";

const RAIZ = process.cwd();
const MIG_V10 = "supabase/migrations/20261111130000_comision_factura_vendedor_v10.sql";
const MIG_V9 = "supabase/migrations/20261008120000_comision_b2b_v9_cliente_por_codigo.sql";
const MIG_V8 = "supabase/migrations/20260913120000_comision_vendedor_alias_v8.sql";

const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const soloSql = (rel: string) =>
  leer(rel).split("\n").map((l) => (l.indexOf("--") === -1 ? l : l.slice(0, l.indexOf("--")))).join("\n");
function cuerpo(sql: string, fn: string): string {
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${fn}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, "i");
  const m = sql.match(re);
  expect(m, `no encontré el cuerpo de ${fn}`).toBeTruthy();
  return m![1];
}
const compacto = (s: string) => s.replace(/\s+/g, " ").trim();

/** Deshace a mano lo que la v10 cambia sobre la v9: lo que queda tiene que ser la v9. */
function comoLaV9(body: string): string {
  return body
    .replace(/COALESCE\(cfv\.vendedor, comision_vendedor_canonico\(sf\.vendedor_nombre\)\) AS vendedor_factura/g, "comision_vendedor_canonico(sf.vendedor_nombre) AS vendedor_factura")
    .replace(/\s*, sf\.switch_factura_id\s*, CASE WHEN cfv\.vendedor IS NOT NULL THEN comision_vendedor_canonico\(sf\.vendedor_nombre\) END AS vendedor_switch/g, "")
    .replace(/\s*LEFT JOIN comision_factura_vendedor cfv ON cfv\.empresa_key = sf\.empresa_key AND cfv\.switch_factura_id = sf\.switch_factura_id AND cfv\.activa = true/g, "")
    .replace(/\s*dv\.switch_factura_id, dv\.vendedor_switch,/g, "")
    .replace(/'pct_utilidad', d\.pct_utilidad,\s*'switch_factura_id', d\.switch_factura_id,\s*'vendedor_switch', d\.vendedor_switch/g, "'pct_utilidad', d.pct_utilidad")
    .replace(/\s*'vendedor_por_factura', 'aplicado',/g, "");
}

// ═══ 1. El interruptor y el módulo puro ══════════════════════════════════════
describe("🔴 el interruptor nace APAGADO y el módulo puro valida", () => {
  it("COMISIONES_CAMBIAR_VENDEDOR_FACTURA = false hasta que la DDL 20261111130000 esté aplicada", () => {
    expect(COMISIONES_CAMBIAR_VENDEDOR_FACTURA).toBe(false);
  });
  it("nombres de ERP en los rótulos", () => {
    expect(ROTULO_CAMBIAR_VENDEDOR).toBe("Cambiar vendedor");
    expect(ROTULO_DEVOLVER_VENDEDOR).toBe("Devolver al de Switch");
    expect(ROTULO_VENDEDOR_EN_SWITCH).toBe("Vendedor en Switch");
  });
  it("validar: empresa de las 6, id entero positivo, secuencial, vendedor normalizado y nunca el comodín", () => {
    const ok = validarCambioDeVendedor({ empresa_key: "vistana", switch_factura_id: 101, secuencial: "16-000123", vendedor: " edwin " });
    expect(ok).toEqual({ ok: true, valor: { empresa_key: "vistana", switch_factura_id: 101, secuencial: "16-000123", vendedor: "EDWIN" } });
    expect(validarCambioDeVendedor({ empresa_key: "confecciones_boston", switch_factura_id: 1, secuencial: "x", vendedor: "A" }).ok).toBe(false);
    expect(validarCambioDeVendedor({ empresa_key: "vistana", switch_factura_id: 0, secuencial: "x", vendedor: "A" }).ok).toBe(false);
    expect(validarCambioDeVendedor({ empresa_key: "vistana", switch_factura_id: 1, secuencial: "", vendedor: "A" }).ok).toBe(false);
    expect(validarCambioDeVendedor({ empresa_key: "vistana", switch_factura_id: 1, secuencial: "x", vendedor: "*" }).ok).toBe(false);
    expect(validarCambioDeVendedor(null).ok).toBe(false);
    expect(validarDevolucion("vistana", "7")).toEqual({ ok: true, valor: { empresa_key: "vistana", switch_factura_id: 7 } });
    expect(validarDevolucion("vistana", "x").ok).toBe(false);
    expect(validarDevolucion(null, "7").ok).toBe(false);
  });
  it("vendedorConCambio: el cambio activo manda; sin cambio o sin id, el que viene (misma regla que el COALESCE)", () => {
    const cambios = new Map([[claveDeFactura("vistana", 101), "REYNALDO ESPINOSA"]]);
    expect(vendedorConCambio({ empresa_key: "vistana", switch_factura_id: 101, vendedor: "EDWIN" }, cambios)).toBe("REYNALDO ESPINOSA");
    expect(vendedorConCambio({ empresa_key: "vistana", switch_factura_id: 102, vendedor: "EDWIN" }, cambios)).toBe("EDWIN");
    expect(vendedorConCambio({ empresa_key: "joystep", switch_factura_id: 101, vendedor: "EDWIN" }, cambios)).toBe("EDWIN");
    expect(vendedorConCambio({ empresa_key: "vistana", switch_factura_id: null, vendedor: "EDWIN" }, cambios)).toBe("EDWIN");
  });
});

// ═══ 2. La migración ═════════════════════════════════════════════════════════
describe("🔴 la migración: tabla, candados y la v10 = la v9 salvo el COALESCE", () => {
  const sql = soloSql(MIG_V10);
  const v9 = soloSql(MIG_V9);

  it("la tabla se identifica por switch_factura_id (el secuencial se repite entre eras), una sola ACTIVA, soft delete FIRMADO, RLS, sin DELETE", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS comision_factura_vendedor/);
    expect(sql).toMatch(/switch_factura_id\s+bigint NOT NULL/);
    expect(compacto(sql)).toContain("CREATE UNIQUE INDEX IF NOT EXISTS comision_factura_vendedor_activa_unica ON comision_factura_vendedor (empresa_key, switch_factura_id) WHERE activa");
    expect(compacto(sql)).toContain("CHECK (activa OR (desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL))");
    expect(compacto(sql)).toContain("CHECK (vendedor = UPPER(BTRIM(vendedor)) AND vendedor <> '')");
    expect(sql).toMatch(/ALTER TABLE comision_factura_vendedor ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON comision_factura_vendedor TO service_role/);
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*comision_factura_vendedor/i);
    expect(sql).toMatch(/CREATE TRIGGER comision_factura_vendedor_canonicalizar/);
    expect(sql).not.toMatch(/switch_facturas\s+SET/i);
  });

  it("es una función NUEVA (v10) y no dropea ni pisa la v9 ni las anteriores", () => {
    expect(sql).toMatch(/CREATE\s+FUNCTION\s+comision_b2b_v10\s*\(/i);
    expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
    expect(sql).not.toMatch(/FUNCTION\s+comision_b2b_v[56789]\s*\(/i);
  });

  it("🔴 deshaciendo el COALESCE y el JOIN, la v10 ES la v9 (byte a byte, compactada)", () => {
    const b10 = cuerpo(sql, "comision_b2b_v10");
    const b9 = cuerpo(v9, "comision_b2b_v9");
    expect(compacto(comoLaV9(b10))).toBe(compacto(b9));
    expect(compacto(b9).length).toBeGreaterThan(1500);
    expect(b10).toContain("COALESCE(cfv.vendedor, comision_vendedor_canonico(sf.vendedor_nombre)) AS vendedor_factura");
    expect((b10.match(/LEFT JOIN comision_factura_vendedor cfv/g) ?? [])).toHaveLength(1);
    expect(b10).toContain("'vendedor_por_factura', 'aplicado'");
  });

  it("🔴 el DETALLE cambia lo mismo (paridad tabla ↔ modal) y saca switch_factura_id y vendedor_switch por documento", () => {
    const d10 = cuerpo(sql, "comision_b2b_detalle");
    const d9 = cuerpo(v9, "comision_b2b_detalle");
    expect(compacto(comoLaV9(d10))).toBe(compacto(d9));
    expect(d10).toContain("'switch_factura_id', d.switch_factura_id");
    expect(d10).toContain("'vendedor_switch', d.vendedor_switch");
  });

  it("🔴 las exclusiones se aplican DESPUÉS, sobre el vendedor ya cambiado: el JOIN de exclusión mira dv.vendedor_factura (que ya trae el COALESCE)", () => {
    const b10 = cuerpo(sql, "comision_b2b_v10");
    const ventas = compacto(b10.slice(b10.indexOf("ventas AS ("), b10.indexOf("cobros AS (")));
    expect(ventas).toContain("AND (ce.vendedor = '*' OR ce.vendedor = UPPER(COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor))))");
  });

  it("🔴 el COBRO no se toca: el CTE de cobros sigue siendo el de la v9 y no menciona la tabla", () => {
    const b10 = cuerpo(sql, "comision_b2b_v10");
    const cobros = b10.slice(b10.indexOf("cobros AS ("), b10.indexOf("universo AS ("));
    expect(cobros).not.toContain("comision_factura_vendedor");
    expect(cobros).toContain("comision_vendedor_canonico(r.vendedor_registro)");
  });

  it("no hay un signo de dólar suelto fuera de los delimitadores (el SQL Editor revienta)", () => {
    expect(leer(MIG_V10).replace(/\$\$/g, "")).not.toMatch(/\$/);
  });

  it("rpc.ts pide la v10 y cae a la v9", async () => {
    const { CADENA_RPC_COMISION, RPC_COMISION } = await import("@/lib/comisiones/rpc");
    expect(RPC_COMISION).toBe("comision_b2b_v10");
    expect(CADENA_RPC_COMISION.slice(0, 2).map((c) => c.fn)).toEqual(["comision_b2b_v10", "comision_b2b_v9"]);
  });
});

// ═══ 3. La conducta, con el SQL de verdad (pglite) ═══════════════════════════
const PGLITE_DIR = process.env.PGLITE_DIR ?? "/tmp/v6/node_modules/@electric-sql/pglite";
const hayPglite = existsSync(path.join(PGLITE_DIR, "dist/index.js"));

describe.skipIf(!hayPglite)("🔴 conducta real de v10 (pglite): la factura de A pasa a B, la exclusión manda sobre B, devolver la regresa", () => {
  type Fila = Record<string, unknown>;
  let query: (sql: string, params?: unknown[]) => Promise<{ rows: Fila[] }>;
  let exec: (sql: string) => Promise<unknown>;
  let cerrar: () => Promise<void>;
  const sqlDeMigracion = (rel: string) => leer(rel).replace(/^GRANT .*$/gm, "").replace(/^NOTIFY .*$/gm, "");

  beforeAll(async () => {
    const { PGlite } = await import(/* @vite-ignore */ path.join(PGLITE_DIR, "dist/index.js"));
    const db = new PGlite();
    query = (sql, params) => db.query(sql, params);
    exec = (sql) => db.exec(sql);
    cerrar = () => db.close();
    await exec(`
      CREATE ROLE service_role NOLOGIN;
      CREATE TABLE switch_recibos (id uuid DEFAULT gen_random_uuid(), empresa_key text, fecha date, fecha_creacion timestamptz,
        cliente_switch_id int, cliente_codigo text, cliente_nombre text, vendedor_registro text,
        vendedor_cartera text, total numeric(14,4), es_retencion boolean NOT NULL DEFAULT false);
      CREATE TABLE switch_factura_utilidad (id uuid DEFAULT gen_random_uuid(), empresa_key text, secuencial text, fecha date,
        tipo_comprobante text, vendedor text, cliente text, subtotal_con_descuento numeric, pct_utilidad numeric);
      CREATE TABLE switch_facturas (id uuid DEFAULT gen_random_uuid(), empresa_key text, switch_factura_id int, secuencial text, fecha timestamptz, vendedor_nombre text, cliente_switch_id int);
      CREATE TABLE switch_clientes (id uuid DEFAULT gen_random_uuid(), empresa_key text, cliente_switch_id int, codigo text, nombre text);
      CREATE TABLE vendedores (empresa_key text, nombre text, activo boolean);
      CREATE TABLE comision_vendedor_tasa (vendedor_nombre text PRIMARY KEY, tasa_venta numeric(6,4), tasa_cobro numeric(6,4), activo boolean, updated_at timestamptz);
      CREATE TABLE comision_descuentos_fijos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendedor_nombre text NOT NULL, empresa_key text NOT NULL, concepto text NOT NULL,
        monto numeric(12,2), activo boolean NOT NULL DEFAULT true, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
        UNIQUE (vendedor_nombre, empresa_key, concepto));
    `);
    for (const m of [
      "supabase/migrations/20260703120000_comision_b2b_v5_vendedor_factura.sql",
      "supabase/migrations/20260911120000_comision_b2b_v6_cobro_quien_registro.sql",
      "supabase/migrations/20260912120000_comision_exclusion_v7.sql",
      MIG_V8,
      "supabase/migrations/20261007120000_comision_descuentos_vigencia.sql",
      MIG_V9,
      MIG_V10,
    ]) {
      await exec(sqlDeMigracion(m));
    }
    // Vistana, julio 2026: EDWIN (A) vende F-1 (id 101) a D-84 y F-2 (id 102) a
    // D-1; REYNALDO (B) no vende nada. EDWIN registró un recibo de D-84.
    await exec(`
      INSERT INTO switch_clientes (empresa_key, cliente_switch_id, codigo, nombre) VALUES
        ('vistana', 90, 'D-84', 'Kheriddine'), ('vistana', 1, 'D-1', 'Otro');
      INSERT INTO comision_vendedor_tasa VALUES ('EDWIN', 0.005, 0.005, true, now()), ('REYNALDO ESPINOSA', 0.01, 0.01, true, now())
        ON CONFLICT (vendedor_nombre) DO UPDATE SET tasa_venta = EXCLUDED.tasa_venta, tasa_cobro = EXCLUDED.tasa_cobro, activo = true;
      INSERT INTO switch_facturas (empresa_key, switch_factura_id, secuencial, fecha, vendedor_nombre, cliente_switch_id) VALUES
        ('vistana', 101, 'F-1', '2026-07-10 12:00-05', 'EDWIN', 90),
        ('vistana', 102, 'F-2', '2026-07-11 12:00-05', 'EDWIN', 1);
      INSERT INTO switch_factura_utilidad (empresa_key, secuencial, fecha, tipo_comprobante, vendedor, cliente, subtotal_con_descuento, pct_utilidad) VALUES
        ('vistana', 'F-1', '2026-07-10', 'Factura', 'EDWIN', 'Kheriddine', 1000, 30),
        ('vistana', 'F-2', '2026-07-11', 'Factura', 'EDWIN', 'Otro', 500, 30);
      INSERT INTO switch_recibos (empresa_key, fecha, cliente_switch_id, cliente_codigo, cliente_nombre, vendedor_registro, total) VALUES
        ('vistana', '2026-07-15', 90, 'D-84', 'Kheriddine', 'EDWIN', 700);
      UPDATE comision_exclusion SET activa = false, desactivado_por = 'test', desactivado_en = now() WHERE activa;
    `);
  });
  afterAll(async () => { await cerrar?.(); });

  const fila = async (fn: string, vendedor: string) => {
    const r = await query(`SELECT ${fn}('vistana', 2026, 7) AS j`);
    return (r.rows[0].j as { vendedores: Fila[] }).vendedores.find((v) => v.vendedor === vendedor);
  };
  const detalle = async (vendedor: string) => {
    const r = await query(`SELECT comision_b2b_detalle('vistana', 2026, 7, $1) AS j`, [vendedor]);
    return r.rows[0].j as { ventas: Fila[]; cobros: Fila[]; ventas_base: number; cobros_base: number; vendedor_por_factura: string };
  };

  it("sin cambios, v10 == v9 (EDWIN 1.500 de venta, 700 de cobro; REYNALDO sin fila)", async () => {
    const a = await fila("comision_b2b_v9", "EDWIN");
    const b = await fila("comision_b2b_v10", "EDWIN");
    expect(Number(a!.base)).toBe(1500);
    expect(Number(a!.base_cobro)).toBe(700);
    expect(b).toEqual(a);
    expect(await fila("comision_b2b_v10", "REYNALDO ESPINOSA")).toBeUndefined();
    const d = await detalle("EDWIN");
    expect(d.ventas.map((v) => [v.secuencial, v.switch_factura_id, v.vendedor_switch])).toEqual([["F-1", 101, null], ["F-2", 102, null]]);
    expect(d.vendedor_por_factura).toBe("aplicado");
  });

  it("🔴 F-1 pasa de EDWIN a REYNALDO: la venta sale en REYNALDO y NO en EDWIN; el COBRO se queda con quien registró", async () => {
    await exec(`INSERT INTO comision_factura_vendedor (empresa_key, switch_factura_id, secuencial, vendedor, creado_por) VALUES ('vistana', 101, 'F-1', 'Reinaldo Espinosa', 'daniel')`);
    // El trigger canonicaliza: «Reinaldo Espinosa» → REYNALDO ESPINOSA (alias).
    expect((await query(`SELECT vendedor FROM comision_factura_vendedor WHERE activa`)).rows[0].vendedor).toBe("REYNALDO ESPINOSA");
    const a = await fila("comision_b2b_v10", "EDWIN");
    const b = await fila("comision_b2b_v10", "REYNALDO ESPINOSA");
    expect(Number(a!.base)).toBe(500);           // solo F-2
    expect(Number(a!.base_cobro)).toBe(700);     // el recibo NO se mueve
    expect(Number(b!.base)).toBe(1000);          // F-1
    expect(Number(b!.base_cobro)).toBe(0);
    expect(Number(b!.comision_total)).toBe(10);  // 1000 × 1%
    // El detalle cierra con la tabla y dice de quién era en Switch.
    const dB = await detalle("REYNALDO ESPINOSA");
    expect(dB.ventas.map((v) => [v.secuencial, v.switch_factura_id, v.vendedor_switch])).toEqual([["F-1", 101, "EDWIN"]]);
    expect(Number(dB.ventas_base)).toBe(1000);
    const dA = await detalle("EDWIN");
    expect(dA.ventas.map((v) => v.secuencial)).toEqual(["F-2"]);
    expect(dA.cobros).toHaveLength(1);
    // La v9 no se enteró: sigue diciendo 1.500.
    expect(Number((await fila("comision_b2b_v9", "EDWIN"))!.base)).toBe(1500);
  });

  it("🔴 con D-84 excluido para REYNALDO, F-1 no comisiona para nadie (la exclusión va sobre el vendedor YA cambiado)", async () => {
    await exec(`INSERT INTO comision_exclusion (empresa_key, cliente_codigo, vendedor, creado_por, excluye_cobro) VALUES ('vistana', 'D-84', 'REYNALDO ESPINOSA', 'test', false)`);
    expect(Number((await fila("comision_b2b_v10", "REYNALDO ESPINOSA"))?.base ?? 0)).toBe(0); // sin ventas ni cobros no entra al universo
    expect(Number((await fila("comision_b2b_v10", "EDWIN"))!.base)).toBe(500);
    expect((await detalle("REYNALDO ESPINOSA")).ventas).toEqual([]);
    await exec(`UPDATE comision_exclusion SET activa = false, desactivado_por = 'test', desactivado_en = now() WHERE activa`);
    expect(Number((await fila("comision_b2b_v10", "REYNALDO ESPINOSA"))!.base)).toBe(1000);
  });

  it("la tabla no acepta dos ACTIVAS para la misma factura ni una baja sin firma; el vendedor sale normalizado", async () => {
    await expect(query(`INSERT INTO comision_factura_vendedor (empresa_key, switch_factura_id, secuencial, vendedor, creado_por) VALUES ('vistana', 101, 'F-1', 'DANIEL LEVY', 'test')`)).rejects.toThrow(/comision_factura_vendedor_activa_unica/);
    await expect(query(`UPDATE comision_factura_vendedor SET activa = false WHERE activa`)).rejects.toThrow(/comision_factura_vendedor_desactivacion_firmada/);
    await expect(query(`INSERT INTO comision_factura_vendedor (empresa_key, switch_factura_id, secuencial, vendedor, creado_por) VALUES ('vistana', 102, '', 'EDWIN', 'test')`)).rejects.toThrow(/secuencial_no_vacio/);
  });

  it("🔴 devolver (soft delete firmado) regresa F-1 a EDWIN, y la fila se queda como historial", async () => {
    await exec(`UPDATE comision_factura_vendedor SET activa = false, desactivado_por = 'daniel', desactivado_en = now() WHERE activa`);
    expect(Number((await fila("comision_b2b_v10", "EDWIN"))!.base)).toBe(1500);
    expect(await fila("comision_b2b_v10", "REYNALDO ESPINOSA")).toBeUndefined();
    expect((await query(`SELECT COUNT(*)::int AS n FROM comision_factura_vendedor`)).rows[0].n).toBe(1);
    // Y se puede volver a cambiar (otra fila, una activa).
    await exec(`INSERT INTO comision_factura_vendedor (empresa_key, switch_factura_id, secuencial, vendedor, creado_por) VALUES ('vistana', 101, 'F-1', 'REYNALDO ESPINOSA', 'daniel')`);
    expect(Number((await fila("comision_b2b_v10", "REYNALDO ESPINOSA"))!.base)).toBe(1000);
  });
});

// ═══ 4. La ruta: solo admin, POST valida, DELETE es soft delete ══════════════
const fromCalls: { tabla: string; op: string; args: unknown[] }[] = [];
let filasActivas = 0;
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    rpc: async (fn: string) => ({ data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn}` } }),
    from: (tabla: string) => {
      const self: Record<string, unknown> = {};
      let op = "select";
      const paso = () => () => self;
      const resultado = () => {
        if (op === "update") {
          const n = filasActivas; filasActivas = 0;
          return { data: Array.from({ length: n }, (_, i) => ({ id: i + 1 })), error: null };
        }
        if (op === "insert") { filasActivas = 1; return { data: { id: 42 }, error: null }; }
        return { data: [], error: null };
      };
      Object.assign(self, {
        select: paso(), eq: paso(), in: paso(),
        insert: (...args: unknown[]) => { op = "insert"; fromCalls.push({ tabla, op, args }); return self; },
        update: (...args: unknown[]) => { op = "update"; fromCalls.push({ tabla, op, args }); return self; },
        delete: (...args: unknown[]) => { op = "delete"; fromCalls.push({ tabla, op, args }); return self; },
        single: async () => resultado(),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(res, rej),
      });
      return self;
    },
  },
}));
vi.mock("@/lib/log-activity", () => ({ logActivity: async () => {} }));

describe("🔴 /api/ventas/comisiones/factura-vendedor: solo admin, POST valida, DELETE es soft delete", () => {
  let firmar: (p: Record<string, unknown>) => string;
  const SECRET_PREV = process.env.SESSION_SECRET;
  beforeAll(async () => {
    process.env.SESSION_SECRET = "test-secret-factura-vendedor";
    firmar = (await import("@/lib/session-cookie")).signSession;
  });
  afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });
  beforeEach(() => { fromCalls.length = 0; filasActivas = 0; });

  const req = async (role: string | null, url: string, init?: { method?: string; body?: unknown }) => {
    const { NextRequest } = await import("next/server");
    const r = new NextRequest(new URL(url, "http://localhost"), init?.body !== undefined
      ? { method: init.method ?? "POST", body: JSON.stringify(init.body), headers: { "content-type": "application/json" } }
      : { method: init?.method ?? "DELETE" });
    if (role) r.cookies.set("cxc_session", firmar({ role, sessionToken: "t", userName: role }));
    return r;
  };
  const CUERPO = { empresa_key: "vistana", switch_factura_id: 101, secuencial: "16-000123", vendedor: "Edwin" };

  it("403 para todo rol que no sea admin (también la secretaria, que sí cobra), 401 sin cookie; y no escribe nada", async () => {
    const { POST, DELETE } = await import("@/app/api/ventas/comisiones/factura-vendedor/route");
    for (const rol of ["secretaria", "contabilidad", "vendedor", "bodega", "gerente_acs", "gerente_boston"]) {
      expect((await POST(await req(rol, "/x", { body: CUERPO }))).status, `${rol} POST`).toBe(403);
      expect((await DELETE(await req(rol, "/x?empresa=vistana&id=101"))).status, `${rol} DELETE`).toBe(403);
    }
    expect((await POST(await req(null, "/x", { body: CUERPO }))).status).toBe(401);
    expect(fromCalls).toHaveLength(0);
  });

  it("admin POST: 400 con cuerpo inválido; 201 con uno bueno, la fila va NORMALIZADA y firmada por quien lo hizo", async () => {
    const { POST } = await import("@/app/api/ventas/comisiones/factura-vendedor/route");
    expect((await POST(await req("admin", "/x", { body: { ...CUERPO, empresa_key: "confecciones_boston" } }))).status).toBe(400);
    expect((await POST(await req("admin", "/x", { body: { ...CUERPO, vendedor: "*" } }))).status).toBe(400);
    expect((await POST(await req("admin", "/x", { body: { ...CUERPO, vendedor: "REY STOUTE AGUAS" } }))).status).toBe(400);
    expect(fromCalls).toHaveLength(0);
    const ok = await POST(await req("admin", "/x", { body: CUERPO }));
    expect(ok.status).toBe(201);
    // Primero desactiva (firmado) un cambio anterior si lo hubiera; después inserta.
    expect(fromCalls.map((c) => c.op)).toEqual(["update", "insert"]);
    expect(fromCalls[0].args[0]).toMatchObject({ activa: false, desactivado_por: "admin" });
    expect(fromCalls[1].tabla).toBe("comision_factura_vendedor");
    expect(fromCalls[1].args[0]).toEqual({ empresa_key: "vistana", switch_factura_id: 101, secuencial: "16-000123", vendedor: "EDWIN", creado_por: "admin" });
  });

  it("🔴 admin DELETE: UPDATE activa=false firmado, nunca .delete(); sin fila activa es 404", async () => {
    const { DELETE } = await import("@/app/api/ventas/comisiones/factura-vendedor/route");
    filasActivas = 1;
    const res = await DELETE(await req("admin", "/x?empresa=vistana&id=101"));
    expect(res.status).toBe(200);
    expect(fromCalls.some((c) => c.op === "delete")).toBe(false);
    expect(fromCalls[0]).toMatchObject({ tabla: "comision_factura_vendedor", op: "update" });
    expect(fromCalls[0].args[0]).toMatchObject({ activa: false, desactivado_por: "admin" });
    expect((await DELETE(await req("admin", "/x?empresa=vistana&id=101"))).status).toBe(404);
    expect((await DELETE(await req("admin", "/x?empresa=vistana&id=abc"))).status).toBe(400);
  });
});

// ═══ 5. Barrido: NUNCA un DELETE sobre comision_factura_vendedor ═════════════
describe("🔴 barrido: nadie borra filas de comision_factura_vendedor", () => {
  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|[^:"'`])\/\/.*$/, "$1")).join("\n");

  it("ninguna migración hace DELETE FROM / TRUNCATE / DROP sobre la tabla", () => {
    const dir = path.join(RAIZ, "supabase/migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      const sql = soloSql(path.join("supabase/migrations", f));
      expect(sql, f).not.toMatch(/DELETE\s+FROM\s+comision_factura_vendedor/i);
      expect(sql, f).not.toMatch(/TRUNCATE\s+(TABLE\s+)?comision_factura_vendedor/i);
      expect(sql, f).not.toMatch(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?comision_factura_vendedor/i);
    }
  });

  it("ningún archivo de src/ encadena .delete() sobre la tabla; el servidor quita con UPDATE", () => {
    const archivos = globSync("src/**/*.{ts,tsx}", { cwd: RAIZ, ignore: ["src/__tests__/**"] });
    expect(archivos.length).toBeGreaterThan(100);
    for (const rel of archivos) {
      const src = sinComentarios(leer(rel));
      if (!/comision_factura_vendedor|TABLA_FACTURA_VENDEDOR/.test(src)) continue;
      const bloques = [...src.matchAll(/\.from\(\s*(?:"comision_factura_vendedor"|TABLA_FACTURA_VENDEDOR)\s*\)[\s\S]*?;/g)].map((m) => m[0]);
      for (const b of bloques) expect(b, rel).not.toMatch(/\.delete\s*\(/);
    }
    const server = sinComentarios(leer("src/lib/comisiones/cambiar-vendedor-server.ts"));
    expect(server).toMatch(/\.update\(\{ activa: false, desactivado_por: /);
    expect(server).not.toMatch(/\.delete\s*\(/);
    // Y nadie escribe switch_facturas desde Comisiones: el sync la pisa.
    for (const rel of ["src/lib/comisiones/cambiar-vendedor-server.ts", "src/app/api/ventas/comisiones/factura-vendedor/route.ts"]) {
      expect(sinComentarios(leer(rel)), rel).not.toMatch(/switch_facturas/);
    }
  });
});
