// ─────────────────────────────────────────────────────────────────────────────
// LA TIRA DE «QUÉ CAMBIÓ» — CÓMO SE COMPORTA EN PANTALLA (9-sep-2026).
//
// Este archivo cubre la regla 2 —**no bloquea nada**— y el ciclo completo de la
// ×: se cierra, se anota, y no vuelve.
//
// Las otras seis reglas (una vez por persona · máximo 3 · una línea · solo quien
// tiene el módulo · caduca a los 30 días · nunca de otro módulo) viven en
// `src/__tests__/lib/novedades.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import NovedadesAviso, { ESPERA_MS, LLAVE_LOCAL } from "@/components/NovedadesAviso";

const HOY = new Date("2026-09-09T15:00:00Z");

/** Cinco pendientes del mismo módulo: si el corte de 3 se cayera, se ve. */
const CINCO = [
  { id: "cxc-1", modulo: "cxc", fecha: "2026-09-01", texto: "Cambio uno de la cartera." },
  { id: "cxc-2", modulo: "cxc", fecha: "2026-09-02", texto: "Cambio dos de la cartera." },
  { id: "cxc-3", modulo: "cxc", fecha: "2026-09-03", texto: "Cambio tres de la cartera." },
  { id: "cxc-4", modulo: "cxc", fecha: "2026-09-04", texto: "Cambio cuatro de la cartera." },
  { id: "cxc-5", modulo: "cxc", fecha: "2026-09-05", texto: "Cambio cinco de la cartera." },
];

// jsdom acá corre con origen opaco y NO trae `localStorage`; se le pone uno de
// verdad (mismo patrón que `catalogo-carrito.test.ts`).
function almacenDeMentira(): Storage {
  let d: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in d ? d[k] : null),
    setItem: (k: string, v: string) => { d[k] = String(v); },
    removeItem: (k: string) => { delete d[k]; },
    clear: () => { d = {}; },
    key: (i: number) => Object.keys(d)[i] ?? null,
    get length() { return Object.keys(d).length; },
  } as unknown as Storage;
}

let llamadas: { url: string; init?: RequestInit }[] = [];

