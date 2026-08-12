// ─────────────────────────────────────────────────────────────────────────────
// Paridad catálogos — SNAPSHOT de la superficie API por marca.
//
// PR-1 (rutas dinámicas [marca]): el núcleo compartido vive UNA sola vez bajo
// /api/catalogo/[marca]/** y resuelve la marca desde MARCAS_CONFIG; las rutas
// EXCLUSIVAS de una marca siguen como rutas estáticas bajo su directorio.
// Los paths públicos NO cambiaron: /api/catalogo/reebok/... y
// /api/catalogo/joybees/... resuelven vía el segmento dinámico.
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

// Núcleo COMPARTIDO generalizado a [marca] — un solo route.ts por endpoint,
// dirigido por MARCAS_CONFIG. Misma lista que el CORE_COMPARTIDO de PR-0.
const CORE_MARCA = [
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
  // Permiso 0001 de Switch (cambiar precio) — se consulta al EDITAR el precio,
  // no al final del envío (toque único, 12-ago-2026). Solo lectura.
  "permiso-precio",
  "products",
  // Selector de foto por variantes + subida del ZIP del banco B2B (25-jul-2026).
  "products/variantes",
  "products/variantes/firmar",
  "products/variantes/manifiesto",
  "public",
  "send-order",
  "sync-status",
  "upload",
].sort();

// Rutas EXCLUSIVAS de una marca — siguen estáticas bajo su directorio (el
// snapshot de PR-0 las esperaba ahí y el PR-1 no las generaliza).
const SOLO_REEBOK = ["inventory", "inventory/bulk", "pedidos-publicos", "stats"].sort();
const SOLO_JOYBEES = ["import", "seed"].sort();

describe("superficie API de catálogos — snapshot post-refactor [marca]", () => {
  it("[marca] expone exactamente el núcleo compartido", () => {
    expect(collectRoutes(path.join(API_BASE, "[marca]"))).toEqual(CORE_MARCA);
  });

  it("reebok conserva SOLO sus rutas exclusivas como estáticas", () => {
    expect(collectRoutes(path.join(API_BASE, "reebok"))).toEqual(SOLO_REEBOK);
  });

  it("joybees conserva SOLO sus rutas exclusivas como estáticas", () => {
    expect(collectRoutes(path.join(API_BASE, "joybees"))).toEqual(SOLO_JOYBEES);
  });

  it("ninguna ruta del núcleo quedó duplicada como estática (conflicto de routing)", () => {
    const reebok = new Set(collectRoutes(path.join(API_BASE, "reebok")));
    const joybees = new Set(collectRoutes(path.join(API_BASE, "joybees")));
    for (const ruta of CORE_MARCA) {
      expect(reebok.has(ruta), `duplicada en reebok: ${ruta}`).toBe(false);
      expect(joybees.has(ruta), `duplicada en joybees: ${ruta}`).toBe(false);
    }
  });

  it("los crons de catálogo por marca existen", () => {
    const cronBase = path.join(process.cwd(), "src/app/api/cron");
    expect(statSync(path.join(cronBase, "reebok-catalogo/route.ts")).isFile()).toBe(true);
    expect(statSync(path.join(cronBase, "joybees-catalogo/route.ts")).isFile()).toBe(true);
    expect(statSync(path.join(cronBase, "tommy-catalogo/route.ts")).isFile()).toBe(true);
  });
});
