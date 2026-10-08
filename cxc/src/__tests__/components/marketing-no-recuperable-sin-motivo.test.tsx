// ============================================================================
// 🔴 CANDADO — «No recuperable» sin Motivo (8-oct-2026).
//
// Daniel, sobre el Motivo obligatorio con lista: «¿no es lo mismo como notas,
// de modo opcional?». No hay campo nuevo:
//   1. Al elegir «No recuperable» se ocultan Marca y Tienda y queda solo
//      Observaciones, OPCIONAL. Se guarda sin marca, sin tienda y sin
//      observación (pctALaMarca 0, seReporta false: fuera de toda marca y de
//      todo ZIP, como siempre).
//   2. En pantalla dice «No recuperable», nunca «A cargo de la empresa»; si
//      hay observación, se ve al lado, discreta.
//
// Con el código de antes es ROJO: pedía el Motivo («Falta: el motivo») y la
// lista de Gastos decía «A cargo de la empresa» al lado del estado.
// ============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import type { MkMarca } from "@/lib/marketing/types";
import type { GastoDeLaLista, MarketingDelCobro } from "@/lib/marketing/zip-marca";

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketing",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

import RegistrarGastoModal from "@/app/marketing/components/RegistrarGastoModal";
import GastosNuevo from "@/app/marketing/components/nuevo/GastosNuevo";
import { SoloCobrableContexto } from "@/lib/marketing/solo-cobrable-contexto";
import { destinoDelGasto } from "@/lib/marketing/proveedores-2026-10";

const TOMMY = { id: "m-th", codigo: "TH", nombre: "Tommy Hilfiger", activo: true } as MkMarca;

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
        return json({ numero_factura: "62700", fecha_factura: "2026-10-03", proveedor: "Mueblería", concepto: "Muebles para bodega", subtotal: 100, itbms_pct: 7 });
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

const abrirNoRecuperable = async () => {
  render(
    <ToastProvider>
      <SoloCobrableContexto.Provider value={true}>
        <RegistrarGastoModal marcas={[TOMMY]} onClose={() => {}} onSaved={() => {}} />
      </SoloCobrableContexto.Provider>
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText("Factura de un proveedor"));
  fireEvent.click(screen.getByRole("radio", { name: "No recuperable" }));
  const input = document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
  fireEvent.change(input, { target: { files: [new File(["%PDF"], "f.pdf", { type: "application/pdf" })] } });
  await waitFor(() => expect((document.getElementById("factura-numero") as HTMLInputElement).value).toBe("62700"));
};
const cuerpoGuardado = () => posts.find((p) => p.url.endsWith("/api/marketing/facturas"))?.cuerpo;

describe("registrar un No recuperable", () => {
  it("sin Motivo: se guarda sin marca, sin tienda y sin observación", async () => {
    await abrirNoRecuperable();
    const destino = screen.getByTestId("destino-del-cargo");
    expect(within(destino).queryByText("Marca")).toBeNull();
    expect(within(destino).queryByText("Tienda")).toBeNull();
    expect(screen.queryByText("Motivo")).toBeNull();
    expect(screen.queryByRole("radio", { name: "Compra de mobiliario" })).toBeNull();

    fireEvent.click(screen.getByText("Guardar factura"));
    await waitFor(() => expect(cuerpoGuardado()).toBeTruthy());
    const c = cuerpoGuardado()!;
    expect(c).toMatchObject({ marcaId: "", pctALaMarca: 0, tiendaCodigo: null, seReporta: false });
    expect(c.nota ?? "").toBe("");
  });

  it("la observación, si se escribe, viaja tal cual en la nota (sin prefijo)", async () => {
    await abrirNoRecuperable();
    fireEvent.click(screen.getByText("+ Agregar observaciones"));
    fireEvent.change(document.getElementById("cargo-nota")!, { target: { value: "muebles para bodega" } });
    fireEvent.click(screen.getByText("Guardar factura"));
    await waitFor(() => expect(cuerpoGuardado()).toBeTruthy());
    expect(cuerpoGuardado()!.nota).toBe("muebles para bodega");
  });
});

const gasto = (over: Partial<GastoDeLaLista>): GastoDeLaLista => ({
  id: "g",
  tipo: "factura",
  fecha: "2026-10-01",
  numero: "1",
  proveedor: "Mueblería",
  concepto: "Muebles",
  marcaCodigo: null,
  marcaNombre: null,
  tiendaCodigo: null,
  tiendaNombre: "Sin tienda",
  monto: 100,
  aCobrar: 0,
  estado: "no_recuperable",
  motivo: "a-cargo-de-la-empresa",
  impulsadoraId: null,
  impulsadoraMes: null,
  periodoId: null,
  ...over,
});

describe("en pantalla dice «No recuperable»", () => {
  it("Gastos: «No recuperable» con la observación al lado, nunca «A cargo de la empresa»", () => {
    const datos: MarketingDelCobro = {
      abiertos: [],
      cerrados: [],
      gastos: [
        gasto({ id: "a", nota: "muebles para bodega" }),
        gasto({ id: "b", motivo: "no-se-reporta" }),
        gasto({ id: "c", motivo: "tienda-propia" }),
      ],
    };
    const { container } = render(
      <GastosNuevo datos={datos} marcas={[TOMMY]} escribe={false} onRegistrar={() => {}} onCambio={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "no_recuperable" } });
    const texto = container.textContent ?? "";
    expect(screen.getAllByText("No recuperable").length).toBeGreaterThan(0);
    expect(screen.getByTestId("observacion-gasto").textContent).toBe("muebles para bodega");
    expect(texto).not.toContain("A cargo de la empresa");
    expect(texto).not.toContain("No se reporta");
  });

  it("Proveedores y la ficha: el destino sin marca dice «No recuperable»", () => {
    expect(destinoDelGasto({})).toBe("No recuperable");
    expect(destinoDelGasto({ marcaNombre: "Tommy Hilfiger", monto: 100, pctALaMarca: 50 })).toBe(
      "Tommy Hilfiger $50.00 · No recuperable $50.00",
    );
  });
});
