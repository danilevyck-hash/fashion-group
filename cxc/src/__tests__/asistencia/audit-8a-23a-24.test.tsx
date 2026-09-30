// ─────────────────────────────────────────────────────────────────────────────
// 🔴 TRES ARREGLOS DEL AUDIT VISUAL DE ASISTENCIA (29-sep-2026), aprobados por
// Daniel letra por letra:
//
//   8a · Configuración › Colaboradores: «última marca hoy / ayer / 19 sep»
//        (antes «248 marcaciones · última 2026-09-29») y los chips de
//        configuración («Sin seguros», «Servicio profesional», «No cobra horas
//        extra») en GRIS: son configuración normal, no una alerta.
//   23a · Planilla con «Todas»: «Revisar» cambia a esa empresa, GENERA sola y
//        baja a «Antes de cerrar». Una vez, y solo si la quincena coincide.
//   24 · Asistencia › Préstamos: «Descargar» baja el MISMO Excel del historial
//        que el módulo viejo (Daniel: «solo quiero descargar»), con «Solo los
//        que deben» / «Todos», siguiendo a la empresa de arriba, y se anota.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ToastProvider } from "@/components/ToastSystem";
import { fechaCortaRelativa } from "@/lib/fecha-panama";
import { queHacerConRevisar } from "@/lib/asistencia/tablero-cierre";
import { EMPRESAS_ASISTENCIA, REGLAS_DEFAULT } from "@/lib/asistencia/config";

let URL_ACTUAL = "";
const replace = vi.fn((u: string) => { URL_ACTUAL = String(u).split("?")[1] ?? ""; });
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: replace, replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(URL_ACTUAL),
}));

const puro = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

