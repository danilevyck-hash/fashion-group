/**
 * CANDADO DE CONDUCTA — la hoja «Cobrar» de Confecciones Boston, en pantalla.
 *
 * Daniel prendió el correo de esta cartera el 9-sep-2026: *«Firma Confecciones
 * Boston»*. Lo que este archivo pinta y lee:
 *
 *   · con correo cargado, «Correo» se puede tocar y dice a quién va;
 *   · SIN correo, sale APAGADO y dice dónde cargarlo — medido: de los 398
 *     clientes con saldo, 284 tienen teléfono y solo 119 correo;
 *   · tocar «Correo» PROGRAMA el envío (los 5 segundos de «Deshacer» del
 *     sistema), no lo manda de una;
 *   · lo que se programa es lo que el SERVIDOR dictó, no un texto armado en el
 *     navegador.
 *
 * ─── POR QUÉ SE RENDERIZA EN VEZ DE LEER EL ARCHIVO ─────────────────────────
 * Un barrido de texto se satisface con que la palabra «Correo» esté escrita:
 * dejaría pasar el botón detrás de un `{false && …}`, o prendido sin correo. Acá
 * se lee lo que el navegador habría mostrado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

import BostonHojaCobrar, { type ClienteCobrarBoston } from "@/components/cxc/BostonHojaCobrar";

const CLIENTE: ClienteCobrarBoston = {
  codigo: "B-1",
  nombre: "Almacen La Fe",
  telefono: "775-1234",
  celular: "",
  correo: "lafe@ejemplo.com",
  d0_90: 1000,
  d91_120: 0,
  d121_plus: 500,
  total: 1500,
};

const PREVIEW = {
  destinatario: "lafe@ejemplo.com",
  asunto: "Confecciones Boston — Estado de cuenta Septiembre 2026",
  cuerpo: "Buen día Marta,",
  totalDocs: 7,
  marcaEnvio: "Le enviaste el estado de cuenta hace 3 días",
};

function montar(preview: Partial<typeof PREVIEW>) {
  const pedidas: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    pedidas.push(String(url));
    return { ok: true, status: 200, json: async () => ({ ...PREVIEW, ...preview }) } as unknown as Response;
  }));
  const programar = vi.fn();
  render(
    <BostonHojaCobrar
      cliente={CLIENTE}
      onClose={() => {}}
      onVerDocumentos={() => {}}
      onProgramarCorreo={programar}
    />,
  );
  return { programar, pedidas };
}

const botonCorreo = () => screen.getByRole("button", { name: /^Correo/ }) as HTMLButtonElement;

/** jsdom trae un `localStorage` a medias; la hoja vive dentro del layout. */
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

beforeEach(() => {
  vi.stubGlobal("localStorage", memStorage());
  vi.stubGlobal("sessionStorage", memStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("con correo cargado", () => {
  it("«Correo» se puede tocar y dice a quién va", async () => {
    montar({});
    await waitFor(() => expect(botonCorreo().disabled).toBe(false));
    expect(botonCorreo().textContent).toContain("lafe@ejemplo.com");
  });

  it("🔴 tocarlo PROGRAMA el envío con lo que dictó el servidor", async () => {
    const { programar } = montar({});
    await waitFor(() => expect(botonCorreo().disabled).toBe(false));
    fireEvent.click(botonCorreo());
    expect(programar).toHaveBeenCalledTimes(1);
    expect(programar.mock.calls[0][0]).toEqual({
      codigo: "B-1",
      destinatario: "lafe@ejemplo.com",
      asunto: "Confecciones Boston — Estado de cuenta Septiembre 2026",
      cuerpo: "Buen día Marta,",
    });
  });

  it("🔴 le pregunta a SU ruta, no a la del grupo", async () => {
    const { pedidas } = montar({});
    await waitFor(() => expect(pedidas.length).toBeGreaterThan(0));
    expect(pedidas[0]).toContain("/api/cxc/boston/enviar-email");
    expect(pedidas.join(" ")).not.toContain("/api/cxc/enviar-email?");
  });

  it("dice cuándo fue el último envío", async () => {
    montar({});
    expect(await screen.findByText("Le enviaste el estado de cuenta hace 3 días")).toBeTruthy();
  });
});

describe("🔴 sin correo cargado", () => {
  it("«Correo» sale APAGADO y dice dónde cargarlo", async () => {
    const { programar } = montar({ destinatario: "" });
    await waitFor(() =>
      expect(botonCorreo().textContent).toContain("Este cliente no tiene correo — cárgalo en Switch"),
    );
    expect(botonCorreo().disabled).toBe(true);
    fireEvent.click(botonCorreo());
    expect(programar).not.toHaveBeenCalled();
  });

  it("las otras tres salidas siguen ahí", async () => {
    montar({ destinatario: "" });
    expect(screen.getByRole("button", { name: /WhatsApp/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copiar el mensaje/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ver los documentos/ })).toBeTruthy();
  });
});

describe("⚠️ lo que lee el cliente", () => {
  it("la hoja nombra a Confecciones Boston y no dice «vencido»", async () => {
    montar({});
    await waitFor(() => expect(botonCorreo().disabled).toBe(false));
    const texto = document.body.textContent ?? "";
    expect(texto).toContain("Confecciones Boston");
    expect(texto.toLowerCase()).not.toMatch(/\bvencid[oa]s?\b/);
    expect(texto.toLowerCase()).not.toContain("fashion group");
  });
});
