/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GUÍAS › NUEVA GUÍA — «Facturas del cliente», RENDERIZADO de verdad.
 *
 * Se monta GuiaForm con el panel del atajo y se tocan los botones — un barrido
 * de texto no puede ver lo único que importa acá (que marcar LLENE los
 * renglones, que el aviso no bloquee, que con la constante apagada la pantalla
 * sea EXACTAMENTE la de hoy), y en este repo ese barrido ya se cumplió cuatro
 * veces con su propio comentario.
 *
 * Lo que se congela (Daniel: «va», 3-sep-2026):
 *   1. Elegir el cliente NO escribe ningún renglón: marcar es la elección.
 *   2. Marcar 4 facturas de 3 empresas → 3 renglones, facturas agrupadas por
 *      empresa ("2535, 2536"), y los bultos se piden POR EMPRESA (por renglón).
 *   3. «Ya salió en GT-XXX» es AVISO: la casilla se marca igual.
 *   4. CONTROL — escribir a mano sigue funcionando igual que hoy, y elegir
 *      cliente NO es obligatorio (el botón de guardar no lo exige).
 *   5. 🔴 Con `GUIAS_ATAJOS_NUEVOS = false` el panel NO existe y el formulario
 *      es el de hoy. Con la constante encendida pero en EDICIÓN (o en una guía
 *      Completada) tampoco aparece: es solo para CREAR.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import GuiaForm from "@/app/guias/components/GuiaForm";
import type { GuiaItem } from "@/app/guias/components/types";

// 🔴 El interruptor de reversión, controlable por test: el resto del módulo es
// el REAL (las funciones de marcar/desmarcar son las de producción).
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

const CLIENTE = { codigo: "D-24", nombre: "City Mall David" };

/** 4 facturas de 3 empresas — la de Joystep ya salió en una guía viva. */
const FACTURAS = [
  { empresa_key: "vistana", empresa: "Vistana International", secuencial: "2535", fecha: "2026-06-01T15:00:00Z", total: 100, yaSalioEn: null },
  { empresa_key: "vistana", empresa: "Vistana International", secuencial: "2536", fecha: "2026-06-01T16:00:00Z", total: 200, yaSalioEn: null },
  { empresa_key: "fashion_wear", empresa: "Fashion Wear", secuencial: "7001", fecha: "2026-05-30T15:00:00Z", total: 300, yaSalioEn: null },
  { empresa_key: "joystep", empresa: "Joystep", secuencial: "88", fecha: "2026-05-29T15:00:00Z", total: 50, yaSalioEn: 204 },
];

let pedidosHoy: number;

