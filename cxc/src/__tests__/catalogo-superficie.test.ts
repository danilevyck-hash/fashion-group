// ─────────────────────────────────────────────────────────────────────────────
// PR-0 paridad catálogos — SNAPSHOT de la superficie API por marca.
//
// Enumera los route.ts existentes bajo /api/catalogo/{reebok,joybees} y los
// compara contra la lista FIJA del estado pre-refactor. Si el refactor a rutas
// dinámicas [marca] pierde o renombra una ruta sin querer, este test lo grita.
//
// Si una ruta se elimina/renombra A PROPÓSITO, actualizar la lista aquí en el
// MISMO PR con la justificación en la descripción.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "fs";
import path from "path";

function collectRoutes(base: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "route.ts") out.push(path.relative(base, path.dirname(full)) || ".");
    }
  };
  walk(base);
  return out.sort();
}

const API_BASE = path.join(process.cwd(), "src/app/api/catalogo");

// Estado ACTUAL (jul-2026, pre-refactor). Rutas relativas a /api/catalogo/<marca>.
const REEBOK_ROUTES = [
  "clientes-search",
  "clientes-switch",
  "inventory",
  "inventory/bulk",
  "orders",
  "orders/[id]",
  "orders/[id]/duplicar",
  "orders/[id]/enviar-switch",
  "orders/[id]/item",
  "orders/[id]/pdf",
  "orders/bulk-delete",
  "pedido-publico",
  "pedido-publico/[id]",
  "pedido-publico/[id]/confirmar",
  "pedidos-export",
  "pedidos-publicos",
  "pedidos-publicos/[short_id]",
  "pedidos-publicos/[short_id]/convertir",
  "pedidos-unificado",
  "products",
  "public",
  "send-order",
  "stats",
  "sync-status",
  "upload",
].sort();

const JOYBEES_ROUTES = [
  "clientes-search",
  "clientes-switch",
  "import",
  "orders",
  "orders/[id]",
  "orders/[id]/duplicar",
  "orders/[id]/enviar-switch",
  "orders/[id]/item",
  "orders/[id]/pdf",
  "orders/bulk-delete",
  "pedido-publico",
  "pedido-publico/[id]",
  "pedido-publico/[id]/confirmar",
  "pedidos-export",
  "pedidos-publicos/[short_id]",
  "pedidos-publicos/[short_id]/convertir",
  "pedidos-unificado",
  "products",
  "public",
  "seed",
  "send-order",
  "sync-status",
  "upload",
].sort();

// Núcleo COMPARTIDO que el refactor generaliza a [marca] — debe existir en
// AMBAS marcas antes y después.
const CORE_COMPARTIDO = [
  "clientes-search",
  "clientes-switch",
  "orders",
  "orders/[id]",
  "orders/[id]/duplicar",
  "orders/[id]/enviar-switch",
  "orders/[id]/item",
  "orders/[id]/pdf",
  "orders/bulk-delete",
  "pedido-publico",
  "pedido-publico/[id]",
  "pedido-publico/[id]/confirmar",
  "pedidos-export",
  "pedidos-publicos/[short_id]",
  "pedidos-publicos/[short_id]/convertir",
  "pedidos-unificado",
  "products",
  "public",
  "send-order",
  "sync-status",
  "upload",
];

describe("superficie API de catálogos — snapshot pre-refactor", () => {
  it("reebok expone exactamente sus rutas conocidas", () => {
    expect(collectRoutes(path.join(API_BASE, "reebok"))).toEqual(REEBOK_ROUTES);
  });

  it("joybees expone exactamente sus rutas conocidas", () => {
    expect(collectRoutes(path.join(API_BASE, "joybees"))).toEqual(JOYBEES_ROUTES);
  });

  it("el núcleo compartido existe en AMBAS marcas (lo que el refactor generaliza)", () => {
    const reebok = new Set(collectRoutes(path.join(API_BASE, "reebok")));
    const joybees = new Set(collectRoutes(path.join(API_BASE, "joybees")));
    for (const ruta of CORE_COMPARTIDO) {
      expect(reebok.has(ruta), `falta en reebok: ${ruta}`).toBe(true);
      expect(joybees.has(ruta), `falta en joybees: ${ruta}`).toBe(true);
    }
  });

  it("diferencias conocidas entre marcas (solo-Reebok / solo-Joybees)", () => {
    const reebok = new Set(collectRoutes(path.join(API_BASE, "reebok")));
    const joybees = new Set(collectRoutes(path.join(API_BASE, "joybees")));
    const soloReebok = [...reebok].filter((r) => !joybees.has(r)).sort();
    const soloJoybees = [...joybees].filter((r) => !reebok.has(r)).sort();
    // inventory/stats/pedidos-publicos(lista) son solo-Reebok hoy;
    // import/seed son solo-Joybees. Cambios aquí = decisión consciente.
    expect(soloReebok).toEqual(["inventory", "inventory/bulk", "pedidos-publicos", "stats"]);
    expect(soloJoybees).toEqual(["import", "seed"]);
  });

  it("los crons de catálogo por marca existen", () => {
    const cronBase = path.join(process.cwd(), "src/app/api/cron");
    expect(statSync(path.join(cronBase, "reebok-catalogo/route.ts")).isFile()).toBe(true);
    expect(statSync(path.join(cronBase, "joybees-catalogo/route.ts")).isFile()).toBe(true);
  });
});
