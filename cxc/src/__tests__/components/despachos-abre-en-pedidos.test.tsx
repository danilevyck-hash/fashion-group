/**
 * 🔴 DESPACHOS ABRE EN «PEDIDOS» (7-oct-2026). Daniel: «El módulo Despachos
 * debe abrir en Pedidos». Antes abría ahí solo para admin y bodega; secretaria
 * y vendedor caían en «Guías de despacho». Los enlaces viejos a otra pestaña
 * (`?vista=guias|etiquetas|config`, `?pendientes=1` de ⌘K) siguen abriendo
 * donde decían.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => "/despachos",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/app/despachos/components/PedidosView", () => ({ default: () => <div data-testid="vista-pedidos" /> }));

import GuiasPage from "@/app/despachos/page";
import "@/lib/guias/papel-de-la-guia";

function memStorage(): Storage {
  let m: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in m ? m[k] : null),
    setItem: (k: string, v: string) => { m[k] = String(v); },
    removeItem: (k: string) => { delete m[k]; },
    clear: () => { m = {}; },
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memStorage());
  vi.stubGlobal("sessionStorage", memStorage());
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) =>
    ({ ok: true, json: async () => (String(url) === "/api/guias" ? [] : {}) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

const activa = (c: HTMLElement) => (c.querySelector('button[aria-current="page"]')?.textContent ?? "").trim();

async function abreEn(rol: string, query: string, esperada: string) {
  window.history.replaceState(null, "", `/despachos${query}`);
  sessionStorage.setItem("cxc_role", rol);
  sessionStorage.setItem("fg_modules", JSON.stringify(["guias"]));
  const { container } = render(<GuiasPage />);
  await waitFor(() => expect(activa(container)).not.toBe(""));
  await new Promise((r) => setTimeout(r, 0)); // deja correr el efecto que elige la pestaña
  await waitFor(() => expect(activa(container)).toBe(esperada));
}

describe("🔴 Despachos abre en Pedidos para todos los que la ven", () => {
  it.each(["admin", "secretaria", "bodega", "vendedor"])("%s entra a /despachos → Pedidos", async (rol) => {
    await abreEn(rol, "", "Pedidos");
  });

  it("?vista=guias sigue abriendo la lista de guías", async () => {
    await abreEn("secretaria", "?vista=guias", "Guías de despacho");
  });

  it("?pendientes=1 (⌘K «Ir a guías pendientes») abre la lista de guías", async () => {
    await abreEn("admin", "?pendientes=1", "Guías de despacho");
  });

  it("?vista=config sigue abriendo Configuración", async () => {
    await abreEn("secretaria", "?vista=config", "Configuración");
  });
});
