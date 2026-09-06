// ─────────────────────────────────────────────────────────────────────────────
// VENTAS › CLIENTES — la lista se ve entera, el «#» no miente y la columna
// «Empresa» contesta UNA sola pregunta (5-sep-2026).
//
// Los cuatro arreglos que Daniel pidió mirando su propia pantalla:
//
//  🩸 EL «#» ENGAÑABA. Se lee como un ranking y SEGUÍA AL ORDEN ACTIVO. Con
//     «Última compra» puesto —el orden con el que la pantalla ABRE— Multi
//     Fashion Holding salía **#1 con $248.396** y City Mall Paso Canoa, el
//     cliente más grande con **$1.256.848**, salía **#9**. El número no estaba
//     mal calculado: era la posición en la lista. Lo que estaba mal es que un
//     «#» al lado de un nombre se lee como «el más grande». Ahora la columna
//     SOLO existe cuando el orden es por compras.
//
//  🔴 «OTROS CLIENTES (8)» SE ABRE. Daniel: *«si y si»*. Ocho clientes con
//     plata real vivían detrás de un clic, en un diálogo aparte.
//
//  🔴 LOS QUE ESTÁN EN $0.00 SE AGRUPAN AL FINAL. Desde ~la fila 92 casi todo
//     era «$0.00 / −100%»: cien renglones idénticos entre los que no se
//     encuentra nada. No se esconden: se pliegan, contados y a un toque.
//
//  🔴 «EMPRESA» DICE SIEMPRE EL NÚMERO. Mezclaba dos cosas: a veces «6
//     empresas» (cuántas le compran) y a veces «Vistana International» (cuál).
//     Dos preguntas bajo el mismo encabezado.
//
// ⚠️ CON BÚSQUEDA ACTIVA NO SE PLIEGA NADA, y es la regla que sostiene a las
// otras: quien escribe un nombre quiere encontrarlo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { ClientesView } from "@/components/ventas/ClientesView";
import { textoEmpresas, textoSinCompras } from "@/components/ventas/ClientesView";
import type { Clientes, Cliente } from "@/components/ventas/types";

vi.mock("@/components/shared/SyncNowButton", () => ({
  default: () => <button type="button">Actualizar ahora</button>,
}));

const cliente = (over: Partial<Cliente>): Cliente => ({
  rank: 1,
  id: "D-1",
  nombre: "CLIENTE",
  empresa: "Vistana",
  empresaKey: "vistana",
  ytd: 1_000,
  prev: 900,
  delta: 0.1,
  ultima: "1 sep 2026",
  ultimaIso: "2026-09-01",
  wa: "",
  empresas_count: 1,
  isOrphan: false,
  ...over,
});

/** Las tres clases de fila que conviven en la lista real. */
const DATA = {
  anioComparativo: 2025,
  rows: [
    cliente({ id: "D-24", nombre: "CITY MALL PASO CANOA", ytd: 1_256_848, empresas_count: 6, ultimaIso: "2026-08-20", ultima: "20 ago 2026" }),
    cliente({ id: "D-99", nombre: "MULTI FASHION HOLDING", ytd: 248_396, ultimaIso: "2026-09-04", ultima: "4 sep 2026" }),
    cliente({ id: "SIN-COD", nombre: "CEPREDENAC", ytd: 5_000, isOrphan: true, ultimaIso: "2026-07-01", ultima: "1 jul 2026" }),
    cliente({ id: "D-70", nombre: "DORMIDO UNO", ytd: 0, prev: 4_000, delta: -1, ultimaIso: "2025-03-01", ultima: "1 mar 2025" }),
    cliente({ id: "D-71", nombre: "DORMIDO DOS", ytd: 0, prev: 3_000, delta: -1, ultimaIso: "2025-02-01", ultima: "1 feb 2025" }),
  ],
} as unknown as Clientes;

afterEach(cleanup);

function pintar(data: Clientes = DATA) {
  return render(<ClientesView data={data} selectedYear={2026} isClosedYear={false} modo="ventas" onModo={() => {}} />);
}

/** La tabla del escritorio (en jsdom los dos layouts se montan a la vez). */
const tabla = () => document.querySelector("table") as HTMLElement;

