// ─────────────────────────────────────────────────────────────────────────────
// Config Calvin Klein COMPLETA — cuarta marca sobre el motor de catálogos,
// espejo EXACTO de Tommy (patrón tommy-config.test.ts): fija el contrato de
// MARCAS_CONFIG.calvin + MARCA_THEME.calvin + el registro de su cron en TODOS
// los sitios (vercel.json, cron-telemetry, sync-now). Si algo de esto se
// rompe, la marca queda a medias sin que se note en runtime — que es
// exactamente lo que le pasó a Tommy con EMPRESAS_CATALOGO (6-ago-2026).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Clients Supabase eager de las libs importadas (cron-telemetry/sync-now):
// se mockean para que el import no exija env — acá solo se lee config.
vi.mock("@/lib/calvin-supabase-server", () => ({ calvinServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import { MARCAS_CONFIG, EMPRESAS_CATALOGO, getMarcaConfig } from "@/lib/catalogo/marcas";
import { MARCA_THEME, MARCAS_UI, getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import { SYNC_NOW_MODULOS, moduloConfig, rolesSyncNow } from "@/lib/switch-api/sync-now";
import { SYNC_LOG_TYPES } from "@/lib/switch-api/sync-log-tipos";
import { STORAGE_PREFIX } from "@/lib/catalogos/variantes-paths";
import {
  SWITCH_CRON_ENTRADAS,
  COLATERAL_RECOVER_AFTER_HOUR_UTC,
  CATALOGO_CRON_SLOTS_UTC,
  SEED_TOLERANT_CRONS,
  CRONS_FAIL_CLOSED,
  HEARTBEATS_NO_CRON,
} from "@/lib/cron-telemetry";

describe("MARCAS_CONFIG.calvin — modelo Tommy, tablas calvin_*", () => {
  const cfg = MARCAS_CONFIG.calvin;

  it("existe y resuelve por getMarcaConfig", () => {
    expect(cfg).toBeTruthy();
    expect(getMarcaConfig("calvin")).toBe(cfg);
    expect(getMarcaConfig("calvinx")).toBeNull();
  });

  it("empresa Switch vistana y numeración CKP- (PED/JBP/TOM ya están tomados)", () => {
    expect(cfg.empresaKey).toBe("vistana");
    expect(cfg.numeroPrefijo).toBe("CKP");
    expect(cfg.cronName).toBe("calvin-catalogo");
    expect(cfg.switchDirectorioLabel).toBe("Vistana International");
    // Ningún otro prefijo de numeración choca con CKP.
    const prefijos = Object.values(MARCAS_CONFIG).map((m) => m.numeroPrefijo);
    expect(new Set(prefijos).size).toBe(prefijos.length);
  });

  it("vistana entra DERIVADA en EMPRESAS_CATALOGO (la lección del 6-ago)", () => {
    expect(EMPRESAS_CATALOGO.has("vistana")).toBe(true);
  });

  it("todas las tablas/vistas/RPCs con prefijo calvin_", () => {
    expect(cfg.ordersTable).toBe("calvin_orders");
    expect(cfg.itemsRelation).toBe("calvin_order_items");
    expect(cfg.enviosTable).toBe("calvin_switch_envios");
    expect(cfg.productsTable).toBe("calvin_products");
    expect(cfg.publicosTable).toBe("calvin_pedidos_publicos");
    expect(cfg.unificadoView).toBe("calvin_pedidos_unificado_vw");
    expect(cfg.createOrderRpc).toBe("calvin_create_order");
    expect(cfg.replaceItemsRpc).toBe("calvin_order_replace_items");
    expect(cfg.convertRpc).toBe("convert_calvin_pedido_publico");
  });

  it("bulto por producto con DEFAULT 12 ('8 o 12 como tommy pero 12 por default')", () => {
    expect(cfg.bultoSize()).toBe(12);
    expect(cfg.bultoSize("sneakers")).toBe(12);
    expect(cfg.bultoSize(null, null)).toBe(12);
    expect(cfg.bultoSize(null, 8)).toBe(8);   // marcado a mano
    expect(cfg.bultoSize(null, 0)).toBe(12);  // inválido → default, nunca 0
    expect(cfg.calcTotal([{ quantity: 2, unit_price: 10 }])).toBe(240);
    expect(cfg.calcTotal([{ quantity: 2, unit_price: 10, bulto_pzas: 8 } as never])).toBe(160);
    expect(cfg.calcTotal([])).toBe(0);
  });

  it("sin pre-orden (solo Reebok), sin category lookup, sin fallback de piloto", () => {
    expect(cfg.itemsHasPreorder).toBe(false);
    expect(cfg.categoryLookup).toBeNull();
    expect(cfg.fallback).toBeNull();
    expect(cfg.ordersSelectExtra).toBe("");
    expect(cfg.sortEmailItems).toBeNull();
  });

  it("modelo Joybees/Tommy: lista filtra deleted, roles sin 'cliente' legacy", () => {
    expect(cfg.listaFiltraDeleted).toBe(true);
    expect(cfg.createRoles).toEqual(["admin", "secretaria", "vendedor"]);
    expect(cfg.products.authStyle).toBe("roles-modulo");
    expect(cfg.products.editVerb).toBe("POST");
    expect(cfg.products.idField).toBe("sku");
    expect(cfg.products.hasDelete).toBe(false);
  });

  it("name editable (nombre_manual) y bulto editable — mismo caso PVH que Tommy", () => {
    expect(cfg.products.nombreEditable).toBe(true);
    expect(cfg.products.bultoEditable).toBe(true);
    // el select del admin round-trip incluye las columnas de los dos flags
    expect(cfg.products.cols).toContain("nombre_manual");
    expect(cfg.products.cols).toContain("bulto_pzas");
    expect(cfg.publicCatalog.cols).toContain("bulto_pzas");
  });

  it("fotos al proyecto principal, carpeta calvin/ (portal B2B Dash de PVH)", () => {
    expect(cfg.upload.storage).toBe("main");
    expect(cfg.upload.pathPrefix).toBe(STORAGE_PREFIX.calvin);
    expect(STORAGE_PREFIX.calvin).toBe("calvin");
  });
});

describe("MARCA_THEME.calvin — blanco/negro minimalista, completo y coherente", () => {
  const t = MARCA_THEME.calvin;

  it("existe, está en MARCAS_UI y resuelve por getMarcaTheme", () => {
    expect(t).toBeTruthy();
    expect(getMarcaTheme("calvin")).toBe(t);
    expect(MARCAS_UI).toContain("calvin");
  });

  it("rutas de la marca (API + páginas + link público)", () => {
    expect(t.api).toBe("/api/catalogo/calvin");
    expect(t.catalogoHref).toBe("/catalogo/calvin");
    expect(t.pedidosHref).toBe("/catalogo/calvin/pedidos");
    expect(t.checkoutHref).toBe("/catalogo/calvin/checkout");
    expect(t.publicoShareUrl).toBe("https://www.fashiongr.com/catalogo-publico/calvin");
    expect(t.pedidoPublicoBase).toBe("/pedido-calvin");
    expect(t.itemsField).toBe("calvin_order_items");
  });

  it("features: paridad Tommy — grid PLANA, categoryChips, filtroBultos y filtroPrecio", () => {
    expect(t.features).toEqual({
      preorder: false,
      saleFilter: false,
      agrupacionPorModelo: false,
      inventarioPorTalla: false,
      categoryChips: true,
      filtroBultos: true,
      filtroPrecio: true,
      roleClienteGuard: false,
      navInicioRequiereRol: false,
    });
  });

  it("chips de filtros: género = los 4 slugs de Switch; categorías = slugs del sync", () => {
    expect(t.filtros.genderOptions).toEqual([
      { value: "", label: "Todos" },
      { value: "women", label: "Women" },
      { value: "men", label: "Men" },
      { value: "boys", label: "Boys" },
      { value: "girls", label: "Girls" },
    ]);
    expect(t.filtros.categoryOptions).toEqual([
      { value: "", label: "Todos" },
      { value: "sneakers", label: "Sneakers" },
      { value: "flip_flops", label: "Flip Flops" },
      { value: "sandals", label: "Sandals" },
      { value: "shoes", label: "Shoes" },
      { value: "slippers", label: "Slippers" },
      { value: "boots", label: "Boots" },
    ]);
  });

  it("los slugs de género de calvin_products caen en su propio chip", () => {
    for (const g of ["women", "men", "boys", "girls"]) {
      expect(t.genero.match(g, g)).toBe(true);
      expect(t.genero.match(g, "")).toBe(true); // "Todos"
      for (const otro of ["women", "men", "boys", "girls"].filter((x) => x !== g)) {
        expect(t.genero.match(g, otro)).toBe(false);
      }
    }
  });

  it("secciones del PDF: los 4 géneros + catch-all, en orden", () => {
    expect(t.genero.pdfSections.map((s) => s.key)).toEqual([
      "women", "men", "boys", "girls", "otros",
    ]);
  });

  it("bulto del theme = el del server (default 12, marcado a mano gana)", () => {
    expect(t.bulto()).toBe(12);
    expect(t.bulto(null, 8)).toBe(8);
    expect(t.calcTotal([{ quantity: 1, unit_price: 20, bulto_pzas: 8 }])).toBe(160);
  });

  it("admin: estilo batch, nombre y bulto editables, sync manual catalogo-calvin", () => {
    expect(t.admin.productosStyle).toBe("batch");
    expect(t.admin.nombreEditable).toBe(true);
    expect(t.admin.bultoEditable).toBe(true);
    expect(t.admin.importarTab).toBe(false);
    expect(t.admin.badgeEditable).toBe(false);
    expect(t.admin.productEdit).toEqual({ idField: "sku", verb: "POST" });
    expect(t.admin.syncModulo).toBe("catalogo-calvin");
    expect(t.admin.productsUrl).toBe("/api/catalogo/calvin/products");
  });

  it("blanco/negro minimalista: ningún color de otra marca en el theme", () => {
    // Los hex de Reebok (#E4002B/#1A2656), Joybees (#FFE443/#404041) y Tommy
    // (#152342/#AE0029) no pueden colarse en el theme de Calvin.
    const src = readFileSync(path.join(process.cwd(), "src/lib/catalogo/marcas-ui.tsx"), "utf8");
    const calvin = src.slice(src.indexOf("const CALVIN: MarcaTheme"), src.indexOf("// \"hace X\" relativo"));
    for (const hexAjeno of ["E4002B", "1A2656", "FFE443", "404041", "152342", "AE0029"]) {
      expect(calvin).not.toContain(hexAjeno);
    }
  });
});

describe("registro del cron calvin-catalogo en todos los sitios", () => {
  it("vercel.json: 4 slots (14:35, 17:05, 19:45 y 22:00 UTC)", () => {
    // 13-ago-2026: los pases se mudaron DENTRO de la ventana de uso de Panamá
    // (9:35 a.m. - 5:00 p.m. para Calvin) y pasaron de 2 a 4.
    const vercel = JSON.parse(
      readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons: { path: string; schedule: string }[] };
    const calvin = vercel.crons.filter((c) => c.path === "/api/cron/calvin-catalogo");
    expect(calvin.map((c) => c.schedule).sort()).toEqual([
      "0 22 * * *",
      "35 14 * * *",
      "45 19 * * *",
      "5 17 * * *",
    ]);
  });

  it("SWITCH_CRON_ENTRADAS: 1435, 1705, 1945 y 2200 sobre vistana", () => {
    const entradas = SWITCH_CRON_ENTRADAS.filter((e) => e.cron === "calvin-catalogo");
    expect(entradas.map((e) => e.hhmmUtc).sort()).toEqual(["1435", "1705", "1945", "2200"]);
    for (const e of entradas) expect(e.empresas).toEqual(["vistana"]);
  });

  it("CATALOGO_CRON_SLOTS_UTC espeja vercel.json (ciclo del colateral)", () => {
    expect(CATALOGO_CRON_SLOTS_UTC["calvin-catalogo"]).toEqual(["14:35", "17:05", "19:45", "22:00"]);
  });

  it("recuperación colateral desde las 15 UTC + vigilancia seed-tolerante", () => {
    // 13 → 15: su primer slot del día (14:35) cae DESPUÉS de la pasada de las
    // 14:00, así que solo la de las 18:00 puede recuperarlo.
    expect(COLATERAL_RECOVER_AFTER_HOUR_UTC["calvin-catalogo"]).toBe(15);
    // Seed-tolerante MIENTRAS la DDL 20260812150000 no corra y el heartbeat no
    // lleve días sembrado — el mismo camino que recorrió Tommy antes de su
    // promoción a fail-closed. Estar en las DOS listas rompería la biyección
    // del registro (cron-registro.test.ts); no estar en ninguna lo dejaría
    // invisible para los vigías.
    expect(SEED_TOLERANT_CRONS).toContain("calvin-catalogo");
    expect(CRONS_FAIL_CLOSED).not.toContain("calvin-catalogo");
  });

  it("la marca de agua de fotos nuevas está registrada como no-cron", () => {
    expect(HEARTBEATS_NO_CRON).toContain("catalogos-fotos-nuevos:calvin");
  });

  it("sync manual: modulo catalogo-calvin con empresa fija y rol vendedor", () => {
    expect(SYNC_NOW_MODULOS).toContain("catalogo-calvin");
    const cfg = moduloConfig("catalogo-calvin");
    expect(cfg).toEqual({
      empresas: null,
      syncType: "catalogo_calvin",
      empresaFija: "vistana",
      tocaSwitch: true,
    });
    expect(rolesSyncNow("catalogo-calvin")).toContain("vendedor");
  });

  it("el sync_type catalogo_calvin está en SYNC_LOG_TYPES (candado del CHECK)", () => {
    // Sin esto el logger es degradable y la corrida queda INVISIBLE — la
    // lección de catalogo_tommy y articulo_marca. La igualdad con el CHECK del
    // SQL la exige sync-log-tipos-check.test.ts.
    expect(SYNC_LOG_TYPES).toContain("catalogo_calvin");
  });

  it("el route del cron existe", () => {
    expect(() =>
      readFileSync(path.join(process.cwd(), "src/app/api/cron/calvin-catalogo/route.ts"), "utf8"),
    ).not.toThrow();
  });

  it("la página del pedido público existe (/pedido-calvin/[id])", () => {
    const page = readFileSync(
      path.join(process.cwd(), "src/app/pedido-calvin/[id]/page.tsx"),
      "utf8",
    );
    expect(page).toContain('<PedidoPublicoClient marca="calvin" />');
    expect(page).toContain('metadataPedidoPublico("calvin"');
  });
});
