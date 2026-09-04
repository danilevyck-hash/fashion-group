// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — UNA PERSONA, UNA FILA, UNA TASA (alias de vendedor) y las
// exclusiones con VENTA y COBRO por separado (comision_b2b_v8).
//
// 🩸 Daniel, 3-sep-2026 (noche), textual:
//   · «¿por qué hay 4 Reinaldo?» — Switch manda REINALDO / REYNALDO /
//     REINDALDO / «REINDALDO » (espacio) para la misma persona; AGUAS y REY
//     STOUTE AGUAS son la misma persona.
//   · «llámalo Reynaldo y no Reinaldo» — el canónico es REYNALDO ESPINOSA,
//     con Y; en pantalla capitalizado.
//   · «poder quitar comisiones en ventas o comisiones sin que tengan que ser
//     de los dos» · «las 11 que ya cargamos quedan con las dos marcadas» ·
//     «arranca con las dos marcadas pero yo deselecciono».
//
// Lo que se exige, en las capas donde vive:
//   1. El SQL (sin comentarios): la tabla comision_vendedor_alias con las
//      variantes cargadas y REYNALDO (con Y) como canónico; la función
//      comision_vendedor_canonico; las 4 filas de tasa de Reinaldo colapsan a
//      UNA en 1 % / 1 %; comision_exclusion gana excluye_venta / excluye_cobro
//      (default true, CHECK «al menos una»), y sus grafías se canonicalizan
//      con SOFT DELETE de las repetidas (nunca DELETE); comision_b2b_v8 = la
//      v7 más el alias y las dos casillas (candado que compara los cuerpos);
//      la v7, v6 y v5 no se tocan.
//   2. La CONDUCTA del SQL de verdad (pglite): las grafías caen en UNA fila;
//      las 4 combinaciones de casillas; la tasa colapsa; las 17 exclusiones
//      quedan en 11; el trigger canonicaliza lo que entra; el detalle cierra.
//   3. El módulo que elige la RPC: v8 primero, y dice `alias_aplicado`.
//   4. La parte pura: aplicarAlias = la función SQL; nombreVendedorEnPantalla
//      («Reynaldo Espinosa»); validación de casillas (las dos apagadas no
//      pasa); la etiqueta dice «solo venta» / «solo cobro».
//   5. Las rutas: la lista de tasas SIN Daniel Levy y con el origen juntado
//      por persona; el PUT escribe el canónico; POST/PATCH respetan las
//      casillas y rechazan las dos apagadas; PATCH es solo admin.
//   6. La pantalla no tiene la nota «N nombres en Switch» (Daniel la quitó).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const RAIZ = process.cwd();
const MIG_V8 = "supabase/migrations/20260913120000_comision_vendedor_alias_v8.sql";
const MIG_V7 = "supabase/migrations/20260912120000_comision_exclusion_v7.sql";
const MIG_V6 = "supabase/migrations/20260911120000_comision_b2b_v6_cobro_quien_registro.sql";
const MIG_V5 = "supabase/migrations/20260703120000_comision_b2b_v5_vendedor_factura.sql";

const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const soloSql = (rel: string) =>
  leer(rel)
    .split("\n")
    .map((l) => (l.indexOf("--") === -1 ? l : l.slice(0, l.indexOf("--"))))
    .join("\n");
function cuerpo(sql: string, fn: string): string {
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${fn}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, "i");
  const m = sql.match(re);
  expect(m, `no encontré el cuerpo de ${fn}`).toBeTruthy();
  return m![1];
}
const compacto = (s: string) => s.replace(/\s+/g, " ").trim();
const cte = (body: string, desde: string, hasta: string) => {
  const i = body.indexOf(desde);
  const j = body.indexOf(hasta, i);
  expect(i, `sin ${desde}`).toBeGreaterThan(-1);
  expect(j, `sin ${hasta}`).toBeGreaterThan(i);
  return body.slice(i, j);
};

/**
 * Lo que la v8 agrega sobre la v7, deshecho a mano: el alias vuelve a ser el
 * TRIM de la v7 y las casillas y la marca `'alias'` se quitan. Lo que queda
 * tiene que ser la v7 byte a byte (compactada): cualquier otro cambio en la
 * ruta del dinero pone esto en rojo.
 */
function sinAliasNiCasillas(body: string): string {
  return body
    .split("\n")
    .filter((l) => !/excluye_venta|excluye_cobro|'alias'/.test(l))
    .join("\n")
    .replace(/comision_vendedor_canonico\(sf\.vendedor_nombre\)/g, "NULLIF(TRIM(sf.vendedor_nombre), '')")
    .replace(/COALESCE\(dv\.vendedor_factura, comision_vendedor_canonico\(f\.vendedor\)\)/g, "COALESCE(dv.vendedor_factura, f.vendedor)")
    .replace(/UPPER\(COALESCE\(dv\.vendedor_factura, f\.vendedor\)\)/g, "UPPER(TRIM(COALESCE(dv.vendedor_factura, f.vendedor)))")
    .replace(/COALESCE\(dv\.vendedor_factura, f\.vendedor\) IS NOT NULL/g, "COALESCE(TRIM(COALESCE(dv.vendedor_factura, f.vendedor)), '') <> ''")
    .replace(/UPPER\(comision_vendedor_canonico\(r\.vendedor_registro\)\)/g, "UPPER(TRIM(r.vendedor_registro))")
    .replace(/comision_vendedor_canonico\(r\.vendedor_registro\)/g, "NULLIF(TRIM(r.vendedor_registro), '')")
    .replace(/comision_vendedor_canonico\(v\.nombre\)/g, "v.nombre");
}

