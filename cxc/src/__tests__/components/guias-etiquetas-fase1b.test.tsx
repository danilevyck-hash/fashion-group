/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 ETIQUETAS · LOS CINCO ARREGLOS — LAS PANTALLAS, DIBUJADAS DE VERDAD
 * (18-sep-2026).
 *
 * Un barrido de texto no puede ver lo único que importa acá: que la casilla
 * salga APAGADA, que diga por qué, y que corregir los bultos ABRA la
 * reimpresión. Por eso se monta y se toca.
 *
 * Lo que este archivo fija:
 *   1. 🔴 ANTI-DOBLE CAPTURA — en el selector de siempre, la factura que viene
 *      de Etiquetas sale marcada, bloqueada y con el porqué.
 *   2. 🔴 Y AL REVÉS — en «Facturas etiquetadas pendientes», la que ya marcó el
 *      selector sale bloqueada y no se puede tocar.
 *   3. 🔴 «Corregir bultos» al guardar abre «Reimprimir», con el juego completo
 *      elegido y el aviso de que el papel viejo quedó mal.
 *   4. 🔴 El selector para etiquetar NO muestra las ya etiquetadas, y dice
 *      cuántas escondió.
 *   5. El copy de Switch, verbatim.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";

import EtiquetasView from "@/app/guias/components/EtiquetasView";
import FacturasDelCliente from "@/app/guias/components/FacturasDelCliente";
import EtiquetasPendientes from "@/app/guias/components/EtiquetasPendientes";
import type { GuiaItem } from "@/app/guias/components/types";
import type { EtiquetaFila } from "@/lib/guias/etiquetas";

const NOVA = { codigo: "D-170", nombre: "Nova Lux, S.A." };

/** La etiqueta viva de Nova Lux: 14 cajas de la factura 11-000002558. */
const ETIQUETA: EtiquetaFila = {
  id: 1,
  empresa_key: "fashion_shoes",
  empresa: "Fashion Shoes",
  switch_factura_id: 52558,
  secuencial: "11-000002558",
  fecha_factura: "2026-09-18",
  cliente_codigo: NOVA.codigo,
  cliente_nombre: NOVA.nombre,
  destino: "Paso Canoas",
  cajas: 14,
  creado_en: "2026-09-18T14:41:00-05:00",
  guia_numero: null,
};

/** Dos facturas del mismo día: la primera etiquetada, la segunda no. */
const FACTURAS = [
  {
    empresa_key: "fashion_shoes",
    empresa: "Fashion Shoes",
    switch_factura_id: 52558,
    secuencial: "11-000002558",
    fecha: "2026-09-18T16:00:00Z",
    total: 1200,
    yaSalioEn: null,
  },
  {
    empresa_key: "fashion_shoes",
    empresa: "Fashion Shoes",
    switch_factura_id: 52559,
    secuencial: "11-000002559",
    fecha: "2026-09-18T15:00:00Z",
    total: 300,
    yaSalioEn: null,
  },
];

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
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 0; });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function asentar() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const casillas = () => screen.queryAllByRole("checkbox") as HTMLInputElement[];

// ─────────────────────────────────────────────────────────────────────────────
// 1 · El selector de siempre: lo que viene de Etiquetas sale BLOQUEADO
// ─────────────────────────────────────────────────────────────────────────────

function filaVacia(uid = "a"): GuiaItem {
  return { uid, orden: 1, cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "" };
}

/** El renglón tal como lo deja marcar la etiqueta: factura puesta y 14 bultos. */
function filaDeEtiquetas(): GuiaItem {
  return {
    uid: "e", orden: 1, cliente: NOVA.nombre, cliente_codigo: NOVA.codigo,
    direccion: "Paso Canoas", empresa: "Fashion Shoes", facturas: "11-000002558",
    bultos: 14, numero_guia_transp: "",
  };
}

function SelectorHarness({
  itemsIniciales,
  etiquetas = [ETIQUETA],
}: {
  itemsIniciales?: GuiaItem[];
  etiquetas?: EtiquetaFila[];
}) {
  const [items, setItems] = useState<GuiaItem[]>(itemsIniciales ?? [filaVacia()]);
  return (
    <FacturasDelCliente
      items={items}
      etiquetasVivas={etiquetas}
      onReemplazarItems={(next) => setItems(next.map((it, i) => ({ ...it, orden: i + 1, uid: it.uid ?? `n${i}` })))}
      clientesTop={[NOVA]}
    />
  );
}

async function elegirCliente(nombre: string) {
  const campo = document.getElementById("facturas-cliente") as HTMLInputElement;
  fireEvent.focus(campo);
  fireEvent.change(campo, { target: { value: "" } });
  const opcion = await screen.findByText(nombre, { selector: "[data-desplegable] *" });
  fireEvent.mouseDown(opcion.closest("button") ?? opcion);
  await asentar();
}