// ─────────────────────────────────────────────────────────────────────────────
// 1 · EL «#»
// ─────────────────────────────────────────────────────────────────────────────

describe("1 · 🩸 el «#» solo existe cuando el orden ES por compras", () => {
  it("al abrir, ordenada por última compra, NO hay columna «#»", () => {
    pintar();
    const encabezados = [...tabla().querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
    expect(encabezados.some((h) => h.startsWith("#"))).toBe(false);
    // CONTROL: las demás columnas siguen todas ahí.
    expect(encabezados.join("|")).toContain("Cliente");
    expect(encabezados.join("|")).toContain("Compras 2026");
    expect(encabezados.join("|")).toContain("Última compra");
  });

  it("🔴 al ordenar POR COMPRAS aparece, y numera de mayor a menor", () => {
    pintar();
    fireEvent.click(screen.getByText(/Compras 2026/));
    const encabezados = [...tabla().querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
    expect(encabezados[0]).toBe("#");

    const primera = tabla().querySelectorAll("tbody tr")[0];
    expect(primera.textContent).toContain("CITY MALL PASO CANOA");
    expect(primera.querySelector("td")?.textContent?.trim()).toBe("1");
  });

  it("🩸 y al volver a otro orden el «#» desaparece — no queda un ranking falso", () => {
    pintar();
    fireEvent.click(screen.getByText(/Compras 2026/));
    expect([...tabla().querySelectorAll("thead th")][0].textContent?.trim()).toBe("#");
    fireEvent.click(screen.getByText(/Última compra/));
    expect([...tabla().querySelectorAll("thead th")][0].textContent?.trim()).not.toBe("#");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · «OTROS CLIENTES» ABIERTO
// ─────────────────────────────────────────────────────────────────────────────

describe("2 · 🔴 «Otros clientes» va EN la lista, no detrás de un clic", () => {
  it("el cliente sin ficha se ve, con su nombre y su monto", () => {
    pintar();
    expect(screen.getAllByText("CEPREDENAC").length).toBeGreaterThanOrEqual(1);
    expect(within(tabla()).getByText("$5,000.00")).toBeTruthy();
  });

  it("y un renglón lo separa y dice cuántos son", () => {
    pintar();
    expect(screen.getAllByText(/Otros clientes \(1\)/).length).toBeGreaterThanOrEqual(1);
  });

  it("🩸 ya no hay diálogo que abrir", () => {
    pintar();
    expect(document.body.textContent).not.toContain("Tocar para ver el detalle");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · LOS CLIENTES EN $0.00
// ─────────────────────────────────────────────────────────────────────────────

describe("3 · 🔴 los que no compraron este año se pliegan al final", () => {
  it("no se pintan de entrada, pero se DICE cuántos son", () => {
    pintar();
    expect(screen.queryAllByText("DORMIDO UNO")).toHaveLength(0);
    const aviso = document.querySelector("[data-clientes-en-cero]")!;
    expect(aviso.textContent).toContain("2");
    expect(aviso.textContent).toContain(textoSinCompras(2026));
    expect(aviso.textContent).toContain("ver");
  });

  it("y se abren de un toque", () => {
    pintar();
    fireEvent.click(document.querySelector("[data-clientes-en-cero]") as HTMLElement);
    expect(screen.getAllByText("DORMIDO UNO").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("DORMIDO DOS").length).toBeGreaterThanOrEqual(1);
    expect(document.querySelector("[data-clientes-en-cero]")!.textContent).toContain("ocultar");
  });

  it("🔴 CON BÚSQUEDA ACTIVA NO SE PLIEGA NADA — el que busca quiere encontrar", () => {
    pintar();
    fireEvent.change(screen.getByPlaceholderText("Buscar cliente o código…"), {
      target: { value: "dormido" },
    });
    // Aparece sin tener que desplegar nada, y el plegable ya no está.
    expect(screen.getAllByText("DORMIDO UNO").length).toBeGreaterThanOrEqual(1);
    expect(document.querySelector("[data-clientes-en-cero]")).toBeNull();
  });

  it("🔴 y un huérfano también se encuentra buscándolo", () => {
    // Es la misma regla, y la razón por la que los huérfanos salieron del pozo.
    pintar();
    fireEvent.change(screen.getByPlaceholderText("Buscar cliente o código…"), {
      target: { value: "cepre" },
    });
    expect(screen.getAllByText("CEPREDENAC").length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · LA COLUMNA «EMPRESA»
// ─────────────────────────────────────────────────────────────────────────────

describe("4 · 🔴 «Empresas» dice SIEMPRE el número", () => {
  it("el rótulo es una sola pregunta, no dos", () => {
    pintar();
    const encabezados = [...tabla().querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
    expect(encabezados.some((h) => h.startsWith("Empresas"))).toBe(true);
  });

  it("con SEIS empresas dice «6 empresas»; con una, «1 empresa» — nunca el nombre", () => {
    pintar();
    const celdas = [...tabla().querySelectorAll('[data-col="empresa"]')].map((c) => c.textContent?.trim() ?? "");
    expect(celdas).toContain("6 empresas");
    expect(celdas).toContain("1 empresa");
    // 🩸 El defecto exacto: el nombre de la empresa en esa columna.
    expect(celdas.join("|")).not.toContain("Vistana");
  });

  it("la frase se arma en UN solo lugar, para la tabla y la tarjeta", () => {
    expect(textoEmpresas(6)).toBe("6 empresas");
    expect(textoEmpresas(1)).toBe("1 empresa");
    // Un dato roto no rompe la fila: cae en la forma singular.
    expect(textoEmpresas(0)).toBe("1 empresa");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · EL UNIVERSO ES UN CONTROL, NO UNA NOTA AL PIE
// ─────────────────────────────────────────────────────────────────────────────

describe("5 · «Clientes: últimos 12 meses» es un selector visible", () => {
  it("está al lado del buscador, no como leyenda gris", () => {
    pintar();
    const control = document.querySelector("[data-universo-clientes]")!;
    expect(control).toBeTruthy();
    expect(control.textContent).toContain("Clientes: últimos 12 meses");
    // Y es TOCABLE: decide qué clientes se listan (209 contra 92 filas).
    expect(control.tagName === "BUTTON" || control.getAttribute("role") === "combobox").toBe(true);
  });

  it("en un año CERRADO no se ofrece una opción falsa", () => {
    // La consulta ya filtra ese año: no hay nada que elegir, y se dice como
    // texto en vez de dibujar un control que no hace nada.
    render(<ClientesView data={DATA} selectedYear={2025} isClosedYear modo="ventas" onModo={() => {}} />);
    const control = document.querySelector("[data-universo-clientes]")!;
    expect(control.textContent).toContain("Año 2025");
    expect(control.getAttribute("role")).not.toBe("combobox");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6 · LOS TRES MODOS COMPARTEN LOS CONTROLES
// ─────────────────────────────────────────────────────────────────────────────

describe("6 · Ventas · Utilidad · Margen % — solo cambian las columnas", () => {
  it("el control segmentado ofrece los tres, con las palabras del Resumen", () => {
    pintar();
    const grupos = [...document.querySelectorAll("[data-control-segmentado]")];
    expect(grupos.length).toBeGreaterThanOrEqual(1);
    const textos = grupos.map((g) => g.textContent ?? "");
    expect(textos.some((t) => t.includes("Ventas") && t.includes("Utilidad") && t.includes("Margen %"))).toBe(true);
  });

  it("🔴 el buscador y las píldoras de empresa son los MISMOS en los tres", () => {
    // Un solo buscador para las mismas filas: tener dos era buscar al mismo
    // cliente dos veces. En Utilidad NO se dibuja uno propio.
    const { rerender } = pintar();
    expect(screen.getAllByPlaceholderText("Buscar cliente o código…")).toHaveLength(1);
    rerender(<ClientesView data={DATA} selectedYear={2026} isClosedYear={false} modo="utilidad" onModo={() => {}} />);
    expect(screen.getAllByPlaceholderText("Buscar cliente o código…")).toHaveLength(1);
    expect(screen.queryByPlaceholderText("Buscar cliente o empresa…")).toBeNull();
    // Y las píldoras siguen ahí, filtrando también ese modo.
    expect(screen.getAllByRole("button", { name: "Todas" }).length).toBeGreaterThanOrEqual(1);
  });
});
