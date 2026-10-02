/**
 * MARCACIÓN ESTILO APPLE — el candado (1-oct-2026).
 *
 *   1. El interruptor está PRENDIDO: Daniel aprobó las capturas el 2-oct-2026:
 *      «sí». Apagado (cada prueba lo fuerza con `pantallaCon(false)`), la
 *      pantalla es la de antes (la pastilla verde, el aviso ámbar de la cola).
 *   2. Prendido, el día son renglones fijos con su hora o «—», la marca en la
 *      cola lleva «Pendiente de envío» y «Deshacer» va en el renglón de la
 *      ÚLTIMA marca.
 *   3. 🔴 SOLO PANTALLA: la pantalla no arma ningún envío; lo que se manda lo
 *      vigila `marcacion-payload-igual` y aquí se exige que el cliente siga
 *      armando los MISMOS campos con el interruptor en cualquier posición.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PantallaUnToqueProps } from "@/app/marcacion/PantallaUnToque";

vi.mock("@/lib/navegacion/useBarraFijaAbajo", () => ({ usePublicarAltoBarraFija: () => undefined }));

const RAIZ = join(process.cwd(), "src");
const LEER = (p: string) => readFileSync(join(RAIZ, p), "utf8");

const BASE: PantallaUnToqueProps = {
  nombre: "Ana Trejos",
  hora: "12:21 p. m.",
  fecha: "Jueves 1 de octubre",
  enLinea: true,
  hoyMarcado: { fecha: "2026-10-01", entrada: "08:58", salida: "12:20", faltaSalida: false } as never,
  horasHoy: ["08:58", "12:20"],
  horasPendientesHoy: [],
  marcasHoy: 2,
  sePuedeDeshacer: { donde: "servidor", tipo: "salida", ocurrioEn: "2026-10-01T17:20:00Z", restanMs: 95_000 },
  deshaciendo: false,
  onDeshacer: () => undefined,
  aviso: null,
  pendientes: 0,
  faltoAyer: false,
  boton: { tipo: "entrada", texto: "Marcar regreso de almuerzo", apagado: false },
  marcando: false,
  onTocarBoton: () => undefined,
};

async function pantallaCon(prendido: boolean) {
  vi.resetModules();
  vi.doMock("@/lib/marcacion/apple-2026-10", async (orig) => ({
    ...(await orig<typeof import("@/lib/marcacion/apple-2026-10")>()),
    MARCACION_APPLE_2026_10: prendido,
  }));
  return (await import("@/app/marcacion/PantallaUnToque")).default;
}

afterEach(() => {
  cleanup();
  vi.doUnmock("@/lib/marcacion/apple-2026-10");
});

describe("el interruptor", () => {
  // 2-oct-2026: antes fijaba «nace apagado». Daniel aprobó las capturas el
  // 2-oct-2026: «sí».
  it("🔴 PRENDIDO desde el «sí» de Daniel (2-oct-2026)", async () => {
    const real = await vi.importActual<typeof import("@/lib/marcacion/apple-2026-10")>(
      "@/lib/marcacion/apple-2026-10",
    );
    expect(real.MARCACION_APPLE_2026_10).toBe(true);
  });
});

describe("apagado = la pantalla de hoy", () => {
  it("la pastilla verde con «Deshacer la salida a almuerzo» y sin renglones", async () => {
    const P = await pantallaCon(false);
    const { container } = render(<P {...BASE} />);
    expect(container.querySelector("[data-pastilla]")).not.toBeNull();
    expect(container.querySelector("[data-renglones-del-dia]")).toBeNull();
    expect(screen.getByRole("button", { name: /Deshacer la salida a almuerzo/ })).toBeTruthy();
  });

  it("la cola se dice en el aviso ámbar de siempre", async () => {
    const P = await pantallaCon(false);
    render(<P {...BASE} pendientes={1} />);
    expect(screen.getByText("Una marca está esperando señal. Se va a enviar sola.")).toBeTruthy();
  });
});

describe("prendido = el día en renglones", () => {
  it("cuatro renglones con su hora o «—», sin la pastilla", async () => {
    const P = await pantallaCon(true);
    const { container } = render(<P {...BASE} />);
    expect(container.querySelector("[data-pastilla]")).toBeNull();
    const filas = [...container.querySelectorAll("[data-renglones-del-dia] li")].map((li) => li.textContent);
    expect(filas).toHaveLength(4);
    expect(filas[0]).toContain("Entrada");
    expect(filas[0]).toContain("8:58 a. m.");
    expect(filas[1]).toContain("Salida a almuerzo");
    expect(filas[1]).toContain("12:20 p. m.");
    expect(filas[2]).toContain("Regreso de almuerzo");
    expect(filas[2]).toContain("—");
    expect(filas[3]).toContain("—");
  });

  it("«Deshacer» va SOLO en el renglón de la última marca", async () => {
    const P = await pantallaCon(true);
    const { container } = render(<P {...BASE} />);
    const filas = [...container.querySelectorAll("[data-renglones-del-dia] li")];
    expect(filas[1].querySelector("button")?.textContent).toBe("Deshacer · 1:35");
    expect(filas.filter((f) => f.querySelector("button"))).toHaveLength(1);
  });

  it("la marca en la cola lleva «Pendiente de envío» y la línea dice la verdad", async () => {
    const P = await pantallaCon(true);
    const { container } = render(<P {...BASE} horasPendientesHoy={["12:20"]} pendientes={1} />);
    const filas = [...container.querySelectorAll("[data-renglones-del-dia] li")];
    expect(filas[1].textContent).toContain("Pendiente de envío");
    expect(filas[0].textContent).not.toContain("Pendiente de envío");
    expect(container.querySelector("[data-pendientes-de-envio]")?.textContent).toBe(
      "1 marca pendiente de envío. Se envía al tener señal, con la app abierta.",
    );
    expect(screen.queryByText(/Se va a enviar sola/)).toBeNull();
  });

  it("con cero marcas los cuatro renglones ya están (nada salta al marcar)", async () => {
    const P = await pantallaCon(true);
    const { container } = render(
      <P {...BASE} hoyMarcado={null} horasHoy={[]} marcasHoy={0} sePuedeDeshacer={null} />,
    );
    expect(container.querySelectorAll("[data-renglones-del-dia] li")).toHaveLength(4);
  });

  it("el botón sigue siendo el mismo, en el mismo cajón", async () => {
    const P = await pantallaCon(true);
    const { container } = render(<P {...BASE} />);
    expect(container.querySelector("[data-boton-fijo] button")?.textContent).toBe("Marcar regreso de almuerzo");
  });
});

describe("renglonesDelDia", () => {
  it("empareja la cola por hora, una sola vez cada una", async () => {
    const { renglonesDelDia } = await vi.importActual<typeof import("@/lib/marcacion/apple-2026-10")>(
      "@/lib/marcacion/apple-2026-10",
    );
    const r = renglonesDelDia(["08:00", "08:00"], ["08:00"]);
    expect(r.map((x) => x.pendiente)).toEqual([true, false, false, false]);
    expect(r[2]).toEqual({ rotulo: "Regreso de almuerzo", hora: null, pendiente: false });
  });
});

describe("🔴 solo pantalla: lo que se envía no cambia", () => {
  it("la pantalla no envía nada: ni fetch ni FormData", () => {
    const fuente = LEER("app/marcacion/PantallaUnToque.tsx");
    expect(fuente).not.toMatch(/fetch\(|FormData/);
    expect(LEER("lib/marcacion/apple-2026-10.ts")).not.toMatch(/fetch\(|FormData|supabase/);
  });

  it("el cliente no consulta el interruptor: arma el envío igual en las dos posiciones", () => {
    const cliente = LEER("app/marcacion/MarcacionClient.tsx");
    expect(cliente).not.toContain("MARCACION_APPLE_2026_10");
    const campos = cliente
      .split("new FormData()")
      .slice(1)
      .map((b) => [...b.matchAll(/cuerpo\.set\(\s*(?:"([^"]+)"|([A-Z_]+))/g)].map((m) => m[1] ?? m[2]));
    for (const c of campos) {
      expect(new Set(c)).toEqual(
        new Set(["eventoId", "tipo", "sinSenal", "horaTelefono", "lat", "lng", "precisionM", "selfie", "CAMPO_APARATO"]),
      );
    }
  });
});
