/**
 * 🔴 ETIQUETAS › «NUEVO ENVÍO» EN EL ORDEN DEL TRABAJO (2-oct-2026), con
 * `ETIQUETAS_TRASLADO_2026_10` prendido. Daniel: «¿por qué "Facturas | Traslado
 * (sin factura)" está abajo del cliente? … mejóralo ya».
 *   v3 (Daniel, 2-oct-2026: «en el mismo buscador del cliente buscas el cliente,
 *   escoges la factura o escoges la opción traslado»):
 *   1. Cliente (obligatorio) y destino; sin control «Facturas | Traslado».
 *   2. Las facturas pendientes y, al final, la fila «+ Traslado (sin factura)».
 *   3. Facturas y traslado van en el MISMO envío, con los bultos seguidos.
 *   4. UNA acción: «Generar etiquetas».
 *   v4 (Daniel, 2-oct-2026: «traslado sin factura es como si fuese una empresa»):
 *   UNA sola fila de EMPRESA y «Traslado» es un chip de esa fila. Se fueron la
 *   fila «+ Traslado (sin factura)» y la segunda fila de chips de empresa; la
 *   empresa del traslado es un desplegable chico «Empresa: Ninguna».
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

vi.mock("@/lib/guias/guias-2026-10", async (orig) => ({
  ...(await orig<typeof import("@/lib/guias/guias-2026-10")>()),
  ETIQUETAS_TRASLADO_2026_10: true,
}));
vi.mock("@/lib/guias/pdf-en-pestana", () => ({
  abrirPdfEnPestana: async (armar: () => Promise<unknown>) => {
    try { await armar(); } catch { /* jsdom sin bloburl */ }
    return "pestana";
  },
}));

import EtiquetasView from "@/app/despachos/components/EtiquetasView";

const NOVA = { codigo: "D-170", nombre: "Nova Lux, S.A." };
let posts: Array<Record<string, unknown>> = [];
const FACTURAS = [
  { empresa_key: "fashion_shoes", empresa: "Fashion Shoes", switch_factura_id: 31, secuencial: "11-000000031", fecha: "2026-10-01T16:00:00Z", total: 1200, yaSalioEn: null },
];
let facturasDelCliente: unknown[] = [];

