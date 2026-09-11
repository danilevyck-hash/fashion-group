/* ─────────────────────────────────────────────────────────────────────────────
 * APROBACIONES POR PERSONA — LA PANTALLA (10-sep-2026).
 *
 * Lo que `asistencia-aprobaciones-pantalla` no cubre: el control de dos
 * opciones (URL y recordado), el domingo como un día más marcado, el renglón
 * decidido a medias («Sí y No») y la casilla «Cobra horas extra» en la ficha.
 * Todo tocando el DOM; nada de mirar el módulo.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, within } from "@testing-library/react";
import { act } from "react";

import { ToastProvider } from "@/components/ToastSystem";
import AprobacionesTab from "@/app/asistencia/AprobacionesTab";
import FichaEditar, { borradorDe } from "@/app/asistencia/colaboradores/FichaEditar";
import { RECORDAR_VISTA } from "@/lib/asistencia/aprobaciones-vistas";
import { PREGUNTA_COBRA_HORAS_EXTRA } from "@/lib/asistencia/cobra-horas-extra";
import type { DiaAprobacion, Decision } from "@/lib/asistencia/aprobaciones";

let URL_ACTUAL = "";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(URL_ACTUAL),
}));

const G = (codigo: string, etiqueta: string, minutos: number, decision: Decision, tipo: "extra" | "domingo" = "extra") => ({
  codigo, etiqueta, empresa: "confecciones_boston", empresaEtiqueta: "Boston", salida: "18:11", minutos,
  diurnoMin: tipo === "extra" ? minutos : 0, nocturnoMin: 0, domFerMin: tipo === "domingo" ? minutos : 0, tipo,
  aprobado: decision === "si", decision, por: decision ? "David" : null,
  cuando: decision ? "2026-09-08T14:02:11.501+00:00" : null, minutosVistos: null, cambio: false,
});
const DIAS: DiaAprobacion[] = [
  { fecha: "2026-09-06", etiqueta: "dom 6 sep", semana: "2026-08-31", minutos: 60,
    gente: [G("51", "YERITZA SOLIS", 60, null, "domingo")] },
  { fecha: "2026-09-07", etiqueta: "lun 7 sep", semana: "2026-09-07", minutos: 70,
    gente: [G("51", "YERITZA SOLIS", 32, null), G("2", "KENNY VARGAS", 38, "si")] },
  { fecha: "2026-09-08", etiqueta: "mar 8 sep", semana: "2026-09-07", minutos: 23,
    gente: [G("2", "KENNY VARGAS", 23, "no")] },
];

let enviados: Array<Record<string, unknown>> = [];
function servidor(dias: DiaAprobacion[] = DIAS) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("/api/asistencia/aprobaciones")) {
      enviados.push(JSON.parse(String(init?.body ?? "{}")));
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    }
    return { ok: true, json: async () => ({ aprobaciones: dias, puedeAprobar: true, avisos: {} }) } as Response;
  });
}
async function montar() {
  render(<ToastProvider><AprobacionesTab /></ToastProvider>);
  await waitFor(() => expect(screen.queryByText("Cargando…")).toBeNull());
}
const toca = async (el: Element | null) => { if (!el) throw new Error("no está"); await act(async () => { (el as HTMLElement).click(); }); };
const boton = (re: RegExp) => screen.getAllByRole("button").find((b) => re.test(b.getAttribute("aria-label") ?? "")) ?? null;

/** El entorno de pruebas no trae `localStorage`: uno en memoria, para probar lo recordado. */
function almacen() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  };
}
let ls: ReturnType<typeof almacen>;
beforeEach(() => {
  URL_ACTUAL = "tab=aprobaciones"; enviados = []; replace.mockClear();
  ls = almacen(); vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("fetch", servidor());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("🔴 el control «Colaborador · Día»", () => {
  it("abre en Colaborador; tocar «Día» cambia la vista, la escribe en la URL y la recuerda", async () => {
    await montar();
    expect(screen.getByRole("radio", { name: "Colaborador" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("vista-colaborador")).toBeTruthy();
    await toca(screen.getByRole("radio", { name: "Día" }));
    expect(screen.getByTestId("vista-dia")).toBeTruthy();
    const url = String(replace.mock.calls[replace.mock.calls.length - 1][0]);
    expect(url).toContain("vista=dia");
    expect(ls.getItem(`fg_last_${RECORDAR_VISTA}`)).toBe("dia");
  });

  it("`?vista=dia` en la URL abre por día", async () => {
    URL_ACTUAL = "tab=aprobaciones&vista=dia";
    await montar();
    expect(screen.getByTestId("vista-dia")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Día" }).getAttribute("aria-checked")).toBe("true");
  });

  it("la vista recordada abre por día sin nada en la URL", async () => {
    ls.setItem(`fg_last_${RECORDAR_VISTA}`, "dia");
    await montar();
    await waitFor(() => expect(screen.getByTestId("vista-dia")).toBeTruthy());
  });

  it("🔴 las dos vistas cuentan lo MISMO arriba: 1 por decidir · 1:32 h", async () => {
    await montar();
    expect(screen.getByTestId("por-decidir").textContent).toBe("1por decidir · 1:32 h");
    await toca(screen.getByRole("radio", { name: "Día" }));
    expect(screen.getByTestId("por-decidir").textContent).toBe("1por decidir · 1:32 h");
  });
});

describe("🔴 el domingo sale como un día más, marcado", () => {
  it("en Colaborador, bajo el ⌄, con su chip «domingo» y su Sí/No", async () => {
    await montar();
    await toca(screen.getByRole("button", { name: /^YERITZA SOLIS$/ }));
    const dias = screen.getByTestId("dias-de-51");
    expect(within(dias).getByText("domingo")).toBeTruthy();
    expect(within(dias).getByText("dom 6 sep")).toBeTruthy();
    await toca(within(dias).getByLabelText("Sí a YERITZA SOLIS el dom 6 sep"));
    expect(enviados[0]).toEqual({ decision: "si", dias: [{ codigo: "51", fecha: "2026-09-06", minutos: 60 }] });
  });

  it("🔴 el Sí del renglón manda SOLO los días pendientes: el ya decidido no viaja", async () => {
    const MEZCLA: DiaAprobacion[] = [
      { ...DIAS[0], gente: [G("51", "YERITZA SOLIS", 60, "si", "domingo")] },
      DIAS[1],
    ];
    vi.stubGlobal("fetch", servidor(MEZCLA));
    await montar();
    expect(screen.getByText("1 día · 0:32 h")).toBeTruthy();
    await toca(boton(/^Sí a YERITZA SOLIS$/));
    expect(enviados[0]).toEqual({ decision: "si", dias: [{ codigo: "51", fecha: "2026-09-07", minutos: 32 }] });
  });

  it("en Día, el domingo es un renglón como los demás", async () => {
    URL_ACTUAL = "tab=aprobaciones&vista=dia";
    await montar();
    expect(screen.getByText(/dom 6/)).toBeTruthy();
    await toca(screen.getByText(/dom 6/).closest("button"));
    expect(screen.getByText("domingo")).toBeTruthy();
  });
});

describe("🔴 «Ya decididas»: plegado, con Sí / No / «Sí y No» y «cambiar»", () => {
  it("Kenny tiene un Sí y un No → «Sí y No · 1:01 h», y «cambiar» muestra los dos días con su botón prendido", async () => {
    await montar();
    const ya = screen.getByTestId("ya-decididas");
    expect(within(ya).queryByText("KENNY VARGAS")).toBeNull(); // plegado
    await toca(within(ya).getByRole("button", { name: /Ya decididas \(1\)/ }));
    expect(within(ya).getByText("KENNY VARGAS")).toBeTruthy();
    expect(within(ya).getByText("Sí y No")).toBeTruthy();
    expect(within(ya).getByText("1:01 h")).toBeTruthy();
    await toca(within(ya).getByRole("button", { name: "cambiar" }));
    expect(within(ya).getByLabelText("Sí a KENNY VARGAS el lun 7 sep").getAttribute("aria-pressed")).toBe("true");
    expect(within(ya).getByLabelText("No a KENNY VARGAS el mar 8 sep").getAttribute("aria-pressed")).toBe("true");
    expect(within(ya).getByText(/Decidido por David · 8 sep/)).toBeTruthy();
  });

  it("y no se dibuja cuando no hay nada decidido", async () => {
    vi.stubGlobal("fetch", servidor([DIAS[0]]));
    await montar();
    expect(screen.queryByTestId("ya-decididas")).toBeNull();
  });
});

describe("🔴 la ficha: «¿Cobra horas extra?» viene en Sí y se apaga con un toque", () => {
  it("el borrador arranca en Sí para una ficha nueva y para una vieja sin el dato", () => {
    expect(borradorDe(null, "51").cobraHorasExtra).toBe(true);
    expect(borradorDe({ codigo: "51", nombre: "YERITZA", salarioMensual: 600, jornadaSemanal: 40, empresa: "confecciones_boston",
      servicioProfesional: false, pagaSeguros: true, baseSeguros: null, noMarcaReloj: false, fechaIngreso: null,
      fechaSalida: null, motivoSalida: null, saldoVacacionesDias: null, saldoVacacionesCorte: null, activo: true,
      baja: null, marcaciones: 0, ultimaMarca: null }, "51").cobraHorasExtra).toBe(true);
  });

  it("el campo está en Excepciones, en Sí, y cambiarlo manda `cobraHorasExtra: false`", async () => {
    const onCambio = vi.fn();
    render(
      <ToastProvider>
        <FichaEditar
          borrador={borradorDe(null, "51")} onCambio={onCambio} onGuardar={() => {}} onCancelar={() => {}}
          guardando={false} nueva={false} permisos={null} puedeEditar onCambioFoto={() => {}}
        />
      </ToastProvider>,
    );
    await toca(screen.getByRole("button", { name: /Excepciones/ }));
    const select = screen.getByLabelText(PREGUNTA_COBRA_HORAS_EXTRA) as HTMLSelectElement;
    expect(select.value).toBe("si");
    fireEvent.change(select, { target: { value: "no" } });
    expect(onCambio).toHaveBeenCalledWith(expect.objectContaining({ cobraHorasExtra: false }));
  });
});
