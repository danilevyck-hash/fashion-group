// ═════════════════════════════════════════════════════════════════════════════
// 🔴 MULTI FASHION HOLDING SALE DEL SQL: LA IDENTIDAD DEL CLIENTE ES EL CÓDIGO.
// ═════════════════════════════════════════════════════════════════════════════
// 🩸 Medido contra producción el 5 y 6-sep-2026. La v8 llevaba adentro, en las
// dos CTE que reparten la plata:
//     AND f.cliente        NOT ILIKE '%multi fashion holding%'
//     AND r.cliente_nombre NOT ILIKE '%multi fashion holding%'
// Ese cliente es D-108 (la intercompañía) y en 2026 tiene 203 facturas y 21
// recibos en las 6 empresas. Atado a un TEXTO que Switch puede cambiar con una
// letra, y era la única exclusión de cliente que no se veía en ninguna pantalla.
// Daniel: «debe de ser por código, ¿no?» → sí.
//
// 🔴 POR QUÉ UN COMODÍN. `comision_exclusion` es por (empresa, cliente,
// VENDEDOR). A D-108 le venden o le cobran hoy CINCO nombres, pero enumerarlos
// no cierra el agujero: el día que un vendedor nuevo le facture, esa factura
// vuelve a pagar comisión en silencio. Por eso `*` = todos.
//
// ✅ MEDIDO ANTES DE ESCRIBIR ESTO, con la RPC real contra producción, la
// comisión por persona y por mes de ene–sep 2026 en las 6 empresas:
//   · v8 (nombre en el SQL)            → 56 pares (vendedor, mes)
//   · v9 simulada (código + comodín)   → LOS MISMOS 56, al centavo
//   · CONTROL sin las filas de D-108   → 10 pares cambian
// Script: scripts/_medir-comision-v9-d108.mjs
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { VENDEDOR_TODOS, ROTULO_VENDEDOR_TODOS, esVendedorTodos } from "@/lib/comisiones/vendedor-todos";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { validarExclusionNueva } from "@/lib/comisiones/exclusiones";

// La cadena de RPC se lee del archivo y de la constante: no hace falta un
// cliente de Supabase de verdad.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { rpc: () => Promise.resolve({ data: null, error: null }) } }));

const RAIZ = process.cwd();
const MIG_V9 = "supabase/migrations/20261008120000_comision_b2b_v9_cliente_por_codigo.sql";
const MIG_V8 = "supabase/migrations/20260913120000_comision_vendedor_alias_v8.sql";

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

/**
 * Lo que la v9 cambia sobre la v8, deshecho a mano: el comodín vuelve a la
 * igualdad simple, la marca de la respuesta vuelve a decir `cliente_vendedor` y
 * se reponen las dos líneas del ILIKE. Lo que queda tiene que ser la v8 byte a
 * byte (compactada): cualquier OTRO cambio en la ruta del dinero pone esto en
 * rojo. Mismo patrón que `comision-alias-v8.test.ts`.
 */
function comoLaV8(body: string): string {
  return body
    .replace(
      /AND \(ce\.vendedor = '\*' OR ce\.vendedor = (UPPER\([\s\S]*?\))\)/g,
      "AND ce.vendedor = $1",
    )
    .replace(/'cliente_vendedor_o_todos'/g, "'cliente_vendedor'")
    // Las dos líneas del ILIKE vuelven a su lugar EXACTO en la v8: la de la
    // factura justo antes del filtro de mostrador, y la del recibo cerrando la
    // consulta de cobros (con el `;` que le pertenece).
    .replace(
      /(\s*)AND UPPER\(TRIM\(COALESCE\(f\.cliente, ''\)\)\) NOT IN \('VENTAS', 'CONTADO'\)/g,
      "$1AND f.cliente NOT ILIKE '%multi fashion holding%'$1AND UPPER(TRIM(COALESCE(f.cliente, ''))) NOT IN ('VENTAS', 'CONTADO')",
    )
    .replace(
      /(\s*)AND COALESCE\(r\.cliente_codigo, ''\) <> 'TCKCTA'(;?)/g,
      (_m: string, sep: string, punto: string) =>
        `${sep}AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA'${sep}AND COALESCE(r.cliente_nombre, '') NOT ILIKE '%multi fashion holding%'${punto}`,
    );
}