beforeEach(() => {
  posts = [];
  facturasDelCliente = [];
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const u = String(url);
    if (u.startsWith("/api/guias/etiquetas") && init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      return { ok: false, status: 503, json: async () => ({ error: "x" }) } as unknown as Response;
    }
    if (u.startsWith("/api/guias/etiquetas")) return { ok: true, status: 200, json: async () => ({ etiquetas: [] }) } as unknown as Response;
    if (u.startsWith("/api/guias/facturas-cliente")) return { ok: true, json: async () => ({ facturas: facturasDelCliente }) } as unknown as Response;
    return { ok: true, json: async () => ({ clientes: [NOVA], destinos: {}, definidos: {} }) } as unknown as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function abrir() {
  render(<EtiquetasView />);
  fireEvent.click(await screen.findByRole("button", { name: /Nuevo envío/ }));
}

async function elegirCliente(texto = "Nova") {
  const campo = document.getElementById("etiquetas-cliente") as HTMLInputElement;
  fireEvent.focus(campo);
  fireEvent.change(campo, { target: { value: texto } });
  const opcion = await screen.findByText(NOVA.nombre, { selector: "[data-desplegable] *" });
  fireEvent.mouseDown(opcion.closest("button") ?? opcion);
  await act(async () => { await Promise.resolve(); });
}

function llenarTraslado(contenido: string, bultos: string) {
  fireEvent.click(screen.getByRole("button", { name: "Traslado" }));
  fireEvent.change(document.getElementById("traslado-contenido")!, { target: { value: contenido } });
  fireEvent.change(document.getElementById("traslado-bultos")!, { target: { value: bultos } });
}

async function generar() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Generar etiquetas" })); });
}

describe("🔴 Nuevo envío v3: un solo camino", () => {
  it("sin control «Facturas | Traslado»: cliente y destino primero, UNA acción", async () => {
    await abrir();
    expect(screen.queryByRole("tablist", { name: "Qué se envía" })).toBeNull();
    const seccion = screen.getByRole("region", { name: "Cliente y destino" });
    expect(seccion.contains(document.getElementById("etiquetas-cliente"))).toBe(true);
    expect(seccion.contains(document.getElementById("envio-destino"))).toBe(true);
    expect(screen.getByRole("button", { name: "Generar etiquetas" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
  });

  it("🔴 sin cliente no se manda nada", async () => {
    await abrir();
    await generar();
    expect(await screen.findByText("Selecciona el cliente")).toBeTruthy();
    expect(posts).toHaveLength(0);
  });

  it("🔴 un cliente SIN facturas: «Sin facturas pendientes» y el chip «Traslado» sigue ahí; viaja sin empresa", async () => {
    await abrir();
    await elegirCliente();
    expect(await screen.findByText("Sin facturas pendientes")).toBeTruthy();
    fireEvent.change(document.getElementById("envio-destino")!, { target: { value: "Paso Canoas" } });
    fireEvent.click(screen.getByRole("button", { name: "Traslado" }));
    // Sin contenido, el aviso lo dice y no se manda nada.
    await generar();
    expect(await screen.findByText("Escribe el contenido del traslado")).toBeTruthy();
    expect(posts).toHaveLength(0);
    // La empresa nace en «Ninguna».
    expect((screen.getByRole("combobox", { name: "Empresa del traslado" }) as HTMLSelectElement).value).toBe("");
    expect(screen.getByRole("option", { name: "Empresa: Ninguna" })).toBeTruthy();
    fireEvent.change(document.getElementById("traslado-contenido")!, { target: { value: "ganchos" } });
    fireEvent.change(document.getElementById("traslado-bultos")!, { target: { value: "2" } });
    await generar();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ empresa_key: "", cliente_codigo: NOVA.codigo, cliente_nombre: NOVA.nombre });
    expect(posts[0].facturas).toEqual([
      expect.objectContaining({ switch_factura_id: null, secuencial: "Traslado", cajas: 2, nota: "GANCHOS" }),
    ]);
  });

  it("solo traslado CON empresa elegida", async () => {
    await abrir();
    await elegirCliente();
    fireEvent.change(document.getElementById("envio-destino")!, { target: { value: "Paso Canoas" } });
    llenarTraslado("3 muebles ck", "3");
    fireEvent.change(screen.getByRole("combobox", { name: "Empresa del traslado" }), { target: { value: "vistana" } });
    await generar();
    expect(posts[0].empresa_key).toBe("vistana");
  });

  it("🔴 facturas y traslado en el MISMO envío: el traslado al final, bultos 1–10 y 11–13", async () => {
    facturasDelCliente = FACTURAS;
    await abrir();
    await elegirCliente();
    fireEvent.change(document.getElementById("envio-destino")!, { target: { value: "Paso Canoas" } });
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.change(document.getElementById("envio-bultos-fashion_shoes-11-000000031")!, { target: { value: "10" } });
    llenarTraslado("paneles", "3");
    // Con facturas, el traslado va con la empresa del envío: no se elige otra.
    expect(screen.queryByRole("combobox", { name: "Empresa del traslado" })).toBeNull();
    // 🔴 Tocar «Traslado» NO borró la factura marcada, y sus facturas no se ven.
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Traslado" }).getAttribute("aria-pressed")).toBe("true");
    const resumen = screen.getByTestId("resumen-envio");
    expect(resumen.textContent).toContain("bultos 1–10 de 13");
    expect(resumen.textContent).toContain("bultos 11–13 de 13");
    await generar();
    expect(posts).toHaveLength(1);
    expect(posts[0].empresa_key).toBe("fashion_shoes");
    const fs = posts[0].facturas as Array<Record<string, unknown>>;
    expect(fs.map((f) => f.secuencial)).toEqual(["11-000000031", "Traslado"]);
    expect(fs[1]).toMatchObject({ switch_factura_id: null, cajas: 3, nota: "PANELES" });
  });

  it("🔴 un cliente fuera del directorio entra con «Ingresar manualmente» y viaja sin código", async () => {
    await abrir();
    const campo = document.getElementById("etiquetas-cliente") as HTMLInputElement;
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "Tienda Nueva David" } });
    fireEvent.mouseDown((await screen.findByText("➕ Ingresar manualmente")).closest("button")!);
    await act(async () => { await Promise.resolve(); });
    expect(await screen.findByText("Sin facturas pendientes")).toBeTruthy();
    fireEvent.change(document.getElementById("envio-destino")!, { target: { value: "David" } });
    llenarTraslado("muebles", "1");
    await generar();
    expect(posts[0]).toMatchObject({ cliente_codigo: "", cliente_nombre: "Tienda Nueva David", empresa_key: "" });
  });

  it("🔴 candado: UNA sola fila de empresa y «Traslado» es un chip de esa fila", async () => {
    facturasDelCliente = FACTURAS;
    await abrir();
    await elegirCliente();
    await screen.findByRole("checkbox");
    const filas = screen.getAllByRole("group", { name: /Empresa/ });
    expect(filas).toHaveLength(1);
    const chips = Array.from(filas[0].querySelectorAll("button")).map((b) => b.textContent);
    expect(chips).toEqual(["Fashion Shoes", "Traslado"]);
    // Se fueron la fila «+ Traslado (sin factura)» y los chips viejos.
    expect(screen.queryByText(/\+ Traslado/)).toBeNull();
    expect(screen.queryByText(/Sin empresa/)).toBeNull();
    // Con «Traslado» elegido: Contenido, Bultos y el desplegable, sin facturas
    // y sin una segunda fila de chips.
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Traslado" }));
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(document.getElementById("traslado-contenido")).toBeTruthy();
    expect(document.getElementById("traslado-bultos")).toBeTruthy();
    // Con una factura marcada, el traslado va con la empresa del envío.
    expect(screen.queryByRole("combobox", { name: "Empresa del traslado" })).toBeNull();
    expect(screen.getAllByRole("group", { name: /Empresa/ })).toHaveLength(1);
    // Volver a la empresa muestra sus facturas otra vez, con la marca intacta.
    fireEvent.click(screen.getByRole("button", { name: "Fashion Shoes" }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    // Sin facturas marcadas, el desplegable «Empresa: Ninguna» sí aparece.
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Traslado" }));
    expect((screen.getByRole("combobox", { name: "Empresa del traslado" }) as HTMLSelectElement).value).toBe("");
  });
});
