// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «VER SUS DÍAS ›» LLEVA A SUS DÍAS (11-sep-2026).
//
// 🩸 La ficha del colaborador mandaba `?tab=asistencia&desde=…&hasta=…&q=<código>`
// y la pestaña Asistencia no leía ninguno de los tres: aterrizaba en la lista de
// TODOS con el último rango guardado. Aprobaciones sí leía `desde`/`hasta` de
// la URL; esta pestaña no leía nada.
//
// Se monta la pestaña REAL con esa URL y se mira QUÉ PIDE al servidor: el rango
// y el código tienen que viajar en la primera lectura, y el rango de la URL
// tiene que ganarle al recordado por dispositivo.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ToastProvider } from "@/components/ToastSystem";

let URL_ACTUAL = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(URL_ACTUAL),
}));

import ReporteTab from "@/app/asistencia/ReporteTab";

const RESPUESTA = { personas: [], sinHorario: 0, reglas: null, correcciones: { correcciones: 0, dias: 0, agregadas: 0 } };

function montar() {
  const llamadas: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    llamadas.push(String(url));
    return { ok: true, status: 200, json: async () => RESPUESTA };
  }) as unknown as typeof fetch);
  render(<ToastProvider><ReporteTab /></ToastProvider>);
  return llamadas;
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* jsdom */ }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("🔴 la pestaña Asistencia lee desde, hasta y q de la URL al montar", () => {
  it("con la URL de «Ver sus días ›» pide ESE rango y ESE código", async () => {
    URL_ACTUAL = "tab=asistencia&desde=2026-09-01&hasta=2026-09-15&q=22";
    const llamadas = montar();
    await waitFor(() => expect(llamadas.some((u) => u.includes("/api/asistencia/reporte"))).toBe(true));
    const pedido = llamadas.find((u) => u.includes("/api/asistencia/reporte"))!;
    expect(pedido).toContain("desde=2026-09-01");
    expect(pedido).toContain("hasta=2026-09-15");
    expect(pedido).toContain("q=22");
  });

  it("🔑 el rango de la URL le gana al recordado por dispositivo", async () => {
    try {
      localStorage.setItem("fg_rango_asistencia_reporte", JSON.stringify({ desde: "2026-01-01", hasta: "2026-01-31" }));
    } catch { /* jsdom */ }
    URL_ACTUAL = "tab=asistencia&desde=2026-09-01&hasta=2026-09-15&q=22";
    const llamadas = montar();
    await waitFor(() => expect(llamadas.some((u) => u.includes("/api/asistencia/reporte"))).toBe(true));
    const ultimo = llamadas.filter((u) => u.includes("/api/asistencia/reporte")).at(-1)!;
    expect(ultimo).toContain("desde=2026-09-01");
    expect(ultimo).not.toContain("desde=2026-01-01");
  });

  it("⚠️ CONTROL: sin nada en la URL, no manda `q` y el rango es el de siempre (14 días o el recordado)", async () => {
    URL_ACTUAL = "tab=asistencia";
    const llamadas = montar();
    await waitFor(() => expect(llamadas.some((u) => u.includes("/api/asistencia/reporte"))).toBe(true));
    const pedido = llamadas.find((u) => u.includes("/api/asistencia/reporte"))!;
    expect(pedido).not.toContain("q=");
    expect(pedido).toMatch(/desde=\d{4}-\d{2}-\d{2}/);
  });

  it("basura en la URL no se cree: un rango al revés se ignora", async () => {
    URL_ACTUAL = "tab=asistencia&desde=2026-09-15&hasta=2026-09-01&q=22";
    const llamadas = montar();
    await waitFor(() => expect(llamadas.some((u) => u.includes("/api/asistencia/reporte"))).toBe(true));
    const pedido = llamadas.find((u) => u.includes("/api/asistencia/reporte"))!;
    expect(pedido).not.toContain("desde=2026-09-15");
    // el código sí viaja: es válido por sí solo
    expect(pedido).toContain("q=22");
  });

  it("y el enlace de la ficha sigue mandando los tres parámetros", () => {
    const src = readFileSync(join(process.cwd(), "src", "app", "asistencia", "colaboradores", "SeccionAsistencia.tsx"), "utf8");
    expect(src).toMatch(/tab=asistencia&desde=\$\{desde\}&hasta=\$\{hasta\}&q=\$\{encodeURIComponent\(codigo\)\}/);
  });
});
