// ─────────────────────────────────────────────────────────────────────────────
// PLANTILLA SWITCH › «Reglas» — la pantalla minimalista (8-sep-2026).
//
// Daniel: «es solo para nosotros los usuarios ver en caso de algo, se usará muy
// poco… justo lo necesario y ordenado de manera minimalista».
//
// Lo que este candado exige:
//   · DOS secciones: cómo se elige la talla · descripciones por marca.
//     Los 8 principios de limpieza y la tabla de 22 reglas se fueron.
//   · El buscador busca EN LAS DESCRIPCIONES, no solo en los nombres de las
//     correcciones (antes la sección de marcas ignoraba la búsqueda entera).
//   · Las 7 marcas sin descripciones SE MUESTRAN (Daniel: «no se esconden»),
//     diciendo qué les pasa en vez de un «(0)» pelado.
//   · La secretaria puede QUITAR una descripción desde aquí.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { CASOS_TALLA, CASO_TALLA_RESTO, MARCA_CATALOGO, type CatalogoDescripciones } from "@/lib/depurador/logic";
import { CASOS_TALLA_REEBOK } from "@/lib/depurador/reebok";

// Las 7 marcas del catálogo que en producción no tienen una sola descripción
// (medido el 8-sep-2026). Se dieron de alta el 26-ago-2026 y nunca se les
// cargó nada; TH License lleva $158.464,45 facturados.
const VACIAS = [
  "KL Display & Promo", "KL Jeans", "KL Legwear", "KL Other", "KL Underwear",
  "TH Display & Promo", "TH License",
];

// Catálogo de mentira con la MISMA forma que el real: 26 marcas con algo y
// las 7 de arriba vacías.
const CATALOGO: CatalogoDescripciones = {};
const FILAS: { id: string; marca: string; descripcion: string }[] = [];
for (const { marca } of MARCA_CATALOGO) {
  if (VACIAS.includes(marca)) continue;
  const desc = `Men-Demo ${marca.replace(/[^A-Za-z]/g, "")}`;
  CATALOGO[marca] = [desc];
  FILAS.push({ id: `id-${marca.replace(/[^A-Za-z]/g, "")}`, marca, descripcion: desc });
}
// Dos descripciones reales bajo TH Menswear, para el buscador y el «Quitar».
CATALOGO["TH Menswear"] = ["Men-Polos S/S", "Men-T-Shirts S/S"];
FILAS.push(
  { id: "id-polos", marca: "TH Menswear", descripcion: "Men-Polos S/S" },
  { id: "id-tees", marca: "TH Menswear", descripcion: "Men-T-Shirts S/S" },
);

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

import ReglasView from "@/app/productos/cargar/ReglasView";

afterEach(cleanup);
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
});

const buscador = () => screen.getByLabelText("Buscar marca o descripción");

