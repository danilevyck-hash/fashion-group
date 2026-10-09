// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO: el AVISO mientras se escribe (`check-duplicate`) compara igual
// que el FRENO al guardar — número SIN ceros de relleno y proveedor con alias.
//
// 🩸 El caso real: «11-000007766» y «11-00007766» de Confecciones Boston
// ($6.163,20) entraron las dos; el aviso comparaba el número como texto exacto
// y no dijo nada. Y la 0000062623 entró una vez como «Impreco» y otra como
// «Impresora Comercial S a» (auditoría 8-oct-2026).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { mismoNumeroDeFactura } from "@/lib/marketing/duplicado";

const FILAS = [
  { id: "f1", numero_factura: "11-00007766", proveedor: "Confecciones Boston S.a", total: 6163.2, proyecto_id: "p1", created_at: null, fecha_factura: "2026-09-10", proyecto: null },
  { id: "f2", numero_factura: "11-0000007756", proveedor: "Confecciones Boston S.a", total: 5726.64, proyecto_id: "p1", created_at: null, fecha_factura: "2026-09-10", proyecto: null },
  { id: "f3", numero_factura: "0000062623", proveedor: "Impreco", total: 104.83, proyecto_id: "p2", created_at: null, fecha_factura: "2025-11-21", proyecto: null },
];

vi.mock("@/lib/requireRole", () => ({ requireRole: () => ({ role: "admin" }) }));
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: () => {
      let patron = "";
      const q = {
        select: () => q,
        ilike: (_c: string, p: string) => ((patron = p.replace(/%/g, "").toUpperCase()), q),
        is: () =>
          Promise.resolve({
            data: FILAS.filter((f) => f.numero_factura.toUpperCase().includes(patron)),
            error: null,
          }),
      };
      return q;
    },
  },
}));

async function avisa(numero: string, proveedor: string): Promise<string[]> {
  const { GET } = await import("@/app/api/marketing/facturas/check-duplicate/route");
  const qs = new URLSearchParams({ numero_factura: numero, proveedor });
  const res = await GET(new NextRequest(`https://x.test/api/marketing/facturas/check-duplicate?${qs}`));
  const body = (await res.json()) as { facturas: { id: string }[] };
  return body.facturas.map((f) => f.id);
}

describe("aviso de duplicado al escribir = la regla del freno", () => {
  it("«11-000007766» avisa contra «11-00007766» (un cero de más)", async () => {
    expect(await avisa("11-000007766", "Confecciones Boston")).toEqual(["f1"]);
  });

  it("un número distinto del mismo proveedor NO avisa", async () => {
    expect(await avisa("11-00007757", "Confecciones Boston S.A.")).toEqual([]);
  });

  it("el alias cuenta: «Impresora Comercial S a» avisa contra «Impreco»", async () => {
    expect(await avisa("62623", "Impresora Comercial S a")).toEqual(["f3"]);
  });

  it("otro proveedor con el mismo número NO avisa", async () => {
    expect(await avisa("0000062623", "Grupo City Mall")).toEqual([]);
  });

  it("la regla pura", () => {
    expect(mismoNumeroDeFactura({ numero: "11-000007766", proveedor: "Confecciones Boston" }, { numero: "11-00007766", proveedor: "CONFECCIONES BOSTON S.A." })).toBe(true);
    expect(mismoNumeroDeFactura({ numero: "", proveedor: "x" }, { numero: "", proveedor: "x" })).toBe(false);
  });
});
