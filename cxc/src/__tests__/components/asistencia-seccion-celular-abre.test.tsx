// ============================================================================
// 🔴 «ASISTENCIA NO SE ABRE EN EL CELULAR» (2-oct-2026, Daniel desde el iPhone).
//
// 🩸 `useUrlState` BORRA el parámetro cuando se escribe su valor por defecto,
// y la pestaña por defecto era «asistencia». Elegirla —en la portada o en el
// selector «Planilla ▾»— dejaba la dirección sin `?tab=`, y en el celular «sin
// `?tab=`» es la PORTADA: el toque devolvía a la portada en vez de abrir
// Asistencia. La auditoría con Chromium no lo vio: solo probaba UNA opción
// distinta por lista.
//
// Lo que este candado congela, montando la pantalla real como celular:
//   · Cada sección, elegida desde CADA otra, queda escrita en `?tab=` y abierta.
//   · Desde la portada, tocar «Asistencia» la abre (no se queda en la portada).
// Mutación que caza: volver a pasar `pestanaPorDefecto(...)` como defecto del
// hook (`useUrlState<Tab>("tab", pestanaPorDefecto(...))`).
// ============================================================================

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { ORDEN_DEL_TRABAJO } from "@/lib/asistencia/apple-2026-10";

// Como en producción (Vercel): los dos interruptores de la Planilla Unida prendidos.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_PERSONA_EN_EL_CENTRO = "1";
  process.env.NEXT_PUBLIC_PLANILLA_UNIDA = "1";
});

vi.mock("@/lib/aparato", async (orig) => ({
  ...(await orig<typeof import("@/lib/aparato")>()),
  aparatoDeQuienMira: () => "celular",
}));

let URL_ACTUAL = "";
const ESCRITAS: string[] = [];
vi.mock("next/navigation", () => {
  const ir = (u: string) => { ESCRITAS.push(String(u)); URL_ACTUAL = String(u).split("?")[1] ?? ""; };
  return {
    useRouter: () => ({ push: vi.fn(ir), replace: vi.fn(ir), refresh: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => "/asistencia",
    useSearchParams: () => new URLSearchParams(URL_ACTUAL),
  };
});

import AsistenciaClient from "@/app/asistencia/AsistenciaClient";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  URL_ACTUAL = "";
  ESCRITAS.length = 0;
});

function montar(query: string) {
  URL_ACTUAL = query;
  sessionStorage.setItem("cxc_role", "admin");
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ empresas: null, personas: [], filas: [], periodos: [], cierres: [] }),
  }) as unknown as Response));
  return render(<ToastProvider><AsistenciaClient /></ToastProvider>);
}

const tabEscrita = () => new URLSearchParams((ESCRITAS.at(-1) ?? "").split("?")[1] ?? "").get("tab");

describe("en el celular, elegir una sección SIEMPRE la abre", () => {
  for (const desde of ORDEN_DEL_TRABAJO) {
    it(`desde ${desde}, cada otra sección queda escrita y elegida`, async () => {
      for (const hacia of ORDEN_DEL_TRABAJO) {
        if (hacia === desde) continue;
        cleanup();
        ESCRITAS.length = 0;
        montar(`tab=${desde}`);
        const lista = (await screen.findByRole("combobox", { name: "Sección" })) as HTMLSelectElement;
        await act(async () => { fireEvent.change(lista, { target: { value: hacia } }); });
        expect(Array.from(lista.options).map((o) => o.value), "las seis secciones").toEqual([...ORDEN_DEL_TRABAJO]);
        expect(tabEscrita(), `${desde} → ${hacia}`).toBe(hacia);
        const despues = screen.getByRole("combobox", { name: "Sección" }) as HTMLSelectElement;
        expect(despues.value, `${desde} → ${hacia}`).toBe(hacia);
      }
    });
  }

  it("desde la portada, tocar «Asistencia» abre Asistencia", async () => {
    montar("");
    const fila = await screen.findByRole("button", { name: /^Asistencia/ });
    await act(async () => { fireEvent.click(fila); });
    expect(tabEscrita()).toBe("asistencia");
    await waitFor(() =>
      expect((screen.getByRole("combobox", { name: "Sección" }) as HTMLSelectElement).value).toBe("asistencia"));
  });
});
