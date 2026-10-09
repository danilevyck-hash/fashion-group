// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — `REFERENCIA_APPLE_2026_10` APAGADO = CONSULTA DE ARTÍCULOS DE HOY,
// BYTE POR BYTE (9-oct-2026).
//
// Busca el modelo NB2570 y el código NB2570001 (datos reales del fixture), en
// el celular y en la computadora, y compara el HTML entero contra
// `__snapshots__/referencia-apple-apagado…`. La foto se sacó con el código de
// `origin/main` ANTES del rediseño. Prendido, se pone rojo, y el bloque de
// abajo dice qué trae la propuesta.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";

const interruptor = vi.hoisted(() => ({ prendido: false }));
vi.mock("@/lib/ventas/referencia-apple-2026-10", () => ({
  get REFERENCIA_APPLE_2026_10() { return interruptor.prendido; },
}));
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

function aparato(celular: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: celular, media: q, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  }));
}

async function buscar(q: string, celular: boolean) {
  aparato(celular);
  const arts = q === "NB2570" ? TODOS : TODOS.filter((a) => a.codigo === q);
  const resp: ComprasApiResp = {
    hoy: HOY, hoyMes: "2026-09", articulos: arts, noEncontrados: [],
    comprasDisponibles: true, infoDisponible: true, margenVisible: false,
  };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => resp }) as unknown as Response));
  const vista = render(<ReferenciaView />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: q } });
  await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /Buscar/ })[0]); });
  await screen.findAllByText(new RegExp(ROTULOS.comprado));
  return vista.container;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); interruptor.prendido = false; });

describe("Consulta de artículos — interruptor APAGADO = la pantalla de hoy", () => {
  for (const q of ["NB2570", "NB2570001"]) {
    for (const celular of [false, true]) {
      it(`${q} en ${celular ? "celular" : "computadora"}: HTML idéntico al de origin/main`, async () => {
        expect((await buscar(q, celular)).innerHTML).toMatchSnapshot();
      });
    }
  }
});

describe("Consulta de artículos — interruptor PRENDIDO = la propuesta", () => {
  it("Stock es EL número y lo demás va en una línea debajo", async () => {
    interruptor.prendido = true;
    const c = await buscar("NB2570", false);
    const grande = c.querySelector('[data-referencia="stock-grande"]')!;
    expect(grande.textContent).toContain("888");
    expect(c.querySelector('[data-referencia="linea-mercancia"]')!.textContent).toMatch(/Comprado 5,856 · Vendido 4,580 · 84 % vendido/);
    expect(c.textContent).not.toMatch(/Existencias/i);
  });
  it("un solo bloque de recepciones, con cuántas y desde cuándo", async () => {
    interruptor.prendido = true;
    const c = await buscar("NB2570", false);
    expect(c.textContent).toMatch(/Últimas recepciones · 27 desde oct 2022/);
    expect(c.querySelectorAll('[data-referencia="recepcion"]').length).toBe(2);
  });
  it("celular: un renglón de dos líneas por color, sin la tabla de 7 columnas", async () => {
    interruptor.prendido = true;
    const c = await buscar("NB2570", true);
    expect(c.querySelector("table.min-w-\\[540px\\]")).toBeNull();
    const filas = c.querySelectorAll('[data-referencia="color-celular"]');
    expect(filas.length).toBeGreaterThan(0);
    expect(filas[0].textContent).toMatch(/Comprado .* · Vendido .* · \d+ %/);
  });
  it("arriba ya no se repite «1 modelo · 26 colores»", async () => {
    interruptor.prendido = true;
    const c = await buscar("NB2570", false);
    expect(c.textContent).not.toMatch(/1 modelo · 26 colores/);
  });
});
