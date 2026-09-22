/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CANDADO DE CONDUCTA — LA CASILLA DE SELECCIÓN LLEVA A ALGÚN LADO (22-sep-2026)
 *
 * En la captura de Comprobantes de Reebok del 19-sep-2026 hay una casilla
 * «Seleccionar todos» y, debajo, una casilla por fila. Daniel: *«no hay ningún
 * botón que use la selección»*.
 *
 * 🩸 MEDIDO ANTES DE TOCAR NADA. La acción **existe y está enchufada**:
 * `POST /api/catalogo/<marca>/orders/bulk-delete` (admin y secretaria), y en
 * `activity_logs` hay **1 uso en 90 días** — el 24-jul-2026, en Reebok,
 * `{"total":12,"eliminados":12,"fallidos":0}`: doce pedidos de una sola vez.
 * No es una casilla sin destino: es la única forma de no abrir doce ventanas.
 * Por eso se QUEDA. Lo que estaba roto eran otras dos cosas:
 *
 *   1. El botón rojo solo aparece con algo seleccionado — con la pantalla
 *      quieta, la casilla no anuncia nada. Ahora el propio rótulo dice a
 *      cuántas filas alcanza: «Seleccionar todos (13)».
 *   2. 🩸 **«Seleccionar todos» NO seleccionaba todos**: cubría solo los meses
 *      ABIERTOS. En esa misma captura —septiembre abierto con 2 filas, julio
 *      plegado con 11— marcaba **2 de 13** y el botón decía «(2)».
 *
 * Se monta la pantalla real y se tocan los controles reales.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ComprobantesPanel, { type UnifiedPedido } from "@/components/catalogo/ComprobantesPanel";
import {
  textoEliminarSeleccionados,
  textoSeleccionarTodos,
} from "@/lib/catalogo/cuantas-comprobantes";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/catalogo/reebok/pedidos",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => false,
  readSidebarCollapsed: () => false,
}));
vi.mock("@/lib/catalogo/order-pdf-client", () => ({
  downloadCatalogoOrderPdf: vi.fn(async () => {}),
}));

const leer = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const HOY = new Date();
const enDias = (d: number) => new Date(HOY.getTime() - d * 86_400_000).toISOString();

const base = (i: number, over: Partial<UnifiedPedido> = {}): UnifiedPedido => ({
  origen: "mio",
  id_natural: `1111111${i}-1111-4111-8111-11111111111${i % 10}`,
  cliente: `Cliente ${i}`,
  total: 1000 + i,
  created_at: enDias(3),
  vendor: "REINALDO ESPINOSA",
  item_count: 2,
  fuente: "orders",
  confirmado_cliente_at: null,
  switch_numero: `16-00000050${i % 10}`,
  en_switch: true,
  numero_pedido: `PED-0${20 + i}`,
  switch_documento: "pedido",
  status: "confirmado",
  client_email: null,
  ...over,
});

// La forma de la captura: 2 filas en el mes nuevo (abierto) y 11 en el viejo
// (plegado). Los dos meses se eligen bien adentro de la ventana de 90 días.
const MES_NUEVO = [base(1), base(2)];
const MES_VIEJO = Array.from({ length: 11 }, (_, i) => base(10 + i, { created_at: enDias(45) }));
const TRECE = [...MES_NUEVO, ...MES_VIEJO];

function pintar(pedidos: UnifiedPedido[], puedeAdministrar = true) {
  return render(
    <ComprobantesPanel
      marca="reebok"
      pedidos={pedidos}
      onRefresh={async () => {}}
      showToast={vi.fn()}
      puedeAdministrar={puedeAdministrar}
      puedeEditar
    />,
  );
}

const casillaTodos = () =>
  screen.getByText(new RegExp("^Seleccionar todos")).closest("label")!.querySelector("input")!;
const botonBorrar = () =>
  [...document.querySelectorAll("button")].find((b) =>
    (b.textContent || "").startsWith("Eliminar seleccionados"),
  );
const casillasDeFila = () =>
  [...document.querySelectorAll('tbody input[type="checkbox"]')] as HTMLInputElement[];

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});
afterEach(cleanup);

