/**
 * CANDADO — la migración que borra los pedidos de prueba no puede llevarse por
 * delante un pedido que llegó a Switch.
 *
 * Daniel: *«borro de verdad de la base»*. Son 16 de Calvin y 37 de Joybees,
 * todos ya `deleted = true`, todos `borrador`, de las corridas de verificación
 * del 12-13 de agosto (más dos del bot del 24-jul). Es un borrado REAL y no se
 * deshace, así que la migración tiene que traer sus frenos adentro:
 *
 *   1. 🔴 Lista EXPLÍCITA de ids. Nada de `LIKE '%PRUEBA%'`, que mañana
 *      engancharía un pedido de verdad de un cliente que se llame así.
 *   2. 🔴 El que tenga un ENVÍO VIVO a Switch (`estado <> 'error'`) se saca de
 *      la lista y no se toca: ese pedido guarda lo que Switch no tiene (quién
 *      lo armó, el comentario, si fue pedido o cotización, el PDF).
 *   3. El segundo freno: solo se borra lo que está `deleted IS TRUE`.
 *   4. Los renglones (`<marca>_order_items`) se borran explícitamente.
 *   5. Todo o nada (`BEGIN`/`COMMIT`), y no toca ninguna otra tabla.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RUTA = path.join(
  process.cwd(),
  "supabase/migrations/20260924120000_borrar_pedidos_de_prueba.sql",
);
const SQL = fs.readFileSync(RUTA, "utf8");
/** Sin comentarios: el que explica la regla CITA lo que la regla prohíbe. */
const CUERPO = SQL.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

const MARCAS = ["calvin", "joybees"] as const;
/** Lo medido contra producción el 4-sep-2026. */
const ESPERADOS: Record<(typeof MARCAS)[number], number> = { calvin: 16, joybees: 37 };

describe("la migración existe y es todo-o-nada", () => {
  it("va envuelta en una transacción", () => {
    expect(CUERPO).toMatch(/^\s*BEGIN;/m);
    expect(CUERPO).toMatch(/COMMIT;\s*$/);
  });

  it("no toca ninguna tabla que no sea de estas dos marcas", () => {
    const tablas = [...CUERPO.matchAll(/(?:DELETE\s+FROM|INSERT\s+INTO|UPDATE)\s+([a-z_]+)/gi)].map(
      (m) => m[1].toLowerCase(),
    );
    const permitidas = new Set([
      "_calvin_prueba", "calvin_order_items", "calvin_orders",
      "_joybees_prueba", "joybees_order_items", "joybees_orders",
    ]);
    expect(tablas.filter((t) => !permitidas.has(t))).toEqual([]);
  });

  it("🔴 no borra NADA de las otras dos marcas ni de los pedidos del link", () => {
    for (const prohibida of ["reebok_", "tommy_", "pedidos_publicos", "switch_envios e\n"]) {
      expect(
        new RegExp(`DELETE\\s+FROM\\s+[a-z_]*${prohibida}`, "i").test(CUERPO),
        `no puede borrar de ${prohibida}`,
      ).toBe(false);
    }
  });
});

describe.each(MARCAS)("%s — los frenos están adentro", (marca) => {
  it("la lista es EXPLÍCITA de ids, y son los que se midieron", () => {
    const bloque = CUERPO.slice(CUERPO.indexOf(`_${marca}_prueba (id) VALUES`));
    const hasta = bloque.indexOf(";");
    const ids = [...bloque.slice(0, hasta).matchAll(/'[0-9a-f-]{36}'::uuid/g)];
    expect(ids).toHaveLength(ESPERADOS[marca]);
    expect(new Set(ids.map((m) => m[0])).size).toBe(ESPERADOS[marca]); // sin repetidos
  });

  it("🔴 nada de `LIKE`, ni rangos de fecha, ni `WHERE vendor_name`", () => {
    // Un criterio "inteligente" engancha mañana un pedido de verdad.
    expect(CUERPO).not.toMatch(new RegExp(`${marca}_orders[\\s\\S]{0,200}LIKE`, "i"));
    expect(CUERPO).not.toMatch(new RegExp(`${marca}_orders[\\s\\S]{0,200}client_name`, "i"));
    expect(CUERPO).not.toMatch(new RegExp(`${marca}_orders[\\s\\S]{0,200}vendor_name`, "i"));
    expect(CUERPO).not.toMatch(new RegExp(`${marca}_orders[\\s\\S]{0,200}created_at`, "i"));
  });

  it("🔴 el que tiene un envío VIVO a Switch se saca de la lista antes de borrar", () => {
    // Éste es el freno que importa: sin él, un pedido que llegó al ERP se
    // borraría con su comentario, su PDF y quién lo armó.
    const guard = new RegExp(
      `DELETE\\s+FROM\\s+_${marca}_prueba\\s+p\\s+WHERE\\s+EXISTS\\s*\\(\\s*SELECT\\s+1\\s+FROM\\s+${marca}_switch_envios\\s+e\\s+WHERE\\s+e\\.order_id\\s*=\\s*p\\.id\\s+AND\\s+e\\.estado\\s*<>\\s*'error'`,
      "i",
    );
    expect(guard.test(CUERPO.replace(/\s+/g, " "))).toBe(true);
  });

  it("el filtro del envío corre ANTES de los dos DELETE de verdad", () => {
    const iGuard = CUERPO.indexOf(`DELETE FROM _${marca}_prueba`);
    const iItems = CUERPO.indexOf(`DELETE FROM ${marca}_order_items`);
    const iOrders = CUERPO.indexOf(`DELETE FROM ${marca}_orders`);
    expect(iGuard).toBeGreaterThan(-1);
    expect(iGuard).toBeLessThan(iItems);
    expect(iItems).toBeLessThan(iOrders);
  });

  it("los renglones se borran explícitamente, no solo por CASCADE", () => {
    expect(CUERPO).toContain(`DELETE FROM ${marca}_order_items i`);
    expect(CUERPO).toContain(`WHERE i.order_id IN (SELECT id FROM _${marca}_prueba)`);
  });

  it("🔴 el segundo freno: solo se borra lo que ya estaba borrado suave", () => {
    const bloque = CUERPO.slice(CUERPO.indexOf(`DELETE FROM ${marca}_orders o`));
    expect(bloque.slice(0, 200)).toContain("AND o.deleted IS TRUE");
  });
});
