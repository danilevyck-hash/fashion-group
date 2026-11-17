// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — CONSULTA DE ARTÍCULOS EN EL CELULAR: EL DETALLE DE UN COLOR NO
// VIVE DENTRO DE LA TABLA QUE SE DESLIZA (16-nov-2026, error #28 de los videos).
//
// Con `REFERENCIA_APPLE_2026_10` apagado, el celular dibujaba la tabla de 7
// columnas (`min-w-[540px]`, `overflow-x-auto`) y el detalle del color salía en
// una fila `colSpan` ADENTRO del deslizamiento: «Stock» y «% vendido» quedaban
// cortados. Regla de la casa: en el celular nada se desliza de lado; la tabla
// pasa a fichas. Con o sin el interruptor, el celular lleva una ficha por color.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/referencia",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shared/LineaDeFrescura", () => ({ default: () => <span data-testid="frescura" /> }));

import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { ReferenciaView } from "@/components/referencia/ReferenciaView";
import { armarArticulo, type ArticuloCompras, type ComprasApiResp, type FilaIngreso } from "@/lib/ventas/compras";
import { ROTULOS } from "@/lib/ventas/referencia-pantalla";
import fixture from "../fixtures/referencia-nb2570.json";

const HOY = "2026-09-25";
const TODOS: ArticuloCompras[] = [...new Set(fixture.info.map((i) => i.codigo))].map((codigo) => {
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

async function buscarEnCelular() {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  }));
  const resp: ComprasApiResp = {
    hoy: HOY, hoyMes: "2026-09", articulos: TODOS, noEncontrados: [],
    comprasDisponibles: true, infoDisponible: true, margenVisible: false,
  };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => resp }) as unknown as Response));
  const vista = render(<ReferenciaView />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "NB2570" } });
  await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /Buscar/ })[0]); });
  await screen.findAllByText(new RegExp(ROTULOS.comprado));
  return vista.container;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Consulta de artículos — celular: el color es una ficha", () => {
  it("no hay tabla de colores que se deslice de lado", async () => {
    const c = await buscarEnCelular();
    expect(c.querySelector("table.min-w-\\[540px\\]")).toBeNull();
    expect(c.querySelectorAll('[data-referencia="color-celular"]').length).toBeGreaterThan(0);
  });

  it("el detalle de un color abre FUERA de cualquier zona con overflow-x", async () => {
    const c = await buscarEnCelular();
    const antes = c.querySelectorAll("*").length;
    const color = c.querySelector('[data-referencia="color-celular"]') as HTMLElement;
    expect(color).not.toBeNull();
    await act(async () => { fireEvent.click(color); });
    expect(c.querySelectorAll("*").length).toBeGreaterThan(antes);
    const ficha = color.closest("li")!;
    expect(ficha.closest(".overflow-x-auto")).toBeNull();
    // El detalle está en la ficha, con Stock y % vendido completos.
    expect(ficha.textContent).toMatch(new RegExp(ROTULOS.stock));
    expect(ficha.textContent).toMatch(/\d+ %/);
  });
});
