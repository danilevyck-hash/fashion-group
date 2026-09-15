/**
 * EL RELOJ DEL TELÉFONO — la pantalla, de conducta (14-sep-2026).
 *
 * El candado de las reglas vive en `marcacion-reloj-del-telefono.test.ts`.
 * Acá se monta la pantalla de verdad y se comprueba lo que Ana ve y toca:
 *
 *  A. UN SOLO BOTÓN que cambia de texto: entrada → salida → apagado.
 *  B. LA HORA GRANDE ES LA DEL SERVIDOR, aunque el teléfono esté adelantado
 *     tres horas. Es el punto entero del pedido de Daniel.
 *  C. SIN SEÑAL SE MARCA IGUAL: la marca queda guardada en el teléfono y la
 *     pantalla dice que se va a enviar sola.
 *  D. SIN UBICACIÓN NO SE ENVÍA, y se dice qué falta.
 *  E. ELLA VE SUS MARCAS y nada de nadie más.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import React from "react";

// El encabezado del sistema lee sessionStorage y rutas: no es lo que se prueba.
vi.mock("@/components/AppHeader", () => ({ default: () => <div data-testid="encabezado" /> }));
// El canvas no existe en jsdom: la foto viaja tal cual, que es el plan B real.
vi.mock("@/lib/marcacion/selfie-telefono", () => ({
  achicarEnElTelefono: async (b: Blob) => b,
}));

// La cola del teléfono, en memoria.
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

function estadoServidor(marcas: string[] = []) {
  return {
    codigo: "2",
    nombre: "ANA TREJOS",
    ahora: AHORA_SERVIDOR,
    hoy: "2026-09-15",
    quincena: { desde: "2026-09-01", hasta: "2026-09-15" },
    rotuloQuincena: "1 – 15 sep",
    marcas: marcas.map((m) => ({ ocurrioEn: m })),
  };
}

let respuesta: unknown = estadoServidor();
let postStatus = 200;
const posts: FormData[] = [];

beforeEach(() => {
  cola = [];
  posts.length = 0;
  postStatus = 200;
  respuesta = estadoServidor();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts.push(init.body as FormData);
      return { ok: postStatus === 200, status: postStatus, json: async () => (postStatus === 200 ? { ok: true } : { error: "no" }) } as Response;
    }
    return { ok: true, status: 200, json: async () => respuesta } as Response;
  }));
  // 🔴 EL TELÉFONO ESTÁ ADELANTADO TRES HORAS. Todo lo que sigue se mira con
  // ese reloj mentiroso puesto: es el caso que Daniel quiso cerrar.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-15T16:58:00.000Z"));
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

/** Toca el botón y "saca la foto": el input escondido recibe el archivo. */
async function marcar(contenedor: HTMLElement, boton: string) {
  fireEvent.click(screen.getByRole("button", { name: boton }));
  const input = contenedor.querySelector('input[type="file"]') as HTMLInputElement;
  const foto = new File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [foto] } });
  });
}

