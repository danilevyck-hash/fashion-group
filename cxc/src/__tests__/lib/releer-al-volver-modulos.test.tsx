// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — 25-nov-2026: «me paso de una pestaña a otra y no se me
// actualiza» en Asistencia, Marketing, Usuarios y Comprobantes. Una sola pieza
// (`useReleerAlVolver`): relee al volver a la ventana Y cuando una pestaña
// escondida vuelve a verse (`PestanaVisible`), y NUNCA mientras alguien
// escribe o tiene una ventana abierta.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hayAlgoAMedias, PestanaVisible, RELEER_AL_VOLVER_MIN_MS, useReleerAlVolver } from "@/lib/hooks/useReleerAlVolver";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("nunca pisa lo que la persona está escribiendo", () => {
  it("con el foco en un campo de texto o un modal abierto, no relee", () => {
    expect(hayAlgoAMedias()).toBe(false);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(hayAlgoAMedias()).toBe(true);
    input.blur();
    const casilla = document.createElement("input");
    casilla.type = "checkbox";
    document.body.appendChild(casilla);
    casilla.focus();
    expect(hayAlgoAMedias()).toBe(false);
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    document.body.appendChild(modal);
    expect(hayAlgoAMedias()).toBe(true);
  });

  it("escribiendo al volver a la ventana: no llama", () => {
    vi.useFakeTimers();
    const releer = vi.fn();
    renderHook(() => useReleerAlVolver(releer));
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    input.focus();
    vi.advanceTimersByTime(RELEER_AL_VOLVER_MIN_MS);
    window.dispatchEvent(new Event("focus"));
    expect(releer).not.toHaveBeenCalled();
  });
});

describe("pestañas montadas y escondidas (Asistencia)", () => {
  it("relee cuando la pestaña vuelve a verse, y no mientras está escondida", () => {
    vi.useFakeTimers();
    const releer = vi.fn();
    let visible = false;
    const wrapper = ({ children }: { children: ReactNode }) => createElement(PestanaVisible.Provider, { value: visible }, children);
    const { rerender } = renderHook(() => useReleerAlVolver(releer), { wrapper });
    vi.advanceTimersByTime(RELEER_AL_VOLVER_MIN_MS);
    window.dispatchEvent(new Event("focus"));
    expect(releer).not.toHaveBeenCalled(); // escondida: no relee al volver a la ventana
    visible = true;
    rerender();
    expect(releer).toHaveBeenCalledTimes(1); // se vio: relee
  });

  it("Asistencia le dice a cada pestaña si se ve", () => {
    const src = leer("src/app/asistencia/AsistenciaClient.tsx");
    for (const k of ["planilla", "prestamos", "justificaciones", "vacaciones", "aprobaciones", "colaboradores", "configuracion", "marcaciones"]) {
      expect(src, k).toContain(`<PestanaVisible.Provider value={seVe("${k}")}>`);
    }
    expect(src).toContain('<PestanaVisible.Provider value={(seVe("reporte") || seVe("asistencia"))}>');
  });
});

describe("cada módulo usa la pieza, en segundo plano", () => {
  const casos: Array<[string, string]> = [
    ["src/app/asistencia/ReporteTab.tsx", "useReleerAlVolver(() => void cargar(true, true))"],
    ["src/app/asistencia/AprobacionesTab.tsx", "useReleerAlVolver(() => void cargar(true, true))"],
    ["src/app/asistencia/PrestamosTab.tsx", "useReleerAlVolver(() => void cargar(true))"],
    ["src/app/asistencia/MovimientosQuincenaTab.tsx", "useReleerAlVolver(() => void cargar(true))"],
    ["src/app/asistencia/JustificacionesTab.tsx", "useReleerAlVolver("],
    ["src/app/asistencia/VacacionesTab.tsx", "useReleerAlVolver("],
    ["src/app/asistencia/FeriadosTab.tsx", "useReleerAlVolver("],
    ["src/app/asistencia/EstadoReloj.tsx", "useReleerAlVolver("],
    ["src/app/asistencia/MarcacionesTab.tsx", "useReleerAlVolver("],
    ["src/app/asistencia/ConfiguracionTab.tsx", "useReleerAlVolver(() => void cargar(true), necesitaDatos && abierta === null)"],
    ["src/app/marketing/components/nuevo/MarketingNuevo.tsx", "useReleerAlVolver(refrescar)"],
    ["src/app/marketing/components/nuevo/ImpulsadorasNuevo.tsx", "useReleerAlVolver("],
    ["src/app/admin/usuarios/page.tsx", "authChecked && !showUserModal)"],
    ["src/components/catalogo/PedidosListClient.tsx", "useReleerAlVolver(() => void load(true))"],
  ];
  it.each(casos)("%s", (archivo, llamada) => {
    expect(leer(archivo)).toContain(llamada);
  });

  it("🔴 Configuración en segundo plano NO pisa el formulario de reglas", () => {
    expect(leer("src/app/asistencia/ConfiguracionTab.tsx")).toContain("if (!fondo) setForm(reglasAForm(d.reglas));");
  });

  it("🔴 la Planilla NO se relee sola («nada se pide solo»)", () => {
    expect(leer("src/app/asistencia/PlanillaTab.tsx")).not.toContain("useReleerAlVolver");
  });
});
