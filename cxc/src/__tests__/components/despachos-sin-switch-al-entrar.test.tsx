// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO (7-oct-2026, Daniel aprobó): ENTRAR a Despachos NO llama a Switch.
//
// Switch da UN token por usuario y cada login saca a Daniel de su panel
// (medido 3-sep, docs/estado-actual.md). Hasta hoy, abrir /despachos y
// /despachos/nueva disparaba `POST /api/guias/facturas-hoy` (que entra a Switch).
// Ahora las facturas de hoy llegan por los crons de switch-sync o con el botón
// «Actualizar» de `LineaDeFrescura`, que sigue con el freno de 10 min del server.
//
// La lista /despachos está cubierta en guias-eliminar-en-la-fila.test.tsx
// (abrirla = 100% lectura, todos los roles). Acá: /despachos/nueva al montar,
// y el freno del botón en la ruta.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, act, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: "secretaria" }),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => <div /> }));

// ── la ruta del botón, sin Switch ni base de verdad ──────────────────────────
vi.mock("@/lib/require-auth", () => ({ requireAuth: () => null }));
const { sync, estado } = vi.hoisted(() => ({
  sync: vi.fn(async () => ({ inserted: 1, updated: 0 })),
  estado: { frescas: false },
}));
vi.mock("@/lib/switch-api/sync-empresa", () => ({ syncEmpresaFacturas: sync }));
vi.mock("@/lib/switch-api/client", () => ({ logoutAllSwitchSessions: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase-server", () => {
  const q = {
    select: () => q, eq: () => q, gte: () => q,
    limit: async () => ({ data: estado.frescas ? [{ id: 1 }] : [], error: null }),
  };
  return { supabaseServer: { from: () => q } };
});

import NuevaGuiaClient from "@/app/despachos/nueva/NuevaGuiaClient";
import { POST } from "@/app/api/guias/facturas-hoy/route";

let urls: string[];

beforeEach(() => {
  urls = [];
  sync.mockClear();
  estado.frescas = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(String(url));
      const u = String(url);
      if (u.startsWith("/api/transportistas")) return { ok: true, json: async () => [] };
      return { ok: true, json: async () => ({}) };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("🔴 entrar a Despachos no llama a Switch", () => {
  it("montar /despachos/nueva no pide /api/guias/facturas-hoy", async () => {
    render(<NuevaGuiaClient />);
    // La pantalla sí cargó lo suyo (transportistas, frecuencias…): el montaje corrió.
    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(urls.filter((u) => u.startsWith("/api/guias/facturas-hoy"))).toHaveLength(0);
  });
});

describe("🔑 «Actualizar» sí trae las facturas de hoy, con el freno de 10 min", () => {
  const req = () => new NextRequest("http://x/api/guias/facturas-hoy", { method: "POST" });

  it("sin sync reciente, entra a Switch por cada empresa", async () => {
    const r = await (await POST(req())).json();
    expect(sync).toHaveBeenCalled();
    expect(r.resultados.every((x: { resultado: string }) => x.resultado === "ok")).toBe(true);
  });

  it("con sync de hace < 10 min, NO entra a Switch", async () => {
    estado.frescas = true;
    const r = await (await POST(req())).json();
    expect(sync).not.toHaveBeenCalled();
    expect(r.resultados.every((x: { resultado: string }) => x.resultado === "fresca")).toBe(true);
  });
});
