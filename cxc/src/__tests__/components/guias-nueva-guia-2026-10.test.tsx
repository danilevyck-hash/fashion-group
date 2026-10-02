/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CANDADO DE PANTALLA · NUEVA GUÍA EN UNA SOLA TABLA (1-oct-2026, Daniel aprobó
 * el mockup; `GUIA_NUEVA_2026_10`).
 *
 * Se RENDERIZA `/guias/nueva` y se tocan los controles:
 *   · «Información general»: Fecha, Tipo de despacho y Transportista con el
 *     desplegable VACÍO; «Despachado por» ya no está;
 *   · UNA tabla «Detalle de envío»: envíos etiquetados (bultos 🔒) y renglones
 *     «Sin etiqueta»; abajo «Etiquetados, sin marcar»; se fueron «Envíos
 *     etiquetados pendientes» y «Facturas del cliente» de arriba;
 *   · un renglón POR ENVÍO, aunque dos sean del mismo cliente + empresa + destino;
 *   · «+ Agregar sin etiquetas» trae el buscador: «Ya salió en GT-xxx» y «Va con
 *     su envío etiquetado» bloqueadas;
 *   · el aviso sale recién al tocar «Guardar guía» y dice TODO lo que falta;
 *   · el despacho pide «Despachado por».
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act, within } from "@testing-library/react";
import { useState } from "react";
import NuevaGuiaClient from "@/app/guias/nueva/NuevaGuiaClient";
import DespachoForm from "@/app/guias/components/DespachoForm";
import type { EtiquetaFila } from "@/lib/guias/etiquetas";
import { hoyPanama } from "@/lib/fecha-panama";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: "secretaria" }),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => <div /> }));
// 1-oct-2026: este candado es el de la tabla única; la versión Apple tiene el suyo
// (`guias-nueva-guia-apple.test.tsx`). Con `GUIA_APPLE_2026_10` en false, esto es lo de hoy.
vi.mock("@/lib/guias/guias-2026-10", async (orig) => ({
  ...(await orig<typeof import("@/lib/guias/guias-2026-10")>()),
  GUIA_APPLE_2026_10: false,
}));

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

// Dos envíos de Nova Lux · Vistana · Paso Canoas (98 y 4) y uno de American Classics.
const ETIQUETAS: EtiquetaFila[] = [
  etq({ id: 1, secuencial: "11-000003097", switch_factura_id: 3097, cajas: 50 }),
  etq({ id: 2, secuencial: "11-000003096", switch_factura_id: 3096, cajas: 48, orden_en_envio: 2 }),
  etq({ id: 3, secuencial: "11-000003110", switch_factura_id: 3110, cajas: 4, envio_id: "e2" }),
  etq({ id: 4, secuencial: "11-000003285", switch_factura_id: 3285, cajas: 3, envio_id: "e3", empresa_key: "fashion_wear", empresa: "Fashion Wear", cliente_codigo: "D-108", cliente_nombre: "American Classics Store", destino: "David" }),
];

const FACTURAS_NOVA = [
  { empresa_key: "vistana", empresa: "Vistana International", switch_factura_id: 3099, secuencial: "11-000003099", fecha: "2026-10-01T14:00:00Z", total: 100, yaSalioEn: null },
  { empresa_key: "vistana", empresa: "Vistana International", switch_factura_id: 3110, secuencial: "11-000003110", fecha: "2026-10-01T13:00:00Z", total: 90, yaSalioEn: null },
  { empresa_key: "vistana", empresa: "Vistana International", switch_factura_id: 3050, secuencial: "11-000003050", fecha: "2026-10-01T12:00:00Z", total: 80, yaSalioEn: 271 },
];

let posts: Array<{ url: string; body: Record<string, unknown> }>;

beforeEach(() => {
  posts = [];
  push.mockReset();
  vi.stubGlobal("localStorage", memStorage());
  vi.stubGlobal("sessionStorage", memStorage());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const metodo = (init?.method || "GET").toUpperCase();
      if (metodo === "POST") {
        try { posts.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) }); } catch { posts.push({ url: u, body: {} }); }
        if (u === "/api/guias") return { ok: true, json: async () => ({ id: "g-nueva", numero: 272 }) };
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (u.startsWith("/api/guias/etiquetas")) return { ok: true, json: async () => ({ etiquetas: ETIQUETAS }) };
      if (u.startsWith("/api/guias/facturas-cliente")) return { ok: true, json: async () => ({ facturas: FACTURAS_NOVA, hasta: null }) };
      if (u.startsWith("/api/transportistas")) return { ok: true, json: async () => [{ id: "t1", nombre: "Transporte Sol", activo: true }] };
      if (u.startsWith("/api/guias/frecuencias")) return { ok: true, json: async () => ({ clientes: [NOVA], empresas: [] }) };
      if (u.startsWith("/api/clientes")) return { ok: true, json: async () => ({ clientes: [NOVA] }) };
      if (u.startsWith("/api/guias/despachadores")) return { ok: true, json: async () => ({ nombres: ["Julio", "Jorman"] }) };
      return { ok: true, json: async () => ({}) };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function asentar() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function montar() {
  render(<NuevaGuiaClient />);
  await screen.findByText(/Nueva guía de despacho/i);
  await screen.findByText(/Etiquetados, sin marcar · 3/);
}

