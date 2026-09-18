// ─────────────────────────────────────────────────────────────────────────────
// PLANTILLA SWITCH › Configuración › Reglas — LAS MARCAS ARRANCAN PLEGADAS
// (17-sep-2026).
//
// Daniel, textual (7-sep-2026): «en configuraciones, las marcas deben de estar
// plegadas y al tocar desplegar para no irme tanto».
//
// 🩸 Lo que había: las CUATRO empresas con TODAS sus marcas y TODAS sus
// descripciones abiertas de una. En producción son 26 marcas y 304
// descripciones — para llegar a la última hay que pasar por todas.
//
// Lo que este candado exige:
//   · Ninguna descripción se ve al abrir la pantalla.
//   · Cada marca CON descripciones dice cuántas tiene («14 descripciones»,
//     «1 descripción») y se abre al tocarla; al tocarla de nuevo, se cierra.
//   · ⚠️ La marca SIN descripciones NO se pliega ni se esconde (Daniel: «no se
//     esconden»): su texto se lee sin tocar nada y no trae botón.
//   · Buscar una DESCRIPCIÓN abre sola la marca que la tiene — si no, el
//     buscador dejaría el resultado escondido adentro de una tarjeta cerrada.
//   · Las empresas siguen siendo títulos, siempre visibles.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MARCA_CATALOGO, type CatalogoDescripciones } from "@/lib/depurador/logic";

// Marca vacía real del catálogo (se dio de alta el 26-ago-2026 y nunca se le
// cargó nada). Daniel pidió que igual se vea.
const VACIA = "TH License";

const CATALOGO: CatalogoDescripciones = {
  "TH Menswear": ["Men-Prenda Uno", "Men-Prenda Dos"],
  "CK Jeans": ["Women-Prenda Tres"],
};
const FILAS = [
  { id: "id-polos", marca: "TH Menswear", descripcion: "Men-Prenda Uno" },
  { id: "id-tees", marca: "TH Menswear", descripcion: "Men-Prenda Dos" },
  { id: "id-denim", marca: "CK Jeans", descripcion: "Women-Prenda Tres" },
];

vi.mock("@/lib/hooks/useCatalogoDescripciones", () => ({
  CATALOGO_DESCRIPCIONES_KEY: "/api/productos/cargar/descripciones",
  useCatalogoDescripciones: () => ({
    catalogo: CATALOGO,
    filas: FILAS,
    cargando: false,
    fallo: false,
    reintentar: vi.fn(),
    agregarDescripcion: vi.fn(),
  }),
}));

vi.mock("swr", () => ({ mutate: vi.fn(), default: vi.fn() }));

import ReglasView, { SIN_DESCRIPCIONES, rotuloConteo } from "@/app/productos/cargar/ReglasView";

afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
});

const buscador = () => screen.getByLabelText("Buscar marca o descripción");

describe("🔴 al abrir la pantalla, NINGUNA descripción se ve", () => {
  it("las marcas están todas plegadas", () => {
    render(<ReglasView />);
    expect(screen.queryByText("Men-Prenda Uno")).toBeNull();
    expect(screen.queryByText("Men-Prenda Dos")).toBeNull();
    expect(screen.queryByText("Women-Prenda Tres")).toBeNull();
  });

  it("y ningún botón de quitar llega a dibujarse", () => {
    render(<ReglasView />);
    expect(screen.queryByLabelText("Quitar Men-Prenda Uno de TH Menswear")).toBeNull();
  });

  it("los nombres de las marcas SÍ se ven (plegar no es esconder)", () => {
    render(<ReglasView />);
    expect(screen.getByText("TH Menswear")).toBeTruthy();
    expect(screen.getByText("CK Jeans")).toBeTruthy();
  });

  it("las empresas siguen siendo títulos, siempre visibles", () => {
    render(<ReglasView />);
    for (const empresa of ["Vistana International", "Fashion Wear", "Fashion Shoes", "Active Wear"]) {
      expect(screen.getByText(empresa), `falta la empresa ${empresa}`).toBeTruthy();
    }
  });
});

