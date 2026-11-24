// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — Despachos › Pedidos (24-nov-2026): conteos en las pestañas para
// TODOS, y la plata (subtotal sin ITBMS) SOLO para `daniel`, decidida en el
// SERVIDOR. Si a otra sesión le viaja `monto`, esto se pone rojo.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  conteosPorEstado,
  lineaDeResumen,
  lineaMasViejo,
  montoDelPedido,
  USUARIOS_VEN_MONTOS,
} from "@/lib/ui/pedidos-conteos-2026-11";
import { fechaDeAntiguedad, haceDiasCorto, lineaDeLaPestana, ordenarPedidos } from "@/lib/guias/pedidos-bodega";

// ── Supabase falso para el GET de la ruta.
const PEDIDOS = [
  { empresa_key: "fashion_shoes", pedido_switch_id: 2234, secuencial: "16-000002234", fecha: "2026-11-23T15:00:00Z", cliente_codigo: "D-1", cliente_nombre: "City Moda Chorrera", vendedor_nombre: "REYNALDO", synced_at: "2026-11-24T15:00:00Z", subtotal: 4044.1 },
  { empresa_key: "vistana", pedido_switch_id: 2483, secuencial: "16-000002483", fecha: "2026-11-21T21:18:46Z", cliente_codigo: "D-2", cliente_nombre: "Golden Mall", vendedor_nombre: "EDWIN", synced_at: "2026-11-24T15:00:00Z", subtotal: 10152 },
];
function cadena(tabla: string) {
  const obj: Record<string, unknown> = {};
  let empresas: string[] | null = null;
  for (const m of ["select", "eq", "order", "limit", "range", "maybeSingle", "is", "or", "gte", "not"]) obj[m] = () => obj;
  obj.in = (col: string, vals: string[]) => { if (col === "empresa_key") empresas = vals; return obj; };
  obj.then = (ok: (v: unknown) => unknown) =>
    Promise.resolve(
      tabla === "switch_pedidos"
        ? { data: PEDIDOS.filter((p) => !empresas || empresas.includes(p.empresa_key)), error: null }
        : { data: [], error: null, count: 0 },
    ).then(ok);
  return obj;
}
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: (t: string) => cadena(t) } }));
let sesion = { role: "admin", userName: "daniel", userId: "u1" };
vi.mock("@/lib/requireRole", () => ({
  requireRole: (_req: unknown, roles: string[]) =>
    sesion.role === "admin" || roles.includes(sesion.role) ? sesion : NextResponse.json({ error: "No autorizado" }, { status: 403 }),
}));

async function pedir(role: string, userName: string) {
  sesion = { role, userName, userId: "u1" };
  const { GET } = await import("@/app/api/guias/pedidos/route");
  const r = await GET(new NextRequest("https://www.fashiongr.com/api/guias/pedidos"));
  return (await r.json()) as { pedidos: Record<string, unknown>[] };
}

describe("Pedidos — montos solo para daniel, en el SERVIDOR", () => {
  it("la lista de quién ve montos es SOLO daniel", () => {
    expect(USUARIOS_VEN_MONTOS).toEqual(["daniel"]);
  });

  it("daniel recibe el subtotal sin ITBMS", async () => {
    const d = await pedir("admin", "daniel");
    expect(d.pedidos.map((p) => p.monto).sort()).toEqual([10152, 4044.1].sort());
  });

  for (const [role, user] of [["admin", "alberto"], ["bodega", "julio"], ["bodega", "jorman"], ["secretaria", "angela"], ["vendedor", "rey"]] as const) {
    it(`a ${user} (${role}) no le viaja ningún monto`, async () => {
      const d = await pedir(role, user);
      expect(d.pedidos.length).toBeGreaterThan(0);
      for (const p of d.pedidos) {
        expect(p).not.toHaveProperty("monto");
        expect(p).not.toHaveProperty("subtotal");
        expect(p).not.toHaveProperty("total");
      }
    });
  }

  it("Jorman solo recibe Vistana (los conteos salen de eso)", async () => {
    const d = await pedir("bodega", "jorman");
    expect(new Set(d.pedidos.map((p) => p.empresa_key))).toEqual(new Set(["vistana"]));
  });

  it("montoDelPedido: el campo no existe para nadie más", () => {
    expect(montoDelPedido("daniel", "146509.4")).toEqual({ monto: 146509.4 });
    expect(montoDelPedido("Daniel ", null)).toEqual({ monto: null });
    expect(montoDelPedido("rey", 100)).toEqual({});
    expect(montoDelPedido(undefined, 100)).toEqual({});
  });

  it("la ruta saca la plata solo por montoDelPedido", () => {
    const ruta = readFileSync(join(process.cwd(), "src/app/api/guias/pedidos/route.ts"), "utf8");
    expect(ruta).toContain("...montoDelPedido(auth.userName, p.subtotal)");
    expect(ruta.match(/p\.subtotal/g)).toHaveLength(1);
    expect(ruta).not.toMatch(/p\.total\b/);
  });
});

