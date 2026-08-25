/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DIRECCIÓN COMO PRIMERA OPCIÓN, Y EL JUEGO DEL TRANSPORTISTA DE UN TOQUE.
 *
 * Los dos son comportamientos de pantalla, así que se prueban PINTANDO y
 * leyendo el DOM. Con funciones puras no se puede ver lo que de verdad importa:
 *
 *  · que la dirección del cliente quede PRIMERA en la lista **y que el campo
 *    siga vacío** — Daniel pidió *«Ponerla sola, pero sí como primera opción»*,
 *    no que se escriba sola;
 *  · que el juego MÁS USADO quede primero y que tocarlo llene los TRES campos.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import GuiaForm from "@/app/guias/components/GuiaForm";
import DespachoForm from "@/app/guias/components/DespachoForm";
import type { GuiaItem } from "@/app/guias/components/types";
import type { JuegoDespacho } from "@/lib/guias/juegos-despacho";

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

// ─────────────────────────────────────────────────────────────────────────────
// Valores REALES de producción, ya agrupados y ordenados por frecuencia.
const JUEGOS: JuegoDespacho[] = [
  { receptor: "Eric", cedula: "8-930", placa: "Ek0700", veces: 10 },
  { receptor: "Jocsan murillo", cedula: "8-918-246", placa: "DG7115", veces: 4 },
  { receptor: "Jose castillo", cedula: "4-803-1102", placa: "Dg7738", veces: 1 },
];

/** DespachoForm con estado real, para ver que el toque llene los tres campos. */
function Despacho({ tipo, juegos }: { tipo: "externo" | "directo"; juegos: JuegoDespacho[] }) {
  const [placa, setPlaca] = useState("");
  const [receptor, setReceptor] = useState("");
  const [cedula, setCedula] = useState("");
  const [chofer, setChofer] = useState("");
  return (
    <DespachoForm
      tipoDespacho={tipo}
      setTipoDespacho={() => {}}
      bPlaca={placa} setBPlaca={setPlaca}
      bReceptor={receptor} setBReceptor={setReceptor}
      bCedula={cedula} setBCedula={setCedula}
      bChofer={chofer} setBChofer={setChofer}
      juegos={juegos}
      onUsarJuego={(j) => { setReceptor(j.receptor); setCedula(j.cedula); setPlaca(j.placa); }}
      bSaving={false}
      onConfirmar={() => {}}
    />
  );
}

describe("🔴 un toque llena los TRES campos", () => {
  const val = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

  it("los que más usa ese transportista se ofrecen con los tres datos", () => {
    render(<Despacho tipo="externo" juegos={JUEGOS} />);
    expect(screen.getByText(/Los que más usa este transportista/i)).toBeTruthy();
    const boton = screen.getByRole("button", { name: /Eric/ });
    expect(boton.textContent).toContain("8-930");
    expect(boton.textContent).toContain("Ek0700");
  });

  it("🔴 el más usado va PRIMERO, y dice cuántas veces", () => {
    render(<Despacho tipo="externo" juegos={JUEGOS} />);
    const botones = screen.getAllByRole("button").filter((b) => /·/.test(b.textContent ?? ""));
    expect(botones[0].textContent).toContain("Eric");
    expect(botones[0].textContent).toContain("10 veces");
    expect(botones[1].textContent).toContain("Jocsan murillo");
    expect(botones[1].textContent).toContain("4 veces");
    // Con una sola vez no se dice "1 veces".
    expect(botones[2].textContent).not.toContain("veces");
  });

  it("tocarlo llena recibido por + cédula + placa de una vez", () => {
    render(<Despacho tipo="externo" juegos={JUEGOS} />);
    fireEvent.click(screen.getByRole("button", { name: /Eric/ }));
    expect(val("despacho-receptor")).toBe("Eric");
    expect(val("despacho-cedula")).toBe("8-930");
    expect(val("despacho-placa")).toBe("Ek0700");
  });

  it("…y los tres siguen siendo editables", () => {
    render(<Despacho tipo="externo" juegos={JUEGOS} />);
    fireEvent.click(screen.getByRole("button", { name: /Eric/ }));
    fireEvent.change(document.getElementById("despacho-placa") as HTMLElement, { target: { value: "EL6433" } });
    expect(val("despacho-placa")).toBe("EL6433");
    expect(val("despacho-receptor")).toBe("Eric");
  });

  it("se puede cambiar de juego: el segundo pisa al primero, entero", () => {
    render(<Despacho tipo="externo" juegos={JUEGOS} />);
    fireEvent.click(screen.getByRole("button", { name: /Eric/ }));
    fireEvent.click(screen.getByRole("button", { name: /Jocsan murillo/ }));
    expect(val("despacho-receptor")).toBe("Jocsan murillo");
    expect(val("despacho-cedula")).toBe("8-918-246");
    expect(val("despacho-placa")).toBe("DG7115");
  });

  it("⚠️ EN ENTREGA DIRECTA NO APARECE: no hay transportista ni placa", () => {
    render(<Despacho tipo="directo" juegos={JUEGOS} />);
    expect(screen.queryByText(/Los que más usa este transportista/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Eric/ })).toBeNull();
  });

  it("sin juegos guardados no se dibuja nada — la pantalla queda como siempre", () => {
    render(<Despacho tipo="externo" juegos={[]} />);
    expect(screen.queryByText(/Los que más usa este transportista/i)).toBeNull();
    expect(val("despacho-placa")).toBe("");
  });

  it("nada queda trabado: se puede despachar escribiendo a mano, sin tocar ningún juego", () => {
    render(<Despacho tipo="externo" juegos={JUEGOS} />);
    fireEvent.change(document.getElementById("despacho-receptor") as HTMLElement, { target: { value: "Alguien nuevo" } });
    expect(val("despacho-receptor")).toBe("Alguien nuevo");
  });

  it("los juegos son tocables de verdad: 44 px de alto mínimo (se usa en el celular)", () => {
    render(<Despacho tipo="externo" juegos={JUEGOS} />);
    const boton = screen.getByRole("button", { name: /Eric/ });
    expect(boton.className).toContain("min-h-[44px]");
  });
});
