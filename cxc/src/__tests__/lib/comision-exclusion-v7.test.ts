// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — «Clientes que no comisionan»: (empresa, cliente, vendedor).
//
// 🩸 Daniel, 3-sep-2026, textual: «crea configuración en comisiones para
// desactivar cálculos de clientes». Grano «cliente vendedor». Y aplica a venta
// y cobro: «correcto, también venta».
//
// Lo que se exige, en las capas donde vive:
//   1. El SQL (sin comentarios): la tabla comision_exclusion (soft delete
//      firmado, única entre ACTIVAS, RLS solo service_role, GRANT sin DELETE),
//      las 11 exclusiones iniciales (17 filas: Active Wear con las DOS grafías
//      de Reinaldo), y comision_b2b_v7 = comision_b2b_v6 byte a byte más el
//      LEFT JOIN a la exclusión en `ventas` Y en `cobros`. El detalle excluye
//      lo mismo. La v6 y la v5 no se tocan.
//   2. La CONDUCTA del SQL de verdad, en un Postgres local (pglite), con
//      fixtures mínimas: exclusión activa → esa fila no comisiona ni en venta
//      ni en cobro; inactiva → sí; otro vendedor con el mismo cliente → sí;
//      el detalle cierra al centavo con la tabla. Corre cuando pglite está
//      instalado (PGLITE_DIR, ver scripts/_medir-comision-exclusiones-v7.mjs);
//      si no, ese bloque se marca como omitido y el resto sigue vigilando.
//   3. El módulo que elige la RPC: v7 primero, y dice `version` y
//      `exclusiones_aplicadas`.
//   4. La parte pura: validación fail-closed y la marca «N clientes sin
//      comisión» pegada al vendedor correcto (normalizando el nombre).
//   5. Las rutas: solo admin (403 al resto, 401 sin cookie), POST valida,
//      DELETE es soft delete — y barrido: nadie hace DELETE sobre la tabla.
//   6. La pantalla: no dice «exclusión» (Daniel: «no lo llames así»).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import { globSync } from "glob";

const RAIZ = process.cwd();
const MIG_V7 = "supabase/migrations/20260912120000_comision_exclusion_v7.sql";
const MIG_V6 = "supabase/migrations/20260911120000_comision_b2b_v6_cobro_quien_registro.sql";
const MIG_V5 = "supabase/migrations/20260703120000_comision_b2b_v5_vendedor_factura.sql";

const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

/** El SQL sin comentarios `--`: lo que Postgres ejecuta. */
const soloSql = (rel: string) =>
  leer(rel)
    .split("\n")
    .map((l) => (l.indexOf("--") === -1 ? l : l.slice(0, l.indexOf("--"))))
    .join("\n");

/** Un cuerpo de función, por nombre. */
function cuerpo(sql: string, fn: string): string {
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${fn}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, "i");
  const m = sql.match(re);
  expect(m, `no encontré el cuerpo de ${fn}`).toBeTruthy();
  return m![1];
}
const compacto = (s: string) => s.replace(/\s+/g, " ").trim();
/** Lo que la v7 agrega sobre la v6: cada línea nueva nombra a la exclusión,
 *  al puente de clientes o al alias `ce`. Sin esas líneas, tiene que quedar
 *  la v6 tal cual. */
const ES_LINEA_DE_EXCLUSION = /comision_exclusion|\bce\.|switch_clientes|AS cliente_codigo|'exclusiones'/;
const sinLineasDeExclusion = (body: string) =>
  body.split("\n").filter((l) => !ES_LINEA_DE_EXCLUSION.test(l)).join("\n");
const cte = (body: string, desde: string, hasta: string) => {
  const i = body.indexOf(desde);
  const j = body.indexOf(hasta, i);
  expect(i, `sin ${desde}`).toBeGreaterThan(-1);
  expect(j, `sin ${hasta}`).toBeGreaterThan(i);
  return body.slice(i, j);
};

const EXCLUSIONES_DE_DANIEL: Record<string, string[]> = {
  active_shoes: ["D-84", "D-103", "D-145", "D-104", "D-115"],
  active_wear: ["D-156", "D-49", "D-98", "D-42", "D-104", "D-50"],
};

