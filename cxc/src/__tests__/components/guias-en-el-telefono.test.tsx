/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA GUÍA EN EL TELÉFONO — TRES COSAS QUE SE VEN (5-sep-2026).
 *
 * Daniel aprobó los tres juntos: *«van todos»*. Ninguno cambia lo que se guarda.
 *
 *   1. **Fuera la tabla que se corta.** Los renglones del acordeón salían en una
 *      tabla de 6 columnas que pide 600 px dentro de un iPhone de 390: **210 px
 *      de arrastre lateral**, medido, y el **57% de las 222 guías vivas tiene UN
 *      solo renglón** (127; y 172, el 77%, tres o menos). En el teléfono cada renglón se lee como
 *      ficha; de `lg:` para arriba la tabla se queda.
 *   2. **Las firmas, plegadas al MIRAR.** Una línea y un «Ver firmas».
 *   3. **«Lista plana» se retira.** Era un botón que nombraba el DESTINO
 *      («Lista plana» estando agrupado), así que el rótulo siempre describía la
 *      vista en la que NO estabas. Daniel, textual: *«el chip por fecha y todos
 *      quítalo. Siempre ordenado por fecha»* — no se reemplaza, se elimina.
 *
 * 🔴 CANDADO DE CONDUCTA: se RENDERIZA la lista y se lee el DOM. Un barrido de
 * texto no puede ver cuántas veces se pinta un renglón, y en este repo esos
 * barridos ya pasaron cuatro veces estando mutados porque el comentario que
 * explica el cambio contiene lo que el barrido busca.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import GuiasList from "@/app/guias/components/GuiasList";
import type { Guia, GuiaItem } from "@/app/guias/components/types";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ITEMS: GuiaItem[] = [
  { id: "i1", orden: 1, cliente: "Outlet Duty Free N3, S.A.", cliente_codigo: "D-118", direccion: "Paso Canoas", empresa: "Fashion Shoes", facturas: "2520", bultos: 128, numero_guia_transp: "725" },
  { id: "i2", orden: 2, cliente: "Tienda del barrio", cliente_codigo: "", direccion: "Santiago", empresa: "Fashion Wear", facturas: "2522", bultos: 2, numero_guia_transp: "" },
];

const NOMBRES = new Map<string, string>([["D-118", "Outlet Duty Free N3, S.A."]]);

function guia(over: Partial<Guia> = {}): Guia {
  return {
    id: "g229",
    numero: 229,
    fecha: "2026-08-19",
    transportista: "Edwin",
    modo_entrega: "transportista",
    transportista_id: "t1",
    placa: "EK0700",
    observaciones: "",
    total_bultos: 130,
    item_count: 2,
    monto_total: 0,
    estado: "Completada",
    entregado_por: "Julio",
    receptor_nombre: "Nicolás guillen",
    cedula: "89822270",
    firma_base64: "data:image/png;base64,x",
    firma_entregador_base64: "data:image/png;base64,y",
    numero_guia_transp: "725",
    guia_items: ITEMS,
    ...over,
  } as Guia;
}

