/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 ENTREGAR EL PDF DEL ESTADO DE CUENTA — UN SOLO CAMINO, Y EL ERROR SE VE.
 *
 * 🩸 EL DEFECTO ORIGINAL (24-ago-2026). Eran DOS botones que prometían cosas
 * distintas y hacían la misma: en la computadora, cuando el navegador no sabe
 * compartir archivos, «Compartir» terminaba DESCARGANDO el mismo PDF que el
 * botón «PDF». Y si el archivo no se podía armar, el `catch` sólo escribía en
 * la consola: el botón volvía a la normalidad, no pasaba NADA visible, y la
 * persona tocaba de nuevo esperando otra cosa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔄 CAMBIÓ DE DIRECCIÓN EL 5-sep-2026, y no se borró.
 *
 * El botón vivía en el pie del cajón de documentos. Con el rediseño, el pie del
 * cajón dice **«Cobrar»** y abre la hoja de las cuatro salidas —desde el papel
 * no se podía mandar el papel: había que cerrar el cajón, volver a la fila y
 * abrir otro menú—. La entrega del PDF es una de esas cuatro.
 *
 * Y el rótulo dejó de depender del navegador: dice **«Ver o bajar el PDF»**,
 * que es verdad en los dos casos (comparte si puede, baja si no). Eso NO
 * reintroduce el defecto viejo —un rótulo que promete una cosa y hace otra—:
 * lo elimina por otro lado, prometiendo lo que vale para ambos.
 *
 * 🔑 SIGUEN SIENDO TESTS DE CONDUCTA: se monta la hoja REAL, se toca la fila
 * REAL y se mira qué pasa y qué se ve en pantalla.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import EstadoCuentaDrawer from "@/app/cxc/components/EstadoCuentaDrawer";
import HojaCobrar from "@/app/cxc/components/HojaCobrar";
import type { ConsolidatedClient } from "@/lib/types";

/** Si `buildEstadoCuentaPDF` revienta (el caso que no avisaba). */
let pdfRevienta = false;
/** Qué se compartió por la hoja del sistema. */
let compartido: unknown[];
/** Qué se descargó (el `<a download>` que arma el navegador). */
let descargado: string[];

vi.mock("@/lib/pdf-estado-cuenta", () => ({
  buildEstadoCuentaPDF: () => {
    if (pdfRevienta) throw new Error("jsPDF: no se pudo armar");
    return {
      doc: { output: () => new Blob(["%PDF-"], { type: "application/pdf" }) },
      filename: "EstadoCuenta-D-25.pdf",
    };
  },
}));

const CLIENTE = {
  nombre_normalized: "CITY MALL PASO CANOA",
  companies: {
    vistana: {
      nombre: "CITY MALL PASO CANOA", codigo: "D-25",
      d0_30: 1000, d31_60: 0, d61_90: 0, d91_120: 0,
      d121_180: 0, d181_270: 0, d271_365: 0, mas_365: 0, total: 1000,
      ultimoPagoFecha: null, ultimoPagoMonto: null,
      ultimaCompraFecha: null, ultimaCompraMonto: null,
    },
  },
  correo: "", telefono: "", celular: "", contacto: "", resultado_contacto: "",
  total: 1000, current: 1000, watch: 0, overdue: 0,
  d0_30: 1000, d31_60: 0, d61_90: 0, d91_120: 0, d121_plus: 0,
  hasOverride: false,
} as unknown as ConsolidatedClient;

const ESTADO = {
  codigo: "D-25",
  empresas: [{
    empresa_key: "vistana", empresa_nombre: "Vistana International", subtotal: 1000,
    documentos: [{ numero: "F-1", fecha: "2026-08-01", tipo: "Factura", monto: 1000, saldo: 1000, dias: 23 }],
  }],
  total: 1000,
  generadoEn: "2026-09-05T12:00:00.000Z",
};

/** Lo que devuelve `/api/cxc/enviar-email` (GET) para la hoja «Cobrar». */
const PREVIEW = {
  destinatario: "contabilidad@citymall.com.pa",
  asunto: "Estado de cuenta",
  cuerpo: "Buen día,",
  sharedCount: 2,
  totalDocs: 1,
  estadoCuenta: ESTADO,
};

function ponerCompartir(puede: boolean) {
  if (!puede) {
    // @ts-expect-error se limpia a propósito: es el caso de la computadora.
    delete (navigator as Navigator & { share?: unknown }).share;
    // @ts-expect-error idem.
    delete (navigator as Navigator & { canShare?: unknown }).canShare;
    return;
  }
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: async (d: unknown) => { compartido.push(d); },
  });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
}

