// ─────────────────────────────────────────────────────────────────────────────
// CANDADO de "UN TOQUE, NO CUATRO": el filtro de marca filtra TODO lo de abajo.
//
// 🩸 El riesgo real de esta pantalla no es la matemática (esa ya está congelada
// en multifashion-marcas-grupo.test.ts): es que el filtro llegue a unos bloques y
// a otros no. Un pulso de Tommy arriba con la tabla de todas las marcas abajo se
// ve perfectamente normal y es una pantalla mintiendo — nadie la puede cuadrar.
//
// Por eso este test RENDERIZA el componente real, toca la marca y mira los CINCO
// bloques: el pulso (y su comparación contra el año pasado), las dos listas de
// arriba, "lo que más cambió", la tabla completa y el agrupador por departamento.
//
// El payload se arma con las MISMAS funciones que usa la ruta (`agregarRanking`,
// `armarPorMarca`, `armarPorMarcaComparativo`), así que el fixture no puede
// contradecir al servidor: si el servidor cambia de forma, este test se entera.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import {
  agregarRanking,
  type FilaArticuloDiario,
} from "@/lib/multifashion/productos-ranking";
import { agregarProductos } from "@/lib/multifashion/productos";
import {
  armarPorMarca,
  armarPorMarcaComparativo,
  departamentoCanonico,
  grupoDeDepartamento,
  mapaArticuloGrupo,
} from "@/lib/multifashion/productos-marca";

// ── Fixture: 3 marcas con categorías, códigos y montos que no se pisan ───────
const dicc = [
  { articulo_id: 1, marca_id: 10, marca_nombre: "TH MENSWEAR" },
  { articulo_id: 2, marca_id: 11, marca_nombre: "TH ACCESORIES" }, // mal escrito
  { articulo_id: 3, marca_id: 12, marca_nombre: "TH ACCESSORIES" },
  { articulo_id: 4, marca_id: 20, marca_nombre: "KL FOOTWEAR" },
  { articulo_id: 5, marca_id: 30, marca_nombre: "RBK FOOTWEAR" },
];

const f = (
  articulo_id: number,
  codigo: string,
  descripcion: string,
  tipo: string,
  cantidad_total: number,
  venta_total: number,
  costo_total: number,
): FilaArticuloDiario => ({ articulo_id, codigo, descripcion, tipo, cantidad_total, venta_total, costo_total });

// Tommy 6.000, Karl 1.000, Reebok 500 → total 7.500
const ACTUAL: FilaArticuloDiario[] = [
  f(1, "TH-CAMISA", "Tommy-Camisas", "FA", 40, 4000, 2000),
  f(2, "TH-CINTO", "Tommy-Cintos", "FA", 10, 1100, 600),
  f(3, "TH-GORRA", "Tommy-Gorras", "FA", 10, 1000, 500),
  f(2, "TH-CINTO", "Tommy-Cintos", "NC", 1, 100, 60), // devolución
  f(4, "KL-BOTA", "Karl-Botas", "FA", 8, 1000, 800), // margen 20%
  f(5, "RBK-TENIS", "Reebok-Tenis", "FA", 5, 500, 420), // margen 16%
];

// El año pasado: Tommy vendía 5.000 y Karl 900. Reebok no existía.
const ANTERIOR: FilaArticuloDiario[] = [
  f(1, "TH-CAMISA", "Tommy-Camisas", "FA", 35, 3500, 1800),
  f(2, "TH-CINTO", "Tommy-Cintos", "FA", 12, 1500, 800),
  f(4, "KL-BOTA", "Karl-Botas", "FA", 7, 900, 700),
];

