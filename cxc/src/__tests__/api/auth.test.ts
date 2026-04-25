import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabaseServer before importing the route
const mockFrom = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// Mock logActivity
vi.mock("@/lib/log-activity", () => ({
  logActivity: vi.fn(),
}));

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn().mockResolvedValue(false) },
}));

import { POST } from "@/app/api/auth/route";
import { NextRequest } from "next/server";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Helper to build a mock chain for supabase queries
function mockSupabaseChain(finalData: unknown, finalError: unknown = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: finalData, error: finalError }),
        // For queries without .single()
      }),
      // For queries that just call .select() without .eq()
    }),
  };
}

describe("POST /api/auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for wrong password when no fg_users match", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "fg_users") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return mockSupabaseChain(null);
    });

    const req = makeRequest({ password: "wrongpassword" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Contraseña incorrecta");
  });

});