describe("🔴 la casilla DICE a cuántas filas alcanza", () => {
  it("el rótulo lleva el número, con la pantalla quieta", () => {
    pintar(TRECE);
    expect(screen.getByText(textoSeleccionarTodos(13))).toBeTruthy();
  });

  it("y el número SIGUE AL FILTRO: al buscar, baja", () => {
    pintar(TRECE);
    fireEvent.change(screen.getByPlaceholderText("Buscar por cliente o número…"), {
      target: { value: "PED-021" },
    });
    // El número de la casa calza con UNA sola fila.
    expect(screen.getByText(textoSeleccionarTodos(1))).toBeTruthy();
  });
});

describe("🩸 «Seleccionar todos» alcanza también los meses PLEGADOS", () => {
  it("marca las 13, no las 2 del mes abierto", () => {
    pintar(TRECE);
    fireEvent.click(casillaTodos());
    const boton = botonBorrar();
    expect(boton, "la selección no ofrece ninguna acción").toBeTruthy();
    expect(boton!.textContent).toBe(textoEliminarSeleccionados(13));
  });

  it("y destildar las deja todas en cero", () => {
    pintar(TRECE);
    fireEvent.click(casillaTodos());
    fireEvent.click(casillaTodos());
    expect(botonBorrar()).toBeUndefined();
  });

  it("⚠️ pero NUNCA alcanza lo que el «Ver más» esconde", () => {
    // Un pedido del link sin confirmar de hace 60 días: fuera de su ventana
    // de 30. No se ve, y no se puede seleccionar.
    const escondido = base(99, {
      origen: "link",
      fuente: "publicos",
      status: null,
      en_switch: false,
      switch_numero: null,
      switch_documento: null,
      numero_pedido: null,
      created_at: enDias(60),
    });
    pintar([...TRECE, escondido]);
    fireEvent.click(casillaTodos());
    expect(botonBorrar()!.textContent).toBe(textoEliminarSeleccionados(13));
    expect(screen.getByText("Ver más (1)")).toBeTruthy();
  });
});

describe("🔴 la acción existe, manda a su ruta y avisa lo que ya está en Switch", () => {
  it("el botón abre la ventana, que vuelve a decir cuántos son", async () => {
    pintar(TRECE);
    fireEvent.click(casillaTodos());
    fireEvent.click(botonBorrar()!);
    expect(await screen.findByText("¿Eliminar 13 pedidos?")).toBeTruthy();
    // 🔴 Y dice lo que la lista no puede arreglar sola: los que ya salieron
    // siguen vivos en Switch.
    expect(screen.getByText(/SIGUEN en Switch/)).toBeTruthy();
  });

  it("confirmar llama a `bulk-delete` con las 13 filas", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, eliminados: 13, fallidos: 0 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    pintar(TRECE);
    fireEvent.click(casillaTodos());
    fireEvent.click(botonBorrar()!);
    const confirmar = await screen.findByText("Eliminar 13 pedidos");
    await waitFor(() => expect((confirmar as HTMLButtonElement).disabled).toBe(false), {
      timeout: 2500,
    });
    fireEvent.click(confirmar);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/orders/bulk-delete");
    expect(JSON.parse(String(init.body)).pedidos.length).toBe(13);
  });

  it("⚠️ a quien no administra no se le ofrece ni la casilla", () => {
    pintar(TRECE, false);
    expect(screen.queryByText(/^Seleccionar todos/)).toBeNull();
    expect(casillasDeFila().length).toBe(0);
  });
});

describe("🔑 la regla vive en un lugar, y el servidor sigue siendo el candado", () => {
  it("los dos rótulos salen de `cuantas-comprobantes.ts`, no tecleados en la pantalla", () => {
    const panel = leer("src/components/catalogo/ComprobantesPanel.tsx")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(panel).toContain("textoSeleccionarTodos(seleccionables.length)");
    expect(panel).toContain("textoEliminarSeleccionados(selectedRows.length)");
    // Un botón destructivo sin número es exactamente lo que la regla prohíbe.
    expect(panel).not.toContain(">Eliminar seleccionados<");
    expect(panel).not.toContain("Seleccionar todos\n");
  });

  it("🔴 `bulk-delete` sigue cerrado a admin y secretaria en el SERVIDOR", () => {
    const ruta = leer("src/app/api/catalogo/[marca]/orders/bulk-delete/route.ts");
    expect(ruta).toContain('requireRole(req, ["admin", "secretaria"])');
  });
});
