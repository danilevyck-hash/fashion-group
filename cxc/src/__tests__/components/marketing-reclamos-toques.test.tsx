/**
 * ============================================================================
 * CANDADOS DE CONDUCTA — Marketing y Reclamos, arreglos de flujo (24-ago-2026).
 *
 * Estos tests RENDERIZAN los componentes y TOCAN los botones. No son barridos
 * de texto a propósito: este repo ya pagó cuatro veces el mismo precio —un
 * candado que se cumple con el COMENTARIO que explica el arreglo, con el código
 * roto debajo. Acá, si el arreglo se revierte, la pantalla se comporta distinto
 * y el test se cae por lo que se VE, no por lo que dice un comentario.
 *
 * Lo que protege, defecto por defecto:
 *   1. Anular y Eliminar no pueden volver a estar pegados ni medir 24 px.
 *   2. El borrado DEFINITIVO del proyecto dice que es definitivo.
 *   3. El correo al proveedor no se pierde con un clic en el fondo, y el tacho
 *      de la libreta pregunta antes de borrar.
 *   4. El filtro "Marca" del reporte por proyecto SE LLENA.
 *   5. La X para borrar una foto se ve en el celular.
 *   6. El botón de entregar muebles dice qué falta (no un `title=`).
 *   9. Anular un pago NO abre el prompt del navegador, y la fecha se lee.
 *  10. El género se GUARDA en inglés (lo exige el CHECK de la base) pero se
 *      MUESTRA en español.
 * ============================================================================
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import FacturasSection from "@/app/marketing/components/FacturasSection";
import FotosSection from "@/app/marketing/components/FotosSection";
import EnviarProveedorModal from "@/app/reclamos/components/EnviarProveedorModal";
import { ReportePorProyectoView } from "@/app/marketing/components/ReportePorProyectoView";
import HistorialImpulsadoraModal from "@/app/marketing/components/HistorialImpulsadoraModal";
import EntregaForm from "@/components/marketing/EntregaForm";
import ReclamoForm from "@/app/reclamos/components/ReclamoForm";
import ProyectoOverlay from "@/app/marketing/components/ProyectoOverlay";
import MobiliarioPage from "@/app/marketing/mobiliario/page";
import { GENEROS, generoLabel, emptyItem } from "@/app/reclamos/components/constants";
import { validateReclamoItem } from "@/lib/reclamos/validate";
import type {
  FacturaConAdjuntosYMarcas,
  ImpulsadoraConEstado,
  MarcaConPorcentaje,
  MkInventarioProducto,
  MkMarca,
  ProyectoConMarcas,
} from "@/lib/marketing/types";

// jsdom de este repo no trae Storage ni el router de Next: se arman a mano,
// igual que en los demás tests que renderizan modales (ModalOverlay lee
// localStorage y usePathname).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/marketing",
  useSearchParams: () => new URLSearchParams(),
}));

function makeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

// ── Datos mínimos ───────────────────────────────────────────────────────────
const TOMMY = { id: "m-th", codigo: "TH", nombre: "Tommy Hilfiger" } as MkMarca;
const CALVIN = { id: "m-ck", codigo: "CK", nombre: "Calvin Klein" } as MkMarca;

const PROYECTO = {
  id: "p1",
  tienda: "Tienda X",
  nombre: "Proyecto X",
  marcas: [],
  anulado_en: null,
} as unknown as ProyectoConMarcas;

const FACTURA = {
  id: "f1",
  numero_factura: "0001",
  fecha_factura: "2026-05-01",
  proveedor: "Impreco",
  concepto: "Letrero",
  subtotal: 100,
  itbms: 7,
  total: 107,
  estado_pago: "creado",
  tiene_importacion: false,
  anulado_en: null,
  anulado_motivo: null,
  adjuntos: [],
  marcas: [],
} as unknown as FacturaConAdjuntosYMarcas;

/** Alto táctil aceptable: la clase `min-h-[44px]`, `h-11` (44 px) o mayor. */
function esTactil(el: Element): boolean {
  return /(?:^|\s)(?:min-h-\[44px\]|h-11|h-12|min-h-\[48px\])(?:\s|$)/.test(
    el.className,
  );
}

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => "" };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: makeStorage(), configurable: true, writable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: makeStorage(), configurable: true, writable: true });
  fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/marketing/marcas")) return json([TOMMY, CALVIN]);
    if (url.includes("/api/marketing/reportes/tienda"))
      return json({ tiendas: ["Tienda X"], items: [] });
    if (url.includes("/api/marketing/reportes/proyecto")) return json({ items: [] });
    if (url.includes("/api/reclamos/contactos-email")) {
      if (init?.method === "DELETE") return json({ ok: true });
      return json([
        { id: "c1", email: "ana@proveedor.com", nombre: "Ana", created_at: "2026-01-01" },
      ]);
    }
    if (/\/api\/marketing\/proyectos\/[^/]+$/.test(url.split("?")[0])) {
      // Sin facturas a propósito: los botones de FACTURA se prueban aparte
      // (bloque 1). Acá interesan sólo los del PROYECTO, y con facturas
      // adentro habría dos "Editar" y dos "Eliminar definitivamente".
      return json({ ...PROYECTO, facturas: [] });
    }
    if (url.includes("/api/marketing/inventario/entregas")) return json([]);
    if (url.includes("/api/marketing/inventario/productos"))
      return json([
        { id: "prod-pan", nombre: "Paneles", precio: 130, stock_total: 50, fotos: [] },
      ]);
    if (url.includes("/api/marketing/proyectos?")) return json([]);
    if (url.includes("/fotos")) {
      return json([
        { id: "ft1", url: "https://x/foto.jpg", nombre_original: "foto.jpg", tipo: "foto" },
      ]);
    }
    if (url.includes("/pagos")) {
      if (init?.method === "DELETE") return json({ ok: true });
      return json({
        pagos: [
          {
            ref: "pg1",
            periodoDesde: "2026-04-01",
            periodoHasta: "2026-04-30",
            mes: "2026-04",
            concepto: "Pago abril",
            fechaRegistro: "2026-04-03",
            total: 500,
            marcas: [],
            anulado: false,
            anuladoMotivo: null,
            comprobanteUrl: null,
          },
        ],
      });
    }
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// 1. Editar · Anular · Eliminar de una factura
// ════════════════════════════════════════════════════════════════════════════
describe("🔴 el dedo no puede caer en Eliminar cuando iba a Anular", () => {
  function pintarFacturas() {
    sessionStorage.setItem("cxc_role", "admin");
    return render(
      <ToastProvider>
        <FacturasSection proyecto={PROYECTO} facturasIniciales={[FACTURA]} />
      </ToastProvider>,
    );
  }

  it("los tres botones se VEN en el celular (nada escondido tras el hover)", async () => {
    pintarFacturas();
    const editar = await screen.findByRole("button", { name: "Editar" });
    const anular = screen.getByRole("button", { name: "Anular" });
    // Si volvieran a `opacity-0` sin prefijo `sm:`, en el iPhone serían
    // invisibles. El prefijo `sm:` sí está permitido (escritorio con hover).
    //
    // 🩸 Mirar SÓLO el botón no alcanza y se comprobó por mutación: poner el
    // `opacity-0` en el DIV QUE LOS CONTIENE los esconde igual y el candado
    // pasaba en verde. Se recorre la cadena de ancestros hasta el <section>.
    for (const b of [editar, anular]) {
      let el: HTMLElement | null = b;
      while (el && el.tagName !== "SECTION" && el !== document.body) {
        expect(el.className).not.toMatch(/(?:^|\s)opacity-0(?:\s|$)/);
        el = el.parentElement;
      }
    }
  });

  it("cada botón mide 44 px de alto", async () => {
    pintarFacturas();
    const editar = await screen.findByRole("button", { name: "Editar" });
    const anular = screen.getByRole("button", { name: "Anular" });
    const eliminar = await screen.findByRole("button", {
      name: /Eliminar definitivamente/,
    });
    for (const b of [editar, anular, eliminar]) expect(esTactil(b)).toBe(true);
  });

  it("lo DESTRUCTIVO no queda pegado a lo reversible", async () => {
    pintarFacturas();
    const anular = screen.getByRole("button", { name: "Anular" });
    const eliminar = await screen.findByRole("button", {
      name: /Eliminar definitivamente/,
    });
    // Comparten fila, pero Eliminar se va al extremo opuesto (`ml-auto`): en
    // jsdom no hay layout, así que se mide la regla que LO produce.
    expect(anular.parentElement).toBe(eliminar.parentElement);
    expect(eliminar.className).toMatch(/(?:^|\s)ml-auto(?:\s|$)/);
    expect(anular.className).not.toMatch(/(?:^|\s)ml-auto(?:\s|$)/);
  });

  it("y dice que es definitivo, no sólo «Eliminar»", async () => {
    pintarFacturas();
    const eliminar = await screen.findByRole("button", {
      name: /Eliminar definitivamente/,
    });
    expect(eliminar.textContent).toMatch(/definitivamente/i);
  });

  it("tocar Anular abre el motivo (reversible), no el borrado", async () => {
    pintarFacturas();
    fireEvent.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Anular factura 0001/i })).toBeTruthy(),
    );
    // El borrado definitivo NO se disparó de paso.
    expect(
      screen.queryByText(/NO se puede deshacer/i),
    ).toBeNull();
  });

  it("tocar Eliminar abre la confirmación que avisa que no hay vuelta atrás", async () => {
    pintarFacturas();
    const eliminar = await screen.findByRole("button", {
      name: /Eliminar definitivamente/,
    });
    fireEvent.click(eliminar);
    await waitFor(() =>
      expect(screen.getByText(/NO se puede deshacer/i)).toBeTruthy(),
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. La X de la foto en el celular
// ════════════════════════════════════════════════════════════════════════════
describe("🔴 desde el celular SÍ se puede borrar una foto subida por error", () => {
  it("la X no está escondida tras el hover y mide 44 px", async () => {
    render(
      <ToastProvider>
        <FotosSection proyectoId="p1" />
      </ToastProvider>,
    );
    const x = await screen.findByRole("button", { name: "Eliminar foto" });
    // `opacity-0` sólo puede venir con prefijo de breakpoint (`sm:opacity-0`).
    expect(x.className).not.toMatch(/(?:^|\s)opacity-0(?:\s|$)/);
    expect(x.className).toMatch(/(?:^|\s)opacity-100(?:\s|$)/);
    expect(/(?:^|\s)(?:w-11|h-11)(?:\s|$)/.test(x.className)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. El correo al proveedor
// ════════════════════════════════════════════════════════════════════════════
describe("🔴 el correo al proveedor no se pierde ni se borra un contacto sin querer", () => {
  function pintarCorreo() {
    const onClose = vi.fn();
    render(
      <ToastProvider>
        <EnviarProveedorModal
          open
          empresa="Tommy"
          reclamoIds={["r1"]}
          defaultTo="ana@proveedor.com"
          count={1}
          onClose={onClose}
          onSent={vi.fn()}
        />
      </ToastProvider>,
    );
    return { onClose };
  }

  function fondo(): HTMLElement {
    return document.querySelector(".fixed.inset-0.z-\\[60\\]") as HTMLElement;
  }

  it("con el mensaje INTACTO, tocar el fondo cierra (como cualquier ventana)", async () => {
    const { onClose } = pintarCorreo();
    await screen.findByDisplayValue(/Reclamo pendiente/);
    const bg = fondo();
    fireEvent.mouseDown(bg);
    fireEvent.click(bg);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("🩸 con algo ESCRITO, tocar el fondo NO cierra: no se pierde el correo", async () => {
    const { onClose } = pintarCorreo();
    const asunto = await screen.findByDisplayValue(/Reclamo pendiente/);
    fireEvent.change(asunto, { target: { value: "Asunto que escribí a mano" } });
    const bg = fondo();
    fireEvent.mouseDown(bg);
    fireEvent.click(bg);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("el tacho de la libreta PREGUNTA antes de borrar (y no borra al primer toque)", async () => {
    pintarCorreo();
    fireEvent.click(await screen.findByRole("button", { name: /Libreta de contactos/i }));
    const tacho = await screen.findByRole("button", {
      name: /Borrar contacto de la libreta/i,
    });
    expect(esTactil(tacho) || /(?:^|\s)h-11(?:\s|$)/.test(tacho.className)).toBe(true);
    fireEvent.click(tacho);
    // No salió ningún DELETE todavía.
    const deletes = () =>
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
      );
    expect(deletes()).toHaveLength(0);
    const pregunta = await screen.findByText(/¿Borrar de la libreta\?/);
    // Y se puede arrepentir (el Cancelar de la FILA, no el del pie del modal).
    const fila = pregunta.parentElement as HTMLElement;
    fireEvent.click(within(fila).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText(/¿Borrar de la libreta\?/)).toBeNull();
    expect(deletes()).toHaveLength(0);
  });

  it("confirmando SÍ borra", async () => {
    pintarCorreo();
    fireEvent.click(await screen.findByRole("button", { name: /Libreta de contactos/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /Borrar contacto de la libreta/i }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Borrar" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
        ),
      ).toHaveLength(1),
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. El filtro de marca
// ════════════════════════════════════════════════════════════════════════════
describe("🔴 el filtro «Marca» del reporte por proyecto se LLENA", () => {
  it("ofrece las marcas que devuelve la API, no sólo «Todas»", async () => {
    render(
      <ToastProvider>
        <ReportePorProyectoView />
      </ToastProvider>,
    );
    // La API devuelve el ARRAY pelado: si alguien vuelve a desenvolver un
    // `{ marcas }` que no existe, esto se cae.
    expect(await screen.findByRole("option", { name: "Tommy Hilfiger" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Calvin Klein" })).toBeTruthy();
  });

  it("y elegir una marca la manda al endpoint", async () => {
    render(
      <ToastProvider>
        <ReportePorProyectoView />
      </ToastProvider>,
    );
    await screen.findByRole("option", { name: "Tommy Hilfiger" });
    const select = screen.getByRole("option", { name: "Tommy Hilfiger" })
      .closest("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: TOMMY.id } });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) =>
          String(u).includes(`marca_id=${TOMMY.id}`),
        ),
      ).toBe(true),
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. Anular un pago de impulsadora
// ════════════════════════════════════════════════════════════════════════════
describe("🔴 anular un pago no abre el cuadro gris del navegador", () => {
  const IMPULSADORA = {
    id: "i1",
    nombre: "Marta",
    monto_mensual: 500,
    marcas: [],
  } as unknown as ImpulsadoraConEstado;

  function pintarHistorial() {
    render(
      <ToastProvider>
        <HistorialImpulsadoraModal
          impulsadora={IMPULSADORA}
          onClose={vi.fn()}
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    );
  }

  it("tocar Anular NO llama a window.prompt: abre una ventana de la app", async () => {
    const prompt = vi.fn(() => "motivo");
    vi.stubGlobal("prompt", prompt);
    pintarHistorial();
    fireEvent.click(await screen.findByRole("button", { name: "Anular" }));
    expect(prompt).not.toHaveBeenCalled();
    expect(await screen.findByLabelText(/Motivo/)).toBeTruthy();
  });

  it("el botón queda apagado hasta que haya motivo escrito, y ahí anula", async () => {
    pintarHistorial();
    fireEvent.click(await screen.findByRole("button", { name: "Anular" }));
    const confirmar = await screen.findByRole("button", { name: "Anular pago" });
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(await screen.findByLabelText(/Motivo/), {
      target: { value: "se pagó dos veces" },
    });
    expect((confirmar as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirmar);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, init]) =>
            String(u).includes("/pagos") &&
            (init as RequestInit | undefined)?.method === "DELETE",
        ),
      ).toBe(true),
    );
  });

  it("la fecha se lee como fecha, no como código", async () => {
    pintarHistorial();
    // "2026-04-03" → "3 abr 2026".
    await screen.findByRole("button", { name: "Anular" });
    const texto = document.body.textContent ?? "";
    expect(texto).toMatch(/registrado\s*3 abr 2026/i);
    expect(texto).not.toMatch(/2026-04-03/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. El botón de entregar muebles
// ════════════════════════════════════════════════════════════════════════════
describe("🔴 el botón de entregar muebles dice POR QUÉ está apagado", () => {
  const PRODUCTOS = [
    { id: "prod-pan", nombre: "Paneles", precio: 130, stock_total: 50 },
    { id: "prod-bar", nombre: "Barra", precio: 20, stock_total: 90 },
  ] as MkInventarioProducto[];
  const MARCAS_PROYECTO: MarcaConPorcentaje[] = [
    { marca: TOMMY, porcentaje: 100 } as MarcaConPorcentaje,
  ];

  function pintarEntrega() {
    render(
      <ToastProvider>
        <EntregaForm
          open
          proyectoId="p1"
          proyectoNombre="Tienda X"
          marcasProyecto={MARCAS_PROYECTO}
          productos={PRODUCTOS}
          initial={null}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </ToastProvider>,
    );
  }

  // ⚠️ ESTE CANDADO CAMBIÓ DE DIRECCIÓN EL 23-ago-2026, Y NO SE BORRÓ.
  //
  // Exigía dos cosas: que el botón dijera POR QUÉ está apagado (eso SIGUE, es
  // lo que el describe protege) y, de paso, que el motivo fuera "la cantidad
  // de paneles" y que el campo mostrara "Obligatorio — sin paneles no se puede
  // registrar la entrega".
  //
  // Ese segundo pedazo estaba FIJANDO UN BUG. Daniel, textual: *"me sale
  // obligatorio poner paneles. Pero no tengo. No debe de ser obligatorio, no
  // tiene sentido"*. El requisito venía del KIT AUTO-RELLENABLE (may-2026),
  // donde paneles era el driver de la curva 3/3/1/3; **la curva se eliminó el
  // 12-ago-2026** y el freno quedó exigiendo un número para un mecanismo
  // muerto. Una entrega de puras barras y colgadores es un envío real.
  //
  // La protección NO se aflojó, se INVIRTIÓ: en vez de "sin paneles no se
  // guarda", ahora es *sin NINGÚN producto no se guarda, y el botón lo dice en
  // la pantalla*. Es el mismo invariante que importaba (nadie se queda con un
  // botón gris sin explicación, y no se guarda una entrega de cero piezas),
  // pero atado a lo que de verdad hace falta y no a un producto en particular.
  it("una entrega VACÍA no se guarda, y el botón lo dice EN LA PANTALLA", async () => {
    pintarEntrega();
    await waitFor(() =>
      expect(screen.getByLabelText("Cantidad de paneles")).toBeTruthy(),
    );
    const guardar = screen.getByRole("button", { name: "Registrar entrega" });
    expect((guardar as HTMLButtonElement).disabled).toBe(true);
    // 🩸 El `title=` NO cuenta: en el iPhone no existe.
    expect(guardar.getAttribute("title")).toBeNull();
    expect(screen.getByText(/Falta:.*al menos un producto con cantidad/i))
      .toBeTruthy();
  });

  it("⛔ el campo de paneles ya NO se anuncia como obligatorio", async () => {
    pintarEntrega();
    await waitFor(() =>
      expect(screen.getByLabelText("Cantidad de paneles")).toBeTruthy(),
    );
    expect(screen.queryByText(/Obligatorio — sin paneles/i)).toBeNull();
    // Ni el asterisco de "campo requerido" al lado del campo.
    expect(document.body.textContent).not.toMatch(/sin paneles no se puede/i);
  });

  it("🔴 SIN PANELES pero con barras, la entrega SE PUEDE GUARDAR", async () => {
    pintarEntrega();
    await waitFor(() =>
      expect(screen.getByLabelText("Cantidad de paneles")).toBeTruthy(),
    );
    // Paneles queda en blanco a propósito: es el caso de Daniel.
    fireEvent.change(screen.getByLabelText("Piezas de Barra plana"), {
      target: { value: "12" },
    });
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Registrar entrega" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(screen.queryByText(/^Falta:/)).toBeNull();
    expect((screen.getByLabelText("Cantidad de paneles") as HTMLInputElement).value)
      .toBe("");
  });

  it("llenando paneles y cantidad, el aviso se va y el botón se enciende", async () => {
    pintarEntrega();
    await waitFor(() =>
      expect(screen.getByLabelText("Cantidad de paneles")).toBeTruthy(),
    );
    fireEvent.change(screen.getByLabelText("Cantidad de paneles"), {
      target: { value: "4" },
    });
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Registrar entrega" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(screen.queryByText(/^Falta:/)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10. El género: se GUARDA en inglés, se MUESTRA en español
// ════════════════════════════════════════════════════════════════════════════
describe("🔴 el único campo en inglés del sistema", () => {
  function pintarReclamo() {
    const noop = () => {};
    render(
      <ToastProvider>
        <ReclamoForm
          fEmpresa="Tommy"
          setFEmpresa={noop}
          fFecha="2026-08-01"
          setFFecha={noop}
          fFactura="F-1"
          setFFactura={noop}
          fPedido="P-1"
          setFPedido={noop}
          fNotas=""
          setFNotas={noop}
          fItems={[emptyItem()]}
          setFItems={noop as never}
          facturaPdfPath={null}
          setFacturaPdfPath={noop}
          savedReclamoId={null}
          savedNroReclamo=""
          pendingFotos={[]}
          onAddFoto={noop}
          onRemoveFoto={noop}
          onRetryFotos={noop}
          saving={false}
          error={null}
          customMotivos={[]}
          setCustomMotivos={noop as never}
          addingMotivo={null}
          setAddingMotivo={noop}
          newMotivoText=""
          setNewMotivoText={noop}
          onSave={noop}
          onCancel={noop}
          onViewSaved={noop}
          onResetAndCreateAnother={noop}
        />
      </ToastProvider>,
    );
  }

  it("el desplegable se LEE en español", () => {
    pintarReclamo();
    for (const esperado of ["Hombre", "Mujer", "Niños", "Accesorios"]) {
      expect(screen.getAllByRole("option", { name: esperado }).length).toBeGreaterThan(0);
    }
  });

  it("…pero lo que se GUARDA sigue siendo el valor en inglés", () => {
    pintarReclamo();
    // 🔴 `reclamo_items.genero` tiene un CHECK en la base que sólo admite estos
    // cuatro. Traducir el VALUE haría fallar el INSERT en producción.
    const hombre = screen.getAllByRole("option", { name: "Hombre" })[0] as HTMLOptionElement;
    expect(hombre.value).toBe("Men");
    const nins = screen.getAllByRole("option", { name: "Niños" })[0] as HTMLOptionElement;
    expect(nins.value).toBe("Kids");
    expect([...GENEROS]).toEqual(["Men", "Women", "Kids", "Accessories"]);
  });

  it("y en pantalla no queda ni una etiqueta en inglés", () => {
    pintarReclamo();
    const texto = document.body.textContent ?? "";
    for (const ingles of ["Men", "Women", "Kids", "Accessories"]) {
      expect(texto).not.toContain(ingles);
    }
  });

  it("generoLabel traduce lo guardado y no se traga lo desconocido", () => {
    expect(generoLabel("Women")).toBe("Mujer");
    expect(generoLabel("")).toBe("");
    expect(generoLabel(null)).toBe("");
    // Una fila vieja o rara se muestra tal cual en vez de desaparecer.
    expect(generoLabel("Unisex")).toBe("Unisex");
  });

  it("el error de validación también sale en español", () => {
    const err = validateReclamoItem(
      { referencia: "A", descripcion: "B", talla: "M", genero: "", cantidad: 1, precio_unitario: 1, motivo: "X" },
      1,
    );
    expect(err).toMatch(/género/i);
    expect(err).toMatch(/Hombre/);
    expect(err).not.toMatch(/Men|Women|Kids|Accessories/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. Las DOS formas de borrar un proyecto no se leen igual
// ════════════════════════════════════════════════════════════════════════════
describe("🔴 el borrado DEFINITIVO del proyecto dice que es definitivo", () => {
  function pintarOverlay() {
    sessionStorage.setItem("cxc_role", "admin");
    render(
      <ToastProvider>
        <ProyectoOverlay
          proyectoId="p1"
          onClose={vi.fn()}
          onChange={vi.fn()}
        />
      </ToastProvider>,
    );
  }

  it("el botón NO dice sólo «Eliminar», y mide 44 px", async () => {
    pintarOverlay();
    const btn = await screen.findByRole("button", { name: /Eliminar definitivamente/ });
    expect(esTactil(btn)).toBe(true);
    // El de la lista del período ("Registrado por error — eliminar") esconde y
    // se puede deshacer; ÉSTE borra facturas, fotos y archivos para siempre.
    // Si los dos volvieran a decir "Eliminar" a secas, esto se cae.
    expect(screen.queryByRole("button", { name: /^Eliminar$/ })).toBeNull();
  });

  it("no queda pegado a «Editar» (la fila se partió en dos)", async () => {
    pintarOverlay();
    const eliminar = await screen.findByRole("button", { name: /Eliminar definitivamente/ });
    const editar = screen.getByRole("button", { name: "Editar" });
    expect(editar.parentElement).toBe(eliminar.parentElement);
    expect(eliminar.parentElement!.className).toMatch(/flex-col/);
    expect(esTactil(editar)).toBe(true);
  });

  it("y sigue pidiendo ESCRIBIR el nombre del proyecto para borrar", async () => {
    pintarOverlay();
    fireEvent.click(await screen.findByRole("button", { name: /Eliminar definitivamente/ }));
    expect(await screen.findByText(/Esta acción NO se puede deshacer/i)).toBeTruthy();
    // Pide escribir el nombre exacto del proyecto…
    const campo = screen.getByPlaceholderText(PROYECTO.nombre) as HTMLInputElement;
    // …y hasta que no coincida, el botón rojo del modal está APAGADO.
    const rojo = screen
      .getAllByRole("button")
      .filter((b) => /Eliminar definitivamente/i.test(b.textContent ?? ""))
      .find((b) => (b as HTMLButtonElement).disabled) as HTMLButtonElement;
    expect(rojo).toBeTruthy();
    fireEvent.change(campo, { target: { value: PROYECTO.nombre } });
    await waitFor(() => expect(rojo.disabled).toBe(false));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7 y 8. Mobiliario: un número por concepto, un botón por descarga
// ════════════════════════════════════════════════════════════════════════════
describe("🔴 Mobiliario: los rótulos no pueden mentir", () => {
  function pintarMobiliario() {
    sessionStorage.setItem("cxc_role", "admin");
    render(
      <ToastProvider>
        <MobiliarioPage />
      </ToastProvider>,
    );
  }

  it("«Valor total» y «Disponible» ya no conviven diciendo el MISMO número", async () => {
    pintarMobiliario();
    await waitFor(() => expect(screen.getByText(/En bodega/)).toBeTruthy());
    const texto = document.body.textContent ?? "";
    // 🩸 Los dos salían de `precio × stock_total` — el mismo peso, dos nombres.
    // `stock_total` YA es lo disponible (cada entrega se lo descuenta), así que
    // el rótulo honesto es uno solo.
    expect(texto).not.toContain("Valor total");
    expect(texto.match(/Disponible:/g) ?? []).toHaveLength(0);
  });

  it("hay UN solo «Descargar Excel», y no vive dentro de «Resumen por tienda»", async () => {
    pintarMobiliario();
    await waitFor(() => expect(screen.getByText(/Resumen por tienda/)).toBeTruthy());
    // El segundo botón prometía bajar el resumen y bajaba el archivo entero.
    const botones = screen.getAllByRole("button", { name: /Descargar Excel/i });
    expect(botones).toHaveLength(1);
    const resumen = screen.getByText(/Resumen por tienda/).closest("section")!;
    expect(within(resumen).queryByRole("button", { name: /Descargar Excel/i })).toBeNull();
  });
});
