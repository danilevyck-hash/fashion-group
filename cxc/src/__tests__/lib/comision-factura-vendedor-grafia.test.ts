// 🩸 Daniel, 12-nov-2026: «al hacer cambio de vendedor, se me duplicó el nombre
// de Rodrigo». Switch y la tasa dicen «Rodrigo»; el cambio se guardaba
// «RODRIGO» y la v10 sacaba DOS filas. Migración 20261112150000: el trigger
// guarda la grafía de Switch para esa empresa. Reproduce el caso con el SQL de
// verdad (pglite; se salta si no está, igual que la v10).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const MIG_GRAFIA = "supabase/migrations/20261112150000_comision_factura_vendedor_grafia.sql";
const PGLITE_DIR = process.env.PGLITE_DIR ?? "/tmp/v6/node_modules/@electric-sql/pglite";
const hayPglite = existsSync(path.join(PGLITE_DIR, "dist/index.js"));

describe("la migración de la grafía", () => {
  it("cambia el CHECK de mayúsculas, resuelve en el trigger y recanoniza lo guardado", () => {
    const sql = leer(MIG_GRAFIA);
    expect(sql).toMatch(/CHECK \(vendedor = BTRIM\(vendedor\) AND vendedor <> ''\)/);
    expect(sql).toMatch(/UPPER\(x\.nombre\) = UPPER\(v_canonico\)/);
    expect(sql).toMatch(/UPDATE comision_factura_vendedor SET vendedor = vendedor;/);
    expect(sql).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE/i);
  });
});

describe.skipIf(!hayPglite)("🩸 Rodrigo duplicado (pglite)", () => {
  type Fila = Record<string, unknown>;
  let db: { query: (s: string, p?: unknown[]) => Promise<{ rows: Fila[] }>; exec: (s: string) => Promise<unknown>; close: () => Promise<void> };
  const sqlDe = (rel: string) => leer(rel).replace(/^GRANT .*$/gm, "").replace(/^NOTIFY .*$/gm, "");

  beforeAll(async () => {
    const { PGlite } = await import(/* @vite-ignore */ path.join(PGLITE_DIR, "dist/index.js"));
    db = new PGlite();
    await db.exec(`
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
      "20260703120000_comision_b2b_v5_vendedor_factura.sql",
      "20260911120000_comision_b2b_v6_cobro_quien_registro.sql",
      "20260912120000_comision_exclusion_v7.sql",
      "20260913120000_comision_vendedor_alias_v8.sql",
      "20261007120000_comision_descuentos_vigencia.sql",
      "20261008120000_comision_b2b_v9_cliente_por_codigo.sql",
      "20261111130000_comision_factura_vendedor_v10.sql",
    ]) await db.exec(sqlDe(`supabase/migrations/${m}`));
    // Vistana, octubre 2026, como en producción: «Rodrigo» (así en Switch y en
    // la tasa, cobro 0 %) vende F-R; DANIEL LEVY vende F-D, que Daniel pasa a Rodrigo.
    await db.exec(`
      UPDATE comision_exclusion SET activa = false, desactivado_por = 'test', desactivado_en = now() WHERE activa;
      INSERT INTO switch_clientes (empresa_key, cliente_switch_id, codigo, nombre) VALUES ('vistana', 1, 'D-1', 'City Mall');
      INSERT INTO comision_vendedor_tasa VALUES ('Rodrigo', 0.005, 0, true, now()), ('DANIEL LEVY', 0.005, 0.005, true, now())
        ON CONFLICT (vendedor_nombre) DO UPDATE SET tasa_venta = EXCLUDED.tasa_venta, tasa_cobro = EXCLUDED.tasa_cobro, activo = true;
      INSERT INTO switch_facturas (empresa_key, switch_factura_id, secuencial, fecha, vendedor_nombre, cliente_switch_id) VALUES
        ('vistana', 1, 'F-R', '2026-10-10 12:00-05', 'Rodrigo', 1),
        ('vistana', 2, 'F-D', '2026-10-15 12:00-05', 'DANIEL LEVY', 1);
      INSERT INTO switch_factura_utilidad (empresa_key, secuencial, fecha, tipo_comprobante, vendedor, cliente, subtotal_con_descuento, pct_utilidad) VALUES
        ('vistana', 'F-R', '2026-10-10', 'Factura', 'Rodrigo', 'City Mall', 10932, 30),
        ('vistana', 'F-D', '2026-10-15', 'Factura', 'DANIEL LEVY', 'City Mall', 17520, 30);
      INSERT INTO comision_factura_vendedor (empresa_key, switch_factura_id, secuencial, vendedor, creado_por)
        VALUES ('vistana', 2, 'F-D', 'RODRIGO', 'daniel');
    `);
  });
  afterAll(async () => { await db?.close(); });

  const filas = async () => {
    const r = await db.query(`SELECT comision_b2b_v10('vistana', 2026, 10) AS j`);
    return (r.rows[0].j as { vendedores: Fila[] }).vendedores;
  };
  const total = (v: Fila[]) => Math.round(v.reduce((s, x) => s + Number(x.comision_total), 0) * 100) / 100;

  it("🩸 ANTES: «Rodrigo» y «RODRIGO» salen como dos vendedores", async () => {
    const v = await filas();
    expect(v.map((x) => x.vendedor).sort()).toEqual(["RODRIGO", "Rodrigo"]);
    expect(total(v)).toBe(142.26);
  });

  it("DESPUÉS de la migración: UN Rodrigo con las dos facturas, el mismo total y el detalle completo", async () => {
    await db.exec(sqlDe(MIG_GRAFIA));
    const v = await filas();
    expect(v.map((x) => x.vendedor)).toEqual(["Rodrigo"]);
    expect(Number(v[0].base)).toBe(28452);
    expect(total(v)).toBe(142.26);
    const d = await db.query(`SELECT comision_b2b_detalle('vistana', 2026, 10, 'Rodrigo') AS j`);
    expect((d.rows[0].j as { ventas: Fila[] }).ventas.map((x) => x.secuencial).sort()).toEqual(["F-D", "F-R"]);
  });

  it("un cambio nuevo escrito en mayúsculas (como lo manda la pantalla) se guarda «Rodrigo»", async () => {
    await db.exec(`UPDATE comision_factura_vendedor SET activa = false, desactivado_por = 'daniel', desactivado_en = now() WHERE activa;
      INSERT INTO comision_factura_vendedor (empresa_key, switch_factura_id, secuencial, vendedor, creado_por) VALUES ('vistana', 2, 'F-D', ' RODRIGO ', 'daniel');`);
    const r = await db.query(`SELECT vendedor FROM comision_factura_vendedor WHERE activa`);
    expect(r.rows[0].vendedor).toBe("Rodrigo");
    expect((await filas()).map((x) => x.vendedor)).toEqual(["Rodrigo"]);
  });
});
