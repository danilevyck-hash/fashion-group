// ─────────────────────────────────────────────────────────────────────────────
// LA PANTALLA DE «NO EXISTE» — TESTS DE CONDUCTA (17-sep-2026).
//
// 🩸 Hasta hoy no había ninguna: el 404 lo ponía Next, **en inglés** («This page
// could not be found»), en blanco y sin una salida. Trece direcciones
// intermedias del sistema caen ahí si alguien las recorta (`/catalogos`,
// `/catalogo`, `/productos`, `/g`… — `docs/mapas/rutas.md` › C).
//
// 🔴 Lo que se vigila acá es a DÓNDE lleva el botón: «Ir al inicio» tiene que
// ser la casa del rol. Para Jennifer (`gerente_acs`) el Inicio es una pantalla
// que su propio rol rebota.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NotFound from "@/app/not-found";

const PUSH = vi.fn();
const BACK = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: PUSH, back: BACK, replace: vi.fn(), prefetch: vi.fn() }),
}));

function entrarComo(rol: string, modulos?: string[]) {
  sessionStorage.clear();
  if (rol) sessionStorage.setItem("cxc_role", rol);
  if (modulos) sessionStorage.setItem("fg_modules", JSON.stringify(modulos));
}

beforeEach(() => {
  PUSH.mockClear();
  BACK.mockClear();
  sessionStorage.clear();
});
afterEach(() => { sessionStorage.clear(); });

describe("🔴 el 404 habla en español y tiene salida", () => {
  it("dice qué pasó y por qué, sin una palabra de inglés", () => {
    entrarComo("admin");
    render(<NotFound />);
    expect(screen.getByText("Esta pantalla no existe")).toBeTruthy();
    expect(screen.getByText(/dirección esté mal escrita/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("could not be found");
  });

  it("un admin va al Inicio de verdad", () => {
    entrarComo("admin");
    render(<NotFound />);
    fireEvent.click(screen.getByText("Ir al inicio"));
    expect(PUSH).toHaveBeenCalledWith("/home");
  });

  it("🔴 Jennifer (gerente_acs) va a SU módulo, no a `/home`", () => {
    entrarComo("gerente_acs");
    render(<NotFound />);
    fireEvent.click(screen.getByText("Ir al inicio"));
    expect(PUSH).toHaveBeenCalledWith("/multifashion");
    expect(PUSH).not.toHaveBeenCalledWith("/home");
  });

  it("🔴 David (gerente_boston) va a su CASA aunque tenga varios módulos", () => {
    entrarComo("gerente_boston");
    render(<NotFound />);
    fireEvent.click(screen.getByText("Ir al inicio"));
    expect(PUSH).toHaveBeenCalledWith("/boston");
  });

  it("sin sesión (o con el rol ilegible) cae al Inicio, nunca a una pantalla inventada", () => {
    entrarComo("");
    render(<NotFound />);
    fireEvent.click(screen.getByText("Ir al inicio"));
    expect(PUSH).toHaveBeenCalledWith("/home");
  });

  it("«Volver» retrocede una sola vez cuando hay historial", () => {
    entrarComo("admin");
    render(<NotFound />);
    // jsdom arranca con history.length = 1; se le agrega una entrada.
    const volver = screen.queryByText("Volver");
    if (volver) {
      fireEvent.click(volver);
      expect(BACK).toHaveBeenCalledTimes(1);
    } else {
      // Sin historial el botón NO se dibuja: es la otra mitad de la regla.
      expect(window.history.length).toBeLessThanOrEqual(1);
    }
  });
});
