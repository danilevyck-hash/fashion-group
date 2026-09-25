// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — EL REDISEÑO DE REFERENCIA (25-sep-2026, `REFERENCIA_2026_09`)
//
// Se renderiza la vista REAL con los datos REALES de `NB2570` (Vistana) del
// 25-sep-2026: 26 colores, 54 líneas de ingreso, 363 renglones de venta.
//
// Lo que este candado protege, punto por punto del mockup que Daniel aprobó:
//   1. La tarjeta del MODELO existe, y dice **Compré · Vendí · Stock ·
//      % vendido** — los rótulos del oficio. Nunca «Queda» para el stock.
//   2. Un renglón por COLOR, ordenado por STOCK de mayor a menor, y los que no
//      tienen mercancía PLEGADOS al final («22 sin stock»).
//   3. «Más info ›» arranca CERRADO: las 27 llegadas, el mes a mes, el precio
//      de lista y el CIF no se ven hasta tocarlo.
//   4. El buscador corto y pegajoso, con las dos acciones dentro del «···».
//   5. 🔴 NINGÚN NÚMERO CAMBIA DE CUENTA: `NB2570001` da 935 · 552 · 345 ·
//      62 % · FOB $15.05 · margen 39 % por el camino VIEJO (`armarFicha`, el
//      que dibuja la pantalla con el interruptor apagado) y por el NUEVO
//      (`armarTarjetaModelo`).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

import { ReferenciaView } from "@/components/referencia/ReferenciaView";
import { armarArticulo, type ArticuloCompras, type ComprasApiResp, type FilaIngreso } from "@/lib/ventas/compras";
import { armarFicha, pctVendido } from "@/lib/ventas/resumen-articulo";
import { armarTarjetaModelo } from "@/lib/ventas/referencia-modelo";
import { REFERENCIA_2026_09, ROTULOS } from "@/lib/ventas/referencia-pantalla";
import { CLASE_BARRA_PEGAJOSA } from "@/lib/ui/barra-pegajosa";
import fixture from "../fixtures/referencia-nb2570.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/referencia",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const HOY = "2026-09-25";
const HOY_MES = "2026-09";

function articulos(): ArticuloCompras[] {
  const cods = [...new Set(fixture.info.map((i) => i.codigo))];
  return cods.map((codigo) => {
    const inf = fixture.info.find((i) => i.codigo === codigo)!;
    return armarArticulo(
      {
        empresa: "vistana",
        codigo,
        descripcion: inf.descripcion ?? "",
        ingresos: fixture.ingresos.filter((r) => r.codigo_articulo === codigo) as unknown as FilaIngreso[],
        ventas: fixture.ventas.filter((r) => r.codigo === codigo),
        existencia: inf.existencia == null ? null : Number(inf.existencia),
        precioEtiqueta: inf.precio_etiqueta == null ? null : Number(inf.precio_etiqueta),
        catalogoSyncedAt: null,
      },
      HOY,
      true,
    );
  });
}

const TODOS = articulos();

function respuesta(arts: ArticuloCompras[]): ComprasApiResp {
  return {
    hoy: HOY,
    hoyMes: HOY_MES,
    articulos: arts,
    noEncontrados: [],
    comprasDisponibles: true,
    infoDisponible: true,
    margenVisible: true,
  };
}

async function buscar(q: string, arts: ArticuloCompras[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => respuesta(arts) }) as unknown as Response),
  );
  render(<ReferenciaView />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: q } });
  fireEvent.click(screen.getAllByRole("button", { name: /Buscar/ })[0]);
  await screen.findAllByText(ROTULOS.comprado);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ── 5. Ningún número cambia de cuenta ───────────────────────────────────────

describe("🔴 ningún número cambia de cuenta — NB2570001", () => {
  const uno = TODOS.find((a) => a.codigo === "NB2570001")!;
  const vieja = armarFicha(uno, HOY_MES);
  const nueva = armarTarjetaModelo("NB2570001", [uno], HOY_MES);

  it("Compré · Vendí · Stock · % vendido · FOB · margen dan lo MISMO por los dos caminos", () => {
    expect(vieja.grandes.comprado).toBe(935);
    expect(vieja.grandes.vendido).toBe(552);
    expect(vieja.grandes.quedan).toBe(345);
    expect(pctVendido(vieja.grandes.parteVendida!)).toBe(62);
    expect(vieja.fobCalculado!.toFixed(2)).toBe("15.05");
    expect(Math.round(vieja.margen.margen! * 100)).toBe(39);

    expect(nueva.comprado).toBe(vieja.grandes.comprado);
    expect(nueva.vendido).toBe(vieja.grandes.vendido);
    expect(nueva.stock).toBe(vieja.grandes.quedan);
    expect(pctVendido(nueva.parteVendida!)).toBe(pctVendido(vieja.grandes.parteVendida!));
    expect(nueva.fob).toBe(vieja.fobCalculado);
    expect(nueva.margen.margen).toBe(vieja.margen.margen);
    expect(nueva.margen.precioReal).toBe(vieja.margen.precioReal);
    expect(nueva.margen.costo).toBe(vieja.margen.costo);
  });

  it("y el MODELO es la suma de sus colores, no otra cuenta", () => {
    const t = armarTarjetaModelo("NB2570", TODOS, HOY_MES);
    expect(t.comprado).toBe(5856);
    expect(t.vendido).toBe(4580);
    expect(t.stock).toBe(888);
    expect(pctVendido(t.parteVendida!)).toBe(84);
    expect(t.colores).toBe(26);
    // Las 27 llegadas suman exactamente lo comprado.
    expect(t.llegadas).toHaveLength(27);
    expect(t.llegadas.reduce((s, l) => s + l.unidades, 0)).toBe(5856);
  });
});

