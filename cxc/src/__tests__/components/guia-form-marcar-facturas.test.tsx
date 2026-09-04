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

/** 4 facturas de 3 empresas en 3 días — la de Joystep ya salió en una guía
 *  viva. Y una QUINTA en un cuarto día, que solo aparece con «Ver más días»
 *  (los últimos 3 días CON factura abren; el cuarto queda oculto). */
const FACTURAS = [
  { empresa_key: "vistana", empresa: "Vistana International", secuencial: "2535", fecha: "2026-06-01T16:00:00Z", total: 100, yaSalioEn: null },
  { empresa_key: "vistana", empresa: "Vistana International", secuencial: "2536", fecha: "2026-06-01T15:00:00Z", total: 200, yaSalioEn: null },
  { empresa_key: "fashion_wear", empresa: "Fashion Wear", secuencial: "7001", fecha: "2026-05-30T15:00:00Z", total: 300, yaSalioEn: null },
  { empresa_key: "joystep", empresa: "Joystep", secuencial: "88", fecha: "2026-05-29T15:00:00Z", total: 50, yaSalioEn: 204 },
  { empresa_key: "fashion_wear", empresa: "Fashion Wear", secuencial: "7055", fecha: "2026-05-15T15:00:00Z", total: 75, yaSalioEn: null },
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
    // Las 4 visibles son las de los últimos 3 días con factura; la quinta
    // (del cuarto día) queda detrás de «Ver más días» y no se toca acá.
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

  it("🔴 «Traslado» va debajo de la lista, separado por un «o», y escribe el TEXTO `Traslado` — la empresa se pide a mano", async () => {
    render(<Harness itemsIniciales={[filaVacia()]} />);
    await asentar();
    await elegirCliente();

    // Son DOS caminos y nada más: factura o Traslado. Los rótulos que Daniel
    // descartó no existen.
    expect(screen.queryByText(/Factura pendiente/)).toBeNull();
    expect(screen.queryByText(/Sin factura/)).toBeNull();
    expect(screen.queryByText("Traslado sin factura")).toBeNull();
    expect(screen.getByText("o")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Traslado" }));
    expect(itemsCapturados[0].cliente_codigo).toBe("D-24");
    // 🔴 El texto va HARDCODEADO: si la constante volviera a «0000», rojo.
    expect(itemsCapturados[0].facturas).toBe("Traslado");
    // La EMPRESA se elige a mano: no hay factura que la diga.
    expect(itemsCapturados[0].empresa).toBe("");
  });

  it("«Escribir el número» sigue ahí, con el cliente ya puesto y facturas vacío", async () => {
    render(<Harness itemsIniciales={[filaVacia()]} />);
    await asentar();
    await elegirCliente();

    fireEvent.click(screen.getByText("Escribir el número"));
    expect(itemsCapturados[0].cliente_codigo).toBe("D-24");
    expect(itemsCapturados[0].facturas).toBe("");
  });

  it("🔴 los días van con su encabezado en PALABRAS, y «Ver más días» trae los siguientes 3", async () => {
    render(<Harness itemsIniciales={[filaVacia()]} />);
    await asentar();
    await elegirCliente();

    // Los últimos 3 días CON factura, el más reciente arriba.
    expect(screen.getByText("Lunes 1 jun")).toBeTruthy();
    expect(screen.getByText("Sábado 30 may")).toBeTruthy();
    expect(screen.getByText("Viernes 29 may")).toBeTruthy();
    // Los rótulos viejos no existen más.
    expect(screen.queryByText("Hoy")).toBeNull();
    expect(screen.queryByText("Esta semana")).toBeNull();
    expect(screen.queryByText("Antes")).toBeNull();
    // El cuarto día queda oculto hasta pedir más.
    expect(screen.queryByText("7055")).toBeNull();

    fireEvent.click(screen.getByText("Ver más días"));
    expect(screen.getByText("Viernes 15 may")).toBeTruthy();
    expect(screen.getByText("7055")).toBeTruthy();
    expect(screen.queryByText("Ver más días")).toBeNull();
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
    expect(screen.queryByText("Traslado")).toBeNull();
    expect(screen.queryByText("Escribir el número")).toBeNull();
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

// ─── el Traslado SALE IMPRESO como «Traslado» — papel y Excel ────────────────
// Daniel: «que en factura salga traslado». El campo facturas es texto y los
// dos reportes lo imprimen tal cual; estos casos fijan que un filtro «solo
// números» no se lo coma nunca.

describe("🔴 «Traslado» se imprime en la columna FACTURA(S) del papel y en el Excel", () => {
  const ITEM_TRASLADO = {
    id: "it-t", orden: 1, cliente: "Multi Fashion Holding", cliente_codigo: "D-108",
    direccion: "Albrook", empresa: "Vistana International", facturas: "Traslado",
    bultos: 3, numero_guia_transp: "",
  };
  const GUIA_TRASLADO = {
    id: "g-t", numero: 240, fecha: "2026-09-04",
    transportista: "Transporte Sol", modo_entrega: "transportista", transportista_id: "t-1",
    placa: "EK0700", observaciones: "", total_bultos: 3, item_count: 1, monto_total: 0,
    estado: "Pendiente Bodega", tipo_despacho: "externo",
    entregado_por: "Julio", numero_guia_transp: "",
    guia_items: [ITEM_TRASLADO],
  };

  it("PrintDocument imprime «Traslado» en la celda de FACTURA(S)", async () => {
    const { default: PrintDocument } = await import("@/app/guias/components/PrintDocument");
    const { container } = render(<PrintDocument guia={GUIA_TRASLADO as never} />);
    const celdas = Array.from(container.querySelectorAll("td")).map((td) => (td.textContent || "").trim());
    expect(celdas).toContain("Traslado");
    // Y el encabezado de la columna sigue siendo el de siempre.
    expect(container.textContent).toContain("FACTURA(S)");
  });

  it("el Excel dice «Traslado» en la columna Facturas del envío", async () => {
    const { buildGuiasSheet } = await import("@/app/guias/components/excel-guias");
    const ws = buildGuiasSheet([GUIA_TRASLADO as never]);
    const celdas: string[] = [];
    for (const [addr, cell] of Object.entries(ws as Record<string, unknown>)) {
      if (addr.startsWith("!")) continue;
      const v = (cell as { v?: unknown }).v;
      if (v !== undefined) celdas.push(String(v));
    }
    expect(celdas).toContain("Traslado");
  });
});
