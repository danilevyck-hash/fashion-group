/**
 * La puerta "Registrar gasto", RENDERIZADA de verdad (12-ago-2026).
 *
 * Lo que Daniel aprobó y este archivo protege:
 *   1. CLIENTE OBLIGATORIO en Factura y Mueble. Textual: *"dejalo obligatorio,
 *      para gastos como vallas, o algun otro evento que vaya en el tab de
 *      impulsadora que ahi es para la marca en general"*. Medido antes del
 *      cambio: las 17 facturas con proyecto null de producción eran TODAS
 *      pagos de impulsadora — obligatorio no rompe nada.
 *   1b. 🔴 Y DE LA LISTA (misma noche). Daniel: *"donde dice cliente, me deja
 *      pasar sin que amarre un cliente de mi lista de fashion group?"*. El
 *      candado tiene tres caras y las tres están acá: (a) texto libre NO
 *      enciende Continuar — solo el cliente ELEGIDO, con su D-XXX; (b) el
 *      proyecto nuevo nace CON `tiendaCodigo`; (c) texto libre no crea
 *      proyecto (no hay POST) y la pantalla dice el camino: darlo de alta en
 *      Switch. La salida "Otro" del picker de Guías acá NO existe.
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
import { invalidarDirectorioClientes } from "@/lib/hooks/useBusquedaClientes";
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

/** El directorio del grupo (clientes_master, códigos D-XXX) que ve el picker. */
const DIRECTORIO = [
  { codigo: "D-30", nombre: "City Moda Chorrera" },
  { codigo: "D-24", nombre: "City Mall David" },
];

