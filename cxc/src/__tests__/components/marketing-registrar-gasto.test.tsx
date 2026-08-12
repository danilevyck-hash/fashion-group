/**
 * La puerta "Registrar gasto", RENDERIZADA de verdad (12-ago-2026).
 *
 * Lo que Daniel aprobó y este archivo protege:
 *   1. CLIENTE OBLIGATORIO en Factura y Mueble. Textual: *"dejalo obligatorio,
 *      para gastos como vallas, o algun otro evento que vaya en el tab de
 *      impulsadora que ahi es para la marca en general"*. Medido antes del
 *      cambio: las 17 facturas con proyecto null de producción eran TODAS
 *      pagos de impulsadora — obligatorio no rompe nada.
 *   2. El tercer camino es "GASTO DE LA MARCA" con dos sub-opciones:
 *      Impulsadora (el flujo de siempre, intacto) y Otro gasto (vallas,
 *      eventos, catálogos), que guarda con `proyecto_id = null` — SIN
 *      inventarle un proyecto.
 *   3. La MARCA se pregunta UNA vez: viniendo de la página de una marca
 *      (`marcaInicial`) se enseña como renglón fijo con "Cambiar".
 *
 * Un test de función pura no puede ver nada de esto: hay que tocar botones.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import RegistrarGastoModal from "@/app/marketing/components/RegistrarGastoModal";
import type { MkMarca } from "@/lib/marketing/types";

// El pago de impulsadora es SU propio modal y no se toca en este cambio: se
// dobla para que el test pueda afirmar "se abrió el flujo de siempre" sin
// arrastrar el anti-solape/split/comprobante que ya cubren sus propios tests.
vi.mock("@/app/marketing/components/RegistrarPagoModal", () => ({
  default: ({ impulsadora }: { impulsadora: { nombre: string } }) => (
    <div data-testid="registrar-pago-modal">Pago a {impulsadora.nombre}</div>
  ),
}));

const MARCAS: MkMarca[] = [
  { id: "m-th", codigo: "TH", nombre: "Tommy Hilfiger" } as MkMarca,
  { id: "m-kl", codigo: "KL", nombre: "Karl Lagerfeld" } as MkMarca,
];

/** fetch de mentira ruteado por URL — nada sale a la red. */
function instalarFetch() {
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    llamadas.push({ url, init });
    const json = (body: unknown) => ({
      ok: true,
      status: 200,
      json: async () => body,
    });
    if (url.includes("/api/marketing/impulsadoras")) {
      return json([
        {
          id: "i1",
          nombre: "María Pérez",
          marcas: [{ marca: { id: "m-th", nombre: "Tommy Hilfiger" } }],
          mesActual: null,
        },
      ]);
    }
    if (url.includes("/api/marketing/inventario/productos")) return json([]);
    if (url.includes("check-duplicate")) {
      return json({ existe: false, facturas: [] });
    }
    if (url.includes("/api/marketing/proyectos")) {
      if (init?.method === "POST") {
        return json({ id: "p-nuevo", tienda: "Tienda X", nombre: "Tienda X" });
      }
      return json([]);
    }
    if (/\/api\/marketing\/facturas\/[^/]+\/marcas/.test(url)) {
      return json({ ok: true });
    }
    if (url.includes("/api/marketing/facturas")) {
      return json({ id: "f-nueva" });
    }
    if (url.includes("/api/clientes")) {
      return json({ clientes: [], total: 0 });
    }
    return json({});
  });
  vi.stubGlobal("fetch", fn);
  return { fn, llamadas };
}

function abrir(props: { marcaInicial?: MkMarca | null } = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <ToastProvider>
      <RegistrarGastoModal
        marcas={MARCAS}
        marcaInicial={props.marcaInicial ?? null}
        onClose={onClose}
        onSaved={onSaved}
      />
    </ToastProvider>,
  );
  return { onClose, onSaved };
}

const botonContinuar = () =>
  screen.getByRole("button", { name: /Continuar|Abriendo/ }) as HTMLButtonElement;

let arnes: ReturnType<typeof instalarFetch>;

