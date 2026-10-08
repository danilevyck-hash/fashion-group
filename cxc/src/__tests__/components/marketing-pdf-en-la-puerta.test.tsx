/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MARKETING › «+ REGISTRAR GASTO» — LA PANTALLA, TOCADA DE VERDAD.
 *
 * Daniel (10-sep-2026): *«Marketing PDF, que sea como la factura, porque es una
 * factura en PDF que con AI lee los campos y lo rellena solo.»*
 *
 * 🔴 8-oct-2026: el registro de antes (`RegistrarGastoModalAnterior`) se borró;
 * de este archivo queda el freno de la IA en `FacturaForm`. La puerta nueva la
 * cubre `marketing-puerta-gasto.test.tsx`.
 *
 * Lo que este archivo congelaba:
 *   1. El campo de la puerta acepta PDF y lo dice — con el interruptor ENCENDIDO.
 *   2. Un PDF se trata como LA FACTURA: se lee con la IA que ya existía y el
 *      paso 3 llega con los campos puestos, SIN volver a pedir el archivo.
 *   3. 🔴 NUNCA SE SUBE DOS VECES: una sola firma de subida y un solo PUT.
 *      El adjunto queda como `pdf_factura`, no como `foto_factura`.
 *   4. Una imagen se comporta EXACTAMENTE como hoy.
 *   5. Mueble cuelga el PDF del PROYECTO como `otro` — nunca `foto_proyecto`
 *      (esa se PUBLICA en la galería del cliente) ni `pdf_factura` (que la
 *      base rechaza sin factura).
 *   6. 🔴 CONTROL — con el interruptor APAGADO, la puerta es la de hoy.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { invalidarDirectorioClientes } from "@/lib/hooks/useBusquedaClientes";
import type { MkMarca } from "@/lib/marketing/types";

// 🔴 El interruptor, controlable por test. El resto del módulo es el REAL.
let encendido = true;
vi.mock("@/lib/marketing/pdf-en-la-puerta", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/marketing/pdf-en-la-puerta")>();
  return {
    ...real,
    get MARKETING_PDF_EN_LA_PUERTA() {
      return encendido;
    },
    aceptaDeLaPuerta: (v?: boolean) => real.aceptaDeLaPuerta(v ?? encendido),
    rotuloDeLaPuerta: (v?: boolean) => real.rotuloDeLaPuerta(v ?? encendido),
    rotuloBotonDeLaPuerta: (v?: boolean) => real.rotuloBotonDeLaPuerta(v ?? encendido),
    clasificarArchivoDeLaPuerta: (a: { name: string; type: string; size: number }, v?: boolean, mb?: number) =>
      real.clasificarArchivoDeLaPuerta(a, v ?? encendido, mb),
  };
});

// El formulario de MUEBLES es su propio modal y no se toca en este cambio: se
// dobla para poder disparar su `onSaved` y mirar CÓMO se cuelga el PDF.
vi.mock("@/components/marketing/EntregaForm", () => ({
  default: ({ onSaved }: { onSaved: () => void | Promise<void> }) => (
    <button type="button" data-testid="entrega-guardar" onClick={() => void onSaved()}>
      Guardar entrega
    </button>
  ),
}));

vi.mock("@/app/marketing/components/RegistrarPagoModal", () => ({
  default: ({ impulsadora }: { impulsadora: { nombre: string } }) => (
    <div data-testid="registrar-pago-modal">Pago a {impulsadora.nombre}</div>
  ),
}));

const MARCAS: MkMarca[] = [
  { id: "m-th", codigo: "TH", nombre: "Tommy Hilfiger" } as MkMarca,
];
const DIRECTORIO = [{ codigo: "D-30", nombre: "City Moda Chorrera" }];

/** Lo que la IA devuelve — mockeado: acá no se gasta una llamada de verdad. */
const RESPUESTA_IA = {
  numero_factura: "A-991",
  fecha_factura: "2026-08-15",
  proveedor: "Rótulos del Istmo",
  concepto: "Valla en la vía España",
  subtotal: 1250,
  itbms_pct: 7 as const,
};

interface Llamada {
  url: string;
  metodo: string;
  cuerpo: Record<string, unknown> | null;
}

