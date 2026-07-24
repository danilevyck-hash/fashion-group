/**
 * PR-0 paridad catálogos — integración READ-ONLY contra la DB real.
 *
 * Fija el contrato de ESQUEMA que las rutas de catálogos asumen (columnas,
 * vistas, RPCs nombradas) para que el refactor a motor multi-marca no pueda
 * romperlo sin que truene aquí. SOLO LECTURA: ningún test escribe en tablas
 * reales; lo que exigiría escribir está marcado skip con nota.
 *
 * NO corren en `npm test` por defecto:
 *   RUN_DB_TESTS=1 npx vitest run src/__tests__/integration/catalogo-paridad-db.test.ts
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env.local
 * (los clients de marca usan el fallback de las env REEBOK_ / JOYBEES_ al
 * proyecto principal, igual que producción).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const RUN = !!process.env.RUN_DB_TESTS;

function loadEnv(): Record<string, string> {
  try {
    const env: Record<string, string> = {};
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return env;
  } catch {
    return {};
  }
}

describe.skipIf(!RUN)("catálogos — contrato de esquema en DB real (read-only)", () => {
  let main: SupabaseClient;
  let reebok: SupabaseClient;
  let joybees: SupabaseClient;

  beforeAll(() => {
    const env = { ...loadEnv(), ...process.env } as Record<string, string | undefined>;
    const mainUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    const mainKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!mainUrl || !mainKey) throw new Error("Faltan credenciales Supabase (.env.local)");
    main = createClient(mainUrl, mainKey, { auth: { persistSession: false } });
    // Mismo fallback que src/lib/{reebok,joybees}-supabase-server.ts
    reebok = createClient(
      env.NEXT_PUBLIC_REEBOK_SUPABASE_URL || mainUrl,
      env.REEBOK_SERVICE_ROLE_KEY || mainKey,
      { auth: { persistSession: false } },
    );
    joybees = createClient(
      env.NEXT_PUBLIC_JOYBEES_SUPABASE_URL || mainUrl,
      env.JOYBEES_SERVICE_ROLE_KEY || mainKey,
      { auth: { persistSession: false } },
    );
  });

  // ── Columnas que las rutas seleccionan EXPLÍCITAMENTE hoy ──────────────────
  // (si el refactor cambia una vista/tabla y una columna desaparece, el select
  // truena aquí igual que tronaría el endpoint)

  it("reebok_orders + items: columnas del detalle de pedido", async () => {
    const { error } = await reebok
      .from("reebok_orders")
      .select(
        "id, order_number, client_name, vendor_name, client_email, comment, total, created_at, updated_at, idempotency_key, status, origen_original, origen_short_id, deleted, reebok_order_items(id, order_id, product_id, sku, name, image_url, quantity, unit_price, created_at, is_preorder)",
      )
      .limit(1);
    expect(error).toBeNull();
  });

  it("joybees_orders + items: columnas del detalle (sin is_preorder — concepto solo-Reebok)", async () => {
    const { error } = await joybees
      .from("joybees_orders")
      .select(
        "id, order_number, client_name, vendor_name, client_email, comment, total, created_at, updated_at, idempotency_key, status, deleted, joybees_order_items(id, order_id, product_id, sku, name, image_url, quantity, unit_price, created_at)",
      )
      .limit(1);
    expect(error).toBeNull();
  });

  it("tablas de envíos a Switch: columnas del candado #236", async () => {
    for (const [db, table] of [
      [reebok, "reebok_switch_envios"],
      [joybees, "joybees_switch_envios"],
    ] as const) {
      const { error } = await db
        .from(table)
        .select("order_id, estado, numero_interno, pedido_switch_id, error_detalle, created_at, updated_at")
        .limit(1);
      expect(error, table).toBeNull();
    }
  });

  it("pedidos públicos: columnas del link compartible (proyecto principal)", async () => {
    for (const table of ["reebok_pedidos_publicos", "joybees_pedidos_publicos"]) {
      const { error } = await main
        .from(table)
        .select("short_id,cliente_nombre,items,total,convertida,convertida_at,ped_order_number,created_at,id,deleted")
        .limit(1);
      expect(error, table).toBeNull();
    }
  });

  it("vistas unificadas: columnas base que consume pedidos-unificado", async () => {
    const { error: rErr } = await main
      .from("reebok_pedidos_unificado_vw")
      .select("origen, id_natural, cliente, total, created_at, vendor, items, fuente")
      .limit(1);
    expect(rErr).toBeNull();
    const { error: jErr } = await joybees
      .from("joybees_pedidos_unificado_vw")
      .select("origen, id_natural, cliente, total, created_at, vendor, items, fuente")
      .limit(1);
    expect(jErr).toBeNull();
  });

  it("catálogos de productos: columnas explícitas de products/public", async () => {
    const { error: rErr } = await reebok
      .from("products")
      .select(
        "id,name,sku,description,category,sub_category,gender,color,price,image_url,badge,on_sale,active,existencia,disponibilidad,created_at",
      )
      .limit(1);
    expect(rErr).toBeNull();
    const { error: jErr } = await joybees
      .from("joybees_products")
      .select("id,sku,name,category,gender,price,stock,image_url,active,popular,is_regalia,badge,created_at")
      .limit(1);
    expect(jErr).toBeNull();
  });

  it("inventory Reebok: columnas del catálogo público y del aviso de stock", async () => {
    const { error } = await reebok.from("inventory").select("product_id,size,quantity").limit(1);
    expect(error).toBeNull();
  });

  // ── Invariantes de negocio observables sin escribir ────────────────────────

  it("numeración: reebok_orders = PED-### y joybees_orders = JBP-###", async () => {
    const { data: rOrders, error: rErr } = await reebok
      .from("reebok_orders")
      .select("order_number")
      .limit(1000);
    expect(rErr).toBeNull();
    for (const o of rOrders || []) {
      expect(o.order_number, `reebok: ${o.order_number}`).toMatch(/^PED-\d+$/);
    }
    const { data: jOrders, error: jErr } = await joybees
      .from("joybees_orders")
      .select("order_number")
      .limit(1000);
    expect(jErr).toBeNull();
    for (const o of jOrders || []) {
      expect(o.order_number, `joybees: ${o.order_number}`).toMatch(/^JBP-\d+$/);
    }
  });

  it("las vistas unificadas EXCLUYEN pedidos soft-deleted", async () => {
    // Reebok
    const { data: rDeleted } = await reebok
      .from("reebok_orders")
      .select("id")
      .eq("deleted", true)
      .limit(20);
    if ((rDeleted || []).length > 0) {
      const ids = (rDeleted || []).map((r) => r.id as string);
      const { data: enVista, error } = await main
        .from("reebok_pedidos_unificado_vw")
        .select("id_natural")
        .in("id_natural", ids);
      expect(error).toBeNull();
      expect(enVista || []).toHaveLength(0);
    }
    // Joybees
    const { data: jDeleted } = await joybees
      .from("joybees_orders")
      .select("id")
      .eq("deleted", true)
      .limit(20);
    if ((jDeleted || []).length > 0) {
      const ids = (jDeleted || []).map((r) => r.id as string);
      const { data: enVista, error } = await joybees
        .from("joybees_pedidos_unificado_vw")
        .select("id_natural")
        .in("id_natural", ids);
      expect(error).toBeNull();
      expect(enVista || []).toHaveLength(0);
    }
  });

  it("pedidos públicos convertidos apuntan a un order_number con el prefijo de su marca", async () => {
    const { data: rPubs, error: rErr } = await main
      .from("reebok_pedidos_publicos")
      .select("ped_order_number")
      .eq("convertida", true)
      .limit(500);
    expect(rErr).toBeNull();
    for (const p of rPubs || []) {
      expect(p.ped_order_number, "reebok convertida sin PED-").toMatch(/^PED-\d+$/);
    }
    const { data: jPubs, error: jErr } = await main
      .from("joybees_pedidos_publicos")
      .select("ped_order_number")
      .eq("convertida", true)
      .limit(500);
    expect(jErr).toBeNull();
    for (const p of jPubs || []) {
      expect(p.ped_order_number, "joybees convertida sin JBP-").toMatch(/^JBP-\d+$/);
    }
  });

  // ── Lo que NO se puede fijar sin escribir (riesgo residual documentado) ────

  it.skip("RPCs de creación/conversión ejecutadas end-to-end (reebok_create_order, joybees_create_order, convert_*_pedido_publico, *_order_replace_items) — ESCRIBIRÍAN pedidos reales; el contrato de sus argumentos queda fijado en los tests de rutas con mocks", () => {});

  it.skip("idempotencia REAL de convertir/confirmar bajo doble POST — requiere insertar un pedido público de prueba en producción (prohibido en este arnés)", () => {});

  it.skip("numeración PED-/JBP- sin race bajo concurrencia (advisory lock del RPC) — requiere escrituras concurrentes", () => {});
});
