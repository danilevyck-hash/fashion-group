/**
 * LA PANTALLA DEL TELÉFONO — DESHACER Y LA COLA, de conducta (14-sep-2026).
 *
 * Tres cosas que Daniel encontró probando desde su iPhone:
 *
 *  A. 12 HORAS. La hora se lee «8:58 a. m.», no «08:58».
 *  B. DESHACER la última marca, dos minutos. Marcó la salida cinco minutos
 *     después de la entrada por error de dedo.
 *  C. 🩸 LA PANTALLA SE ENTERA CUANDO LA COLA SUBE LA MARCA. Marcó en modo
 *     avión, la marca subió sola y perfecta… y la pantalla seguía diciendo
 *     «Todavía no tienes marcas» con el botón en «Marcar entrada» y el aviso
 *     «Se va a enviar sola cuando vuelva la señal» todavía puesto. Quien lee
 *     eso vuelve a marcar, y termina con dos entradas el mismo día.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import React from "react";

// 🔴 ESTE CANDADO ES EL DE LA PANTALLA DE ANTES (24-sep-2026). Con el
// rediseño «un toque» (`lib/marcacion/un-toque.ts`) la pantalla cambió de
// acomodo, pero el interruptor en `false` tiene que dejarla EXACTAMENTE como
// estaba — y eso es lo que se prueba acá, tal cual estaba escrito.
vi.mock("@/lib/marcacion/un-toque", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  MARCACION_UN_TOQUE: false,
}));

vi.mock("@/components/AppHeader", () => ({ default: () => <div data-testid="encabezado" /> }));
vi.mock("@/lib/marcacion/selfie-telefono", () => ({
  achicarEnElTelefono: async (b: Blob) => b,
}));

let cola: Record<string, unknown>[] = [];
vi.mock("@/lib/marcacion/cola-offline", () => ({
  guardarPendiente: async (m: Record<string, unknown>) => {
    cola = [...cola.filter((x) => x.eventoId !== m.eventoId), m];
  },
  leerPendientes: async () => cola,
  borrarPendiente: async (id: string) => {
    cola = cola.filter((x) => x.eventoId !== id);
  },
  contarPendientes: async () => cola.length,
  anotarIntento: async () => undefined,
}));

import MarcacionClient from "@/app/marcacion/MarcacionClient";

/** 8:58 a. m. de Panamá. */
const AHORA_SERVIDOR = "2026-09-15T13:58:00.000Z";
/** La marca que acaba de entrar: hace 20 segundos. */
const HACE_20_S = "2026-09-15T13:57:40.000Z";

function estadoServidor(x: {
  marcas?: string[];
  deshacer?: { ocurrioEn: string; tipo: "entrada" | "salida" } | null;
} = {}) {
  return {
    codigo: "2",
    nombre: "ANA TREJOS",
    ahora: AHORA_SERVIDOR,
    hoy: "2026-09-15",
    quincena: { desde: "2026-09-01", hasta: "2026-09-15" },
    rotuloQuincena: "1 – 15 sep",
    deshacer: x.deshacer ?? null,
    marcas: (x.marcas ?? []).map((m) => ({ ocurrioEn: m })),
  };
}

let respuesta: unknown = estadoServidor();
/** Lo que contesta el POST de marcar (y el de la cola). */
let respuestaPost: unknown = { ok: true };
let respuestaDeshacer: unknown = { ok: true };
let statusDeshacer = 200;
const pedidos: string[] = [];