const renglones = () => [...document.querySelectorAll<HTMLElement>("[data-renglon]")];

describe("🔴 «Información general»", () => {
  it("Fecha de hoy (Panamá), Tipo de despacho y Transportista VACÍO; sin «Despachado por»", async () => {
    // Aunque el navegador recuerde el último transportista, no se preselecciona.
    localStorage.setItem("fg_last_transportista_id", "t1");
    await montar();
    expect((document.getElementById("guia-fecha") as HTMLInputElement).value).toBe(hoyPanama());
    const transp = document.getElementById("guia-transportista") as HTMLSelectElement;
    await waitFor(() => expect(transp.options.length).toBeGreaterThan(1));
    expect(transp.value).toBe("");
    expect(transp.options[0].textContent).toBe("Seleccionar transportista…");
    expect(screen.getByText("Tipo de despacho")).toBeTruthy();
    expect(document.getElementById("guia-entregado-por")).toBeNull();
    expect(screen.queryByText(/Despachado por/)).toBeNull();
  });

  it("se fueron las secciones de arriba y la fila vacía inicial", async () => {
    await montar();
    expect(screen.queryByTestId("facturas-del-cliente")).toBeNull();
    expect(screen.queryByTestId("etiquetas-pendientes")).toBeNull();
    expect(screen.queryByText(/Envíos etiquetados pendientes/)).toBeNull();
    expect(renglones()).toHaveLength(0);
  });
});

describe("🔴 UNA tabla: envíos etiquetados + renglones sin etiqueta", () => {
  it("un renglón POR ENVÍO, el suelto con su chip, el total y lo que se ata al guardar", async () => {
    await montar();
    const sinMarcar = screen.getByTestId("etiquetados-sin-marcar");
    const sumar = within(sinMarcar).getAllByRole("checkbox", { name: /Sumar a la guía el envío de Nova Lux/ });
    expect(sumar).toHaveLength(2);
    await act(async () => { fireEvent.click(sumar[0]); });
    await act(async () => {
      fireEvent.click(within(screen.getByTestId("etiquetados-sin-marcar")).getAllByRole("checkbox", { name: /Nova Lux/ })[0]);
    });
    // Dos envíos iguales (cliente + empresa + destino) = DOS renglones, con candado.
    let filas = renglones();
    expect(filas.map((f) => f.dataset.renglon)).toEqual(["etiquetado", "etiquetado"]);
    expect(filas.map((f) => f.querySelector("[data-bultos-de-etiquetas]")?.textContent?.replace(/\D/g, ""))).toEqual(["98", "4"]);
    expect(screen.getByText(/Etiquetados, sin marcar · 1/)).toBeTruthy();

    // «+ Agregar sin etiquetas»: el buscador vive adentro.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "+ Agregar sin etiquetas" })); });
    const campo = document.getElementById("agregar-cliente") as HTMLInputElement;
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "" } });
    const opcion = await screen.findByText(NOVA.nombre, { selector: "[data-desplegable] *" });
    await act(async () => { fireEvent.mouseDown(opcion.closest("button") ?? opcion); });
    await asentar();
    const panel = await screen.findByTestId("agregar-sin-etiquetas");
    await within(panel).findByText("11-000003099");

    // Bloqueadas, y dicen por qué.
    const fila = (sec: string) => within(panel).getByText(sec).closest("label") as HTMLElement;
    expect(within(fila("11-000003050")).getByText("Ya salió en GT-271")).toBeTruthy();
    expect((within(fila("11-000003050")).getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    expect(within(fila("11-000003110")).getByText("Va con su envío etiquetado")).toBeTruthy();
    expect((within(fila("11-000003110")).getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);

    // La libre se marca, bultos y destino → «Agregar a la guía».
    await act(async () => { fireEvent.click(within(fila("11-000003099")).getByRole("checkbox")); });
    fireEvent.change(within(panel).getByLabelText("Bultos"), { target: { value: "3" } });
    fireEvent.change(within(panel).getByLabelText("Destino"), { target: { value: "Paso Canoas" } });
    await act(async () => { fireEvent.click(within(panel).getByRole("button", { name: "Agregar a la guía" })); });

    filas = renglones();
    expect(filas.map((f) => f.dataset.renglon)).toEqual(["etiquetado", "etiquetado", "sin-etiqueta"]);
    expect(within(filas[2]).getByText("Sin etiqueta")).toBeTruthy();
    expect(within(filas[2]).getByRole("button", { name: /Editar el envío/ })).toBeTruthy();
    expect(within(filas[2]).getByRole("button", { name: /Quitar el envío/ })).toBeTruthy();
    // La factura se lee entera en el `title`.
    expect(filas[2].querySelector('[title="11-000003099"]')).not.toBeNull();
    const total = screen.getByText("Total").parentElement as HTMLElement;
    expect(total.textContent?.replace(/\s/g, "")).toBe("Total105bultos");

    // Guardar: tres renglones, y se atan las etiquetas de los DOS envíos.
    fireEvent.change(document.getElementById("guia-transportista") as HTMLSelectElement, { target: { value: "t1" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar guía" })); });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/guias/g-nueva"));
    const guia = posts.find((p) => p.url === "/api/guias")!.body;
    expect((guia.items as unknown[]).length).toBe(3);
    expect(guia.entregado_por).toBe("");
    const atar = posts.find((p) => p.url === "/api/guias/etiquetas/importar")!.body;
    expect([...(atar.ids as number[])].sort()).toEqual([1, 2, 3]);
  });

  it("desmarcar un envío saca SOLO su renglón", async () => {
    await montar();
    const caja = () => within(screen.getByTestId("etiquetados-sin-marcar")).getAllByRole("checkbox", { name: /Nova Lux/ })[0];
    await act(async () => { fireEvent.click(caja()); });
    await act(async () => { fireEvent.click(caja()); });
    expect(renglones()).toHaveLength(2);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("checkbox", { name: /Sacar de la guía el envío/ })[0]);
    });
    const filas = renglones();
    expect(filas).toHaveLength(1);
    expect(filas[0].querySelector("[data-bultos-de-etiquetas]")?.textContent?.replace(/\D/g, "")).toBe("4");
  });
});