describe("Pedidos — conteos y línea de resumen", () => {
  const hoy = "2026-11-24";
  const rows = [
    { estado: "pendiente", fecha: "2026-11-23T15:00:00Z", piezas: 228, monto: 4044.1 },
    { estado: "pendiente", fecha: "2026-11-24T15:00:00Z", piezas: 344, monto: 10152 },
    { estado: "pendiente", fecha: "2026-11-24T16:00:00Z", piezas: null, monto: 100 },
    { estado: "en_preparacion", fecha: "2026-11-22T18:49:21Z", en_preparacion_en: "2026-11-10T17:17:54Z", piezas: 896 },
    { estado: "recibido", fecha: "2026-11-20T15:00:00Z", piezas: 10 },
  ];
  const nombre = { singular: "pendiente", plural: "pendientes" };

  it("cuenta cada pestaña, con 0 donde no hay", () => {
    expect(conteosPorEstado(rows)).toEqual({ pendiente: 3, en_preparacion: 1, preparado: 0, recibido: 1 });
  });

  it("daniel: primero la plata, después las unidades", () => {
    expect(lineaDeResumen(rows, "pendiente", nombre)).toBe("3 pendientes · $14,296 · 572 unidades");
    expect(lineaDeResumen(rows, "pendiente", nombre, { corta: true })).toBe("3 pendientes · $14,296 · 572 uds.");
  });

  it("sin montos (todos los demás): solo pedidos y unidades", () => {
    const sin = rows.map(({ monto: _m, ...r }) => r);
    expect(lineaDeResumen(sin, "pendiente", nombre)).toBe("3 pendientes · 572 unidades");
    expect(lineaDeResumen(sin, "preparado", { singular: "preparado", plural: "preparados" })).toBe("Sin pedidos preparados");
  });

  it("el más viejo: la misma antigüedad de la fila (En preparación desde la marca)", () => {
    expect(lineaMasViejo(rows, "pendiente", hoy)).toBe("el más viejo, ayer");
    expect(lineaMasViejo(rows, "en_preparacion", hoy)).toBe("el más viejo, 14 d");
    expect(lineaMasViejo(rows, "preparado", hoy)).toBeNull();
  });

  it("la pantalla pone el monto ANTES de las unidades", () => {
    const v = readFileSync(join(process.cwd(), "src/app/despachos/components/PedidosView.tsx"), "utf8");
    expect(v).toContain("{monto}{x}");
    expect(v).not.toMatch(/pedidos-tarjetas-2026-11|veTarjetasDePedidos/);
  });
});

describe("Pedidos — antigüedad desde la marca de bodega (24-nov-2026)", () => {
  const hoy = "2026-11-24";
  it("AS 557: marcado el 10-nov, Switch dice 22-nov → 14 d en la fila, la línea y el orden", () => {
    const as557 = { estado: "en_preparacion", secuencial: "16-000000557", fecha: "2026-11-22 18:49:21+00", en_preparacion_en: "2026-11-10T17:17:54.111Z" };
    const fs2217 = { estado: "en_preparacion", secuencial: "16-000002217", fecha: "2026-11-22 17:16:23+00", en_preparacion_en: "2026-11-17T15:41:31.204Z" };
    expect(fechaDeAntiguedad(as557)).toBe(as557.en_preparacion_en);
    expect(haceDiasCorto(fechaDeAntiguedad(as557), hoy)).toBe("14 d");
    const nombre = { singular: "en preparación", plural: "en preparación" };
    expect(lineaDeLaPestana([fs2217, as557], "en_preparacion", nombre, hoy)).toBe("2 en preparación · el más viejo, 14 d");
    expect(lineaMasViejo([fs2217, as557], "en_preparacion", hoy)).toBe("el más viejo, 14 d");
    expect(ordenarPedidos([fs2217, as557]).map((p) => p.secuencial)).toEqual(["16-000000557", "16-000002217"]);
  });

  it("Pendiente y Recibido siguen contando desde la fecha de Switch; sin firma, también", () => {
    const f = "2026-11-22 18:49:21+00";
    expect(fechaDeAntiguedad({ estado: "pendiente", fecha: f, en_preparacion_en: "2026-11-01T00:00:00Z" })).toBe(f);
    expect(fechaDeAntiguedad({ estado: "recibido", fecha: f, preparado_en: "2026-11-01T00:00:00Z" })).toBe(f);
    expect(fechaDeAntiguedad({ estado: "preparado", fecha: f, preparado_en: null })).toBe(f);
    expect(fechaDeAntiguedad({ estado: "preparado", fecha: f, preparado_en: "2026-11-20T12:00:00Z" })).toBe("2026-11-20T12:00:00Z");
  });
});