function servirFacturas() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.startsWith("/api/guias/facturas-cliente")) {
        return { ok: true, json: async () => ({ facturas: FACTURAS, hasta: null }) } as unknown as Response;
      }
      if (u.startsWith("/api/guias/frecuencias") || u.startsWith("/api/clientes")) {
        return { ok: true, json: async () => ({ clientes: [NOVA], empresas: [], destinos: {}, definidos: {} }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }),
  );
}

describe("🔴 1. en el selector de siempre, la factura de Etiquetas sale marcada y BLOQUEADA", () => {
  beforeEach(servirFacturas);

  it("ya en la guía: casilla marcada, apagada, y dice «Ya viene de Etiquetas · 14 cajas»", async () => {
    render(<SelectorHarness itemsIniciales={[filaDeEtiquetas()]} />);
    await asentar();
    await elegirCliente(NOVA.nombre);
    const [etiquetada, libre] = casillas();
    expect(etiquetada.checked).toBe(true);
    expect(etiquetada.disabled).toBe(true);
    expect(screen.getByText("Ya viene de Etiquetas · 14 cajas")).toBeTruthy();
    // La factura SIN etiqueta sigue como siempre: se puede marcar.
    expect(libre.disabled).toBe(false);
  });

  it("todavía no marcada: igual bloqueada, y dice dónde se marca", async () => {
    render(<SelectorHarness />);
    await asentar();
    await elegirCliente(NOVA.nombre);
    expect(casillas()[0].disabled).toBe(true);
    expect(screen.getByText("Se marca en Etiquetas · 14 cajas")).toBeTruthy();
  });

  it("🔴 y tocarla no hace nada: el freno no es solo el `disabled` que se ve", async () => {
    render(<SelectorHarness />);
    await asentar();
    await elegirCliente(NOVA.nombre);
    fireEvent.click(casillas()[0]);
    await asentar();
    expect(casillas()[0].checked).toBe(false);
  });

  it("sin etiquetas (sin migración, sin red) la pantalla es EXACTAMENTE la de siempre", async () => {
    render(<SelectorHarness etiquetas={[]} />);
    await asentar();
    await elegirCliente(NOVA.nombre);
    for (const c of casillas()) expect(c.disabled).toBe(false);
    expect(screen.queryByText(/viene de Etiquetas/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Y al revés: lo que marcó el selector no se vuelve a marcar en Etiquetas
// ─────────────────────────────────────────────────────────────────────────────

function PendientesHarness({ itemsIniciales }: { itemsIniciales?: GuiaItem[] }) {
  const [items, setItems] = useState<GuiaItem[]>(itemsIniciales ?? [filaVacia()]);
  return (
    <EtiquetasPendientes
      items={items}
      etiquetas={[ETIQUETA]}
      onReemplazarItems={(next) => setItems(next.map((it, i) => ({ ...it, orden: i + 1, uid: it.uid ?? `n${i}` })))}
    />
  );
}

describe("🔴 2. en «Facturas etiquetadas pendientes», la que ya tomó el selector sale BLOQUEADA", () => {
  it("la factura ya puesta por el selector: casilla apagada, y dice dónde está", () => {
    // El renglón que deja el SELECTOR: la factura, sin las 14 cajas.
    const delSelector: GuiaItem = {
      uid: "s", orden: 1, cliente: NOVA.nombre, cliente_codigo: NOVA.codigo,
      direccion: "", empresa: "Fashion Shoes", facturas: "11-000002558", bultos: 0,
      numero_guia_transp: "",
    };
    render(<PendientesHarness itemsIniciales={[delSelector]} />);
    const casilla = casillas()[0];
    expect(casilla.disabled).toBe(true);
    expect(screen.getByText(/Ya está marcada abajo/)).toBeTruthy();
  });

  it("libre: se marca, suma sus 14 bultos, y se puede desmarcar", () => {
    render(<PendientesHarness />);
    expect(casillas()[0].disabled).toBe(false);
    fireEvent.click(casillas()[0]);
    expect(casillas()[0].checked).toBe(true);
    fireEvent.click(casillas()[0]);
    expect(casillas()[0].checked).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Corregir bultos abre «Reimprimir»
// ─────────────────────────────────────────────────────────────────────────────

function servirEtiquetas(etiquetas: EtiquetaFila[], alCorregir?: (cajas: number) => EtiquetaFila) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (/\/api\/guias\/etiquetas\/\d+$/.test(u) && init?.method === "PATCH") {
        const cajas = JSON.parse(String(init.body)).cajas as number;
        return { ok: true, status: 200, json: async () => ({ ok: true, etiqueta: alCorregir ? alCorregir(cajas) : { ...etiquetas[0], cajas } }) } as unknown as Response;
      }
      if (u.startsWith("/api/guias/etiquetas")) {
        return { ok: true, status: 200, json: async () => ({ etiquetas }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }),
  );
}

describe("🔴 3. corregir los bultos lleva directo a reimprimir el juego completo", () => {
  it("guardar 16 abre «Reimprimir» y DICE que las etiquetas impresas quedaron mal", async () => {
    servirEtiquetas([ETIQUETA]);
    render(<EtiquetasView />);
    await waitFor(() => expect(screen.getByText("11-000002558")).toBeTruthy());

    fireEvent.click((await screen.findAllByRole("button", { name: /Más opciones/ }))[0]);
    const items = await screen.findAllByRole("menuitem");
    fireEvent.click(items[1]); // Corregir bultos
    expect(await screen.findByText("Corregir bultos")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Cuántas cajas"), { target: { value: "16" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText(/Reimprimir · 11-000002558/)).toBeTruthy();
    expect(screen.getByText(/Eran 14 cajas y ahora son 16/)).toBeTruthy();
    expect(screen.getAllByText(/juego completo/i).length).toBeGreaterThan(0);
    // 🔴 Y abre con el JUEGO COMPLETO elegido, no con «una sola caja».
    const opciones = screen.getAllByRole("radio");
    expect(opciones[0].getAttribute("aria-checked")).toBe("true");
    expect(opciones[1].getAttribute("aria-checked")).toBe("false");
    // El juego completo ya son las 16, no las 14 viejas.
    expect(screen.getByText("Las 16 etiquetas.")).toBeTruthy();
  });

  it("sin cambiar el número no se inventa un aviso", async () => {
    servirEtiquetas([ETIQUETA]);
    render(<EtiquetasView />);
    await waitFor(() => expect(screen.getByText("11-000002558")).toBeTruthy());
    fireEvent.click((await screen.findAllByRole("button", { name: /Más opciones/ }))[0]);
    fireEvent.click((await screen.findAllByRole("menuitem"))[1]);
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));
    expect(await screen.findByText(/Reimprimir · 11-000002558/)).toBeTruthy();
    expect(screen.queryByText(/quedaron mal/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 y 5 · El panel de etiquetar: sin las ya etiquetadas, y el copy de Switch
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 4. el selector para etiquetar no muestra las ya etiquetadas", () => {
  function servirTodo(etiquetas: EtiquetaFila[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.startsWith("/api/guias/facturas-cliente")) {
          return { ok: true, json: async () => ({ facturas: FACTURAS, hasta: null }) } as unknown as Response;
        }
        if (u.startsWith("/api/guias/etiquetas")) {
          return { ok: true, status: 200, json: async () => ({ etiquetas }) } as unknown as Response;
        }
        if (u.startsWith("/api/guias/frecuencias") || u.startsWith("/api/clientes")) {
          return { ok: true, json: async () => ({ clientes: [NOVA], empresas: [], destinos: {}, definidos: {} }) } as unknown as Response;
        }
        return { ok: true, json: async () => ({}) } as unknown as Response;
      }),
    );
  }

  async function abrirPanel(etiquetas: EtiquetaFila[]) {
    servirTodo(etiquetas);
    render(<EtiquetasView />);
    fireEvent.click(await screen.findByRole("button", { name: /Etiquetar una factura/ }));
    const campo = document.getElementById("etiquetas-cliente") as HTMLInputElement;
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "Nova" } });
    const opcion = await screen.findByText(NOVA.nombre, { selector: "[data-desplegable] *" });
    fireEvent.mouseDown(opcion.closest("button") ?? opcion);
    await asentar();
  }

  it("la etiquetada no sale, la otra sí, y se DICE cuántas se escondieron", async () => {
    await abrirPanel([ETIQUETA]);
    expect(screen.queryByText("11-000002558")).toBeNull();
    expect(screen.getByText("11-000002559")).toBeTruthy();
    expect(
      screen.getByText("1 factura de este cliente ya está etiquetada — mírala en la lista"),
    ).toBeTruthy();
  });

  it("sin etiquetas salen las dos y no se dice nada de escondidas", async () => {
    await abrirPanel([]);
    expect(screen.getByText("11-000002558")).toBeTruthy();
    expect(screen.getByText("11-000002559")).toBeTruthy();
    expect(screen.queryByText(/ya está etiquetada/)).toBeNull();
  });

  it("🔴 5. el copy de Switch es el que dictó Daniel, letra por letra", async () => {
    await abrirPanel([ETIQUETA]);
    expect(screen.getByText("¿No aparece la factura de hoy? Tráela de Switch")).toBeTruthy();
    expect(screen.queryByText(/entra una vez al día/)).toBeNull();
  });
});
