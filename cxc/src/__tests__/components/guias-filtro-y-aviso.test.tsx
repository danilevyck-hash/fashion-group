/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GUÍAS — CANDADO DE CONDUCTA: el chip que apaga el filtro y el aviso que de
 * verdad lleva a la guía (11-sep-2026).
 *
 * 🔴 Se RENDERIZA la lista y se lee el DOM. Un barrido de texto no puede ver si
 * un chip se dibuja ni si un clic limpió el buscador — y en este repo los
 * barridos ya pasaron estando mutados porque el comentario que explica el
 * cambio contiene lo que el barrido busca.
 *
 * ⚠️ El reloj va FIJO: `GuiasList` resuelve su ventana de 30 días con
 * `new Date()` adentro, y un test que mide contra el calendario caduca solo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import GuiasList from "@/app/guias/components/GuiasList";
import type { Guia } from "@/app/guias/components/types";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-11T17:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function guia(over: Partial<Guia> = {}): Guia {
  return {
    id: "g240",
    numero: 240,
    fecha: "2026-09-05",
    transportista: "Edwin",
    modo_entrega: "transportista",
    transportista_id: "t1",
    placa: "EK0700",
    observaciones: "",
    total_bultos: 12,
    item_count: 1,
    estado: "Completada",
    entregado_por: "Julio",
    receptor_nombre: "",
    cedula: "",
    numero_guia_transp: "725",
    guia_items: [
      { id: "i1", orden: 1, cliente: "Sporting Shoes", cliente_codigo: "D-142", direccion: "Los Andes", empresa: "Fashion Wear", facturas: "2520", bultos: 12, numero_guia_transp: "725" },
    ],
    ...over,
  } as Guia;
}

interface Espias {
  setSearch: ReturnType<typeof vi.fn<(v: string) => void>>;
  setShowPending: ReturnType<typeof vi.fn<(v: boolean) => void>>;
  onToggleExpand: ReturnType<typeof vi.fn<(id: string) => void>>;
  onDespachar: ReturnType<typeof vi.fn<(id: string) => void>>;
}

function pintar(
  guias: Guia[],
  opciones: { search?: string; showPending?: boolean } = {},
): Espias {
  const espias: Espias = {
    setSearch: vi.fn<(v: string) => void>(),
    setShowPending: vi.fn<(v: boolean) => void>(),
    onToggleExpand: vi.fn<(id: string) => void>(),
    onDespachar: vi.fn<(id: string) => void>(),
  };
  render(
    <GuiasList
      guias={guias}
      loading={false}
      error={null}
      search={opciones.search ?? ""}
      setSearch={espias.setSearch}
      showPending={opciones.showPending ?? false}
      setShowPending={espias.setShowPending}
      role="admin"
      onNewGuia={() => {}}
      expandedId={null}
      expandedGuia={null}
      expandedLoading={false}
      onToggleExpand={espias.onToggleExpand}
      onEditar={() => {}}
      onDespachar={espias.onDespachar}
      onDelete={() => {}}
    />,
  );
  return espias;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el filtro «solo pendientes» se ve y se apaga", () => {
  it("sin filtro no hay chip: nada de un rótulo que sale siempre", () => {
    pintar([guia()]);
    expect(screen.queryByText(/Solo pendientes/)).toBeNull();
  });

  it("con el filtro puesto, el chip lo DICE", () => {
    pintar([guia(), guia({ id: "g241", numero: 241, estado: "Pendiente Bodega" })], {
      showPending: true,
    });
    expect(screen.getByText("Solo pendientes")).toBeTruthy();
  });

  it("🔴 tocarlo apaga el filtro y limpia la dirección", () => {
    window.history.replaceState(null, "", "/guias?pendientes=1");
    const espias = pintar([guia({ estado: "Pendiente Bodega" })], { showPending: true });
    fireEvent.click(screen.getByText("Solo pendientes"));
    expect(espias.setShowPending).toHaveBeenCalledWith(false);
    expect(window.location.search).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el aviso de arriba lleva a la guía", () => {
  const pendiente = () =>
    guia({ id: "gp", numero: 239, fecha: "2026-09-01", estado: "Pendiente Bodega" });

  it("sin pendientes no hay línea: nada de un cero grande", () => {
    pintar([guia()]);
    expect(screen.queryByText(/sin despachar/)).toBeNull();
  });

  it("con una pendiente, la línea dice cuántas son y desde cuándo", () => {
    pintar([guia(), pendiente()]);
    expect(screen.getByText(/1 guía sin despachar/)).toBeTruthy();
  });

  it("🩸 con algo escrito en el buscador, tocarlo LIMPIA el buscador (antes no hacía nada)", () => {
    const espias = pintar([guia(), pendiente()], { search: "zzz" });
    fireEvent.click(screen.getByText(/1 guía sin despachar/));
    expect(espias.setSearch).toHaveBeenCalledWith("");
    expect(espias.onToggleExpand).toHaveBeenCalledWith("gp");
  });

  it("🩸 una pendiente de más de 30 días abre «Ver guías más viejas» y se dibuja", () => {
    // 2026-07-01 contra el 11-sep: fuera de la ventana de 30 días.
    const vieja = guia({ id: "gv", numero: 100, fecha: "2026-07-01", estado: "Pendiente Bodega" });
    const espias = pintar([guia(), vieja]);
    expect(screen.getByText(/Ver guías más viejas/)).toBeTruthy();
    fireEvent.click(screen.getByText(/1 guía sin despachar/));
    expect(screen.queryByText(/Ver guías más viejas/)).toBeNull();
    expect(espias.onToggleExpand).toHaveBeenCalledWith("gv");
    // Y el buscador NO se toca: no había nada escrito.
    expect(espias.setSearch).not.toHaveBeenCalled();
  });

  it("con la fila ya a la vista, solo se expande", () => {
    const espias = pintar([guia(), pendiente()]);
    fireEvent.click(screen.getByText(/1 guía sin despachar/));
    expect(espias.setSearch).not.toHaveBeenCalled();
    expect(espias.onToggleExpand).toHaveBeenCalledWith("gp");
  });
});
