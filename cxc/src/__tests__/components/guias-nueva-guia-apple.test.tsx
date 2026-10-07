/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CANDADO · NUEVA GUÍA ESTILO APPLE (1-oct-2026, `GUIA_APPLE_2026_10`).
 * Daniel aprobó la «Propuesta estilo Apple» del mockup; reglas en docs/diseno.md.
 *
 * 🔴 Lo que NO puede cambiar: el payload. Se arma la MISMA guía con el
 * interruptor prendido y apagado y lo que viaja a `POST /api/guias` y a
 * `/api/guias/etiquetas/importar` tiene que ser idéntico.
 *
 * Y lo de la pantalla: «+ Agregar factura», el chip «Sin etiqueta», el
 * transportista nace vacío, «Guardar guía» apagado sin envíos y la barra con
 * el total en vivo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act, within } from "@testing-library/react";
import NuevaGuiaClient from "@/app/despachos/nueva/NuevaGuiaClient";
import type { EtiquetaFila } from "@/lib/guias/etiquetas";
import { hoyPanama } from "@/lib/fecha-panama";
import { ATRIBUTO_BARRA_FIJA, DIAMETRO_FLOTANTE, VAR_ALTO_BARRA_FIJA, abajoDelFlotante } from "@/lib/navegacion/barra-celular";

const flags = vi.hoisted(() => ({ apple: true }));
vi.mock("@/lib/guias/guias-2026-10", async (orig) => {
  const real = await orig<typeof import("@/lib/guias/guias-2026-10")>();
  return {
    ...real,
    get GUIA_APPLE_2026_10() {
      return flags.apple;
    },
  };
});

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: "secretaria" }),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => <div /> }));

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

const NOVA = { codigo: "D-170", nombre: "Nova Lux, S.A." };

function etq(over: Partial<EtiquetaFila>): EtiquetaFila {
  return {
    id: 1, empresa_key: "vistana", empresa: "Vistana International", switch_factura_id: 3097,
    secuencial: "11-000003097", fecha_factura: "2026-09-28", cliente_codigo: NOVA.codigo,
    cliente_nombre: NOVA.nombre, destino: "Paso Canoas", cajas: 50, creado_en: "2026-10-01T10:00:00-05:00",
    guia_numero: null, envio_id: "e1", orden_en_envio: 1, nota: null, ...over,
  };
}

let etiquetas: EtiquetaFila[];
const ETIQUETAS: EtiquetaFila[] = [
  etq({ id: 1, secuencial: "11-000003097", switch_factura_id: 3097, cajas: 50 }),
  etq({ id: 2, secuencial: "11-000003096", switch_factura_id: 3096, cajas: 48, orden_en_envio: 2 }),
  etq({ id: 3, secuencial: "11-000003110", switch_factura_id: 3110, cajas: 4, envio_id: "e2" }),
  etq({ id: 4, secuencial: "11-000003285", switch_factura_id: 3285, cajas: 3, envio_id: "e3", empresa_key: "fashion_wear", empresa: "Fashion Wear", cliente_codigo: "D-108", cliente_nombre: "American Classics Store", destino: "David" }),
];

const FACTURAS_NOVA = [
  { empresa_key: "vistana", empresa: "Vistana International", switch_factura_id: 3099, secuencial: "11-000003099", fecha: "2026-10-01T14:00:00Z", total: 100, yaSalioEn: null },
];

let posts: Array<{ url: string; body: Record<string, unknown> }>;

beforeEach(() => {
  flags.apple = true;
  etiquetas = ETIQUETAS;
  posts = [];
  push.mockReset();
  vi.stubGlobal("localStorage", memStorage());
  vi.stubGlobal("sessionStorage", memStorage());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if ((init?.method || "GET").toUpperCase() === "POST") {
        posts.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) });
        if (u === "/api/guias") return { ok: true, json: async () => ({ id: "g-nueva", numero: 272 }) };
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (u.startsWith("/api/guias/etiquetas")) return { ok: true, json: async () => ({ etiquetas }) };
      if (u.startsWith("/api/guias/facturas-cliente")) return { ok: true, json: async () => ({ facturas: FACTURAS_NOVA, hasta: null }) };
      if (u.startsWith("/api/transportistas")) return { ok: true, json: async () => [{ id: "t1", nombre: "Transporte Sol", activo: true }] };
      if (u.startsWith("/api/guias/frecuencias")) return { ok: true, json: async () => ({ clientes: [NOVA], empresas: [] }) };
      if (u.startsWith("/api/clientes")) return { ok: true, json: async () => ({ clientes: [NOVA] }) };
      return { ok: true, json: async () => ({}) };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function montarApple() {
  render(<NuevaGuiaClient />);
  await screen.findByRole("heading", { name: "Nueva guía" });
  await waitFor(() => expect(document.querySelectorAll("[data-envio]").length).toBe(3));
}

