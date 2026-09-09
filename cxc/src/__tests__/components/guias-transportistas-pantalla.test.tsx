/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GUÍAS — AGREGAR UN TRANSPORTISTA, RENDERIZADO (9-sep-2026)
 *
 * Daniel: *«Ponme opción en configuración de guía para poder agregar un
 * transportista nuevo.»*
 *
 * Un barrido de texto no puede ver lo único que importa acá: que la tarjeta
 * liste los transportistas con SUS GUÍAS, que quitar salga por DELETE y no
 * borre nada en la pantalla, y que el ＋ del desplegable diga qué hace sin
 * pasar el mouse por encima.
 *
 * Lo que se congela:
 *   1. La tarjeta de Configuración lista los seis con cuántas guías lleva cada
 *      uno, agrega por POST y quita por DELETE (soft delete en el servidor).
 *   2. El repetido no viaja: se dice en pantalla y no se manda nada.
 *   3. El ＋ vive al lado del desplegable, con rótulo VISIBLE, y lo que se
 *      agrega queda ELEGIDO en la guía.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import TransportistasConfig from "@/app/guias/components/TransportistasConfig";
import GuiaForm from "@/app/guias/components/GuiaForm";
import type { GuiaItem } from "@/app/guias/components/types";

/** Lo que la pantalla le pidió al servidor, para poder mirarlo. */
let pedidos: { url: string; method: string; body: string }[] = [];

/** Los seis reales, con las guías medidas contra producción el 9-sep-2026. */
const SEIS = [
  { id: "r", nombre: "RedNblue", activo: true, guias: 53 },
  { id: "b", nombre: "Boston", activo: true, guias: 30 },
  { id: "e", nombre: "Edwin", activo: true, guias: 29 },
  { id: "m", nombre: "Mojica", activo: true, guias: 17 },
  { id: "t", nombre: "Transporte Sol", activo: true, guias: 16 },
  { id: "s", nombre: "Sanjur", activo: true, guias: 14 },
];

