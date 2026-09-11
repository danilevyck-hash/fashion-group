/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CORREGIR UNA HORA — EN LA PANTALLA DE VERDAD (11-sep-2026).
 *
 * Se renderizan `CorregirMarcacionModal` y `ReporteTab` con datos y se mira lo
 * que Daniel ve: el selector de hora precargado, los botones del porqué, el
 * freno de Guardar, y «Justificar» en la fila del día abriendo el formulario
 * con ese día puesto. La regla pura está en `asistencia-corregir-hora.test.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { MOTIVOS_JUSTIFICACION } from "@/lib/asistencia/motivos";
import CorregirMarcacionModal from "@/app/asistencia/CorregirMarcacionModal";
import ReporteTab from "@/app/asistencia/ReporteTab";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Llamada = { url: string; init?: RequestInit };
function servir(respuestas: Array<[string, unknown]>, llamadas: Llamada[] = []) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas.push({ url: u, init });
    const par = respuestas.find(([frag]) => u.includes(frag));
    return { ok: true, status: 200, json: async () => par?.[1] ?? {} } as Response;
  }));
  return llamadas;
}
const montar = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const MARCA = {
  marcacionId: "m1",
  codigo: "26",
  persona: "Yulissa Juárez",
  fecha: "2026-08-31",
  relojHora: "13:22:02",
};

describe("la ventana «Corregir la hora»", () => {
  it("dice arriba, en una línea, quién · día · qué marcó el reloj; sin el recuadro viejo", async () => {
    servir([["/correcciones/motivos", { motivos: [] }]]);
    montar(<CorregirMarcacionModal marca={MARCA} onCerrar={() => {}} onGuardado={() => {}} />);
    expect(await screen.findByText("Yulissa Juárez · lun 31 ago · el reloj marcó 13:22:02")).toBeTruthy();
    expect(screen.queryByText(/Esto no se borra nunca/)).toBeNull();
    expect(screen.queryByText(/Como 8:00/)).toBeNull();
  });

  it("🔴 la hora es un <input type=time step=1>, precargado con la hora del reloj CON segundos", async () => {
    servir([["/correcciones/motivos", { motivos: [] }]]);
    montar(<CorregirMarcacionModal marca={MARCA} onCerrar={() => {}} onGuardado={() => {}} />);
    await screen.findByText(/el reloj marcó/);
    const hora = document.querySelector('input[type="time"]') as HTMLInputElement;
    expect(hora).toBeTruthy();
    expect(hora.getAttribute("step")).toBe("1");
    expect(hora.value).toBe("13:22:02");
    expect(document.querySelector('input[type="text"]')).toBeNull();
  });

  it("sin historia no hay botones; con historia salen los que manda la ruta y tocar uno escribe en el campo", async () => {
    servir([["/correcciones/motivos", { motivos: ["Se le olvidó marcar", "Reloj sin internet"] }]]);
    montar(<CorregirMarcacionModal marca={MARCA} onCerrar={() => {}} onGuardado={() => {}} />);
    const chip = await screen.findByRole("button", { name: "Se le olvidó marcar" });
    expect(screen.getByRole("button", { name: "Reloj sin internet" })).toBeTruthy();
    const motivo = document.querySelector("textarea") as HTMLTextAreaElement;
    expect(motivo.value).toBe("");
    fireEvent.click(chip);
    expect(motivo.value).toBe("Se le olvidó marcar");
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    // Sigue siendo campo LIBRE: se puede seguir escribiendo encima.
    fireEvent.change(motivo, { target: { value: "Se le olvidó marcar, avisó" } });
    expect(motivo.value).toBe("Se le olvidó marcar, avisó");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
  });

  it("🔴 Guardar está apagado sin porqué y dice qué falta; con porqué se prende", async () => {
    servir([["/correcciones/motivos", { motivos: [] }]]);
    montar(<CorregirMarcacionModal marca={MARCA} onCerrar={() => {}} onGuardado={() => {}} />);
    await screen.findByText(/el reloj marcó/);
    const guardar = screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    expect(screen.getByText(/Falta: el porqué/)).toBeTruthy();
    fireEvent.change(document.querySelector("textarea") as HTMLTextAreaElement, { target: { value: "Avisó" } });
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(false);
    // «Cerrar» abajo (más la × de arriba, que también se llama así).
    expect(screen.getAllByRole("button", { name: "Cerrar" }).length).toBeGreaterThanOrEqual(1);
  });

  it("🔴 al guardar viaja la hora COMPLETADA: sin tocar los segundos se conservan los del reloj", async () => {
    const llamadas = servir([
      ["/correcciones/motivos", { motivos: [] }],
      ["/api/asistencia/correcciones", { ok: true, id: "c1" }],
    ]);
    const onGuardado = vi.fn();
    montar(<CorregirMarcacionModal marca={MARCA} onCerrar={() => {}} onGuardado={onGuardado} />);
    await screen.findByText(/el reloj marcó/);
    // El iPhone devuelve solo HH:MM aunque el step sea 1.
    fireEvent.change(document.querySelector('input[type="time"]') as HTMLInputElement, { target: { value: "13:22" } });
    fireEvent.change(document.querySelector("textarea") as HTMLTextAreaElement, { target: { value: "Avisó" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    const post = llamadas.find((l) => l.init?.method === "POST");
    expect(post).toBeTruthy();
    const body = JSON.parse(String(post?.init?.body));
    expect(body.hora).toBe("13:22:02");
    expect(body.motivo).toBe("Avisó");
    expect(body.marcacionId).toBe("m1");
  });

  it("hora nueva sin segundos → :00", async () => {
    const llamadas = servir([
      ["/correcciones/motivos", { motivos: [] }],
      ["/api/asistencia/correcciones", { ok: true, id: "c1" }],
    ]);
    const onGuardado = vi.fn();
    montar(<CorregirMarcacionModal marca={MARCA} onCerrar={() => {}} onGuardado={onGuardado} />);
    await screen.findByText(/el reloj marcó/);
    fireEvent.change(document.querySelector('input[type="time"]') as HTMLInputElement, { target: { value: "08:00" } });
    fireEvent.change(document.querySelector("textarea") as HTMLTextAreaElement, { target: { value: "Avisó" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    const post = llamadas.find((l) => l.init?.method === "POST");
    expect(JSON.parse(String(post?.init?.body)).hora).toBe("08:00:00");
  });

  it("agregando: la línea dice «el reloj no registró nada» y la hora arranca vacía", async () => {
    servir([["/correcciones/motivos", { motivos: [] }]]);
    montar(<CorregirMarcacionModal marca={{ ...MARCA, marcacionId: null, relojHora: null }} onCerrar={() => {}} onGuardado={() => {}} />);
    expect(await screen.findByText("Yulissa Juárez · lun 31 ago · el reloj no registró nada")).toBeTruthy();
    expect((document.querySelector('input[type="time"]') as HTMLInputElement).value).toBe("");
    expect(screen.getByText(/Falta: la hora y el porqué/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// «JUSTIFICAR» EN LA FILA DEL DÍA
// ─────────────────────────────────────────────────────────────────────────────

const dia = (over: Record<string, unknown>) => ({
  fecha: "2026-08-31", marcas: [], marcasIds: [], entrada: null, salida: null,
  tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
  revisar: false, ausente: false, justificado: null, feriado: null, habil: true,
  correcciones: [], ...over,
});
const PERSONA = {
  codigo: "26", nombre: "YULISSA JUAREZ", salida: "17:00", almuerzoMin: 30,
  dias: [
    dia({ fecha: "2026-08-31", marcas: ["13:22:02"], marcasIds: ["m1"], tardeMin: 322.03, revisar: true }),
    dia({ fecha: "2026-09-01", feriado: "Feriado de prueba" }),
    dia({ fecha: "2026-09-02", justificado: "Incapacidad" }),
  ],
  resumen: {
    diasTrabajados: 1, ausenciasSinJustificar: 0, ausenciasJustificadas: 1, diasTrabajandoFuera: 0,
    vecesTarde: 1, minutosTarde: 322.03, minutosTardeDeDiasARevisar: 322.03,
    excesoAlmuerzoMin: 0, salidaTempranaMin: 0, tiempoNoTrabajadoMin: 322.03, extraMin: 0,
    diasARevisar: 1, diasCorregidos: 0,
  },
};

describe("«Justificar» en la fila del día", () => {
  const base: Array<[string, unknown]> = [
    ["/api/asistencia/reloj", { relojes: [] }],
    ["/api/asistencia/justificaciones", { justificaciones: [], personas: [], motivos: MOTIVOS_JUSTIFICACION }],
    ["/api/asistencia/reporte", { personas: [PERSONA], sinHorario: 0, reglas: REGLAS_DEFAULT, correccionesDisponible: true }],
  ];

  async function abrirPersona() {
    fireEvent.click(await screen.findByText("Yulissa Juarez"));
    await screen.findByText("lun 31 ago");
  }

  it("🔴 está en la fila del día, al lado de «Agregar hora», y no en el feriado ni en el día ya justificado", async () => {
    servir(base);
    montar(<ReporteTab />);
    await abrirPersona();
    const filaDia = screen.getByText("lun 31 ago").closest("tr") as HTMLTableRowElement;
    expect(within(filaDia).getByRole("button", { name: "Agregar hora" })).toBeTruthy();
    expect(within(filaDia).getByRole("button", { name: "Justificar" })).toBeTruthy();
    const feriado = screen.getByText("mar 1 sep").closest("tr") as HTMLTableRowElement;
    expect(within(feriado).queryByRole("button", { name: "Justificar" })).toBeNull();
    const justificado = screen.getByText("mié 2 sep").closest("tr") as HTMLTableRowElement;
    expect(within(justificado).queryByRole("button", { name: "Justificar" })).toBeNull();
  });

  it("🔴 abre el formulario con el colaborador y ESE día puestos, y al guardar POSTea ese día y refresca", async () => {
    const llamadas = servir(base);
    montar(<ReporteTab />);
    await abrirPersona();
    const filaDia = screen.getByText("lun 31 ago").closest("tr") as HTMLTableRowElement;
    fireEvent.click(within(filaDia).getByRole("button", { name: "Justificar" }));
    // La ventana: título y la línea con quién y qué día.
    expect(await screen.findByRole("heading", { name: "Justificar" })).toBeTruthy();
    expect(screen.getByText("Yulissa Juarez · lun 31 ago")).toBeTruthy();
    // El MISMO formulario: motivo de la lista de siempre, nota, «Agregar».
    const select = document.querySelector("select") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual([...MOTIVOS_JUSTIFICACION]);
    const reportesAntes = llamadas.filter((l) => l.url.includes("/api/asistencia/reporte")).length;
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    await waitFor(() => {
      const post = llamadas.find((l) => l.url.includes("/api/asistencia/justificaciones") && l.init?.method === "POST");
      expect(post).toBeTruthy();
      const body = JSON.parse(String(post?.init?.body));
      expect(body).toMatchObject({ codigo: "26", desde: "2026-08-31", hasta: "2026-08-31", motivo: MOTIVOS_JUSTIFICACION[0] });
    });
    // Se refresca la pestaña y la ventana se cierra.
    await waitFor(() => {
      expect(llamadas.filter((l) => l.url.includes("/api/asistencia/reporte")).length).toBeGreaterThan(reportesAntes);
    });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Justificar" })).toBeNull());
  });

  it("🔴 el aviso de la hora de salida ya no manda a «Horarios»", async () => {
    servir([...base.slice(0, 2), ["/api/asistencia/reporte", { personas: [PERSONA], sinHorario: 2, reglas: REGLAS_DEFAULT }]]);
    montar(<ReporteTab />);
    const aviso = await screen.findByText(/no tienen su hora de salida/);
    expect(aviso.textContent).toMatch(/Mientras tanto se asume 5:00 p\.m\./);
    expect(aviso.textContent).not.toMatch(/Horarios/);
    expect(aviso.textContent).toMatch(/Colaboradores|Configuración/);
  });
});
