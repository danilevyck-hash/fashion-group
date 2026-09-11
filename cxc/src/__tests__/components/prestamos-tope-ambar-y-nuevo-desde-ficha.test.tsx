// ─────────────────────────────────────────────────────────────────────────────
// PRÉSTAMOS — tres arreglos de la auditoría del 11-sep-2026, sobre la pantalla.
//
//   1. 🔴 El aviso «pasa el tope de un sueldo» sale en ÁMBAR y por 8 s. 🩸 Salía
//      como éxito verde y se iba a los 3 s: la pestaña clasificaba por el TEXTO
//      (`startsWith("Error")`). Desde que se quitó la aprobación ese aviso es lo
//      único que frena. El tipo viaja con el mensaje.
//   2. 🔴 «+ Préstamo» de la ficha abre el formulario CON esa persona elegida
//      (`?nuevo=<código>`). 🩸 Llevaba a la lista general.
//   3. 🔴 «+ Nuevo préstamo» ofrece solo a los de la empresa elegida arriba
//      (con «Todas», todos). 🩸 La lista y el total filtraban; el alta no.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ToastProvider } from "@/components/ToastSystem";
import { duracionToastMs, TOAST_MS_ERROR, TOAST_MS_EXITO } from "@/lib/ui/toast-duracion";
import { useMovimientoForm } from "@/app/prestamos/components/useMovimientoForm";

let URL_ACTUAL = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(URL_ACTUAL),
}));

const puro = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

// ═════════════════════════════════════════════════════════════════════════════
describe("1. 🔴 el aviso del tope: ámbar, 8 s, y el tipo lo dice el hook", () => {
  it("un `warning` dura lo que un error (8 s), un éxito 3 s", () => {
    expect(duracionToastMs("warning")).toBe(TOAST_MS_ERROR);
    expect(duracionToastMs("error")).toBe(8000);
    expect(duracionToastMs("success")).toBe(TOAST_MS_EXITO);
    // y el sistema de avisos lee ese número, no un 3000 escrito a mano
    const ts = puro("src/components/ToastSystem.tsx");
    expect(ts).toContain("duracionToastMs(type)");
    expect(ts).not.toMatch(/setTimeout\([^)]*\b3000\)/);
  });

  it("🔴 el hook manda «warning» cuando el servidor dice `sobreTope`, y «error» ante un error", async () => {
    const avisos: Array<[string, string | undefined]> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === "/api/prestamos/movimientos" && init?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({ id: "m1", sobreTope: true, avisoTope: "Este préstamo pasa el tope de un sueldo. Se registra igual." }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch);
    const { result } = renderHook(() => useMovimientoForm({ onSuccess: () => {}, showToast: (m, t) => { avisos.push([m, t]); } }));
    await act(async () => { await result.current.crear({ empleado_id: "e1", concepto: "Préstamo", monto: 900 }); });
    expect(avisos.at(-1)![0]).toMatch(/^Este préstamo pasa el tope/);
    expect(avisos.at(-1)![1]).toBe("warning");

    // sin tope: éxito
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: "m2" }) })) as unknown as typeof fetch);
    await act(async () => { await result.current.crear({ empleado_id: "e1", concepto: "Préstamo", monto: 10 }); });
    expect(avisos.at(-1)).toEqual(["Movimiento registrado", "success"]);

    // un error del servidor: «error», aunque el texto no empiece con «Error»
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: "Elige a la persona de la lista." }) })) as unknown as typeof fetch);
    await act(async () => { await result.current.crear({ empleado_id: "e1", concepto: "Préstamo", monto: 10 }); });
    expect(avisos.at(-1)).toEqual(["Elige a la persona de la lista.", "error"]);
  });

  it("y la pestaña ya no clasifica por el texto", () => {
    const tab = puro("src/app/asistencia/PrestamosTab.tsx");
    expect(tab).not.toContain('startsWith("Error")');
    expect(tab).toContain('showToast: (m, tipo) => toast(m, tipo ?? "success")');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
const COLABORADORES = [
  { codigo: "11", nombre: "JULIO GARAY", empresa: "vistana", empresaNombre: "Vistana International", salarioMensual: 1000, trabaja: true, fichaId: "f11", saldo: 0 },
  { codigo: "40", nombre: "KEVIN LUBO", empresa: "confecciones_boston", empresaNombre: "Confecciones Boston", salarioMensual: 550, trabaja: true, fichaId: "f40", saldo: 120 },
];
const DATOS = { colaboradores: COLABORADORES, filas: [{ id: "f40", nombre: "KEVIN LUBO", empresa: "Confecciones Boston", empleadoCodigo: "40", cuotaPrestamo: 20, cuotaDano: 0, cuotaTerceros: 0, saldoPrestamo: 120, saldoDano: 0, saldoTerceros: 0, saldo: 120, cuentaMasVieja: "prestamo" }] };

function stubFetch() {
  const llamadas: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    llamadas.push(String(url));
    if (String(url).startsWith("/api/asistencia/prestamos-deuda")) return { ok: true, status: 200, json: async () => ({ fichas: [], puedeAnotar: true }) };
    if (String(url) === "/api/prestamos/empleados") return { ok: true, status: 200, json: async () => DATOS };
    return { ok: true, status: 200, json: async () => ({}) };
  }) as unknown as typeof fetch);
  return llamadas;
}

