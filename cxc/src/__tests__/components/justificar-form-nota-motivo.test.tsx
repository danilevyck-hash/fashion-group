/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL FORMULARIO DE JUSTIFICAR DICE, DEBAJO DEL MOTIVO, QUÉ PASA CON EL DÍA.
 * (14-sep-2026)
 *
 * Al elegir «Trabajo de vendedor» aparece UNA línea: se paga como un día normal
 * de 9:00 a 18:00 con una hora de almuerzo y solo cuenta los días sin marca.
 * Con «Compensatorio», la suya. Con Incapacidad, nada — y ningún campo de hora
 * (las horas son solo de Constancia). La regla pura está en
 * `dias-afuera-y-compensatorio.test.ts`; acá se mira la pantalla.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import JustificarForm from "@/app/asistencia/JustificarForm";
import { MOTIVO_COMPENSATORIO, MOTIVO_TRABAJO_VENDEDOR, TEXTO_DIA_AFUERA, TEXTO_DIA_COMPENSATORIO } from "@/lib/asistencia/motivos";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Llamada = { url: string; init?: RequestInit };
function servir() {
  const llamadas: Llamada[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
  }));
  return llamadas;
}
const montar = () =>
  render(
    <ToastProvider>
      <JustificarForm codigo="13" desdeInicial="2026-09-08" hastaInicial="2026-09-11" onGuardado={() => {}} />
    </ToastProvider>,
  );
const elegir = (motivo: string) =>
  fireEvent.change(document.querySelector("select") as HTMLSelectElement, { target: { value: motivo } });

describe("la nota debajo del motivo", () => {
  it("con Incapacidad (el que abre) no hay nota ni campos de hora", () => {
    servir();
    montar();
    expect(document.querySelector("[data-nota-motivo]")).toBeNull();
    expect(document.querySelector('input[type="time"]')).toBeNull();
  });

  it("🔴 con «Trabajo de vendedor» dice 9:00 a 18:00, una hora de almuerzo, y que solo cuenta sin marca — sin campos de hora", () => {
    servir();
    montar();
    elegir(MOTIVO_TRABAJO_VENDEDOR);
    expect(screen.getByText(TEXTO_DIA_AFUERA)).toBeTruthy();
    expect(screen.getByText(/9:00 a 18:00/)).toBeTruthy();
    expect(document.querySelector('input[type="time"]')).toBeNull();
  });

  it("con «Compensatorio» dice que no se descuenta", () => {
    servir();
    montar();
    elegir(MOTIVO_COMPENSATORIO);
    expect(screen.getByText(TEXTO_DIA_COMPENSATORIO)).toBeTruthy();
    expect(document.querySelector('input[type="time"]')).toBeNull();
  });

  it("🔴 al guardar un rango de Trabajo de vendedor viajan los DÍAS y NINGUNA hora", async () => {
    const llamadas = servir();
    montar();
    elegir(MOTIVO_TRABAJO_VENDEDOR);
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    await waitFor(() => {
      const post = llamadas.find((l) => l.url.includes("/api/asistencia/justificaciones") && l.init?.method === "POST");
      expect(post).toBeTruthy();
      const body = JSON.parse(String(post?.init?.body));
      expect(body).toMatchObject({ codigo: "13", desde: "2026-09-08", hasta: "2026-09-11", motivo: MOTIVO_TRABAJO_VENDEDOR, horaDesde: "", horaHasta: "" });
    });
  });
});