// ═══ 1. El SQL ═══════════════════════════════════════════════════════════════
describe("🔴 comision_vendedor_alias: la tabla y la función", () => {
  const v8 = soloSql(MIG_V8);

  it("existe, normalizada por CHECK, RLS solo service_role, y con índice por persona", () => {
    expect(v8).toMatch(/CREATE TABLE IF NOT EXISTS comision_vendedor_alias \(/);
    expect(compacto(v8)).toContain("nombre_switch text PRIMARY KEY");
    expect(compacto(v8)).toContain("CHECK (nombre_switch = UPPER(BTRIM(nombre_switch)) AND nombre_switch <> '')");
    expect(compacto(v8)).toContain("CHECK (vendedor_canonico = UPPER(BTRIM(vendedor_canonico)) AND vendedor_canonico <> '')");
    expect(v8).toMatch(/ALTER TABLE comision_vendedor_alias ENABLE ROW LEVEL SECURITY/);
    expect(compacto(v8)).toMatch(/CREATE POLICY service_role_all ON comision_vendedor_alias FOR ALL TO service_role/);
    expect(compacto(v8)).toMatch(/CREATE INDEX IF NOT EXISTS \w+ ON comision_vendedor_alias \(vendedor_canonico\)/);
  });

  it("🔴 carga las variantes: las 3 grafías de Reinaldo → REYNALDO ESPINOSA (con Y), y AGUAS → REY STOUTE AGUAS", () => {
    const filas = [...v8.matchAll(/\('([A-Z ]+)',\s*'([A-Z ]+)'\)/g)].map((m) => ({ de: m[1].trim(), a: m[2] }));
    const mapa = Object.fromEntries(filas.map((f) => [f.de, f.a]));
    for (const g of ["REINALDO ESPINOSA", "REYNALDO ESPINOSA", "REINDALDO ESPINOSA"]) expect(mapa[g], g).toBe("REYNALDO ESPINOSA");
    for (const g of ["AGUAS", "REY STOUTE AGUAS"]) expect(mapa[g], g).toBe("REY STOUTE AGUAS");
    // Con Y, nunca con I: «llámalo Reynaldo y no Reinaldo».
    expect(Object.values(mapa)).not.toContain("REINALDO ESPINOSA");
    expect(compacto(v8)).toContain("ON CONFLICT (nombre_switch) DO UPDATE SET vendedor_canonico = EXCLUDED.vendedor_canonico");
  });

  it("comision_vendedor_canonico: con alias la persona; sin alias el nombre SOLO recortado (no en mayúsculas); vacío → NULL", () => {
    const fn = compacto(cuerpo(v8, "comision_vendedor_canonico"));
    expect(fn).toContain("SELECT COALESCE( (SELECT a.vendedor_canonico FROM comision_vendedor_alias a WHERE a.nombre_switch = UPPER(BTRIM(p_nombre))), NULLIF(BTRIM(p_nombre), '') )");
    expect(v8).toMatch(/FUNCTION comision_vendedor_canonico\(p_nombre text\)\s+RETURNS text LANGUAGE sql STABLE/);
  });
});

describe("🔴 tasas, descuentos y exclusiones pasan por el alias en la migración", () => {
  const v8 = soloSql(MIG_V8);

  it("las 4 filas de tasa de Reinaldo colapsan a UNA: REYNALDO ESPINOSA 1 % / 1 %, y las grafías se van", () => {
    const ins = compacto(v8.slice(v8.indexOf("INSERT INTO comision_vendedor_tasa")));
    expect(ins).toContain("VALUES ('REYNALDO ESPINOSA', 0.0100, 0.0100, true, now()) ON CONFLICT (vendedor_nombre) DO UPDATE SET tasa_venta = 0.0100, tasa_cobro = 0.0100, activo = true");
    expect(compacto(v8)).toContain("DELETE FROM comision_vendedor_tasa t USING comision_vendedor_alias a WHERE UPPER(BTRIM(t.vendedor_nombre)) = a.nombre_switch AND t.vendedor_nombre <> a.vendedor_canonico");
    // Y de ahí en adelante, lo que entra se canonicaliza solo.
    expect(compacto(v8)).toMatch(/CREATE TRIGGER comision_vendedor_tasa_canonicalizar BEFORE INSERT OR UPDATE OF vendedor_nombre ON comision_vendedor_tasa FOR EACH ROW/);
  });

  it("los descuentos fijos se renombran a la persona (van por nombre y son plata)", () => {
    expect(compacto(v8)).toContain("UPDATE comision_descuentos_fijos d SET vendedor_nombre = a.vendedor_canonico, updated_at = now() FROM comision_vendedor_alias a WHERE UPPER(BTRIM(d.vendedor_nombre)) = a.nombre_switch AND d.vendedor_nombre <> a.vendedor_canonico");
  });

  it("🔴 comision_exclusion gana excluye_venta / excluye_cobro, DEFAULT true las dos, CHECK «al menos una»", () => {
    expect(compacto(v8)).toContain("ALTER TABLE comision_exclusion ADD COLUMN IF NOT EXISTS excluye_venta boolean NOT NULL DEFAULT true");
    expect(compacto(v8)).toContain("ALTER TABLE comision_exclusion ADD COLUMN IF NOT EXISTS excluye_cobro boolean NOT NULL DEFAULT true");
    expect(compacto(v8)).toContain("ADD CONSTRAINT comision_exclusion_excluye_algo CHECK (excluye_venta OR excluye_cobro)");
    // Y no hay ningún UPDATE que apague casillas: «las 11 que ya cargamos quedan con las dos marcadas».
    expect(compacto(v8)).not.toMatch(/SET excluye_(venta|cobro) = false/);
  });

  it("🔴 las grafías de las exclusiones se canonicalizan; las que quedan repetidas se APAGAN con soft delete firmado, nunca DELETE", () => {
    expect(compacto(v8)).toContain("SET activa = false, desactivado_por = 'migracion-alias-v8', desactivado_en = now() FROM canon WHERE canon.id = ce.id AND canon.rn > 1");
    expect(compacto(v8)).toContain("UPDATE comision_exclusion ce SET vendedor = UPPER(comision_vendedor_canonico(ce.vendedor)) WHERE ce.activa AND ce.vendedor <> UPPER(comision_vendedor_canonico(ce.vendedor))");
    expect(v8).not.toMatch(/DELETE\s+FROM\s+comision_exclusion/i);
    expect(compacto(v8)).toMatch(/CREATE TRIGGER comision_exclusion_canonicalizar BEFORE INSERT OR UPDATE OF vendedor ON comision_exclusion FOR EACH ROW/);
  });
});

describe("🔴 comision_b2b_v8: la v7 más el alias, y las casillas en el JOIN de exclusión", () => {
  const v8 = soloSql(MIG_V8);
  const v7 = soloSql(MIG_V7);
  const b8 = cuerpo(v8, "comision_b2b_v8");
  const b7 = cuerpo(v7, "comision_b2b_v7");

  it("es una función NUEVA y no dropea ni pisa la v7, la v6 ni la v5", () => {
    expect(v8).toMatch(/CREATE\s+FUNCTION\s+comision_b2b_v8\s*\(/i);
    expect(v8).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+comision_b2b_v8/i);
    expect(v8).not.toMatch(/DROP\s+FUNCTION/i);
    expect(v8).not.toMatch(/FUNCTION\s+comision_b2b_v[567]\s*\(/i);
    expect(v7).toMatch(/CREATE\s+FUNCTION\s+comision_b2b_v7\s*\(/i);
    expect(soloSql(MIG_V6)).toMatch(/CREATE\s+FUNCTION\s+comision_b2b_v6\s*\(/i);
    expect(cuerpo(soloSql(MIG_V5), "comision_b2b_v5")).toMatch(/GROUP BY r\.vendedor_cartera/);
  });

  it("🔴 sin el alias ni las casillas, la v8 ES la v7 (byte a byte, compactada)", () => {
    expect(compacto(sinAliasNiCasillas(b8))).toBe(compacto(b7));
    expect(compacto(b7).length).toBeGreaterThan(1500);
  });

  it("VENTAS: el vendedor pasa por el alias y la exclusión solo cuenta con excluye_venta", () => {
    const dv = compacto(cte(b8, "WITH doc_vendedor AS (", "ventas AS ("));
    expect(dv).toContain("comision_vendedor_canonico(sf.vendedor_nombre) AS vendedor_factura");
    const ventas = compacto(cte(b8, "ventas AS (", "cobros AS ("));
    expect(ventas).toContain("COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)) AS vendedor");
    expect(ventas).toContain("LEFT JOIN comision_exclusion ce ON ce.empresa_key = p_empresa_key AND ce.cliente_codigo = dv.cliente_codigo AND ce.vendedor = UPPER(COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor))) AND ce.activa = true AND ce.excluye_venta = true");
    expect(ventas).toContain("AND ce.id IS NULL");
    expect(ventas).not.toContain("excluye_cobro");
    expect(ventas).toContain("GROUP BY COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor))");
  });

  it("COBROS: quien registró pasa por el alias, la exclusión solo cuenta con excluye_cobro, y los tres filtros siguen", () => {
    const cobros = compacto(cte(b8, "cobros AS (", "universo AS ("));
    expect(cobros).toContain("comision_vendedor_canonico(r.vendedor_registro) AS vendedor");
    expect(cobros).toContain("LEFT JOIN comision_exclusion ce ON ce.empresa_key = p_empresa_key AND ce.cliente_codigo = UPPER(TRIM(r.cliente_codigo)) AND ce.vendedor = UPPER(comision_vendedor_canonico(r.vendedor_registro)) AND ce.activa = true AND ce.excluye_cobro = true");
    expect(cobros).toContain("AND ce.id IS NULL");
    expect(cobros).not.toContain("excluye_venta");
    expect(cobros).toMatch(/es_retencion\s*=\s*false/);
    expect(cobros).toContain("'TCKCTA'");
    expect(cobros).toMatch(/multi fashion holding/i);
    expect(cobros).toContain("GROUP BY comision_vendedor_canonico(r.vendedor_registro)");
    expect(cobros).not.toMatch(/vendedor_cartera/);
  });

  it("UNIVERSO: el maestro de vendedores también pasa por el alias (una persona, una fila aunque esté en 4 empresas)", () => {
    const u = compacto(cte(b8, "universo AS (", "SELECT jsonb_agg("));
    expect(u).toContain("SELECT comision_vendedor_canonico(v.nombre) AS vendedor FROM vendedores v JOIN comision_vendedor_tasa t ON t.vendedor_nombre = comision_vendedor_canonico(v.nombre) AND t.activo = true");
  });

  it("el detalle (misma DDL) canonicaliza p_vendedor y excluye lo MISMO con las mismas casillas — paridad tabla ↔ modal", () => {
    const det = cuerpo(v8, "comision_b2b_detalle");
    expect(compacto(det)).toContain("v_vendedor := comision_vendedor_canonico(p_vendedor);");
    const docs = compacto(cte(det, "docs AS (", "INTO v_ventas"));
    expect(docs).toContain("AND ce.activa = true AND ce.excluye_venta = true");
    expect(docs).toContain("AND COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)) = v_vendedor");
    const cobros = compacto(det.slice(det.indexOf("FROM switch_recibos")));
    expect(cobros).toContain("AND ce.activa = true AND ce.excluye_cobro = true");
    expect(cobros).toContain("AND comision_vendedor_canonico(r.vendedor_registro) = v_vendedor");
    expect(compacto(det)).toContain("'vendedor', v_vendedor");
  });

  it("la respuesta dice que el alias ya está aplicado (y lo de antes sigue)", () => {
    expect(b8).toContain("'alias', 'canonico'");
    expect(b8).toContain("'exclusiones', 'cliente_vendedor'");
    expect(b8).toContain("'regla_cobro', 'quien_registro'");
  });

  it("no hay un signo de dólar suelto fuera de los delimitadores (el SQL Editor revienta)", () => {
    expect(leer(MIG_V8).replace(/\$\$/g, "")).not.toMatch(/\$/);
  });
});

// ═══ 2. La conducta, con el SQL de verdad (pglite) ═══════════════════════════
const PGLITE_DIR = process.env.PGLITE_DIR ?? "/tmp/v6/node_modules/@electric-sql/pglite";
const hayPglite = existsSync(path.join(PGLITE_DIR, "dist/index.js"));

describe.skipIf(!hayPglite)("🔴 conducta real de v8 (pglite): una persona, una fila; las 4 combinaciones; el trigger; el detalle", () => {
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
      CREATE TABLE comision_vendedor_tasa (vendedor_nombre text PRIMARY KEY, tasa_venta numeric(6,4), tasa_cobro numeric(6,4), activo boolean, updated_at timestamptz);
      CREATE TABLE comision_descuentos_fijos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendedor_nombre text NOT NULL, empresa_key text NOT NULL, concepto text NOT NULL,
        monto numeric(12,2), activo boolean NOT NULL DEFAULT true, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
        UNIQUE (vendedor_nombre, empresa_key, concepto));
    `);
    await exec(sqlDeMigracion(MIG_V5));
    await exec(sqlDeMigracion(MIG_V6));
    await exec(sqlDeMigracion(MIG_V7));
    // Las 9 filas de tasa de producción (3-sep-2026) ANTES de la v8, para ver el colapso.
    await exec(`
      INSERT INTO comision_vendedor_tasa VALUES
        ('AGUAS', 0.005, 0.005, true, now()), ('DANIEL LEVY', 0.005, 0.005, true, now()), ('EDWIN', 0.005, 0.005, true, now()),
        ('REINALDO ESPINOSA', 0.01, 0.01, true, now()), ('REINDALDO ESPINOSA', 0.01, 0, true, now()), ('REINDALDO ESPINOSA ', 0.01, 0.01, true, now()),
        ('REY STOUTE AGUAS', 0.005, 0.005, true, now()), ('REYNALDO ESPINOSA', 0.01, 0.01, true, now()), ('Rodrigo', 0.005, 0.005, true, now());
      INSERT INTO comision_descuentos_fijos (vendedor_nombre, empresa_key, concepto, monto) VALUES ('REINALDO ESPINOSA', 'fashion_shoes', 'Descuento', 1400);
    `);
    await exec(sqlDeMigracion(MIG_V8));
    // Fixtures en Active Wear: la misma persona con TRES grafías vende y cobra a
    // D-84 (Kheriddine) y a D-1 (Otro); DEFAULT también le vende a D-84.
    await exec(`
      INSERT INTO switch_clientes (empresa_key, cliente_switch_id, codigo, nombre) VALUES
        ('active_wear', 90, 'D-84', 'Kheriddine'), ('active_wear', 1, 'D-1', 'Otro');
      INSERT INTO vendedores VALUES ('active_wear', 'REINALDO ESPINOSA', true), ('active_wear', 'REYNALDO ESPINOSA', true), ('active_wear', 'DEFAULT', true);
      INSERT INTO comision_vendedor_tasa VALUES ('DEFAULT', 0.005, 0.005, true, now());
      INSERT INTO switch_facturas (empresa_key, secuencial, fecha, vendedor_nombre, cliente_switch_id) VALUES
        ('active_wear', 'F-1', '2026-07-10 12:00-05', 'REINALDO ESPINOSA', 90),
        ('active_wear', 'F-2', '2026-07-11 12:00-05', 'REYNALDO ESPINOSA', 1),
        ('active_wear', 'F-3', '2026-07-12 12:00-05', 'DEFAULT', 90);
      INSERT INTO switch_factura_utilidad (empresa_key, secuencial, fecha, tipo_comprobante, vendedor, cliente, subtotal_con_descuento, pct_utilidad) VALUES
        ('active_wear', 'F-1', '2026-07-10', 'Factura', 'REINALDO ESPINOSA', 'Kheriddine', 1000, 30),
        ('active_wear', 'F-2', '2026-07-11', 'Factura', 'REYNALDO ESPINOSA', 'Otro', 500, 30),
        ('active_wear', 'F-3', '2026-07-12', 'Factura', 'DEFAULT', 'Kheriddine', 2000, 30);
      INSERT INTO switch_recibos (empresa_key, fecha, cliente_switch_id, cliente_codigo, cliente_nombre, vendedor_registro, total) VALUES
        ('active_wear', '2026-07-15', 90, 'D-84', 'Kheriddine', 'REINDALDO ESPINOSA ', 700),
        ('active_wear', '2026-07-16', 1, 'D-1', 'Otro', 'reynaldo espinosa', 300),
        ('active_wear', '2026-07-17', 90, 'D-84', 'Kheriddine', 'DEFAULT', 900);
    `);
  });
  afterAll(async () => { await cerrar?.(); });

  const filas = async (fn: string) => {
    const r = await query(`SELECT ${fn}('active_wear', 2026, 7) AS j`);
    return (r.rows[0].j as { vendedores: Fila[] }).vendedores;
  };
  const fila = async (fn: string, vendedor: string) => (await filas(fn)).find((v) => v.vendedor === vendedor)!;

  it("🔴 la migración colapsa las 9 tasas en 5: REYNALDO ESPINOSA 1 % / 1 % y REY STOUTE AGUAS; ninguna grafía queda", async () => {
    const t = (await query(`SELECT vendedor_nombre, tasa_venta, tasa_cobro FROM comision_vendedor_tasa WHERE vendedor_nombre <> 'DEFAULT' ORDER BY 1`)).rows;
    expect(t.map((x) => x.vendedor_nombre)).toEqual(["DANIEL LEVY", "EDWIN", "REY STOUTE AGUAS", "REYNALDO ESPINOSA", "Rodrigo"]);
    const rey = t.find((x) => x.vendedor_nombre === "REYNALDO ESPINOSA")!;
    expect([Number(rey.tasa_venta), Number(rey.tasa_cobro)]).toEqual([0.01, 0.01]);
    // El descuento fijo de Reinaldo ahora es de REYNALDO.
    const d = (await query(`SELECT vendedor_nombre FROM comision_descuentos_fijos`)).rows;
    expect(d).toEqual([{ vendedor_nombre: "REYNALDO ESPINOSA" }]);
  });

  it("🔴 las 17 exclusiones de la v7 quedan en 11 activas, todas REYNALDO con las DOS casillas; las 6 repetidas se apagan firmadas, nada se borra", async () => {
    const r = (await query(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE activa)::int AS activas,
      COUNT(*) FILTER (WHERE activa AND vendedor = 'REYNALDO ESPINOSA' AND excluye_venta AND excluye_cobro)::int AS bien,
      COUNT(*) FILTER (WHERE NOT activa AND desactivado_por = 'migracion-alias-v8')::int AS apagadas,
      COUNT(DISTINCT (empresa_key, cliente_codigo)) FILTER (WHERE activa)::int AS pares FROM comision_exclusion`)).rows[0];
    expect(r).toEqual({ n: 17, activas: 11, bien: 11, apagadas: 6, pares: 11 });
  });

  it("🔴 v8: las TRES grafías (y la minúscula, y el espacio) caen en UNA fila «REYNALDO ESPINOSA»; la v7 las partía", async () => {
    // Las 11 de Daniel no cruzan con D-84/D-1 de este arnés: se apagan para el caso mínimo.
    await exec(`UPDATE comision_exclusion SET activa = false, desactivado_por = 'test', desactivado_en = now() WHERE activa`);
    const v7 = await filas("comision_b2b_v7");
    expect(v7.map((v) => v.vendedor).sort()).toEqual(["DEFAULT", "REINALDO ESPINOSA", "REINDALDO ESPINOSA", "REYNALDO ESPINOSA", "reynaldo espinosa"]);
    const v8 = await filas("comision_b2b_v8");
    expect(v8.map((v) => v.vendedor).sort()).toEqual(["DEFAULT", "REYNALDO ESPINOSA"]);
    const rey = await fila("comision_b2b_v8", "REYNALDO ESPINOSA");
    expect(Number(rey.base)).toBe(1500);         // F-1 + F-2
    expect(Number(rey.base_cobro)).toBe(1000);   // 700 + 300
    expect(Number(rey.tasa)).toBe(0.01);
    expect(Number(rey.comision_total)).toBe(25); // 15 + 10
    // Y la suma de las filas partidas de la v7 es la misma plata (la tasa de la
    // grafía «REINDALDO» era 0 % de cobro: eso es lo que se corrige).
    const v7Rey = v7.filter((v) => /^re[iy]n?daldo|^re[iy]naldo/i.test(String(v.vendedor)));
    expect(v7Rey.reduce((a, v) => a + Number(v.base), 0)).toBe(1500);
    expect(v7Rey.reduce((a, v) => a + Number(v.base_cobro), 0)).toBe(1000);
  });

  it("🔴 las 4 combinaciones de casillas sobre (active_wear, D-84, REYNALDO)", async () => {
    const insertar = (venta: boolean, cobro: boolean) =>
      query(`INSERT INTO comision_exclusion (empresa_key, cliente_codigo, vendedor, creado_por, excluye_venta, excluye_cobro) VALUES ('active_wear', 'D-84', 'REYNALDO ESPINOSA', 'test', $1, $2)`, [venta, cobro]);
    const apagar = () => exec(`UPDATE comision_exclusion SET activa = false, desactivado_por = 'test', desactivado_en = now() WHERE activa`);

    // Venta ☑ Cobro ☑ → ni la venta ni el cobro a D-84.
    await insertar(true, true);
    let r = await fila("comision_b2b_v8", "REYNALDO ESPINOSA");
    expect([Number(r.base), Number(r.base_cobro)]).toEqual([500, 300]);
    await apagar();

    // Venta ☑ Cobro ☐ → la venta a D-84 no; el cobro sí.
    await insertar(true, false);
    r = await fila("comision_b2b_v8", "REYNALDO ESPINOSA");
    expect([Number(r.base), Number(r.base_cobro)]).toEqual([500, 1000]);
    await apagar();

    // Venta ☐ Cobro ☑ → la venta sí; el cobro a D-84 no.
    await insertar(false, true);
    r = await fila("comision_b2b_v8", "REYNALDO ESPINOSA");
    expect([Number(r.base), Number(r.base_cobro)]).toEqual([1500, 300]);
    // DEFAULT con el mismo cliente sigue comisionando (la exclusión es por vendedor).
    const d = await fila("comision_b2b_v8", "DEFAULT");
    expect([Number(d.base), Number(d.base_cobro)]).toEqual([2000, 900]);
    await apagar();

    // Venta ☐ Cobro ☐ → no existe: el CHECK la rechaza.
    await expect(insertar(false, false)).rejects.toThrow(/comision_exclusion_excluye_algo/);
    r = await fila("comision_b2b_v8", "REYNALDO ESPINOSA");
    expect([Number(r.base), Number(r.base_cobro)]).toEqual([1500, 1000]);
  });

  it("🔴 el trigger canonicaliza lo que entra: una exclusión cargada como «REINALDO» se guarda como REYNALDO y atrapa las tres grafías", async () => {
    await exec(`INSERT INTO comision_exclusion (empresa_key, cliente_codigo, vendedor, creado_por) VALUES ('active_wear', 'D-84', 'REINALDO ESPINOSA', 'test')`);
    const g = (await query(`SELECT vendedor FROM comision_exclusion WHERE activa`)).rows;
    expect(g).toEqual([{ vendedor: "REYNALDO ESPINOSA" }]);
    const r = await fila("comision_b2b_v8", "REYNALDO ESPINOSA");
    expect([Number(r.base), Number(r.base_cobro)]).toEqual([500, 300]);
    // Y la tasa: escribir «REINDALDO ESPINOSA » cae en la fila de REYNALDO (no nace otra).
    await exec(`INSERT INTO comision_vendedor_tasa VALUES ('REINDALDO ESPINOSA ', 0.02, 0.02, true, now()) ON CONFLICT (vendedor_nombre) DO UPDATE SET tasa_venta = EXCLUDED.tasa_venta`);
    const t = (await query(`SELECT vendedor_nombre, tasa_venta FROM comision_vendedor_tasa WHERE vendedor_nombre ILIKE '%ALDO%'`)).rows;
    expect(t).toEqual([{ vendedor_nombre: "REYNALDO ESPINOSA", tasa_venta: "0.0200" }]);
    await exec(`UPDATE comision_vendedor_tasa SET tasa_venta = 0.01 WHERE vendedor_nombre = 'REYNALDO ESPINOSA'`);
  });

  it("el detalle cierra AL CENTAVO con la fila de la tabla, y acepta la grafía vieja como entrada", async () => {
    const porCanonico = (await query(`SELECT comision_b2b_detalle('active_wear', 2026, 7, 'REYNALDO ESPINOSA') AS j`)).rows[0].j as Fila;
    const porGrafia = (await query(`SELECT comision_b2b_detalle('active_wear', 2026, 7, 'reinaldo espinosa ') AS j`)).rows[0].j as Fila;
    expect(porGrafia).toEqual(porCanonico);
    expect(porCanonico.vendedor).toBe("REYNALDO ESPINOSA");
    expect((porCanonico.ventas as Fila[]).map((v) => v.secuencial)).toEqual(["F-2"]);
    expect(porCanonico.cobros).toHaveLength(1);
    const tabla = await fila("comision_b2b_v8", "REYNALDO ESPINOSA");
    expect(Number(porCanonico.comision_total)).toBe(Number(tabla.comision_total));
  });
});