function instalarFetch() {
  const llamadas: Llamada[] = [];
  const fn = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    let cuerpo: Record<string, unknown> | null = null;
    if (typeof init?.body === "string") {
      try {
        cuerpo = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        cuerpo = null;
      }
    }
    llamadas.push({ url, metodo: (init?.method ?? "GET").toUpperCase(), cuerpo });
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

    if (url.includes("/api/marketing/impulsadoras")) {
      return json([
        { id: "i1", nombre: "María Pérez", marcas: [{ marca: { id: "m-th", nombre: "Tommy Hilfiger" } }], mesActual: null },
      ]);
    }
    if (url.includes("/api/marketing/inventario/productos")) return json([]);
    if (url.includes("check-duplicate")) return json({ existe: false, facturas: [] });
    if (url.includes("/api/marketing/adjuntos/upload-url")) {
      return json({ uploadUrl: "https://storage.local/subir", token: "t", path: "marketing/p-1/factura.pdf" });
    }
    if (url.includes("/api/marketing/adjuntos")) return json({ id: "adj-1" });
    if (url.includes("/api/marketing/ia/leer-factura")) return json(RESPUESTA_IA);
    if (url.includes("/api/marketing/proyectos")) {
      if ((init?.method ?? "GET").toUpperCase() === "POST") {
        return json({ id: "p-1", tienda: "City Moda Chorrera", nombre: "City Moda Chorrera" });
      }
      return json([]);
    }
    if (/\/api\/marketing\/facturas\/[^/]+\/marcas/.test(url)) return json({ ok: true });
    if (url.includes("/api/marketing/facturas")) return json({ id: "f-1" });
    if (url.includes("/api/clientes")) return json({ clientes: DIRECTORIO, total: DIRECTORIO.length });
    if (url.startsWith("https://storage.local")) return { ok: true, status: 200, json: async () => ({}) };
    return json({});
  });
  vi.stubGlobal("fetch", fn);
  return llamadas;
}

let llamadas: Llamada[];

beforeEach(() => {
  encendido = true;
  invalidarDirectorioClientes();
  llamadas = instalarFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function abrir() {
  const onSaved = vi.fn();
  render(
    <ToastProvider>
      <RegistrarGastoModal marcas={MARCAS} onClose={vi.fn()} onSaved={onSaved} />
    </ToastProvider>,
  );
  return { onSaved };
}

const campoArchivo = () => document.querySelector('input[type="file"]') as HTMLInputElement;

function soltar(file: File) {
  Object.defineProperty(campoArchivo(), "files", { value: [file], configurable: true });
  fireEvent.change(campoArchivo());
}

const unPdf = (size = 1024) =>
  new File([new Uint8Array(size)], "factura.pdf", { type: "application/pdf" });
const unaFoto = () => new File([new Uint8Array(64)], "valla.jpg", { type: "image/jpeg" });

/** Elige el cliente de la lista (queda con su D-XXX) y toca Continuar. */
async function elegirClienteYContinuar() {
  const campo = screen.getByPlaceholderText("Busca la tienda…") as HTMLInputElement;
  fireEvent.focus(campo);
  fireEvent.change(campo, { target: { value: "City" } });
  await waitFor(() => expect(screen.getByText("City Moda Chorrera")).toBeTruthy());
  fireEvent.mouseDown(screen.getByText("City Moda Chorrera"));
  fireEvent.click(screen.getByRole("button", { name: /Continuar|Abriendo/ }));
}

const subidasDeArchivo = () => llamadas.filter((l) => l.url.startsWith("https://storage.local"));
const firmasDeSubida = () => llamadas.filter((l) => l.url.includes("/adjuntos/upload-url"));
const adjuntosCreados = () =>
  llamadas.filter((l) => l.url.endsWith("/api/marketing/adjuntos") && l.metodo === "POST");

// ─────────────────────────────────────────────────────────────────────────────
// 1. La puerta acepta la factura en PDF
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 2. El PDF ES la factura: la IA lo lee y no se vuelve a pedir
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 3. La foto y los otros caminos, intactos
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 3a. Compra → factura obligatoria
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 3b. El PDF de la puerta se lee UNA sola vez, pase lo que pase
// ─────────────────────────────────────────────────────────────────────────────

describe("🩸 la IA se llama UNA vez por archivo, aunque el formulario se vuelva a dibujar", () => {
  it("con un callback que cambia en cada render, sigue siendo UNA llamada", async () => {
    // 🔑 Por qué así: hoy la puerta le pasa un callback ESTABLE, así que el
    // efecto no se repetiría ni sin freno. Este caso pone el escenario que sí
    // rompe —un callback nuevo en cada render, que es lo más fácil de escribir
    // el día que alguien toque esa línea— y exige que la IA no se llame dos
    // veces por el mismo PDF. Una llamada de más es plata y es un formulario
    // que se rellena solo encima de lo que la persona ya corrigió.
    const { FacturaForm } = await import("@/components/marketing/FacturaForm");
    function Arnes() {
      const [n, setN] = useState(0);
      return (
        <>
          <button type="button" data-testid="redibujar" onClick={() => setN((v) => v + 1)}>
            {n}
          </button>
          <FacturaForm
            proyecto={{ id: "p-1", marcas: [] }}
            marcasCatalogo={MARCAS}
            marcaFija={MARCAS[0]}
            pdfInicial={unPdf()}
            onSubmit={async () => {}}
            onCancel={() => {}}
            onUploadPdfForIA={async () => "marketing/p-1/factura.pdf"}
          />
        </>
      );
    }
    render(
      <ToastProvider>
        <Arnes />
      </ToastProvider>,
    );
    await waitFor(() =>
      expect(llamadas.filter((l) => l.url.includes("ia/leer-factura"))).toHaveLength(1),
    );
    fireEvent.click(screen.getByTestId("redibujar"));
    fireEvent.click(screen.getByTestId("redibujar"));
    await waitFor(() => expect(screen.getByTestId("redibujar").textContent).toBe("2"));
    expect(llamadas.filter((l) => l.url.includes("ia/leer-factura"))).toHaveLength(1);
  });
});

