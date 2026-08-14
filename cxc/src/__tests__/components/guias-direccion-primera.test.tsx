/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DIRECCIÓN DEL CLIENTE COMO PRIMERA OPCIÓN.
 *
 * Es un comportamiento de pantalla, así que se prueba PINTANDO y leyendo el
 * DOM. Con funciones puras no se puede ver lo que de verdad importa: que la
 * dirección del cliente quede PRIMERA en la lista **y que el campo siga
 * vacío** — Daniel pidió *«Ponerla sola, pero sí como primera opción»*, no que
 * se escriba sola.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import GuiaForm from "@/app/guias/components/GuiaForm";
import type { GuiaItem } from "@/app/guias/components/types";

const DIRECCIONES_BASE = ["David", "Paso Canoas", "Santiago", "Changinola"];
// Medido en producción: D-25 (City Mall Paso Canoa) despacha siempre a Paso
// Canoas; 37 de los 47 clientes atados tienen UNA SOLA dirección en su historia.
const DIRECCION_POR_CLIENTE = { "D-25": "Paso Canoas" };

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).startsWith("/api/guias/frecuencias")) {
        return {
          ok: true,
          json: async () => ({ clientes: [], empresas: [], direcciones: DIRECCION_POR_CLIENTE }),
        };
      }
      return { ok: true, json: async () => ({}) };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fila(over: Partial<GuiaItem> = {}): GuiaItem {
  return {
    uid: "a", orden: 1, cliente: "", cliente_codigo: "", direccion: "",
    empresa: "", facturas: "", bultos: 0, numero_guia_transp: "", ...over,
  };
}

function montarForm(items: GuiaItem[]) {
  return render(
    <GuiaForm
      editingId={null}
      formNumero={1}
      fecha="2026-08-14"
      setFecha={() => {}}
      modoEntrega="transportista"
      setModoEntrega={() => {}}
      transportistaId={null}
      setTransportistaId={() => {}}
      entregadoPor=""
      setEntregadoPor={() => {}}
      observaciones=""
      setObservaciones={() => {}}
      numeroGuiaTransp=""
      setNumeroGuiaTransp={() => {}}
      items={items}
      transportistas={[]}
      direcciones={DIRECCIONES_BASE}
      validationErrors={new Set()}
      error={null}
      saving={false}
      onAddDireccion={() => {}}
      onUpdateItem={() => {}}
      onUpdateItemFields={() => {}}
      onAddRow={() => {}}
      onRemoveRow={() => {}}
      onRestoreRow={() => {}}
      onSave={() => {}}
      onCancel={() => {}}
    />,
  );
}

/** Los campos de dirección que hay en pantalla (tarjeta en móvil, tabla en escritorio). */
function camposDireccion(container: HTMLElement): HTMLInputElement[] {
  return [...container.querySelectorAll("input")].filter((i) =>
    (i.getAttribute("list") ?? "").startsWith("direcciones-list"),
  ) as HTMLInputElement[];
}

/** Las opciones de la lista que ESE campo de dirección tiene enganchada. */
function opcionesDeLaFila(container: HTMLElement): string[] {
  const input = camposDireccion(container)[0];
  if (!input) return [];
  const id = input.getAttribute("list") ?? "";
  const lista = [...container.querySelectorAll("datalist")].find((d) => d.id === id);
  return [...(lista?.querySelectorAll("option") ?? [])].map((o) => o.getAttribute("value") ?? "");
}

describe("🔴 la dirección del cliente aparece PRIMERA en la lista", () => {
  it("con el cliente atado, su última dirección encabeza las sugerencias", async () => {
    const { container } = montarForm([fila({ cliente: "CITY MALL PASO CANOA", cliente_codigo: "D-25" })]);
    await waitFor(() => {
      expect(opcionesDeLaFila(container)[0]).toBe("Paso Canoas");
    });
  });

  it("…y la lista de siempre no se pierde: se puede elegir cualquier otra", async () => {
    const { container } = montarForm([fila({ cliente: "CITY MALL PASO CANOA", cliente_codigo: "D-25" })]);
    await waitFor(() => {
      const opciones = opcionesDeLaFila(container);
      for (const d of DIRECCIONES_BASE) expect(opciones).toContain(d);
      // Y no la repite abajo.
      expect(opciones.filter((o) => o === "Paso Canoas")).toHaveLength(1);
    });
  });

  it("🔑 EL CAMPO SIGUE VACÍO: se ofrece, no se escribe sola", async () => {
    const { container } = montarForm([fila({ cliente: "CITY MALL PASO CANOA", cliente_codigo: "D-25" })]);
    await waitFor(() => {
      expect(opcionesDeLaFila(container)[0]).toBe("Paso Canoas");
    });
    const inputs = camposDireccion(container);
    expect(inputs.length).toBeGreaterThan(0);
    for (const i of inputs) expect(i.value).toBe("");
  });

  it("🔑 Y EL CAMPO SIGUE SIENDO EDITABLE, sin trabar nada", async () => {
    const cambios: string[] = [];
    const { container } = render(
      <GuiaForm
        editingId={null} formNumero={1} fecha="2026-08-14" setFecha={() => {}}
        modoEntrega="transportista" setModoEntrega={() => {}} transportistaId={null} setTransportistaId={() => {}}
        entregadoPor="" setEntregadoPor={() => {}} observaciones="" setObservaciones={() => {}}
        numeroGuiaTransp="" setNumeroGuiaTransp={() => {}}
        items={[fila({ cliente: "CITY MALL PASO CANOA", cliente_codigo: "D-25" })]}
        transportistas={[]} direcciones={DIRECCIONES_BASE} validationErrors={new Set()} error={null} saving={false}
        onAddDireccion={() => {}}
        onUpdateItem={(_i, campo, valor) => { if (campo === "direccion") cambios.push(String(valor)); }}
        onUpdateItemFields={() => {}} onAddRow={() => {}} onRemoveRow={() => {}} onRestoreRow={() => {}}
        onSave={() => {}} onCancel={() => {}}
      />,
    );
    const input = camposDireccion(container)[0];
    fireEvent.change(input, { target: { value: "Chitré" } });
    expect(cambios).toContain("Chitré");
  });

  it("sin cliente del directorio, la lista es la de siempre", async () => {
    const { container } = montarForm([fila({ cliente: "ALMACEN JORDANIA", cliente_codigo: "" })]);
    await waitFor(() => {
      expect(opcionesDeLaFila(container)).toEqual(DIRECCIONES_BASE);
    });
  });

  it("un cliente sin historia de direcciones tampoco cambia nada", async () => {
    const { container } = montarForm([fila({ cliente: "GRUPO HANNA", cliente_codigo: "D-68" })]);
    await waitFor(() => {
      expect(opcionesDeLaFila(container)).toEqual(DIRECCIONES_BASE);
    });
  });
});
