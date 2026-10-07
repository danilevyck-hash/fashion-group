/**
 * CANDADO · DETALLE DE GUÍA ESTILO APPLE (2-oct-2026, `GUIA_DETALLE_APPLE_2026_10`).
 *
 * Daniel: «mira que hay mucho espacio vacío, ¿qué opinas?». La propuesta solo
 * cambia la PANTALLA de `/guias/[id]`; esto prueba, con la página real y el
 * hook real, que:
 *   1. lo que viaja al despachar (el PUT) es IDÉNTICO prendido y apagado;
 *   2. prendido, cada envío es UNA fila con sus dos cajas (mismos `id`);
 *   3. siguen las reglas de Guías: bultos solo con la guía PENDIENTE, el envío
 *      etiquetado se lee con candado, y firmada no hay ninguna caja.
 *
 * ⚠️ Las firmas se dibujan en un `<canvas>` que jsdom no tiene: `DespachoForm`
 * se reemplaza por dos botones que llaman a los MISMOS props que la página le
 * pasa (los setters y `onConfirmar`). El cuerpo del PUT lo arma el producto.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// 5-oct-2026: `GUIAS_LISTA_APPLE_2026_10` se prendió (Daniel: «sigue»). Este
// candado fija la pantalla de ANTES, así que la mira con el interruptor apagado;
// la nueva la fija `guias-lista-apple-2026-10.test.tsx`.
vi.mock("@/lib/guias/lista-apple-2026-10", async (orig) => ({
  ...(await orig<typeof import("@/lib/guias/lista-apple-2026-10")>()),
  GUIAS_LISTA_APPLE_2026_10: false,
}));
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";

const flags = vi.hoisted(() => ({ detalle: false }));
vi.mock("@/lib/guias/guias-2026-10", async (orig) => {
  const real = await orig<typeof import("@/lib/guias/guias-2026-10")>();
  return {
    ...real,
    get GUIA_DETALLE_APPLE_2026_10() {
      return flags.detalle;
    },
  };
});
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: "bodega" }),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => <div /> }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "22222222-2222-4222-8222-222222222222" }),
}));
vi.mock("@/app/despachos/components/DespachoForm", () => ({
  default: (p: Record<string, (...a: unknown[]) => void>) => (
    <div>
      <button
        type="button"
        onClick={() => {
          p.setBPlaca("AB-1234");
          p.setBReceptor("Juan Pérez");
          p.setBCedula("8-123-456");
          p.setDespachadoPor("Jorman");
        }}
      >
        Llenar despacho
      </button>
      <button type="button" onClick={() => p.onConfirmar("firma1", "firma2")}>
        Confirmar despacho
      </button>
    </div>
  ),
}));

import GuiaPage from "@/app/despachos/[id]/page";
import "@/lib/guias/papel-de-la-guia";

const GUIA_ID = "22222222-2222-4222-8222-222222222222";

const ITEMS = [
  { id: "it-1", orden: 1, cliente: "CITY MALL DAVID", cliente_codigo: "D-1", direccion: "David", empresa: "Fashion Wear", facturas: "01-0001234", bultos: 7, numero_guia_transp: "" },
  { id: "it-2", orden: 2, cliente: "DOLLAR MALL", cliente_codigo: "D-2", direccion: "Chitré", empresa: "Vistana", facturas: "02-0005678", bultos: 3, numero_guia_transp: "" },
  { id: "it-3", orden: 3, cliente: "GRUPO HANNA", cliente_codigo: "D-3", direccion: "Santiago", empresa: "Active Shoes", facturas: "03-0009999", bultos: 9, numero_guia_transp: "", con_etiquetas: true },
];

function guia(over: Record<string, unknown> = {}) {
  return {
    id: GUIA_ID, numero: 272, fecha: "2026-10-01", transportista: "Transporte Sol",
    modo_entrega: "transportista", transportista_id: "t1", placa: "", observaciones: "",
    total_bultos: 19, item_count: ITEMS.length, monto_total: 0, estado: "Pendiente Bodega",
    numero_guia_transp: "", guia_items: ITEMS, ...over,
  };
}

let puts: unknown[];
function stubFetch(over: Record<string, unknown> = {}) {
  puts = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    if (method === "PUT") puts.push(JSON.parse(String(init?.body)));
    if (String(url).startsWith(`/api/guias/${GUIA_ID}`)) return { ok: true, json: async () => guia(over) };
    if (String(url).includes("despachos-frecuentes")) return { ok: true, json: async () => ({ juegos: [] }) };
    return { ok: true, json: async () => ({}) };
  }));
}

async function montar(over: Record<string, unknown> = {}) {
  stubFetch(over);
  render(<GuiaPage />);
  await screen.findByText("CITY MALL DAVID");
}

const caja = (id: string) => document.getElementById(id) as HTMLInputElement | null;

async function despacharConLosMismosDatos(): Promise<unknown> {
  await montar();
  await act(async () => { fireEvent.change(caja("despacho-bultos-0")!, { target: { value: "8" } }); });
  await act(async () => { fireEvent.change(caja("transp-0")!, { target: { value: "TS-551" } }); });
  await act(async () => { fireEvent.change(caja("transp-2")!, { target: { value: "TS-553" } }); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Llenar despacho" })); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirmar despacho" })); });
  await waitFor(() => expect(puts).toHaveLength(1));
  return puts[0];
}

beforeEach(() => {
  flags.detalle = false;
  try { localStorage.clear(); } catch { /* jsdom sin storage */ }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("🔴 1 · el PUT del despacho es idéntico prendido y apagado", () => {
  it("mismos bultos corregidos, mismos N° por línea, mismo cuerpo", async () => {
    flags.detalle = false;
    const apagado = await despacharConLosMismosDatos();
    cleanup();
    vi.unstubAllGlobals();
    flags.detalle = true;
    const prendido = await despacharConLosMismosDatos();
    expect(prendido).toEqual(apagado);
    // Y el cuerpo dice lo que se tecleó (sin esto, «iguales» podría ser «los dos vacíos»).
    const b = prendido as Record<string, unknown>;
    expect(b.items_bultos).toEqual([{ id: "it-1", bultos: 8 }]);
    expect(b.items_guia_transp).toEqual([
      { id: "it-1", numero_guia_transp: "TS-551" },
      { id: "it-2", numero_guia_transp: "" },
      { id: "it-3", numero_guia_transp: "TS-553" },
    ]);
    expect(b.items).toBeUndefined();
  });
});

