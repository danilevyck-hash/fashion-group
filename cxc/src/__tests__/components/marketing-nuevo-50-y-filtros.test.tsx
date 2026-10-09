// ============================================================================
// 🔴 CANDADO — Marketing nuevo (8-oct-2026, Daniel probándolo en vivo).
//
//   1. «Quiero que al hacer un gasto el default sea 50 %.» La factura y el
//      La factura viene en 50 %, con 100 % a un toque. Sin tocar nada, lo que
//      viaja es 50. El pago de impulsadora NO pregunta: siempre al 100 % a su
//      marca (Daniel, 8-oct-2026: «las impulsadoras son al 100 %. Ya
//      definitivo»), con un texto fijo en el Marketing nuevo.
//   1b. «No recuperable» al registrar: vive en
//      `marketing-no-recuperable-sin-motivo.test.tsx` (sin Motivo, 8-oct-2026).
//   2. Gastos abre en Estado «Por cobrar»; cada filtro lleva su nombre y
//      «Todas», y Tienda ya no ofrece «Sin tienda» (Daniel: «Marca es una
//      opción, igual que Tienda y Sin tienda; eso confunde»; cada factura va a
//      una tienda).
//
// Con el código de antes es ROJO: la factura venía sin nada elegido, el pago de
// impulsadora no tenía «Se cobra», Gastos abría en «Estado» (todos) y los
// filtros no tenían nombre.
// ============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import type { MkMarca, ImpulsadoraConEstado } from "@/lib/marketing/types";
import type { GastoDeLaLista, MarketingDelCobro } from "@/lib/marketing/zip-marca";

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketing",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

import RegistrarGastoModal from "@/app/marketing/components/RegistrarGastoModal";
import RegistrarPagoModal from "@/app/marketing/components/RegistrarPagoModal";
import GastosNuevo from "@/app/marketing/components/nuevo/GastosNuevo";
import { SoloCobrableContexto } from "@/lib/marketing/solo-cobrable-contexto";

const TOMMY = { id: "m-th", codigo: "TH", nombre: "Tommy Hilfiger", activo: true } as MkMarca;
const CALVIN = { id: "m-ck", codigo: "CK", nombre: "Calvin Klein", activo: true } as MkMarca;

let posts: Array<{ url: string; cuerpo: Record<string, unknown> }> = [];
beforeEach(() => {
  posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? "GET").toUpperCase() === "POST" && typeof init?.body === "string") {
        posts.push({ url, cuerpo: JSON.parse(init.body) });
      }
      const json = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
      if (url.includes("check-duplicate")) return json({ existe: false, facturas: [] });
      if (url.includes("/api/marketing/adjuntos/upload-url")) return json({ uploadUrl: "https://storage.local/x", path: "marketing/x.pdf" });
      if (url.includes("/api/marketing/ia/leer-factura"))
        return json({ numero_factura: "62700", fecha_factura: "2026-10-03", proveedor: "Impresora", concepto: "Caja de luz", subtotal: 100, itbms_pct: 7 });
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

const enMarketingNuevo = (ui: React.ReactNode) => (
  <ToastProvider>
    <SoloCobrableContexto.Provider value={true}>{ui}</SoloCobrableContexto.Provider>
  </ToastProvider>
);

