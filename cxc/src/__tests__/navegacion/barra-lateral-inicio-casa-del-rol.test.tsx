// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «INICIO» DE LA BARRA LATERAL LLEVA A LA CASA DEL ROL (16-nov-2026, error
// de los videos #26).
//
// David (`gerente_boston`) tocaba «Inicio» y lo mandaba a `/home`, que su rol
// rebota: parpadeaba y volvía. Su casa es `/boston`. Lo mismo Jennifer
// (`gerente_acs` → `/multifashion`) y quien solo marca (`marcacion` →
// `/marcacion`). La regla vive en UN lugar (`casaDelRol`); las dos barras
// (la de hoy y la de respaldo) la leen.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/catalogos",
  useSearchParams: () => new URLSearchParams(""),
}));

const sw = vi.hoisted(() => ({ apple: true }));
vi.mock("@/lib/navegacion/estructura-2026-10", async (original) => {
  const real = await original<typeof import("@/lib/navegacion/estructura-2026-10")>();
  return { ...real, get ESTRUCTURA_APPLE_2026_10() { return sw.apple; } };
});

import Sidebar from "@/components/Sidebar";
import { casaDelRol } from "@/lib/navegacion/casa-del-rol";

beforeEach(() => {
  if (!window.localStorage || typeof window.localStorage.getItem !== "function") {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
    });
  }
});
afterEach(() => { cleanup(); sessionStorage.clear(); });

const CASOS: [rol: string, casa: string][] = [
  ["gerente_boston", "/boston"],
  ["gerente_acs", "/multifashion"],
  ["marcacion", "/marcacion"],
  ["admin", "/home"],
  ["secretaria", "/home"],
];

describe("#26 · «Inicio» de la barra lateral = la casa del rol", () => {
  for (const apple of [true, false]) {
    for (const [rol, casa] of CASOS) {
      it(`${apple ? "barra de hoy" : "barra de respaldo"} · ${rol} → ${casa}`, async () => {
        sw.apple = apple;
        sessionStorage.setItem("cxc_role", rol);
        sessionStorage.setItem("fg_user_name", "prueba");
        expect(casaDelRol(rol, null)).toBe(casa);
        const { container } = render(<Sidebar />);
        await waitFor(() => expect(container.querySelector("aside")).not.toBeNull());
        const inicio = [...container.querySelectorAll("aside a")].find((a) => a.textContent?.trim() === "Inicio");
        expect(inicio, "falta «Inicio»").toBeTruthy();
        expect(inicio!.getAttribute("href")).toBe(casa);
      });
    }
  }
});