function pintar(over: Partial<Guia> = {}) {
  const g = guia(over);
  return render(
    <GuiasList
      guias={[g]} loading={false} error={null} search="" setSearch={() => {}}
      showPending={false} setShowPending={() => {}} role="admin" onNewGuia={() => {}}
      expandedId="g229" expandedGuia={g} expandedLoading={false} onToggleExpand={() => {}}
      onEditar={() => {}} onDespachar={() => {}} onDelete={() => {}}
      onAtarCliente={() => {}} nombresPorCodigo={NOMBRES}
    />,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
describe("1 · en el teléfono los renglones son fichas, no una tabla que se arrastra", () => {
  it("🔴 la tabla existe pero SOLO de `lg:` para arriba", () => {
    const { container } = pintar();
    const tabla = container.querySelector("table");
    expect(tabla).not.toBeNull();
    // El envoltorio con `overflow-x-auto` es el que arrastra: ése es el que se
    // esconde en el teléfono.
    const envoltorio = tabla!.closest("div.overflow-x-auto");
    expect(envoltorio).not.toBeNull();
    expect(envoltorio!.className).toContain("hidden");
    expect(envoltorio!.className).toContain("lg:block");
  });

  it("🔴 y hay una ficha por renglón, que en escritorio NO se ve", () => {
    const { container } = pintar();
    const lista = container.querySelector("ul.lg\\:hidden");
    expect(lista).not.toBeNull();
    expect(lista!.querySelectorAll("li")).toHaveLength(ITEMS.length);
  });

  it("🔴 cada ficha dice cliente, `destino · empresa · factura` y los bultos", () => {
    const { container } = pintar();
    const fichas = Array.from(container.querySelectorAll("ul.lg\\:hidden > li"));
    const texto = (el: Element) => (el.textContent || "").replace(/\s+/g, " ").trim();
    expect(texto(fichas[0])).toContain("Outlet Duty Free N3, S.A.");
    expect(texto(fichas[0])).toContain("Paso Canoas · Fashion Shoes · 2520");
    expect(texto(fichas[0])).toContain("128 bultos");
    expect(texto(fichas[1])).toContain("Tienda del barrio");
    expect(texto(fichas[1])).toContain("2 bultos");
  });

  it("🔴 el nombre se sigue diciendo UNA sola vez por ficha", () => {
    // La línea atada manda el chip; el texto escrito no se repite arriba.
    const { container } = pintar();
    const ficha = container.querySelectorAll("ul.lg\\:hidden > li")[0];
    const veces = (ficha.textContent || "").split("Outlet Duty Free N3, S.A.").length - 1;
    expect(veces).toBe(1);
  });

  it("🔴 desde la ficha también se ata un cliente: no se pierde nada del escritorio", () => {
    const { container } = pintar();
    const ficha = container.querySelectorAll("ul.lg\\:hidden > li")[1];
    expect(ficha.querySelector("button")).not.toBeNull();
    expect(ficha.textContent).toContain("Atar cliente");
  });

  it("🔴 el nombre de la ficha NO baja de 14 px — un destino es un dato", () => {
    const { container } = pintar();
    const ficha = container.querySelectorAll("ul.lg\\:hidden > li")[1];
    const nombre = Array.from(ficha.querySelectorAll("span")).find((s) => s.textContent === "Tienda del barrio");
    expect(nombre).toBeDefined();
    expect(nombre!.className).toContain("text-sm");
    expect(nombre!.className).not.toContain("text-xs");
  });

  it("una guía sin renglones lo dice, no deja el hueco en blanco", () => {
    const { container } = pintar({ guia_items: [], item_count: 0 });
    const lista = container.querySelector("ul.lg\\:hidden");
    expect(lista!.textContent).toContain("Esta guía no tiene envíos cargados.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2 · las firmas, plegadas", () => {
  it("🔴 con las dos firmas se ve UNA línea y ninguna imagen", () => {
    const { container } = pintar();
    expect(screen.getByText("✓ Firmada por las dos partes")).toBeTruthy();
    expect(container.querySelectorAll('img[alt^="Firma"]')).toHaveLength(0);
  });

  it("«Ver firmas» las abre, y vuelve a plegarlas", () => {
    const { container } = pintar();
    fireEvent.click(screen.getByRole("button", { name: /Ver firmas/i }));
    expect(container.querySelectorAll('img[alt^="Firma"]')).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Ocultar firmas/i }));
    expect(container.querySelectorAll('img[alt^="Firma"]')).toHaveLength(0);
  });

  it("🔴 si falta una, lo DICE — no dice que está firmada", () => {
    pintar({ firma_entregador_base64: "" });
    expect(screen.getByText("Falta la firma del entregador")).toBeTruthy();
    expect(screen.queryByText("✓ Firmada por las dos partes")).toBeNull();
  });

  it("🔴 sin ninguna firma no aparece nada nuevo — son las 65 guías viejas", () => {
    pintar({ firma_base64: "", firma_entregador_base64: "" });
    expect(screen.queryByRole("button", { name: /Ver firmas/i })).toBeNull();
    expect(screen.queryByText(/Firmada por las dos partes/)).toBeNull();
    expect(screen.queryByText(/Falta la firma/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3 · la lista está SIEMPRE agrupada por fecha", () => {
  it("🔴 el botón que alternaba las dos vistas se retiró — ninguno de los dos rótulos vuelve", () => {
    const { container } = pintar();
    expect(container.textContent).not.toContain("Lista plana");
    expect(container.textContent).not.toContain("Agrupar por fecha");
    // Ni disfrazado de control de dos opciones (la primera versión del cambio).
    expect(screen.queryByRole("tab", { name: "Por fecha" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Todas" })).toBeNull();
    expect(container.querySelector("[data-control-segmentado]")).toBeNull();
  });

  it("🔴 y lo agrupado por fecha SE QUEDA: los encabezados siguen ahí", () => {
    // Si al sacar el botón se hubiera sacado también el agrupado, la lista
    // perdería los encabezados de período — que es lo único que Daniel usa.
    // `TimeGroupHeader` es lo único que rotula el grupo con su cuenta entre
    // paréntesis; sin agrupar, esa cabecera no existe.
    const { container } = pintar();
    expect(container.textContent).toMatch(/\(1 guía\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4 · la cédula, con guiones", () => {
  it("🔴 se muestra `8-982-2270` donde antes salía `89822270`", () => {
    const { container } = pintar();
    expect(container.textContent).toContain("8-982-2270");
    expect(container.textContent).not.toContain("89822270");
  });

  it("🔴 lo que no parece una cédula se muestra tal cual", () => {
    const { container } = pintar({ cedula: "Co272797" });
    expect(container.textContent).toContain("Co272797");
  });
});