describe("al hacer un gasto, «Se cobra» viene en 50 %", () => {
  it("factura: 50 % marcado y, sin tocarlo, viaja pctALaMarca 50", async () => {
    render(
      enMarketingNuevo(
        <RegistrarGastoModal
          marcas={[TOMMY, CALVIN]}
          marcaInicial={CALVIN}
          tiendaCodigo="D-170"
          tiendaNombre="Nova Lux, S.A."
          onClose={() => {}}
          onSaved={() => {}}
        />,
      ),
    );
    fireEvent.click(screen.getByText("Factura de un proveedor"));
    expect(screen.getByRole("radio", { name: "50 %" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "100 %" }).getAttribute("aria-checked")).toBe("false");

    const input = document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
    fireEvent.change(input, { target: { files: [new File(["%PDF"], "f.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect((document.getElementById("factura-numero") as HTMLInputElement).value).toBe("62700"));
    fireEvent.click(screen.getByText("Guardar factura"));
    await waitFor(() => expect(posts.some((p) => p.url.endsWith("/api/marketing/facturas"))).toBe(true));
    expect(posts.find((p) => p.url.endsWith("/api/marketing/facturas"))!.cuerpo).toMatchObject({ pctALaMarca: 50 });
  });

  const ANA = {
    id: "i-1",
    nombre: "Ana",
    monto_mensual: 800,
    marcas: [{ marca: TOMMY, porcentaje: 100 }],
    mesAnterior: null,
    mesActual: null,
    mesesSinPagar: [],
  } as unknown as ImpulsadoraConEstado;

  it("pago de impulsadora en el Marketing nuevo: sin elección, texto fijo «100 % a la marca»", () => {
    render(enMarketingNuevo(<RegistrarPagoModal impulsadora={ANA} mesInicial="2026-10-01" onClose={() => {}} onSaved={() => {}} />));
    expect(screen.queryByRole("radio", { name: "50 %" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "100 %" })).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByTestId("pago-se-cobra").textContent).toBe("Se cobra: 100 % a la marca");
  });

  it("pago de impulsadora fuera del Marketing nuevo: no pregunta «Se cobra»", () => {
    render(
      <ToastProvider>
        <SoloCobrableContexto.Provider value={false}>
          <RegistrarPagoModal impulsadora={ANA} mesInicial="2026-10-01" onClose={() => {}} onSaved={() => {}} />
        </SoloCobrableContexto.Provider>
      </ToastProvider>,
    );
    expect(screen.queryByRole("radio", { name: "50 %" })).toBeNull();
  });
});

// ── Gastos: filtros con nombre, abre en «Por cobrar» ─────────────────────────

const gasto = (over: Partial<GastoDeLaLista>): GastoDeLaLista => ({
  id: "g",
  tipo: "factura",
  fecha: "2026-10-01",
  numero: "1",
  proveedor: "Proveedor",
  concepto: "Concepto",
  marcaCodigo: "TH",
  marcaNombre: "Tommy Hilfiger",
  tiendaCodigo: "D-25",
  tiendaNombre: "City Mall Paso Canoa",
  monto: 100,
  aCobrar: 100,
  estado: "por_cobrar",
  motivo: null,
  impulsadoraId: null,
  impulsadoraMes: null,
  periodoId: "p",
  ...over,
});

const DATOS: MarketingDelCobro = {
  abiertos: [],
  cerrados: [],
  gastos: [
    gasto({ id: "a", proveedor: "Abierto en tienda" }),
    gasto({ id: "b", proveedor: "Abierto sin tienda", tiendaCodigo: null, tiendaNombre: "Impulsadoras" }),
    gasto({ id: "c", proveedor: "Ya cobrado", estado: "cobrado" }),
    gasto({ id: "d", proveedor: "Otra tienda", tiendaCodigo: "D-24", tiendaNombre: "City Mall David" }),
  ],
};

describe("Gastos: cada filtro con su nombre", () => {
  it("abre en Estado «Por cobrar» y no enseña lo cobrado", () => {
    render(<GastosNuevo datos={DATOS} marcas={[TOMMY]} escribe={false} onRegistrar={() => {}} onCambio={() => {}} />);
    const estado = screen.getByLabelText("Estado") as HTMLSelectElement;
    expect(estado.value).toBe("por_cobrar");
    expect(estado.options[estado.selectedIndex].text).toBe("Por cobrar");
    expect(screen.queryAllByText("Ya cobrado")).toHaveLength(0);
    expect(screen.getAllByText("Abierto en tienda").length).toBeGreaterThan(0);
  });

  it("cada filtro con su nombre y «Todas»; Tienda sin «Sin tienda» (cada factura va a una tienda)", () => {
    render(<GastosNuevo datos={DATOS} marcas={[TOMMY]} escribe={false} onRegistrar={() => {}} onCambio={() => {}} />);
    const tienda = screen.getByLabelText("Tienda") as HTMLSelectElement;
    const textos = Array.from(tienda.options).map((o) => o.text);
    expect(textos).toEqual(["Todas", "City Mall David (D-24)", "City Mall Paso Canoa (D-25)"]);
    expect((screen.getByLabelText("Marca") as HTMLSelectElement).options[0].text).toBe("Todas");
    expect((screen.getByLabelText("Tipo") as HTMLSelectElement).options[0].text).toBe("Todos");
    expect(screen.queryByText("Sin tienda")).toBeNull();
    // Lo que no tiene tienda sale con «Todas».
    expect(screen.getAllByText("Abierto sin tienda").length).toBeGreaterThan(0);

    fireEvent.change(tienda, { target: { value: "D-24" } });
    expect(screen.getAllByText("Otra tienda").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Abierto en tienda")).toHaveLength(0);
  });

  it("«Quitar filtros» vuelve todo a Todas/Todos de un toque", () => {
    render(<GastosNuevo datos={DATOS} marcas={[TOMMY]} escribe={false} onRegistrar={() => {}} onCambio={() => {}} />);
    fireEvent.click(screen.getByText("Quitar filtros"));
    expect((screen.getByLabelText("Estado") as HTMLSelectElement).value).toBe("");
    expect(screen.getAllByText("Ya cobrado").length).toBeGreaterThan(0);
    expect(screen.queryByText("Quitar filtros")).toBeNull();
  });
});
