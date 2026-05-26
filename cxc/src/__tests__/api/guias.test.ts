import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabaseServer
const mockFrom = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// Mock getSession — default: admin
vi.mock("@/lib/require-auth", () => ({
  getSession: vi.fn().mockReturnValue({ role: "admin", userName: "Test" }),
}));

// Mock logActivity
vi.mock("@/lib/log-activity", () => ({
  logActivity: vi.fn(),
}));

import { POST } from "@/app/api/guias/route";
import { NextRequest } from "next/server";

function makeRequest(body: Record<string, unknown>): NextRequest {
  const sessionPayload = Buffer.from(
    JSON.stringify({ role: "admin", userId: "u1", userName: "Test" })
  ).toString("base64url");

  const req = new NextRequest("http://localhost/api/guias", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  req.cookies.set("cxc_session", sessionPayload);
  return req;
}

// Sprint 2 (2026-05-26): el POST espera modo_entrega + transportista_id en
// lugar del transportista TEXT libre. Los tests se actualizan a ese contrato.
const TRANSPORTISTA_UUID = "00000000-0000-0000-0000-000000000001";

describe("POST /api/guias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when modo_entrega is missing", async () => {
    const req = makeRequest({ fecha: "2026-04-09", items: [{ cliente: "X", bultos: 1, facturas: "F-001" }] });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/modo de entrega/i);
  });

  it("returns 400 when modo_entrega='transportista' without transportista_id", async () => {
    const req = makeRequest({ fecha: "2026-04-09", modo_entrega: "transportista", items: [{ cliente: "X", bultos: 1 }] });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/transportista/i);
  });

  it("returns 400 when items is empty", async () => {
    const req = makeRequest({ fecha: "2026-04-09", modo_entrega: "entrega_directa", items: [] });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/item/i);
  });

  it("returns 400 when items is missing", async () => {
    const req = makeRequest({ fecha: "2026-04-09", modo_entrega: "entrega_directa" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when all items have bultos=0", async () => {
    const req = makeRequest({
      fecha: "2026-04-09",
      modo_entrega: "entrega_directa",
      items: [{ cliente: "Test", bultos: 0 }],
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/bultos/i);
  });

  it("creates guia with valid items and returns it with numero", async () => {
    const fakeGuia = { id: "g1", numero: 42 };

    mockFrom.mockImplementation((table: string) => {
      if (table === "guia_transporte") {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { numero: 41 }, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: fakeGuia, error: null }),
            }),
          }),
        };
      }
      if (table === "guia_items") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    });

    const req = makeRequest({
      fecha: "2026-04-09",
      modo_entrega: "transportista",
      transportista_id: TRANSPORTISTA_UUID,
      items: [{ cliente: "Cliente A", bultos: 5, facturas: "F-001" }],
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.numero).toBe(42);
    expect(json.id).toBe("g1");
  });
});
