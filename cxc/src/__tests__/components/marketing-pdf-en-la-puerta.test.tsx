/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MARKETING › «+ REGISTRAR GASTO» — LA PANTALLA, TOCADA DE VERDAD.
 *
 * Daniel (10-sep-2026): *«Marketing PDF, que sea como la factura, porque es una
 * factura en PDF que con AI lee los campos y lo rellena solo.»*
 *
 * Lo que este archivo congela:
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
import RegistrarGastoModal from "@/app/marketing/components/RegistrarGastoModal";
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

describe("🔴 el campo de la puerta acepta la factura en PDF", () => {
  it("lo dice en el rótulo y en el accept", () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    expect(campoArchivo().accept).toBe("image/*,application/pdf");
    expect(screen.getByText("Foto o factura")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Subir foto o factura" })).toBeTruthy();
  });

  it("un PDF de más de 10 MB no entra, y se dice por qué", async () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    soltar(unPdf(11 * 1024 * 1024));
    await waitFor(() => expect(screen.getByText(/pesa más de 10 MB/)).toBeTruthy());
    // Y no quedó nada puesto.
    expect(screen.getByRole("button", { name: "Subir foto o factura" })).toBeTruthy();
  });

  it("🔴 es UNO U OTRO: elegir la factura reemplaza la foto, no la suma", async () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    soltar(unaFoto());
    await waitFor(() => expect(screen.getByText("valla.jpg")).toBeTruthy());
    soltar(unPdf());
    await waitFor(() => expect(screen.getByText("factura.pdf")).toBeTruthy());
    expect(screen.queryByText("valla.jpg")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. El PDF ES la factura: la IA lo lee y no se vuelve a pedir
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 el PDF se trata como la factura, y la IA rellena los campos", () => {
  async function llegarAlPaso3ConPdf() {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    fireEvent.click(document.querySelector('[data-marca="TH"]')!);
    soltar(unPdf());
    await waitFor(() => expect(screen.getByText("factura.pdf")).toBeTruthy());
    await elegirClienteYContinuar();
    await waitFor(() => expect(screen.getByTestId("pdf-de-la-puerta")).toBeTruthy());
  }

  it("el paso 3 NO vuelve a pedir el archivo: ya lo tiene", async () => {
    await llegarAlPaso3ConPdf();
    expect(screen.getByTestId("pdf-de-la-puerta").textContent).toBe("factura.pdf");
    expect(screen.queryAllByText("Sube el PDF de la factura")).toHaveLength(0);
    // Y la puerta lo anuncia antes de pasar.
    expect(screen.getByText(/Factura lista/)).toBeTruthy();
  });

  it("🔴 los campos llegan rellenados por la IA, listos para revisar", async () => {
    await llegarAlPaso3ConPdf();
    await waitFor(() =>
      expect((screen.getByLabelText(/Nº factura/) as HTMLInputElement).value).toBe("A-991"),
    );
    expect((screen.getByLabelText(/Proveedor/) as HTMLInputElement).value).toBe("Rótulos del Istmo");
    expect(llamadas.filter((l) => l.url.includes("ia/leer-factura"))).toHaveLength(1);
  });

  it("🔴 el mismo PDF NO se sube dos veces — una firma, un PUT, un adjunto", async () => {
    await llegarAlPaso3ConPdf();
    await waitFor(() =>
      expect((screen.getByLabelText(/Nº factura/) as HTMLInputElement).value).toBe("A-991"),
    );
    const subidasAntes = subidasDeArchivo().length;
    expect(subidasAntes).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
    await waitFor(() => expect(adjuntosCreados().length).toBe(1));

    // Ni una subida más: el adjunto reusa el archivo que ya está arriba.
    expect(subidasDeArchivo()).toHaveLength(subidasAntes);
    expect(firmasDeSubida()).toHaveLength(1);
    // 🔴 Y se guarda como la FACTURA, no como una foto.
    expect(adjuntosCreados()[0].cuerpo).toMatchObject({
      facturaId: "f-1",
      tipo: "pdf_factura",
      url: "marketing/p-1/factura.pdf",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. La foto y los otros caminos, intactos
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 lo que ya funcionaba no cambió", () => {
  it("una imagen sigue colgando como foto_factura, no como pdf_factura", async () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    fireEvent.click(document.querySelector('[data-marca="TH"]')!);
    soltar(unaFoto());
    await waitFor(() => expect(screen.getByText("valla.jpg")).toBeTruthy());
    await elegirClienteYContinuar();
    await waitFor(() => expect(screen.getAllByText("Sube el PDF de la factura").length).toBeGreaterThan(0));
    // La foto NO se subió todavía: se cuelga al guardar, como siempre.
    expect(subidasDeArchivo()).toHaveLength(0);
    expect(screen.getByText(/Foto lista/)).toBeTruthy();
  });

  it("🔴 Mueble cuelga el PDF del PROYECTO como «otro» — nunca foto_proyecto ni pdf_factura", async () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="mueble"]')!);
    fireEvent.click(document.querySelector('[data-marca="TH"]')!);
    soltar(unPdf());
    await waitFor(() => expect(screen.getByText("factura.pdf")).toBeTruthy());
    await elegirClienteYContinuar();
    // Acá no hay factura todavía: ni IA ni subida anticipada.
    await waitFor(() => expect(screen.getByTestId("entrega-guardar")).toBeTruthy());
    expect(llamadas.filter((l) => l.url.includes("ia/leer-factura"))).toHaveLength(0);
    expect(subidasDeArchivo()).toHaveLength(0);

    fireEvent.click(screen.getByTestId("entrega-guardar"));
    await waitFor(() => expect(adjuntosCreados().length).toBe(1));
    // 🩸 `foto_proyecto` se PUBLICA en la galería del cliente y `pdf_factura`
    // lo rechaza la base sin factura: el cajón correcto es «otro».
    expect(adjuntosCreados()[0].cuerpo).toMatchObject({
      proyectoId: "p-1",
      tipo: "otro",
      nombreOriginal: "factura.pdf",
    });
    expect(adjuntosCreados()[0].cuerpo?.tipo).not.toBe("foto_proyecto");
  });

  it("🔴 «Otro gasto» (sin cliente) NO intenta subir el PDF antes de tiempo", async () => {
    // La ruta que firma la subida EXIGE proyecto, factura o impulsadora, y acá
    // no hay ninguno hasta que la factura existe. El PDF viaja igual y se
    // cuelga UNA vez al guardar; sin path no hay IA y no se promete ninguna.
    abrir();
    fireEvent.click(document.querySelector('[data-camino="marca"]')!);
    fireEvent.click(document.querySelector('[data-subgasto="otro"]')!);
    fireEvent.click(document.querySelector('[data-marca="TH"]')!);
    soltar(unPdf());
    await waitFor(() => expect(screen.getByText("factura.pdf")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Continuar|Abriendo/ }));
    await waitFor(() => expect(screen.getByTestId("pdf-de-la-puerta")).toBeTruthy());
    expect(firmasDeSubida()).toHaveLength(0);
    expect(subidasDeArchivo()).toHaveLength(0);
    expect(llamadas.filter((l) => l.url.includes("ia/leer-factura"))).toHaveLength(0);
  });

  it("Impulsadora sigue abriendo el flujo de siempre, con su comprobante obligatorio", async () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="marca"]')!);
    fireEvent.click(document.querySelector('[data-subgasto="impulsadora"]')!);
    await waitFor(() =>
      expect(document.querySelector('[data-impulsadora="i1"]')).not.toBeNull(),
    );
    fireEvent.click(document.querySelector('[data-impulsadora="i1"]')!);
    fireEvent.click(screen.getByRole("button", { name: /Continuar|Abriendo/ }));
    await waitFor(() => expect(screen.getByTestId("registrar-pago-modal")).toBeTruthy());
    // Su comprobante lo exige ESE modal, que no se tocó.
    expect(screen.getByTestId("registrar-pago-modal").textContent).toContain("María Pérez");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3a. Compra → factura obligatoria
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 en una COMPRA no se guarda sin la factura en PDF", () => {
  async function llegarAlPaso3(conPdf: boolean) {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    fireEvent.click(document.querySelector('[data-marca="TH"]')!);
    if (conPdf) {
      soltar(unPdf());
      await waitFor(() => expect(screen.getByText("factura.pdf")).toBeTruthy());
    }
    await elegirClienteYContinuar();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Guardar factura/ })).toBeTruthy(),
    );
  }

  /** Llena los seis campos que el formulario pide, para aislar el del PDF. */
  function llenarLosDatos() {
    const poner = (etiqueta: RegExp, valor: string) =>
      fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
    poner(/Nº factura/, "A-1");
    poner(/Fecha/, "2026-08-15");
    poner(/Proveedor/, "Rótulos del Istmo");
    poner(/Concepto/, "Valla");
    poner(/Subtotal/, "100");
  }

  it("con los datos completos pero SIN factura, el botón no guarda y dice qué falta", async () => {
    await llegarAlPaso3(false);
    llenarLosDatos();
    await waitFor(() =>
      expect(screen.getByTestId("falta-para-guardar").textContent).toBe(
        "Falta la factura en PDF",
      ),
    );
    expect(
      (screen.getByRole("button", { name: /Guardar factura/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("🔴 y con la factura que entró por la puerta, guarda", async () => {
    await llegarAlPaso3(true);
    await waitFor(() =>
      expect((screen.getByLabelText(/Nº factura/) as HTMLInputElement).value).toBe("A-991"),
    );
    expect(screen.queryByTestId("falta-para-guardar")).toBeNull();
    expect(
      (screen.getByRole("button", { name: /Guardar factura/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("subiéndola en el paso 3 también se destraba", async () => {
    await llegarAlPaso3(false);
    llenarLosDatos();
    await waitFor(() => expect(screen.getByTestId("falta-para-guardar")).toBeTruthy());
    soltar(unPdf());
    await waitFor(() => expect(screen.queryByTestId("falta-para-guardar")).toBeNull());
    expect(
      (screen.getByRole("button", { name: /Guardar factura/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("⚠️ Impulsadora no pasa por aquí: su comprobante lo exige su propio modal", async () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="marca"]')!);
    fireEvent.click(document.querySelector('[data-subgasto="impulsadora"]')!);
    await waitFor(() =>
      expect(document.querySelector('[data-impulsadora="i1"]')).not.toBeNull(),
    );
    fireEvent.click(document.querySelector('[data-impulsadora="i1"]')!);
    fireEvent.click(screen.getByRole("button", { name: /Continuar|Abriendo/ }));
    await waitFor(() => expect(screen.getByTestId("registrar-pago-modal")).toBeTruthy());
    expect(screen.queryByTestId("falta-para-guardar")).toBeNull();
  });
});

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

// ─────────────────────────────────────────────────────────────────────────────
// 4. 🔴 CONTROL — el interruptor apagado deja la puerta como hoy
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 CONTROL — con MARKETING_PDF_EN_LA_PUERTA en false", () => {
  beforeEach(() => {
    encendido = false;
  });

  it("el campo dice «Foto» y solo acepta imágenes", () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    expect(campoArchivo().accept).toBe("image/*");
    expect(screen.getByText("Foto")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Subir foto" })).toBeTruthy();
    expect(screen.queryByText("Foto o factura")).toBeNull();
  });

  it("un PDF forzado no entra, y se dice el camino de hoy", async () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    soltar(unPdf());
    await waitFor(() => expect(screen.getByText(/paso siguiente/)).toBeTruthy());
    expect(screen.queryByText("factura.pdf")).toBeNull();
  });

  it("y el paso 3 es el de hoy: pide el PDF y NO llama a la IA", async () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    fireEvent.click(document.querySelector('[data-marca="TH"]')!);
    await elegirClienteYContinuar();
    await waitFor(() => expect(screen.getAllByText("Sube el PDF de la factura").length).toBeGreaterThan(0));
    expect(screen.queryByTestId("pdf-de-la-puerta")).toBeNull();
    // 🔴 Y subiéndolo ahí, como hoy: tampoco se llama a la IA — el paso 3 no
    // cambió ni un poco mientras el interruptor esté apagado.
    soltar(unPdf());
    await waitFor(() => expect(screen.getByText(/factura\.pdf/)).toBeTruthy());
    expect(llamadas.filter((l) => l.url.includes("ia/leer-factura"))).toHaveLength(0);
    expect(firmasDeSubida()).toHaveLength(0);
  });

  it("🔴 y la factura sigue siendo OPCIONAL: nada de «Falta la factura en PDF»", async () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]')!);
    fireEvent.click(document.querySelector('[data-marca="TH"]')!);
    await elegirClienteYContinuar();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Guardar factura/ })).toBeTruthy(),
    );
    const poner = (etiqueta: RegExp, valor: string) =>
      fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
    poner(/Nº factura/, "A-1");
    poner(/Fecha/, "2026-08-15");
    poner(/Proveedor/, "Rótulos del Istmo");
    poner(/Concepto/, "Valla");
    poner(/Subtotal/, "100");
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /Guardar factura/ }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(screen.queryByTestId("falta-para-guardar")).toBeNull();
  });
});
