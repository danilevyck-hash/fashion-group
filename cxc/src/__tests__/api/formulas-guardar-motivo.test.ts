/**
 * Plantilla Switch › Fórmulas: si guardar falla, el motivo queda en el
 * registro del servidor y la pantalla dice qué hacer.
 * 🩸 9-nov-2026: «No se pudo guardar la fórmula» sin rastro de por qué.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/require-auth", () => ({
  requireAuth: () => null,
  getSession: () => ({ role: "secretaria", userName: "Ana" }),
}));
vi.mock("@/lib/supabase-server", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "ilike", "limit"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: null, error: null });
  q.insert = async () => ({
    error: { code: "23514", message: 'violates check constraint "marca_formulas_redondeo_check"', details: null },
  });
  return { HAS_SERVICE_ROLE: true, supabaseServer: { from: () => q } };
});

import { PUT } from "@/app/api/productos/cargar/formulas/route";

afterEach(() => vi.restoreAllMocks());

describe("PUT fórmulas: la falla deja motivo", () => {
  it("anota la causa en el servidor y devuelve un mensaje accionable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await PUT(
      new NextRequest("http://x/api/productos/cargar/formulas", {
        method: "PUT",
        body: JSON.stringify({ marca: "NIKE", empresa: null, divisor: 0.75, extra: 0, redondeo: "par" }),
      }),
    );
    expect(res.status).toBe(500);
    const { error } = await res.json();
    expect(error).toContain("NIKE");
    expect(error).toMatch(/redondeo «par»/);
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls[0].join(" ")).toMatch(/23514.*check constraint/);
  });
});