describe("🔴 quedan DOS secciones y nada más", () => {
  it("están «Cómo se elige la talla» y «Descripciones por marca»", () => {
    render(<ReglasView />);
    expect(screen.getByText("Cómo se elige la talla")).toBeTruthy();
    expect(screen.getByText("Descripciones por marca")).toBeTruthy();
  });

  it("se fueron los principios de limpieza y la tabla de 22 reglas", () => {
    render(<ReglasView />);
    expect(screen.queryByText("Principios de limpieza")).toBeNull();
    expect(screen.queryByText(/Reglas de normalización/)).toBeNull();
  });

  it("la tabla de talla dibuja TODOS los casos del código, uno por uno", () => {
    render(<ReglasView />);
    const tabla = screen.getByRole("table", { name: "Cómo se elige la talla" });
    // Encabezado + un renglón por caso + el «resto».
    expect(within(tabla).getAllByRole("row")).toHaveLength(CASOS_TALLA.length + 2);
    for (const c of [...CASOS_TALLA, CASO_TALLA_RESTO]) {
      expect(within(tabla).getByText(c.caso), `falta el caso «${c.caso}»`).toBeTruthy();
      expect(within(tabla).getByText(c.detecta), `falta «${c.detecta}»`).toBeTruthy();
    }
    expect(screen.getByText("Short de baño")).toBeTruthy();
  });

  it("la lista de Reebok dibuja TODOS sus casos, uno por uno", () => {
    render(<ReglasView />);
    expect(screen.getByText("Reebok · Active Shoes (talla-muestra)")).toBeTruthy();
    for (const c of CASOS_TALLA_REEBOK) {
      expect(screen.getByText(c.caso), `falta el caso «${c.caso}»`).toBeTruthy();
      expect(screen.getByText(`→ ${c.talla}`), `falta la talla de «${c.caso}»`).toBeTruthy();
    }
  });

  it("las correcciones de nombre son 10 y dicen lo que sale al Excel", () => {
    render(<ReglasView />);
    expect(screen.getByText("Nombres que se corrigen solos (10)")).toBeTruthy();
    const tabla = screen.getByRole("table", { name: "Nombres que se corrigen solos" });
    expect(within(tabla).getAllByRole("row")).toHaveLength(11); // encabezado + 10
    // La fila dice lo que sale al EXCEL, no el valor crudo del mapa.
    expect(within(tabla).getByText("Men-Polo S/S")).toBeTruthy();   // como lo manda el proveedor
    expect(within(tabla).getByText("Men-Polos S/S")).toBeTruthy();  // como sale al Excel
    // La fila que mentía no está.
    expect(within(tabla).queryByText("Boys-Shirts - Woven Tops S-S")).toBeNull();
  });
});

describe("🔴 el buscador busca EN LAS DESCRIPCIONES", () => {
  it("escribir una descripción deja solo la marca que la tiene", () => {
    render(<ReglasView />);
    fireEvent.change(buscador(), { target: { value: "T-Shirts" } });
    expect(screen.getByText("TH Menswear")).toBeTruthy();
    expect(screen.queryByText("CK Jeans")).toBeNull();
    expect(screen.queryByText("TH License")).toBeNull();
  });

  it("una descripción que no existe en ninguna marca no deja ninguna tarjeta", () => {
    render(<ReglasView />);
    fireEvent.change(buscador(), { target: { value: "zzz-no-existe" } });
    expect(screen.queryByText("CK Jeans")).toBeNull();
    expect(screen.queryByText("TH Menswear")).toBeNull();
    expect(screen.queryByText("TH License")).toBeNull();
  });

  it("buscar por nombre de marca sigue funcionando", () => {
    render(<ReglasView />);
    fireEvent.change(buscador(), { target: { value: "th license" } });
    expect(screen.getByText("TH License")).toBeTruthy();
    expect(screen.queryByText("CK Jeans")).toBeNull();
  });
});

describe("🔴 las 7 marcas sin descripciones se MUESTRAN", () => {
  it("dicen qué les pasa, no un «(0)» pelado", () => {
    render(<ReglasView />);
    // Las 7 medidas el 8-sep-2026.
    for (const m of [
      "KL Display & Promo", "KL Jeans", "KL Legwear", "KL Other", "KL Underwear",
      "TH Display & Promo", "TH License",
    ]) {
      expect(screen.getByText(m), `falta ${m}`).toBeTruthy();
    }
    expect(screen.getAllByText("Todavía sin descripciones cargadas").length).toBe(7);
    expect(screen.queryByText("(0)")).toBeNull();
  });
});

describe("🔴 la secretaria puede QUITAR una descripción desde aquí", () => {
  it("cada descripción trae su botón de quitar, y desactiva (no borra)", async () => {
    render(<ReglasView />);
    const boton = screen.getByLabelText("Quitar Men-Polos S/S de TH Menswear");
    // 44 px de alto, la regla de la casa para todo lo que se toca.
    expect(boton.className).toContain("h-[44px]");
    fireEvent.click(boton);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/productos/cargar/descripciones/id-polos");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ activa: false });
  });

  it("la marca vacía no dibuja ningún botón de quitar", () => {
    render(<ReglasView />);
    const tarjeta = screen.getByText("TH License").parentElement as HTMLElement;
    expect(within(tarjeta).getByText("Todavía sin descripciones cargadas")).toBeTruthy();
    expect(within(tarjeta).queryAllByRole("button")).toHaveLength(0);
  });
});