function servidorDice(novedades: unknown[]) {
  llamadas = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    return { ok: true, json: async () => ({ novedades }) } as unknown as Response;
  }));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(HOY);
  Object.defineProperty(globalThis, "localStorage", {
    value: almacenDeMentira(), configurable: true, writable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const tira = () => document.querySelector("[data-novedades]") as HTMLElement | null;

/** El aviso espera a que la pantalla cargue: acá se adelanta ese reloj. */
async function dejarQuePase() {
  await act(async () => { vi.advanceTimersByTime(ESPERA_MS + 1); });
}

/* ═══ 2 · no bloquea nada ═════════════════════════════════════════════════ */

describe("🔴 2 · es una tira, NO un modal: no bloquea nada", () => {
  it("no está fija a la pantalla ni tapa nada", async () => {
    servidorDice(CINCO);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    await screen.findByText("Cambio cinco de la cartera.");

    const t = tira()!;
    // Un modal se pega a la pantalla y cubre todo; esto se lee y se va con el
    // scroll, como cualquier otra fila de la página.
    expect(t.className).not.toMatch(/\bfixed\b/);
    expect(t.className).not.toMatch(/\binset-0\b/);
    expect(t.className).not.toMatch(/\bz-50\b/);
    expect(t.getAttribute("aria-modal")).toBeNull();
    expect(t.getAttribute("role")).toBe("status");
  });

  it("no dibuja fondo oscuro ni atrapa el resto de la pantalla", () => {
    servidorDice(CINCO);
    const { container } = render(<NovedadesAviso moduloKey="cxc" />);
    expect(container.querySelector(".bg-black\\/40")).toBeNull();
    expect(container.querySelector("[aria-hidden='true']")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("🩸 el aviso ESPERA a que la pantalla cargue, no compite con ella", async () => {
    // Sin esta espera, Guías › Configuración se quedó en «Cargando…» dentro de
    // su propia prueba: la tira pedía lo suyo en el mismo instante que el
    // módulo. Primero los datos del módulo; el aviso después.
    servidorDice(CINCO);
    render(<NovedadesAviso moduloKey="cxc" />);
    await act(async () => { vi.advanceTimersByTime(50); });
    expect(llamadas, "el aviso pidió lo suyo mientras la pantalla cargaba").toEqual([]);
    await dejarQuePase();
    expect(llamadas.length).toBeGreaterThan(0);
  });

  it("la × es de 44 px — se usa con el dedo en el iPhone", async () => {
    servidorDice(CINCO);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    const x = await screen.findByLabelText("Cerrar avisos");
    expect(x.className).toContain("min-h-[44px]");
    expect(x.className).toContain("min-w-[44px]");
  });
});

/* ═══ 3 · tres a la vez, las más nuevas ═══════════════════════════════════ */

describe("🔴 3 · se ven TRES, las más nuevas", () => {
  it("con cinco pendientes se dibujan tres renglones", async () => {
    servidorDice(CINCO);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    await screen.findByText("Cambio cinco de la cartera.");
    expect(tira()!.querySelectorAll("li")).toHaveLength(3);
  });

  it("y son la 5, la 4 y la 3 — la 1 y la 2 esperan su turno", async () => {
    servidorDice(CINCO);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    await screen.findByText("Cambio cinco de la cartera.");
    expect(screen.getByText("Cambio cuatro de la cartera.")).toBeTruthy();
    expect(screen.getByText("Cambio tres de la cartera.")).toBeTruthy();
    expect(screen.queryByText("Cambio dos de la cartera.")).toBeNull();
    expect(screen.queryByText("Cambio uno de la cartera.")).toBeNull();
  });
});

/* ═══ 1 · la × cierra, anota, y no vuelve ═════════════════════════════════ */

describe("🔴 1 · se cierra con la × y no vuelve", () => {
  it("al tocar la × la tira desaparece", async () => {
    servidorDice(CINCO);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    fireEvent.click(await screen.findByLabelText("Cerrar avisos"));
    expect(tira()).toBeNull();
  });

  it("queda anotado en la base: se manda quién y cuáles", async () => {
    servidorDice(CINCO);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    fireEvent.click(await screen.findByLabelText("Cerrar avisos"));
    await waitFor(() => {
      const post = llamadas.find((l) => l.init?.method === "POST");
      expect(post, "no se anotó lo leído en el servidor").toBeTruthy();
      expect(JSON.parse(String(post!.init!.body))).toEqual({ ids: ["cxc-5", "cxc-4", "cxc-3"] });
    });
  });

  it("y también en este navegador, para que la × no dependa de la red", async () => {
    servidorDice(CINCO);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    fireEvent.click(await screen.findByLabelText("Cerrar avisos"));
    expect(JSON.parse(localStorage.getItem(LLAVE_LOCAL)!)).toEqual(["cxc-5", "cxc-4", "cxc-3"]);
  });

  it("🔴 al volver a entrar NO vuelve, aunque el servidor todavía la mande", async () => {
    // Es el caso real de la DDL pendiente: el servidor no sabe que la cerró.
    localStorage.setItem(LLAVE_LOCAL, JSON.stringify(["cxc-5", "cxc-4", "cxc-3"]));
    servidorDice(CINCO);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    await screen.findByText("Cambio dos de la cartera.");
    expect(screen.queryByText("Cambio cinco de la cartera.")).toBeNull();
    // Y las que NUNCA cerró suben en su lugar: no se pierde ninguna.
    expect(screen.getByText("Cambio uno de la cartera.")).toBeTruthy();
  });

  it("cerradas TODAS, no se dibuja nada", async () => {
    localStorage.setItem(LLAVE_LOCAL, JSON.stringify(CINCO.map((x) => x.id)));
    servidorDice(CINCO);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    await waitFor(() => expect(llamadas.length).toBeGreaterThan(0));
    expect(tira()).toBeNull();
  });
});

/* ═══ 7 · nunca fuera de su módulo ════════════════════════════════════════ */

describe("🔴 7 · fuera de un módulo no se pregunta ni se dibuja", () => {
  it("sin módulo (el home) no se pide nada al servidor", async () => {
    servidorDice(CINCO);
    render(<NovedadesAviso moduloKey={null} />);
    await dejarQuePase();
    expect(llamadas).toEqual([]);
    expect(tira()).toBeNull();
  });

  it("se pregunta por el módulo en el que está parado", async () => {
    servidorDice([]);
    render(<NovedadesAviso moduloKey="guias" />);
    await dejarQuePase();
    await waitFor(() => expect(llamadas[0].url).toContain("modulo=guias"));
  });

  it("sin novedades no se dibuja una tira vacía", async () => {
    servidorDice([]);
    render(<NovedadesAviso moduloKey="cxc" />);
    await dejarQuePase();
    await waitFor(() => expect(llamadas.length).toBeGreaterThan(0));
    expect(tira()).toBeNull();
  });
});
