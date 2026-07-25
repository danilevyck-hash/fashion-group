// ─────────────────────────────────────────────────────────────────────────────
// Config Tommy COMPLETA — tercera marca sobre el motor de catálogos.
// Patrón de los tests de config existentes (superficie/bulto-total): fija el
// contrato de MARCAS_CONFIG.tommy + MARCA_THEME.tommy + el registro de su cron
// en TODOS los sitios (vercel.json, cron-telemetry, sync-now). Si algo de esto
// se rompe, la marca queda a medias sin que se note en runtime.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Clients Supabase eager de las libs importadas (cron-telemetry/sync-now):
// se mockean para que el import no exija env — acá solo se lee config.
vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import { MARCAS_CONFIG, getMarcaConfig } from "@/lib/catalogo/marcas";
import { MARCA_THEME, MARCAS_UI, getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import { SYNC_NOW_MODULOS, moduloConfig, rolesSyncNow } from "@/lib/switch-api/sync-now";
import {
  SWITCH_CRON_ENTRADAS,
  COLATERAL_RECOVER_AFTER_HOUR_UTC,
  SEED_TOLERANT_CRONS,
} from "@/lib/cron-telemetry";

describe("MARCAS_CONFIG.tommy — modelo Joybees, tablas tommy_*", () => {
  const cfg = MARCAS_CONFIG.tommy;

  it("existe y resuelve por getMarcaConfig", () => {
    expect(cfg).toBeTruthy();
    expect(getMarcaConfig("tommy")).toBe(cfg);
    expect(getMarcaConfig("tommyx")).toBeNull();
  });

  it("empresa Switch fashion_shoes y numeración TOM-", () => {
    expect(cfg.empresaKey).toBe("fashion_shoes");
    expect(cfg.numeroPrefijo).toBe("TOM");
    expect(cfg.cronName).toBe("tommy-catalogo");
    expect(cfg.switchDirectorioLabel).toBe("Fashion Shoes");
  });

  it("todas las tablas/vistas/RPCs con prefijo tommy_", () => {
    expect(cfg.ordersTable).toBe("tommy_orders");
    expect(cfg.itemsRelation).toBe("tommy_order_items");
    expect(cfg.enviosTable).toBe("tommy_switch_envios");
    expect(cfg.productsTable).toBe("tommy_products");
    expect(cfg.publicosTable).toBe("tommy_pedidos_publicos");
    expect(cfg.unificadoView).toBe("tommy_pedidos_unificado_vw");
    expect(cfg.createOrderRpc).toBe("tommy_create_order");
    expect(cfg.replaceItemsRpc).toBe("tommy_order_replace_items");
    expect(cfg.convertRpc).toBe("convert_tommy_pedido_publico");
  });

  it("bulto FIJO 12 (todo calzado) y total = qty × 12 × precio", () => {
    expect(cfg.bultoSize()).toBe(12);
    expect(cfg.bultoSize("sneakers")).toBe(12);
    expect(cfg.bultoSize(null)).toBe(12);
    expect(cfg.calcTotal([{ quantity: 2, unit_price: 10 }])).toBe(240);
    expect(cfg.calcTotal([])).toBe(0);
  });

  it("sin pre-orden, sin category lookup, sin fallback de piloto", () => {
    expect(cfg.itemsHasPreorder).toBe(false);
    expect(cfg.categoryLookup).toBeNull();
    expect(cfg.fallback).toBeNull();
    expect(cfg.ordersSelectExtra).toBe("");
    expect(cfg.sortEmailItems).toBeNull();
  });

  it("modelo Joybees: lista filtra deleted, roles sin 'cliente' legacy", () => {
    expect(cfg.listaFiltraDeleted).toBe(true);
    expect(cfg.createRoles).toEqual(["admin", "secretaria", "vendedor"]);
    expect(cfg.products.authStyle).toBe("roles-modulo");
    expect(cfg.products.editVerb).toBe("POST");
    expect(cfg.products.idField).toBe("sku");
    expect(cfg.products.hasDelete).toBe(false);
  });

  it("name editable SOLO en Tommy (nombre_manual)", () => {
    expect(cfg.products.nombreEditable).toBe(true);
    expect(MARCAS_CONFIG.reebok.products.nombreEditable).toBeUndefined();
    expect(MARCAS_CONFIG.joybees.products.nombreEditable).toBeUndefined();
    // el select del admin round-trip incluye la columna del flag
    expect(cfg.products.cols).toContain("nombre_manual");
  });
});

describe("MARCA_THEME.tommy — theme completo y coherente", () => {
  const t = MARCA_THEME.tommy;

  it("existe, está en MARCAS_UI y resuelve por getMarcaTheme", () => {
    expect(t).toBeTruthy();
    expect(getMarcaTheme("tommy")).toBe(t);
    expect(MARCAS_UI).toContain("tommy");
  });

  it("rutas de la marca (API + páginas + link público)", () => {
    expect(t.api).toBe("/api/catalogo/tommy");
    expect(t.catalogoHref).toBe("/catalogo/tommy");
    expect(t.pedidosHref).toBe("/catalogo/tommy/pedidos");
    expect(t.checkoutHref).toBe("/catalogo/tommy/checkout");
    expect(t.publicoShareUrl).toBe("https://www.fashiongr.com/catalogo-publico/tommy");
    expect(t.pedidoPublicoBase).toBe("/pedido-tommy");
    expect(t.itemsField).toBe("tommy_order_items");
  });

  it("features: grid PLANA, sin pre-orden, sin saleFilter, CON categoryChips", () => {
    expect(t.features).toEqual({
      preorder: false,
      saleFilter: false,
      agrupacionPorModelo: false,
      inventarioPorTalla: false,
      categoryChips: true,
      roleClienteGuard: false,
      navInicioRequiereRol: false,
    });
  });

  it("chips de filtros = slugs que escribe el sync (tommy-nombres)", () => {
    expect(t.filtros.genderOptions.map((o) => o.value)).toEqual([
      "", "women", "men", "boys", "girls",
    ]);
    expect(t.filtros.categoryOptions.map((o) => o.value)).toEqual([
      "", "sneakers", "flip_flops", "sandals", "shoes", "slippers", "boots",
    ]);
  });

  it("admin: estilo batch, nombre editable, sync manual catalogo-tommy", () => {
    expect(t.admin.productosStyle).toBe("batch");
    expect(t.admin.nombreEditable).toBe(true);
    expect(t.admin.importarTab).toBe(false);
    expect(t.admin.badgeEditable).toBe(false);
    expect(t.admin.productEdit).toEqual({ idField: "sku", verb: "POST" });
    expect(t.admin.syncModulo).toBe("catalogo-tommy");
    expect(t.admin.productsUrl).toBe("/api/catalogo/tommy/products");
  });

  it("las otras marcas NO tienen nombre editable en el admin", () => {
    expect(MARCA_THEME.reebok.admin.nombreEditable).toBe(false);
    expect(MARCA_THEME.joybees.admin.nombreEditable).toBe(false);
  });
});

describe("registro del cron tommy-catalogo en todos los sitios", () => {
  it("vercel.json: 2 slots (12:40 y 17:40 UTC)", () => {
    const vercel = JSON.parse(
      readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons: { path: string; schedule: string }[] };
    const tommy = vercel.crons.filter((c) => c.path === "/api/cron/tommy-catalogo");
    expect(tommy.map((c) => c.schedule).sort()).toEqual(["40 12 * * *", "40 17 * * *"]);
  });

  it("SWITCH_CRON_ENTRADAS: 1240 y 1740 sobre fashion_shoes", () => {
    const entradas = SWITCH_CRON_ENTRADAS.filter((e) => e.cron === "tommy-catalogo");
    expect(entradas.map((e) => e.hhmmUtc).sort()).toEqual(["1240", "1740"]);
    for (const e of entradas) expect(e.empresas).toEqual(["fashion_shoes"]);
  });

  it("recuperación colateral desde las 13 UTC + seed-tolerante en health", () => {
    expect(COLATERAL_RECOVER_AFTER_HOUR_UTC["tommy-catalogo"]).toBe(13);
    expect(SEED_TOLERANT_CRONS).toContain("tommy-catalogo");
  });

  it("sync manual: modulo catalogo-tommy con empresa fija y rol vendedor", () => {
    expect(SYNC_NOW_MODULOS).toContain("catalogo-tommy");
    const cfg = moduloConfig("catalogo-tommy");
    expect(cfg).toEqual({
      empresas: null,
      syncType: "catalogo_tommy",
      empresaFija: "fashion_shoes",
      tocaSwitch: true,
    });
    expect(rolesSyncNow("catalogo-tommy")).toContain("vendedor");
  });

  it("el route del cron existe", () => {
    expect(() =>
      readFileSync(path.join(process.cwd(), "src/app/api/cron/tommy-catalogo/route.ts"), "utf8"),
    ).not.toThrow();
  });
});
