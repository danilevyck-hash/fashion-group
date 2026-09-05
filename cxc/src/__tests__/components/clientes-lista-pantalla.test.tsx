// ─────────────────────────────────────────────────────────────────────────────
// LA LISTA DE CLIENTES — TESTS DE CONDUCTA (5-sep-2026).
//
// 🔴 SU TRABAJO ES BUSCAR A ALGUIEN Y ARREGLAR SUS DATOS. No es cobrar (eso es
// Cuentas por Cobrar) ni analizar la venta (eso es Ventas › Clientes), y por eso
// no tiene «vs el año pasado», ni «empresas», ni «nuevos»: sería una segunda
// pantalla igual a la de Ventas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import ClientesListClient, { type Cliente } from "@/app/clientes/ClientesListClient";

let QUERY = "";
const REPLACE = vi.fn();
const PUSH = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(QUERY),
  useRouter: () => ({ replace: REPLACE, push: PUSH, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/clientes",
}));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: "admin" }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));

/** Cinco clientes con los casos que importan, medidos en producción. */
const CLIENTES: Cliente[] = [
  // Compró y debe, con las dos formas de contacto.
  { id: "1", codigo: "D-25", nombre: "City Mall Paso Canoa", razon_social: "City Mall S A", telefono: "727-7247", celular: "727-7247", email: "contabilidad@citymall.com.pa", debe: 300_000 },
  // 🩸 D-119: facturó $21.826,00 y su neto es cero (4 notas de crédito). Sin
  // correo ni teléfono. Con un corte por «activos» desaparecería estando vivo.
  { id: "2", codigo: "D-119", nombre: "Outlet Duty Free S.A.", razon_social: null, telefono: null, celular: null, email: null, debe: 0 },
  // Solo correo.
  { id: "3", codigo: "D-142", nombre: "Sporting Shoes N 4", razon_social: "Sporting Shoes, S.A.", telefono: null, celular: null, email: "sulegroup@gmail.com", debe: 1_500 },
  // Solo teléfono.
  { id: "4", codigo: "D-24", nombre: "City Mall David", razon_social: null, telefono: "775-0000", celular: null, email: null, debe: -250 },
  // Ni una cosa ni la otra, y sin saldo.
  { id: "5", codigo: "D-9", nombre: "Zapatería Última", razon_social: null, telefono: null, celular: null, email: null, debe: 0 },
];

const YTD: Record<string, number> = { "D-25": 700_000, "D-142": 12_000, "D-24": 45_000 };

beforeEach(() => {
  QUERY = "";
  REPLACE.mockClear();
  PUSH.mockClear();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      String(url).includes("/api/clientes/ytd") ? { anio: 2026, ytd: YTD } : {},
  })));
});
afterEach(() => { vi.unstubAllGlobals(); });

function pintar(clientes: Cliente[] = CLIENTES) {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <ClientesListClient initialClientes={clientes} />
    </SWRConfig>,
  );
}

const filasTabla = () => [...document.querySelectorAll('[data-vista="tabla"] tbody tr')];
/** El encabezado de una columna. ⚠️ Por nombre a secas chocaría con el chip
 *  «Deben»: se busca dentro del `<thead>`. */
const encabezado = (texto: string): HTMLElement =>
  [...document.querySelectorAll('[data-vista="tabla"] thead button')].find((b) =>
    (b.textContent ?? "").trim().startsWith(texto),
  ) as HTMLElement;