// ═════════════════════════════════════════════════════════════════════════════
describe("8a · la última marca se dice como la gente, contra el hoy de Panamá", () => {
  const HOY = "2026-09-29";
  it("hoy · ayer · «19 sep» · con el año solo si no es el de hoy", () => {
    expect(fechaCortaRelativa("2026-09-29", HOY)).toBe("hoy");
    expect(fechaCortaRelativa("2026-09-28", HOY)).toBe("ayer");
    expect(fechaCortaRelativa("2026-09-19", HOY)).toBe("19 sep");
    expect(fechaCortaRelativa("2026-01-05", HOY)).toBe("5 ene");
    expect(fechaCortaRelativa("2025-09-19", HOY)).toBe("19 sep 2025");
  });
  it("«ayer» cruza el mes y el año", () => {
    expect(fechaCortaRelativa("2026-09-30", "2026-10-01")).toBe("ayer");
    expect(fechaCortaRelativa("2025-12-31", "2026-01-01")).toBe("ayer");
    expect(fechaCortaRelativa("2025-12-30", "2026-01-01")).toBe("30 dic 2025");
  });
  it("lo que no es una fecha no se inventa: sale tal cual", () => {
    expect(fechaCortaRelativa("", HOY)).toBe("");
    expect(fechaCortaRelativa("29/09/2026", HOY)).toBe("29/09/2026");
  });
  it("la fila de Colaboradores ya no dice el conteo ni la fecha ISO, y los chips van en gris", () => {
    const tab = puro("src/app/asistencia/ConfiguracionTab.tsx");
    expect(tab).toContain("última marca {fechaCortaRelativa(p.ultimaMarca)}");
    expect(tab).not.toContain("{p.marcaciones} marcaciones{");
    expect(tab).toContain("title={`${p.marcaciones} marcaciones`}");
    const chip = tab.slice(tab.indexOf("function Excepcion("), tab.indexOf("function ExplicacionBaja("));
    expect(chip).toContain("bg-gray-100");
    expect(chip).not.toContain("amber");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("23a · «Revisar» genera la planilla de ESA empresa, una vez", () => {
  const P = { empresa: "vistana", desde: "2026-09-16", hasta: "2026-09-30", corte: "" };
  const ahora = (o: Partial<Parameters<typeof queHacerConRevisar>[1]> = {}) =>
    ({ ...P, sinEmpresa: false, elegido: true, ...o });

  it("con la empresa y la quincena pedidas, genera", () => {
    expect(queHacerConRevisar(P, ahora())).toBe("generar");
  });
  it("mientras arriba siga «Todas», espera (la URL viaja aparte)", () => {
    expect(queHacerConRevisar(P, ahora({ empresa: "todas", sinEmpresa: true }))).toBe("esperar");
  });
  it("🔴 si cambió el período, el corte u otra empresa, NO genera nada", () => {
    expect(queHacerConRevisar(P, ahora({ desde: "2026-09-01", hasta: "2026-09-15" }))).toBe("descartar");
    expect(queHacerConRevisar(P, ahora({ corte: "2026-09-28" }))).toBe("descartar");
    expect(queHacerConRevisar(P, ahora({ empresa: "fashion_wear" }))).toBe("descartar");
    expect(queHacerConRevisar(P, ahora({ elegido: false }))).toBe("descartar");
  });

  it("🔴 tocar «Revisar» avisa a la Planilla con ESA empresa y cambia la de arriba", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.startsWith("/api/asistencia/alcance")) return { ok: true, status: 200, json: async () => ({ empresas: null }) } as Response;
      if (u.startsWith("/api/asistencia/planilla?")) {
        const e = new URL(u, "http://x").searchParams.get("empresa");
        return {
          ok: true, status: 200,
          json: async () => ({
            lineas: [{ codigo: "1", etiqueta: "Alguien (1)", dias: [], dinero: { netoPagar: 10 },
              manuales: { isr: 0, prestamo: null, terceros: null, mercancia: 0, otrosServicios: 0 },
              prestamoAutomatico: { sinDescontar: {} } }],
            totales: { netoPagar: 10 },
            periodo: { desde: "2026-09-16", hasta: "2026-09-30" },
            reglas: REGLAS_DEFAULT,
            avisos: {
              periodoAbierto: null, rangoLibre: false,
              extraSinAprobar: e === "vistana" ? [{ codigo: "17", etiqueta: "Kener (17)", minutos: 386, monto: 0 }] : [],
            },
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch);
    URL_ACTUAL = "tab=planilla&empresa=todas";
    const onRevisar = vi.fn();
    const { default: TableroCierre } = await import("@/app/asistencia/TableroCierre");
    render(
      <ToastProvider>
        <TableroCierre rol="admin" desde="2026-09-16" hasta="2026-09-30" corte="" elegido puedeCerrar
          onCerrada={() => {}} onRevisar={onRevisar} />
      </ToastProvider>,
    );
    const revisar = await screen.findByRole("button", { name: "Revisar lo que falta en Vistana" }, { timeout: 5000 });
    fireEvent.click(revisar);
    expect(onRevisar).toHaveBeenCalledTimes(1);
    expect(onRevisar).toHaveBeenCalledWith("vistana");
    expect(new URLSearchParams(URL_ACTUAL).get("empresa")).toBe("vistana");
    expect(EMPRESAS_ASISTENCIA).toContain("vistana");
  });

  it("la Planilla reusa `generar` (no un segundo pedido) y baja a «Antes de cerrar»", () => {
    const pl = puro("src/app/asistencia/PlanillaTab.tsx");
    expect(pl).toContain("onRevisar={revisarEmpresa}");
    expect(pl).toContain('if (que !== "generar") return;');
    expect(pl).toMatch(/irAAntesDeCerrar\.current = \{ antes: data \};\s*generar\(\);/);
    expect(pl).toContain("ref={antesDeCerrarRef}");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("24 · «Descargar» en Asistencia › Préstamos baja el historial de siempre", () => {
  beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_PLANILLA_UNIDA", "1"); URL_ACTUAL = "tab=prestamos"; });

  function servir() {
    const llamadas: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url: String(url), init });
      if (String(url).startsWith("/api/asistencia/prestamos-deuda")) return { ok: true, status: 200, json: async () => ({ fichas: [], puedeAnotar: true }) };
      if (String(url).startsWith("/api/prestamos/export-excel")) return { ok: true, status: 200, blob: async () => new Blob(["x"]) };
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
    return llamadas;
  }

  async function montar(empresa: string) {
    const { default: PrestamosTab } = await import("@/app/asistencia/PrestamosTab");
    render(<ToastProvider><PrestamosTab empresa={empresa} /></ToastProvider>);
  }

  it("🔴 «Todos» con Fashion Wear arriba pide la MISMA ruta, con el nombre de la empresa, y se anota", async () => {
    const llamadas = servir();
    await montar("fashion_wear");
    fireEvent.click(await screen.findByRole("button", { name: /Descargar/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Todos" }));
    await waitFor(() => expect(llamadas.some((l) => l.url.startsWith("/api/activity"))).toBe(true));
    const excel = llamadas.filter((l) => l.url.startsWith("/api/prestamos/export-excel"));
    expect(excel.map((l) => l.url)).toEqual(["/api/prestamos/export-excel?ambito=todos&empresa=Fashion%20Wear"]);
    const nota = JSON.parse(String(llamadas.find((l) => l.url === "/api/activity")!.init!.body));
    expect(nota).toMatchObject({ action: "descarga_excel", module: "prestamos", details: { ambito: "todos" } });
  });

  it("«Solo los que deben» con «Todas» no manda empresa", async () => {
    const llamadas = servir();
    await montar("todas");
    fireEvent.click(await screen.findByRole("button", { name: /Descargar/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Solo los que deben" }));
    await waitFor(() => expect(llamadas.some((l) => l.url.startsWith("/api/prestamos/export-excel"))).toBe(true));
    expect(llamadas.find((l) => l.url.startsWith("/api/prestamos/export-excel"))!.url)
      .toBe("/api/prestamos/export-excel?ambito=deben");
  });

  it("el módulo viejo usa la MISMA función: no hay dos descargas", () => {
    expect(puro("src/app/prestamos/PrestamosClient.tsx")).toContain("descargarHistorialPrestamos(ambito, empresa, hoy)");
    expect(puro("src/app/prestamos/PrestamosClient.tsx")).not.toContain("/api/prestamos/export-excel");
    expect(puro("src/app/asistencia/PrestamosTab.tsx")).not.toContain("/api/prestamos/export-excel");
  });
});
