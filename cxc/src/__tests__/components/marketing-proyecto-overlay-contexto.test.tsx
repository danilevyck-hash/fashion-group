/**
 * CANDADO — el overlay del proyecto RENDERIZADO de verdad (12-ago-2026).
 *
 * Daniel, textual: *"si me gustaria entrar a un projecto y ver ambas marcas"*.
 * Lo que un test de función pura no puede ver — que los props lleguen y se
 * dibujen — se prueba acá:
 *   1. El overlay RECIBE la marca del contexto y MUESTRA la línea con los
 *      montos de las otras marcas (caso real Nova Lux: CK $2.600 / TH $2.470).
 *   2. Sin marca (enlaces viejos /marketing?proyecto=) NO hay línea.
 *   3. La celda "Entregas: N · $X" de la cabecera existe y SUMA: con ella,
 *      COSTO TOTAL cierra a la vista (facturas + entregas = total).
 *   4. Sin entregas, la celda no aparece (sería ruido).
 *
 * Las secciones hijas van con stubs: sus candados viven en sus propios tests
 * (marketing-entregas-chips.test.tsx, marketing-entrega-form.test.tsx…) y acá
 * solo estorbarían — lo que se prueba es la cabecera del overlay.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import ProyectoOverlay from "@/app/marketing/components/ProyectoOverlay";
import type { MkMarca } from "@/lib/marketing/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketing/calvin-klein/periodo-2026",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => false,
  readSidebarCollapsed: () => false,
}));

vi.mock("@/app/marketing/components/FacturasSection", () => ({
  default: () => <div data-testid="stub-facturas" />,
}));
vi.mock("@/app/marketing/components/FotosSection", () => ({
  default: () => <div data-testid="stub-fotos" />,
}));
vi.mock("@/app/marketing/components/EntregasSection", () => ({
  default: () => <div data-testid="stub-entregas" />,
}));
vi.mock("@/app/marketing/components/EditarProyectoModal", () => ({
  default: () => null,
}));

const CK: MkMarca = {
  id: "m-ck",
  nombre: "Calvin Klein",
  codigo: "CK",
  empresa_codigo: "fashion_wear",
  tipo: "externa",
  activo: true,
  created_at: "2026-01-01T00:00:00Z",
} as MkMarca;
const TH: MkMarca = { ...CK, id: "m-th", nombre: "Tommy Hilfiger", codigo: "TH" };

const PROYECTO = {
  id: "proy-nova",
  nombre: "Apertura",
  tienda: "Nova Lux, S.a.",
  tienda_codigo: null,
  fecha_inicio: "2026-08-01",
  fecha_cierre: null,
  estado: "abierto",
  fecha_enviado: null,
  fecha_cobrado: null,
  notas: null,
  anulado_en: null,
  marcas: [],
  facturas: [
    {
      id: "f-1",
      proyecto_id: "proy-nova",
      subtotal: 100,
      total: 100,
      anulado_en: null,
      tiene_importacion: false,
      adjuntos: [],
      marcas: [{ marca: CK, porcentaje: 100 }],
    },
  ],
};

const ENTREGAS = [
  { id: "e-22", total: 2600, total_por_marca: { "m-ck": 2600 }, items: [] },
  { id: "e-24", total: 2470, total_por_marca: { "m-th": 2470 }, items: [] },
];

function instalarFetch(entregas: unknown[] = ENTREGAS) {
  const fn = vi.fn(async (input: unknown) => {
    const url = String(input);
    const json = (body: unknown) => ({
      ok: true,
      status: 200,
      json: async () => body,
    });
    if (url.includes("/api/marketing/marcas")) return json([CK, TH]);
    if (url.includes("/api/marketing/inventario/entregas")) {
      return json(entregas);
    }
    if (url.includes("/api/marketing/proyectos/")) return json(PROYECTO);
    return json({});
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function montar(props: Partial<React.ComponentProps<typeof ProyectoOverlay>> = {}) {
  return render(
    <ToastProvider>
      <ProyectoOverlay
        proyectoId="proy-nova"
        onClose={() => {}}
        onChange={() => {}}
        {...props}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  sessionStorage.setItem("cxc_role", "admin");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("la línea de contexto de marca", () => {
  it("abierto desde CK · Período 2026 dice el texto aprobado, con TH incluida", async () => {
    instalarFetch();
    montar({ marca: CK, periodoNombre: "Período 2026", montoEnPeriodo: 2600 });
    await waitFor(() =>
      expect(
        screen.getByText(
          // Las facturas también cuentan: CK $2.600 (entrega) + $100 (factura)
          // van del lado de CK; lo de la OTRA marca es TH $2.470.
          "En Calvin Klein · Período 2026: $2,600.00 — este proyecto también tiene $2,470.00 de Tommy Hilfiger",
        ),
      ).toBeTruthy(),
    );
  });

  it("sin marca (enlace viejo /marketing?proyecto=) NO hay línea", async () => {
    instalarFetch();
    const { container } = montar();
    await waitFor(() => expect(screen.getAllByText("Apertura")[0]).toBeTruthy());
    expect(container.querySelector("[data-contexto-marca]")).toBeNull();
  });

  it("con marca pero sin plata de OTRAS marcas tampoco hay línea", async () => {
    instalarFetch([
      { id: "e-22", total: 2600, total_por_marca: { "m-ck": 2600 }, items: [] },
    ]);
    const { container } = montar({
      marca: CK,
      periodoNombre: "Período 2026",
      montoEnPeriodo: 2600,
    });
    await waitFor(() => expect(screen.getAllByText("Apertura")[0]).toBeTruthy());
    expect(container.querySelector("[data-contexto-marca]")).toBeNull();
  });
});

describe("la celda Entregas de la cabecera", () => {
  it("dice N · $X y con ella COSTO TOTAL cierra a la vista", async () => {
    instalarFetch();
    montar({ marca: CK, periodoNombre: "Período 2026", montoEnPeriodo: 2600 });
    await waitFor(() => expect(screen.getByText("Entregas")).toBeTruthy());
    // 2 entregas · $5.070,00 (2.600 + 2.470)
    expect(screen.getByText(/2 ·\s*\$5,070\.00/)).toBeTruthy();
    // Costo total = facturas $100 + entregas $5.070 = $5.170 — la celda de
    // entregas es lo que hace que esa suma se pueda VER.
    expect(screen.getByText("$5,170.00")).toBeTruthy();
  });

  it("sin entregas la celda no aparece", async () => {
    instalarFetch([]);
    montar({ marca: CK });
    await waitFor(() => expect(screen.getAllByText("Apertura")[0]).toBeTruthy());
    expect(screen.queryByText("Entregas")).toBeNull();
  });
});
