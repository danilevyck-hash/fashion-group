/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL CARTEL DEL RELOJ, CON DOS RELOJES.
 *
 * 🩸 EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA CAZAR. `EstadoReloj` dibujaba
 * `relojes[0]` — el primero de la lista y nada más. Con un solo reloj eso no se
 * notaba nunca. Desde el 10-sep-2026 la misma PC lee DOS (Boston por la red de
 * la oficina, Multifashion por el túnel WireGuard) y el segundo habría quedado
 * INVISIBLE: sin cartel, sin "Traer ahora", y con el túnel caído la pantalla
 * seguiría en verde mientras ese reloj está mudo. La lista venía entera del
 * servidor desde siempre; lo único que faltaba era dibujarla.
 *
 * Y el otro lado, que pesa igual: ⚠️ CON UN SOLO RELOJ LA PANTALLA NO CAMBIA.
 * El nombre del reloj solo aparece cuando hay más de uno — un rótulo que sale
 * siempre es una palabra de más pegada a un dato.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import EstadoReloj from "@/app/asistencia/EstadoReloj";

const BOSTON = {
  dispositivo: "reloj cboston",
  salud: "al_dia" as const,
  titulo: "Las marcaciones están entrando solas (última revisión hace 2 minutos)",
  detalle: null,
  pedidoPendiente: false,
  pedidoSinRespuesta: false,
  leidoHasta: "2026-09-10T13:00:00Z",
};

const ACS = {
  dispositivo: "reloj acs",
  salud: "con_error" as const,
  titulo: "La PC está prendida pero no pudo leer el reloj",
  detalle: "connect ETIMEDOUT 192.168.20.98:80",
  pedidoPendiente: false,
  pedidoSinRespuesta: false,
  leidoHasta: null,
};

/** Los POST que la pantalla mandó, para saber a qué reloj le pidió. */
let pedidos: Array<Record<string, unknown>>;

function servir(relojes: unknown[]) {
  pedidos = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opciones?: RequestInit) => {
      if (opciones?.method === "POST") {
        pedidos.push(JSON.parse(String(opciones.body)));
        return { ok: true, json: async () => ({ ok: true, pedidoEn: "2026-09-10T14:00:00Z" }) };
      }
      return { ok: true, json: async () => ({ relojes }) };
    }),
  );
}

const montar = () =>
  render(
    <ToastProvider>
      <EstadoReloj />
    </ToastProvider>,
  );

beforeEach(() => {
  pedidos = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("🔴 los DOS relojes se ven, cada uno con su botón", () => {
  it("dibuja una tarjeta por reloj, no solo la primera", async () => {
    servir([BOSTON, ACS]);
    montar();
    await screen.findByText(/entrando solas/);
    // 🩸 Este es el defecto: con `relojes[0]` este texto no existía en pantalla.
    expect(screen.getByText(/no pudo leer el reloj/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Traer ahora/ })).toHaveLength(2);
  });

  it("con dos relojes cada tarjeta dice CUÁL es", async () => {
    servir([BOSTON, ACS]);
    montar();
    expect(await screen.findByText("Reloj de Boston")).toBeTruthy();
    expect(screen.getByText("Reloj de Multifashion")).toBeTruthy();
  });

  it("el error de un reloj se ve con SU detalle, sin taparse con el del otro", async () => {
    servir([BOSTON, ACS]);
    montar();
    // El túnel caído tiene que poder leerse: es lo que dice qué revisar.
    expect(await screen.findByText(/ETIMEDOUT 192\.168\.20\.98/)).toBeTruthy();
  });

  it("🔴 «Traer ahora» le pide al reloj de ESA tarjeta, no siempre al primero", async () => {
    servir([BOSTON, ACS]);
    montar();
    await screen.findByText(/entrando solas/);
    const botones = screen.getAllByRole("button", { name: /Traer ahora/ });
    fireEvent.click(botones[1]);
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0].dispositivo).toBe("reloj acs");
  });
});

describe("⚠️ con un solo reloj la pantalla es la de siempre", () => {
  it("una sola tarjeta, un solo botón", async () => {
    servir([BOSTON]);
    montar();
    await screen.findByText(/entrando solas/);
    expect(screen.getAllByRole("button", { name: /Traer ahora/ })).toHaveLength(1);
  });

  it("y NO se dibuja el nombre del reloj: no hay de qué distinguirlo", async () => {
    servir([BOSTON]);
    montar();
    await screen.findByText(/entrando solas/);
    expect(screen.queryByText("Reloj de Boston")).toBeNull();
  });

  it("sigue pidiéndole a su reloj por el nombre, nunca a uno escrito a mano", async () => {
    servir([BOSTON]);
    montar();
    await screen.findByText(/entrando solas/);
    fireEvent.click(screen.getByRole("button", { name: /Traer ahora/ }));
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0].dispositivo).toBe("reloj cboston");
  });
});

describe("el pedido en el aire es de un reloj, no de la pantalla entera", () => {
  it("uno esperando NO apaga el botón del otro", async () => {
    servir([{ ...BOSTON, pedidoPendiente: true }, ACS]);
    montar();
    await screen.findByText(/Pedido enviado/);
    // El de Boston gira; el de Multifashion se tiene que poder apretar igual.
    const otro = screen.getByRole("button", { name: /Traer ahora/ });
    expect((otro as HTMLButtonElement).disabled).toBe(false);
  });

  it("el que se dio por vencido dice qué hacer, y solo él", async () => {
    servir([BOSTON, { ...ACS, pedidoPendiente: true, pedidoSinRespuesta: true }]);
    montar();
    expect(await screen.findByText(/no ha recogido el pedido/)).toBeTruthy();
    expect(screen.queryAllByText(/no ha recogido el pedido/)).toHaveLength(1);
  });
});