beforeEach(() => {
  atajosEncendidos = true;
  pedidosHoy = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      const u = String(url);
      if (u.startsWith("/api/guias/facturas-hoy")) {
        pedidosHoy++;
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (u.startsWith("/api/guias/facturas-cliente")) {
        return { ok: true, json: async () => ({ facturas: FACTURAS, hasta: "2026-09-04T14:00:00Z" }) };
      }
      if (u.startsWith("/api/guias/frecuencias")) {
        return { ok: true, json: async () => ({ clientes: [CLIENTE], empresas: [] }) };
      }
      if (u.startsWith("/api/clientes")) {
        return { ok: true, json: async () => ({ clientes: [CLIENTE] }) };
      }
      return { ok: false, json: async () => ({}) };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function filaVacia(uid = "a"): GuiaItem {
  return { uid, orden: 1, cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "" };
}

let itemsCapturados: GuiaItem[];

function Harness({
  itemsIniciales,
  editingId = null,
  soloCorregible = false,
  conReemplazar = true,
}: {
  itemsIniciales: GuiaItem[];
  editingId?: string | null;
  soloCorregible?: boolean;
  conReemplazar?: boolean;
}) {
  const [items, setItems] = useState(itemsIniciales);
  itemsCapturados = items;
  function reemplazar(next: GuiaItem[]) {
    // El mismo trato que `reemplazarItems` del hook: renumera y asigna uid.
    setItems(next.map((it, i) => ({ ...it, orden: i + 1, uid: it.uid ?? `n${i}` })));
  }
  return (
    <GuiaForm
      editingId={editingId}
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
      onAddRow={() => setItems((prev) => [...prev, filaVacia(`r${prev.length}`)])}
      onRemoveRow={() => {}}
      onRestoreRow={() => {}}
      onSave={() => {}}
      onCancel={() => {}}
      {...(conReemplazar ? { onReemplazarItems: reemplazar } : {})}
    />
  );
}

const panel = () => screen.queryByTestId("facturas-del-cliente");

/** Deja que terminen los fetch (frecuencias, facturas del cliente). */
async function asentar() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Elige el cliente en el selector del panel (por «Más usados», sin teclear). */
async function elegirCliente() {
  const campo = document.getElementById("facturas-cliente") as HTMLInputElement;
  expect(campo).toBeTruthy();
  fireEvent.focus(campo);
  const opcion = await screen.findByText("City Mall David", { selector: "[data-desplegable] *" });
  // La opción elige con onMouseDown (le gana al onBlur del campo), no con click.
  fireEvent.mouseDown(opcion.closest("button") ?? opcion);
  await asentar();
}

const casillas = () => screen.getAllByRole("checkbox") as HTMLInputElement[];

describe("el atajo encendido, al crear", () => {
  it("elegir el cliente NO escribe ningún renglón — marcar es la elección", async () => {
    render(<Harness itemsIniciales={[filaVacia()]} />);
    await asentar();
    await elegirCliente();
    // La lista está a la vista…
    expect(screen.getByText("2535")).toBeTruthy();
    // …y los renglones siguen intactos: una fila vacía, sin cliente.
    expect(itemsCapturados).toHaveLength(1);
    expect(itemsCapturados[0].cliente).toBe("");
    expect(itemsCapturados[0].cliente_codigo).toBe("");
  });

  it("marcar 4 facturas de 3 empresas produce 3 renglones con las facturas agrupadas y bultos por empresa", async () => {
    render(<Harness itemsIniciales={[filaVacia()]} />);
    await asentar();
    await elegirCliente();

    for (const c of casillas()) fireEvent.click(c);

    expect(itemsCapturados).toHaveLength(3);
    const porEmpresa = Object.fromEntries(itemsCapturados.map((r) => [r.empresa, r.facturas]));
    expect(porEmpresa).toEqual({
      "Vistana International": "2535, 2536",
      "Fashion Wear": "7001",
      Joystep: "88",
    });
    for (const r of itemsCapturados) {
      expect(r.cliente).toBe("City Mall David");
      expect(r.cliente_codigo).toBe("D-24");
    }

    // Los BULTOS se piden POR EMPRESA: cada renglón tiene su campo, editable.
    const tarjetas = document.querySelector('[data-layout="tarjetas"]') as HTMLElement;
    const bultos = within(tarjetas).getAllByRole("spinbutton");
    expect(bultos).toHaveLength(3);
    fireEvent.change(bultos[0], { target: { value: "5" } });
    expect(itemsCapturados[0].bultos).toBe(5);
  });

  it("desmarcar una factura la quita de SU renglón sin tocar los otros", async () => {
    render(<Harness itemsIniciales={[filaVacia()]} />);
    await asentar();
    await elegirCliente();
    for (const c of casillas()) fireEvent.click(c);
    // desmarcar la 2536 de Vistana
    fireEvent.click(casillas()[1]);
    const vistana = itemsCapturados.find((r) => r.empresa === "Vistana International");
    expect(vistana!.facturas).toBe("2535");
    expect(itemsCapturados.find((r) => r.empresa === "Fashion Wear")!.facturas).toBe("7001");
  });

  it("🔴 «Ya salió en GT-204» es AVISO: se ve, y la casilla se marca igual", async () => {
    render(<Harness itemsIniciales={[filaVacia()]} />);
    await asentar();
    await elegirCliente();

    expect(screen.getByText(/Ya salió en GT-204/)).toBeTruthy();
    const casillaJoystep = casillas()[3];
    expect(casillaJoystep.disabled).toBe(false);
    fireEvent.click(casillaJoystep);
    expect(itemsCapturados.some((r) => r.empresa === "Joystep" && r.facturas === "88")).toBe(true);
  });

  it("«No está en la lista» y «Traslado sin factura» siguen ahí, con el cliente ya puesto", async () => {
    render(<Harness itemsIniciales={[filaVacia()]} />);
    await asentar();
    await elegirCliente();

    fireEvent.click(screen.getByText("Traslado sin factura"));
    expect(itemsCapturados[0].cliente_codigo).toBe("D-24");
    expect(itemsCapturados[0].facturas).toBe("0000");
  });

  it("«Buscar otra vez» dispara la lectura corta de HOY y vuelve a pedir la lista", async () => {
    render(<Harness itemsIniciales={[filaVacia()]} />);
    await asentar();
    await elegirCliente();
    expect(screen.getByText(/hasta las/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByText("Buscar otra vez"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pedidosHoy).toBe(1);
  });

  it("CONTROL — elegir cliente NO es obligatorio: una guía escrita a mano guarda igual", async () => {
    // Un renglón completo A MANO, sin código de cliente. El botón no lo exige.
    render(
      <Harness
        itemsIniciales={[
          { ...filaVacia(), cliente: "Almacen Jordania", direccion: "David", empresa: "Fashion Wear", facturas: "10234", bultos: 2 },
        ]}
      />,
    );
    await asentar();
    const guardar = screen.getAllByRole("button", { name: "Guardar Guía" });
    for (const b of guardar) expect((b as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("dónde NO aparece", () => {
  it("en EDICIÓN no se dibuja: es una pantalla para CREAR", async () => {
    render(<Harness itemsIniciales={[filaVacia()]} editingId="uuid-1" />);
    await asentar();
    expect(panel()).toBeNull();
  });

  it("en una guía Completada (soloCorregible) tampoco", async () => {
    render(<Harness itemsIniciales={[filaVacia()]} editingId="uuid-1" soloCorregible />);
    await asentar();
    expect(panel()).toBeNull();
  });
});

describe("🔴 CONTROL — la constante apagada deja la pantalla EXACTAMENTE como hoy", () => {
  beforeEach(() => {
    atajosEncendidos = false;
  });

  it("no hay panel, ni rótulo «Facturas del cliente», ni botones nuevos", async () => {
    render(<Harness itemsIniciales={[filaVacia()]} />);
    await asentar();
    expect(panel()).toBeNull();
    expect(screen.queryByText("Facturas del cliente")).toBeNull();
    expect(screen.queryByText("Traslado sin factura")).toBeNull();
    expect(screen.queryByText("Buscar otra vez")).toBeNull();
  });

  it("la pantalla de hoy sigue entera y escribir a mano funciona igual", async () => {
    render(<Harness itemsIniciales={[filaVacia()]} />);
    await asentar();
    expect(screen.getByText("Detalle de Envío")).toBeTruthy();
    expect(screen.getByText("+ Agregar envío")).toBeTruthy();
    // escribir la dirección a mano — el flujo de siempre
    const direccion = document.getElementById("direccion-a-m") as HTMLInputElement;
    fireEvent.change(direccion, { target: { value: "Paso Canoas" } });
    expect(itemsCapturados[0].direccion).toBe("Paso Canoas");
    // y sin pedirle nada a la ruta nueva
    expect(pedidosHoy).toBe(0);
  });
});
