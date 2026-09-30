// ─────────────────────────────────────────────────────────────────────────────
// 🔴 AUDIT VISUAL DE ASISTENCIA, LO DE CONFIGURACIÓN (29-sep-2026, aprobado por
// Daniel letra por letra):
//
//   5a  Horarios · Feriados · Reglas salen del pie de Colaboradores y viven en
//       ⚙ Configuración (`?config=`), con un control segmentado.
//   6a  La pestaña activa se ve por el subrayado; el anillo solo con teclado
//       (`focus-visible`). El filtro de la lista es un control segmentado.
//   3a  Una sola frase verdadera: «43 colaboradores · 5 por completar».
//   2a  Horarios: el nombre con ancho fijo, sin «Confirmado» por fila.
//   21a Las horas en 24 h (`leerHora24`), no el `type="time"` del sistema.
//   20a Feriados pasados en gris, sin «Quitar», y fecha corta «jue 1 ene».
//   18a Reglas: una fila por regla con la unidad pegada.
//   19  El excedente se queda, plegado y en gris.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, cleanup, within } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { contarFaltantes } from "@/lib/asistencia/que-le-falta";
import { leerHora24 } from "@/lib/asistencia/hora-24";
import ConfiguracionTab from "@/app/asistencia/ConfiguracionTab";
import FeriadosTab from "@/app/asistencia/FeriadosTab";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const base = {
  jornadaSemanal: 48, configurado: true, faltaSalario: false, servicioProfesional: false,
  pagaSeguros: true, baseSeguros: null, noMarcaReloj: false, marcaciones: 100,
  ultimaMarca: "2026-09-10", rataHora: 4.09, valorMinuto: 0.07, fechaSalida: null,
  motivoSalida: null, activo: true, baja: null, marcoDespuesDeLaBaja: false, tieneHorario: true,
};
const ALEJANDRA = {
  ...base, codigo: "22", nombre: "ALEJANDRA CAMAÑO", salarioMensual: 523.47, empresa: "confecciones_boston",
  jornadaSemanal: 40, rataHora: 3.02, posicion: null, cedula: null, fechaIngreso: "2024-01-08",
};
const ANDREA = {
  ...base, codigo: "16", nombre: "ANDREA PEREZ", salarioMensual: 700, empresa: "vistana",
  rataHora: 3.37, posicion: "Vendedora", cedula: "8-111-222", fechaIngreso: "2023-05-02",
};
const DATOS = {
  personas: [ALEJANDRA, ANDREA], ignorados: [], reglas: REGLAS_DEFAULT,
  resumen: { total: 2, sinConfigurar: 0, sinSalario: 0, conMarcaciones: 2, bajas: 0, servicioProfesional: 0, noMarcaReloj: 0 },
  faltaMigracion: false, avisoMigracion: null, avisoMigracionBajas: null, puedeDarDeBaja: true, avisoBajas: null,
  avisoMigracionServicioProfesional: null, puedeMarcarServicioProfesional: true,
};

