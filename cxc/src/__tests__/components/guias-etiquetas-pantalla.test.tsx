/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GUÍAS › ETIQUETAS — LA PANTALLA, dibujada de verdad (18-sep-2026).
 *
 * Lo que este archivo fija:
 *   1. 🔴 SIN LA TABLA LA PANTALLA NO SE ROMPE: la pestaña se dibuja, dice que
 *      falta correr la migración y «＋ Etiquetar una factura» queda apagado.
 *   2. La lista abre por PENDIENTES; «Todas» muestra también las que ya salieron.
 *   3. 🔴 UNA ETIQUETA IMPORTADA NO SE CORRIGE NI SE BORRA — los dos renglones
 *      del «···» salen apagados y DICEN por qué.
 *   4. El estado se lee en palabras: «Pendiente de guía» / «En GT-256».
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import EtiquetasView from "@/app/guias/components/EtiquetasView";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Las dos filas del ejemplo real: Nova Lux pendiente, Golden Mall en GT-259. */
const FILAS = [
  {
    id: 1,
    empresa_key: "fashion_shoes",
    empresa: "Fashion Shoes",
    switch_factura_id: 52558,
    secuencial: "11-000002558",
    fecha_factura: "2026-09-18",
    cliente_codigo: "D-170",
    cliente_nombre: "Nova Lux, S.A.",
    destino: "Paso Canoas",
    cajas: 14,
    creado_en: "2026-09-18T14:41:00-05:00",
    guia_numero: null,
  },
  {
    id: 2,
    empresa_key: "vistana",
    empresa: "Vistana International",
    switch_factura_id: 43102,
    secuencial: "11-000003102",
    fecha_factura: "2026-09-18",
    cliente_codigo: "D-55",
    cliente_nombre: "Golden Mall",
    destino: "David",
    cajas: 2,
    creado_en: "2026-09-18T10:00:00-05:00",
    guia_numero: 259,
  },
];

function servir(respuesta: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).startsWith("/api/guias/etiquetas")) {
        return { ok: true, status: 200, json: async () => respuesta } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }),
  );
}

/** jsdom de este Node no trae localStorage y `ModalOverlay` lo lee. */
function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memStorage());
  // El menú «···» se posiciona con getBoundingClientRect; en jsdom es todo 0 y
  // eso basta para que se dibuje.
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 0; });
});

// ─── 1 · sin la tabla ────────────────────────────────────────────────────────

describe("🔴 1. sin la migración corrida, la pantalla NO se rompe", () => {
  it("se dibuja, dice qué falta y nombra la migración", async () => {
    servir({ etiquetas: [], sinTabla: true });
    render(<EtiquetasView />);
    await waitFor(() => {
      expect(screen.getByText(/falta correr la migración/i)).toBeTruthy();
    });
    expect(screen.getByText("20261207120000_guias_etiquetas")).toBeTruthy();
    // Y lo dice sin asustar: Guías sigue funcionando igual.
    expect(screen.getByText(/Guías sigue funcionando igual/i)).toBeTruthy();
  });

  it("«＋ Etiquetar una factura» queda apagado: no se ofrece lo que no se puede guardar", async () => {
    servir({ etiquetas: [], sinTabla: true });
    render(<EtiquetasView />);
    // 🔴 SE ESPERA EL APAGADO, NO EL BOTÓN (23-sep-2026). El botón existe desde
    // el primer dibujo; que esté apagado depende de la respuesta que dice que
    // falta la tabla. Afirmarlo de una era una carrera contra el `fetch`: en
    // esta computadora ganaba, en la de GitHub no («expected false to be true»,
    // 20 y 22-sep). `waitFor` reintenta: si nunca se apaga, sigue roja.
    const boton = await screen.findByRole("button", { name: /Etiquetar una factura/ });
    await waitFor(() => expect((boton as HTMLButtonElement).disabled).toBe(true));
  });
});

// ─── 2 · la lista ────────────────────────────────────────────────────────────