beforeEach(() => {
  pedidos = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const u = String(url);
      pedidos.push({ url: u, method: init?.method ?? "GET", body: init?.body ?? "" });
      if (u.startsWith("/api/transportistas?config=1")) {
        return { ok: true, json: async () => ({ lista: SEIS }) };
      }
      return { ok: true, json: async () => ({ ok: true, id: "nuevo" }) };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Guías › Configuración — la tarjeta de transportistas", () => {
  it("lista los seis con CUÁNTAS GUÍAS lleva cada uno", async () => {
    render(<TransportistasConfig onAviso={() => {}} />);
    expect(await screen.findByText("RedNblue")).toBeTruthy();
    // 🔴 El dato que dice si se puede quitar sin dudar.
    expect(screen.getByText("53 guías")).toBeTruthy();
    expect(screen.getByText("14 guías")).toBeTruthy();
    for (const t of SEIS) expect(screen.getByText(t.nombre)).toBeTruthy();
  });

  it("agrega por POST, con el nombre y nada más", async () => {
    render(<TransportistasConfig onAviso={() => {}} />);
    await screen.findByText("RedNblue");
    fireEvent.change(screen.getByLabelText("Transportista nuevo"), {
      target: { value: "  Transportes Chiriquí  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Agregar transportista/i }));
    await waitFor(() => {
      const post = pedidos.find((p) => p.method === "POST");
      expect(post).toBeTruthy();
      expect(post!.url).toBe("/api/transportistas");
      // 🔴 SOLO el nombre, recortado. Nada de teléfono ni campos extra.
      expect(JSON.parse(post!.body)).toEqual({ nombre: "Transportes Chiriquí" });
    });
  });

  it("🔴 el repetido NO viaja: se dice en pantalla y no se manda nada", async () => {
    render(<TransportistasConfig onAviso={() => {}} />);
    await screen.findByText("RedNblue");
    // La misma grafía escrita distinto: clave exacta, jamás por parecido.
    fireEvent.change(screen.getByLabelText("Transportista nuevo"), {
      target: { value: "REDNBLUE" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Agregar transportista/i }));
    expect(await screen.findByText("Ese transportista ya está en la lista")).toBeTruthy();
    expect(pedidos.filter((p) => p.method === "POST")).toEqual([]);
  });

  it("quitar sale por DELETE — la pantalla nunca borra una fila", async () => {
    render(<TransportistasConfig onAviso={() => {}} />);
    await screen.findByText("Mojica");
    fireEvent.click(screen.getByLabelText("Quitar «Mojica» de la lista"));
    // El modal dice en palabras qué cambia y que las guías viejas no cambian.
    expect(screen.getByText(/dejará de ofrecer «Mojica»/)).toBeTruthy();
    expect(screen.getByText(/17 guías que lo usan no cambian/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("confirmar-quitar-transportista"));
    await waitFor(() => {
      const del = pedidos.find((p) => p.method === "DELETE");
      expect(del).toBeTruthy();
      expect(del!.url).toBe("/api/transportistas?id=m");
    });
  });

  it("🔴 el botón «Quitar» se toca en el iPad: 44 px", async () => {
    render(<TransportistasConfig onAviso={() => {}} />);
    await screen.findByText("Mojica");
    const clase = screen.getByLabelText("Quitar «Mojica» de la lista").className;
    expect(clase).toContain("min-h-[44px]");
    expect(clase).toContain("min-w-[44px]");
  });
});

// ─── 3 · el ＋ al lado del desplegable de la guía ────────────────────────────

function fila(): GuiaItem {
  return {
    uid: "a", orden: 1, cliente: "", cliente_codigo: "", direccion: "",
    empresa: "", facturas: "", bultos: 0, numero_guia_transp: "",
  };
}

let agregadosDesdeLaGuia: string[] = [];

function FormHarness({ modo = "transportista" as const }: { modo?: "transportista" | "entrega_directa" }) {
  const [items, setItems] = useState([fila()]);
  return (
    <GuiaForm
      editingId={null}
      formNumero={231}
      fecha="2026-09-09" setFecha={() => {}}
      /* 🔴 Con transportista externo: es cuando se ofrece el desplegable. */
      modoEntrega={modo} setModoEntrega={() => {}}
      transportistaId={null} setTransportistaId={() => {}}
      entregadoPor="Julio" setEntregadoPor={() => {}}
      observaciones="" setObservaciones={() => {}}
      items={items}
      transportistas={[{ id: "r", nombre: "RedNblue", activo: true }]}
      direcciones={["Paso Canoas"]}
      validationErrors={new Set()}
      error={null}
      saving={false}
      onAddDireccion={() => {}}
      onAddTransportista={(v) => agregadosDesdeLaGuia.push(v)}
      onUpdateItem={(idx, field, value) =>
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
      }
      onUpdateItemFields={(idx, partial) =>
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...partial } : it)))
      }
      onAddRow={() => {}}
      onRemoveRow={() => {}}
      onRestoreRow={() => {}}
      onSave={() => {}}
      onCancel={() => {}}
    />
  );
}

async function asentar() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("🔴 el ＋ del desplegable «Transportista»", () => {
  beforeEach(() => { agregadosDesdeLaGuia = []; });

  it("se dibuja al lado del desplegable, con rótulo VISIBLE", async () => {
    render(<FormHarness />);
    await asentar();
    const b = screen.getAllByRole("button", { name: /Agregar transportista a la lista/i })[0];
    // ⚠️ El `title` solo aparece pasando el mouse por encima, y en el iPad
    // —donde se arman las guías— no hay mouse: el rótulo tiene que VERSE.
    expect(b.textContent).toMatch(/Agregar transportista/i);
    expect(b.className).toContain("min-h-[44px]");
    expect(b.className).toContain("min-w-[44px]");
  });

  it("escribir un nombre y darle OK lo manda a la lista compartida", async () => {
    render(<FormHarness />);
    await asentar();
    fireEvent.click(screen.getAllByRole("button", { name: /Agregar transportista a la lista/i })[0]);
    fireEvent.change(screen.getAllByLabelText(/Agregar transportista a la lista/i)[0], {
      target: { value: "Transportes Chiriquí" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Guardar" })[0]);
    expect(agregadosDesdeLaGuia).toEqual(["Transportes Chiriquí"]);
  });

  it("CONTROL — en Entrega directa no hay desplegable, así que tampoco ＋", async () => {
    // Es nuestro propio camión: no lleva transportista. Las 63 guías con el
    // transportista vacío de producción son éstas, y están BIEN así.
    render(<FormHarness modo="entrega_directa" />);
    await asentar();
    expect(screen.queryAllByRole("button", { name: /Agregar transportista a la lista/i })).toEqual([]);
  });
});
