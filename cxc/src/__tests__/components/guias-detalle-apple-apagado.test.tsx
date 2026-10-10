// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — `GUIA_DETALLE_APPLE_2026_10` APAGADO = EL DETALLE DE HOY, BYTE POR
// BYTE (9-oct-2026).
//
// Monta `/despachos/[id]` con la página, el hook y el `DespachoForm` REALES, y
// con `GUIAS_LISTA_APPLE_2026_10` como está en producción (prendido). Compara el
// HTML entero contra `__snapshots__/guias-detalle-apple-apagado…`. La foto se
// sacó con el código de `origin/main` ANTES de los cambios del 9-oct: con el
// interruptor apagado, un solo byte distinto pone esto rojo.
//
// El otro candado (`guias-detalle-apple.test.tsx`) amarra que el PUT del
// despacho sea idéntico prendido y apagado.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

const flags = vi.hoisted(() => ({ detalle: false, rol: "bodega" }));
vi.mock("@/lib/guias/guias-2026-10", async (orig) => ({
  ...(await orig<typeof import("@/lib/guias/guias-2026-10")>()),
  get GUIA_DETALLE_APPLE_2026_10() { return flags.detalle; },
}));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: flags.rol }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => <div /> }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "22222222-2222-4222-8222-222222222222" }),
}));

import GuiaPage from "@/app/despachos/[id]/page";
import "@/lib/guias/papel-de-la-guia";

const GUIA_ID = "22222222-2222-4222-8222-222222222222";
const item = (n: number, cliente: string, bultos: number, transp: string, mas: Record<string, unknown> = {}) => ({
  id: `it-${n}`, orden: n, cliente, cliente_codigo: `D-${n}`, direccion: "David", empresa: "Vistana",
  facturas: `000${n}`, bultos, numero_guia_transp: transp, ...mas,
});
const PENDIENTE = {
  id: GUIA_ID, numero: 272, fecha: "2026-10-01", transportista: "Transporte Sol",
  modo_entrega: "transportista", transportista_id: "t1", placa: "", observaciones: "2 cajas de ganchos",
  total_bultos: 19, item_count: 3, estado: "Pendiente Bodega", numero_guia_transp: "",
  guia_items: [item(1, "CITY MALL DAVID", 7, ""), item(2, "DOLLAR MALL", 3, ""), item(3, "GRUPO HANNA", 9, "", { con_etiquetas: true })],
};
const COMPLETADA = {
  ...PENDIENTE, estado: "Completada", placa: "377744", receptor_nombre: "Eduin González", cedula: "4-255-65",
  entregado_por: "Jorman", firma_base64: "data:image/png;base64,AAAA", firma_entregador_base64: "data:image/png;base64,BBBB",
  guia_items: [item(1, "CITY MALL DAVID", 7, "TS-9"), item(2, "DOLLAR MALL", 3, "TS-9"), item(3, "GRUPO HANNA", 9, "TS-9", { con_etiquetas: true })],
};
/** Cada envío con SU número: no hay uno común que decir una sola vez. */
const COMPLETADA_VARIOS = { ...COMPLETADA, guia_items: [item(1, "CITY MALL DAVID", 7, "TS-1"), item(2, "DOLLAR MALL", 3, "")] };
const DIRECTA = { ...PENDIENTE, transportista: "", modo_entrega: "entrega_directa", transportista_id: null };

async function montar(guia: Record<string, unknown>, rol = "bodega") {
  flags.rol = rol;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).startsWith(`/api/guias/${GUIA_ID}`)) return { ok: true, json: async () => guia };
    if (String(url).includes("despachadores")) return { ok: true, json: async () => ({ nombres: ["Jorman", "Julio"] }) };
    return { ok: true, json: async () => ({ juegos: [] }) };
  }));
  let vista: ReturnType<typeof render> | undefined;
  await act(async () => { vista = render(<GuiaPage />); });
  await screen.findByText("CITY MALL DAVID");
  await act(async () => { await Promise.resolve(); });
  return vista!.container;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  flags.detalle = false;
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* jsdom sin storage */ }
});