describe("🔴 2 · prendido: una fila por envío, con sus cajas", () => {
  it("cada envío es UNA fila y la tarjeta de arriba es una línea", async () => {
    flags.detalle = true;
    await montar();
    expect(document.querySelectorAll("[data-envio-fila]")).toHaveLength(3);
    expect(document.querySelector("[data-guia-datos]")!.textContent).toContain("Transporte Sol · 3 envíos · 19 bultos");
    // Bultos angosto, N° del transportista de 184 px.
    expect(caja("despacho-bultos-0")!.className).toContain("w-[72px]");
    expect(caja("transp-0")!.className).toContain("sm:w-[184px]");
  });

  it("CONTROL — apagado, la pantalla de hoy (sin filas nuevas)", async () => {
    flags.detalle = false;
    await montar();
    expect(document.querySelectorAll("[data-envio-fila]")).toHaveLength(0);
    expect(caja("transp-0")!.className).toContain("w-full");
  });
});

describe("🔴 3 · las reglas de Guías no cambian", () => {
  it("el envío etiquetado se LEE con candado: sin caja de bultos", async () => {
    flags.detalle = true;
    await montar();
    expect(caja("despacho-bultos-2")).toBeNull();
    const fijo = document.querySelector("[data-bultos-de-etiquetas='1']");
    expect(fijo?.textContent).toContain("9 bultos");
    // El N° del transportista sí: es por línea y no se bloquea.
    expect(caja("transp-2")).not.toBeNull();
  });

  it("guía firmada: ninguna caja, los bultos y el N° se leen", async () => {
    flags.detalle = true;
    await montar({ estado: "Completada", placa: "AB-1", receptor_nombre: "Juan" });
    expect(document.querySelectorAll("input[id^='despacho-bultos-']")).toHaveLength(0);
    expect(document.querySelectorAll("input[id^='transp-']")).toHaveLength(0);
    expect(document.body.textContent).toContain("7 bultos");
    expect(document.body.textContent).toContain("N° del transportista:");
  });
});