function servir(extra: Record<string, unknown> = {}) {
  const f = vi.fn(async (url: string) => {
    const u = String(url);
    const hit = Object.keys(extra).find((k) => u.includes(k));
    const body = hit ? extra[hit] : u.includes("/api/asistencia/configuracion") ? DATOS : {};
    return { ok: true, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", f);
  return f;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("21a · leerHora24", () => {
  it("lo que un dedo teclea sale en HH:MM de 24 h", () => {
    expect(leerHora24("16:30")).toBe("16:30");
    expect(leerHora24("1630")).toBe("16:30");
    expect(leerHora24("9:05")).toBe("09:05");
    expect(leerHora24("905")).toBe("09:05");
    expect(leerHora24("17")).toBe("17:00");
    expect(leerHora24("9")).toBe("09:00");
    expect(leerHora24(" 00:00 ")).toBe("00:00");
    expect(leerHora24("")).toBe("");
  });
  it("lo que no es una hora del día es null, nunca una hora inventada", () => {
    for (const malo of ["24:00", "16:60", "4:30 p", "12345", "ab", "16:3", ":30"]) {
      expect(leerHora24(malo), malo).toBeNull();
    }
  });
  it("Horarios ya no usa type=\"time\"", () => {
    const tab = leer("src/app/asistencia/HorariosTab.tsx");
    expect(tab).not.toMatch(/type="time"/);
    // 2a: sin «Confirmado» por fila y sin la columna del nombre en 0.
    expect(tab).not.toMatch(/>Confirmado</);
    expect(tab).not.toMatch(/grid-cols-\[minmax\(0,1fr\)_auto/);
  });
});

describe("5a · Colaboradores queda solo con personas", () => {
  it("con el acomodo nuevo no dibuja Horarios, Feriados ni Reglas al pie", async () => {
    servir();
    render(<ToastProvider><ConfiguracionTab personaEnElCentro /></ToastProvider>);
    await screen.findAllByText(/Alejandra Camaño/);
    expect(screen.queryByText("Reglas del cálculo")).toBeNull();
    expect(screen.queryByText("Feriados y cierres")).toBeNull();
    expect(screen.queryByText("Horarios")).toBeNull();
  });

  it("3a · la frase de arriba cuenta lo MISMO que el filtro", async () => {
    servir();
    render(<ToastProvider><ConfiguracionTab personaEnElCentro /></ToastProvider>);
    await screen.findAllByText(/Alejandra Camaño/);
    const { completar } = contarFaltantes([ALEJANDRA, ANDREA]);
    expect(completar).toBeGreaterThan(0);
    expect(screen.getByText(`2 colaboradores · ${completar} por completar`)).toBeTruthy();
    expect(screen.queryByText(/en la lista|listos para pagar/)).toBeNull();
    // 6a: el filtro es un control segmentado, sin botones negros.
    const filtro = screen.getByRole("tablist", { name: "Filtrar la lista" });
    expect(within(filtro).getByRole("tab", { name: "Todos 2" })).toBeTruthy();
    expect(within(filtro).getByRole("tab", { name: `Por completar ${completar}` })).toBeTruthy();
    expect(filtro.innerHTML).not.toMatch(/bg-black/);
  });

  it("⚙ vive en AsistenciaClient, con `?config=` y el control segmentado", () => {
    const src = leer("src/app/asistencia/AsistenciaClient.tsx");
    expect(src).toMatch(/useUrlState<string>\("config", ""/);
    expect(src).toMatch(/aria-label="Configuración"/);
    expect(src).toMatch(/<ConfiguracionTab ajuste=\{config\} \/>/);
    // 6a: el anillo solo con teclado.
    expect(src).toMatch(/focus-visible:ring-2/);
  });
});

describe("18a · 19 · Reglas en ⚙", () => {
  it("una fila por regla con la unidad pegada; el excedente plegado y en gris", async () => {
    servir();
    render(<ToastProvider><ConfiguracionTab ajuste="reglas" /></ToastProvider>);
    const caja = (n: string) => screen.getByRole("textbox", { name: n });
    const campo = await screen.findByRole("textbox", { name: "Tolerancia de tardanza" });
    expect((campo as HTMLInputElement).value).toBe(String(REGLAS_DEFAULT.toleranciaTardanzaMin));
    expect(campo.nextElementSibling?.textContent).toBe("min");
    expect(caja("40 horas por semana").nextElementSibling?.textContent).toBe("h/mes");
    expect(caja("Seguro social").nextElementSibling?.textContent).toBe("%");
    expect(caja("Domingos y feriados").nextElementSibling?.textContent).toBe("×");
    // ⓘ consistente: Domingos y feriados ya tiene el suyo.
    expect(screen.getByRole("button", { name: "Domingos y feriados" })).toBeTruthy();
    const plegable = screen.getByText("Excedente nocturno (no se usa hoy)").closest("details")!;
    expect(plegable.open).toBe(false);
    // Sin la lista de gente.
    expect(screen.queryByText(/Alejandra Camaño/)).toBeNull();
  });
});

describe("20a · Feriados", () => {
  it("lo que ya pasó va en gris, dice «pasó» y no ofrece «Quitar»; fecha corta", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T15:00:00Z"));
    servir({
      "/api/asistencia/feriados": {
        feriados: [
          { fecha: "2026-01-01", nombre: "Año Nuevo" },
          { fecha: "2026-11-03", nombre: "Separación de Colombia" },
        ],
      },
    });
    render(<ToastProvider><FeriadosTab /></ToastProvider>);
    const viejo = (await screen.findByText("Año Nuevo")).parentElement!.parentElement!;
    expect(within(viejo).getByText("jue 1 ene")).toBeTruthy();
    expect(within(viejo).getByText("pasó")).toBeTruthy();
    expect(within(viejo).queryByRole("button", { name: "Quitar" })).toBeNull();
    const nuevo = screen.getByText("Separación de Colombia").parentElement!.parentElement!;
    expect(within(nuevo).getByText("mar 3 nov")).toBeTruthy();
    expect(within(nuevo).getByRole("button", { name: "Quitar" })).toBeTruthy();
  });
});