describe("🔴 la marca dice cuántas descripciones tiene, plegada", () => {
  it("«2 descripciones» en plural y «1 descripción» en singular", () => {
    render(<ReglasView />);
    expect(screen.getByText("2 descripciones")).toBeTruthy();
    expect(screen.getByText("1 descripción")).toBeTruthy();
  });

  it("el rótulo sale de UNA función, no de dos textos tecleados", () => {
    expect(rotuloConteo(0)).toBe("0 descripciones");
    expect(rotuloConteo(1)).toBe("1 descripción");
    expect(rotuloConteo(14)).toBe("14 descripciones");
  });

  it("nunca más el «(N)» pelado de antes", () => {
    render(<ReglasView />);
    expect(screen.queryByText("(2)")).toBeNull();
    expect(screen.queryByText("(1)")).toBeNull();
  });
});

describe("🔴 se abre al tocarla, y se cierra al volver a tocarla", () => {
  it("un clic muestra sus descripciones", () => {
    render(<ReglasView />);
    fireEvent.click(screen.getByText("TH Menswear"));
    expect(screen.getByText("Men-Prenda Uno")).toBeTruthy();
    expect(screen.getByText("Men-Prenda Dos")).toBeTruthy();
    // La otra marca sigue cerrada: se abre UNA, no todas.
    expect(screen.queryByText("Women-Prenda Tres")).toBeNull();
  });

  it("el segundo clic la vuelve a cerrar", () => {
    render(<ReglasView />);
    fireEvent.click(screen.getByText("TH Menswear"));
    fireEvent.click(screen.getByText("TH Menswear"));
    expect(screen.queryByText("Men-Prenda Uno")).toBeNull();
  });

  it("abierta, el botón de quitar vuelve a estar", () => {
    render(<ReglasView />);
    fireEvent.click(screen.getByText("TH Menswear"));
    expect(screen.getByLabelText("Quitar Men-Prenda Uno de TH Menswear")).toBeTruthy();
  });

  it("el control que abre es tocable (44 px) y dice si está abierta", () => {
    render(<ReglasView />);
    const boton = screen.getByText("TH Menswear").closest("button") as HTMLButtonElement;
    expect(boton).toBeTruthy();
    expect(boton.className).toContain("min-h-[44px]");
    expect(boton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(boton);
    expect(
      (screen.getByText("TH Menswear").closest("button") as HTMLButtonElement).getAttribute("aria-expanded"),
    ).toBe("true");
  });
});

describe("🔴 la marca SIN descripciones no se pliega ni se esconde", () => {
  it("su texto se lee sin tocar nada", () => {
    render(<ReglasView />);
    expect(screen.getByText(VACIA)).toBeTruthy();
    // Todas las marcas del catálogo menos las dos con descripciones.
    const vacias = MARCA_CATALOGO.filter((c) => !CATALOGO[c.marca]).length;
    expect(screen.getAllByText(SIN_DESCRIPCIONES)).toHaveLength(vacias);
  });

  it("y no trae ningún botón: adentro no hay nada que abrir", () => {
    render(<ReglasView />);
    expect(screen.getByText(VACIA).closest("button")).toBeNull();
  });
});

describe("🔴 buscar una descripción abre sola la marca que la tiene", () => {
  it("el resultado se ve sin tener que tocar la tarjeta", () => {
    render(<ReglasView />);
    fireEvent.change(buscador(), { target: { value: "Prenda Tres" } });
    expect(screen.getByText("Women-Prenda Tres")).toBeTruthy();
  });

  it("buscar por NOMBRE de marca no la abre: la deja plegada, que es el punto", () => {
    render(<ReglasView />);
    fireEvent.change(buscador(), { target: { value: "TH Menswear" } });
    expect(screen.getByText("TH Menswear")).toBeTruthy();
    expect(screen.queryByText("Men-Prenda Uno")).toBeNull();
  });
});
