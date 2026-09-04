/**
 * Sesión vigente NO pide contraseña (3-sep-2026).
 *
 * El defecto medido: 453 de 468 logins en 30 días eran de usuarios que YA
 * tenían una sesión válida de 7 días — la cookie estaba viva pero el rol vivía
 * solo en sessionStorage (que muere al cerrar la app) y la pantalla de login
 * nunca miraba la cookie. Criterio de Daniel: «abrir la app y caer en Inicio;
 * si el pase venció o cerró sesión, la contraseña como hoy».
 *
 * Candados:
 *  A) GET /api/auth/sesion — TODO fail-closed:
 *     - cookie firmada + token vivo en user_sessions + usuario activo → 200
 *     - sin cookie / firma forjada → 401
 *     - token que NO está en user_sessions → 401 (nunca entra)
 *     - sesión REVOCADA → 401
 *     - token de OTRO usuario (user_name no coincide) → 401
 *     - usuario desactivado en fg_users → 401
 *  B) Pantalla de login:
 *     - con sesión viva → NO se muestra el formulario y se redirige a la casa
 *       del rol (cliente → /catalogo/reebok, el resto → /home, que a su vez
 *       aplica MODULO_CASA_POR_ROL / auto-redirect de módulo único)
 *     - sin sesión (401) → el formulario de contraseña, como hoy (CONTROL)
 *     - ?expired=1 → formulario directo, sin llamar a /api/auth/sesion
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { NextRequest } from "next/server";

// ─── Fake Supabase con filtrado REAL en memoria ─────────────────────────────
// Los .eq() se aplican de verdad contra las filas: si una mutación borra el
// filtro `revoked=false` o `active=true`, la fila prohibida VUELVE a salir y
// el test se pone rojo. Un mock que devuelve la fila fija no cazaría eso.
let tablas: Record<string, Record<string, unknown>[]> = {};

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from(table: string) {
      const filtros: Array<[string, unknown]> = [];
      const filas = () =>
        (tablas[table] || []).filter((r) => filtros.every(([c, v]) => r[c] === v));
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filtros.push([col, val]);
          return builder;
        },
        maybeSingle: async () => ({ data: filas()[0] ?? null, error: null }),
        single: async () => {
          const f = filas();
          return f[0]
            ? { data: f[0], error: null }
            : { data: null, error: { message: "0 rows" } };
        },
      };
      return builder;
    },
  },
}));

const replaceMock = vi.fn();
const pushMock = vi.fn();
let searchParams = new URLSearchParams("");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => searchParams,
}));

import { GET } from "@/app/api/auth/sesion/route";
import { signSession } from "@/lib/session-cookie";
import LoginPage from "@/app/page";

const TOKEN_VIVO = "token-vivo-de-rey";
const TOKEN_REVOCADO = "token-revocado";
const TOKEN_DE_OTRO = "token-de-angela";

function fixture() {
  tablas = {
    user_sessions: [
      { session_token: TOKEN_VIVO, user_name: "rey", revoked: false },
      { session_token: TOKEN_REVOCADO, user_name: "rey", revoked: true },
      { session_token: TOKEN_DE_OTRO, user_name: "Angela", revoked: false },
    ],
    fg_users: [
      {
        id: "u-rey", name: "rey", role: "bodega", active: true,
        is_owner: false, associated_company: null, modulos_override: null,
      },
      {
        id: "u-baja", name: "exempleado", role: "secretaria", active: false,
        is_owner: false, associated_company: null, modulos_override: null,
      },
    ],
    role_permissions: [{ role: "bodega", modulos: ["guias", "packing-lists"] }],
  };
}

function cookieDe(payload: Record<string, unknown>): string {
  return signSession(payload);
}

function reqCon(cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/sesion", {
    headers: cookie ? { cookie: `cxc_session=${cookie}` } : {},
  });
}

const PAYLOAD_REY = {
  role: "bodega", userId: "u-rey", userName: "rey", sessionToken: TOKEN_VIVO,
};

beforeAll(() => {
  process.env.SESSION_SECRET = "secreto-de-prueba-sesion-vigente";
});

beforeEach(() => {
  fixture();
  vi.clearAllMocks();
  sessionStorage.clear();
  searchParams = new URLSearchParams("");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ─── A) GET /api/auth/sesion ────────────────────────────────────────────────

describe("GET /api/auth/sesion — reanudar con cookie vigente", () => {
  it("CONTROL: cookie firmada + sesión viva + usuario activo → 200 con el payload completo", async () => {
    const res = await GET(reqCon(cookieDe(PAYLOAD_REY)));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.role).toBe("bodega");
    expect(json.userId).toBe("u-rey");
    expect(json.userName).toBe("rey");
    expect(json.modules).toEqual(["guias", "packing-lists"]);
  });

  it("sin cookie → 401", async () => {
    const res = await GET(reqCon());
    expect(res.status).toBe(401);
  });

  it("cookie con firma forjada → 401", async () => {
    const buena = cookieDe(PAYLOAD_REY);
    const forjada = buena.slice(0, -4) + "XXXX"; // firma corrupta
    const res = await GET(reqCon(forjada));
    expect(res.status).toBe(401);
  });

  it("token que NO está en user_sessions → 401 (nunca entra)", async () => {
    const res = await GET(
      reqCon(cookieDe({ ...PAYLOAD_REY, sessionToken: "token-inventado" })),
    );
    expect(res.status).toBe(401);
  });

  it("sesión REVOCADA → 401", async () => {
    const res = await GET(
      reqCon(cookieDe({ ...PAYLOAD_REY, sessionToken: TOKEN_REVOCADO })),
    );
    expect(res.status).toBe(401);
  });

  it("token de OTRO usuario → 401 (la cookie dice rey, la sesión es de Angela)", async () => {
    const res = await GET(
      reqCon(cookieDe({ ...PAYLOAD_REY, sessionToken: TOKEN_DE_OTRO })),
    );
    expect(res.status).toBe(401);
  });

  it("usuario DESACTIVADO en fg_users → 401 aunque su sesión siga viva", async () => {
    tablas.user_sessions.push({
      session_token: "token-de-baja", user_name: "exempleado", revoked: false,
    });
    const res = await GET(
      reqCon(cookieDe({
        role: "secretaria", userId: "u-baja", userName: "exempleado",
        sessionToken: "token-de-baja",
      })),
    );
    expect(res.status).toBe(401);
  });

  it("cookie sin userId (legacy) → 401, a pedir contraseña", async () => {
    const res = await GET(
      reqCon(cookieDe({ role: "bodega", userName: "rey", sessionToken: TOKEN_VIVO })),
    );
    expect(res.status).toBe(401);
  });
});

// ─── B) La pantalla de login ────────────────────────────────────────────────

function mockFetchSesion(respuesta: { status: number; body?: unknown }) {
  const fetchMock = vi.fn(async (url: unknown) => {
    if (String(url).includes("/api/auth/sesion")) {
      return new Response(JSON.stringify(respuesta.body ?? { error: "No autenticado" }), {
        status: respuesta.status,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`fetch inesperado: ${String(url)}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Pantalla de login — sesión vigente no pide contraseña", () => {
  it("con sesión viva: NO muestra el formulario, rehidrata sessionStorage y va a /home", async () => {
    mockFetchSesion({
      status: 200,
      body: {
        authenticated: true, role: "bodega", userId: "u-rey", userName: "rey",
        modules: ["guias", "packing-lists"], isOwner: false,
      },
    });
    render(<LoginPage />);

    // Nunca aparece el campo de contraseña mientras se verifica…
    expect(screen.queryByPlaceholderText("Contraseña")).toBeNull();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/home"));
    // …ni después de redirigir.
    expect(screen.queryByPlaceholderText("Contraseña")).toBeNull();
    expect(sessionStorage.getItem("cxc_role")).toBe("bodega");
    expect(sessionStorage.getItem("fg_user_name")).toBe("rey");
    expect(JSON.parse(sessionStorage.getItem("fg_modules") || "[]")).toEqual([
      "guias", "packing-lists",
    ]);
  });

  it("rol cliente va a SU casa (/catalogo/reebok), no a /home", async () => {
    mockFetchSesion({
      status: 200,
      body: { authenticated: true, role: "cliente", userId: "u-c", userName: "c", modules: [] },
    });
    render(<LoginPage />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/catalogo/reebok"));
    expect(replaceMock).not.toHaveBeenCalledWith("/home");
  });

  it("CONTROL: sin sesión (401) → aparece el formulario de contraseña, como hoy", async () => {
    mockFetchSesion({ status: 401 });
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Contraseña")).not.toBeNull(),
    );
    expect(replaceMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("cxc_role")).toBeNull();
  });

  it("respuesta 200 pero SIN rol → formulario (no se entra con un payload roto)", async () => {
    mockFetchSesion({ status: 200, body: { authenticated: true } });
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Contraseña")).not.toBeNull(),
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("?expired=1 → formulario directo, sin preguntar por la sesión", async () => {
    searchParams = new URLSearchParams("expired=1");
    const fetchMock = mockFetchSesion({ status: 200, body: { role: "bodega" } });
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Contraseña")).not.toBeNull(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Tu sesión expiró. Inicia sesión de nuevo.")).toBeTruthy();
  });
});
