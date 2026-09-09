/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GUÍAS — LA LISTA COMPARTIDA Y EL BOTÓN REPETIDO, RENDERIZADO (7-sep-2026)
 *
 * Un barrido de texto no puede ver lo único que importa acá: que el botón
 * repetido DEJE de dibujarse, que el «＋» diga qué hace SIN pasar el mouse, y
 * que agregar un destino salga por la ruta compartida y no por el navegador.
 *
 * Lo que se congela:
 *   1. Un cliente con UN destino ya escrito en el campo → cero botones.
 *      Con varios → salen todos, incluido el que coincide.
 *   2. El «＋» del campo Dirección lleva rótulo VISIBLE (en el iPad no hay
 *      mouse) y lo que se agrega viaja al servidor.
 *   3. Guías › Configuración lista los destinos compartidos y los QUITA por
 *      DELETE (soft delete en el servidor). Nada se borra en la pantalla.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, act, within, waitFor } from "@testing-library/react";
import GuiaForm from "@/app/guias/components/GuiaForm";
import DestinosListaConfig from "@/app/guias/components/DestinosListaConfig";
import type { GuiaItem } from "@/app/guias/components/types";
import { invalidarDirectorioClientes } from "@/lib/hooks/useBusquedaClientes";

const DESTINOS_HISTORICOS = { "D-77": ["David", "Santiago"] };
const DIRECTORIO = [
  { codigo: "D-81", nombre: "Jerusalem Duty Free" },
  { codigo: "D-26", nombre: "City Moda Chorrera" },
  { codigo: "D-77", nombre: "Otro Cliente" },
];

/** Lo que la pantalla le pidió al servidor, para poder mirarlo. */
let pedidos: { url: string; method: string; body: string }[] = [];
let listaDelServidor: { id: number; destino: string; creado_por: string; creado_en: string }[] = [];

