// ─────────────────────────────────────────────────────────────────────────────
// PLANTILLA SWITCH ESTILO APPLE — candado (1-oct-2026, `PLANTILLA_APPLE_2026_10`).
//
//   1. Con `false` la pantalla es la de hoy: las dos filas de pestañas, sin
//      «Cargas recientes», sin «← Plantilla».
//   2. Con `true`: sin filas de pestañas, «Configuración» como enlace, las
//      cargas recientes debajo de la caja y «Tallas por bulto» al pie.
//   3. 🔴 Lo que se ENVÍA al Historial al descargar es idéntico con los dos
//      valores (misma ruta, mismo método, mismos campos).
//   4. Las recientes son las 5 primeras, con el MISMO enlace de Descargar.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { navegacion } from "@/lib/depurador/plantilla-apple-2026-10";

const estado = vi.hoisted(() => ({ apple: false, params: "", onDownloaded: null as null | ((p: unknown) => Promise<void>) }));

vi.mock("@/lib/depurador/plantilla-apple-2026-10", async (orig) => ({
  ...(await orig<typeof import("@/lib/depurador/plantilla-apple-2026-10")>()),
  get PLANTILLA_APPLE_2026_10() { return estado.apple; },
}));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: "admin" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/productos/cargar",
  useSearchParams: () => new URLSearchParams(estado.params),
}));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/app/productos/cargar/DepuradorDispatcher", () => ({
  default: (p: { onDownloaded: (x: unknown) => Promise<void>; pie?: React.ReactNode }) => {
    estado.onDownloaded = p.onDownloaded;
    return <div data-testid="caja">{p.pie}</div>;
  },
}));
vi.mock("@/app/productos/cargar/HistorialView", () => ({
  default: (p: { limite?: number }) => <div data-testid={p.limite ? "recientes" : "historial"} />,
}));
for (const m of ["FormulasConfig", "ReglasView", "CurvasView", "CatalogoDescripcionesAdmin"]) {
  vi.doMock(`@/app/productos/cargar/${m}`, () => ({ default: () => null }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function montar(apple: boolean) {
  estado.apple = apple;
  const { default: Page } = await import("@/app/productos/cargar/page");
  return render(<Page />);
}

describe("navegacion (puro)", () => {
  it("false = hoy en todas las vistas", () => {
    expect(navegacion(false, "plantilla", "nuevo", 2)).toEqual({ pestanas: true, vistas: true, volver: false, enlaces: false });
    expect(navegacion(false, "tallas", "curvas", 1)).toEqual({ pestanas: true, vistas: false, volver: false, enlaces: false });
  });
  it("true: sin pestañas; solo Configuración conserva su fila", () => {
    expect(navegacion(true, "plantilla", "nuevo", 2)).toEqual({ pestanas: false, vistas: false, volver: false, enlaces: true });
    expect(navegacion(true, "plantilla", "historial", 2)).toMatchObject({ pestanas: false, vistas: false, volver: true });
    expect(navegacion(true, "config", "formulas", 3)).toMatchObject({ vistas: true, volver: true });
  });
});

describe("pantalla", () => {
  it("false: la de hoy", async () => {
    await montar(false);
    expect(screen.getByRole("button", { name: "Tallas por bulto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Historial" })).toBeTruthy();
    expect(screen.queryByText("Cargas recientes")).toBeNull();
    expect(screen.queryByTestId("recientes")).toBeNull();
  });
  it("true: caja + recientes + enlaces", async () => {
    await montar(true);
    expect(screen.queryByRole("button", { name: "Nuevo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Configuración" })).toBeTruthy();
    expect(screen.getByText("Cargas recientes")).toBeTruthy();
    expect(screen.getByTestId("recientes")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ver historial completo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tallas por bulto" })).toBeTruthy();
  });

  for (const apple of [false, true]) {
    it(`lo que se envía al Historial no cambia (apple=${apple})`, async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);
      await montar(apple);
      const blob = new Blob(["x"]);
      await estado.onDownloaded!({ empresa: "Fashion Wear", marca: "TH Kids", cantidad_estilos: 3, total_unidades: 69, total_costo: 1700.16, archivo: { blob, nombre: "PLANT.xlsx" } });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/productos/cargar/historial");
      expect(init.method).toBe("POST");
      const fd = init.body as FormData;
      expect([...fd.keys()]).toEqual(["empresa", "marca", "cantidad_estilos", "total_unidades", "total_costo", "archivo"]);
      expect(fd.get("total_costo")).toBe("1700.16");
    });
  }
});

describe("HistorialView con límite", () => {
  it("muestra las 5 primeras y el mismo enlace de Descargar", async () => {
    vi.doUnmock("@/app/productos/cargar/HistorialView");
    const filas = Array.from({ length: 8 }, (_, i) => ({
      id: `id${i}`, usuario: "Angela", empresa: "Fashion Wear", marca: `TH ${i}`, cantidad_estilos: 1, total_unidades: 1,
      total_costo: 1, created_at: `2026-09-2${i}T10:00:00Z`, tiene_archivo: true, archivo_nombre: "a.xlsx",
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: filas }) }));
    const { default: HistorialView } = await vi.importActual<typeof import("@/app/productos/cargar/HistorialView")>("@/app/productos/cargar/HistorialView");
    render(<HistorialView limite={5} />);
    await waitFor(() => expect(screen.getAllByText("TH 0").length).toBeGreaterThan(0));
    expect(screen.queryAllByText("TH 5")).toHaveLength(0);
    const tabla = document.querySelector('[data-vista="tabla"]')!;
    const links = [...tabla.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual([0, 1, 2, 3, 4].map((i) => `/api/productos/cargar/historial/archivo?id=id${i}`));
    expect(screen.queryByRole("combobox", { name: "Empresa" })).toBeNull();
  });
});