describe("Detalle de guía — interruptor APAGADO = la pantalla de hoy", () => {
  it("el interruptor sigue apagado: lo prende Daniel", async () => {
    const real = await vi.importActual<typeof import("@/lib/guias/guias-2026-10")>("@/lib/guias/guias-2026-10");
    expect(real.GUIA_DETALLE_APPLE_2026_10).toBe(false);
  });
  it("pendiente, bodega: HTML idéntico al de origin/main", async () => {
    expect((await montar(PENDIENTE)).innerHTML).toMatchSnapshot();
  });
  it("pendiente en entrega directa: HTML idéntico", async () => {
    expect((await montar(DIRECTA)).innerHTML).toMatchSnapshot();
  });
  it("pendiente, vendedor (mira, no despacha): HTML idéntico", async () => {
    expect((await montar(PENDIENTE, "vendedor")).innerHTML).toMatchSnapshot();
  });
  it("completada: HTML idéntico", async () => {
    expect((await montar(COMPLETADA)).innerHTML).toMatchSnapshot();
  });
  it("completada con un N° distinto por envío: HTML idéntico", async () => {
    expect((await montar(COMPLETADA_VARIOS)).innerHTML).toMatchSnapshot();
  });
});

describe("Detalle de guía — interruptor PRENDIDO (9-oct-2026, propuesta)", () => {
  it("completada: «Despachada» junto al título, sin «Ya despachada» ni «Tipo de despacho», con «Despachado por»", async () => {
    flags.detalle = true;
    const c = await montar(COMPLETADA);
    expect(c.querySelector("[data-estado-guia]")!.textContent).toBe("Despachada");
    expect(c.textContent).not.toContain("Ya despachada");
    expect(c.textContent).not.toContain("Tipo de despacho");
    const hecho = c.querySelector("[data-despacho-hecho]")!;
    expect(hecho.textContent).toContain("Despachado por");
    expect(hecho.textContent).toContain("Jorman");
  });
  it("el N° del transportista, si es el MISMO en todos los envíos, se dice una sola vez", async () => {
    flags.detalle = true;
    const c = await montar(COMPLETADA);
    expect(c.querySelector("[data-numero-comun]")!.textContent).toBe("N° del transportista: TS-9");
    expect(c.textContent!.split("TS-9")).toHaveLength(2);
  });
  it("con números distintos por envío, cada fila dice el suyo", async () => {
    flags.detalle = true;
    const c = await montar(COMPLETADA_VARIOS);
    expect(c.querySelector("[data-numero-comun]")).toBeNull();
    expect(c.textContent).toContain("N° del transportista: TS-1");
    expect(c.textContent).toContain("N° del transportista: —");
  });
  it("las observaciones se leen ANTES de los envíos", async () => {
    flags.detalle = true;
    const c = await montar(PENDIENTE);
    const html = c.innerHTML;
    expect(html.indexOf("2 cajas de ganchos")).toBeGreaterThan(-1);
    expect(html.indexOf("2 cajas de ganchos")).toBeLessThan(html.indexOf("CITY MALL DAVID"));
  });
  it("pendiente: «N° del transportista» solo en la caja, y el tipo de despacho en una línea", async () => {
    flags.detalle = true;
    const c = await montar(PENDIENTE);
    expect(c.textContent).not.toContain("Anota el N°");
    expect(c.textContent).not.toContain("N° del transportista");
    expect((document.getElementById("transp-0") as HTMLInputElement).placeholder).toBe("N° del transportista");
    expect(c.querySelector("[data-tipo-despacho-linea]")!.textContent).toContain("Tipo de despacho: Transportista externo");
  });
  it("🔴 «Despachar» no se apaga: al tocarlo con faltas lo dice TODO y no envía nada", async () => {
    flags.detalle = true;
    const c = await montar(PENDIENTE);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const antes = fetchMock.mock.calls.length;
    expect(c.textContent).not.toContain("Falta:");
    const boton = screen.getByRole("button", { name: "Despachar" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    await act(async () => { fireEvent.click(boton); });
    expect(screen.getByRole("alert").textContent).toContain("Falta: placa, recibido por, cédula, despachado por");
    expect(fetchMock.mock.calls.length).toBe(antes);
  });
});