beforeEach(() => {
  pedidos = [];
  listaDelServidor = [
    { id: 1, destino: "Paso Canoas", creado_por: "sistema", creado_en: "2026-09-07" },
    { id: 2, destino: "David", creado_por: "sistema", creado_en: "2026-09-07" },
  ];
  invalidarDirectorioClientes();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const u = String(url);
      pedidos.push({ url: u, method: init?.method ?? "GET", body: init?.body ?? "" });
      if (u.startsWith("/api/guias/frecuencias")) {
        return {
          ok: true,
          json: async () => ({ clientes: [], empresas: [], direcciones: {}, destinos: DESTINOS_HISTORICOS }),
        };
      }
      if (u.startsWith("/api/guias/destinos-lista")) {
        return { ok: true, json: async () => ({ lista: listaDelServidor }) };
      }
      if (u.startsWith("/api/clientes")) {
        return { ok: true, json: async () => ({ clientes: DIRECTORIO }) };
      }
      return { ok: false, json: async () => ({}) };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fila(partial: Partial<GuiaItem> = {}, uid = "a"): GuiaItem {
  return {
    uid, orden: 1, cliente: "", cliente_codigo: "", direccion: "",
    empresa: "", facturas: "", bultos: 0, numero_guia_transp: "", ...partial,
  };
}

let direccionesAgregadas: string[] = [];

function Harness({ itemsIniciales }: { itemsIniciales: GuiaItem[] }) {
  const [items, setItems] = useState(itemsIniciales);
  return (
    <GuiaForm
      editingId={null}
      formNumero={231}
      fecha="2026-09-07" setFecha={() => {}}
      modoEntrega="entrega_directa" setModoEntrega={() => {}}
      transportistaId={null} setTransportistaId={() => {}}
      entregadoPor="Julio" setEntregadoPor={() => {}}
      observaciones="" setObservaciones={() => {}}
      items={items}
      transportistas={[]}
      direcciones={["Paso Canoas", "David"]}
      validationErrors={new Set()}
      error={null}
      saving={false}
      onAddDireccion={(v) => direccionesAgregadas.push(v)}
      onAddTransportista={() => {}}
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

const tarjetas = () => within(document.querySelector('[data-layout="tarjetas"]') as HTMLElement);

// ─── 1 · el destino repetido no se dibuja ────────────────────────────────────

describe("🔴 1. el botón que dice lo mismo que el campo no se dibuja", () => {
  // Daniel: *«si el cliente tiene un solo destino y ya está escrito en el
  // campo, no dibujar el botón. No ofrece nada.»* Le pasó con «Paso Canoas».
  it("UN solo destino, ya escrito → no hay botón", async () => {
    render(
      <Harness
        itemsIniciales={[
          fila({ cliente: "Jerusalem Duty Free", cliente_codigo: "D-81", direccion: "Paso Canoas" }),
        ]}
      />,
    );
    await asentar();
    expect(tarjetas().queryByRole("button", { name: "Paso Canoas" })).toBeNull();
  });

  it("CONTROL — el mismo cliente con el campo VACÍO sí muestra su botón", async () => {
    render(
      <Harness itemsIniciales={[fila({ cliente: "Jerusalem Duty Free", cliente_codigo: "D-81" })]} />,
    );
    await asentar();
    expect(tarjetas().getByRole("button", { name: "Paso Canoas" })).toBeTruthy();
  });

  it("⚠️ con VARIOS destinos salen TODOS, incluido el que ya está escrito", async () => {
    // D-26 (City Moda Chorrera) tiene dos: «Sport Corner Calidonia» y «Chorrera».
    render(
      <Harness
        itemsIniciales={[
          fila({ cliente: "City Moda Chorrera", cliente_codigo: "D-26", direccion: "Chorrera" }),
        ]}
      />,
    );
    await asentar();
    expect(tarjetas().getByRole("button", { name: "Chorrera" })).toBeTruthy();
    expect(tarjetas().getByRole("button", { name: "Sport Corner Calidonia" })).toBeTruthy();
  });
});

// ─── 2 · el «＋» dice qué hace, y guarda para todos ──────────────────────────

describe("🔴 2. el ＋ del campo Dirección", () => {
  it("lleva rótulo VISIBLE: en el iPad no hay mouse y el title no se ve", async () => {
    render(<Harness itemsIniciales={[fila()]} />);
    await asentar();
    const b = screen.getAllByRole("button", { name: /Agregar destino a la lista/i })[0];
    expect(b.textContent).toMatch(/Agregar destino/i);
    expect(b.className).toContain("min-h-[44px]");
  });

  it("dice que la lista es del EQUIPO, no de este navegador", async () => {
    render(<Harness itemsIniciales={[fila()]} />);
    await asentar();
    const b = screen.getAllByRole("button", { name: /Agregar destino a la lista/i })[0];
    expect(b.getAttribute("aria-label")).toMatch(/todo el equipo/i);
  });
});

// ─── 3 · Guías › Configuración: la lista compartida ──────────────────────────

describe("🔴 3. Guías › Configuración lista, agrega y QUITA", () => {
  it("muestra lo que hay en la base y dice que la ve todo el equipo", async () => {
    render(<DestinosListaConfig onAviso={() => {}} />);
    await waitFor(() => expect(screen.getByText("Paso Canoas")).toBeTruthy());
    expect(screen.getByText("David")).toBeTruthy();
    expect(screen.getByText(/La ve todo el equipo/i)).toBeTruthy();
  });

  it("agregar viaja al servidor por POST — no al navegador", async () => {
    render(<DestinosListaConfig onAviso={() => {}} />);
    await waitFor(() => expect(screen.getByText("Paso Canoas")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Destino nuevo"), { target: { value: "Aguadulce" } });
    fireEvent.click(screen.getByRole("button", { name: /Agregar destino/i }));
    await waitFor(() =>
      expect(
        pedidos.some((p) => p.url.startsWith("/api/guias/destinos-lista") && p.method === "POST"),
      ).toBe(true),
    );
    const post = pedidos.find((p) => p.method === "POST")!;
    expect(JSON.parse(post.body)).toEqual({ destino: "Aguadulce" });
  });

  it("🔴 el repetido no viaja: se dice y ya está", async () => {
    render(<DestinosListaConfig onAviso={() => {}} />);
    await waitFor(() => expect(screen.getByText("Paso Canoas")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Destino nuevo"), { target: { value: "PASO CANOAS" } });
    fireEvent.click(screen.getByRole("button", { name: /Agregar destino/i }));
    await waitFor(() => expect(screen.getByText("Ese destino ya está en la lista")).toBeTruthy());
    expect(pedidos.some((p) => p.method === "POST")).toBe(false);
  });

  it("🔴 QUITAR existe, confirma en palabras y sale por DELETE", async () => {
    render(<DestinosListaConfig onAviso={() => {}} />);
    await waitFor(() => expect(screen.getByText("Paso Canoas")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Quitar «Paso Canoas» de la lista/i }));
    // La confirmación dice qué cambia y que nada se borra.
    expect(screen.getByText(/dejará de ofrecer «Paso Canoas» a todo el equipo/i)).toBeTruthy();
    expect(screen.getByText(/nada se borra/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId("confirmar-quitar-lista"));
    await waitFor(() =>
      expect(pedidos.some((p) => p.method === "DELETE" && p.url.includes("id=1"))).toBe(true),
    );
  });
});