beforeEach(() => {
  arnes = instalarFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("cliente OBLIGATORIO en Factura y Mueble", () => {
  it.each(["factura", "mueble"] as const)(
    "camino %s: sin cliente NO se puede continuar, ni con la marca puesta",
    (camino) => {
      abrir();
      fireEvent.click(document.querySelector(`[data-camino="${camino}"]`)!);
      // La marca sola no alcanza.
      fireEvent.click(document.querySelector('[data-marca="TH"]')!);
      expect(botonContinuar().disabled).toBe(true);
      // Con cliente (texto libre cuenta: se guarda sin vincular) se abre.
      const input = screen.getByPlaceholderText("Busca la tienda…");
      fireEvent.change(input, { target: { value: "Almacén Jordania" } });
      expect(botonContinuar().disabled).toBe(false);
    },
  );

  it("el label del cliente ya no dice (opcional) ni invita a dejarlo en blanco", () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    const labelCliente = screen.getByText(/^Cliente/).closest("label")!;
    expect(labelCliente.textContent).not.toMatch(/opcional/i);
    expect(labelCliente.textContent).toContain("*");
    expect(screen.queryByText(/déjalo en blanco/i)).toBeNull();
    // La FOTO sí sigue siendo opcional — eso no cambió.
    expect(screen.getByText("Foto").parentElement?.textContent).toContain(
      "opcional",
    );
  });
});

describe('"Gasto de la marca" — las dos sub-opciones', () => {
  it("la tarjeta del tercer camino se llama Gasto de la marca", () => {
    abrir();
    const tarjeta = document.querySelector('[data-camino="marca"]');
    expect(tarjeta).not.toBeNull();
    expect(tarjeta!.textContent).toContain("Gasto de la marca");
    // "Impulsadora" ya no es un camino de primer nivel.
    expect(document.querySelector('[data-camino="impulsadora"]')).toBeNull();
  });

  it("Impulsadora abre el flujo de SIEMPRE (RegistrarPagoModal)", async () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="marca"]')!);
    fireEvent.click(document.querySelector('[data-subgasto="impulsadora"]')!);
    // La lista llega del API doblado.
    await waitFor(() =>
      expect(document.querySelector('[data-impulsadora="i1"]')).not.toBeNull(),
    );
    fireEvent.click(document.querySelector('[data-impulsadora="i1"]')!);
    expect(botonContinuar().disabled).toBe(false);
    fireEvent.click(botonContinuar());
    await waitFor(() =>
      expect(screen.getByTestId("registrar-pago-modal")).toBeTruthy(),
    );
    expect(screen.getByTestId("registrar-pago-modal").textContent).toContain(
      "María Pérez",
    );
  });

  it("Otro gasto NO pide cliente, exige la marca, y guarda con proyecto null", async () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="marca"]')!);
    fireEvent.click(document.querySelector('[data-subgasto="otro"]')!);
    // Sin cliente a la vista y sin marca todavía: no se puede continuar.
    expect(screen.queryByPlaceholderText("Busca la tienda…")).toBeNull();
    expect(botonContinuar().disabled).toBe(true);
    fireEvent.click(document.querySelector('[data-marca="KL"]')!);
    expect(botonContinuar().disabled).toBe(false);
    fireEvent.click(botonContinuar());

    // Se abre el formulario de factura de siempre, sin tocar la red para
    // inventar un proyecto.
    await waitFor(() =>
      expect(screen.getByLabelText(/Nº factura/)).toBeTruthy(),
    );
    expect(
      screen.getByText(/no se agrupa en ninguna tienda/i),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Nº factura/), {
      target: { value: "V-001" },
    });
    fireEvent.change(screen.getByLabelText(/Proveedor/), {
      target: { value: "Vallas SA" },
    });
    fireEvent.change(screen.getByLabelText(/Concepto/), {
      target: { value: "Valla en vía España" },
    });
    fireEvent.change(screen.getByLabelText(/Subtotal/), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar factura" }));

    await waitFor(() => {
      const post = arnes.llamadas.find(
        (c) =>
          c.url.includes("/api/marketing/facturas") &&
          !c.url.includes("check-duplicate") &&
          c.init?.method === "POST",
      );
      expect(post).toBeTruthy();
      const body = JSON.parse(String(post!.init!.body));
      // 🔴 EL CANDADO: el gasto de la marca va con proyecto_id = null.
      expect(body.proyectoId).toBeNull();
    });
    // Y NUNCA se creó un proyecto por el costado.
    expect(
      arnes.llamadas.some(
        (c) =>
          c.url.includes("/api/marketing/proyectos") &&
          c.init?.method === "POST",
      ),
    ).toBe(false);
  });
});

describe("la marca se pregunta UNA vez (marcaInicial)", () => {
  it("entrando por una marca: renglón fijo con Cambiar, sin selector", () => {
    abrir({ marcaInicial: MARCAS[1] });
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    // El renglón fijo dice la marca; el grid de marcas no se dibuja.
    expect(screen.getByText("Karl Lagerfeld")).toBeTruthy();
    expect(document.querySelector('[data-marca="TH"]')).toBeNull();
    // "Cambiar" (el de la marca, no el del camino) reabre el selector.
    const cambiar = screen.getAllByRole("button", { name: "Cambiar" });
    fireEvent.click(cambiar[cambiar.length - 1]);
    expect(document.querySelector('[data-marca="TH"]')).not.toBeNull();
    // Y la marca del contexto sigue elegida hasta que se toque otra.
    fireEvent.change(screen.getByPlaceholderText("Busca la tienda…"), {
      target: { value: "Tienda Real" },
    });
    expect(botonContinuar().disabled).toBe(false);
  });

  it("sin marca de contexto (portada) el selector aparece como siempre", () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    expect(document.querySelector('[data-marca="TH"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Cambiar" })?.textContent).toBe(
      "Cambiar", // el del camino "Qué es" — el de marca no existe acá
    );
  });

  it("la marca inicial también aplica a Otro gasto (la marca del contexto)", () => {
    abrir({ marcaInicial: MARCAS[0] });
    fireEvent.click(document.querySelector('[data-camino="marca"]')!);
    fireEvent.click(document.querySelector('[data-subgasto="otro"]')!);
    expect(screen.getByText("Tommy Hilfiger")).toBeTruthy();
    expect(botonContinuar().disabled).toBe(false);
  });
});