// ═══ 1. El comodín, en el módulo puro ════════════════════════════════════════
describe("🔴 el comodín de vendedor: qué es y cómo se dice", () => {
  it("es `*`, y no una palabra que pueda chocar con el nombre de una persona", () => {
    expect(VENDEDOR_TODOS).toBe("*");
    expect(esVendedorTodos("*")).toBe(true);
    expect(esVendedorTodos(" * ")).toBe(true);
    expect(esVendedorTodos("TODOS")).toBe(false);
    expect(esVendedorTodos("REYNALDO ESPINOSA")).toBe(false);
    expect(esVendedorTodos(null)).toBe(false);
  });

  it("🔴 en pantalla NUNCA se ve el `*`: se dice «Todos los vendedores»", () => {
    expect(ROTULO_VENDEDOR_TODOS).toBe("Todos los vendedores");
    expect(nombreVendedorEnPantalla("*")).toBe("Todos los vendedores");
    // Y lo de siempre no cambia.
    expect(nombreVendedorEnPantalla("REYNALDO ESPINOSA")).toBe("Reynaldo Espinosa");
    expect(nombreVendedorEnPantalla("DEFAULT")).toBe("Oficina (DEFAULT)");
  });

  it("la API acepta el comodín como un vendedor válido, con sus casillas", () => {
    const r = validarExclusionNueva({
      empresa_key: "vistana", cliente_codigo: "d-108 ", vendedor: "*",
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.valor).toEqual({
      empresa_key: "vistana", cliente_codigo: "D-108", vendedor: "*",
      excluye_venta: true, excluye_cobro: true,
    });
  });

  it("con las dos casillas apagadas tampoco se guarda un comodín", () => {
    const r = validarExclusionNueva({
      empresa_key: "vistana", cliente_codigo: "D-108", vendedor: "*",
      excluye_venta: false, excluye_cobro: false,
    });
    expect(r.ok).toBe(false);
  });

  it("el comodín vive en un módulo SIN dependencias (si arrastra `empresa-mapping`, rompe mocks parciales)", () => {
    const src = leer("src/lib/comisiones/vendedor-todos.ts");
    expect(src).not.toMatch(/^import /m);
  });
});

// ═══ 2. La v9 es la v8 byte a byte, salvo el cambio ══════════════════════════
describe("🔴 comision_b2b_v9: la v8 sin el filtro por NOMBRE, con el comodín", () => {
  const v9 = soloSql(MIG_V9);
  const v8 = soloSql(MIG_V8);
  const b9 = cuerpo(v9, "comision_b2b_v9");
  const b8 = cuerpo(v8, "comision_b2b_v8");
  const d9 = cuerpo(v9, "comision_b2b_detalle");
  const d8 = cuerpo(v8, "comision_b2b_detalle");

  it("es una función NUEVA y no dropea ni pisa la v8, la v7, la v6 ni la v5", () => {
    expect(v9).toMatch(/CREATE\s+FUNCTION\s+comision_b2b_v9\s*\(/i);
    expect(v9).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+comision_b2b_v9/i);
    expect(v9).not.toMatch(/DROP\s+FUNCTION/i);
    expect(v9).not.toMatch(/FUNCTION\s+comision_b2b_v[5678]\s*\(/i);
  });

  it("🔴 deshaciendo el comodín y reponiendo el ILIKE, la v9 ES la v8 (byte a byte, compactada)", () => {
    expect(compacto(comoLaV8(b9))).toBe(compacto(b8));
    expect(compacto(b8).length).toBeGreaterThan(1500);
  });

  it("🔴 el DETALLE cambia lo mismo — paridad tabla ↔ modal", () => {
    expect(compacto(comoLaV8(d9))).toBe(compacto(d8));
  });

  it("🔴 no queda NI UNA mención a «multi fashion holding» en el SQL de la plata", () => {
    expect(b9.toLowerCase()).not.toContain("multi fashion holding");
    expect(d9.toLowerCase()).not.toContain("multi fashion holding");
    // Y en la v8 sí estaba: éste es el control de que el candado mira el lugar correcto.
    expect(b8.toLowerCase()).toContain("multi fashion holding");
  });

  it("🔴 el comodín está en los CUATRO joins de exclusión (venta y cobro, tabla y detalle)", () => {
    expect((b9.match(/ce\.vendedor = '\*'/g) ?? [])).toHaveLength(2);
    expect((d9.match(/ce\.vendedor = '\*'/g) ?? [])).toHaveLength(2);
    const ventas = compacto(b9.slice(b9.indexOf("ventas AS ("), b9.indexOf("cobros AS (")));
    expect(ventas).toContain("AND (ce.vendedor = '*' OR ce.vendedor = UPPER(COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor))))");
    expect(ventas).toContain("AND ce.excluye_venta = true");
    expect(ventas).toContain("AND ce.id IS NULL");
    const cobros = compacto(b9.slice(b9.indexOf("cobros AS ("), b9.indexOf("universo AS (")));
    expect(cobros).toContain("AND (ce.vendedor = '*' OR ce.vendedor = UPPER(comision_vendedor_canonico(r.vendedor_registro)))");
    expect(cobros).toContain("AND ce.excluye_cobro = true");
  });

  it("🔴 el JOIN sigue siendo LEFT + `ce.id IS NULL`: el comodín no multiplica filas", () => {
    // Un documento que cruce con DOS filas (la del vendedor y el comodín) produce
    // dos renglones unidos, y los DOS se descartan. Lo que se cuenta es lo que
    // NO cruza, y eso cruza cero o una vez.
    expect((b9.match(/LEFT JOIN comision_exclusion ce/g) ?? [])).toHaveLength(2);
    expect(b9).not.toMatch(/INNER JOIN comision_exclusion/i);
    expect((b9.match(/AND ce\.id IS NULL/g) ?? [])).toHaveLength(2);
  });

  it("la respuesta DICE con qué regla salió, y lo demás no cambió", () => {
    expect(b9).toContain("'exclusiones', 'cliente_vendedor_o_todos'");
    expect(b9).toContain("'alias', 'canonico'");
    expect(b9).toContain("'regla_cobro', 'quien_registro'");
  });
});

// ═══ 3. Las 6 filas de D-108 ═════════════════════════════════════════════════
describe("🔴 la migración carga D-108 en las SEIS empresas, por código", () => {
  const sql = leer(MIG_V9);

  it("una fila por empresa, comodín, las dos casillas, firmada", () => {
    for (const e of ["vistana", "fashion_wear", "fashion_shoes", "active_wear", "active_shoes", "joystep"]) {
      expect(sql, e).toContain(`('${e}')`);
    }
    expect(sql).toContain("'D-108', '*', true, true, true, 'migracion-d108-por-codigo'");
    expect(sql).toMatch(/ON CONFLICT \(empresa_key, cliente_codigo, vendedor\) WHERE activa DO NOTHING/i);
  });

  it("🔴 NUNCA un DELETE sobre comision_exclusion: es historial de decisiones sobre plata", () => {
    expect(sql).not.toMatch(/DELETE\s+FROM\s+comision_exclusion/i);
  });

  it("deja escrita la medición (203 facturas, 21 recibos) y la decisión de Daniel", () => {
    expect(sql).toContain("203 facturas");
    expect(sql).toContain("21 recibos");
    expect(sql).toMatch(/debe de ser por código/i);
  });
});

// ═══ 4. La cadena de RPC ═════════════════════════════════════════════════════
describe("🔴 la v9 encabeza la cadena, y la v8 queda de red", () => {
  it("v9 → v8 → v7 → v6 → v5, y la respuesta dice si el cliente ya va por código", async () => {
    const { RPC_COMISION, CADENA_RPC_COMISION } = await import("@/lib/comisiones/rpc");
    expect(RPC_COMISION).toBe("comision_b2b_v9");
    expect(CADENA_RPC_COMISION.map((c) => c.fn)).toEqual([
      "comision_b2b_v9", "comision_b2b_v8", "comision_b2b_v7", "comision_b2b_v6", "comision_b2b_v5",
    ]);
    const src = leer("src/lib/comisiones/rpc.ts");
    expect(src).toContain('cliente_por_codigo: version === "v9"');
  });
});

// ═══ 5. La conducta, con el SQL de verdad (pglite) ═══════════════════════════
// El candado estático prueba que la v9 ES la v8 salvo el cambio. Éste prueba lo
// que el cambio HACE: que el comodín excluye a D-108 para CUALQUIER vendedor
// —incluido uno que nunca le vendió antes— y que a los demás clientes no les
// mueve un centavo. Corre solo si pglite está instalado.
const PGLITE_DIR = process.env.PGLITE_DIR ?? "/tmp/v6/node_modules/@electric-sql/pglite";
const hayPglite = existsSync(path.join(PGLITE_DIR, "dist/index.js"));

describe.skipIf(!hayPglite)("🔴 conducta real de la v9 (pglite): el comodín tapa a D-108 para todos", () => {
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
    for (const m of [
      "supabase/migrations/20260703120000_comision_b2b_v5_vendedor_factura.sql",
      "supabase/migrations/20260911120000_comision_b2b_v6_cobro_quien_registro.sql",
      "supabase/migrations/20260912120000_comision_exclusion_v7.sql",
      MIG_V8,
      "supabase/migrations/20261007120000_comision_descuentos_vigencia.sql",
      MIG_V9,
    ]) {
      await exec(sqlDeMigracion(m));
    }
    // D-108 (la intercompañía) y D-1 (un cliente normal) en Vistana. Le venden y
    // le cobran DOS personas, y una de ellas —«NUEVA VENDEDORA»— no existía el
    // día que se cargaron las exclusiones: es justo el caso que el comodín cubre.
    await exec(`
      INSERT INTO switch_clientes (empresa_key, cliente_switch_id, codigo, nombre) VALUES
        ('vistana', 44, 'D-108', 'Multi Fashion Holding'), ('vistana', 1, 'D-1', 'Otro');
      INSERT INTO comision_vendedor_tasa VALUES ('EDWIN', 0.005, 0.005, true, now()), ('NUEVA VENDEDORA', 0.005, 0.005, true, now());
      INSERT INTO switch_facturas (empresa_key, secuencial, fecha, vendedor_nombre, cliente_switch_id) VALUES
        ('vistana', 'F-1', '2026-07-10 12:00-05', 'EDWIN', 44),
        ('vistana', 'F-2', '2026-07-11 12:00-05', 'NUEVA VENDEDORA', 44),
        ('vistana', 'F-3', '2026-07-12 12:00-05', 'EDWIN', 1);
      INSERT INTO switch_factura_utilidad (empresa_key, secuencial, fecha, tipo_comprobante, vendedor, cliente, subtotal_con_descuento, pct_utilidad) VALUES
        ('vistana', 'F-1', '2026-07-10', 'Factura', 'EDWIN', 'Multi Fashion Holding', 10000, 30),
        ('vistana', 'F-2', '2026-07-11', 'Factura', 'NUEVA VENDEDORA', 'Multi Fashion Holding', 20000, 30),
        ('vistana', 'F-3', '2026-07-12', 'Factura', 'EDWIN', 'Otro', 1000, 30);
      INSERT INTO switch_recibos (empresa_key, fecha, cliente_switch_id, cliente_codigo, cliente_nombre, vendedor_registro, total) VALUES
        ('vistana', '2026-07-15', 44, 'D-108', 'Multi Fashion Holding', 'EDWIN', 5000),
        ('vistana', '2026-07-16', 44, 'D-108', 'Multi Fashion Holding', 'NUEVA VENDEDORA', 7000),
        ('vistana', '2026-07-17', 1, 'D-1', 'Otro', 'EDWIN', 400);
    `);
  });
  afterAll(async () => { await cerrar?.(); });

  const filas = async (fn: string) => {
    const r = await query(`SELECT ${fn}('vistana', 2026, 7) AS j`);
    return (r.rows[0].j as { vendedores: Fila[] }).vendedores;
  };

  it("🔴 la migración deja 6 filas de D-108 con vendedor `*`, una por empresa, y no borra nada de lo que había", async () => {
    const r = (await query(`SELECT empresa_key, vendedor, excluye_venta, excluye_cobro, creado_por
      FROM comision_exclusion WHERE cliente_codigo = 'D-108' AND activa ORDER BY empresa_key`)).rows;
    expect(r).toHaveLength(6);
    expect(r.every((x) => x.vendedor === "*" && x.excluye_venta && x.excluye_cobro)).toBe(true);
    expect(r.every((x) => x.creado_por === "migracion-d108-por-codigo")).toBe(true);
    // Las 11 de Daniel siguen activas: la migración no tocó ninguna.
    const otras = (await query(`SELECT COUNT(*)::int AS n FROM comision_exclusion WHERE activa AND cliente_codigo <> 'D-108'`)).rows[0];
    expect(Number(otras.n)).toBe(11);
  });

  it("🔴 en la v9, D-108 no comisiona para NADIE — ni para quien nunca le vendió antes", async () => {
    const v9 = await filas("comision_b2b_v9");
    const edwin = v9.find((v) => v.vendedor === "EDWIN")!;
    // Solo le queda F-3 ($1.000 × 0,5 %) y el recibo de D-1 ($400 × 0,5 %).
    expect(Number(edwin.base)).toBe(1000);
    expect(Number(edwin.base_cobro)).toBe(400);
    expect(Number(edwin.comision_total)).toBe(7);
    // La vendedora nueva SOLO le vendió y le cobró a D-108: no le queda NADA,
    // así que ni siquiera aparece en la lista (no está en el maestro de
    // vendedores de esa empresa). Cero comisión, no una fila en cero.
    expect(v9.find((v) => v.vendedor === "NUEVA VENDEDORA")).toBeUndefined();
  });

  it("🔴 CONTROL: la v8 daba lo MISMO por el nombre — el cambio no mueve un centavo", async () => {
    const v8 = await filas("comision_b2b_v8");
    const v9 = await filas("comision_b2b_v9");
    const clave = (f: Fila[]) => f.map((v) => `${v.vendedor}:${v.comision_total}`).sort();
    expect(clave(v9)).toEqual(clave(v8));
  });

  it("🔴 CONTROL AL REVÉS: si Switch le cambia el NOMBRE, la v8 le paga comisión y la v9 no", async () => {
    // Es la razón de todo el cambio: el nombre es un texto, el código es la
    // identidad. Se le cambia el nombre a los documentos de D-108 y se mira.
    await exec(`UPDATE switch_factura_utilidad SET cliente = 'Multi-Fashion Holding S.A.' WHERE cliente ILIKE '%multi%fashion%holding%';
                UPDATE switch_recibos SET cliente_nombre = 'Multi-Fashion Holding S.A.' WHERE cliente_nombre ILIKE '%multi%fashion%holding%';`);
    const v8 = await filas("comision_b2b_v8");
    const v9 = await filas("comision_b2b_v9");
    const edwin8 = v8.find((v) => v.vendedor === "EDWIN")!;
    const edwin9 = v9.find((v) => v.vendedor === "EDWIN")!;
    expect(Number(edwin8.base)).toBe(11000);  // la v8 se lo cuenta: el ILIKE ya no pega
    expect(Number(edwin9.base)).toBe(1000);   // la v9 sigue firme: mira el CÓDIGO
    const nueva8 = v8.find((v) => v.vendedor === "NUEVA VENDEDORA")!;
    expect(Number(nueva8.base)).toBe(20000);   // $20.000 que empiezan a comisionar solos
    expect(v9.find((v) => v.vendedor === "NUEVA VENDEDORA")).toBeUndefined();
  });

  it("🔴 el DETALLE cierra al centavo con la fila de la tabla (paridad tabla ↔ modal)", async () => {
    const v9 = await filas("comision_b2b_v9");
    const edwin = v9.find((v) => v.vendedor === "EDWIN")!;
    const det = (await query(`SELECT comision_b2b_detalle('vistana', 2026, 7, 'EDWIN') AS j`)).rows[0].j as Fila;
    expect(Number(det.ventas_base)).toBe(Number(edwin.base));
    expect(Number(det.cobros_base)).toBe(Number(edwin.base_cobro));
    expect(Number(det.comision_total)).toBe(Number(edwin.comision_total));
  });
});
