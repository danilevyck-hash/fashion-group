/**
 * "Actualizar" manual (/api/admin/sync-now) deja rastro en activity_logs con
 * el mismo formato que el login: quién (nombre + rol), módulo, empresas y
 * resultado. Sin cambiar la respuesta.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { logActivity, syncEmpresaProveedores } = vi.hoisted(() => ({
  logActivity: vi.fn(async (..._a: unknown[]) => {}),
  syncEmpresaProveedores: vi.fn(),
}));

vi.mock("@/lib/log-activity", () => ({ logActivity }));
vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "contabilidad", userName: "Yulissa" }),
}));
vi.mock("@/lib/supabase-server", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: null, error: null });
  q.then = (r: (v: unknown) => unknown) => r({ data: [], error: null });
  return { supabaseServer: { from: () => q, rpc: async () => ({ error: null }) } };
});
vi.mock("@/lib/telegram", () => ({ sendTelegramAlert: vi.fn(), shortError: (s: string) => s }));
vi.mock("@/lib/switch-api/client", () => ({ logoutAllSwitchSessions: vi.fn(async () => {}) }));
vi.mock("@/lib/switch-api/sync-log", () => ({
  clearStaleRunning: vi.fn(async () => {}),
  isRunningLockConflict: () => false,
}));
vi.mock("@/lib/switch-api/sync-proveedores", () => ({ syncEmpresaProveedores }));
// El resto de los syncs no se usan acá; se mockean para no construir clientes reales.
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

const pedir = () =>
  POST(
    new NextRequest("http://x/api/admin/sync-now", {
      method: "POST",
      body: JSON.stringify({ modulo: "proveedores", empresa: "vistana" }),
    }),
  );

describe("sync-now registra en activity_logs", () => {
  beforeEach(() => logActivity.mockClear());

  it("éxito: rol, acción, módulo, empresas, resultado y nombre como en el login", async () => {
    syncEmpresaProveedores.mockResolvedValueOnce({ ok: true, empresaKey: "vistana", proveedores: 3 });
    const res = (await pedir()) as NextResponse;
    expect(res.status).toBe(200);
    expect(logActivity).toHaveBeenCalledWith(
      "contabilidad",
      "sync_now",
      "sync",
      expect.objectContaining({ userName: "Yulissa", modulo: "proveedores", empresas: ["vistana"], resultado: "ok" }),
      "Yulissa",
    );
  });

  it("error: queda registrado y la respuesta sigue siendo 500", async () => {
    syncEmpresaProveedores.mockResolvedValueOnce({ ok: false, error: "Switch caído" });
    const res = (await pedir()) as NextResponse;
    expect(res.status).toBe(500);
    expect(logActivity).toHaveBeenCalledWith(
      "contabilidad",
      "sync_now",
      "sync",
      expect.objectContaining({ resultado: "error", detalle: "Switch caído" }),
      "Yulissa",
    );
  });
});