// ═══ 1. El SQL ═══════════════════════════════════════════════════════════════
describe("🔴 comision_exclusion: la tabla", () => {
  const v7 = soloSql(MIG_V7);

  it("existe, con soft delete FIRMADO y los nombres normalizados por CHECK", () => {
    expect(v7).toMatch(/CREATE TABLE IF NOT EXISTS comision_exclusion \(/);
    for (const col of ["empresa_key", "cliente_codigo", "vendedor", "activa", "creado_por", "creado_en", "desactivado_por", "desactivado_en"]) {
      expect(v7, col).toMatch(new RegExp(`^\\s+${col}\\s`, "m"));
    }
    // Sin «motivo»: Daniel no lo pidió y no se guarda lo que no se pide.
    expect(v7).not.toMatch(/^\s+motivo\s/m);
    expect(v7).toMatch(/activa\s+boolean NOT NULL DEFAULT true/);
    expect(compacto(v7)).toContain("CHECK (vendedor = UPPER(BTRIM(vendedor)) AND vendedor <> '')");
    expect(compacto(v7)).toContain("CHECK (cliente_codigo = UPPER(BTRIM(cliente_codigo)) AND cliente_codigo <> '')");
    expect(compacto(v7)).toContain("CHECK (activa OR (desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL))");
  });

  it("única entre ACTIVAS: excluir, quitar y volver a excluir son tres filas", () => {
    expect(compacto(v7)).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS \w+ ON comision_exclusion \(empresa_key, cliente_codigo, vendedor\) WHERE activa;/);
  });

  it("RLS encendido, política solo service_role, y el GRANT NO da DELETE", () => {
    expect(v7).toMatch(/ALTER TABLE comision_exclusion ENABLE ROW LEVEL SECURITY/);
    expect(compacto(v7)).toMatch(/CREATE POLICY service_role_all ON comision_exclusion FOR ALL TO service_role/);
    const grant = v7.match(/GRANT ([A-Z, ]+) ON comision_exclusion TO service_role/);
    expect(grant, "sin GRANT sobre la tabla").toBeTruthy();
    expect(grant![1]).not.toMatch(/DELETE/);
    expect(grant![1]).toMatch(/UPDATE/);
  });

  it("carga las 11 exclusiones de Daniel (17 filas: Active Wear con REINALDO y REYNALDO), firmadas por daniel el 3-sep-2026", () => {
    const filas = [...v7.matchAll(/\('(\w+)',\s*'(D-\d+)',\s*'([A-Z ]+)',\s*'daniel',\s*'2026-09-03[^']*'\)/g)]
      .map((m) => ({ empresa: m[1], codigo: m[2], vendedor: m[3] }));
    expect(filas).toHaveLength(17);
    for (const [empresa, codigos] of Object.entries(EXCLUSIONES_DE_DANIEL)) {
      for (const c of codigos) {
        expect(filas.some((f) => f.empresa === empresa && f.codigo === c && f.vendedor === "REINALDO ESPINOSA"), `${empresa} ${c} REINALDO`).toBe(true);
      }
    }
    // Las dos grafías SOLO en Active Wear, y para los 6 clientes.
    const reynaldo = filas.filter((f) => f.vendedor === "REYNALDO ESPINOSA");
    expect(reynaldo.map((f) => f.empresa)).toEqual(Array(6).fill("active_wear"));
    expect(reynaldo.map((f) => f.codigo).sort()).toEqual([...EXCLUSIONES_DE_DANIEL.active_wear].sort());
    // Idempotente sobre la unicidad parcial.
    expect(compacto(v7)).toContain("ON CONFLICT (empresa_key, cliente_codigo, vendedor) WHERE activa DO NOTHING");
  });
});

describe("🔴 comision_b2b_v7: la v6 más la exclusión, en venta Y en cobro", () => {
  const v7 = soloSql(MIG_V7);
  const v6 = soloSql(MIG_V6);
  const v5 = soloSql(MIG_V5);
  const b7 = cuerpo(v7, "comision_b2b_v7");
  const b6 = cuerpo(v6, "comision_b2b_v6");

  it("es una función NUEVA y no dropea ni pisa la v6 ni la v5", () => {
    expect(v7).toMatch(/CREATE\s+FUNCTION\s+comision_b2b_v7\s*\(/i);
    expect(v7).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+comision_b2b_v7/i);
    expect(v7).not.toMatch(/DROP\s+FUNCTION/i);
    expect(v7).not.toMatch(/FUNCTION\s+comision_b2b_v[56]\s*\(/i);
    // Y la v6 sigue diciendo lo que decía.
    expect(v6).toMatch(/CREATE\s+FUNCTION\s+comision_b2b_v6\s*\(/i);
    expect(cuerpo(v5, "comision_b2b_v5")).toMatch(/GROUP BY r\.vendedor_cartera/);
  });

  it("sin las líneas de exclusión, la v7 ES la v6 (byte a byte, compactada)", () => {
    expect(compacto(sinLineasDeExclusion(b7))).toBe(compacto(b6));
    expect(compacto(b6).length).toBeGreaterThan(1500);
  });

  it("VENTAS: LEFT JOIN a la exclusión ACTIVA por (empresa, código del cliente, vendedor normalizado) y se queda con lo que NO cruza", () => {
    const ventas = compacto(cte(b7, "ventas AS (", "cobros AS ("));
    expect(ventas).toContain("LEFT JOIN comision_exclusion ce ON ce.empresa_key = p_empresa_key AND ce.cliente_codigo = dv.cliente_codigo AND ce.vendedor = UPPER(TRIM(COALESCE(dv.vendedor_factura, f.vendedor))) AND ce.activa = true");
    expect(ventas).toContain("AND ce.id IS NULL");
    // El código del cliente sale del puente switch_facturas → switch_clientes.
    const dv = compacto(cte(b7, "WITH doc_vendedor AS (", "ventas AS ("));
    expect(dv).toContain("UPPER(TRIM(sc.codigo)) AS cliente_codigo");
    expect(dv).toContain("LEFT JOIN switch_clientes sc ON sc.empresa_key = sf.empresa_key AND sc.cliente_switch_id = sf.cliente_switch_id");
  });

  it("COBROS: mismo JOIN sobre el recibo (cliente_codigo, quien REGISTRÓ) y los tres filtros de siempre", () => {
    const cobros = compacto(cte(b7, "cobros AS (", "universo AS ("));
    expect(cobros).toContain("LEFT JOIN comision_exclusion ce ON ce.empresa_key = p_empresa_key AND ce.cliente_codigo = UPPER(TRIM(r.cliente_codigo)) AND ce.vendedor = UPPER(TRIM(r.vendedor_registro)) AND ce.activa = true");
    expect(cobros).toContain("AND ce.id IS NULL");
    expect(cobros).toMatch(/es_retencion\s*=\s*false/);
    expect(cobros).toContain("'TCKCTA'");
    expect(cobros).toMatch(/multi fashion holding/i);
    expect(cobros).toContain("GROUP BY NULLIF(TRIM(r.vendedor_registro), '')");
    expect(cobros).not.toMatch(/vendedor_cartera/);
  });

  it("el detalle (misma DDL) excluye lo MISMO en ventas y en cobros — paridad tabla ↔ modal", () => {
    const det = cuerpo(v7, "comision_b2b_detalle");
    const docs = compacto(cte(det, "docs AS (", "INTO v_ventas"));
    expect(docs).toContain("LEFT JOIN comision_exclusion ce ON ce.empresa_key = p_empresa_key AND ce.cliente_codigo = dv.cliente_codigo AND ce.vendedor = UPPER(TRIM(COALESCE(dv.vendedor_factura, f.vendedor))) AND ce.activa = true");
    expect(docs).toContain("AND ce.id IS NULL");
    const cobros = compacto(det.slice(det.indexOf("FROM switch_recibos")));
    expect(cobros).toContain("LEFT JOIN comision_exclusion ce ON ce.empresa_key = p_empresa_key AND ce.cliente_codigo = UPPER(TRIM(r.cliente_codigo)) AND ce.vendedor = UPPER(TRIM(r.vendedor_registro)) AND ce.activa = true");
    expect(cobros).toContain("AND ce.id IS NULL");
    expect(cobros).toContain("NULLIF(TRIM(r.vendedor_registro), '') = p_vendedor");
    // Y sin las líneas de exclusión, el detalle es el de la v6.
    expect(compacto(sinLineasDeExclusion(det))).toBe(compacto(cuerpo(v6, "comision_b2b_detalle")));
  });

  it("la respuesta dice que las exclusiones ya están aplicadas", () => {
    expect(b7).toContain("'exclusiones', 'cliente_vendedor'");
    expect(b7).toContain("'regla_cobro', 'quien_registro'");
  });

  it("no hay un signo de dólar suelto fuera de los delimitadores (el SQL Editor revienta)", () => {
    expect(leer(MIG_V7).replace(/\$\$/g, "")).not.toMatch(/\$/);
  });

  it("Reinaldo queda en 1% de venta y 1% de cobro, en las DOS grafías (Daniel: «pon a Reinaldo 1 y 1»)", () => {
    const upd = compacto(v7.slice(v7.indexOf("UPDATE comision_vendedor_tasa")));
    expect(upd).toContain("SET tasa_venta = 0.0100, tasa_cobro = 0.0100");
    expect(upd).toContain("WHERE vendedor_nombre IN ('REINALDO ESPINOSA', 'REYNALDO ESPINOSA')");
  });
});

// ═══ 2. La conducta, con el SQL de verdad (pglite) ═══════════════════════════
const PGLITE_DIR = process.env.PGLITE_DIR ?? "/tmp/v6/node_modules/@electric-sql/pglite";
const hayPglite = existsSync(path.join(PGLITE_DIR, "dist/index.js"));

describe.skipIf(!hayPglite)("🔴 conducta real de v7 (pglite): activa resta, inactiva no, otro vendedor sí, detalle cierra", () => {
  type Fila = Record<string, unknown>;
  let query: (sql: string, params?: unknown[]) => Promise<{ rows: Fila[] }>;
  let exec: (sql: string) => Promise<unknown>;
  let cerrar: () => Promise<void>;

  const sqlDeMigracion = (rel: string) =>
    leer(rel).replace(/^GRANT .*$/gm, "").replace(/^NOTIFY .*$/gm, "");

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
      CREATE TABLE switch_facturas (id uuid DEFAULT gen_random_uuid(), empresa_key text, secuencial text, fecha timestamptz, vendedor_nombre text, cliente_switch_id int);
      CREATE TABLE switch_clientes (id uuid DEFAULT gen_random_uuid(), empresa_key text, cliente_switch_id int, codigo text, nombre text);
      CREATE TABLE vendedores (empresa_key text, nombre text, activo boolean);
      CREATE TABLE comision_vendedor_tasa (vendedor_nombre text, tasa_venta numeric, tasa_cobro numeric, activo boolean, updated_at timestamptz);
    `);
    await exec(sqlDeMigracion(MIG_V5));
    await exec(sqlDeMigracion(MIG_V6));
    await exec(sqlDeMigracion(MIG_V7));
    // Fixtures: en active_shoes, Reinaldo vende y cobra a D-84 (excluido) y a
    // D-1 (no); DEFAULT también vende y cobra a D-84 (no está excluido).
    await exec(`
      INSERT INTO switch_clientes (empresa_key, cliente_switch_id, codigo, nombre) VALUES
        ('active_shoes', 90, 'D-84', 'Kheriddine'), ('active_shoes', 1, 'D-1', 'Otro');
      INSERT INTO vendedores VALUES ('active_shoes', 'REINALDO ESPINOSA', true), ('active_shoes', 'DEFAULT', true);
      INSERT INTO comision_vendedor_tasa VALUES ('REINALDO ESPINOSA', 0.01, 0.01, true), ('DEFAULT', 0.005, 0.005, true);
      INSERT INTO switch_facturas (empresa_key, secuencial, fecha, vendedor_nombre, cliente_switch_id) VALUES
        ('active_shoes', 'F-1', '2026-07-10 12:00-05', 'REINALDO ESPINOSA', 90),
        ('active_shoes', 'F-2', '2026-07-11 12:00-05', 'REINALDO ESPINOSA', 1),
        ('active_shoes', 'F-3', '2026-07-12 12:00-05', 'DEFAULT', 90);
      INSERT INTO switch_factura_utilidad (empresa_key, secuencial, fecha, tipo_comprobante, vendedor, cliente, subtotal_con_descuento, pct_utilidad) VALUES
        ('active_shoes', 'F-1', '2026-07-10', 'Factura', 'REINALDO ESPINOSA', 'Kheriddine', 1000, 30),
        ('active_shoes', 'F-2', '2026-07-11', 'Factura', 'REINALDO ESPINOSA', 'Otro', 500, 30),
        ('active_shoes', 'F-3', '2026-07-12', 'Factura', 'DEFAULT', 'Kheriddine', 2000, 30);
      INSERT INTO switch_recibos (empresa_key, fecha, cliente_switch_id, cliente_codigo, cliente_nombre, vendedor_registro, total) VALUES
        ('active_shoes', '2026-07-15', 90, 'D-84', 'Kheriddine', 'REINALDO ESPINOSA', 700),
        ('active_shoes', '2026-07-16', 1, 'D-1', 'Otro', 'REINALDO ESPINOSA', 300),
        ('active_shoes', '2026-07-17', 90, 'D-84', 'Kheriddine', 'DEFAULT', 900);
      -- La lista arranca vacía en este arnés: las 17 de Daniel son de otras
      -- empresas/clientes y no cruzan con estas fixtures, pero se limpian
      -- (soft delete firmado) para que el caso sea el mínimo.
      UPDATE comision_exclusion SET activa = false, desactivado_por = 'test', desactivado_en = now();
    `);
  });
  afterAll(async () => { await cerrar?.(); });

  const fila = async (fn: string, vendedor: string) => {
    const r = await query(`SELECT ${fn}('active_shoes', 2026, 7) AS j`);
    const j = r.rows[0].j as { vendedores: Fila[] };
    return j.vendedores.find((v) => v.vendedor === vendedor)!;
  };

  it("sin exclusiones, v7 == v6 (Reinaldo: 1.500 de venta, 1.000 de cobro)", async () => {
    const a = await fila("comision_b2b_v6", "REINALDO ESPINOSA");
    const b = await fila("comision_b2b_v7", "REINALDO ESPINOSA");
    expect(Number(a.base)).toBe(1500);
    expect(Number(a.base_cobro)).toBe(1000);
    expect(b).toEqual(a);
  });

  it("🔴 exclusión ACTIVA (active_shoes, D-84, REINALDO): esa fila no comisiona ni en venta ni en cobro; DEFAULT con el mismo cliente sí", async () => {
    await exec(`INSERT INTO comision_exclusion (empresa_key, cliente_codigo, vendedor, creado_por) VALUES ('active_shoes', 'D-84', 'REINALDO ESPINOSA', 'test')`);
    const r = await fila("comision_b2b_v7", "REINALDO ESPINOSA");
    expect(Number(r.base)).toBe(500);          // solo D-1
    expect(Number(r.base_cobro)).toBe(300);    // solo D-1
    expect(Number(r.comision_total)).toBe(8);  // 500×1% + 300×1%
    const d = await fila("comision_b2b_v7", "DEFAULT");
    expect(Number(d.base)).toBe(2000);         // D-84 sigue comisionando para DEFAULT
    expect(Number(d.base_cobro)).toBe(900);
    // La v6 no se enteró: sigue diciendo 1.500 / 1.000.
    const v6 = await fila("comision_b2b_v6", "REINALDO ESPINOSA");
    expect(Number(v6.base)).toBe(1500);
  });

  it("el detalle cierra AL CENTAVO con la fila de la tabla, con la exclusión puesta", async () => {
    const r = await query(`SELECT comision_b2b_detalle('active_shoes', 2026, 7, 'REINALDO ESPINOSA') AS j`);
    const d = r.rows[0].j as { ventas: Fila[]; cobros: Fila[]; ventas_base: number; cobros_base: number; comision_total: number };
    expect(d.ventas.map((v) => v.secuencial)).toEqual(["F-2"]);
    expect(d.cobros).toHaveLength(1);
    expect(Number(d.ventas_base)).toBe(500);
    expect(Number(d.cobros_base)).toBe(300);
    expect(Number(d.comision_total)).toBe(8);
  });

  it("la tabla no acepta nombres sin normalizar ni dos ACTIVAS iguales; quitar es soft delete FIRMADO", async () => {
    await expect(query(`INSERT INTO comision_exclusion (empresa_key, cliente_codigo, vendedor, creado_por) VALUES ('active_shoes', 'D-1', 'Reinaldo Espinosa', 'test')`)).rejects.toThrow(/comision_exclusion_vendedor_normalizado/);
    await expect(query(`INSERT INTO comision_exclusion (empresa_key, cliente_codigo, vendedor, creado_por) VALUES ('active_shoes', 'D-84', 'REINALDO ESPINOSA', 'test')`)).rejects.toThrow(/comision_exclusion_activa_unica/);
    await expect(query(`UPDATE comision_exclusion SET activa = false WHERE cliente_codigo = 'D-84' AND activa`)).rejects.toThrow(/comision_exclusion_desactivacion_firmada/);
  });

  it("exclusión INACTIVA: la fila vuelve a comisionar (v7 == v6), y se puede volver a excluir (otra fila)", async () => {
    await exec(`UPDATE comision_exclusion SET activa = false, desactivado_por = 'test', desactivado_en = now() WHERE cliente_codigo = 'D-84' AND activa`);
    const r = await fila("comision_b2b_v7", "REINALDO ESPINOSA");
    expect(Number(r.base)).toBe(1500);
    expect(Number(r.base_cobro)).toBe(1000);
    await exec(`INSERT INTO comision_exclusion (empresa_key, cliente_codigo, vendedor, creado_por) VALUES ('active_shoes', 'D-84', 'REINALDO ESPINOSA', 'test')`);
    // Historial: la de Daniel (apagada por el arnés), la quitada y la nueva —
    // tres filas, UNA activa.
    const n = await query(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE activa)::int AS activas FROM comision_exclusion WHERE empresa_key = 'active_shoes' AND cliente_codigo = 'D-84' AND vendedor = 'REINALDO ESPINOSA'`);
    expect(n.rows[0]).toEqual({ n: 3, activas: 1 });
    expect(Number((await fila("comision_b2b_v7", "REINALDO ESPINOSA")).base)).toBe(500);
  });

  it("la exclusión atrapa el nombre con espacio o en minúsculas en la fuente (mismo UPPER(TRIM))", async () => {
    await exec(`UPDATE switch_recibos SET vendedor_registro = 'reinaldo espinosa ' WHERE cliente_codigo = 'D-84' AND vendedor_registro = 'REINALDO ESPINOSA'`);
    const r = await query(`SELECT comision_b2b_v7('active_shoes', 2026, 7) AS j`);
    const j = r.rows[0].j as { vendedores: Fila[] };
    // Ese recibo ahora se agrupa como «reinaldo espinosa» (la RPC solo recorta),
    // y AUN ASÍ la exclusión lo atrapa: no aparece con base de cobro.
    const raro = j.vendedores.find((v) => v.vendedor === "reinaldo espinosa");
    expect(raro).toBeUndefined();
  });
});

// ═══ 3. El módulo que elige la RPC ═══════════════════════════════════════════
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const sinFuncion = (fn: string) => ({ data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn}` } });
let respuestaV7: () => { data: unknown; error: { code?: string; message: string } | null } = () => sinFuncion("comision_b2b_v7");
const VENDEDORES = [
  { vendedor: "REINALDO ESPINOSA", base: 500, tasa: 0.01, comision: 5, base_cobro: 300, tasa_cobro: 0.01, comision_cobro: 3, comision_total: 8 },
  { vendedor: "DEFAULT", base: 2000, tasa: 0.005, comision: 10, base_cobro: 900, tasa_cobro: 0.005, comision_cobro: 4.5, comision_total: 14.5 },
];

/** Lo que las rutas escriben/leen por `from()`, para asertar el soft delete. */
const fromCalls: { tabla: string; op: string; args: unknown[] }[] = [];
let exclusionesEnBase: Record<string, unknown>[] = [];
let fromRevienta = false;

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      // La v8 (alias, 3-sep-2026 noche) no existe en este arnés: acá se prueba
      // la cadena v7 → v6 tal cual. La v8 tiene su candado en comision-alias-v8.
      if (fn === "comision_b2b_v8") return sinFuncion("comision_b2b_v8");
      if (fn === "comision_b2b_v7") {
        // La empresa pedida vuelve en la respuesta, como en la RPC real.
        const r = respuestaV7();
        return r.data ? { ...r, data: { ...(r.data as Record<string, unknown>), empresa_key: args.p_empresa_key } } : r;
      }
      if (fn === "comision_b2b_v6") return { data: { empresa_key: args.p_empresa_key, vendedores: VENDEDORES }, error: null };
      return { data: null, error: { message: `rpc inesperada ${fn}` } };
    },
    from: (tabla: string) => {
      if (fromRevienta) throw new Error("sin base");
      const self: Record<string, unknown> = {};
      let op = "select";
      let filtroId: number | null = null;
      let filtroActiva: boolean | null = null;
      const paso = (nombre: string) => (...args: unknown[]) => {
        if (nombre === "eq" && args[0] === "id") filtroId = Number(args[1]);
        if (nombre === "eq" && args[0] === "activa") filtroActiva = Boolean(args[1]);
        return self;
      };
      const resultado = () => {
        if (tabla === "comision_exclusion") {
          if (op === "select") return { data: exclusionesEnBase.filter((e) => e.activa), error: null, count: null };
          if (op === "update") {
            const hit = exclusionesEnBase.filter((e) => e.id === filtroId && (filtroActiva === null || e.activa === filtroActiva));
            for (const h of hit) Object.assign(h, { activa: false });
            return { data: hit.map((h) => ({ id: h.id })), error: null };
          }
          if (op === "insert") return { data: { id: 99 }, error: null };
        }
        if (tabla === "switch_clientes") return { data: [{ empresa_key: "active_shoes", codigo: "D-84", nombre: "Kheriddine" }], error: null };
        return { data: [], error: null, count: 0 };
      };
      Object.assign(self, {
        select: paso("select"), eq: paso("eq"), in: paso("in"), gte: paso("gte"), order: paso("order"), limit: paso("limit"), or: paso("or"), range: paso("range"),
        insert: (...args: unknown[]) => { op = "insert"; fromCalls.push({ tabla, op, args }); return self; },
        update: (...args: unknown[]) => { op = "update"; fromCalls.push({ tabla, op, args }); return self; },
        delete: (...args: unknown[]) => { op = "delete"; fromCalls.push({ tabla, op, args }); return self; },
        upsert: async () => ({ error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => resultado(),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(res, rej),
      });
      return self;
    },
  },
}));
vi.mock("@/lib/comisiones/descuentos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/comisiones/descuentos")>()),
  leerDescuentosEfectivos: async () => [],
}));

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-exclusiones-v7"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

// CAMBIÓ DE DIRECCIÓN el 3-sep-2026 (noche): la vigente es la v8 y la v7 pasó
// a ser «la anterior». Lo que este bloque exige —la v7 antes que la v6, y el
// fallback confesando `version` y `exclusiones_aplicadas`— se mantiene, con la
// v8 doblada como inexistente (arriba).
// CAMBIÓ DE DIRECCIÓN el 6-sep-2026: la vigente es la v9 (D-108 excluido por
// CÓDIGO, no por nombre) y la v8 pasó a ser «la anterior». Lo que estos casos
// exigen —el orden de la cadena y el fallback confesando `version`— no cambia:
// solo se agrega un eslabón adelante.
describe("🔴 leerComision: v7 después de la v8, y dice qué corrió", () => {
  beforeEach(() => { rpcCalls.length = 0; });

  it("la cadena es v9 → v8 → v7 → v6 → v5", async () => {
    const { RPC_COMISION, RPC_COMISION_V8, RPC_COMISION_ANTERIOR, RPC_COMISION_V6, RPC_COMISION_V5, CADENA_RPC_COMISION } = await import("@/lib/comisiones/rpc");
    expect([RPC_COMISION, RPC_COMISION_V8, RPC_COMISION_ANTERIOR, RPC_COMISION_V6, RPC_COMISION_V5]).toEqual(["comision_b2b_v9", "comision_b2b_v8", "comision_b2b_v7", "comision_b2b_v6", "comision_b2b_v5"]);
    expect(CADENA_RPC_COMISION.map((c) => c.fn)).toEqual(["comision_b2b_v9", "comision_b2b_v8", "comision_b2b_v7", "comision_b2b_v6", "comision_b2b_v5"]);
  });

  it("con la DDL de v7 aplicada (y la v8 no): v8 → v7, version = v7, exclusiones_aplicadas = true", async () => {
    respuestaV7 = () => ({ data: { empresa_key: "active_shoes", year: 2026, mes: 7, regla_cobro: "quien_registro", exclusiones: "cliente_vendedor", vendedores: VENDEDORES }, error: null });
    const { leerComision } = await import("@/lib/comisiones/rpc");
    const r = await leerComision("active_shoes", 2026, 7);
    expect(r.error).toBeNull();
    expect(r.data?.version).toBe("v7");
    expect(r.data?.exclusiones_aplicadas).toBe(true);
    expect(r.data?.alias_aplicado).toBe(false);
    expect(r.data?.regla_cobro).toBe("quien_registro");
    expect(rpcCalls.map((c) => c.fn)).toEqual(["comision_b2b_v9", "comision_b2b_v8", "comision_b2b_v7"]);
  });

  it("sin la DDL: cae a la v6 y lo confiesa (version = v6, exclusiones_aplicadas = false)", async () => {
    respuestaV7 = () => sinFuncion("comision_b2b_v7");
    const { leerComision } = await import("@/lib/comisiones/rpc");
    const r = await leerComision("active_shoes", 2026, 7);
    expect(r.error).toBeNull();
    expect(r.data?.version).toBe("v6");
    expect(r.data?.exclusiones_aplicadas).toBe(false);
    expect(rpcCalls.map((c) => c.fn)).toEqual(["comision_b2b_v9", "comision_b2b_v8", "comision_b2b_v7", "comision_b2b_v6"]);
  });
});

// ═══ 4. La parte pura ════════════════════════════════════════════════════════
describe("🔴 validarExclusionNueva: fail-closed y normaliza", () => {
  it("acepta y normaliza (código y vendedor en mayúsculas, sin bordes)", async () => {
    const { validarExclusionNueva } = await import("@/lib/comisiones/exclusiones");
    const v = validarExclusionNueva({ empresa_key: "active_wear", cliente_codigo: " d-156 ", vendedor: " Reynaldo Espinosa " });
    // Desde la v8 (3-sep-2026 noche) la fila lleva las dos casillas; sin
    // mandarlas valen true (como al agregar: «arranca con las dos marcadas»).
    expect(v).toEqual({ ok: true, valor: { empresa_key: "active_wear", cliente_codigo: "D-156", vendedor: "REYNALDO ESPINOSA", excluye_venta: true, excluye_cobro: true } });
  });

  it("rechaza: empresa fuera de las 6, Boston, sin cliente, mostrador, sin vendedor; ignora lo que sobra", async () => {
    const { validarExclusionNueva } = await import("@/lib/comisiones/exclusiones");
    const base = { empresa_key: "active_shoes", cliente_codigo: "D-84", vendedor: "REINALDO ESPINOSA" };
    expect(validarExclusionNueva({ ...base, empresa_key: "confecciones_boston" }).ok).toBe(false);
    expect(validarExclusionNueva({ ...base, empresa_key: "american_classic" }).ok).toBe(false);
    expect(validarExclusionNueva({ ...base, cliente_codigo: "" }).ok).toBe(false);
    expect(validarExclusionNueva({ ...base, cliente_codigo: "tckcta" }).ok).toBe(false);
    expect(validarExclusionNueva({ ...base, vendedor: "  " }).ok).toBe(false);
    expect(validarExclusionNueva(null).ok).toBe(false);
    // Un campo que no se pide (motivo) no viaja a la fila.
    const extra = validarExclusionNueva({ ...base, motivo: "algo" });
    expect(extra.ok && "motivo" in extra.valor).toBe(false);
  });
});

describe("🔴 la marca «N clientes sin comisión» va al vendedor correcto, normalizando el nombre", () => {
  const EXCL = [
    { id: 1, empresa_key: "active_shoes", cliente_codigo: "D-84", cliente_nombre: "Kheriddine", vendedor: "REINALDO ESPINOSA", creado_por: "daniel", creado_en: "2026-09-03T17:00:00Z" },
    { id: 2, empresa_key: "active_shoes", cliente_codigo: "D-103", cliente_nombre: "Metro Shoes", vendedor: "REINALDO ESPINOSA", creado_por: "daniel", creado_en: "2026-09-03T17:00:00Z" },
    { id: 3, empresa_key: "active_wear", cliente_codigo: "D-50", cliente_nombre: "El Remate", vendedor: "REYNALDO ESPINOSA", creado_por: "daniel", creado_en: "2026-09-03T17:00:00Z" },
  ];

  it("pega la lista solo en SU empresa y aunque la RPC traiga el nombre con espacio; no toca ningún monto", async () => {
    const { adjuntarClientesSinComision, rotuloClientesSinComision, etiquetaClienteSinComision } = await import("@/lib/comisiones/exclusiones");
    const filas = adjuntarClientesSinComision(
      [{ vendedor: "REINALDO ESPINOSA ", comision_total: 8 }, { vendedor: "DEFAULT", comision_total: 14.5 }],
      EXCL,
      "active_shoes",
    );
    expect(filas[0].clientes_sin_comision?.map((c) => c.codigo)).toEqual(["D-103", "D-84"]);
    expect(filas[0].comision_total).toBe(8);
    expect(filas[1].clientes_sin_comision).toBeUndefined();
    // En Active Wear, Reinaldo (grafía I) no tiene ninguna: la fila de REYNALDO sí.
    const aw = adjuntarClientesSinComision([{ vendedor: "REINALDO ESPINOSA" }, { vendedor: "REYNALDO ESPINOSA" }], EXCL, "active_wear");
    expect(aw[0].clientes_sin_comision).toBeUndefined();
    expect(aw[1].clientes_sin_comision?.map(etiquetaClienteSinComision)).toEqual(["D-50 El Remate"]);
    expect(rotuloClientesSinComision(1)).toBe("1 cliente sin comisión");
    expect(rotuloClientesSinComision(2)).toBe("2 clientes sin comisión");
  });
});

// ═══ 5. Las rutas ════════════════════════════════════════════════════════════
describe("🔴 /api/ventas/comisiones/exclusiones: solo admin, POST valida, DELETE es soft delete", () => {
  let firmar: (p: Record<string, unknown>) => string;
  beforeAll(async () => { firmar = (await import("@/lib/session-cookie")).signSession; });
  beforeEach(() => {
    fromCalls.length = 0;
    fromRevienta = false;
    exclusionesEnBase = [
      { id: 7, empresa_key: "active_shoes", cliente_codigo: "D-84", vendedor: "REINALDO ESPINOSA", activa: true, creado_por: "daniel", creado_en: "2026-09-03T17:00:00Z" },
    ];
  });

  const req = async (role: string | null, url: string, init?: { method?: string; body?: unknown }) => {
    const { NextRequest } = await import("next/server");
    const r = new NextRequest(new URL(url, "http://localhost"), init?.body !== undefined
      ? { method: init.method ?? "POST", body: JSON.stringify(init.body), headers: { "content-type": "application/json" } }
      : { method: init?.method ?? "GET" });
    if (role) r.cookies.set("cxc_session", firmar({ role, sessionToken: "t", userName: role }));
    return r;
  };

  it("GET/POST/DELETE: 403 para todo rol que no sea admin, 401 sin cookie", async () => {
    const { GET, POST, DELETE } = await import("@/app/api/ventas/comisiones/exclusiones/route");
    for (const rol of ["contabilidad", "secretaria", "vendedor", "bodega", "gerente_acs", "gerente_boston"]) {
      expect((await GET(await req(rol, "/x"))).status, `${rol} GET`).toBe(403);
      expect((await POST(await req(rol, "/x", { body: {} }))).status, `${rol} POST`).toBe(403);
      expect((await DELETE(await req(rol, "/x?id=7", { method: "DELETE" }))).status, `${rol} DELETE`).toBe(403);
    }
    expect((await GET(await req(null, "/x"))).status).toBe(401);
    expect(fromCalls.filter((c) => c.op !== "select")).toHaveLength(0);
  });

  it("admin GET: lista las activas con el nombre del cliente y los vendedores por empresa", async () => {
    const { GET } = await import("@/app/api/ventas/comisiones/exclusiones/route");
    const res = await GET(await req("admin", "/x"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { exclusiones: { cliente_nombre: string | null }[]; vendedores: Record<string, string[]> };
    expect(body.exclusiones).toHaveLength(1);
    expect(body.exclusiones[0].cliente_nombre).toBe("Kheriddine");
    expect(Object.keys(body.vendedores).sort()).toEqual(["active_shoes", "active_wear", "fashion_shoes", "fashion_wear", "joystep", "vistana"]);
  });

  it("admin POST: 400 con cuerpo inválido (mostrador, Boston, sin vendedor) y 201 con uno bueno, firmado por quien lo hizo", async () => {
    const { POST } = await import("@/app/api/ventas/comisiones/exclusiones/route");
    expect((await POST(await req("admin", "/x", { body: { empresa_key: "active_shoes", cliente_codigo: "TCKCTA", vendedor: "X" } }))).status).toBe(400);
    expect((await POST(await req("admin", "/x", { body: { empresa_key: "confecciones_boston", cliente_codigo: "D-1", vendedor: "X" } }))).status).toBe(400);
    expect((await POST(await req("admin", "/x", { body: { empresa_key: "active_shoes", cliente_codigo: "D-1", vendedor: "" } }))).status).toBe(400);
    expect(fromCalls.filter((c) => c.op === "insert")).toHaveLength(0);
    const ok = await POST(await req("admin", "/x", { body: { empresa_key: "active_shoes", cliente_codigo: "d-1", vendedor: "Reinaldo Espinosa", motivo: "no se guarda" } }));
    expect(ok.status).toBe(201);
    const ins = fromCalls.find((c) => c.op === "insert")!;
    expect(ins.tabla).toBe("comision_exclusion");
    expect(ins.args[0]).toEqual({ empresa_key: "active_shoes", cliente_codigo: "D-1", vendedor: "REINALDO ESPINOSA", creado_por: "admin" });
  });

  it("🔴 admin DELETE: UPDATE activa=false firmado sobre la fila ACTIVA, nunca .delete(); repetirlo es 404", async () => {
    const { DELETE } = await import("@/app/api/ventas/comisiones/exclusiones/route");
    const res = await DELETE(await req("admin", "/x?id=7", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(fromCalls.some((c) => c.op === "delete")).toBe(false);
    const upd = fromCalls.find((c) => c.op === "update")!;
    expect(upd.tabla).toBe("comision_exclusion");
    expect(upd.args[0]).toMatchObject({ activa: false, desactivado_por: "admin" });
    expect((upd.args[0] as { desactivado_en: string }).desactivado_en).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // La fila sigue existiendo, inactiva.
    expect(exclusionesEnBase).toHaveLength(1);
    expect(exclusionesEnBase[0].activa).toBe(false);
    expect((await DELETE(await req("admin", "/x?id=7", { method: "DELETE" }))).status).toBe(404);
    expect((await DELETE(await req("admin", "/x?id=abc", { method: "DELETE" }))).status).toBe(400);
  });

  it("el directorio por empresa para el selector: solo admin y solo las 6", async () => {
    const { GET } = await import("@/app/api/ventas/comisiones/exclusiones/[empresa]/clientes-switch/route");
    for (const rol of ["contabilidad", "secretaria", "vendedor", "bodega", "gerente_acs", "gerente_boston"]) {
      expect((await GET(await req(rol, "/x?q=k"), { params: { empresa: "active_shoes" } })).status, rol).toBe(403);
    }
    expect((await GET(await req(null, "/x?q=k"), { params: { empresa: "active_shoes" } })).status).toBe(401);
    expect((await GET(await req("admin", "/x?q=k"), { params: { empresa: "confecciones_boston" } })).status).toBe(404);
    expect((await GET(await req("admin", "/x?q=k"), { params: { empresa: "active_shoes" } })).status).toBe(200);
  });

  it("las dos rutas de comisiones pegan «clientes_sin_comision» al vendedor — y si la tabla no existe, salen SIN la marca (fallan abierto)", async () => {
    respuestaV7 = () => ({ data: { empresa_key: "active_shoes", year: 2026, mes: 7, vendedores: VENDEDORES }, error: null });
    const { GET } = await import("@/app/api/ventas/comisiones/route");
    const res = await GET(await req("admin", "/x?empresa=active_shoes&year=2026&mes=7"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: string; exclusiones_aplicadas: boolean; vendedores: { vendedor: string; clientes_sin_comision?: { codigo: string }[]; comision_total: number }[] };
    expect(body.version).toBe("v7");
    expect(body.exclusiones_aplicadas).toBe(true);
    const por = Object.fromEntries(body.vendedores.map((v) => [v.vendedor, v]));
    expect(por["REINALDO ESPINOSA"].clientes_sin_comision?.map((c) => c.codigo)).toEqual(["D-84"]);
    expect(por["REINALDO ESPINOSA"].comision_total).toBe(8); // la RPC ya restó; la ruta no toca el monto
    expect(por.DEFAULT.clientes_sin_comision).toBeUndefined();

    fromRevienta = true;
    const res2 = await GET(await req("admin", "/x?empresa=active_shoes&year=2026&mes=7"));
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { vendedores: { clientes_sin_comision?: unknown }[] };
    expect(body2.vendedores.every((v) => v.clientes_sin_comision === undefined)).toBe(true);

    fromRevienta = false;
    const { GET: consolidado } = await import("@/app/api/ventas/comisiones/consolidado/route");
    const res3 = await consolidado(await req("admin", "/x?year=2026&mes=7"));
    expect(res3.status).toBe(200);
    const body3 = (await res3.json()) as { empresas: { empresa_key: string; exclusiones_aplicadas: boolean; vendedores: { vendedor: string; clientes_sin_comision?: { codigo: string }[] }[] }[] };
    const as = body3.empresas.find((e) => e.empresa_key === "active_shoes")!;
    expect(as.exclusiones_aplicadas).toBe(true);
    expect(as.vendedores.find((v) => v.vendedor === "REINALDO ESPINOSA")?.clientes_sin_comision?.map((c) => c.codigo)).toEqual(["D-84"]);
    // En las otras 5 la misma persona no lleva marca: la exclusión es por empresa.
    for (const e of body3.empresas.filter((e) => e.empresa_key !== "active_shoes")) {
      expect(e.vendedores.find((v) => v.vendedor === "REINALDO ESPINOSA")?.clientes_sin_comision, e.empresa_key).toBeUndefined();
    }
  });
});

// ═══ 5b. Barrido: NUNCA un DELETE sobre comision_exclusion ═══════════════════
describe("🔴 barrido: nadie borra filas de comision_exclusion (es historial de decisiones sobre plata)", () => {
  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|[^:"'`])\/\/.*$/, "$1")).join("\n");

  it("ninguna migración hace DELETE FROM / TRUNCATE / DROP sobre la tabla", () => {
    const dir = path.join(RAIZ, "supabase/migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      const sql = soloSql(path.join("supabase/migrations", f));
      expect(sql, f).not.toMatch(/DELETE\s+FROM\s+comision_exclusion/i);
      expect(sql, f).not.toMatch(/TRUNCATE\s+(TABLE\s+)?comision_exclusion/i);
      expect(sql, f).not.toMatch(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?comision_exclusion/i);
    }
  });

  it("ningún archivo de src/ encadena .delete() sobre la tabla (ni por nombre ni por la constante)", () => {
    const archivos = globSync("src/**/*.{ts,tsx}", { cwd: RAIZ, ignore: ["src/__tests__/**"] });
    expect(archivos.length).toBeGreaterThan(100);
    for (const rel of archivos) {
      const src = sinComentarios(leer(rel));
      if (!/comision_exclusion|TABLA_EXCLUSION/.test(src)) continue;
      // Todo `.from(<la tabla>)` hasta el siguiente `;` no puede llevar `.delete(`.
      const bloques = [...src.matchAll(/\.from\(\s*(?:"comision_exclusion"|TABLA_EXCLUSION)\s*\)[\s\S]*?;/g)].map((m) => m[0]);
      for (const b of bloques) expect(b, rel).not.toMatch(/\.delete\s*\(/);
    }
    // Y el que escribe la tabla existe y usa UPDATE para quitar.
    const server = sinComentarios(leer("src/lib/comisiones/exclusiones-server.ts"));
    expect(server).toMatch(/\.update\(\{ activa: false, desactivado_por: /);
    expect(server).not.toMatch(/\.delete\s*\(/);
  });

  it("la lista de bases de cobro vigiladas por retenciones incluye la v7 y su detalle", () => {
    const src = leer("src/__tests__/lib/comision-cobro-sin-retenciones.test.ts");
    expect(src).toContain('funcion: "comision_b2b_v7"');
    expect(src).toContain('archivo: "20260912120000_comision_exclusion_v7.sql"');
  });
});
