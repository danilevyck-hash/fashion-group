/**
 * Marketing › SOLO LO COBRABLE (7-oct-2026, `MKT_SOLO_COBRABLE_2026_10`).
 *
 * Candado del rediseño PRENDIDO (se fuerza en `true` acá; en el código está
 * APAGADO, y `marketing-solo-cobrable-apagado` cuida que apagado sea la
 * pantalla de hoy byte por byte). Con el código de antes este archivo es ROJO:
 * el módulo `solo-cobrable-2026-10` no existe.
 *
 *   · Registrar: el comprobante primero, después Marca · Tienda · Se cobra;
 *     sin «A cargo de la empresa», sin «Se reporta», sin asteriscos, sin
 *     «Varias tiendas». Lo que falta sale TODO junto al tocar Guardar.
 *   · Lo que viaja: la marca, la tienda, el 50 % y `seReporta: true`.
 *   · Editar: «Se cobra» suma «No recuperable» → `pctALaMarca: 0` y
 *     `seReporta: false`.
 *   · Las reglas puras: carpetas del ZIP, montos, portada, no recuperable,
 *     tiendas sin foto y Recobrado.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import type { MkMarca } from "@/lib/marketing/types";

vi.mock("@/lib/marketing/solo-cobrable-2026-10", async (original) => ({
  ...(await original<typeof import("@/lib/marketing/solo-cobrable-2026-10")>()),
  MKT_SOLO_COBRABLE_2026_10: true,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/marketing",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const { default: RegistrarGastoModal } = await import("@/app/marketing/components/RegistrarGastoModal");
const { FacturaForm } = await import("@/components/marketing/FacturaForm");
const { default: MarcasCelular } = await import("@/app/marketing/components/celular/MarcasCelular");
const lib = await import("@/lib/marketing/solo-cobrable-2026-10");
const prov = await import("@/lib/marketing/proveedores-2026-10");

const TOMMY = { id: "m-th", codigo: "TH", nombre: "Tommy Hilfiger", activo: true } as MkMarca;
const CALVIN = { id: "m-ck", codigo: "CK", nombre: "Calvin Klein", activo: true } as MkMarca;
const OTROS = { id: "m-otr", codigo: "OTR", nombre: "Otros", activo: false } as MkMarca;

const IA = {
  numero_factura: "0000062700",
  fecha_factura: "2026-10-03",
  proveedor: "Impresora Comercial",
  concepto: "Caja de luz Calvin Klein",
  subtotal: 100,
  itbms_pct: 7 as const,
};

interface Llamada {
  url: string;
  metodo: string;
  cuerpo: Record<string, unknown> | null;
}
let llamadas: Llamada[] = [];

beforeEach(() => {
  llamadas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const metodo = (init?.method ?? "GET").toUpperCase();
      const cuerpo = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      llamadas.push({ url, metodo, cuerpo });
      const json = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
      if (url.includes("check-duplicate")) return json({ existe: false, facturas: [] });
      if (url.includes("/api/marketing/adjuntos/upload-url")) return json({ uploadUrl: "https://storage.local/x", path: "marketing/x.pdf" });
      if (url.includes("/api/marketing/adjuntos")) return json({ id: "adj-1" });
      if (url.includes("/api/marketing/ia/leer-factura")) return json(IA);
      if (url.includes("/api/marketing/facturas/proveedores")) return json({ proveedores: [] });
      if (url.includes("/api/marketing/facturas")) return json({ id: "f-1" });
      return json({});
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function abrirRegistro(extra: Record<string, unknown> = {}) {
  render(
    <ToastProvider>
      <RegistrarGastoModal marcas={[TOMMY, CALVIN, OTROS]} onClose={() => {}} onSaved={() => {}} {...extra} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText("Factura de un proveedor"));
}

describe("solo lo cobrable · registrar, en el orden del trabajo", () => {
  it("una sola pantalla: comprobante → datos → Marca · Tienda · Se cobra", () => {
    abrirRegistro();
    const pantalla = screen.getByTestId("registro-del-cargo");
    const texto = pantalla.textContent ?? "";
    expect(texto.indexOf("Comprobante")).toBeLessThan(texto.indexOf("Nº factura"));
    expect(texto.indexOf("Nº factura")).toBeLessThan(texto.indexOf("Marca"));
    expect(texto.indexOf("Marca")).toBeLessThan(texto.indexOf("Tienda"));
    expect(texto.indexOf("Tienda")).toBeLessThan(texto.indexOf("Se cobra"));
    // Lo que sobra si solo entra lo cobrable, fuera:
    expect(texto).not.toContain("A cargo de la empresa");
    expect(texto).not.toContain("Se reporta a la marca");
    expect(texto).not.toContain("Varias tiendas");
    expect(texto).not.toContain("Sin tienda");
    expect(pantalla.querySelector(".text-red-500")).toBeNull();
    // El comprobante se pide UNA vez.
    expect(screen.queryByText("Sube el PDF de la factura")).toBeNull();
    // Solo 100 % y 50 %, y viene en 50 % (Daniel, 8-oct-2026).
    expect(screen.getByRole("radio", { name: "100 %" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("radio", { name: "50 %" }).getAttribute("aria-checked")).toBe("true");
    // La marca inactiva no se ofrece.
    expect(screen.queryByRole("radio", { name: "Otros" })).toBeNull();
  });

  it("Guardar sin nada dice TODO lo que falta, de una vez", () => {
    abrirRegistro();
    fireEvent.click(screen.getByText("Guardar factura"));
    const falta = screen.getByTestId("falta-para-guardar").textContent ?? "";
    for (const f of ["el comprobante", "el N.º de factura", "el proveedor", "el concepto", "el subtotal", "la marca", "la tienda"]) {
      expect(falta).toContain(f);
    }
    // «Se cobra» ya viene en 50 %: no falta.
    expect(falta).not.toContain("cuánto se cobra");
    expect(llamadas.some((l) => l.metodo === "POST" && l.url.endsWith("/api/marketing/facturas"))).toBe(false);
  });

  it("con el PDF la IA llena los datos, y viaja la marca, la tienda y el 50 %", async () => {
    abrirRegistro({ marcaInicial: CALVIN, tiendaCodigo: "D-170", tiendaNombre: "Nova Lux, S.A." });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
    const pdf = new File(["%PDF"], "factura-62700.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [pdf] } });
    await waitFor(() => expect((document.getElementById("factura-numero") as HTMLInputElement).value).toBe("0000062700"));
    fireEvent.click(screen.getByRole("radio", { name: "50 %" }));
    fireEvent.click(screen.getByText("Guardar factura"));
    await waitFor(() =>
      expect(llamadas.some((l) => l.metodo === "POST" && l.url.endsWith("/api/marketing/facturas"))).toBe(true),
    );
    const post = llamadas.find((l) => l.metodo === "POST" && l.url.endsWith("/api/marketing/facturas"))!;
    expect(post.cuerpo).toMatchObject({
      marcaId: "m-ck",
      pctALaMarca: 50,
      tiendaCodigo: "D-170",
      seReporta: true,
      numeroFactura: "0000062700",
    });
  });

  it("Multi Fashion no entra por aquí: es tienda propia", () => {
    abrirRegistro({ marcaInicial: TOMMY, tiendaCodigo: "D-108", tiendaNombre: "Multi Fashion Holding" });
    fireEvent.click(screen.getByText("Guardar factura"));
    expect(screen.getByTestId("falta-para-guardar").textContent).toContain("Multi Fashion es tienda propia");
  });
});

describe("solo lo cobrable · al editar, «No recuperable»", () => {
  it("la 7766 de Boston pasa a No recuperable: % 0 y no se reporta", async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <ToastProvider>
        <FacturaForm
          proyecto={{ id: "", marcas: [] }}
          marcasCatalogo={[TOMMY, CALVIN]}
          initial={{ id: "f-7766", numero_factura: "11-000007766", fecha_factura: "2026-09-02", proveedor: "Confecciones Boston", concepto: "Tazas", subtotal: 6163.2, itbms: 0, se_reporta: true }}
          initialMarcas={[{ marcaId: CALVIN.id, porcentaje: 100 }]}
          editarDatosDelGasto
          onSubmit={onSubmit}
          onCancel={() => {}}
        />
      </ToastProvider>,
    );
    expect(screen.getByTestId("se-cobra-al-editar")).toBeTruthy();
    expect(screen.queryByText("Reporte a la marca")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "No recuperable" }));
    expect(screen.getByText(/No suma a la marca ni entra al ZIP/)).toBeTruthy();
    fireEvent.click(screen.getByText("Guardar factura"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [datos] = onSubmit.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(datos.pctALaMarca).toBe(0);
    expect((datos.gasto as Record<string, unknown>).seReporta).toBe(false);
    // La marca se conserva: no se manda una lista nueva.
    expect(datos.marcasSeleccionadas).toEqual([]);
  });
});

describe("solo lo cobrable · la portada en el celular es Marcas", () => {
  it("título «Marketing», sin «‹ Marketing», y las otras secciones al final", () => {
    render(
      <MarcasCelular
        abiertas={[]}
        grupos={[]}
        cargando={false}
        escribe
        onRegistrarGasto={() => {}}
        onSelectBloque={() => {}}
        onSelectCerrado={() => {}}
        hrefVolver="/marketing"
        puertas={<p>Otras secciones</p>}
      />,
    );
    expect(screen.getByText("Marketing")).toBeTruthy();
    expect(screen.queryByText("‹ Marketing")).toBeNull();
    expect(screen.getByText("Otras secciones")).toBeTruthy();
  });
});

describe("solo lo cobrable · las reglas", () => {
  it("la carpeta del ZIP de una factura vieja sin tienda: las 4 de Boston a mobiliario, el resto a General", () => {
    const c = { mobiliario: "Mobiliario y exhibición", general: "General" };
    expect(lib.carpetaDeFacturaSinTienda("f60ad102-cfc4-4e0e-955d-040c14136f6e", c)).toBe("Mobiliario y exhibición");
    expect(lib.carpetaDeFacturaSinTienda("a76a1606-fbfa-4321-bee4-a8aac787930c", c)).toBe("Mobiliario y exhibición");
    expect(lib.carpetaDeFacturaSinTienda("cualquier-otra", c)).toBe("General");
    expect(lib.carpetaDeFacturaSinTienda(null, c)).toBe("General");
  });

  it("la tienda es obligatoria y se guarda en mayúsculas", () => {
    const propia = (c: string) => c === "D-108";
    expect(lib.faltaEnElDestino({ marcaId: "", tienda: null, pct: null }, propia)).toEqual(["la marca", "la tienda", "cuánto se cobra"]);
    expect(lib.faltaEnElDestino({ marcaId: "m", tienda: { codigo: "D-25", nombre: "x" }, pct: 100 }, propia)).toEqual([]);
    expect(lib.tiendaQueSeGuarda({ codigo: " d-25 ", nombre: "x" })).toBe("D-25");
    expect(lib.tiendaQueSeGuarda(null)).toBeNull();
  });

  it("lo cobrable: null = 100 %, 50 = la mitad, 0 = nada", () => {
    expect(lib.montoCobrable(6163.2, null)).toBe(6163.2);
    expect(lib.montoCobrable(81.32, 50)).toBe(40.66);
    expect(lib.montoCobrable(545.7, 0)).toBe(0);
  });

  it("la portada: sin las marcas vacías, la mayor arriba, y desde cuándo", () => {
    const filas = [
      { key: "th", reportado: 25099.23, cantidadReportada: 21 },
      { key: "kl", reportado: 0, cantidadReportada: 0 },
      { key: "ck", reportado: 30869.23, cantidadReportada: 20 },
    ];
    expect(lib.porCobrar(filas).map((f) => f.key)).toEqual(["ck", "th"]);
    expect(lib.subtituloPorCobrar(21, "2026-08-12T03:21:05Z", () => "12 ago 2026")).toBe("21 gastos · desde 12 ago 2026");
    expect(lib.subtituloPorCobrar(1, null, () => "")).toBe("1 gasto");
  });

  it("no recuperable: tienda propia, a cargo de la empresa o no se reporta", () => {
    expect(lib.motivoNoRecuperable({ esTiendaPropia: true })).toBe("tienda-propia");
    expect(lib.motivoNoRecuperable({ esTiendaPropia: false, pctALaMarca: 0, seReporta: false })).toBe("a-cargo-de-la-empresa");
    expect(lib.motivoNoRecuperable({ esTiendaPropia: false, seReporta: false })).toBe("no-se-reporta");
    expect(lib.motivoNoRecuperable({ esTiendaPropia: false, pctALaMarca: null, seReporta: true })).toBeNull();
  });

  it("las pestañas: apagado, las de hoy; prendido, Marcas primero y No recuperable al final", () => {
    const hoy = ["tiendas", "marcas", "impulsadoras", "mobiliario", "proveedores"] as const;
    expect(lib.pestanasDeLaPortada(hoy, false)).toBe(hoy);
    expect(lib.pestanasDeLaPortada(hoy, true)).toEqual(["marcas", "tiendas", "impulsadoras", "mobiliario", "proveedores", "no-recuperable"]);
  });

  it("al cerrar: qué tiendas no tienen foto (la del período o sin sello cuenta)", () => {
    const fotos = [
      { tienda_codigo: "D-118", periodo_id: "p-th" },
      { tienda_codigo: "D-14", periodo_id: null },
      { tienda_codigo: "D-24", periodo_id: "p-viejo" },
    ];
    expect(lib.tiendasSinFoto(["D-170", "D-118", "D-14", "D-24"], fotos, "p-th")).toEqual(["D-170", "D-24"]);
  });

  it("Recobrado = lo de un período cerrado; lo abierto es Por cobrar", () => {
    const cobradas = lib.facturasEnPeriodoCerrado(
      [{ id: "mid", estado: "cerrado" }, { id: "th", estado: "abierto" }],
      [
        { periodo_id: "mid", tipo: "factura", documento_id: "f-1" },
        { periodo_id: "th", tipo: "factura", documento_id: "f-2" },
        { periodo_id: "mid", tipo: "entrega", documento_id: "e-1" },
      ],
    );
    expect([...cobradas]).toEqual(["f-1"]);
    const base = { marcaNombre: "Tommy Hilfiger", seReporta: true, monto: 100, pctALaMarca: null };
    expect(prov.montoRecobrado({ ...base, cobrado: true })).toBe(100);
    expect(prov.montoRecobrado({ ...base, cobrado: false })).toBe(0);
    expect(prov.montoPorCobrar({ ...base, cobrado: false })).toBe(100);
    // Apagado (sin `cobrado`), como hoy.
    expect(prov.montoRecobrado(base)).toBe(100);
    expect(prov.montoPorCobrar(base)).toBe(0);
  });
});
