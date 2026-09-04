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
 *   2. 🔴 El botón NUNCA se aplica solo — ni para un cliente definido con UN
 *      solo destino: elegir el cliente muestra botones, no escribe nada
 *      (la dirección «NO se escribe sola en el campo», 14-ago-2026).
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

/** Historia de un cliente que NO está entre los 9 definidos. */
const DESTINOS_HISTORICOS = { "D-77": ["David", "Santiago"] };

beforeEach(() => {
  atajosEncendidos = true;
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
        return { ok: true, json: async () => ({ clientes: [] }) };
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

  it("🔴 el botón NUNCA se aplica solo: con el cliente elegido (UN solo destino definido) el campo sigue vacío", async () => {
    render(<Harness itemsIniciales={[fila({ cliente: "Jerusalem Duty Free", cliente_codigo: "D-81" })]} />);
    await asentar();
    // El botón está a la vista…
    expect(tarjetas().getByRole("button", { name: "Paso Canoas" })).toBeTruthy();
    // …y el campo sigue VACÍO hasta que alguien lo toque.
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
