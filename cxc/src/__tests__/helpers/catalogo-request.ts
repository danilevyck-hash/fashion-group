// Helper de requests firmados para el arnés de paridad de catálogos.
// Mismo patrón que api/catalogo-bulk-delete.test.ts (cookie cxc_session HMAC).

import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";

export const TEST_SECRET = "test-secret-catalogo-paridad-0123456789abcdef";

export interface MakeReqOpts {
  method?: string;
  body?: unknown;
  role?: string;
  headers?: Record<string, string>;
  /** Body crudo (FormData, etc.) — gana sobre `body`. */
  rawBody?: BodyInit;
}

export function makeReq(url: string, opts: MakeReqOpts = {}): NextRequest {
  const { method = "GET", body, role, headers = {}, rawBody } = opts;
  const init: { method: string; headers: Record<string, string>; body?: BodyInit } = {
    method,
    headers: { ...headers },
  };
  if (rawBody !== undefined) {
    init.body = rawBody;
  } else if (body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const req = new NextRequest(`http://localhost${url}`, init);
  if (role) {
    req.cookies.set(
      "cxc_session",
      signSession({ role, userId: "u-test", userName: "Tester", sessionToken: "tok-1" }),
    );
  }
  return req;
}