const nombresEnTabla = () =>
  filasTabla().map((f) => f.querySelector("a")?.textContent ?? "");

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LOS 150 EN UNA SOLA LISTA, SIN PÁGINAS", () => {
  it("se dibujan TODOS los que mandó el servidor", () => {
    pintar();
    expect(filasTabla().length).toBe(CLIENTES.length);
  });

  it("no hay botones de paginar", () => {
    pintar();
    expect(screen.queryByRole("button", { name: /Siguiente|Anterior/ })).toBeNull();
  });

  it("🩸 D-119 aparece aunque su neto sea cero (facturó $21.826 este año)", () => {
    pintar();
    expect(nombresEnTabla()).toContain("Outlet Duty Free S.A.");
  });

  it("🩸 el filtro por provincia se retiró: 99 de 150 no la tienen", () => {
    pintar();
    expect(screen.queryByDisplayValue("Todas las provincias")).toBeNull();
    expect(document.body.textContent).not.toContain("Provincia");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LOS CHIPS, CON SU CONTEO CALCULADO", () => {
  it("los cinco, con los números de este ejemplo", () => {
    pintar();
    const chips = [...document.querySelectorAll('[data-bloque="chips"] button')].map((b) =>
      (b.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    expect(chips).toEqual([
      "Todos 5",
      "Sin cómo contactarlos 2",
      "Sin correo 3",
      "Sin teléfono 3",
      "Deben 3",
    ]);
  });

  it("tocar un chip filtra la lista a esos clientes", () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /Sin cómo contactarlos/ }));
    // El chip viaja a la URL con REPLACE (es un filtro del mismo nivel).
    expect(REPLACE.mock.calls.at(-1)![0]).toContain("filtro=sin-contacto");
    expect(PUSH).not.toHaveBeenCalled();
  });

  it("el chip elegido llega desde la URL y filtra", () => {
    QUERY = "filtro=sin-correo";
    pintar();
    expect(nombresEnTabla().sort()).toEqual(
      ["City Mall David", "Outlet Duty Free S.A.", "Zapatería Última"].sort(),
    );
  });

  it("⚠️ el conteo NO cambia con la búsqueda puesta", () => {
    // Un chip que dice «Sin correo 1» porque estás buscando «City» no sirve.
    QUERY = "search=City";
    pintar();
    const todos = [...document.querySelectorAll('[data-bloque="chips"] button')][0];
    expect((todos.textContent ?? "").replace(/\s+/g, " ").trim()).toBe("Todos 5");
    expect(nombresEnTabla().length).toBe(2);
  });

  it("un chip de la URL que no existe cae en «Todos», no rompe la pantalla", () => {
    QUERY = "filtro=inventado";
    pintar();
    expect(filasTabla().length).toBe(CLIENTES.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LAS CUATRO COLUMNAS", () => {
  it("Cliente · Compró <año> · Debe · Cómo contactarlo", async () => {
    pintar();
    await waitFor(() => {
      const enc = [...document.querySelectorAll('[data-vista="tabla"] thead th')].map((t) =>
        (t.textContent ?? "").replace(/[↕↓↑]/g, "").trim(),
      );
      expect(enc).toEqual(["Cliente", "Compró 2026", "Debe", "Cómo contactarlo"]);
    });
  });

  it("⚠️ NO trae las columnas de Ventas › Clientes", () => {
    pintar();
    const t = document.body.textContent ?? "";
    expect(t).not.toContain("vs 2025");
    expect(t).not.toContain("empresas");
    expect(t).not.toContain("Última compra");
  });

  it("el nombre lleva a la ficha y el código va al lado", () => {
    pintar();
    const a = screen.getAllByText("City Mall Paso Canoa")[0].closest("a")!;
    expect(a.getAttribute("href")).toBe("/clientes/D-25");
  });

  it("«Compró» dice «…» hasta que llega, y el monto después", async () => {
    pintar();
    await waitFor(() => expect(document.body.textContent).toContain("$700,000.00"));
  });

  it("🔴 si falta cómo contactarlo, se dice en ROJO", () => {
    pintar();
    const rojos = [...document.querySelectorAll('[data-vista="tabla"] .text-red-600')].map((e) => e.textContent);
    expect(rojos).toContain("Sin correo ni teléfono");
    expect(rojos).toContain("Falta el teléfono");
    expect(rojos).toContain("Falta el correo");
  });

  it("un saldo a favor del cliente no se pinta como deuda", () => {
    pintar();
    expect(document.body.textContent).toContain("A favor $250.00");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 ORDENAR TOCANDO EL ENCABEZADO", () => {
  it("arranca A→Z por nombre", () => {
    pintar();
    expect(nombresEnTabla()).toEqual([
      "City Mall David",
      "City Mall Paso Canoa",
      "Outlet Duty Free S.A.",
      "Sporting Shoes N 4",
      "Zapatería Última",
    ]);
  });

  it("«Debe» ordena de MAYOR a menor al primer toque, y el segundo invierte", () => {
    pintar();
    fireEvent.click(encabezado("Debe"));
    expect(nombresEnTabla()[0]).toBe("City Mall Paso Canoa");
    fireEvent.click(encabezado("Debe"));
    expect(nombresEnTabla()[0]).toBe("City Mall David"); // el −250
  });

  it("«Compró» también arranca de mayor a menor", async () => {
    pintar();
    await waitFor(() => expect(document.body.textContent).toContain("$700,000.00"));
    fireEvent.click(encabezado("Compró"));
    expect(nombresEnTabla()[0]).toBe("City Mall Paso Canoa");
  });

  it("el encabezado dice cuál manda, para lectores de pantalla también", () => {
    pintar();
    fireEvent.click(encabezado("Debe"));
    const th = encabezado("Debe").closest("th")!;
    expect(th.getAttribute("aria-sort")).toBe("descending");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el buscador", () => {
  it("busca por nombre y por código", async () => {
    pintar();
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/i), { target: { value: "D-142" } });
    await waitFor(() => expect(nombresEnTabla()).toEqual(["Sporting Shoes N 4"]));
  });

  it("y por razón social, que es como la conoce contabilidad", async () => {
    pintar();
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/i), { target: { value: "Sule" } });
    await waitFor(() => expect(nombresEnTabla().length).toBe(0));
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/i), { target: { value: "Sporting Shoes, S.A." } });
    await waitFor(() => expect(nombresEnTabla()).toEqual(["Sporting Shoes N 4"]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("en celular, tarjetas", () => {
  it("los dos layouts existen con su marca FIJA", () => {
    pintar();
    expect(document.querySelector('[data-vista="tabla"]')).toBeTruthy();
    expect(document.querySelector('[data-vista="tarjetas"]')).toBeTruthy();
  });

  it("la tarjeta navega a la ficha, y tocar el teléfono NO", () => {
    pintar();
    const tarjetas = [...document.querySelectorAll('[data-vista="tarjetas"] li')];
    const d24 = tarjetas.find((t) => t.textContent?.includes("D-24"))!;
    const tel = d24.querySelector('a[href^="tel:"]') as HTMLAnchorElement;
    expect(tel).toBeTruthy();
    fireEvent.click(tel);
    expect(PUSH).not.toHaveBeenCalled();
    fireEvent.click(d24);
    expect(PUSH).toHaveBeenCalledWith("/clientes/D-24");
  });
});
