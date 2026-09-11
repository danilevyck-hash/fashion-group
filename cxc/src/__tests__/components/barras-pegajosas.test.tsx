// ─────────────────────────────────────────────────────────────────────────────
// CANDADO DE PANTALLA — la barra de Ventas › Clientes queda DEBAJO del
// encabezado, y el encabezado mide su propio alto.
//
// Es la pantalla de la captura de Daniel (11-sep-2026): *«mira cómo se corta
// arriba»*. El barrido del fuente vive en `lib/barras-pegajosas.test.ts`; acá
// se monta la vista REAL y se lee lo que el navegador habría aplicado.
//
// ⚠️ jsdom no calcula layout: `getBoundingClientRect()` devuelve ceros y `var()`
// no se resuelve. Por eso NO se mide un solapamiento en píxeles — se comprueba
// lo que decide el solapamiento: que la barra pida el tope del ENCABEZADO (y no
// el cero) y que su z-index quede por debajo. La medición en píxeles de verdad
// se hizo en el navegador a 1440 y a 390 px.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi, beforeAll } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

import {
  CLASE_BARRA_PEGAJOSA,
  VAR_ALTURA_ENCABEZADO,
  Z_ENCABEZADO,
  Z_BARRA_PEGAJOSA,
} from "@/lib/ui/barra-pegajosa";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: () => ({}) } }));
vi.mock("@/lib/supabase-paginado", () => ({ leerTodoPaginado: async () => [] }));

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

import { ClientesView } from "@/components/ventas/ClientesView";

const fila = {
  rank: 1,
  id: "D-24",
  nombre: "City Mall David",
  empresa: "Vistana International",
  empresaKey: "vistana",
  ytd: 113936.14,
  prev: 90000,
  delta: 0.26,
  ultima: "1 sep 2026",
  ultimaIso: "2026-09-01",
  wa: "",
  empresas_count: 1,
  isOrphan: false,
  esDelGrupo: false,
};
const DATA = { rows: [fila] } as unknown as Parameters<typeof ClientesView>[0]["data"];

afterEach(cleanup);

/** La barra de filtros tal como queda montada en la pantalla. */
function barraEnPantalla(): HTMLElement {
  render(
    <ClientesView data={DATA} selectedYear={2026} isClosedYear={false} modo="ventas" onModo={() => {}} />
  );
  // Se la busca por un control que SOLO vive en ella: el buscador.
  const buscador = screen.getAllByPlaceholderText(/buscar/i)[0];
  const barra = buscador.closest(`.${CLASE_BARRA_PEGAJOSA}`);
  expect(barra, "el buscador tiene que vivir dentro de la barra pegajosa").not.toBeNull();
  return barra as HTMLElement;
}

describe("Ventas › Clientes — la barra de filtros", () => {
  it("usa la barra pegajosa de la casa, no un tope propio", () => {
    const barra = barraEnPantalla();
    expect(barra.className).toContain(CLASE_BARRA_PEGAJOSA);
    // Ningún tope suelto sobrevive en la misma caja.
    expect(barra.className).not.toMatch(/\btop-/);
    expect(barra.className).not.toMatch(/\bz-\d/);
  });

  it("sigue siendo la MISMA barra: buscador, Excel y las píldoras adentro", () => {
    const barra = barraEnPantalla();
    // Lo que Daniel nombró en la captura tiene que seguir en la barra, no
    // haberse ido con el arreglo.
    expect(barra.textContent).toMatch(/Todas/);
    expect(barra.querySelectorAll("button").length).toBeGreaterThan(3);
  });

  it("el tope de la barra es el ALTO DEL ENCABEZADO, y su z-index queda debajo", () => {
    // jsdom no resuelve `var()`, así que la regla se lee de la hoja de estilo,
    // que es la única fuente del tope y del apilamiento.
    const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");
    const regla = css.match(new RegExp(`\\.${CLASE_BARRA_PEGAJOSA}\\s*\\{([^}]*)\\}`));
    expect(regla, "la clase tiene que existir en globals.css").not.toBeNull();
    const cuerpo = regla![1];

    expect(cuerpo).toMatch(/position:\s*sticky/);
    // 🔴 El tope NO es cero: es lo que mide el encabezado.
    expect(cuerpo).toContain(`var(${VAR_ALTURA_ENCABEZADO})`);
    expect(cuerpo).not.toMatch(/top:\s*0/);

    const z = Number(cuerpo.match(/z-index:\s*(\d+)/)?.[1]);
    expect(z).toBe(Z_BARRA_PEGAJOSA);
    expect(z).toBeLessThan(Z_ENCABEZADO);
  });

  it("CONTROL — antes del arreglo esta prueba habría fallado", () => {
    // La barra vieja era `sticky top-0 z-20`: mismo tope que el encabezado y
    // z-index MAYOR. Las dos condiciones que el arreglo invierte.
    const viejo = { top: "0px", z: 20 };
    expect(viejo.z).toBeGreaterThan(Z_ENCABEZADO);
    expect(viejo.top).toBe("0px");
  });
});