function armarPayload() {
  const diccCanon = dicc.map(m => ({ ...m, marca_nombre: departamentoCanonico(m.marca_nombre) }));
  const mapa = mapaArticuloGrupo(diccCanon);
  const resumen = agregarProductos(ACTUAL, diccCanon, 50);
  const cat = agregarRanking(ACTUAL, "categoria");
  const cod = agregarRanking(ACTUAL, "codigo");
  const compCat = agregarRanking(ANTERIOR, "categoria");
  const compCod = agregarRanking(ANTERIOR, "codigo");
  return {
    year: 2026,
    mes: 8,
    periodo: "12m" as const,
    desde: "2025-09-01",
    hasta: "2026-08-08",
    filasLeidas: ACTUAL.length,
    marcaDisponible: true,
    marcaError: null,
    ...resumen,
    marcas: resumen.marcas.map(m => ({ ...m, grupo: grupoDeDepartamento(m.marca).id })),
    porMarca: armarPorMarca(ACTUAL, mapa),
    ranking: { totales: cat.totales, categorias: cat.filas, codigos: cod.filas },
    comparativo: {
      desde: "2024-09-01",
      hasta: "2025-08-08",
      parcial: false,
      totales: compCat.totales,
      categorias: compCat.filas.map(x => ({ clave: x.clave, unidades: x.unidades, venta: x.venta, utilidad: x.utilidad })),
      codigos: compCod.filas.map(x => ({ clave: x.clave, unidades: x.unidades, venta: x.venta, utilidad: x.utilidad })),
      porMarca: armarPorMarcaComparativo(ANTERIOR, mapa),
    },
    comparativoError: null,
  };
}

const PAYLOAD = armarPayload();

vi.mock("swr", () => ({
  default: () => ({ data: PAYLOAD, error: undefined, isLoading: false, mutate: vi.fn() }),
}));

// Se importa DESPUÉS del mock (vitest lo iza igual, pero deja la intención clara).
import { ProductosSubtab } from "@/components/multifashion/ProductosSubtab";

afterEach(cleanup);

function abrir() {
  return render(
    <ProductosSubtab selectedYear={2026} mes={8} periodo="12m" onPeriodoChange={() => {}} />,
  );
}

const tocarMarca = (nombre: string) =>
  fireEvent.click(screen.getByRole("button", { name: new RegExp(nombre) }));

/** El valor grande de una celda del pulso ("Venta", "Utilidad", "Unidades"). */
function celdaPulso(rotulo: string): string {
  const p = screen.getByText(rotulo);
  const celda = p.parentElement as HTMLElement;
  return (celda.querySelector("p:nth-of-type(2)") as HTMLElement).textContent ?? "";
}

describe("el selector de marca muestra el hallazgo sin que haya que tocar nada", () => {
  it("abre en 'todas' y ya se ven las tres marcas con su venta y su margen", () => {
    abrir();
    const grupo = screen.getByRole("group", { name: "Filtrar por marca" });
    const nombres = within(grupo).getAllByRole("button").map(b => b.textContent ?? "");
    expect(nombres[0]).toContain("Todas las marcas");
    expect(nombres[1]).toContain("Tommy Hilfiger");
    expect(nombres[2]).toContain("Karl Lagerfeld");
    expect(nombres[3]).toContain("Reebok");
    // El margen de cada marca se lee de una, sin abrir nada: ESE es el punto.
    expect(nombres[1]).toContain("$6,000.00");
    expect(nombres[1]).toContain("49.3%"); // (6000 − 3040) / 6000
    expect(nombres[2]).toContain("20.0%"); // Karl: (1000 − 800) / 1000
    expect(nombres[3]).toContain("16.0%"); // Reebok: (500 − 420) / 500
  });

  it("las marcas van de mayor a menor venta", () => {
    abrir();
    const grupo = screen.getByRole("group", { name: "Filtrar por marca" });
    const orden = within(grupo).getAllByRole("button").slice(1).map(b => b.textContent ?? "");
    expect(orden.map(t => t.slice(0, 6))).toEqual(["Tommy ", "Karl L", "Reebok"]);
  });
});

