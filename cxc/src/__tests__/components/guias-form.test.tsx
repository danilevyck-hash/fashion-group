/**
 * El formulario de guía, renderizado de verdad.
 *
 * Lo que se prueba acá no se puede probar con funciones puras porque son
 * comportamientos de interacción, y son justo los que Daniel reportó:
 *
 *  1. **"Campo obligatorio" en rojo sin haber escrito nada.** El combobox de
 *     empresa abría su desplegable en el `onFocus` y la fila se marcaba como
 *     "tocada" en el `onBlur`: mirar las opciones y cerrarlas dejaba el borde
 *     rojo. Un campo no puede quedar en error por haberlo mirado.
 *  2. **El cliente se guardaba solo.** Tecleaba "city", se iba, y la guía
 *     quedaba con el cliente "city" sin vínculo al directorio. Ahora escribir es
 *     SOLO buscar; el valor cambia únicamente al elegir de la lista o al elegir
 *     "Otro" a propósito.
 *  3. **El rojo saltaba de fila al borrar.** Las marcas iban por posición.
 *
 * Y el riesgo del cambio: una guía vieja con empresa sucia tiene que poder
 * abrirse y guardarse igual.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import GuiaForm from "@/app/guias/components/GuiaForm";
import type { GuiaItem } from "@/app/guias/components/types";
import { quitarFila, restaurarFila } from "@/app/guias/components/guia-form-logic";

const CLIENTES = [
  { codigo: "D-101", nombre: "City Mall" },
  { codigo: "D-170", nombre: "El Machetazo" },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).startsWith("/api/guias/frecuencias")) {
        return { ok: true, json: async () => ({ clientes: CLIENTES, empresas: [] }) };
      }
      if (String(url).startsWith("/api/clientes")) {
        return { ok: true, json: async () => ({ clientes: CLIENTES }) };
      }
      return { ok: false, json: async () => ({}) };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function filaBase(over: Partial<GuiaItem> = {}): GuiaItem {
  return {
    uid: "a", orden: 1, cliente: "", cliente_codigo: "", direccion: "",
    empresa: "", facturas: "", bultos: 0, numero_guia_transp: "", ...over,
  };
}

/** Monta GuiaForm con los items en estado real, para poder borrar filas y escribir. */
function Harness({
  itemsIniciales,
  onItems,
  validationErrors = new Set<string>(),
}: {
  itemsIniciales: GuiaItem[];
  onItems?: (i: GuiaItem[]) => void;
  validationErrors?: Set<string>;
}) {
  const [items, setItems] = useState(itemsIniciales);
  function set(next: GuiaItem[]) { setItems(next); onItems?.(next); }
  return (
    <GuiaForm
      editingId={null}
      formNumero={1}
      fecha="2026-07-27" setFecha={() => {}}
      modoEntrega="entrega_directa" setModoEntrega={() => {}}
      transportistaId={null} setTransportistaId={() => {}}
      entregadoPor="Julio" setEntregadoPor={() => {}}
      observaciones="" setObservaciones={() => {}}
      items={items}
      transportistas={[]}
      direcciones={["David"]}
      validationErrors={validationErrors}
      error={null}
      saving={false}
      onAddDireccion={() => {}}
      onUpdateItem={(idx, field, value) =>
        set(items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
      }
      onUpdateItemFields={(idx, partial) =>
        set(items.map((it, i) => (i === idx ? { ...it, ...partial } : it)))
      }
      onAddRow={() => {}}
      onRemoveRow={(idx) => set(quitarFila(items, idx))}
      onRestoreRow={(idx, f) => set(restaurarFila(items, idx, f))}
      onSave={() => {}}
      onCancel={() => {}}
    />
  );
}

/**
 * El formulario pinta cada campo DOS veces: la tarjeta de móvil ("m") y la tabla
 * de escritorio ("d"). Los id llevan el layout justamente para que no se pisen.
 */
function campos(campo: string, uid: string): HTMLElement[] {
  return (["m", "d"] as const)
    .map((l) => document.getElementById(`${campo}-${uid}-${l}`))
    .filter((e): e is HTMLElement => e !== null);
}
/** El campo tal como lo ve el iPhone (la tarjeta). */
function campo(nombre: string, uid = "a"): HTMLElement {
  const el = document.getElementById(`${nombre}-${uid}-m`);
  expect(el, `${nombre}-${uid}-m`).not.toBeNull();
  return el as HTMLElement;
}
const enRojo = (el: HTMLElement) => el.className.includes("border-red-400");

// ── 1. El rojo prematuro ─────────────────────────────────────────────────────

describe("Nadie queda en rojo por MIRAR un campo", () => {
  it("abrir y cerrar el selector de empresa no deja el campo en error", () => {
    render(<Harness itemsIniciales={[filaBase()]} />);
    const empresa = campo("empresa", "a");
    expect(enRojo(empresa)).toBe(false);

    fireEvent.focus(empresa);
    fireEvent.blur(empresa);

    expect(enRojo(empresa)).toBe(false);
    expect(screen.queryByText("Campo obligatorio")).toBeNull();
  });

  it("entrar y salir de dirección y facturas tampoco los pone en rojo", () => {
    render(<Harness itemsIniciales={[filaBase()]} />);
    for (const id of ["direccion", "facturas", "bultos"]) {
      const el = campo(id);
      fireEvent.focus(el);
      fireEvent.blur(el);
      expect(enRojo(el), id).toBe(false);
    }
    expect(screen.queryByText("Campo obligatorio")).toBeNull();
  });

  it("pero escribir y BORRAR sí lo pone en rojo (ahí el usuario sí lo tocó)", () => {
    render(<Harness itemsIniciales={[filaBase()]} />);
    const dir = campo("direccion", "a");
    fireEvent.change(dir, { target: { value: "David" } });
    fireEvent.change(dir, { target: { value: "" } });
    expect(enRojo(campo("direccion", "a"))).toBe(true);
  });

  it("al guardar, lo que falte se pinta igual aunque nunca se haya tocado", () => {
    render(
      <Harness
        itemsIniciales={[filaBase()]}
        validationErrors={new Set(["item-a-empresa", "item-a-facturas"])}
      />,
    );
    expect(enRojo(campo("empresa", "a"))).toBe(true);
    expect(enRojo(campo("facturas", "a"))).toBe(true);
    expect(enRojo(campo("direccion", "a"))).toBe(false);
  });
});

// ── 2. Cliente cerrado, con la salida a mano EXPLÍCITA ───────────────────────

describe("Cliente · cerrado contra la lista", () => {
  it("teclear NO guarda nada: es solo buscar", async () => {
    const vistos: GuiaItem[][] = [];
    render(<Harness itemsIniciales={[filaBase()]} onItems={(i) => vistos.push(i)} />);

    const input = campo("cliente", "a");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "city" } });
    fireEvent.blur(input);

    // Ni una sola escritura en la fila: antes acá quedaba cliente="city".
    expect(vistos).toEqual([]);
  });

  it("elegir de la lista deja el cliente VINCULADO con su código", async () => {
    const vistos: GuiaItem[][] = [];
    render(<Harness itemsIniciales={[filaBase()]} onItems={(i) => vistos.push(i)} />);

    fireEvent.focus(campo("cliente", "a"));
    const opcion = await screen.findAllByText("City Mall");
    fireEvent.mouseDown(opcion[0]);

    expect(vistos.at(-1)?.[0]).toMatchObject({ cliente: "City Mall", cliente_codigo: "D-101" });
  });

  it("escribir a mano guarda el texto, y hay que elegirlo a propósito", () => {
    const vistos: GuiaItem[][] = [];
    render(<Harness itemsIniciales={[filaBase()]} onItems={(i) => vistos.push(i)} />);

    const input = campo("cliente", "a");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Tienda del barrio" } });

    // 🔑 El rótulo dice que es LA SALIDA, no un cliente más de la lista.
    const salida = screen.getAllByText(/No está en la lista — escribir a mano/)[0];
    fireEvent.mouseDown(salida);

    expect(vistos.at(-1)?.[0]).toMatchObject({ cliente: "Tienda del barrio", cliente_codigo: "" });
  });

  it("sin escribir nada, la salida a mano no se puede elegir — dice qué hacer", () => {
    render(<Harness itemsIniciales={[filaBase()]} />);
    fireEvent.focus(campo("cliente", "a"));
    expect(screen.getAllByText(/Escribe el nombre y elige/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/No está en la lista — escribir a mano/)).toBeNull();
  });

  // 🩸 ACÁ SE EXIGÍA EL SELLO ÁMBAR «A mano» sobre el cliente escrito a mano.
  // Daniel lo mandó sacar el 26-ago-2026 (*"ese sello también sobra"*): en el
  // formulario de una guía hacía que el mismo cliente se leyera dos veces. La
  // distinción SE QUEDA — la hace el CÓDIGO: amarrado lo tiene, a mano no.
  it("un cliente vinculado dice su código; uno a mano no lleva ningún sello", () => {
    cleanup();
    render(<Harness itemsIniciales={[filaBase({ cliente: "City Mall", cliente_codigo: "D-101" })]} />);
    expect(screen.getAllByTitle(/Vinculado al directorio/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("D-101").length).toBeGreaterThan(0);

    cleanup();
    render(<Harness itemsIniciales={[filaBase({ cliente: "Tienda del barrio", cliente_codigo: "" })]} />);
    expect(screen.queryAllByTitle(/Escrito a mano/).length).toBe(0);
    expect(screen.queryByText("A mano")).toBeNull();
    // "Otro" tampoco vuelve: se leía como un cliente más del sistema.
    expect(screen.queryByText("Otro")).toBeNull();
    // El nombre escrito a mano se sigue viendo UNA vez, que es el punto.
    expect(screen.getAllByDisplayValue("Tienda del barrio").length).toBeGreaterThan(0);
  });

  it("cerrar sin elegir devuelve el campo al valor guardado", () => {
    render(<Harness itemsIniciales={[filaBase({ cliente: "City Mall", cliente_codigo: "D-101" })]} />);
    const input = campo("cliente", "a") as HTMLInputElement;
    expect(input.value).toBe("City Mall");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "otra cosa" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect((campo("cliente", "a") as HTMLInputElement).value).toBe("City Mall");
  });

  it('los "más usados" siguen ahí sin teclear (Daniel los usa)', async () => {
    render(<Harness itemsIniciales={[filaBase()]} />);
    fireEvent.focus(campo("cliente", "a"));
    // La lista llega de /api/guias/frecuencias, así que hay que esperarla.
    expect((await screen.findAllByText("Más usados")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("El Machetazo")).length).toBeGreaterThan(0);
  });
});

