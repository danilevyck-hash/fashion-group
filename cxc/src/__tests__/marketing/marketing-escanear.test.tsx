/**
 * CANDADO — MARKETING › ESCANEAR LA FACTURA DESDE EL TELÉFONO (24-sep-2026).
 *
 * Daniel, textual: *«que se pueda meter un gasto por el teléfono así se
 * escanea»*. Eligió la opción 4c: tres puertas —escanear con la cámara, elegir
 * el PDF o escribirlo a mano—, las tres terminando en la MISMA pantalla de
 * revisar.
 *
 * 🔑 El lector YA EXISTÍA (`/api/marketing/ia/leer-factura`, seis campos).
 * Faltaban dos cosas chicas, y son las dos que este archivo no deja aflojar:
 *
 *   1. EL INPUT DE ESCANEAR LLEVA `capture` — la cámara de atrás
 *      (`environment`), la que mira al papel — y acepta solo imagen.
 *   2. LA FOTO SE ACHICA ANTES DE SUBIR: 1600 px de lado mayor, JPEG 0,8, los
 *      MISMOS números de Reclamos y Mobiliario.
 *   3. EL LECTOR SE LLAMA CON LA IMAGEN, por el mismo camino del PDF: se sube
 *      «sin dueño» (`paraLeerConIA`) y se pide `POST .../ia/leer-factura`.
 *   4. EL PAYLOAD DE GUARDAR ES EL DE SIEMPRE: el POST de la factura no ganó
 *      ni un campo, y la foto se cuelga como `foto_factura` por el camino de
 *      siempre.
 *   5. El servidor manda el `mediaType` que corresponde: una foto va como
 *      imagen y un PDF sigue yendo como documento.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import {
  ACCEPT_DE_LA_CAMARA,
  CALIDAD_DE_LA_FOTO,
  CAPTURE_DE_LA_CAMARA,
  LADO_MAYOR_DE_LA_FOTO,
  initialDeLaLectura,
} from "@/lib/marketing/celular";
import { bloqueDeArchivo, tipoPorNombre } from "@/lib/ia/bloque-archivo";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

// La compresión de verdad necesita canvas: se dobla y se ANOTA con qué la
// llamaron, que es justo lo que este candado tiene que probar.
const compresion = vi.hoisted(() => ({ llamadas: [] as Array<{ maxDimension?: number; quality?: number }> }));
vi.mock("@/app/reclamos/components/fotoUpload", () => ({
  validateFotoFile: () => null,
  compressImage: async (f: File, opts: { maxDimension?: number; quality?: number } = {}) => {
    compresion.llamadas.push(opts);
    return new File(["chica"], "factura.jpg", { type: "image/jpeg" });
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketing",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

import PuertaGasto from "@/app/marketing/components/PuertaGasto";

function ponerCelular(esCelular: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (consulta: string) => ({
      matches: esCelular,
      media: consulta,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}

const MARCAS = [{ id: "m-th", nombre: "Tommy Hilfiger", codigo: "TH" }];

const LECTURA = {
  numero_factura: "0000065466",
  fecha_factura: "2026-09-21",
  proveedor: "Impresora Comercial S a",
  concepto: "Remodelacion",
  subtotal: 972.2,
  itbms_pct: 7 as const,
};

describe("Marketing › escanear la factura", () => {
  let llamadas: Array<{ url: string; body: unknown }>;

  beforeEach(() => {
    ponerCelular(true);
    compresion.llamadas = [];
    llamadas = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        // El PUT a Storage manda el archivo, no JSON: no se intenta parsear.
        let cuerpo: unknown = null;
        if (init?.body && typeof init.body === "string") {
          try {
            cuerpo = JSON.parse(init.body);
          } catch {
            cuerpo = null;
          }
        }
        llamadas.push({ url: String(url), body: cuerpo });
        if (String(url).includes("/api/marketing/adjuntos/upload-url")) {
          return { ok: true, json: async () => ({ uploadUrl: "https://x/put", token: "t", path: "sin-dueno/f.jpg" }) };
        }
        if (String(url).includes("/api/marketing/ia/leer-factura")) {
          return { ok: true, json: async () => LECTURA };
        }
        if (String(url) === "https://x/put") return { ok: true, json: async () => ({}) };
        if (String(url).includes("/api/marketing/facturas/proveedores")) {
          return { ok: true, json: async () => ({ proveedores: [] }) };
        }
        return { ok: true, json: async () => ({}) };
      }) as unknown as typeof fetch,
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function abrirLaFactura() {
    render(
      <ToastProvider>
        <PuertaGasto
          marcas={MARCAS as never}
          tiendaCodigo="D-118"
          tiendaNombre="Outlet Duty Free N3"
          onClose={() => {}}
          onSaved={() => {}}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("Factura de un proveedor"));
  }

  it("1 · en el celular hay TRES puertas, y la de escanear abre la cámara de atrás", () => {
    abrirLaFactura();
    expect(screen.getByText("Escanear con la cámara")).toBeTruthy();
    expect(screen.getByText("Elegir el PDF")).toBeTruthy();
    expect(screen.getByText("Escribirlo a mano")).toBeTruthy();

    const input = screen.getByTestId("escanear-la-factura") as HTMLInputElement;
    // 🔴 `capture` = la cámara de atrás, la que mira al papel.
    expect(input.getAttribute("capture")).toBe(CAPTURE_DE_LA_CAMARA);
    expect(CAPTURE_DE_LA_CAMARA).toBe("environment");
    // Solo imagen: un PDF entra por su propia puerta.
    expect(input.getAttribute("accept")).toBe(ACCEPT_DE_LA_CAMARA);
    expect(ACCEPT_DE_LA_CAMARA).toBe("image/*");
  });

  it("2 · la foto se achica antes de subir (1600 px · JPEG 0,8) y el lector la lee", async () => {
    abrirLaFactura();
    const input = screen.getByTestId("escanear-la-factura") as HTMLInputElement;
    const foto = new File(["x".repeat(2000)], "IMG_0001.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [foto] } });

    await waitFor(() => expect(compresion.llamadas.length).toBe(1));
    expect(compresion.llamadas[0].maxDimension).toBe(LADO_MAYOR_DE_LA_FOTO);
    expect(compresion.llamadas[0].quality).toBe(CALIDAD_DE_LA_FOTO);
    expect(LADO_MAYOR_DE_LA_FOTO).toBe(1600);
    expect(CALIDAD_DE_LA_FOTO).toBe(0.8);

    // 🔴 Se sube «sin dueño» para que la IA la lea — el MISMO camino del PDF.
    await waitFor(() =>
      expect(llamadas.some((l) => l.url.includes("/adjuntos/upload-url"))).toBe(true),
    );
    const subida = llamadas.find((l) => l.url.includes("/adjuntos/upload-url"))!;
    expect((subida.body as { paraLeerConIA?: boolean }).paraLeerConIA).toBe(true);
    expect((subida.body as { contentType?: string }).contentType).toBe("image/jpeg");

    // 🔴 Y se le pide al lector que ya existía, con su `path`.
    await waitFor(() =>
      expect(llamadas.some((l) => l.url.includes("/ia/leer-factura"))).toBe(true),
    );
    const lector = llamadas.find((l) => l.url.includes("/ia/leer-factura"))!;
    expect((lector.body as { path?: string }).path).toBe("sin-dueno/f.jpg");

    // 🔴 Y NADA se guardó: no hubo POST de la factura.
    expect(llamadas.some((l) => l.url.endsWith("/api/marketing/facturas"))).toBe(false);
  });

  it("3 · lo leído entra por el `initial` que ya existía, sin campos nuevos", () => {
    const initial = initialDeLaLectura(LECTURA)!;
    expect(initial.numero_factura).toBe("0000065466");
    expect(initial.fecha_factura).toBe("2026-09-21");
    expect(initial.proveedor).toBe("Impresora Comercial S a");
    expect(initial.concepto).toBe("Remodelacion");
    expect(initial.subtotal).toBe(972.2);
    // El ITBMS se guarda en DÓLARES: subtotal × 7 ÷ 100.
    expect(initial.itbms).toBe(68.05);
    // Sin lectura no se inventa nada.
    expect(initialDeLaLectura(null)).toBeUndefined();
  });

  it("4 · el lector manda una foto como IMAGEN y un PDF sigue yendo como documento", () => {
    expect(tipoPorNombre("sin-dueno/f.jpg")).toBe("image/jpeg");
    expect(tipoPorNombre("sin-dueno/f.pdf")).toBe("application/pdf");
    expect(tipoPorNombre("sin-dueno/f")).toBe("application/pdf");
    expect(bloqueDeArchivo("image/jpeg", "AAA").type).toBe("image");
    expect(bloqueDeArchivo("application/pdf", "AAA").type).toBe("document");
  });

  it("5 · en la computadora la puerta es la de siempre: un campo de archivo, sin cámara", () => {
    ponerCelular(false);
    abrirLaFactura();
    expect(screen.queryByTestId("escanear-la-factura")).toBeNull();
    expect(screen.queryByText("Escanear con la cámara")).toBeNull();
    expect(screen.getByTestId("subir-archivo-de-la-puerta")).toBeTruthy();
  });
});