describe("un toque y TODO lo de abajo queda en esa marca", () => {
  it("1. el pulso pasa a ser el de la marca", () => {
    abrir();
    expect(celdaPulso("Venta")).toBe("$7,500.00");
    tocarMarca("Tommy Hilfiger");
    expect(celdaPulso("Venta")).toBe("$6,000.00");
    expect(celdaPulso("Unidades")).toBe("59"); // 40 + 10 + 10 − 1
  });

  it("2. la comparación contra el año pasado también es de la marca", () => {
    abrir();
    // Todas: 7.500 contra 5.900. Tommy: 6.000 contra 5.000.
    expect(screen.getAllByText("$5,900.00").length).toBeGreaterThan(0);
    tocarMarca("Tommy Hilfiger");
    expect(screen.getAllByText("$5,000.00").length).toBeGreaterThan(0);
    // El total del período anterior (5.900) ya no puede aparecer: sería comparar
    // Tommy contra todas las marcas, o sea una caída inventada por el filtro.
    expect(screen.queryByText("$5,900.00")).toBeNull();
  });

  it("3. las dos listas de arriba solo muestran lo de la marca", () => {
    abrir();
    expect(screen.getAllByText("Karl-Botas").length).toBeGreaterThan(0);
    tocarMarca("Tommy Hilfiger");
    expect(screen.queryByText("Karl-Botas")).toBeNull();
    expect(screen.queryByText("Reebok-Tenis")).toBeNull();
    expect(screen.getAllByText("Tommy-Camisas").length).toBeGreaterThan(0);
  });

  it("4. 'lo que más cambió' compara contra el año pasado DE LA MARCA", () => {
    abrir();
    tocarMarca("Karl Lagerfeld");
    // Se agarra la tarjeta por su `data-bloque`, no contando <div> hacia arriba:
    // lo que este candado tiene que vigilar es QUÉ filas muestra el bloque, no
    // cuántos contenedores tiene el encabezado.
    const bloque = screen.getByText("Lo que más cambió").closest("[data-bloque='movimientos']") as HTMLElement;
    expect(bloque.textContent).toContain("Karl-Botas");
    expect(bloque.textContent).not.toContain("Tommy-Camisas");
  });

  it("5. la tabla completa cuenta solo las categorías de la marca", () => {
    abrir();
    expect(screen.getByText("Ver todo").textContent).toContain("5 categorías");
    tocarMarca("Reebok");
    expect(screen.getByText("Ver todo").textContent).toContain("1 categorías");
    fireEvent.click(screen.getByRole("button", { name: /Ver todo/ }));
    expect(screen.getAllByText("Reebok-Tenis").length).toBeGreaterThan(0);
    expect(screen.queryByText("Tommy-Camisas")).toBeNull();
  });

  it("6. el agrupador por departamento queda con los departamentos de la marca", () => {
    abrir();
    tocarMarca("Tommy Hilfiger");
    fireEvent.click(screen.getByRole("button", { name: /Por departamento/ }));
    expect(screen.getAllByText("TH MENSWEAR").length).toBeGreaterThan(0);
    expect(screen.queryByText("KL FOOTWEAR")).toBeNull();
  });

  it("el título dice qué marca se está mirando", () => {
    abrir();
    tocarMarca("Karl Lagerfeld");
    expect(screen.getByText(/Más vendido · Karl Lagerfeld/)).toBeTruthy();
  });

  it("tocar la marca elegida vuelve a todas (el camino de vuelta es el mismo dedo)", () => {
    abrir();
    tocarMarca("Tommy Hilfiger");
    expect(celdaPulso("Venta")).toBe("$6,000.00");
    tocarMarca("Tommy Hilfiger");
    expect(celdaPulso("Venta")).toBe("$7,500.00");
  });
});

describe("los departamentos mal escritos se muestran juntos", () => {
  it("`TH ACCESORIES` y `TH ACCESSORIES` son UNA fila, no dos", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /Por departamento/ }));
    expect(screen.queryByText("TH ACCESORIES")).toBeNull();
    // 1.100 − 100 (NC) + 1.000 = 2.000, las dos escrituras sumadas.
    const filas = screen.getAllByText("TH ACCESSORIES");
    expect(filas.length).toBeGreaterThan(0);
    expect(screen.getAllByText("$2,000.00").length).toBeGreaterThan(0);
  });
});