beforeEach(() => {
  cola = [];
  pedidos.length = 0;
  respuesta = estadoServidor();
  respuestaPost = { ok: true };
  statusDeshacer = 200;
  respuestaDeshacer = { ok: true, aviso: "Listo, se deshizo la entrada. Puedes marcar de nuevo.", ...estadoServidor() };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    pedidos.push(`${init?.method ?? "GET"} ${url}`);
    if (String(url).includes("/deshacer")) {
      return { ok: statusDeshacer === 200, status: statusDeshacer, json: async () => respuestaDeshacer } as Response;
    }
    if (init?.method === "POST") {
      return { ok: true, status: 200, json: async () => respuestaPost } as Response;
    }
    // 🔑 El servidor contesta la hora que es AHORA, como el de verdad. Con una
    // hora congelada, cada refresco le devolvería el reloj al pasado y la
    // cuenta regresiva del «Deshacer» no avanzaría nunca.
    return {
      ok: true, status: 200,
      json: async () => ({ ...(respuesta as object), ahora: new Date().toISOString() }),
    } as Response;
  }));
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(AHORA_SERVIDOR));
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (ok: (p: unknown) => void) =>
        ok({ coords: { latitude: 8.9824, longitude: -79.5199, accuracy: 12 } }),
    },
  });
  if (!("createObjectURL" in URL)) {
    Object.defineProperty(URL, "createObjectURL", { value: () => "blob:x", configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: () => undefined, configurable: true });
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function marcar(contenedor: HTMLElement, boton: string) {
  fireEvent.click(screen.getByRole("button", { name: boton }));
  const input = contenedor.querySelector('input[type="file"]') as HTMLInputElement;
  const foto = new File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [foto] } });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe("A. la hora se lee en 12 horas", () => {
  it("la hora grande y la línea de hoy", async () => {
    respuesta = estadoServidor({ marcas: [HACE_20_S, "2026-09-15T23:04:00.000Z"] });
    render(<MarcacionClient />);
    expect(await screen.findByText("8:58 a. m.")).toBeTruthy();
    expect(screen.getByText("✓ Entrada 8:57 a. m. · Salida 6:04 p. m.")).toBeTruthy();
    // Y no queda ni un rastro de las 24 horas en la pantalla de marcar.
    expect(screen.queryByText("08:58")).toBeNull();
    expect(screen.queryByText("08:57 – 18:04")).toBeNull();
  });
});

describe("🔴 B. deshacer la última marca", () => {
  it("el botón está, dice qué deshace y cuánto le queda", async () => {
    respuesta = estadoServidor({
      marcas: [HACE_20_S],
      deshacer: { ocurrioEn: HACE_20_S, tipo: "entrada" },
    });
    render(<MarcacionClient />);
    const b = await screen.findByRole("button", { name: /Deshacer la entrada/ });
    expect(b.textContent).toContain("1:40");
  });

  it("🔴 a los dos minutos el botón YA NO ESTÁ", async () => {
    respuesta = estadoServidor({
      marcas: [HACE_20_S],
      deshacer: { ocurrioEn: HACE_20_S, tipo: "entrada" },
    });
    render(<MarcacionClient />);
    await screen.findByRole("button", { name: /Deshacer la entrada/ });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(110_000);
    });
    expect(screen.queryByRole("button", { name: /Deshacer/ })).toBeNull();
  });

  it("sin nada que deshacer no se dibuja el botón", async () => {
    respuesta = estadoServidor({ marcas: [HACE_20_S], deshacer: null });
    render(<MarcacionClient />);
    await screen.findByRole("button", { name: "Marcar salida" });
    expect(screen.queryByRole("button", { name: /Deshacer/ })).toBeNull();
  });

  it("al tocarlo, la pantalla vuelve a ofrecer «Marcar entrada» y lo dice", async () => {
    respuesta = estadoServidor({
      marcas: [HACE_20_S],
      deshacer: { ocurrioEn: HACE_20_S, tipo: "entrada" },
    });
    render(<MarcacionClient />);
    fireEvent.click(await screen.findByRole("button", { name: /Deshacer la entrada/ }));
    await waitFor(() =>
      expect(pedidos.some((p) => p === "POST /api/marcacion/deshacer")).toBe(true),
    );
    expect(await screen.findByRole("button", { name: "Marcar entrada" })).toBeTruthy();
    expect(screen.getByText("Listo, se deshizo la entrada. Puedes marcar de nuevo.")).toBeTruthy();
  });

  it("🔴 el teléfono NO le dice al servidor QUÉ marca deshacer", async () => {
    respuesta = estadoServidor({
      marcas: [HACE_20_S],
      deshacer: { ocurrioEn: HACE_20_S, tipo: "entrada" },
    });
    render(<MarcacionClient />);
    fireEvent.click(await screen.findByRole("button", { name: /Deshacer la entrada/ }));
    await waitFor(() => expect(pedidos.some((p) => p.includes("/deshacer"))).toBe(true));
    const llamada = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.find((c) =>
      String(c[0]).includes("/deshacer"),
    )!;
    expect((llamada[1] as RequestInit).body).toBeUndefined();
  });

  it("si el servidor dice que ya no se puede, se dice y no se miente", async () => {
    respuesta = estadoServidor({
      marcas: [HACE_20_S],
      deshacer: { ocurrioEn: HACE_20_S, tipo: "entrada" },
    });
    statusDeshacer = 409;
    respuestaDeshacer = { error: "Ya pasaron los dos minutos para deshacer esa marca. Si está mal, avísale a Roxana." };
    render(<MarcacionClient />);
    fireEvent.click(await screen.findByRole("button", { name: /Deshacer la entrada/ }));
    expect(await screen.findByText(/Ya pasaron los dos minutos/)).toBeTruthy();
  });

  it("una marca que todavía espera señal se deshace SIN pedirle nada al servidor", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { container } = render(<MarcacionClient />);
    await screen.findByRole("button", { name: "Marcar entrada" });
    await marcar(container, "Marcar entrada");
    fireEvent.click(await screen.findByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(cola).toHaveLength(1));

    fireEvent.click(await screen.findByRole("button", { name: /Deshacer la entrada/ }));
    await waitFor(() => expect(cola).toHaveLength(0));
    expect(pedidos.some((p) => p.includes("/deshacer"))).toBe(false);
    expect(await screen.findByRole("button", { name: "Marcar entrada" })).toBeTruthy();
  });
});

