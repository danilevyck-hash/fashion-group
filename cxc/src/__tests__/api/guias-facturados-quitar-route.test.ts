/**
 * Despachos › Pedidos › «Facturados» — quitar y devolver (27-nov-2026,
 * `FACTURADOS_QUITAR_2026_11`). Se LLAMA al handler y se mira QUÉ SE ESCRIBIÓ.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { claveQuitada, puedeQuitarFacturados, separarQuitadas } from "@/lib/ui/facturados-quitar-2026-11";

let rol = "secretaria";
vi.mock("@/lib/requireRole", () => ({
  requireRole: (_req: unknown, roles: string[]) =>
    rol === "admin" || roles.includes(rol)
      ? { role: rol, userName: "andrea" }
      : NextResponse.json({ error: "Sin permiso" }, { status: 403 }),
}));

let ops: Array<{ tabla: string; op: string; datos?: unknown; filtros: Record<string, unknown> }>;
function tabla(t: string) {
  const filtros: Record<string, unknown> = {};
  let op = "select";
  let datos: unknown;
  const fin = () => {
    ops.push({ tabla: t, op, datos, filtros });
    return { data: op === "update" ? [{ id: 7 }] : null, error: null };
  };
  const c = {
    insert: (d: unknown) => { op = "insert"; datos = d; return c; },
    update: (d: unknown) => { op = "update"; datos = d; return c; },
    delete: () => { op = "delete"; return c; },
    select: () => c,
    eq: (k: string, v: unknown) => { filtros[k] = v; return c; },
    in: (k: string, v: unknown) => { filtros[k] = v; return c; },
    then: (ok: (r: unknown) => unknown) => Promise.resolve(fin()).then(ok),
  };
  return c;
}
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: (t: string) => tabla(t) } }));

beforeEach(() => { ops = []; rol = "secretaria"; });

const req = (body: unknown) => ({ json: async () => body }) as never;
const FACTURA = { empresa_key: "vistana", secuencial: "11-000003162", fecha: "2026-11-25T05:00:00+00:00" };

async function quitar(body: unknown = FACTURA) {
  const { POST } = await import("@/app/api/guias/pedidos/facturados/quitadas/route");
  return (await POST(req(body))).status;
}
async function devolver(id: unknown = 7) {
  const { PATCH } = await import("@/app/api/guias/pedidos/facturados/quitadas/route");
  return (await PATCH(req({ id }))).status;
}

describe("🔴 quién puede quitar y devolver", () => {
  for (const r of ["bodega", "vendedor"]) {
    it(`${r} NO puede quitar ni devolver, y no se escribe nada`, async () => {
      rol = r;
      expect(await quitar()).toBe(403);
      expect(await devolver()).toBe(403);
      expect(ops).toHaveLength(0);
      expect(puedeQuitarFacturados(r)).toBe(false);
    });
  }
  for (const r of ["admin", "secretaria"]) {
    it(`${r} sí`, async () => {
      rol = r;
      expect(await quitar()).toBe(200);
      expect(puedeQuitarFacturados(r)).toBe(true);
    });
  }
});

describe("🔴 qué escribe", () => {
  it("quitar anota quién, sin tocar switch_facturas", async () => {
    expect(await quitar()).toBe(200);
    expect(ops).toEqual([
      {
        tabla: "guias_facturas_quitadas",
        op: "insert",
        datos: { empresa_key: "vistana", secuencial: "11-000003162", fecha_factura: "2026-11-25", quitada_por: "andrea" },
        filtros: {},
      },
    ]);
  });

  it("rechaza una empresa ajena al grupo", async () => {
    expect(await quitar({ ...FACTURA, empresa_key: "boston" })).toBe(400);
    expect(ops).toHaveLength(0);
  });

  it("«Devolver» es soft delete firmado, nunca DELETE", async () => {
    expect(await devolver()).toBe(200);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe("update");
    expect(ops[0].datos).toMatchObject({ deleted: true, devuelta_por: "andrea" });
    expect(ops[0].filtros).toMatchObject({ id: 7, deleted: false });
    expect(ops.some((o) => o.op === "delete")).toBe(false);
  });
});

describe("🔴 una quitada no reaparece al releer; devuelta, vuelve", () => {
  const filas = [FACTURA, { empresa_key: "fashion_wear", secuencial: "11-000003162", fecha: "2026-11-25T05:00:00+00:00" }];
  it("la misma factura de OTRA empresa no se esconde", () => {
    const r = separarQuitadas(filas, new Set([claveQuitada({ ...FACTURA, fecha: "2026-11-25" })]));
    expect(r.visibles.map((f) => f.empresa_key)).toEqual(["fashion_wear"]);
    expect(r.quitadas.map((f) => f.empresa_key)).toEqual(["vistana"]);
  });
  it("sin quitadas activas, se ven todas", () => {
    expect(separarQuitadas(filas, new Set()).visibles).toHaveLength(2);
  });
});