describe("La pantalla del teléfono", () => {
  it("A. el botón dice «Marcar entrada» cuando todavía no marcó", async () => {
    render(<MarcacionClient />);
    expect(await screen.findByRole("button", { name: "Marcar entrada" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Marcar salida" })).toBeNull();
  });

  it("A. con una marca del día dice «Marcar salida»", async () => {
    respuesta = estadoServidor([AHORA_SERVIDOR]);
    render(<MarcacionClient />);
    expect(await screen.findByRole("button", { name: "Marcar salida" })).toBeTruthy();
    expect(screen.getByText("Acuérdate de marcar la salida.")).toBeTruthy();
  });

  it("A. con las dos del día el botón se APAGA", async () => {
    respuesta = estadoServidor([AHORA_SERVIDOR, "2026-09-15T23:04:00.000Z"]);
    render(<MarcacionClient />);
    const b = (await screen.findByRole("button", { name: "Ya marcaste hoy" })) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(screen.getByText("Mañana acuérdate de marcar la entrada.")).toBeTruthy();
  });

  it("🔴 B. la hora grande es la del SERVIDOR (8:58), no la del teléfono (11:58)", async () => {
    render(<MarcacionClient />);
    expect(await screen.findByText("08:58")).toBeTruthy();
    expect(screen.queryByText("11:58")).toBeNull();
    expect(screen.getByText(/hora de Panamá/)).toBeTruthy();
  });

  it("C. con señal, marcar manda la marca al servidor y NO la deja en el teléfono", async () => {
    const { container } = render(<MarcacionClient />);
    await screen.findByRole("button", { name: "Marcar entrada" });
    await marcar(container, "Marcar entrada");
    fireEvent.click(await screen.findByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].get("sinSenal")).toBe("0");
    expect(posts[0].get("tipo")).toBe("entrada");
    expect(posts[0].get("lat")).toBe("8.9824");
    expect(cola).toHaveLength(0);
  });

  it("🔴 C. SIN SEÑAL se marca igual: queda en el teléfono y se dice que se envía sola", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { container } = render(<MarcacionClient />);
    await screen.findByRole("button", { name: "Marcar entrada" });
    await marcar(container, "Marcar entrada");
    fireEvent.click(await screen.findByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(cola).toHaveLength(1));
    expect(posts).toHaveLength(0);
    expect(await screen.findByText("Se va a enviar sola cuando vuelva la señal.")).toBeTruthy();
    // La hora guardada es la del teléfono: sin señal no hay otra.
    expect(String(cola[0].horaTelefono)).toMatch(/^2026-09-15T16:58/);
    // Y el botón YA cuenta esa marca: lo siguiente que toca es la salida.
    expect(await screen.findByRole("button", { name: "Marcar salida" })).toBeTruthy();
  });

  it("🔴 D. sin ubicación no se envía, y se dice qué falta", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: (_ok: unknown, err: (e: unknown) => void) => err({ code: 1 }) },
    });
    const { container } = render(<MarcacionClient />);
    await screen.findByRole("button", { name: "Marcar entrada" });
    await marcar(container, "Marcar entrada");
    expect(
      await screen.findByText("Falta la ubicación. Acepta el permiso de ubicación para poder marcar."),
    ).toBeTruthy();
    // 🔑 El toque se deja CORRER ENTERO antes de mirar: con un `waitFor` a
    // secas, «todavía no hay ningún POST» se cumple en el primer instante
    // aunque el envío estuviera en camino — y el candado no cazaría a una
    // pantalla que manda la marca con una ubicación inventada.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(posts).toHaveLength(0);
    expect(cola).toHaveLength(0);
    // Y el aviso sigue a la vista: no se envió, y se dice por qué.
    expect(
      screen.getByText("Falta la ubicación. Acepta el permiso de ubicación para poder marcar."),
    ).toBeTruthy();
  });

  it("E. ve SUS marcas de la quincena, con la que le falta señalada", async () => {
    respuesta = estadoServidor([
      AHORA_SERVIDOR,
      "2026-09-15T23:04:00.000Z",
      "2026-09-11T14:02:00.000Z",
    ]);
    render(<MarcacionClient />);
    expect(await screen.findByText("Mis marcas")).toBeTruthy();
    expect(screen.getByText("1 – 15 sep")).toBeTruthy();
    expect(screen.getByText("08:58 – 18:04")).toBeTruthy();
    expect(screen.getByText("falta la salida")).toBeTruthy();
    // CONTROL: no se dibuja nada de plata ni de nadie más.
    expect(screen.queryByText(/salario|planilla|neto/i)).toBeNull();
  });

  it("sin usuario atado a un colaborador se DICE, no se inventa a quién marcarle", async () => {
    respuesta = { codigo: null, aviso: "Tu usuario todavía no está atado a ningún colaborador, así que no hay a quién marcarle. Avísale a Daniel.", ahora: AHORA_SERVIDOR };
    render(<MarcacionClient />);
    expect(await screen.findByText(/no está atado a ningún colaborador/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Marcar/ })).toBeNull();
  });
});