describe("🩸 C. la pantalla se entera cuando la cola sube la marca", () => {
  /** Marca en modo avión y después vuelve la señal. */
  async function marcarSinSenalYVolverLaSenal(container: HTMLElement) {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await screen.findByRole("button", { name: "Marcar entrada" });
    await marcar(container, "Marcar entrada");
    fireEvent.click(await screen.findByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(cola).toHaveLength(1));
    expect(await screen.findByText("Se va a enviar sola cuando vuelva la señal.")).toBeTruthy();

    // 🔴 El servidor YA tiene la marca y el POST de la cola contesta el estado
    // nuevo — que es exactamente lo que pasó en el iPhone de Daniel.
    respuestaPost = { ok: true, ...estadoServidor({ marcas: [HACE_20_S] }) };
    respuesta = estadoServidor({ marcas: [HACE_20_S] });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(50);
    });
  }

  it("🔴 el botón pasa a «Marcar salida» y la lista muestra la marca", async () => {
    const { container } = render(<MarcacionClient />);
    await marcarSinSenalYVolverLaSenal(container);
    expect(await screen.findByRole("button", { name: "Marcar salida" })).toBeTruthy();
    expect(screen.queryByText("Todavía no tienes marcas en esta quincena.")).toBeNull();
    expect(screen.getByText("Mis marcas")).toBeTruthy();
  });

  it("🔴 el aviso «se va a enviar sola» DESAPARECE: ya no es cierto", async () => {
    const { container } = render(<MarcacionClient />);
    await marcarSinSenalYVolverLaSenal(container);
    await waitFor(() =>
      expect(screen.queryByText("Se va a enviar sola cuando vuelva la señal.")).toBeNull(),
    );
    expect(screen.queryByText(/está esperando señal/)).toBeNull();
  });

  it("🔴 y no hace falta una segunda vuelta a la red: se usa lo que contestó el envío", async () => {
    const { container } = render(<MarcacionClient />);
    await marcarSinSenalYVolverLaSenal(container);
    // El POST de la cola trae el estado nuevo; después de él no se vuelve a
    // pedir el estado, que es justo la petición que falla cuando la señal está
    // volviendo — y la que dejaba la pantalla con el dato viejo.
    const desdeElPost = pedidos.slice(pedidos.lastIndexOf("POST /api/marcacion") + 1);
    expect(desdeElPost.filter((p) => p === "GET /api/marcacion")).toEqual([]);
  });

  it("si el refresco falla igual, la pantalla lo DICE en vez de mostrar lo viejo", async () => {
    render(<MarcacionClient />);
    await screen.findByRole("button", { name: "Marcar entrada" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin señal"); }));
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(await screen.findByText(/No se pudo cargar tu reloj/)).toBeTruthy();
  });
});