describe("🔴 el aviso sale al tocar «Guardar guía» y dice TODO", () => {
  it("antes de tocar, nada; al tocar, una línea con todo; y no se manda nada", async () => {
    await montar();
    expect(screen.queryByText(/^Falta:/)).toBeNull();
    const boton = screen.getByRole("button", { name: "Guardar guía" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    await act(async () => { fireEvent.click(boton); });
    expect(screen.getByText("Falta: el transportista · al menos un envío")).toBeTruthy();
    expect(posts.filter((p) => p.url === "/api/guias")).toHaveLength(0);
  });
});

describe("🔴 el despacho pide «Despachado por»", () => {
  function Despacho({ inicial = "" }: { inicial?: string }) {
    const [quien, setQuien] = useState(inicial);
    return (
      <DespachoForm
        tipoDespacho="externo" setTipoDespacho={() => {}}
        bPlaca="AB-1" setBPlaca={() => {}}
        bReceptor="Juan" setBReceptor={() => {}}
        bCedula="8-8-8" setBCedula={() => {}}
        bChofer="" setBChofer={() => {}}
        despachadoPor={quien} setDespachadoPor={setQuien}
        bSaving={false} onConfirmar={() => {}}
        pendingFirma1="data:x" pendingFirma2="data:y"
      />
    );
  }

  it("vacío no deja despachar y lo dice; elegido, sí", async () => {
    render(<Despacho />);
    const select = document.getElementById("despacho-despachado-por") as HTMLSelectElement;
    await waitFor(() => expect([...select.options].map((o) => o.value)).toContain("Jorman"));
    expect(select.value).toBe("");
    expect([...select.options].some((o) => /Otro/.test(o.textContent || ""))).toBe(false);
    expect((screen.getByRole("button", { name: "Despachar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Falta: despachado por")).toBeTruthy();
    await act(async () => { fireEvent.change(select, { target: { value: "Jorman" } }); });
    expect((screen.getByRole("button", { name: "Despachar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("una guía vieja que ya lo traía lo muestra, aunque no esté en la lista", async () => {
    render(<Despacho inicial="Eloyn Viejo" />);
    const select = document.getElementById("despacho-despachado-por") as HTMLSelectElement;
    expect(select.value).toBe("Eloyn Viejo");
    expect((screen.getByRole("button", { name: "Despachar" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
