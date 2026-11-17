// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — Marketing › ficha de tienda: «Fotos · N» sigue a la lista
// (16-nov-2026, error de los videos #6).
//
// 🩸 El número del botón salía SOLO de la carga de la ficha
// (`/api/marketing/tienda/<código>` → `fotos`) y la lista de fotos se carga
// aparte; al subir una foto la lista se refrescaba pero el botón seguía en
// «Fotos · 0» hasta recargar la página. Ahora `FotosSection` avisa cuántas
// tiene (`onCantidad`) y la ficha pinta ese número.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketing/tienda/D-118",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({ useSidebarCollapsed: () => false, readSidebarCollapsed: () => false }));
vi.mock("@/components/AppHeader", () => ({ default: () => <div /> }));

import { render, screen, cleanup, act } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import FichaTienda from "@/app/marketing/tienda/[codigo]/FichaTienda";

let fotosEnLaLista: unknown[] = [];
function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
    const p = String(input).split("?")[0];
    const json = (d: unknown) => ({ ok: true, status: 200, json: async () => d, text: async () => "" });
    if (p === "/api/marketing/tienda/D-118") {
      return json({ codigo: "D-118", nombre: "Outlet Duty Free N3, S.A.", enElDirectorio: true, totales: {}, fotos: 0, sinMigracion: false, filas: [] });
    }
    if (p === "/api/marketing/tienda/D-118/fotos") return json(fotosEnLaLista);
    if (p.endsWith("/fotos/marcas")) return json({ marcas: [] });
    return json([]);
  }));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("#6 «Fotos · N» en la ficha de la tienda", () => {
  it("cuenta lo que la lista de fotos tiene, sin recargar la página", async () => {
    // La ficha dijo 0 (se leyó antes de subir) y la lista ya trae la foto nueva.
    fotosEnLaLista = [{ id: "a1", url: "https://x/y.jpg", nombre_original: "y.jpg", tipo: "foto_proyecto", created_at: "2026-11-16T10:00:00Z" }];
    stubFetch();
    await act(async () => {
      render(<ToastProvider><FichaTienda codigo="D-118" role="admin" /></ToastProvider>);
    });
    await vi.waitFor(() => expect(screen.getByRole("link", { name: /^Fotos/ }).textContent).toBe("Fotos · 1"));
  });
});
