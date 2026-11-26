/**
 * Bodega toca «Actualizar» en Despachos › Pedidos: la puerta de la ruta la
 * deja pasar, y el permiso fino (rolesSyncNow) la limita a Pedidos.
 * 🩸 Antes la puerta no tenía bodega: 276 «Sin permiso» en 6 días (nov-2026).
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { syncEmpresaPedidos } = vi.hoisted(() => ({ syncEmpresaPedidos: vi.fn() }));

vi.mock("@/lib/log-activity", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/requireRole", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireRole: (_req: unknown, roles: string[]) =>
      roles.includes("bodega")
        ? { role: "bodega", userName: "Bodega" }
        : NextResponse.json({ error: "Sin permiso" }, { status: 403 }),
  };
});
vi.mock("@/lib/supabase-server", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit", "gte", "neq"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: null, error: null });
  q.then = (r: (v: unknown) => unknown) => r({ data: [], error: null });
  return { supabaseServer: { from: () => q, rpc: async () => ({ error: null }) } };
});
vi.mock("@/lib/telegram", () => ({ sendTelegramAlert: vi.fn(), shortError: (s: string) => s }));
vi.mock("@/lib/switch-api/client", () => ({ logoutAllSwitchSessions: vi.fn(async () => {}), logoutSwitchSessions: vi.fn(async () => {}) }));
vi.mock("@/lib/switch-api/sync-log", () => ({
  clearStaleRunning: vi.fn(async () => {}),
  esperarCorridaEnCurso: vi.fn(async () => ({ estado: "libre", unida: null })),
  isRunningLockConflict: () => false,
}));
vi.mock("@/lib/switch-api/sync-pedidos", () => ({ syncEmpresaPedidos }));
vi.mock("@/lib/switch-api/sync-proveedores", () => ({ syncEmpresaProveedores: vi.fn() }));
vi.mock("@/lib/switch-api/sync-empresa", () => ({}));
vi.mock("@/lib/switch-api/sync-recibos", () => ({ mesesCronRecibos: () => 3 }));
vi.mock("@/lib/refresh-vistas", () => ({}));
vi.mock("@/lib/switch-api/sync-clientes-master", () => ({}));
vi.mock("@/lib/switch-api/sync-catalogo-reebok", () => ({}));
vi.mock("@/lib/switch-api/sync-catalogo-joybees", () => ({}));
vi.mock("@/lib/switch-api/sync-catalogo-tommy", () => ({}));
vi.mock("@/lib/switch-api/sync-catalogo-calvin", () => ({}));
vi.mock("@/lib/catalogos/fotos-nuevos", () => ({}));

import { POST } from "@/app/api/admin/sync-now/route";

const pedir = (modulo: string, empresa: string) =>
  POST(
    new NextRequest("http://x/api/admin/sync-now", {
      method: "POST",
      body: JSON.stringify({ modulo, empresa }),
    }),
  ) as Promise<NextResponse>;

describe("sync-now: bodega actualiza Pedidos y nada más", () => {
  it("bodega + pedidos pasa la puerta (no 403)", async () => {
    syncEmpresaPedidos.mockResolvedValueOnce({ ok: true, empresaKey: "vistana", pedidos: 2 });
    const res = await pedir("pedidos", "vistana");
    expect(res.status).not.toBe(403);
  });

  it("bodega + proveedores sigue en 403", async () => {
    const res = await pedir("proveedores", "vistana");
    expect(res.status).toBe(403);
  });
});
