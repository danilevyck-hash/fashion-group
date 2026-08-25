/**
 * 🔴 EL N° DEL TRANSPORTISTA NO SE COPIA A TODOS LOS ENVÍOS.
 *
 * 🩸 El número que la secretaria escribe UNA vez al crear la guía se
 * prellenaba en los 7 renglones, y bodega abría la guía y los encontraba todos
 * llenos con el mismo: había que borrarlos y corregirlos uno por uno o el papel
 * salía mal. Es lo contrario de lo que se decidió el 10-ago-2026 — Daniel:
 * *"la info de guia de transp, debe de ser por linea, no por guia porque nos
 * hacen varias guias el transportista por guia"*.
 *
 * 🔑 ESTE CANDADO RENDERIZA LA PANTALLA REAL y lee el `value` de cada caja. Un
 * barrido sobre el hook ve la expresión, pero no puede ver lo único que
 * importa: qué encuentra bodega escrito en los campos.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";

const ROUTER = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
const PARAMS = { id: "guia-808" };
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  useParams: () => PARAMS,
  usePathname: () => "/guias/guia-808",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));

const ENVIOS = [
  { id: "it-1", orden: 1, cliente: "CITY MALL PASO CANOA", cliente_codigo: "D-25", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "10234", bultos: 6, numero_guia_transp: "" },
  { id: "it-2", orden: 2, cliente: "GRUPO HANNA", cliente_codigo: "D-68", direccion: "Changuinola", empresa: "Active Wear", facturas: "10235", bultos: 2, numero_guia_transp: "" },
  { id: "it-3", orden: 3, cliente: "WOLF MALL CENTER INT", cliente_codigo: "D-156", direccion: "Guabito", empresa: "Joystep", facturas: "10236", bultos: 7, numero_guia_transp: "" },
];

/** Guía PENDIENTE con el N° puesto AL CREARLA y ninguna línea con el suyo. */
const GUIA = {
  id: "guia-808", numero: 208, fecha: "2026-08-25",
  estado: "Pendiente Bodega", modo_entrega: "transportista",
  transportista_id: "t-1", transportista: "Transporte Sol",
  entregado_por: "Julio", observaciones: "", placa: "",
  numero_guia_transp: "TR-4471",
  guia_items: ENVIOS,
};

function memStorage(): Storage {
  let m: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in m ? m[k] : null),
    setItem: (k: string, v: string) => { m[k] = String(v); },
    removeItem: (k: string) => { delete m[k]; },
    clear: () => { m = {}; },
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

let guiaServida: Record<string, unknown> = GUIA;

beforeEach(() => {
  guiaServida = GUIA;
  vi.stubGlobal("localStorage", memStorage());
  vi.stubGlobal("sessionStorage", memStorage());
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_modules", JSON.stringify(["guias"]));
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: { method?: string }) => {
    const u = String(url);
    if ((init?.method || "GET").toUpperCase() !== "GET") return { ok: true, json: async () => ({}) };
    if (u.startsWith("/api/guias/despachos-frecuentes")) return { ok: true, json: async () => ({ juegos: [] }) };
    if (u.startsWith("/api/guias/frecuencias")) return { ok: true, json: async () => ({ clientes: [], empresas: [], direcciones: {} }) };
    if (u.startsWith("/api/transportistas")) return { ok: true, json: async () => [{ id: "t-1", nombre: "Transporte Sol", activo: true }] };
    if (u.startsWith("/api/guias/guia-808")) return { ok: true, json: async () => guiaServida };
    if (u.startsWith("/api/clientes")) return { ok: true, json: async () => ({ clientes: [] }) };
    return { ok: true, json: async () => ({}) };
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function abrir() {
  const Page = (await import("@/app/guias/[id]/page")).default;
  render(<Page />);
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
}

const cajas = () =>
  [...document.querySelectorAll<HTMLInputElement>('input[id^="transp-"]')];

describe("las cajas del N° arrancan con lo de SU línea", () => {
  it("con el número puesto al crear la guía, las 3 cajas están VACÍAS", async () => {
    await abrir();
    const c = cajas();
    expect(c).toHaveLength(3);
    expect(c.map((i) => i.value)).toEqual(["", "", ""]);
  });

  it("pero el número anotado al crearla SE DICE, no se esconde", async () => {
    await abrir();
    // Sin esto, quien despacha no sabría que ya hay uno para toda la guía.
    expect(document.body.textContent).toMatch(/Al crear la guía se anotó/i);
    expect(document.body.textContent).toMatch(/TR-4471/);
  });

  it("la línea que SÍ tiene el suyo lo trae, y las otras no", async () => {
    guiaServida = {
      ...GUIA,
      guia_items: [
        { ...ENVIOS[0], numero_guia_transp: "TR-9999" },
        ENVIOS[1],
        ENVIOS[2],
      ],
    };
    await abrir();
    expect(cajas().map((i) => i.value)).toEqual(["TR-9999", "", ""]);
  });

  it("sin número de cabecera no se dice nada de más", async () => {
    guiaServida = { ...GUIA, numero_guia_transp: "" };
    await abrir();
    expect(cajas().map((i) => i.value)).toEqual(["", "", ""]);
    expect(document.body.textContent).not.toMatch(/Al crear la guía se anotó/i);
  });
});
