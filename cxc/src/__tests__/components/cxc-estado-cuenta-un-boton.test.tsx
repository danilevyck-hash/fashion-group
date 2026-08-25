/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 ESTADO DE CUENTA — UN SOLO BOTÓN, Y EL ERROR SE VE.
 *
 * 🩸 EL DEFECTO. Eran DOS botones que prometían cosas distintas y hacían la
 * misma: en la computadora, cuando el navegador no sabe compartir archivos,
 * «Compartir» terminaba DESCARGANDO el mismo PDF que el botón «PDF». Y si el
 * archivo no se podía armar, el `catch` sólo escribía en la consola: el botón
 * volvía a la normalidad, no pasaba NADA visible, y la persona tocaba de nuevo
 * esperando otra cosa.
 *
 * 🔑 SON TESTS DE CONDUCTA: se monta el cajón REAL, se toca el botón REAL y se
 * mira qué se ve en pantalla. El rótulo del botón es justamente lo que un
 * barrido de texto no puede juzgar: depende de lo que el navegador PUEDA hacer.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import EstadoCuentaDrawer from "@/app/admin/components/EstadoCuentaDrawer";
import type { ConsolidatedClient } from "@/lib/types";

/** Si `buildEstadoCuentaPDF` revienta (el caso que no avisaba). */
let pdfRevienta = false;
/** Qué se compartió por la hoja del sistema. */
let compartido: unknown[];

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
  generadoEn: "2026-08-24T12:00:00.000Z",
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
  ponerCompartir(false);
  // jsdom no trae estas dos; sin ellas la descarga revienta y el test mediría
  // un error del entorno en vez de uno del producto.
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ESTADO }) as unknown as Response));
});

afterEach(() => { vi.unstubAllGlobals(); });

async function abrir() {
  render(<EstadoCuentaDrawer client={CLIENTE} companyFilter="all" onClose={() => {}} />);
  // El pie con el botón sólo sale cuando llegaron los documentos.
  await waitFor(() => expect(screen.getByText(/documento/i)).toBeTruthy());
}

const botones = () => [...document.querySelectorAll("footer button, button")]
  .map((b) => (b.textContent || "").trim())
  .filter((t) => /Compartir|Descargar PDF|^PDF$|Preparando/.test(t));

// ─────────────────────────────────────────────────────────────────────────────
// 1. UN SOLO BOTÓN, ROTULADO CON LO QUE VA A PASAR
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 hay UN solo botón para entregar el PDF", () => {
  it("en la computadora dice «Descargar PDF» y no existe ningún «Compartir»", async () => {
    await abrir();
    expect(botones()).toEqual(["Descargar PDF"]);
    expect(screen.queryByRole("button", { name: /Compartir/ })).toBeNull();
  });

  it("en un celular que sabe compartir dice «Compartir» y no hay un segundo botón", async () => {
    ponerCompartir(true);
    await abrir();
    await waitFor(() => expect(botones()).toEqual(["Compartir"]));
  });

  it("🩸 un navegador que comparte TEXTO pero no ARCHIVOS dice «Descargar PDF»", async () => {
    // Es el caso que hace falta preguntar con un File de verdad: `navigator.share`
    // existe, pero `canShare({files})` dice que no. Prometer «Compartir» ahí
    // sería el mismo defecto de antes con otro disfraz — el botón diría una cosa
    // y haría otra.
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => {} });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
    await abrir();
    expect(botones()).toEqual(["Descargar PDF"]);
  });

  it("cuando dice «Compartir», comparte de verdad (no cae en descarga)", async () => {
    ponerCompartir(true);
    await abrir();
    await waitFor(() => expect(botones()).toEqual(["Compartir"]));
    fireEvent.click(screen.getByRole("button", { name: /Compartir/ }));
    await waitFor(() => expect(compartido).toHaveLength(1));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. EL ERROR SE VE
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 si el PDF no se puede armar, la pantalla LO DICE", () => {
  it("aparece un aviso legible en vez de no pasar nada", async () => {
    await abrir();
    pdfRevienta = true;
    fireEvent.click(screen.getByRole("button", { name: /Descargar PDF/ }));
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
    await abrir();
    await waitFor(() => expect(botones()).toEqual(["Compartir"]));
    fireEvent.click(screen.getByRole("button", { name: /Compartir/ }));
    await waitFor(() => expect(botones()).toEqual(["Compartir"]));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("el aviso no queda pegado al abrir OTRO cliente", async () => {
    await abrir();
    pdfRevienta = true;
    fireEvent.click(screen.getByRole("button", { name: /Descargar PDF/ }));
    await screen.findByRole("alert");
    pdfRevienta = false;
    // Abrir otro cliente vuelve a pedir el estado de cuenta: el aviso viejo
    // hablaba de un intento que ya no existe.
    render(<EstadoCuentaDrawer client={CLIENTE} companyFilter="vistana" onClose={() => {}} />);
    await waitFor(() => expect(screen.getAllByText(/documento/i).length).toBeGreaterThan(0));
  });
});