async function montar(empresa: string) {
  const { default: PrestamosTab } = await import("@/app/asistencia/PrestamosTab");
  render(<ToastProvider><PrestamosTab empresa={empresa} /></ToastProvider>);
}

beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_PLANILLA_UNIDA", "1"); URL_ACTUAL = "tab=prestamos"; });

describe("3. 🔴 «+ Nuevo préstamo» ofrece solo a los de la empresa elegida", () => {
  it("con Vistana arriba: Julio sí, Kevin (Boston) no", async () => {
    stubFetch();
    await montar("vistana");
    fireEvent.click(await screen.findByRole("button", { name: /\+ Nuevo préstamo/ }));
    await screen.findByText("JULIO GARAY");
    expect(screen.queryByText("KEVIN LUBO")).toBeNull();
  });
  it("⚠️ CONTROL: con «Todas», los dos", async () => {
    stubFetch();
    await montar("todas");
    fireEvent.click(await screen.findByRole("button", { name: /\+ Nuevo préstamo/ }));
    await screen.findByText("JULIO GARAY");
    expect(screen.getByText("KEVIN LUBO")).toBeTruthy();
  });
});

describe("2. 🔴 «+ Préstamo» desde la ficha abre el formulario con esa persona", () => {
  it("el enlace de la ficha lleva `?nuevo=<código>` a la pestaña (con la planilla unida)", async () => {
    const { enlaceANuevoPrestamo, enlaceAPrestamos } = await import("@/lib/prestamos-una-puerta");
    expect(enlaceANuevoPrestamo("40")).toBe("/asistencia?tab=prestamos&nuevo=40");
    // sigue siendo LA MISMA puerta: la pestaña, no un formulario propio
    expect(enlaceANuevoPrestamo("40").startsWith(enlaceAPrestamos())).toBe(true);
    const seccion = puro("src/app/asistencia/colaboradores/SeccionPrestamos.tsx");
    expect(seccion).toContain("href={enlaceANuevoPrestamo(codigo)}");
    expect(seccion).not.toContain("lo aprueba Daniel");
  });
  it("con el interruptor apagado no hay pestaña: va a la lista, como antes", async () => {
    // `planillaUnidaPrendida()` lee el env AL LLAMAR: alcanza con apagarlo.
    const { enlaceANuevoPrestamo } = await import("@/lib/prestamos-una-puerta");
    vi.stubEnv("NEXT_PUBLIC_PLANILLA_UNIDA", "");
    expect(enlaceANuevoPrestamo("40")).toBe("/prestamos");
  });
  it("🔴 al llegar con `?nuevo=40`, la pestaña abre «Nuevo movimiento» ya con KEVIN LUBO", async () => {
    URL_ACTUAL = "tab=prestamos&nuevo=40";
    const llamadas = stubFetch();
    await montar("todas");
    await screen.findByText("Nuevo movimiento");
    expect(screen.getByText("KEVIN LUBO")).toBeTruthy();
    // y NO pasó por «¿A quién?»: la persona ya venía elegida
    expect(screen.queryByText("¿A quién?")).toBeNull();
    await waitFor(() => expect(llamadas).toContain("/api/prestamos/empleados"));
  });
});
