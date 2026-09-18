/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EN LA PANTALLA: LA MARCA REPETIDA SE VE TACHADA Y DICE POR QUÉ (18-sep-2026)
 *
 * Daniel: *«quiero que el sistema agarre la primera marcación y olvide la
 * próxima si es en x cantidad de tiempo»* — «1 minuto». El encargo: *«SE VE.
 * No puede ser magia silenciosa. Un número que cambia sin explicación es peor
 * que el error»*.
 *
 * 🔴 POR QUÉ SE RENDERIZA: que el motor ponga la marca en `repetidas` no prueba
 * que la contadora la vea. Lo que se sostiene aquí es lo que ella ve.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";

vi.hoisted(() => { process.env.NEXT_PUBLIC_PERSONA_EN_EL_CENTRO = "1"; });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(""),
}));

import ReporteTab from "@/app/asistencia/ReporteTab";

function servir(respuestas: Array<[string, unknown]>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const par = respuestas.find(([frag]) => String(url).includes(frag));
    return { ok: true, json: async () => par?.[1] ?? {} } as Response;
  }));
}
const montar = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

/** El día real de Ramón Miranda (21), 3-ago-2026, ya pasado por el motor. */
const BUENAS = ["07:58:36", "13:55:43", "14:22:04", "17:10:43"];
const REPETIDA = { hora: "07:58:37", despuesDe: "07:58:36", segundosDespues: 1, id: "m1" };

const dia = (over: Record<string, unknown>) => ({
  fecha: "2026-08-03", marcas: [] as string[], marcasIds: [] as Array<string | null>,
  repetidas: [] as Array<typeof REPETIDA>,
  entrada: null, salida: null,
  tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
  revisar: false, salidaSospechosa: false, enCurso: false, fueraDeVigencia: false,
  ausente: false, vacacion: null, justificado: null, permiso: null, permisoRango: null,
  permisoPerdonaMin: 0, permisoPerdonaSalidaMin: 0, permisoPerdonaAlmuerzoMin: 0,
  feriado: null, habil: true, correcciones: [],
  ...over,
});

const resumen = (over: Record<string, unknown> = {}) => ({
  diasTrabajados: 1, ausenciasSinJustificar: 0, ausenciasJustificadas: 0,
  diasTrabajandoFuera: 0, diasVacaciones: 0, diasVacacionesYaPagadas: 0,
  vecesTarde: 0, minutosTarde: 0, minutosTardeDeDiasARevisar: 0,
  diasConPermiso: 0, minutosPerdonadosPorPermiso: 0,
  minutosPerdonadosTarde: 0, minutosPerdonadosSalidaTemprana: 0, minutosPerdonadosAlmuerzo: 0,
  excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, diasARevisar: 0,
  diasEnCurso: 0, tiempoNoTrabajadoMin: 0, diasCorregidos: 0, correcciones: 0, marcasRepetidas: 0,
  ...over,
});

function respuesta(repetidas: Array<typeof REPETIDA>) {
  return [
    ["/api/asistencia/reloj", { relojes: [] }],
    ["/api/asistencia/reporte", {
      personas: [{
        codigo: "21", nombre: "RAMON MIRANDA", salida: "17:00", almuerzoMin: 30,
        dias: [dia({ marcas: BUENAS, marcasIds: ["m0", "m2", "m3", "m4"], entrada: BUENAS[0], salida: BUENAS[3], repetidas })],
        resumen: resumen({ marcasRepetidas: repetidas.length }),
      }],
      sinHorario: 0, sinHorarioLista: [], reglas: REGLAS_DEFAULT,
      correccionesDisponible: true, decisionesExtra: {},
    }],
  ] as Array<[string, unknown]>;
}

beforeEach(() => { try { localStorage.clear(); } catch { /* jsdom */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function abrirElDetalle() {
  await waitFor(() => expect(screen.getByText(/Ramon Miranda/i)).toBeTruthy());
  fireEvent.click(screen.getByText(/Ramon Miranda/i));
  await waitFor(() => expect(screen.getByText("Entrada")).toBeTruthy());
}

describe("🔴 la repetida se ve tachada, con su porqué, y se cuenta arriba", () => {
  it("🩸 Ramón, 3-ago: las cuatro buenas en sus columnas, la 07:58:37 tachada y explicada", async () => {
    servir(respuesta([REPETIDA]));
    montar(<ReporteTab />);
    await abrirElDetalle();
    for (const h of BUENAS) expect(screen.getByText(h)).toBeTruthy();
    // La repetida está —no se esconde— y va TACHADA.
    const tachada = screen.getByText("07:58:37");
    expect(tachada.className).toContain("line-through");
    // Y dice POR QUÉ, con el mismo texto que el Excel.
    expect(screen.getByText(/repetida, 1 s después de 07:58:36 — no cuenta/)).toBeTruthy();
    // Sin «5 marcas» ni «Revisar»: el día quedó en 4.
    expect(screen.queryByText("5 marcas")).toBeNull();
    expect(screen.queryByText("Revisar")).toBeNull();
  });

  it("🔴 arriba de la tabla se dice cuántas se olvidaron solas", async () => {
    servir(respuesta([REPETIDA]));
    montar(<ReporteTab />);
    await waitFor(() => expect(screen.getByText(/1 marcación repetida del reloj se olvidó sola/)).toBeTruthy());
    expect(screen.getByText(/se olvidó sola/).textContent).toContain("60 s o menos");
  });

  it("⚠️ sin repetidas no hay aviso ni fila tachada: la pantalla es la de siempre", async () => {
    servir(respuesta([]));
    montar(<ReporteTab />);
    await abrirElDetalle();
    expect(screen.queryByText(/se olvidó sola|se olvidaron solas/)).toBeNull();
    expect(screen.queryByText(/repetida/)).toBeNull();
  });
});