const tarjeta = (envio: string) =>
  within(document.querySelector(`[data-envio="${envio}"]`) as HTMLElement).getByRole("button");
const botonGuardar = () => screen.getByRole("button", { name: "Guardar guía" }) as HTMLButtonElement;
const barra = () => screen.getByTestId("total-en-vivo").textContent?.replace(/\s+/g, " ").trim();

async function agregarFactura3099() {
  const campo = document.getElementById("agregar-cliente") as HTMLInputElement;
  fireEvent.focus(campo);
  fireEvent.change(campo, { target: { value: "" } });
  const opcion = await screen.findByText(NOVA.nombre, { selector: "[data-desplegable] *" });
  await act(async () => { fireEvent.mouseDown(opcion.closest("button") ?? opcion); });
  const panel = await screen.findByTestId("agregar-sin-etiquetas");
  const fila = (await within(panel).findByText("11-000003099")).closest("label") as HTMLElement;
  await act(async () => { fireEvent.click(within(fila).getByRole("checkbox")); });
  fireEvent.change(within(panel).getByLabelText("Bultos"), { target: { value: "3" } });
  fireEvent.change(within(panel).getByLabelText("Destino"), { target: { value: "Paso Canoas" } });
  await act(async () => { fireEvent.click(within(panel).getByRole("button", { name: "Agregar a la guía" })); });
}

describe("🔴 la pantalla", () => {
  it("encabezado, fecha de hoy y transportista que nace VACÍO; desaparece con entrega directa", async () => {
    localStorage.setItem("fg_last_transportista_id", "t1");
    await montarApple();
    expect(screen.getByText("GT-001")).toBeTruthy();
    expect((document.getElementById("guia-fecha") as HTMLInputElement).value).toBe(hoyPanama());
    const transp = document.getElementById("guia-transportista") as HTMLSelectElement;
    await waitFor(() => expect(transp.options.length).toBeGreaterThan(1));
    expect(transp.value).toBe("");
    expect(transp.options[0].textContent).toBe("Seleccionar transportista…");
    expect(screen.getByRole("button", { name: /Agregar transportista/ })).toBeTruthy();
    expect(screen.queryByText(/Despachado por/)).toBeNull();
    // Sin asteriscos ni la tabla de columnas.
    expect(document.body.textContent).not.toContain("*");
    expect(screen.queryByTestId("detalle-de-envio")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Entrega directa" })); });
    expect(document.getElementById("guia-transportista")).toBeNull();
  });

  it("«Guardar guía» apagado sin envíos y la barra dice qué hacer", async () => {
    await montarApple();
    expect(botonGuardar().disabled).toBe(true);
    expect(barra()).toBe("Toca un envío para agregarlo");
  });

  it("tocar la tarjeta la marca, la barra suma en vivo y desmarcar la devuelve", async () => {
    await montarApple();
    await act(async () => { fireEvent.click(tarjeta("e1")); });
    expect(tarjeta("e1").getAttribute("aria-pressed")).toBe("true");
    expect(barra()).toBe("98 bultos · 1 envío");
    await act(async () => { fireEvent.click(tarjeta("e2")); });
    expect(barra()).toBe("102 bultos · 2 envíos");
    expect(botonGuardar().disabled).toBe(false);
    await act(async () => { fireEvent.click(tarjeta("e1")); });
    expect(tarjeta("e1").getAttribute("aria-pressed")).toBe("false");
    expect(barra()).toBe("4 bultos · 1 envío");
  });

  it("«+ Agregar factura» abre el buscador y la factura sale como tarjeta con el chip «Sin etiqueta»", async () => {
    await montarApple();
    expect(screen.queryByText("Sin etiqueta")).toBeNull();
    const boton = screen.getByRole("button", { name: "+ Agregar factura" });
    expect(screen.queryByRole("button", { name: /Agregar sin etiquetas/ })).toBeNull();
    await act(async () => { fireEvent.click(boton); });
    await agregarFactura3099();
    const chip = screen.getByText("Sin etiqueta");
    expect(chip.closest("h2")?.textContent).toContain("Facturas");
    const fila = document.querySelector('[data-renglon="sin-etiqueta"]') as HTMLElement;
    expect(within(fila).getByText(NOVA.nombre)).toBeTruthy();
    expect(within(fila).getByRole("button", { name: /Quitar la factura/ })).toBeTruthy();
    expect(barra()).toBe("3 bultos · 1 envío");
  });

  it("con faltantes, tocar Guardar dice TODO lo que falta y no manda nada", async () => {
    await montarApple();
    await act(async () => { fireEvent.click(tarjeta("e3")); });
    expect(screen.queryByText(/^Falta:/)).toBeNull();
    await act(async () => { fireEvent.click(botonGuardar()); });
    expect(screen.getByText("Falta: el transportista")).toBeTruthy();
    expect(posts.filter((p) => p.url === "/api/guias")).toHaveLength(0);
  });

  it("sin envíos etiquetados lo dice", async () => {
    etiquetas = [];
    render(<NuevaGuiaClient />);
    expect(await screen.findByText("No hay envíos etiquetados pendientes.")).toBeTruthy();
  });
});

describe("🔴 el payload es IDÉNTICO con el interruptor prendido y apagado", () => {
  async function armarYGuardar(): Promise<{ guia: Record<string, unknown>; atar: Record<string, unknown> }> {
    if (flags.apple) {
      await montarApple();
      await act(async () => { fireEvent.click(tarjeta("e1")); });
      await act(async () => { fireEvent.click(tarjeta("e3")); });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "+ Agregar factura" })); });
    } else {
      render(<NuevaGuiaClient />);
      await screen.findByText(/Etiquetados, sin marcar · 3/);
      const caja = (n: RegExp) =>
        within(screen.getByTestId("etiquetados-sin-marcar")).getAllByRole("checkbox", { name: n })[0];
      await act(async () => { fireEvent.click(caja(/Nova Lux/)); });
      await act(async () => { fireEvent.click(caja(/American Classics/)); });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "+ Agregar sin etiquetas" })); });
    }
    await agregarFactura3099();
    const transp = document.getElementById("guia-transportista") as HTMLSelectElement;
    await waitFor(() => expect(transp.options.length).toBeGreaterThan(1));
    fireEvent.change(transp, { target: { value: "t1" } });
    fireEvent.change(document.getElementById("guia-observaciones") as HTMLTextAreaElement, { target: { value: "3 muebles" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar guía" })); });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/despachos/g-nueva"));
    const guia = posts.find((p) => p.url === "/api/guias")!.body;
    const atar = posts.find((p) => p.url === "/api/guias/etiquetas/importar")!.body;
    // El `uid` es de la pantalla (al azar): se compara todo lo demás.
    const items = (guia.items as Array<Record<string, unknown>>).map(({ uid: _uid, ...resto }) => resto);
    return { guia: { ...guia, items }, atar: { ...atar, ids: [...(atar.ids as number[])].sort() } };
  }

  it("misma guía, mismo cuerpo", async () => {
    flags.apple = false;
    const antes = await armarYGuardar();
    cleanup();
    posts = [];
    push.mockReset();
    flags.apple = true;
    const ahora = await armarYGuardar();
    expect((ahora.guia.items as unknown[]).length).toBe(3);
    expect(ahora.guia).toEqual(antes.guia);
    expect(ahora.atar).toEqual(antes.atar);
  });
});

