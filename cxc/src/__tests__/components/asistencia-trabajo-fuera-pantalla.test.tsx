/**
 * ─────────────────────────────────────────────────────────────────────────────
 * «TRABAJO FUERA DE LA OFICINA», EN LA PANTALLA DE VERDAD.
 *
 * 🔴 POR QUÉ ESTE ARCHIVO EXISTE. Que `textoDiaJustificado()` devuelva el texto
 * correcto no prueba NADA sobre lo que Daniel ve: el reporte podía seguir
 * pintando «Ausencia justificada — Trabajo fuera de la oficina» a mano y todos
 * los tests de función pura seguirían en verde. Acá se RENDERIZA `ReporteTab`
 * con datos y se leen los renglones.
 *
 * Lo que se sostiene:
 *   1. el renglón del día dice «Trabajando fuera de la oficina» y NO la palabra
 *      "ausencia";
 *   2. se ve SIN abrir nada — el chip en la fila de la persona. Sin él, quien
 *      trabajó todo el mes afuera aparece con «0 días trabajados» y ninguna
 *      explicación: idéntico a alguien que no vino;
 *   3. el motivo nuevo se puede ELEGIR en Justificaciones (si no está en el
 *      desplegable, nada de lo anterior llega a ocurrir nunca).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { MOTIVO_TRABAJO_VENDEDOR, MOTIVOS_JUSTIFICACION } from "@/lib/asistencia/motivos";
import ReporteTab from "@/app/asistencia/ReporteTab";
import JustificacionesTab from "@/app/asistencia/JustificacionesTab";

function servir(respuestas: Array<[string, unknown]>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    const par = respuestas.find(([frag]) => u.includes(frag));
    return { ok: true, json: async () => par?.[1] ?? {} } as Response;
  }));
}
const montar = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const dia = (over: Record<string, unknown>) => ({
  fecha: "2026-08-06", marcas: [], marcasIds: [], entrada: null, salida: null,
  tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
  revisar: false, ausente: false, justificado: null, feriado: null, habil: true,
  correcciones: [], ...over,
});

/** RODRIGO: dos días sin marcas, los dos de trabajo fuera. */
const persona = (justificado: string | null, diasTrabajandoFuera: number) => ({
  codigo: "13", nombre: "RODRIGO MIRANDA", salida: "17:00", almuerzoMin: 30,
  dias: [
    dia({ fecha: "2026-08-05", justificado }),
    dia({ fecha: "2026-08-06", justificado }),
  ],
  resumen: {
    diasTrabajados: 0, ausenciasSinJustificar: 0,
    ausenciasJustificadas: justificado && diasTrabajandoFuera === 0 ? 2 : 0,
    diasTrabajandoFuera,
    vecesTarde: 0, minutosTarde: 0, minutosTardeDeDiasARevisar: 0,
    excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, diasARevisar: 0,
    tiempoNoTrabajadoMin: 0, diasCorregidos: 0, correcciones: 0,
  },
});

const conReporte = (p: unknown): Array<[string, unknown]> => [
  ["/api/asistencia/reloj", { relojes: [] }],
  ["/api/asistencia/reporte", { personas: [p], sinHorario: 0, reglas: REGLAS_DEFAULT }],
];

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 El reporte lo distingue A LA VISTA", () => {
  it("el renglón del día dice «Trabajando fuera de la oficina», sin la palabra ausencia", async () => {
    servir(conReporte(persona(MOTIVO_TRABAJO_VENDEDOR, 2)));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText(/RODRIGO MIRANDA/));

    const renglones = screen.getAllByText(/Trabajando fuera de la oficina/);
    expect(renglones.length).toBeGreaterThan(0);
    // Y en ninguna parte de la pantalla se le llama ausencia a este día.
    expect(screen.queryByText(/Ausencia justificada — Trabajo fuera/)).toBeNull();
  });

  it("un día de VACACIONES sigue diciendo «Ausencia justificada — Vacaciones»", async () => {
    servir(conReporte(persona("Vacaciones", 0)));
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText(/RODRIGO MIRANDA/));
    expect(screen.getAllByText(/Ausencia justificada — Vacaciones/).length).toBeGreaterThan(0);
  });

  it("🔴 se ve SIN abrir nada: el chip «N días trabajando fuera» en la fila", async () => {
    servir(conReporte(persona(MOTIVO_TRABAJO_VENDEDOR, 2)));
    montar(<ReporteTab />);
    await screen.findByText(/RODRIGO MIRANDA/);
    // Sin tocar la fila.
    expect(screen.getByText(/2 días trabajando fuera/)).toBeTruthy();
  });

  it("el chip NO aparece cuando no hay días de trabajo fuera", async () => {
    servir(conReporte(persona("Vacaciones", 0)));
    montar(<ReporteTab />);
    await screen.findByText(/RODRIGO MIRANDA/);
    expect(screen.queryByText(/trabajando fuera/i)).toBeNull();
  });

  it("con UN solo día el chip está en singular — «1 día», no «1 días»", async () => {
    servir(conReporte({ ...persona(MOTIVO_TRABAJO_VENDEDOR, 1) }));
    montar(<ReporteTab />);
    await screen.findByText(/RODRIGO MIRANDA/);
    expect(screen.getByText(/1 día trabajando fuera/)).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("El motivo se puede ELEGIR en Justificaciones", () => {
  it("aparece en el desplegable, y los cuatro de Daniel son los únicos", async () => {
    servir([["/api/asistencia/justificaciones", {
      justificaciones: [], motivos: MOTIVOS_JUSTIFICACION, personas: [], faltaMigracion: false,
    }]]);
    montar(<JustificacionesTab />);
    // La opción existe y se puede elegir de verdad.
    const opcion = await screen.findByRole("option", { name: MOTIVO_TRABAJO_VENDEDOR });
    expect(opcion).toBeTruthy();
    for (const m of ["Incapacidad", "Catástrofe", "Escolares"]) {
      expect(screen.getByRole("option", { name: m })).toBeTruthy();
    }
    // 🔴 Y los retirados NO se pueden elegir: se leen si ya están guardados,
    // pero nadie puede crear una justificación nueva con ellos.
    for (const m of ["Vacaciones", "Permiso", "Luto", "Otro"]) {
      expect(screen.queryByRole("option", { name: m })).toBeNull();
    }
  });
});