// ═══ 3. El módulo que elige la RPC ═══════════════════════════════════════════
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const sinFuncion = (fn: string) => ({ data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn}` } });
let respuestaV8: () => { data: unknown; error: { code?: string; message: string } | null } = () => sinFuncion("comision_b2b_v8");
const VENDEDORES = [
  { vendedor: "REYNALDO ESPINOSA", base: 1500, tasa: 0.01, comision: 15, base_cobro: 1000, tasa_cobro: 0.01, comision_cobro: 10, comision_total: 25 },
  { vendedor: "DEFAULT", base: 2000, tasa: 0.005, comision: 10, base_cobro: 900, tasa_cobro: 0.005, comision_cobro: 4.5, comision_total: 14.5 },
];

/** Lo que las rutas escriben/leen por `from()`. */
const fromCalls: { tabla: string; op: string; args: unknown[] }[] = [];
let aliasEnBase: { nombre_switch: string; vendedor_canonico: string }[] = [];
let tasasEnBase: Record<string, unknown>[] = [];
let exclusionesEnBase: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "comision_b2b_v8") {
        const r = respuestaV8();
        return r.data ? { ...r, data: { ...(r.data as Record<string, unknown>), empresa_key: args.p_empresa_key } } : r;
      }
      if (fn === "comision_b2b_v7") return { data: { empresa_key: args.p_empresa_key, vendedores: VENDEDORES }, error: null };
      return { data: null, error: { message: `rpc inesperada ${fn}` } };
    },
    from: (tabla: string) => {
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
        if (tabla === "comision_vendedor_alias") return { data: aliasEnBase, error: null };
        if (tabla === "comision_vendedor_tasa") return { data: tasasEnBase, error: null };
        if (tabla === "vendedores") {
          return { data: [
            { empresa_key: "fashion_wear", nombre: "REINALDO ESPINOSA" }, { empresa_key: "active_shoes", nombre: "REINALDO ESPINOSA" },
            { empresa_key: "active_wear", nombre: "REYNALDO ESPINOSA" }, { empresa_key: "vistana", nombre: "AGUAS" },
            { empresa_key: "vistana", nombre: "DANIEL LEVY" }, { empresa_key: "vistana", nombre: "EDWIN" },
          ], error: null, count: 6 };
        }
        if (tabla === "comision_exclusion") {
          if (op === "select") return { data: exclusionesEnBase.filter((e) => e.activa), error: null, count: null };
          if (op === "update") {
            const hit = exclusionesEnBase.filter((e) => e.id === filtroId && (filtroActiva === null || e.activa === filtroActiva));
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
        upsert: async (...args: unknown[]) => { fromCalls.push({ tabla, op: "upsert", args }); return { error: null }; },
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
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-alias-v8"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

const ALIAS = [
  { nombre_switch: "REINALDO ESPINOSA", vendedor_canonico: "REYNALDO ESPINOSA" },
  { nombre_switch: "REYNALDO ESPINOSA", vendedor_canonico: "REYNALDO ESPINOSA" },
  { nombre_switch: "REINDALDO ESPINOSA", vendedor_canonico: "REYNALDO ESPINOSA" },
  { nombre_switch: "AGUAS", vendedor_canonico: "REY STOUTE AGUAS" },
  { nombre_switch: "REY STOUTE AGUAS", vendedor_canonico: "REY STOUTE AGUAS" },
];

describe("🔴 leerComision: v8 primero, y dice si el alias ya está aplicado", () => {
  beforeEach(() => { rpcCalls.length = 0; });

  it("con la DDL aplicada: solo la v8, version = v8, alias_aplicado = true, exclusiones_aplicadas = true", async () => {
    respuestaV8 = () => ({ data: { empresa_key: "active_wear", year: 2026, mes: 7, regla_cobro: "quien_registro", exclusiones: "cliente_vendedor", alias: "canonico", vendedores: VENDEDORES }, error: null });
    const { leerComision } = await import("@/lib/comisiones/rpc");
    const r = await leerComision("active_wear", 2026, 7);
    expect(r.error).toBeNull();
    expect(r.data?.version).toBe("v8");
    expect(r.data?.alias_aplicado).toBe(true);
    expect(r.data?.exclusiones_aplicadas).toBe(true);
    expect(rpcCalls.map((c) => c.fn)).toEqual(["comision_b2b_v8"]);
  });

  it("sin la DDL: cae a la v7 y lo confiesa (version = v7, alias_aplicado = false)", async () => {
    respuestaV8 = () => sinFuncion("comision_b2b_v8");
    const { leerComision } = await import("@/lib/comisiones/rpc");
    const r = await leerComision("active_wear", 2026, 7);
    expect(r.error).toBeNull();
    expect(r.data?.version).toBe("v7");
    expect(r.data?.alias_aplicado).toBe(false);
    expect(r.data?.exclusiones_aplicadas).toBe(true);
    expect(rpcCalls.map((c) => c.fn)).toEqual(["comision_b2b_v8", "comision_b2b_v7"]);
  });
});

// ═══ 4. La parte pura ════════════════════════════════════════════════════════
describe("🔴 aplicarAlias y nombreVendedorEnPantalla", () => {
  it("aplicarAlias es la función SQL: con alias la persona, sin alias el nombre recortado tal cual, vacío → ''", async () => {
    const { aplicarAlias } = await import("@/lib/comisiones/alias");
    expect(aplicarAlias("REINALDO ESPINOSA", ALIAS)).toBe("REYNALDO ESPINOSA");
    expect(aplicarAlias(" reindaldo espinosa ", ALIAS)).toBe("REYNALDO ESPINOSA");
    expect(aplicarAlias("AGUAS", ALIAS)).toBe("REY STOUTE AGUAS");
    expect(aplicarAlias("Rodrigo", ALIAS)).toBe("Rodrigo");
    expect(aplicarAlias("DANIEL LEVY ", ALIAS)).toBe("DANIEL LEVY");
    expect(aplicarAlias("  ", ALIAS)).toBe("");
    expect(aplicarAlias(null, ALIAS)).toBe("");
    // Sin tabla (DDL pendiente): cada nombre queda como viene.
    expect(aplicarAlias("REINALDO ESPINOSA", [])).toBe("REINALDO ESPINOSA");
  });

  it("🔴 en pantalla: «Reynaldo Espinosa» con Y y capitalizado; «Rey Stoute Aguas»; DEFAULT sigue siendo «Oficina (DEFAULT)»", async () => {
    const { nombreVendedorEnPantalla } = await import("@/lib/comisiones/alias");
    expect(nombreVendedorEnPantalla("REYNALDO ESPINOSA")).toBe("Reynaldo Espinosa");
    expect(nombreVendedorEnPantalla("REY STOUTE AGUAS")).toBe("Rey Stoute Aguas");
    expect(nombreVendedorEnPantalla("DANIEL LEVY ")).toBe("Daniel Levy");
    expect(nombreVendedorEnPantalla("EDWIN")).toBe("Edwin");
    expect(nombreVendedorEnPantalla("Rodrigo")).toBe("Rodrigo");
    expect(nombreVendedorEnPantalla("O'NEIL JEAN-PAUL")).toBe("O'Neil Jean-Paul");
    expect(nombreVendedorEnPantalla("DEFAULT")).toBe("Oficina (DEFAULT)");
    expect(nombreVendedorEnPantalla("")).toBe("");
  });
});

describe("🔴 casillas Venta / Cobro: validación fail-closed", () => {
  it("validarExclusionNueva: ausentes = las dos marcadas; las 3 combinaciones válidas pasan tal cual; las dos apagadas NO", async () => {
    const { validarExclusionNueva, AVISO_NINGUNA_CASILLA } = await import("@/lib/comisiones/exclusiones");
    const base = { empresa_key: "active_wear", cliente_codigo: "D-156", vendedor: "REYNALDO ESPINOSA" };
    const ok = (b: unknown) => { const v = validarExclusionNueva(b); expect(v.ok).toBe(true); return v.ok ? v.valor : null; };
    expect(ok(base)).toMatchObject({ excluye_venta: true, excluye_cobro: true });
    expect(ok({ ...base, excluye_venta: true, excluye_cobro: true })).toMatchObject({ excluye_venta: true, excluye_cobro: true });
    expect(ok({ ...base, excluye_venta: true, excluye_cobro: false })).toMatchObject({ excluye_venta: true, excluye_cobro: false });
    expect(ok({ ...base, excluye_venta: false, excluye_cobro: true })).toMatchObject({ excluye_venta: false, excluye_cobro: true });
    const ninguna = validarExclusionNueva({ ...base, excluye_venta: false, excluye_cobro: false });
    expect(ninguna).toEqual({ ok: false, error: AVISO_NINGUNA_CASILLA });
    expect(validarExclusionNueva({ ...base, excluye_venta: "sí" }).ok).toBe(false);
  });

  it("validarCasillas (PATCH): las dos tienen que venir como boolean, y al menos una marcada", async () => {
    const { validarCasillas, AVISO_NINGUNA_CASILLA } = await import("@/lib/comisiones/exclusiones");
    expect(validarCasillas({ excluye_venta: true, excluye_cobro: false })).toEqual({ ok: true, valor: { excluye_venta: true, excluye_cobro: false } });
    expect(validarCasillas({ excluye_venta: false, excluye_cobro: false })).toEqual({ ok: false, error: AVISO_NINGUNA_CASILLA });
    expect(validarCasillas({ excluye_venta: true }).ok).toBe(false);
    expect(validarCasillas(null).ok).toBe(false);
  });

  it("la etiqueta del tooltip dice «solo venta» / «solo cobro» cuando aplica, y nada cuando son las dos", async () => {
    const { etiquetaClienteSinComision, clientesSinComisionPorVendedor } = await import("@/lib/comisiones/exclusiones");
    expect(etiquetaClienteSinComision({ codigo: "D-84", nombre: "Kheriddine" })).toBe("D-84 Kheriddine");
    expect(etiquetaClienteSinComision({ codigo: "D-84", nombre: "Kheriddine", excluye_venta: true, excluye_cobro: false })).toBe("D-84 Kheriddine (solo venta)");
    expect(etiquetaClienteSinComision({ codigo: "D-84", nombre: null, excluye_venta: false, excluye_cobro: true })).toBe("D-84 (solo cobro)");
    const por = clientesSinComisionPorVendedor(
      [{ id: 1, empresa_key: "active_wear", cliente_codigo: "D-50", cliente_nombre: "El Remate", vendedor: "REYNALDO ESPINOSA", excluye_venta: false, excluye_cobro: true, creado_por: "d", creado_en: "2026-09-03T17:00:00Z" }],
      "active_wear",
    );
    expect(por.get("REYNALDO ESPINOSA")).toEqual([{ codigo: "D-50", nombre: "El Remate", excluye_venta: false, excluye_cobro: true }]);
  });
});

// ═══ 5. Las rutas ════════════════════════════════════════════════════════════
describe("🔴 /api/ventas/comisiones/config: una persona, una fila; sin Daniel Levy; el PUT escribe el canónico", () => {
  let firmar: (p: Record<string, unknown>) => string;
  beforeAll(async () => { firmar = (await import("@/lib/session-cookie")).signSession; });
  beforeEach(() => {
    fromCalls.length = 0;
    aliasEnBase = ALIAS;
    // Como queda la tabla DESPUÉS de la migración (5 filas), más DEFAULT.
    tasasEnBase = [
      { vendedor_nombre: "DANIEL LEVY", tasa_venta: 0.005, tasa_cobro: 0.005, activo: true },
      { vendedor_nombre: "EDWIN", tasa_venta: 0.005, tasa_cobro: 0.005, activo: true },
      { vendedor_nombre: "REY STOUTE AGUAS", tasa_venta: 0.005, tasa_cobro: 0.005, activo: true },
      { vendedor_nombre: "REYNALDO ESPINOSA", tasa_venta: 0.01, tasa_cobro: 0.01, activo: true },
      { vendedor_nombre: "Rodrigo", tasa_venta: 0.005, tasa_cobro: 0.005, activo: true },
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

  it("GET: Reynaldo UNA vez con el origen de sus 3 empresas juntado por el alias; Daniel Levy NO está; Rey Stoute Aguas TAMPOCO (retirado)", async () => {
    const { GET } = await import("@/app/api/ventas/comisiones/config/route");
    const res = await GET(await req("admin", "/x"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vendedores: { vendedor_nombre: string; tasa_venta: number; tasa_cobro: number; origen: string[] }[] };
    const nombres = body.vendedores.map((v) => v.vendedor_nombre);
    // 3-sep-2026, Daniel: «te dije que eliminaras Rey Stoute Aguas». Está en
    // la tabla de tasas (5 filas), pero un retirado no existe en Comisiones
    // (`lib/comisiones/retirados`, por el nombre canónico).
    expect(nombres).toEqual(["EDWIN", "REYNALDO ESPINOSA", "Rodrigo"]);
    expect(nombres).not.toContain("DANIEL LEVY");
    expect(nombres).not.toContain("REY STOUTE AGUAS");
    const rey = body.vendedores.find((v) => v.vendedor_nombre === "REYNALDO ESPINOSA")!;
    expect(rey).toMatchObject({ tasa_venta: 0.01, tasa_cobro: 0.01 });
    expect(rey.origen).toEqual(["Active Shoes", "Active Wear", "Fashion Wear"]);
  });

  it("GET antes de la DDL (4 grafías en la tabla, alias vacío): se muestran como vienen, sin romper", async () => {
    aliasEnBase = [];
    tasasEnBase = [
      { vendedor_nombre: "REINALDO ESPINOSA", tasa_venta: 0.01, tasa_cobro: 0.01, activo: true },
      { vendedor_nombre: "REYNALDO ESPINOSA", tasa_venta: 0.01, tasa_cobro: 0.01, activo: true },
    ];
    const { GET } = await import("@/app/api/ventas/comisiones/config/route");
    const body = (await (await GET(await req("admin", "/x"))).json()) as { vendedores: { vendedor_nombre: string }[] };
    expect(body.vendedores.map((v) => v.vendedor_nombre)).toEqual(["REINALDO ESPINOSA", "REYNALDO ESPINOSA"]);
  });

  it("PUT: una grafía se escribe como la persona, y Daniel Levy no se guarda aunque lo manden", async () => {
    const { PUT } = await import("@/app/api/ventas/comisiones/config/route");
    const res = await PUT(await req("admin", "/x", { method: "PUT", body: { updates: [
      { vendedor_nombre: "REINALDO ESPINOSA", tasa_venta: 0.01, tasa_cobro: 0.01, activo: true },
      { vendedor_nombre: "reynaldo espinosa", tasa_venta: 0.01, tasa_cobro: 0.01, activo: true },
      { vendedor_nombre: "DANIEL LEVY", tasa_venta: 0.03, tasa_cobro: 0.03, activo: true },
      { vendedor_nombre: "EDWIN", tasa_venta: 0.005, tasa_cobro: 0.005, activo: true },
    ] } }));
    expect(res.status).toBe(200);
    const up = fromCalls.find((c) => c.op === "upsert" && c.tabla === "comision_vendedor_tasa")!;
    const filas = up.args[0] as { vendedor_nombre: string }[];
    expect(filas.map((f) => f.vendedor_nombre)).toEqual(["REYNALDO ESPINOSA", "EDWIN"]);
  });

  it("🔴 PUT: una tasa para Rey Stoute Aguas (retirado) se RECHAZA con mensaje y no escribe nada — con el canónico o con la grafía «AGUAS»", async () => {
    const { PUT } = await import("@/app/api/ventas/comisiones/config/route");
    for (const nombre of ["REY STOUTE AGUAS", "AGUAS", " rey stoute aguas "]) {
      fromCalls.length = 0;
      const res = await PUT(await req("admin", "/x", { method: "PUT", body: { updates: [
        { vendedor_nombre: "EDWIN", tasa_venta: 0.005, tasa_cobro: 0.005, activo: true },
        { vendedor_nombre: nombre, tasa_venta: 0.005, tasa_cobro: 0.005, activo: true },
      ] } }));
      expect(res.status, nombre).toBe(400);
      expect(((await res.json()) as { error: string }).error, nombre).toMatch(/ya no está en Comisiones/);
      expect(fromCalls.some((c) => c.op === "upsert"), nombre).toBe(false);
    }
  });

  it("GET/PUT: 403 para todo rol que no sea admin", async () => {
    const { GET, PUT } = await import("@/app/api/ventas/comisiones/config/route");
    for (const rol of ["contabilidad", "secretaria", "vendedor", "bodega", "gerente_acs", "gerente_boston"]) {
      expect((await GET(await req(rol, "/x"))).status, rol).toBe(403);
      expect((await PUT(await req(rol, "/x", { method: "PUT", body: { updates: [] } }))).status, rol).toBe(403);
    }
  });
});

describe("🔴 /api/ventas/comisiones/exclusiones: casillas en POST y PATCH, alias en el vendedor", () => {
  let firmar: (p: Record<string, unknown>) => string;
  beforeAll(async () => { firmar = (await import("@/lib/session-cookie")).signSession; });
  beforeEach(() => {
    fromCalls.length = 0;
    aliasEnBase = ALIAS;
    exclusionesEnBase = [
      { id: 7, empresa_key: "active_shoes", cliente_codigo: "D-84", vendedor: "REYNALDO ESPINOSA", activa: true, excluye_venta: true, excluye_cobro: true, creado_por: "daniel", creado_en: "2026-09-03T17:00:00Z" },
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

  it("GET: la lista trae las dos casillas y los vendedores elegibles van por persona (REINALDO y REYNALDO = una opción)", async () => {
    const { GET } = await import("@/app/api/ventas/comisiones/exclusiones/route");
    const body = (await (await GET(await req("admin", "/x"))).json()) as { exclusiones: Record<string, unknown>[]; vendedores: Record<string, string[]> };
    expect(body.exclusiones[0]).toMatchObject({ excluye_venta: true, excluye_cobro: true });
    // El maestro trae REINALDO en fashion_wear y active_shoes; las tasas traen a todos en las 6.
    for (const e of Object.keys(body.vendedores)) {
      expect(body.vendedores[e].filter((v) => /ALDO ESPINOSA/.test(v)), e).toEqual(["REYNALDO ESPINOSA"]);
      expect(body.vendedores[e], e).not.toContain("AGUAS");
      // Y tampoco su nombre canónico: Aguas está retirado de Comisiones (3-sep-2026).
      expect(body.vendedores[e], e).not.toContain("REY STOUTE AGUAS");
    }
  });

  it("🔴 POST: con las dos marcadas no viajan (default de la tabla); solo Cobro viaja; las dos apagadas es 400 sin insertar; la grafía se guarda como persona", async () => {
    const { POST } = await import("@/app/api/ventas/comisiones/exclusiones/route");
    const base = { empresa_key: "active_shoes", cliente_codigo: "d-1", vendedor: "Reinaldo Espinosa" };
    expect((await POST(await req("admin", "/x", { body: base }))).status).toBe(201);
    expect((fromCalls.find((c) => c.op === "insert")!.args[0])).toEqual({ empresa_key: "active_shoes", cliente_codigo: "D-1", vendedor: "REYNALDO ESPINOSA", creado_por: "admin" });

    fromCalls.length = 0;
    expect((await POST(await req("admin", "/x", { body: { ...base, excluye_venta: false, excluye_cobro: true } }))).status).toBe(201);
    expect((fromCalls.find((c) => c.op === "insert")!.args[0])).toEqual({ empresa_key: "active_shoes", cliente_codigo: "D-1", vendedor: "REYNALDO ESPINOSA", excluye_venta: false, excluye_cobro: true, creado_por: "admin" });

    fromCalls.length = 0;
    const r = await POST(await req("admin", "/x", { body: { ...base, excluye_venta: false, excluye_cobro: false } }));
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toMatch(/Marca al menos una/);
    expect(fromCalls.some((c) => c.op === "insert")).toBe(false);
  });

  it("🔴 POST: una exclusión para Rey Stoute Aguas (retirado) es 400 con mensaje y no inserta — canónico o grafía", async () => {
    const { POST } = await import("@/app/api/ventas/comisiones/exclusiones/route");
    for (const vendedor of ["REY STOUTE AGUAS", "Aguas"]) {
      fromCalls.length = 0;
      const r = await POST(await req("admin", "/x", { body: { empresa_key: "vistana", cliente_codigo: "d-1", vendedor } }));
      expect(r.status, vendedor).toBe(400);
      expect(((await r.json()) as { error: string }).error, vendedor).toMatch(/ya no está en Comisiones/);
      expect(fromCalls.some((c) => c.op === "insert"), vendedor).toBe(false);
    }
  });

  it("🔴 PATCH ?id=: cambia las casillas de la fila ACTIVA con UPDATE (nunca DELETE); las dos apagadas es 400; solo admin", async () => {
    const { PATCH } = await import("@/app/api/ventas/comisiones/exclusiones/route");
    const ok = await PATCH(await req("admin", "/x?id=7", { method: "PATCH", body: { excluye_venta: true, excluye_cobro: false } }));
    expect(ok.status).toBe(200);
    const upd = fromCalls.find((c) => c.op === "update")!;
    expect(upd.tabla).toBe("comision_exclusion");
    expect(upd.args[0]).toEqual({ excluye_venta: true, excluye_cobro: false });
    expect(fromCalls.some((c) => c.op === "delete")).toBe(false);

    fromCalls.length = 0;
    expect((await PATCH(await req("admin", "/x?id=7", { method: "PATCH", body: { excluye_venta: false, excluye_cobro: false } }))).status).toBe(400);
    expect(fromCalls.some((c) => c.op === "update")).toBe(false);
    expect((await PATCH(await req("admin", "/x?id=abc", { method: "PATCH", body: { excluye_venta: true, excluye_cobro: false } }))).status).toBe(400);
    // Una fila que ya no está activa: 404.
    exclusionesEnBase[0].activa = false;
    expect((await PATCH(await req("admin", "/x?id=7", { method: "PATCH", body: { excluye_venta: true, excluye_cobro: false } }))).status).toBe(404);
    for (const rol of ["contabilidad", "secretaria", "vendedor", "bodega", "gerente_acs", "gerente_boston"]) {
      expect((await PATCH(await req(rol, "/x?id=7", { method: "PATCH", body: { excluye_venta: true, excluye_cobro: false } }))).status, rol).toBe(403);
    }
    expect((await PATCH(await req(null, "/x?id=7", { method: "PATCH", body: { excluye_venta: true, excluye_cobro: false } }))).status).toBe(401);
  });
});

// ═══ 6. Barridos ═════════════════════════════════════════════════════════════
describe("🔴 barridos", () => {
  it("la pantalla de configuración no lleva la nota «N nombres en Switch» (Daniel la quitó) ni escribe REINALDO con I", () => {
    const vista = leer("src/components/ventas/ComisionesConfiguracionView.tsx");
    expect(vista).not.toMatch(/nombres en Switch/);
    expect(vista).toContain("nombreVendedorEnPantalla");
  });

  it("la lista de bases de cobro vigiladas por retenciones incluye la v8 y su detalle", () => {
    const src = leer("src/__tests__/lib/comision-cobro-sin-retenciones.test.ts");
    expect(src).toContain('funcion: "comision_b2b_v8"');
    expect(src).toContain('archivo: "20260913120000_comision_vendedor_alias_v8.sql"');
  });
});
