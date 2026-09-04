/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GUÍAS › formulario — los DESTINOS del cliente como botones, RENDERIZADO.
 *
 * Se monta GuiaForm de verdad y se tocan los botones — un barrido de texto no
 * puede ver lo único que importa aquí (que el botón LLENE el campo al tocarlo y
 * SOLO al tocarlo, que el campo siga siendo texto libre, que con la constante
 * apagada la pantalla sea EXACTAMENTE la de hoy), y en este repo ese barrido
 * ya se cumplió cuatro veces con su propio comentario.
 *
 * Lo que se congela (4-sep-2026):
 *   1. Tocar un botón llena el campo Dirección; se puede escribir encima.
 *   2. 🔁 CAMBIÓ DE DIRECCIÓN el 4-sep-2026 (mismo día, al probarlo Daniel):
 *      con UN solo destino — DEFINIDO por Daniel o único en la historia
 *      AGRUPADA — el campo SÍ se llena al ELEGIR el cliente. Daniel quitó su
 *      propia regla del 14-ago: «"la dirección no se escribe sola" me refería
 *      a que el usuario no lo haga para no escribirlo mal como lo vimos,
 *      quita esa regla. Que se autollene como lo discutimos antes.» Lo que
 *      sigue prohibido, y acá se exige: nada se llena en el RENDER de una
 *      fila ya cargada, lo escrito no se pisa, con VARIOS destinos no se
 *      llena nada, y el pareo por parecido no existe.
 *   3. Sporting Shoes (D-142) muestra sus 8 destinos; al tocar «Westland»
 *      aparecen las tiendas usadas (5 · 6 · 14 · Mas Flow · «+ otra») y tocar
 *      «6» compone «Westland · tienda 6».
 *   4. Cliente sin historia ni definición → cero botones (como hoy).
 *   5. CONTROL — una guía Completada (soloCorregible) no muestra nada de esto.
 *   6. CONTROL — con `GUIAS_ATAJOS_NUEVOS = false` no hay botones y escribir a
 *      mano funciona igual que hoy.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import GuiaForm from "@/app/guias/components/GuiaForm";
import type { GuiaItem } from "@/app/guias/components/types";
import { invalidarDirectorioClientes } from "@/lib/hooks/useBusquedaClientes";

// 🔴 El MISMO interruptor del panel de facturas, controlable por test: el resto
// del módulo es el REAL.
let atajosEncendidos = true;
vi.mock("@/lib/guias/atajos-facturas", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/guias/atajos-facturas")>();
  return {
    ...real,
    get GUIAS_ATAJOS_NUEVOS() {
      return atajosEncendidos;
    },
  };
});

/** Historia de clientes que NO están entre los definidos — D-14 (Bouti, S.A.)
 *  tiene UN solo destino histórico: el caso real que preguntó Daniel, y desde
 *  el 4-sep-2026 TAMBIÉN autollena. */
const DESTINOS_HISTORICOS = { "D-77": ["David", "Santiago"], "D-14": ["David"] };

/** El directorio que ve el selector, para ELEGIR clientes de verdad. */
const DIRECTORIO = [
  { codigo: "D-81", nombre: "Jerusalem Duty Free" },
  { codigo: "D-142", nombre: "Sporting Shoes N 4" },
  { codigo: "D-26", nombre: "City Moda Chorrera" },
  { codigo: "D-14", nombre: "Bouti, S.A." },
  { codigo: "D-77", nombre: "Otro Cliente" },
];