beforeEach(() => {
  pdfRevienta = false;
  compartido = [];
  descargado = [];
  ponerCompartir(false);
  // Este entorno de jsdom no expone `localStorage`, y la hoja se dibuja dentro
  // de `ModalOverlay`, que lo lee para saber si la barra lateral está plegada.
  // Sin esto el test mediría un error del ENTORNO en vez de uno del producto.
  if (!("localStorage" in window) || !window.localStorage) {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    });
  }
  // jsdom no trae estas dos; sin ellas la descarga revienta y el test mediría
  // un error del entorno en vez de uno del producto.
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    ({ ok: true, json: async () => (String(url).includes("enviar-email") ? PREVIEW : ESTADO) }) as unknown as Response));
  // El `<a download>` no navega en jsdom: se anota qué se pidió bajar.
  const crear = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = crear(tag);
    if (tag === "a") el.click = () => { descargado.push((el as HTMLAnchorElement).download); };
    return el;
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); cleanup(); });

async function abrirHoja() {
  render(
    <HojaCobrar
      client={CLIENTE}
      onClose={() => {}}
      onProgramarCorreo={() => {}}
      onWhatsApp={() => {}}
      onCopiar={() => {}}
      onEscribirloYo={() => {}}
      marcaEnvio={null}
    />,
  );
  await waitFor(() => expect(screen.getByText("Ver o bajar el PDF")).toBeTruthy());
}

const filaPdf = () => screen.getByText("Ver o bajar el PDF").closest("button")!;

// ─────────────────────────────────────────────────────────────────────────────
// 1. UN SOLO CAMINO PARA EL PDF, Y UN RÓTULO QUE VALE PARA LOS DOS CASOS
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 hay UNA sola salida para el PDF", () => {
  it("se llama «Ver o bajar el PDF» — no hay un «Compartir» ni un «PDF» aparte", async () => {
    await abrirHoja();
    expect(screen.queryByText("Compartir")).toBeNull();
    expect(screen.queryByText("Descargar PDF")).toBeNull();
    expect(screen.getAllByText("Ver o bajar el PDF")).toHaveLength(1);
  });

  it("en la computadora BAJA el archivo", async () => {
    await abrirHoja();
    fireEvent.click(filaPdf());
    await waitFor(() => expect(descargado).toEqual(["EstadoCuenta-D-25.pdf"]));
    expect(compartido).toHaveLength(0);
  });

  it("en un celular que sabe compartir, COMPARTE de verdad (no cae en descarga)", async () => {
    ponerCompartir(true);
    await abrirHoja();
    fireEvent.click(filaPdf());
    await waitFor(() => expect(compartido).toHaveLength(1));
    expect(descargado).toHaveLength(0);
  });

  it("🩸 un navegador que comparte TEXTO pero no ARCHIVOS baja el archivo", async () => {
    // Es el caso que hace falta preguntar con un File de verdad: `navigator.share`
    // existe, pero `canShare({files})` dice que no. Sin esa pregunta, la hoja se
    // quedaría esperando una hoja de compartir que nunca abre.
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => {} });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
    await abrirHoja();
    fireEvent.click(filaPdf());
    await waitFor(() => expect(descargado).toEqual(["EstadoCuenta-D-25.pdf"]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. EL ERROR SE VE
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 si el PDF no se puede armar, la pantalla LO DICE", () => {
  it("aparece un aviso legible en vez de no pasar nada", async () => {
    await abrirHoja();
    pdfRevienta = true;
    fireEvent.click(filaPdf());
    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toMatch(/No se pudo preparar el PDF/i);
    // Y es accionable, como manda la casa: dice qué hacer.
    expect(aviso.textContent).toMatch(/Intenta de nuevo/i);
  });

  it("cerrar la hoja de compartir NO se muestra como error", async () => {
    // AbortError = la persona se arrepintió. Un aviso rojo ahí sería mentira.
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => { const e = new Error("abort"); e.name = "AbortError"; throw e; },
    });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    await abrirHoja();
    fireEvent.click(filaPdf());
    await waitFor(() => expect(screen.getByText("Ver o bajar el PDF")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 🔄 EL PIE DEL CAJÓN AHORA LLEVA A COBRAR
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 desde el papel se puede mandar el papel", () => {
  it("el pie del cajón dice «Cobrar» y avisa con ESE cliente", async () => {
    const llamados: string[] = [];
    render(
      <EstadoCuentaDrawer
        client={CLIENTE}
        companyFilter="all"
        onClose={() => {}}
        onCobrar={(c) => llamados.push(c.nombre_normalized)}
      />,
    );
    await waitFor(() => expect(screen.getByText("Cobrar")).toBeTruthy());
    // Y el botón viejo, que solo bajaba un PDF, ya no está.
    expect(screen.queryByText("Descargar PDF")).toBeNull();
    expect(screen.queryByText("Compartir")).toBeNull();
    fireEvent.click(screen.getByText("Cobrar"));
    expect(llamados).toEqual([CLIENTE.nombre_normalized]);
  });
});
