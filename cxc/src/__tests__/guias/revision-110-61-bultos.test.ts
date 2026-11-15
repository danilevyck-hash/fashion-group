// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — Revisión 110 · 61 (14-nov-2026): los bultos se cambian en el
// pedido Preparado sin mover estado ni firma, solo bodega y admin (lo decide el
// SERVIDOR), de 1 a 9999; y las unidades se leen ENTERAS (db-max-rows = 1000
// cortaba 8.113 líneas a 1.000: «12 unidades» en un pedido de 665).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  columnasSoloBultos,
  notaBultosDelPedido,
  puedeCambiarBultos,
  referenciaDePedido,
} from "@/lib/ui/revision-110-61";

// ── Supabase falso: cada `.from(tabla)` es una cadena que anota lo que se le pide.
type Llamada = { tabla: string; metodo: string; args: unknown[] };
const llamadas: Llamada[] = [];
let respuestas: Record<string, (c: Llamada[]) => { data: unknown; error: unknown; count?: number | null }> = {};

function cadena(tabla: string) {
  const propias: Llamada[] = [];
  const resolver = () => (respuestas[tabla] ?? (() => ({ data: null, error: null })))(propias);
  const obj: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit", "update", "upsert", "range", "maybeSingle"]) {
    obj[m] = (...args: unknown[]) => {
      const l = { tabla, metodo: m, args };
      propias.push(l);
      llamadas.push(l);
      return obj;
    };
  }
  obj.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, ko);
  return obj;
}

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: (t: string) => cadena(t) } }));
const logActivity = vi.fn(async () => undefined);
vi.mock("@/lib/log-activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...(a as [])) }));
let sesion = { role: "bodega", userName: "julio", userId: "u1" };
vi.mock("@/lib/requireRole", () => ({
  requireRole: (_req: unknown, roles: string[]) =>
    sesion.role === "admin" || roles.includes(sesion.role) ? sesion : NextResponse.json({ error: "No autorizado" }, { status: 403 }),
}));

const patch = (body: Record<string, unknown>) =>
  new NextRequest("https://www.fashiongr.com/api/guias/pedidos", { method: "PATCH", body: JSON.stringify(body) });

/** Un pedido de Fashion Shoes en `estado`, con 23 bultos anotados. */
function escenario(estado: string, facturas: number = 0) {
  respuestas = {
    switch_pedidos: () => ({ data: { empresa_key: "fashion_shoes" }, error: null }),
    pedidos_bodega_estado: (c) =>
      c.some((l) => l.metodo === "update")
        ? { data: [{ bultos: 7 }], error: null }
        : {
            data: { empresa_key: "fashion_shoes", pedido_switch_id: 2179, estado, bultos: 23, preparado_por: "julio", preparado_en: "2026-11-12T21:00:00Z" },
            error: null,
          },
    switch_facturas: () => ({
      data: Array.from({ length: facturas }, () => ({ empresa_key: "fashion_shoes", pedido_referencia: referenciaDePedido(2179) })),
      error: null,
    }),
  };
}

beforeEach(() => {
  llamadas.length = 0;
  logActivity.mockClear();
  sesion = { role: "bodega", userName: "julio", userId: "u1" };
});

describe("la regla, pura", () => {
  it("solo bodega y admin", () => {
    for (const r of ["secretaria", "vendedor", "contabilidad", "gerente_boston"]) {
      expect(puedeCambiarBultos(r, "preparado", false, 5)).toMatchObject({ ok: false, status: 403 });
    }
    expect(puedeCambiarBultos("bodega", "preparado", false, 5)).toEqual({ ok: true, bultos: 5 });
    expect(puedeCambiarBultos("admin", "preparado", false, "12")).toEqual({ ok: true, bultos: 12 });
  });

  it("de 1 a 9999, entero", () => {
    for (const malo of [0, -1, 10000, 1.5, "abc", "", null, undefined]) {
      expect(puedeCambiarBultos("bodega", "preparado", false, malo)).toMatchObject({ ok: false, status: 400 });
    }
    expect(puedeCambiarBultos("bodega", "preparado", false, 1).ok).toBe(true);
    expect(puedeCambiarBultos("bodega", "preparado", false, 9999).ok).toBe(true);
  });

  it("Preparado sí; Recibido solo sin factura; lo demás no", () => {
    expect(puedeCambiarBultos("bodega", "recibido", false, 3).ok).toBe(true);
    expect(puedeCambiarBultos("bodega", "recibido", true, 3)).toMatchObject({ ok: false, status: 409 });
    for (const e of ["pendiente", "en_preparacion", null]) {
      expect(puedeCambiarBultos("bodega", e, false, 3)).toMatchObject({ ok: false, status: 409 });
    }
  });

  it("lo que se escribe es SOLO el número: ni estado, ni firma, ni hora", () => {
    expect(columnasSoloBultos(7)).toEqual({ bultos: 7 });
  });

  it("la nota de Etiquetas: un pedido en una factura, o partido en varias", () => {
    expect(notaBultosDelPedido("16-000002387", 3, 1)).toEqual({ nota: "del pedido N.º 16-000002387", ponerEnElCampo: true });
    const partido = notaBultosDelPedido("16-000002387", 26, 2);
    expect(partido.ponerEnElCampo).toBe(false);
    expect(partido.nota).toContain("26 bultos en total");
    expect(referenciaDePedido(2387)).toBe("16-000002387");
  });
});

describe("el servidor", () => {
  it("la secretaria pasa la puerta del PATCH pero NO cambia bultos (403) y no se escribe nada", async () => {
    sesion = { role: "secretaria", userName: "ana", userId: "u2" };
    escenario("preparado");
    const { PATCH } = await import("@/app/api/guias/pedidos/route");
    const r = await PATCH(patch({ empresa_key: "fashion_shoes", pedido_switch_id: 2179, solo_bultos: true, bultos: 7 }));
    expect(r.status).toBe(403);
    expect(llamadas.some((l) => l.metodo === "update" || l.metodo === "upsert")).toBe(false);
  });

  it("un número fuera de 1–9999 → 400 sin escribir", async () => {
    escenario("preparado");
    const { PATCH } = await import("@/app/api/guias/pedidos/route");
    const r = await PATCH(patch({ empresa_key: "fashion_shoes", pedido_switch_id: 2179, solo_bultos: true, bultos: 10000 }));
    expect(r.status).toBe(400);
    expect(llamadas.some((l) => l.metodo === "update")).toBe(false);
  });

  it("bodega cambia 23 → 7: escribe SOLO `bultos`, con el estado de candado, y deja rastro", async () => {
    escenario("preparado");
    const { PATCH } = await import("@/app/api/guias/pedidos/route");
    const r = await PATCH(patch({ empresa_key: "fashion_shoes", pedido_switch_id: 2179, solo_bultos: true, bultos: 7 }));
    expect(r.status).toBe(200);
    const update = llamadas.find((l) => l.tabla === "pedidos_bodega_estado" && l.metodo === "update")!;
    expect(update.args[0]).toEqual({ bultos: 7 });
    expect(llamadas.some((l) => l.metodo === "upsert")).toBe(false);
    expect(llamadas).toContainEqual({ tabla: "pedidos_bodega_estado", metodo: "eq", args: ["estado", "preparado"] });
    expect(logActivity).toHaveBeenCalledWith(
      "bodega",
      "cambiar_bultos",
      "pedidos_bodega_estado",
      expect.objectContaining({ antes: 23, despues: 7, estado: "preparado", por: "julio" }),
      "julio",
    );
  });

  it("Recibido con factura → 409; sin factura → se cambia", async () => {
    const { PATCH } = await import("@/app/api/guias/pedidos/route");
    escenario("recibido", 1);
    expect((await PATCH(patch({ empresa_key: "fashion_shoes", pedido_switch_id: 2179, solo_bultos: true, bultos: 7 }))).status).toBe(409);
    escenario("recibido", 0);
    expect((await PATCH(patch({ empresa_key: "fashion_shoes", pedido_switch_id: 2179, solo_bultos: true, bultos: 7 }))).status).toBe(200);
  });

  it("En preparación → 409 (los bultos se ponen al marcar Preparado)", async () => {
    escenario("en_preparacion");
    const { PATCH } = await import("@/app/api/guias/pedidos/route");
    expect((await PATCH(patch({ empresa_key: "fashion_shoes", pedido_switch_id: 2179, solo_bultos: true, bultos: 7 }))).status).toBe(409);
  });
});

describe("🩸 las unidades se leen enteras (db-max-rows = 1000)", () => {
  it("2.500 líneas en 3 páginas: el pedido suma TODAS sus unidades", async () => {
    // 2.500 líneas de un solo pedido, 1 unidad cada una, y una de 165: 2.664.
    const lineas = Array.from({ length: 2500 }, (_, i) => ({
      empresa_key: "vistana", pedido_switch_id: 2387, codigo_barra_id: i, cantidad: i === 0 ? 165 : 1,
    }));
    respuestas = {
      pedidos_lineas: (c) => {
        const rango = c.find((l) => l.metodo === "range")?.args as [number, number];
        // El servidor real corta en 1.000 aunque se pida más.
        const desde = rango[0];
        const hasta = Math.min(rango[1], desde + 999);
        return { data: lineas.slice(desde, hasta + 1), error: null, count: lineas.length };
      },
      pedidos_linea_bulto: () => ({ data: [], error: null, count: 0 }),
    };
    const { leerAsignacion } = await import("@/lib/guias/pedido-detalle-server");
    const m = await leerAsignacion(["vistana"]);
    expect(m.get("vistana:2387")).toEqual({ articulos: 2500, sinBulto: 2500, piezas: 2664 });
    // Orden estable por la llave primaria en cada página.
    const ordenes = llamadas.filter((l) => l.tabla === "pedidos_lineas" && l.metodo === "order").map((l) => l.args[0]);
    expect(ordenes.slice(0, 3)).toEqual(["empresa_key", "pedido_switch_id", "codigo_barra_id"]);
  });
});
