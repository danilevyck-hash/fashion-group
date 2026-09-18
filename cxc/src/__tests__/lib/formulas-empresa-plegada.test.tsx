// ─────────────────────────────────────────────────────────────────────────────
// PLANTILLA SWITCH › Configuración › Fórmulas — LA EMPRESA SE PLIEGA
// (17-sep-2026).
//
// Daniel, textual (7-sep-2026): «en vistana por ejemplo si toco que se me
// despliegue todas las marcas de vistana» · «los nombres no me convencen y mira
// el layout no se ve ordenado».
//
// 🩸 Lo que había: el encabezado de la compañía era un <div> ESTÁTICO. Las
// cinco compañías salían con todas sus marcas listadas de una, y lo único que
// se plegaba era cada marca (para ver sus descripciones).
//
// Lo que este candado exige:
//   · Las compañías se ven siempre, con cuántas marcas tiene cada una.
//   · Arrancan TODAS cerradas: ninguna marca se ve al abrir la pantalla.
//   · Al tocar una compañía salen SUS marcas, y solo las suyas.
//   · 🔑 SON DOS NIVELES: abrir la compañía NO abre sus marcas — el plegado por
//     marca que ya existía se conserva intacto.
//   · Buscar abre las compañías que tienen resultados (si no, el buscador
//     dejaría la coincidencia escondida adentro de una cerrada).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MARCA_CATALOGO, type CatalogoDescripciones } from "@/lib/depurador/logic";

// Catálogo de descripciones de mentira: solo hace falta para el cuerpo de una
// marca abierta, que este candado no toca.
const CATALOGO: CatalogoDescripciones = { "CK Jeans": ["Men-Prenda Uno"] };

vi.mock("@/lib/hooks/useCatalogoDescripciones", () => ({
  CATALOGO_DESCRIPCIONES_KEY: "/api/productos/cargar/descripciones",
  useCatalogoDescripciones: () => ({
    catalogo: CATALOGO,
    filas: [],
    cargando: false,
    fallo: false,
    reintentar: vi.fn(),
    agregarDescripcion: vi.fn(),
  }),
}));

import FormulasConfig, { rotuloMarcas } from "@/app/productos/cargar/FormulasConfig";

afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [] }) }));
});

/** Cuántas marcas del catálogo tiene cada compañía (lo que debe decir el
 *  rótulo). Se DERIVA de MARCA_CATALOGO: no hay número tecleado. */
const marcasDe = (empresa: string) => MARCA_CATALOGO.filter((c) => c.empresa === empresa).length;

const encabezado = (empresa: string) =>
  screen.getByText(empresa).closest("button") as HTMLButtonElement;

// ⚠️ `MarcaCard` dibuja el nombre de la marca DOS veces —la tarjeta de celular
// y la grilla de escritorio conviven en el DOM y se esconden por CSS—, así que
// contar es `getAllByText`. Lo que se afirma es «se ve» / «no se ve».
const seVe = (t: string) => screen.queryAllByText(t).length > 0;

describe("🔴 las compañías se ven, y arrancan todas CERRADAS", () => {
  it("los nombres de las cuatro compañías están a la vista", () => {
    render(<FormulasConfig />);
    for (const empresa of ["Vistana International", "Fashion Wear", "Fashion Shoes", "Active Wear"]) {
      expect(screen.getByText(empresa), `falta la compañía ${empresa}`).toBeTruthy();
    }
  });

  it("ninguna marca se ve al abrir la pantalla", () => {
    render(<FormulasConfig />);
    for (const { marca } of MARCA_CATALOGO) {
      expect(seVe(marca), `«${marca}» no debería verse plegada`).toBe(false);
    }
  });

  it("cada compañía dice cuántas marcas tiene", () => {
    render(<FormulasConfig />);
    expect(encabezado("Vistana International").textContent).toContain(
      rotuloMarcas(marcasDe("Vistana International")),
    );
    expect(encabezado("Fashion Shoes").textContent).toContain(rotuloMarcas(marcasDe("Fashion Shoes")));
  });

  it("el rótulo sale de UNA función, no de dos textos tecleados", () => {
    expect(rotuloMarcas(0)).toBe("0 marcas");
    expect(rotuloMarcas(1)).toBe("1 marca");
    expect(rotuloMarcas(9)).toBe("9 marcas");
  });

  it("el encabezado es tocable (44 px) y dice si está abierta", () => {
    render(<FormulasConfig />);
    const boton = encabezado("Vistana International");
    expect(boton.className).toContain("min-h-[44px]");
    expect(boton.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("🔴 al tocar una compañía salen SUS marcas, y solo las suyas", () => {
  it("Vistana abre las de Vistana y deja cerradas las de Fashion Wear", () => {
    render(<FormulasConfig />);
    fireEvent.click(encabezado("Vistana International"));
    for (const c of MARCA_CATALOGO) {
      if (c.empresa === "Vistana International") {
        expect(seVe(c.marca), `falta «${c.marca}»`).toBe(true);
      } else if (c.empresa === "Fashion Wear") {
        expect(seVe(c.marca), `«${c.marca}» es de otra compañía`).toBe(false);
      }
    }
    expect(encabezado("Vistana International").getAttribute("aria-expanded")).toBe("true");
  });

  it("el segundo toque la vuelve a cerrar", () => {
    render(<FormulasConfig />);
    fireEvent.click(encabezado("Vistana International"));
    fireEvent.click(encabezado("Vistana International"));
    for (const c of MARCA_CATALOGO.filter((x) => x.empresa === "Vistana International")) {
      expect(seVe(c.marca), `«${c.marca}» debería haberse vuelto a plegar`).toBe(false);
    }
  });
});

describe("🔑 son DOS niveles: abrir la compañía no abre sus marcas", () => {
  it("la marca sigue plegada: sus descripciones no se ven todavía", () => {
    render(<FormulasConfig />);
    fireEvent.click(encabezado("Vistana International"));
    expect(seVe("CK Jeans")).toBe(true);
    // El cuerpo de la marca (sus descripciones) sigue cerrado.
    expect(seVe("Men-Prenda Uno")).toBe(false);
  });

  it("y el plegado por marca de siempre sigue funcionando adentro", () => {
    render(<FormulasConfig />);
    fireEvent.click(encabezado("Vistana International"));
    fireEvent.click(screen.queryAllByText("CK Jeans")[0]);
    expect(seVe("Men-Prenda Uno")).toBe(true);
  });
});

describe("🔴 buscando, la compañía con resultados se abre sola", () => {
  it("la marca buscada se ve sin tener que abrir su compañía", () => {
    render(<FormulasConfig />);
    fireEvent.change(screen.getByPlaceholderText("Buscar marca o descripción…"), {
      target: { value: "CK Jeans" },
    });
    expect(seVe("CK Jeans")).toBe(true);
  });

  it("y la compañía que no tiene resultados no se dibuja", () => {
    render(<FormulasConfig />);
    fireEvent.change(screen.getByPlaceholderText("Buscar marca o descripción…"), {
      target: { value: "CK Jeans" },
    });
    expect(screen.queryByText("Fashion Wear")).toBeNull();
  });
});