// ── 3. El rojo no salta de fila al borrar ────────────────────────────────────

describe("Borrar una fila no mueve el rojo a la de al lado", () => {
  it("el error se queda con SU fila aunque cambien los índices", () => {
    render(<Harness itemsIniciales={[filaBase({ uid: "a" }), filaBase({ uid: "b", orden: 2 })]} />);

    // Se ensucia la SEGUNDA fila (escribir y borrar).
    const dirB = campo("direccion", "b");
    fireEvent.change(dirB, { target: { value: "x" } });
    fireEvent.change(dirB, { target: { value: "" } });
    expect(enRojo(campo("direccion", "b"))).toBe(true);
    expect(enRojo(campo("direccion", "a"))).toBe(false);

    // Se borra la PRIMERA: "b" pasa a ser la fila 1.
    fireEvent.click(screen.getAllByRole("button", { name: "Quitar envío 1" })[0]);

    expect(campos("direccion", "a")).toHaveLength(0);
    expect(enRojo(campo("direccion", "b"))).toBe(true);
  });
});

// ── 4. Empresa cerrada, sin romper las guías viejas ──────────────────────────

describe("Empresa · cerrada a las 8, pero las guías viejas se pueden guardar", () => {
  it("solo ofrece las 8 del grupo + el vacío", () => {
    render(<Harness itemsIniciales={[filaBase()]} />);
    const select = campo("empresa", "a") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.options).toHaveLength(9); // "Elegir empresa…" + 8
    expect(Array.from(select.options).map((o) => o.value)).toContain("Fashion Wear");
  });

  it("no se puede escribir a mano: ya no es un input", () => {
    render(<Harness itemsIniciales={[filaBase()]} />);
    expect((campo("empresa", "a") as HTMLElement).tagName).not.toBe("INPUT");
  });

  it("una guía vieja con texto sucio CONSERVA su valor y lo muestra", () => {
    render(<Harness itemsIniciales={[filaBase({ empresa: "VISTANA / FASHION WEAR" })]} />);
    const select = campo("empresa", "a") as HTMLSelectElement;
    expect(select.value).toBe("VISTANA / FASHION WEAR");
    const legacy = Array.from(select.options).find((o) => o.value === "VISTANA / FASHION WEAR");
    expect(legacy?.textContent).toBe("VISTANA / FASHION WEAR (como estaba)");
  });

  it("y se puede reemplazar por una de las 8", () => {
    const vistos: GuiaItem[][] = [];
    render(
      <Harness
        itemsIniciales={[filaBase({ empresa: "VISTANA / FASHION WEAR" })]}
        onItems={(i) => vistos.push(i)}
      />,
    );
    fireEvent.change(campo("empresa", "a"), { target: { value: "Fashion Wear" } });
    expect(vistos.at(-1)?.[0].empresa).toBe("Fashion Wear");
  });
});