// ── 1 y 2. La tarjeta del modelo y sus colores ──────────────────────────────

describe("🔴 al buscar un MODELO sale su tarjeta y debajo sus colores", () => {
  it("el encabezado dice el modelo, su descripción, la empresa y cuántos colores", async () => {
    await buscar("NB2570", TODOS);
    expect(screen.getByRole("heading", { name: "NB2570" })).toBeTruthy();
    expect(screen.getAllByText("Men-Boxer Brief").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Vistana").length).toBeGreaterThan(0);
    expect(screen.getAllByText("26 colores").length).toBeGreaterThan(0);
  });

  it("🔴 los rótulos son los del oficio, y el stock NUNCA se llama «Queda»", async () => {
    await buscar("NB2570", TODOS);
    for (const r of [ROTULOS.comprado, ROTULOS.vendido, ROTULOS.stock, ROTULOS.pctVendido]) {
      expect(screen.getAllByText(r).length).toBeGreaterThan(0);
    }
    expect(ROTULOS.stock).toBe("Stock");
    expect(ROTULOS.pctVendido).toBe("% vendido");
    // «Me quedan» fue la palabra que Daniel sacó; no puede volver.
    expect(screen.queryByText(/Me quedan/i)).toBeNull();
  });

  it("la mercancía del modelo dice 5,856 · 4,580 · 888 · 84 %", async () => {
    await buscar("NB2570", TODOS);
    expect(screen.getAllByText("5,856").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4,580").length).toBeGreaterThan(0);
    expect(screen.getAllByText("888").length).toBeGreaterThan(0);
    expect(screen.getAllByText("84 %").length).toBeGreaterThan(0);
  });

  it("🔴 «Llegadas» dice cuántas y desde cuándo — 27 desde oct 2022", async () => {
    await buscar("NB2570", TODOS);
    expect(screen.getAllByText("27 desde oct 2022").length).toBeGreaterThan(0);
  });

  it("🔴 las dos últimas llegadas: la última y la ANTERIOR QUE SÍ SE VENDIÓ", async () => {
    await buscar("NB2570", TODOS);
    // ago 2026 · 360 · «—» · queda 100 %
    expect(screen.getAllByText("ago 2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("queda 100 %").length).toBeGreaterThan(0);
    // nov 2025 · 360 · 21 sem · vendida
    expect(screen.getAllByText("nov 2025").length).toBeGreaterThan(0);
    expect(screen.getAllByText("21 sem").length).toBeGreaterThan(0);
    expect(screen.getAllByText("vendida").length).toBeGreaterThan(0);
    // 🔴 Y se dice que es aproximado: no se le atribuye una venta a una compra.
    expect(screen.getAllByText(/aprox\./).length).toBeGreaterThan(0);
  });

  it("🔴 FOB · Precio prom · Margen van en UNA sola línea", async () => {
    await buscar("NB2570", TODOS);
    expect(screen.getAllByText(/FOB \$15\.05 · Precio prom \$26\.60 · Margen 38%/).length).toBeGreaterThan(0);
  });

  it("🔴 el renglón por trimestre es PLANO, sin adivinar temporadas", async () => {
    await buscar("NB2570", TODOS);
    for (const q of ["Ene–Mar", "Abr–Jun", "Jul–Sep", "Oct–Dic"]) {
      expect(screen.getAllByText(q).length).toBeGreaterThan(0);
    }
    // Oct–Dic 2025 fueron 431 piezas (medido).
    expect(screen.getAllByText("431").length).toBeGreaterThan(0);
    // Y NO aparece ninguna temporada de compra (PS/SP/PF/FA, SS/FW).
    expect(screen.queryByText(/\bFA26\b|\bSP26\b|\bFW26\b/)).toBeNull();
  });

  it("🔴 los colores van por STOCK de mayor a menor", async () => {
    await buscar("NB2570", TODOS);
    const tabla = screen.getByText("Sus colores · 4 con mercancía").parentElement!;
    const filas = [...tabla.querySelectorAll("tbody tr")];
    const colores = filas.map((tr) => tr.querySelector("td")!.textContent);
    expect(colores).toEqual(["001", "902", "400", "923"]);
    // 345 · 343 · 199 · 1 — el orden es el del stock, no el del código.
    const stocks = filas.map((tr) => [...tr.querySelectorAll("td")][3].textContent);
    expect(stocks).toEqual(["345", "343", "199", "1"]);
  });

  it("🔴 los 22 sin mercancía están PLEGADOS: no se dibujan hasta tocarlos", async () => {
    await buscar("NB2570", TODOS);
    const boton = screen.getByRole("button", { name: /22 sin stock/ });
    expect(boton.getAttribute("aria-expanded")).toBe("false");
    const tabla = screen.getByText("Sus colores · 4 con mercancía").parentElement!;
    expect(tabla.querySelectorAll("tbody tr")).toHaveLength(4);
    fireEvent.click(boton);
    expect(screen.getByRole("button", { name: /22 sin stock/ }).getAttribute("aria-expanded")).toBe("true");
    expect(tabla.querySelectorAll("tbody tr").length).toBeGreaterThan(4);
  });

  it("🔴 tocar un color abre su tarjeta con la MISMA forma", async () => {
    await buscar("NB2570", TODOS);
    const antes = screen.getAllByText(ROTULOS.comprado).length;
    fireEvent.click(screen.getByText("001").closest("tr")!);
    // Se agrega OTRA tarjeta con los mismos rótulos, no un resumen distinto.
    expect(screen.getAllByText(ROTULOS.comprado).length).toBeGreaterThan(antes);
    expect(screen.getAllByText("935").length).toBeGreaterThan(0);
    expect(screen.getAllByText("62 %").length).toBeGreaterThan(0);
  });
});

// ── 3. «Más info ›» ─────────────────────────────────────────────────────────

describe("🔴 «Más info ›» arranca cerrado", () => {
  it("las 27 llegadas, el mes a mes, el precio de lista y el CIF viven adentro", async () => {
    await buscar("NB2570", TODOS);
    expect(screen.queryByText(/Todas las llegadas/)).toBeNull();
    expect(screen.queryByText(/Precio de lista/)).toBeNull();
    expect(screen.queryByText(/Mes a mes/)).toBeNull();

    const boton = screen.getAllByRole("button", { name: /Más info/ })[0];
    expect(boton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(boton);

    expect(screen.getAllByText(/Todas las llegadas · 27 desde oct 2022/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Mes a mes/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Precio de lista \$27\.00 · Costo CIF \$16\.56/).length).toBeGreaterThan(0);
    // Y el renglón por trimestre del AÑO ANTERIOR (oct–dic 2024 = 1.172 u).
    expect(screen.getAllByText(/Por trimestre · el año anterior/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("1,172").length).toBeGreaterThan(0);
    // Las 27 fechas, con su día.
    expect(screen.getAllByText("25 oct 2022").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4 ago 2026").length).toBeGreaterThan(0);
  });
});

// ── Buscar un código COMPLETO ───────────────────────────────────────────────

describe("🔴 al buscar un código COMPLETO sale una sola fila y su tarjeta", () => {
  it("el título es el CÓDIGO, no el modelo recortado, y no hay tabla de colores", async () => {
    const uno = TODOS.filter((a) => a.codigo === "NB2570001");
    await buscar("NB2570001", uno);
    expect(screen.getByRole("heading", { name: "NB2570001" })).toBeTruthy();
    expect(screen.getAllByText("color 001").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Sus colores/)).toBeNull();
    expect(screen.getAllByText("935").length).toBeGreaterThan(0);
    expect(screen.getAllByText("552").length).toBeGreaterThan(0);
    expect(screen.getAllByText("345").length).toBeGreaterThan(0);
    expect(screen.getAllByText("62 %").length).toBeGreaterThan(0);
  });
});

// ── 4. El buscador ──────────────────────────────────────────────────────────

describe("🔴 el buscador: corto, pegajoso y con las acciones en el «···»", () => {
  it("el placeholder es corto y hay UNA sola línea de ayuda", () => {
    render(<ReferenciaView />);
    const caja = screen.getByRole("textbox");
    expect(caja.getAttribute("placeholder")).toBe("Código o modelo");
    expect(screen.getAllByText(/Un modelo trae todos sus colores/).length).toBe(1);
  });

  it("🔴 se pega DEBAJO del encabezado con la clase de la casa", () => {
    render(<ReferenciaView />);
    expect(document.querySelector(`.${CLASE_BARRA_PEGAJOSA}`)).toBeTruthy();
  });

  it("🔴 «Actualizar datos de Switch» y «Descargar Excel» viven en el «···»", async () => {
    await buscar("NB2570", TODOS);
    // Fuera del menú no hay botones sueltos con esos nombres.
    expect(screen.queryByRole("button", { name: /Actualizar datos de Switch/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Descargar Excel/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Más opciones" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Actualizar datos de Switch/ })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: /Descargar Excel/ })).toBeTruthy();
  });

  it("dice qué volvió: 1 modelo · 26 colores", async () => {
    await buscar("NB2570", TODOS);
    expect(screen.getAllByText("1 modelo · 26 colores").length).toBe(1);
  });
});

describe("el interruptor existe y se puede apagar", () => {
  it("🔴 `REFERENCIA_2026_09` es la única perilla", () => {
    expect(typeof REFERENCIA_2026_09).toBe("boolean");
  });
});
