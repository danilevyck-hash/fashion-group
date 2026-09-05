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
  { id: "1", codigo: "D-25", nombre: "CITY MALL PASO CANOA", razon_social: null, telefono: "507-1", celular: null, email: null, debe: 100 },
  { id: "2", codigo: "D-24", nombre: "CITY MALL DAVID", razon_social: null, telefono: null, celular: null, email: null, debe: 0 },
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
      <ClientesListClient initialClientes={CLIENTES} />
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

  it("volver de una ficha con la búsqueda puesta la muestra Y filtra la lista", async () => {
    // Es el defecto exacto: se entra a `/clientes/D-25` y se vuelve. La URL trae
    // el estado; antes se perdía porque vivía en `useState`.
    //
    // ⚠️ 5-sep-2026: la lista ya no se pide por red (llegan los 150 del
    // servidor y el buscador filtra en memoria), así que lo que se comprueba es
    // lo que de verdad importaba — que el término VUELVA y que la lista quede
    // filtrada por él.
    QUERY = "search=PASO";
    pintar();
    expect(buscador().value).toBe("PASO");
    // ⚠️ `getAllBy`: la pantalla dibuja los dos layouts (tabla y tarjetas) y el
    // nombre aparece en los dos. Buscar con `getBy` encontraría dos y fallaría
    // sin decir nada sobre el filtro, que es lo que se está probando.
    await waitFor(() => {
      expect(screen.getAllByText("CITY MALL PASO CANOA").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("CITY MALL DAVID").length).toBe(0);
    });
  });

  it("🔴 el CHIP también viaja en la URL, con REPLACE", () => {
    // 5-sep-2026: reemplaza al desplegable de provincia, que se retiró (99 de
    // los 150 clientes no la tienen; Daniel: «si, no sirve»). Un chip es un
    // filtro del MISMO nivel: `replace`, nunca `push`.
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /Sin correo/ }));
    expect(REPLACE).toHaveBeenCalled();
    expect(REPLACE.mock.calls.at(-1)![0]).toContain("filtro=sin-correo");
    expect(PUSH).not.toHaveBeenCalled();
  });

  it("⚠️ el desplegable de provincia no volvió", () => {
    pintar();
    expect(screen.queryByDisplayValue("Todas las provincias")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. LA PÁGINA TAMBIÉN
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 YA NO HAY PÁGINAS — los 150 en una sola lista", () => {
  // ⚠️ CAMBIÓ DE DIRECCIÓN EL 5-sep-2026. La paginación de a 50 se retiró: se
  // muestran los 150 con scroll. Daniel lo eligió sobre cortar por «activos» por
  // una razón medida: **Outlet Duty Free S.A. (D-119) facturó $21.826,00 este
  // año** —4 facturas, la última el 27-ago— y con un corte por actividad ese
  // cliente desaparecería estando vivo (su neto es cero porque el 1-sep le
  // entraron cuatro notas de crédito por los mismos montos).
  //
  // El candado ya no protege que la página viva en la URL: protege que **no
  // haya páginas**, que es lo que hace que el problema no pueda volver.
  it("no hay botones de paginar", () => {
    pintar();
    expect(screen.queryByRole("button", { name: /Siguiente/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Anterior/ })).toBeNull();
  });

  it("se dibujan TODOS los clientes que mandó el servidor", () => {
    pintar();
    const filas = document.querySelectorAll('[data-vista="tarjetas"] li');
    expect(filas.length).toBe(CLIENTES.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. LO QUE **NO** CAMBIÓ — el drill-down sigue siendo `push`
// ─────────────────────────────────────────────────────────────────────────────

describe("entrar a la ficha sigue creando entrada de historial", () => {
  it("tocar la tarjeta del cliente hace PUSH a su ficha", () => {
    pintar();
    // La lista de tarjetas (celular e iPad) navega con el router.
    // ⚠️ La lista arranca ordenada A→Z, así que la primera tarjeta es D-24
    // (CITY MALL DAVID). Se busca la de D-25 por su código, no por su posición.
    const tarjetas = [...document.querySelectorAll('[data-vista="tarjetas"] li')];
    const tarjeta = tarjetas.find((t) => t.textContent?.includes("D-25"))!;
    fireEvent.click(tarjeta);
    expect(PUSH).toHaveBeenCalledWith("/clientes/D-25");
  });

  it("los dos layouts siguen declarados con su marca FIJA", () => {
    pintar();
    expect(document.querySelector('[data-vista="tarjetas"]')).toBeTruthy();
    expect(document.querySelector('[data-vista="tabla"]')).toBeTruthy();
  });
});
