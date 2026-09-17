/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DÍA ANTERIOR AL INGRESO, EN LA PANTALLA DE VERDAD (15-sep-2026).
 *
 * 🔴 POR QUÉ ESTE ARCHIVO EXISTE. Que el motor deje de cobrar esos días no
 * prueba NADA sobre lo que la contadora ve: la pantalla de Asistencia pinta un
 * día sin marcas y sin explicación como **«Ausencia sin justificar», en rojo**,
 * y eso seguiría pasando con la planilla ya arreglada. Las dos superficies
 * tienen que decir lo mismo del mismo día — si no, el cuadro dice que no debe
 * nada y el renglón dice que faltó.
 *
 * Acá se RENDERIZA `ReporteTab` con los días que el motor ya marcó
 * (`fueraDeVigencia`) y se leen los renglones.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { TEXTO_DIA_FUERA_DE_VIGENCIA } from "@/lib/asistencia/vigencia";
// 🔑 EL PERÍODO DEL REPORTE VIVE EN LA URL desde el 16-sep-2026
// (`?desde=&hasta=`, `useUrlState`), así que la pestaña necesita un router
// montado. Sin App Router `useRouter()` lanza y el componente no pinta. No se
// afloja nada de lo que este archivo prueba: es el arnés, no la regla.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(""),
}));

import ReporteTab from "@/app/asistencia/ReporteTab";

function servir(respuestas: Array<[string, unknown]>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    const par = respuestas.find(([frag]) => u.includes(frag));
    return { ok: true, json: async () => par?.[1] ?? {} } as Response;
  }));
}
const montar = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const dia = (over: Record<string, unknown>) => ({
  fecha: "2026-09-02", marcas: [], marcasIds: [], entrada: null, salida: null,
  tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
  revisar: false, enCurso: false, fueraDeVigencia: false, ausente: false,
  vacacion: null, justificado: null, permiso: null, permisoPerdonaMin: 0,
  feriado: null, habil: true, correcciones: [], ...over,
});

/** ENRIQUE: dos días antes de su ingreso y uno trabajado. */
const enrique = (dias: ReturnType<typeof dia>[]) => ({
  codigo: "56", nombre: "ENRIQUE SANCHEZ", salida: "17:00", almuerzoMin: 30,
  dias,
  resumen: {
    diasTrabajados: 1, ausenciasSinJustificar: 0, ausenciasJustificadas: 0,
    diasTrabajandoFuera: 0, diasVacaciones: 0, diasVacacionesYaPagadas: 0,
    vecesTarde: 0, minutosTarde: 0, minutosTardeDeDiasARevisar: 0,
    diasConPermiso: 0, minutosPerdonadosPorPermiso: 0,
    excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, diasARevisar: 0,
    diasEnCurso: 0, tiempoNoTrabajadoMin: 0, diasCorregidos: 0, correcciones: 0,
  },
});

const conReporte = (p: unknown): Array<[string, unknown]> => [
  ["/api/asistencia/reloj", { relojes: [] }],
  ["/api/asistencia/reporte", { personas: [p], sinHorario: 0, reglas: REGLAS_DEFAULT }],
];

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("🔴 la pantalla dice lo mismo que el pago", () => {
  it("🩸 un día anterior al ingreso NO dice «Ausencia sin justificar»", async () => {
    servir(conReporte(enrique([
      dia({ fecha: "2026-09-02", fueraDeVigencia: true }),
      dia({ fecha: "2026-09-03", fueraDeVigencia: true }),
    ])));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText(/Enrique Sanchez/i));

    expect(screen.getAllByText(TEXTO_DIA_FUERA_DE_VIGENCIA).length).toBe(2);
    expect(screen.queryByText(/Ausencia sin justificar/)).toBeNull();
  });

  it("EL CONTROL: un día que SÍ era suyo y en el que faltó sigue en rojo", async () => {
    servir(conReporte(enrique([
      dia({ fecha: "2026-09-02", fueraDeVigencia: true }),
      dia({ fecha: "2026-09-14", ausente: true }),
    ])));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText(/Enrique Sanchez/i));

    expect(screen.getAllByText(TEXTO_DIA_FUERA_DE_VIGENCIA).length).toBe(1);
    expect(screen.getAllByText(/Ausencia sin justificar/).length).toBe(1);
  });

  it("🔴 no se ofrece «Justificar» en un día que no era suyo", async () => {
    servir(conReporte(enrique([dia({ fecha: "2026-09-02", fueraDeVigencia: true })])));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText(/Enrique Sanchez/i));
    // Un control que no ofrece nada no se dibuja: no hay nada que justificar
    // en un día anterior al ingreso.
    expect(screen.queryByRole("button", { name: /Justificar/ })).toBeNull();
  });

  it("EL CONTROL: en un día que SÍ era suyo, «Justificar» sigue estando", async () => {
    servir(conReporte(enrique([dia({ fecha: "2026-09-14", ausente: true })])));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText(/Enrique Sanchez/i));
    expect(screen.getAllByRole("button", { name: /Justificar/ }).length).toBeGreaterThan(0);
  });

  it("⚠️ si marcó un día que no era suyo, las horas se ven y el día lo dice", async () => {
    servir(conReporte(enrique([
      dia({
        fecha: "2026-09-02", fueraDeVigencia: true,
        marcas: ["08:00:00", "12:00:00", "12:30:00", "17:00:00"],
        marcasIds: [null, null, null, null],
      }),
    ])));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText(/Enrique Sanchez/i));
    expect(screen.getAllByText("08:00:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText(TEXTO_DIA_FUERA_DE_VIGENCIA).length).toBe(1);
  });
});