beforeEach(() => {
  atajosEncendidos = true;
  invalidarDirectorioClientes();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.startsWith("/api/guias/frecuencias")) {
        return {
          ok: true,
          json: async () => ({ clientes: [], empresas: [], direcciones: {}, destinos: DESTINOS_HISTORICOS }),
        };
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

let itemsCapturados: GuiaItem[];

function Harness({
  itemsIniciales,
  soloCorregible = false,
}: {
  itemsIniciales: GuiaItem[];
  soloCorregible?: boolean;
}) {
  const [items, setItems] = useState(itemsIniciales);
  itemsCapturados = items;
  return (
    <GuiaForm
      editingId={soloCorregible ? "uuid-1" : null}
      formNumero={231}
      fecha="2026-09-04" setFecha={() => {}}
      modoEntrega="entrega_directa" setModoEntrega={() => {}}
      transportistaId={null} setTransportistaId={() => {}}
      entregadoPor="Julio" setEntregadoPor={() => {}}
      observaciones="" setObservaciones={() => {}}
      items={items}
      transportistas={[]}
      direcciones={[]}
      validationErrors={new Set()}
      error={null}
      saving={false}
      soloCorregible={soloCorregible}
      onAddDireccion={() => {}}
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

/** Deja que termine el fetch de frecuencias. */
async function asentar() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** El layout de tarjetas (móvil) — el otro es el mismo DOM escondido por CSS. */
const tarjetas = () => within(document.querySelector('[data-layout="tarjetas"]') as HTMLElement);
const campoDireccion = () => document.getElementById("direccion-a-m") as HTMLInputElement;

describe("el atajo encendido", () => {
  it("tocar un botón llena el campo Dirección", async () => {
    render(<Harness itemsIniciales={[fila({ cliente: "City Mall Paso Canoa", cliente_codigo: "D-25" })]} />);
    await asentar();
    fireEvent.click(tarjetas().getByRole("button", { name: "Paso Canoas" }));
    expect(campoDireccion().value).toBe("Paso Canoas");
    expect(itemsCapturados[0].direccion).toBe("Paso Canoas");
  });

  it("🔁 el RENDER de una fila ya cargada no escribe nada — el pre-llenado vive en el acto de ELEGIR, no en dibujar", async () => {
    // 🔁 Este caso cambió de dirección el 4-sep-2026: antes exigía que el
    // destino definido único NUNCA se llenara solo; Daniel acotó esa decisión
    // («sí quiero que se llene sola…») y hoy se llena AL ELEGIR el cliente
    // (ver el describe de abajo). Lo que este caso sigue prohibiendo — y es
    // la mitad que no se aflojó — es que DIBUJAR una fila que ya venía con su
    // cliente (un borrador, una guía pendiente cargada) escriba la dirección:
    // eso sí sería «escribirse sola», sin ninguna elección de la persona.
    render(<Harness itemsIniciales={[fila({ cliente: "Jerusalem Duty Free", cliente_codigo: "D-81" })]} />);
    await asentar();
    // El botón está a la vista…
    expect(tarjetas().getByRole("button", { name: "Paso Canoas" })).toBeTruthy();
    // …y el campo sigue VACÍO hasta que alguien elija o toque.
    expect(campoDireccion().value).toBe("");
    expect(itemsCapturados[0].direccion).toBe("");
  });

  it("se puede escribir encima de lo que puso el botón — el campo sigue siendo texto libre", async () => {
    render(<Harness itemsIniciales={[fila({ cliente: "City Mall Paso Canoa", cliente_codigo: "D-25" })]} />);
    await asentar();
    fireEvent.click(tarjetas().getByRole("button", { name: "Paso Canoas" }));
    fireEvent.change(campoDireccion(), { target: { value: "Bodega del cliente, David" } });
    expect(itemsCapturados[0].direccion).toBe("Bodega del cliente, David");
  });

  it("Sporting Shoes (D-142): los 8 destinos, las tiendas usadas y «Westland · tienda 6»", async () => {
    render(<Harness itemsIniciales={[fila({ cliente: "Sporting Shoes N 4", cliente_codigo: "D-142" })]} />);
    await asentar();

    for (const d of ["Westland", "Albrook", "Los Andes", "Santiago", "Penonomé", "Metromall", "Megamall", "Outlet Vía España"]) {
      expect(tarjetas().getByRole("button", { name: d })).toBeTruthy();
    }
    // Sin destino elegido, el renglón de tiendas no aparece.
    expect(tarjetas().queryByTestId("destinos-tiendas")).toBeNull();

    fireEvent.click(tarjetas().getByRole("button", { name: "Westland" }));
    expect(campoDireccion().value).toBe("Westland");

    // Las tiendas ya usadas de Westland, más «+ otra».
    const tiendasRow = tarjetas().getByTestId("destinos-tiendas");
    for (const t of ["5", "6", "14", "Mas Flow", "+ otra"]) {
      expect(within(tiendasRow).getByRole("button", { name: t })).toBeTruthy();
    }

    fireEvent.click(within(tiendasRow).getByRole("button", { name: "6" }));
    expect(campoDireccion().value).toBe("Westland · tienda 6");
    expect(itemsCapturados[0].direccion).toBe("Westland · tienda 6");
  });

  it("«+ otra» deja escribir una tienda nueva y la compone igual", async () => {
    render(<Harness itemsIniciales={[fila({ cliente: "Sporting Shoes N 4", cliente_codigo: "D-142" })]} />);
    await asentar();
    fireEvent.click(tarjetas().getByRole("button", { name: "Albrook" }));
    fireEvent.click(within(tarjetas().getByTestId("destinos-tiendas")).getByRole("button", { name: "+ otra" }));
    const campoTienda = tarjetas().getByLabelText("Otra tienda") as HTMLInputElement;
    fireEvent.change(campoTienda, { target: { value: "12" } });
    fireEvent.keyDown(campoTienda, { key: "Enter" });
    expect(campoDireccion().value).toBe("Albrook · tienda 12");
  });

  it("un cliente que no está definido usa su historia, en orden", async () => {
    render(<Harness itemsIniciales={[fila({ cliente: "Otro Cliente", cliente_codigo: "D-77" })]} />);
    await asentar();
    const zona = tarjetas().getByTestId("destinos-del-cliente");
    const botones = within(zona).getAllByRole("button").map((b) => b.textContent);
    expect(botones).toEqual(["David", "Santiago"]);
  });

  it("cliente sin historia ni definición → cero botones, campo vacío como hoy", async () => {
    render(<Harness itemsIniciales={[fila({ cliente: "Almacen Jordania", cliente_codigo: "D-68" })]} />);
    await asentar();
    expect(tarjetas().queryByTestId("destinos-del-cliente")).toBeNull();
  });

  it("una fila sin código de cliente (texto libre) tampoco muestra botones", async () => {
    render(<Harness itemsIniciales={[fila({ cliente: "DUCASA" })]} />);
    await asentar();
    expect(tarjetas().queryByTestId("destinos-del-cliente")).toBeNull();
  });
});

/** Elige un cliente DE VERDAD por el selector: teclear + Enter (el primer hit).
 *  ⚠️ El `<select>` de empresa también es role="combobox": se toma el campo de
 *  cliente por su id del layout de tarjetas. */
async function elegirCliente(texto: string) {
  const picker = document.getElementById("cliente-a-m") as HTMLInputElement;
  fireEvent.focus(picker);
  fireEvent.change(picker, { target: { value: texto } });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  fireEvent.keyDown(picker, { key: "Enter" });
}

describe("🔁 el destino ÚNICO se llena solo al ELEGIR el cliente (4-sep-2026)", () => {
  // Daniel, textual: «sí quiero que se llene sola, ¿ese no era el propósito de
  // todo esto? ¿Cómo que no pre-llenaste la dirección?» y, sobre la regla del
  // 14-ago: «"la dirección no se escribe sola" me refería a que el usuario no
  // lo haga para no escribirlo mal como lo vimos, quita esa regla. Que se
  // autollene como lo discutimos antes.» Con UN solo destino — definido o
  // único en su historia agrupada — se llena al elegir; con varios, botones.
  it("elegir Jerusalem Duty Free (D-81) llena Dirección con «Paso Canoas» — y sigue siendo texto libre", async () => {
    render(<Harness itemsIniciales={[fila()]} />);
    await asentar();
    await elegirCliente("Jerusalem");
    expect(itemsCapturados[0].cliente_codigo).toBe("D-81");
    expect(campoDireccion().value).toBe("Paso Canoas");
    expect(itemsCapturados[0].direccion).toBe("Paso Canoas");
    // Se borra y se escribe encima como cualquier texto.
    fireEvent.change(campoDireccion(), { target: { value: "Otra bodega" } });
    expect(itemsCapturados[0].direccion).toBe("Otra bodega");
  });

  it("un cliente con UN único destino en su HISTORIA agrupada también llena: Bouti, S.A. (D-14) → «David»", async () => {
    // El ejemplo real que preguntó Daniel: 4 guías, siempre a David.
    render(<Harness itemsIniciales={[fila()]} />);
    await asentar();
    await elegirCliente("Bouti");
    expect(itemsCapturados[0].cliente_codigo).toBe("D-14");
    expect(campoDireccion().value).toBe("David");
  });

  it("🔴 con VARIOS destinos no se llena nada — ni definidos (Sporting Shoes) ni históricos (D-77)", async () => {
    render(<Harness itemsIniciales={[fila()]} />);
    await asentar();
    await elegirCliente("Sporting");
    expect(itemsCapturados[0].cliente_codigo).toBe("D-142");
    expect(campoDireccion().value).toBe("");

    cleanup();
    render(<Harness itemsIniciales={[fila()]} />);
    await asentar();
    await elegirCliente("Otro Cliente");
    expect(itemsCapturados[0].cliente_codigo).toBe("D-77");
    expect(campoDireccion().value).toBe("");
  });

  it("🔴 si el campo ya tiene algo escrito, NO se pisa", async () => {
    render(<Harness itemsIniciales={[fila({ direccion: "Bodega del cliente" })]} />);
    await asentar();
    await elegirCliente("Jerusalem");
    expect(itemsCapturados[0].cliente_codigo).toBe("D-81");
    expect(itemsCapturados[0].direccion).toBe("Bodega del cliente");
  });

  it("🔴 CONTROL — con GUIAS_ATAJOS_NUEVOS apagado, elegir el cliente no llena nada (la pantalla de hoy)", async () => {
    atajosEncendidos = false;
    render(<Harness itemsIniciales={[fila()]} />);
    await asentar();
    await elegirCliente("Jerusalem");
    expect(itemsCapturados[0].cliente_codigo).toBe("D-81");
    expect(campoDireccion().value).toBe("");
  });
});

describe("CONTROL — dónde NO aparece", () => {
  it("una guía Completada (soloCorregible) no muestra botones: la dirección no es de los 3 corregibles", async () => {
    render(
      <Harness
        soloCorregible
        itemsIniciales={[fila({ id: "i1", cliente: "City Mall Paso Canoa", cliente_codigo: "D-25", direccion: "Paso Canoas" })]}
      />,
    );
    await asentar();
    expect(screen.queryByTestId("destinos-del-cliente")).toBeNull();
    // La dirección sale BLOQUEADA, no como campo.
    expect(document.getElementById("direccion-i1-m")).toBeNull();
  });

  it("🔴 con GUIAS_ATAJOS_NUEVOS = false no hay botones y la pantalla es la de hoy", async () => {
    atajosEncendidos = false;
    render(<Harness itemsIniciales={[fila({ cliente: "City Mall Paso Canoa", cliente_codigo: "D-25" })]} />);
    await asentar();
    expect(screen.queryByTestId("destinos-del-cliente")).toBeNull();
    expect(screen.queryByText("Paso Canoas")).toBeNull();
    // Escribir a mano sigue funcionando igual que hoy.
    fireEvent.change(campoDireccion(), { target: { value: "Paso Canoas" } });
    expect(itemsCapturados[0].direccion).toBe("Paso Canoas");
  });
});
