/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CLIENTES — LA BÚSQUEDA Y LA PÁGINA SOBREVIVEN A ENTRAR EN UNA FICHA.
 *
 * 🩸 EL DEFECTO. Estaban en `useState`: buscabas un cliente (o ibas a la página
 * 3), entrabas a su ficha y al volver el buscador estaba VACÍO y de nuevo en la
 * página 1. Revisar 10 clientes seguidos era escribir la búsqueda 10 veces.
 *
 * La regla de navegación de la casa ya lo resolvía y esta pantalla no la usaba:
 * **filtros y páginas van a la URL con `replace`** (no crean entrada de
 * historial → el Atrás no cicla por ellos) y **el drill-down va con `push`**.
 * Se REUSÓ `useUrlState`; no se inventó otro mecanismo.
 *
 * 🔑 SON TESTS DE CONDUCTA: se monta la pantalla REAL, se escribe en el
 * buscador REAL y se mira qué salió por el router y por `fetch`. Un barrido de
 * texto vería el `useUrlState(` y se daría por satisfecho aunque el valor no
 * llegara nunca ni a la URL ni a la consulta.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import ClientesListClient, { type Cliente } from "@/app/clientes/ClientesListClient";

/** La query de la URL con la que se monta la pantalla. */
let QUERY = "";
const REPLACE = vi.fn();
const PUSH = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(QUERY),
  useRouter: () => ({ replace: REPLACE, push: PUSH, prefetch: vi.fn() }),
  usePathname: () => "/clientes",
}));

vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));

const CLIENTES: Cliente[] = [
  { id: "1", codigo: "D-25", nombre: "CITY MALL PASO CANOA", razon_social: null, telefono: "507-1", celular: null, email: null, provincia: "Chiriquí" },
  { id: "2", codigo: "D-24", nombre: "CITY MALL DAVID", razon_social: null, telefono: null, celular: null, email: null, provincia: "Chiriquí" },
];

/** URLs que la pantalla llegó a pedir, en orden. */
let pedidos: string[];

beforeEach(() => {
  QUERY = "";
  REPLACE.mockClear();
  PUSH.mockClear();
  pedidos = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    pedidos.push(String(url));
    if (String(url).startsWith("/api/clientes/ytd")) {
      return { ok: true, json: async () => ({ anio: 2026, ytd: {} }) } as unknown as Response;
    }
    return {
      ok: true,
      json: async () => ({ clientes: CLIENTES, total: 120, page: 1 }),
    } as unknown as Response;
  }));
});

afterEach(() => { vi.unstubAllGlobals(); });

function pintar() {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <ClientesListClient
        initialClientes={CLIENTES}
        initialTotal={120}
        provincias={["Chiriquí", "Panamá"]}
        pageSize={50}
      />
    </SWRConfig>,
  );
}

const buscador = () => screen.getByPlaceholderText(/Buscar por nombre/i) as HTMLInputElement;

// ─────────────────────────────────────────────────────────────────────────────
// 1. LO QUE SE ESCRIBE VA A LA URL — con `replace`, nunca con `push`
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 la búsqueda VIVE en la URL", () => {
  it("escribir la manda a la URL tras el debounce, y con REPLACE", async () => {
    vi.useFakeTimers();
    try {
      pintar();
      fireEvent.change(buscador(), { target: { value: "CITY" } });
      // Antes del debounce no se navega: si no, cada tecla sería una navegación.
      expect(REPLACE).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      expect(REPLACE).toHaveBeenCalled();
      expect(REPLACE.mock.calls.at(-1)![0]).toContain("search=CITY");
      // 🔑 La regla de la casa: un filtro NO crea entrada de historial.
      expect(PUSH).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("volver de una ficha con la búsqueda puesta la muestra Y la consulta", async () => {
    // Es el defecto exacto: se entra a `/clientes/D-25` y se vuelve. La URL trae
    // el estado; antes se perdía porque vivía en `useState`.
    QUERY = "search=CITY&page=3";
    pintar();
    expect(buscador().value).toBe("CITY");
    await waitFor(() => {
      expect(pedidos.some((u) => u.includes("q=CITY") && u.includes("page=3"))).toBe(true);
    });
  });

  it("la provincia también viaja en la URL", () => {
    pintar();
    fireEvent.change(screen.getByDisplayValue("Todas las provincias"), { target: { value: "Panamá" } });
    expect(REPLACE).toHaveBeenCalled();
    expect(REPLACE.mock.calls.at(-1)![0]).toContain("provincia=Panam");
    expect(PUSH).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. LA PÁGINA TAMBIÉN
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 la página VIVE en la URL", () => {
  it("«Siguiente» escribe la página con REPLACE", () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
    expect(REPLACE).toHaveBeenCalled();
    expect(REPLACE.mock.calls.at(-1)![0]).toContain("page=2");
    expect(PUSH).not.toHaveBeenCalled();
  });

  it("«Anterior» desde la 3 lleva a la 2 (no reinicia a la 1)", async () => {
    QUERY = "page=3";
    pintar();
    // La página 3 NO viene del servidor: hay que esperar a que llegue su lote.
    const anterior = await screen.findByRole("button", { name: /Anterior/ });
    fireEvent.click(anterior);
    expect(REPLACE.mock.calls.at(-1)![0]).toContain("page=2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. LO QUE **NO** CAMBIÓ — el drill-down sigue siendo `push`
// ─────────────────────────────────────────────────────────────────────────────

describe("entrar a la ficha sigue creando entrada de historial", () => {
  it("tocar la tarjeta del cliente hace PUSH a su ficha", () => {
    pintar();
    // La lista de tarjetas (celular e iPad) navega con el router.
    const tarjeta = document.querySelector('[data-vista="tarjetas"] li')!;
    fireEvent.click(tarjeta);
    expect(PUSH).toHaveBeenCalledWith("/clientes/D-25");
  });

  it("los dos layouts siguen declarados con su marca FIJA", () => {
    pintar();
    expect(document.querySelector('[data-vista="tarjetas"]')).toBeTruthy();
    expect(document.querySelector('[data-vista="tabla"]')).toBeTruthy();
  });
});