describe("🔴 el ☰ del celular nunca tapa «Guardar guía» (390 px)", () => {
  // jsdom no calcula diseño: se arma la geometría con las MISMAS reglas que usa el
  // navegador. La barra va FIJA al piso en el celular y publica su alto; el ☰ se
  // sienta a `abajoDelFlotante(alto)` del piso. Las capturas reales lo miden en Chrome.
  it("los rectángulos no se cruzan", async () => {
    const ALTO_BARRA = 69;
    const H = 844;
    const real = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.hasAttribute(ATRIBUTO_BARRA_FIJA)) return { height: ALTO_BARRA, width: 390, top: H - ALTO_BARRA, bottom: H, left: 0, right: 390, x: 0, y: H - ALTO_BARRA, toJSON: () => ({}) } as DOMRect;
      return real.call(this);
    };
    try {
      await montarApple();
      const barraEl = screen.getByTestId("barra-guardar");
      const clases = barraEl.className.split(/\s+/);
      // En el celular, pegada al PISO de la pantalla (no al final de la página).
      expect(clases).toContain("fixed");
      expect(clases).toContain("bottom-0");
      expect(barraEl.contains(botonGuardar())).toBe(true);
      const publicado = parseFloat(document.documentElement.style.getPropertyValue(VAR_ALTO_BARRA_FIJA));
      expect(publicado).toBe(ALTO_BARRA);

      const guardar = { top: H - publicado, bottom: H }; // Guardar vive DENTRO de la barra
      const abajo = abajoDelFlotante(publicado);
      const menu = { top: H - abajo - DIAMETRO_FLOTANTE, bottom: H - abajo };
      const seCruzan = menu.bottom > guardar.top && menu.top < guardar.bottom;
      expect(seCruzan).toBe(false);
    } finally {
      Element.prototype.getBoundingClientRect = real;
    }
  });
});