// ── 5. Deshacer conserva el vínculo ──────────────────────────────────────────

describe("Deshacer un borrado devuelve la fila ENTERA", () => {
  it("el cliente vuelve vinculado, no como texto suelto", () => {
    const vistos: GuiaItem[][] = [];
    render(
      <Harness
        itemsIniciales={[
          filaBase({ uid: "a", cliente: "City Mall", cliente_codigo: "D-101" }),
          filaBase({ uid: "b", orden: 2, cliente: "El Machetazo", cliente_codigo: "D-170" }),
        ]}
        onItems={(i) => vistos.push(i)}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Quitar envío 1" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));

    const final = vistos.at(-1)!;
    expect(final.map((i) => i.uid)).toEqual(["a", "b"]);
    expect(final[0]).toMatchObject({ cliente: "City Mall", cliente_codigo: "D-101" });
  });
});

// ── 6. Sin scroll de lado en el iPhone ni en el iPad vertical ────────────────

describe("En el iPhone y en el iPad vertical no hay tabla", () => {
  it("la tabla existe solo desde lg (en 390, 768 y 834 px está oculta)", () => {
    const { container } = render(<Harness itemsIniciales={[filaBase()]} />);
    const tabla = container.querySelector("table");
    expect(tabla).not.toBeNull();
    const contenedor = tabla!.closest("div.hidden");
    expect(contenedor?.className).toContain("hidden");
    // `lg` (1024) y no `md` (768): un iPad vertical mide 768 u 834 px y caía del
    // lado de la tabla, con solo 496-562 px útiles para 720 de tabla.
    expect(contenedor?.className).toContain("lg:block");
    expect(contenedor?.className).not.toContain("md:block");
    expect(contenedor?.getAttribute("data-layout")).toBe("tabla");
  });

  it("los campos de la tarjeta móvil son los MISMOS que los de la tabla", () => {
    render(<Harness itemsIniciales={[filaBase()]} />);
    // Cada campo aparece dos veces: una por layout. Si alguien agrega un campo
    // en un solo lado, este número deja de dar 2.
    for (const id of ["cliente", "direccion", "empresa", "facturas", "bultos"]) {
      expect(campos(id, "a"), id).toHaveLength(2);
    }
  });

  it("la tarjeta rotula cada campo (sin encabezado de tabla no hay contexto)", () => {
    const { container } = render(<Harness itemsIniciales={[filaBase()]} />);
    const movil = container.querySelector('div[data-layout="tarjetas"]')!;
    for (const label of ["Cliente", "Dirección", "Empresa", "Factura(s)", "Bultos"]) {
      expect(within(movil as HTMLElement).getAllByText(label, { exact: false }).length, label).toBeGreaterThan(0);
    }
  });
});