/** fetch de mentira ruteado por URL — nada sale a la red. */
function instalarFetch(opts: { proyectos?: unknown[] } = {}) {
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
      return json(opts.proyectos ?? []);
    }
    if (/\/api\/marketing\/facturas\/[^/]+\/marcas/.test(url)) {
      return json({ ok: true });
    }
    if (url.includes("/api/marketing/facturas")) {
      return json({ id: "f-nueva" });
    }
    if (url.includes("/api/clientes")) {
      return json({ clientes: DIRECTORIO, total: DIRECTORIO.length });
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

const campoCliente = () =>
  screen.getByPlaceholderText("Busca la tienda…") as HTMLInputElement;

/** Teclea en el picker y espera a que la lista (o el "no está") responda. */
async function buscarCliente(texto: string) {
  fireEvent.focus(campoCliente());
  fireEvent.change(campoCliente(), { target: { value: texto } });
  await waitFor(() =>
    expect(
      document.querySelector('[data-desplegable="cliente"]'),
    ).not.toBeNull(),
  );
}

/** El camino feliz: elegir un cliente DE LA LISTA (queda con su D-XXX). */
async function elegirCliente(nombre = "City Moda Chorrera") {
  await buscarCliente(nombre.slice(0, 4));
  await waitFor(() => expect(screen.getByText(nombre)).toBeTruthy());
  fireEvent.mouseDown(screen.getByText(nombre));
}

let arnes: ReturnType<typeof instalarFetch>;

beforeEach(() => {
  // El directorio se cachea a nivel de MÓDULO: sin esto, el primer test le
  // dejaría su lista a todos los demás aunque re-stubeen fetch.
  invalidarDirectorioClientes();
  arnes = instalarFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("cliente OBLIGATORIO y DE LA LISTA en Factura y Mueble", () => {
  it.each(["factura", "mueble"] as const)(
    "camino %s: sin cliente NO se continúa; texto libre TAMPOCO; elegido de la lista SÍ",
    async (camino) => {
      abrir();
      fireEvent.click(document.querySelector(`[data-camino="${camino}"]`)!);
      // La marca sola no alcanza.
      fireEvent.click(document.querySelector('[data-marca="TH"]')!);
      expect(botonContinuar().disabled).toBe(true);
      // 🔴 Texto libre que no está en la lista NO enciende Continuar, y la
      // pantalla dice el camino: darlo de alta en Switch.
      await buscarCliente("Almacén Jordania");
      await waitFor(() =>
        expect(
          screen.getByText(/No está en el directorio — hay que darlo de alta en Switch/),
        ).toBeTruthy(),
      );
      expect(botonContinuar().disabled).toBe(true);
      // Elegido de la lista (con su D-XXX) sí se abre.
      await elegirCliente();
      expect(botonContinuar().disabled).toBe(false);
    },
  );

  it("acá NO existe la salida a mano del picker de Guías", async () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    await buscarCliente("Cliente inventado");
    expect(screen.queryByText(/No está en la lista — escribir a mano/)).toBeNull();
    expect(
      screen.getByText(/Solo clientes de la lista — si no está, hay que darlo de alta/),
    ).toBeTruthy();
  });

  it("el proyecto nuevo nace CON el código del cliente (tiendaCodigo)", async () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    fireEvent.click(document.querySelector('[data-marca="TH"]')!);
    await elegirCliente();
    fireEvent.click(botonContinuar());
    await waitFor(() => {
      const post = arnes.llamadas.find(
        (c) =>
          c.url.includes("/api/marketing/proyectos") &&
          c.init?.method === "POST",
      );
      expect(post).toBeTruthy();
      const body = JSON.parse(String(post!.init!.body));
      // 🔴 EL CANDADO: nunca un proyecto nuevo sin su D-XXX.
      expect(body.tiendaCodigo).toBe("D-30");
      expect(body.tienda).toBe("City Moda Chorrera");
    });
  });

  it("si el cliente YA tiene proyecto (por código), se reusa sin crear otro", async () => {
    arnes = instalarFetch({
      proyectos: [
        { id: "p-viejo", tienda: "City Moda", nombre: "City Moda", tienda_codigo: "D-30" },
        // Un histórico SIN código con el mismo nombre NO se parea ni se toca.
        { id: "p-legacy", tienda: "City Moda Chorrera", nombre: "City Moda Chorrera", tienda_codigo: null },
      ],
    });
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    fireEvent.click(document.querySelector('[data-marca="TH"]')!);
    await elegirCliente();
    fireEvent.click(botonContinuar());
    // Se abre el formulario de factura sobre el proyecto existente…
    await waitFor(() => expect(screen.getByLabelText(/Nº factura/)).toBeTruthy());
    // …sin crear ninguno nuevo.
    expect(
      arnes.llamadas.some(
        (c) =>
          c.url.includes("/api/marketing/proyectos") &&
          c.init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("texto libre NO crea proyecto: escribir y no elegir no toca la red de proyectos", async () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    fireEvent.click(document.querySelector('[data-marca="TH"]')!);
    await buscarCliente("Tienda Fantasma");
    // Continuar sigue apagado, así que no hay forma de disparar el POST.
    expect(botonContinuar().disabled).toBe(true);
    expect(
      arnes.llamadas.some(
        (c) =>
          c.url.includes("/api/marketing/proyectos") &&
          c.init?.method === "POST",
      ),
    ).toBe(false);
  });

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

describe("candado estático: el cliente amarra al directorio, no hay vuelta al texto libre", () => {
  // El riesgo que un test de render no ve: que alguien "arregle" un reclamo
  // futuro devolviendo el typeahead libre o aflojando la puerta a `cliente`
  // (el texto) en vez de `clienteCodigo` (el D-XXX). Se lee el fuente.
  const fuente = () => {
    const { readFileSync } = require("fs") as typeof import("fs");
    const { join } = require("path") as typeof import("path");
    return readFileSync(
      join(process.cwd(), "src/app/marketing/components/RegistrarGastoModal.tsx"),
      "utf8",
    );
  };

  it("el picker va SIN la salida Otro (permitirOtro={false})", () => {
    expect(fuente()).toContain("permitirOtro={false}");
  });

  it("Continuar se enciende con el CÓDIGO, no con el texto", () => {
    expect(fuente()).toContain('clienteCodigo.trim() !== ""');
  });

  it("el typeahead libre no vuelve a este modal", () => {
    // El nombre aparece en el comentario que cuenta la historia; lo vedado es
    // IMPORTARLO o volver a cablear su prop de texto libre.
    expect(fuente()).not.toMatch(/import\s+ClienteTypeahead/);
    expect(fuente()).not.toContain("onFreeText");
  });

  it("el proyecto nuevo lleva el código sí o sí (nada de `|| null`)", () => {
    expect(fuente()).toContain("tiendaCodigo: codigo");
    expect(fuente()).not.toContain("tiendaCodigo: codigo || null");
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
  it("entrando por una marca: renglón fijo con Cambiar, sin selector", async () => {
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
    await elegirCliente();
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