describe("🔴 2. la lista abre por pendientes", () => {
  it("de dos etiquetas, solo se ve la pendiente", async () => {
    servir({ etiquetas: FILAS });
    render(<EtiquetasView />);
    await waitFor(() => expect(screen.getByText("11-000002558")).toBeTruthy());
    expect(screen.queryByText("11-000003102")).toBeNull();
    expect(screen.getByRole("button", { name: /Pendientes de guía · 1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Todas · 2/ })).toBeTruthy();
  });

  it("«Todas» muestra también la que ya salió, con su número de guía", async () => {
    servir({ etiquetas: FILAS });
    render(<EtiquetasView />);
    await waitFor(() => expect(screen.getByText("11-000002558")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Todas · 2/ }));
    expect(screen.getByText("11-000003102")).toBeTruthy();
    expect(screen.getByText("En GT-259")).toBeTruthy();
    expect(screen.getByText("Pendiente de guía")).toBeTruthy();
  });

  it("el buscador filtra lo ya cargado, por subcadena exacta", async () => {
    servir({ etiquetas: FILAS });
    render(<EtiquetasView />);
    await waitFor(() => expect(screen.getByText("11-000002558")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Todas · 2/ }));
    fireEvent.change(screen.getByLabelText("Buscar factura o cliente"), { target: { value: "golden" } });
    expect(screen.queryByText("11-000002558")).toBeNull();
    expect(screen.getByText("11-000003102")).toBeTruthy();
  });

  it("sin nada pendiente lo dice con palabras, nunca con una tabla vacía muda", async () => {
    servir({ etiquetas: [FILAS[1]] });
    render(<EtiquetasView />);
    await waitFor(() =>
      expect(screen.getByText(/Todo lo etiquetado ya salió en una guía/i)).toBeTruthy(),
    );
  });
});

// ─── 3 · importada = bloqueada, en la pantalla ───────────────────────────────

describe("🔴 3. la que ya salió en una guía no se corrige ni se borra", () => {
  async function abrirMenuDe(indiceFila: number) {
    const botones = await screen.findAllByRole("button", { name: /Más opciones/ });
    fireEvent.click(botones[indiceFila]);
    return screen.findAllByRole("menuitem");
  }

  it("la importada: «Reimprimir» se ofrece; corregir y borrar salen APAGADOS y lo dicen", async () => {
    servir({ etiquetas: [FILAS[1]] });
    render(<EtiquetasView />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Todas · 1/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Todas · 1/ }));
    const items = await abrirMenuDe(0);
    const [reimprimir, corregir, borrar] = items as HTMLButtonElement[];
    expect(reimprimir.textContent).toBe("Reimprimir");
    expect(reimprimir.disabled).toBe(false);
    expect(corregir.disabled).toBe(true);
    expect(corregir.textContent).toContain("bloqueado");
    expect(borrar.disabled).toBe(true);
    expect(borrar.textContent).toContain("bloqueado");
  });

  it("la pendiente: los tres se pueden tocar", async () => {
    servir({ etiquetas: [FILAS[0]] });
    render(<EtiquetasView />);
    await waitFor(() => expect(screen.getByText("11-000002558")).toBeTruthy());
    const items = await abrirMenuDe(0);
    for (const b of items as HTMLButtonElement[]) expect(b.disabled).toBe(false);
    expect((items[1] as HTMLButtonElement).textContent).toBe("Corregir bultos");
  });
});

// ─── 4 · borrar dice qué pasa y que nada se borra de verdad ──────────────────

describe("🔴 4. borrar avisa que la fila se queda como historial", () => {
  it("el modal dice cuántas etiquetas se quitan y que se puede volver a etiquetar", async () => {
    servir({ etiquetas: [FILAS[0]] });
    render(<EtiquetasView />);
    await waitFor(() => expect(screen.getByText("11-000002558")).toBeTruthy());
    fireEvent.click((await screen.findAllByRole("button", { name: /Más opciones/ }))[0]);
    const items = await screen.findAllByRole("menuitem");
    fireEvent.click(items[2]);
    expect(await screen.findByText(/Se quitan las 14 etiquetas/)).toBeTruthy();
    expect(screen.getByText(/se puede volver a etiquetar/i)).toBeTruthy();
    expect(screen.getByText(/nada se borra de verdad/i)).toBeTruthy();
  });
});
