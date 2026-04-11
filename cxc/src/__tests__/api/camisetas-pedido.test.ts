import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabaseServer
const mockFrom = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// Mock requireRole — default: authorized as admin
vi.mock("@/lib/requireRole", () => ({
  requireRole: vi.fn().mockReturnValue({ role: "admin", userId: "u1", userName: "Test" }),
}));

// Mock getSession
vi.mock("@/lib/require-auth", () => ({
  getSession: vi.fn().mockReturnValue({ role: "admin", userName: "Test" }),
}));

// Mock logActivity
vi.mock("@/lib/log-activity", () => ({
  logActivity: vi.fn(),
}));

import { POST } from "@/app/api/camisetas/pedido/route";
import { NextRequest } from "next/server";

function makeRequest(body: Record<string, unknown>): NextRequest {
  // Add a fake session cookie so requireRole works in case the mock leaks
  const sessionPayload = Buffer.from(
    JSON.stringify({ role: "admin", userId: "u1", userName: "Test" })
  ).toString("base64url");

  const req = new NextRequest("http://localhost/api/camisetas/pedido", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  req.cookies.set("cxc_session", sessionPayload);
  return req;
}

describe("POST /api/camisetas/pedido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when cliente_id is missing", async () => {
    const req = makeRequest({ producto_id: "p1", paquetes: 5 });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/cliente_id/);
  });

  it("returns 400 when producto_id is missing", async () => {
    const req = makeRequest({ cliente_id: "c1", paquetes: 5 });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/producto_id/);
  });

  it("returns {ok: true} with valid data (insert)", async () => {
    // No existing rows
    mockFrom.mockImplementation((table: string) => {
      if (table === "camisetas_pedidos") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    });

    const req = makeRequest({ cliente_id: "c1", producto_id: "p1", paquetes: 5 });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("deletes record when paquetes=0 and row exists", async () => {
    const mockDelete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "camisetas_pedidos") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: "row1", paquetes: 3 }],
                error: null,
              }),
            }),
          }),
          delete: mockDelete,
        };
      }
      return {};
    });

    const req = makeRequest({ cliente_id: "c1", producto_id: "p1", paquetes: 0 });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockDelete).toHaveBeenCalled();
  });
});
