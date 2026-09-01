/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PLANILLA SE PIDE POR RANGO DE FECHAS, Y NADA MÁS (25-ago-2026).
 *
 * Daniel, textual: *"quita periodo quincena en planilla, eso no se usara asi. y
 * sisi, que el usuario eliga el rango"*.
 *
 * 🔴 POR QUÉ ESTE ARCHIVO EXISTE, Y POR QUÉ ES DE CONDUCTA. Lo que se retiró es
 * un CONTROL, pero lo que puede romperse es PLATA: los cinco montos que se
 * escriben a mano (ISR, préstamo, terceros, mercancía, otros servicios) viven
 * por QUINCENA —`asistencia_planilla_manual`, clave «2026-08-1», con un CHECK
 * que no acepta otra cosa— y hasta hoy la única forma de llegar a ellos era el
 * modo que se fue. Medido contra producción: la quincena del 1 al 15 de agosto
 * tiene 12 personas con manuales guardados.
 *
 * Un barrido de texto sobre el .tsx no puede ver nada de esto. Acá se MONTA la
 * pantalla, se escribe en los campos y se cuenta qué salió por `fetch`:
 *
 *   1. no hay control de modo, y los dos campos de fecha se ven de entrada;
 *   2. arranca en la quincena EN CURSO — el caso normal sigue siendo abrir;
 *   3. con un rango que ES una quincena exacta, los campos manuales escriben y
 *      lo hacen CON LA CLAVE de esa quincena;
 *   4. con un rango que NO lo es, quedan bloqueados, NO se manda nada, y sale
 *      el aviso de UNA línea que dice por qué;
 *   5. los manuales ya guardados se siguen viendo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  HORAS_CERO,
  TOTALES_CERO,
  MANUALES_CERO,
  quincena,
  periodoDeQuincena,
  periodoDesdeRango,
  type LineaPlanilla,
} from "@/lib/asistencia/planilla";
import PlanillaTab from "@/app/asistencia/PlanillaTab";

const Q = quincena(2026, 8, 1); // 1 → 15 de agosto de 2026

const dinero = {
  rataHora: 4.62, valorMinuto: 0.077, salarioQuincenal: 400,
  extraDiurno: 0, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
  ausencias: 0, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0,
  vacacionesYaPagadas: 0, tardanzas: 0, totalBruto: 400, seguroSocial: 39,
  seguroEducativo: 5, isr: 0, prestamo: 0, terceros: 0, mercancia: 0,
  totalDeducciones: 44, otrosServicios: 0, netoPagar: 356,
};

const linea = (over: Partial<LineaPlanilla> = {}): LineaPlanilla => ({
  codigo: "22", etiqueta: "ALEJANDRA CAMAÑO", nombre: "ALEJANDRA CAMAÑO",
  empresa: "confecciones_boston", empresaEtiqueta: "Confecciones Boston",
  salarioMensual: 800, jornadaSemanal: 40, horas: { ...HORAS_CERO },
  faltaConfigurar: [], fueraDePlanilla: false, pagaSeguros: true,
  decidirAMano: null, quincenalReferencia: null, dinero,
  // 🔴 Un manual YA GUARDADO: es lo que hay en producción y tiene que seguir
  // viéndose. Si el cuadro dejara de mostrarlo, la contadora creería que se
  // borró.
  manuales: { ...MANUALES_CERO, isr: 25.5 },
  ...over,
});

/** La respuesta de la ruta para un período que ES una quincena exacta. */
const respuestaQuincena = () => ({
  quincena: Q,
  periodo: periodoDeQuincena(Q),
  empresa: "confecciones_boston",
  empresaEtiqueta: "Confecciones Boston",
  lineas: [linea()],
  totales: { ...TOTALES_CERO, ...dinero, personas: 1 },
  reglas: REGLAS_DEFAULT,
  avisos: { ...AVISOS_BASE, rangoLibre: false, factorBase: 1, diasCalendario: 15 },
  marcaciones: 100,
});

/** Y para uno que NO lo es (del 25-jul al 10-ago). */
const respuestaRangoLibre = () => ({
  quincena: Q,
  periodo: periodoDesdeRango("2026-07-25", "2026-08-10"),
  empresa: "confecciones_boston",
  empresaEtiqueta: "Confecciones Boston",
  lineas: [linea({ manuales: { ...MANUALES_CERO } })],
  totales: { ...TOTALES_CERO, ...dinero, personas: 1 },
  reglas: REGLAS_DEFAULT,
  avisos: { ...AVISOS_BASE, rangoLibre: true, factorBase: 1.104, diasCalendario: 17 },
  marcaciones: 100,
});

const AVISOS_BASE = {
  faltaMigracionConfiguracion: null, faltaMigracionManual: null,
  faltaMigracionBajas: null, faltaMigracionServicioProfesional: null,
  faltaMigracionVacaciones: null,
  fueraPorBaja: 0, marcoDespuesDeIrse: 0, sinHorario: 0, salidaAsumida: "17:00",
  horasAusenciaDefault: 8, conSabado: 0, periodoAbierto: null,
  sinFicha: [], avisoSinFicha: null, correcciones: 0,
  vacacionesNoPagadas: [], avisoVacacionesNoPagadas: null,
};

/** Guarda cada llamada y responde lo que se le diga según la URL. */
function servir(json: unknown) {
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    return { ok: true, json: async () => json } as Response;
  }));
  return llamadas;
}
const montar = () => render(<ToastProvider><PlanillaTab /></ToastProvider>);

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 🔴 CAMBIÓ DE DIRECCIÓN (1-sep-2026). Eran DOS `<input type="date">` sueltos y
// este helper los tomaba por su `aria-label`. Ahora es UN control: un botón que
// dice el rango y abre un calendario. Lo que el candado sigue exigiendo —que la
// pantalla arranque en la quincena en curso y que la ruta se pida por rango— no
// cambió; lo que cambió es por dónde se lee.
// 🩸 `getAllByRole(...)[0]`, no `getByRole`: en jsdom no hay Tailwind, así que
// el botón de desktop (`hidden lg:block`) y el de móvil (`lg:hidden`) se montan
// los DOS y `getByRole` revienta con «Found multiple elements».
const control = () => screen.getAllByRole("button", { name: /·\s*\d+\s*d[ií]as?/ })[0];

// ═════════════════════════════════════════════════════════════════════════════
describe("⛔ el modo «Quincena» se fue: queda el rango, y nada que elegir", () => {
  it("no hay control de modo — ni «Quincena» ni «Rango de fechas»", async () => {
    servir(respuestaQuincena());
    montar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    // 🔑 Con una sola opción, un segmentado no es una elección: es un botón que
    // no hace nada.
    expect(screen.queryByRole("button", { name: /^Quincena$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Rango de fechas/ })).toBeNull();
    // Y tampoco el desplegable de quincenas que colgaba de ese modo.
    expect(screen.queryByText(/1 al 15 de agosto de 2026/)).toBeNull();
  });

  it("el control dice el rango y cuántos días son, sin tocar nada", async () => {
    servir(respuestaQuincena());
    montar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    expect(control().textContent).toMatch(/15 días/);
  });

  it("⛔ y NO quedó ningún `<input type=\"date\">` suelto de rango", async () => {
    servir(respuestaQuincena());
    const { container } = montar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    expect(container.querySelectorAll('input[type="date"]').length).toBe(0);
  });

  it("🔴 arranca en la QUINCENA EN CURSO: el caso normal sigue siendo abrir", async () => {
    // Sin esto, la pantalla abriría vacía o en un rango cualquiera y el trabajo
    // de todos los días costaría teclear dos fechas.
    vi.setSystemTime(new Date("2026-08-10T15:00:00Z"));
    const llamadas = servir(respuestaQuincena());
    montar();
    await waitFor(() => expect(llamadas.length).toBeGreaterThan(0));
    // «1 ago – 15 ago 2026 · 15 días»
    expect(control().textContent).toMatch(/1 ago.*15 ago 2026.*15 días/);
    expect(llamadas[0].url).toContain("desde=2026-08-01");
    expect(llamadas[0].url).toContain("hasta=2026-08-15");
    vi.useRealTimers();
  });

  it("la ruta se pide SIEMPRE por rango — nunca más con `?quincena=`", async () => {
    const llamadas = servir(respuestaQuincena());
    montar();
    await waitFor(() => expect(llamadas.length).toBeGreaterThan(0));
    const get = llamadas.find((c) => c.url.includes("/api/asistencia/planilla"))!;
    expect(get.url).toContain("desde=");
    expect(get.url).toContain("hasta=");
    expect(get.url).not.toMatch(/[?&]quincena=/);
  });

  it("cerrado NO hay calendario: se carga recién al abrirlo", async () => {
    servir(respuestaQuincena());
    const { container } = montar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    expect(container.querySelectorAll("[data-day]").length).toBe(0);
  });

  // 🩸 NO SE PUEDE ABRIR EL CALENDARIO DESDE ACÁ, y queda escrito para que nadie
  // lo intente de nuevo: `next/dynamic` no resuelve bajo vitest —se queda en su
  // `loading` para siempre (medido: el DOM tiene el placeholder y ni un
  // `data-day`)— y meter el mock en un helper importado tampoco alcanza, porque
  // `vi.mock` se iza POR ARCHIVO.
  //
  // Lo que la máquina de toques hace —ancla, cierre, orden invertido, ancla
  // nueva— se prueba sobre `CalendarioRango` importado DIRECTO, en
  // `rango-fechas-calendario.test.tsx`, que es donde vive esa lógica. Acá se
  // prueba lo que ESTA pantalla decide.
  it("la ruta se pide por RANGO y el control refleja el que está puesto", async () => {
    const llamadas = servir(respuestaQuincena());
    montar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    const get = llamadas.find((c) => c.url.includes("/api/asistencia/planilla"))!;
    expect(get.url).toContain("desde=");
    expect(get.url).toContain("hasta=");
    expect(control().textContent).toMatch(/días/);
  });


});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 LOS MONTOS A MANO — lo único que la quincena decidía", () => {
  it("un rango que ES una quincena exacta: se pueden escribir", async () => {
    servir(respuestaQuincena());
    montar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    const isr = screen.getAllByDisplayValue("25.5")[0] as HTMLInputElement;
    expect(isr.disabled).toBe(false);
  });

  it("🔴 y se guardan CON LA CLAVE de esa quincena", async () => {
    const llamadas = servir(respuestaQuincena());
    montar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    const isr = screen.getAllByDisplayValue("25.5")[0] as HTMLInputElement;

    fireEvent.change(isr, { target: { value: "30" } });
    fireEvent.blur(isr);

    await waitFor(() => {
      const post = llamadas.find((c) => c.init?.method === "POST");
      expect(post).toBeTruthy();
      const body = JSON.parse(String(post!.init!.body));
      // La clave sale del período que devolvió el servidor, no de un estado
      // propio de la pantalla: dos definiciones de «a qué quincena pertenece»
      // terminan guardando en una y leyendo de otra.
      expect(body.quincena).toBe(Q.clave);
      expect(body.isr).toBe(30);
      expect(body.codigo).toBe("22");
    });
  });

  it("los manuales YA GUARDADOS se siguen viendo (los 12 de agosto en producción)", async () => {
    servir(respuestaQuincena());
    montar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    expect(screen.getAllByDisplayValue("25.5").length).toBeGreaterThan(0);
  });

  it("🔴 un rango que NO es una quincena: quedan BLOQUEADOS", async () => {
    servir(respuestaRangoLibre());
    montar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    const apagados = screen.getAllByPlaceholderText("por quincena") as HTMLInputElement[];
    expect(apagados.length).toBeGreaterThan(0);
    expect(apagados.every((i) => i.disabled)).toBe(true);
  });

  it("🔴 y NO se manda nada aunque alguien fuerce el campo", async () => {
    // El `disabled` es la primera capa; el freno de verdad vive del lado que
    // escribe, porque la tabla no tiene dónde guardarlo.
    const llamadas = servir(respuestaRangoLibre());
    montar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    const campo = screen.getAllByPlaceholderText("por quincena")[0] as HTMLInputElement;
    campo.disabled = false;
    fireEvent.change(campo, { target: { value: "99" } });
    fireEvent.blur(campo);
    await new Promise((r) => setTimeout(r, 30));
    expect(llamadas.some((c) => c.init?.method === "POST")).toBe(false);
  });

  it("🔴 y lo DICE, en una línea, donde están los campos", async () => {
    servir(respuestaRangoLibre());
    montar();
    const aviso = await screen.findByText(/Los montos a mano se guardan por quincena/);
    expect(aviso).toBeTruthy();
    // Nada se descarta en silencio, pero tampoco párrafos didácticos.
    expect((aviso.textContent ?? "").length).toBeLessThan(160);
  });

  it("con una quincena exacta ese aviso NO aparece", async () => {
    servir(respuestaQuincena());
    montar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    expect(screen.queryByText(/Los montos a mano se guardan por quincena/)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("lo que el rango libre cambia en la PLATA se sigue diciendo", () => {
  it("dice que el sueldo base se reparte, y en qué proporción", async () => {
    servir(respuestaRangoLibre());
    montar();
    // 🩸 El texto está partido en varios nodos (`<b>`), así que se lee el
    // PÁRRAFO entero: `findByText` devuelve el `<b>` que matcheó, no la línea.
    const aviso = (await screen.findByText(/no son una quincena/)).closest("p")!;
    expect(aviso.textContent).toContain("17 días");
    expect(aviso.textContent).toContain("110.4 %");
  });

  it("y con una quincena exacta no se dibuja nada de eso", async () => {
    servir(respuestaQuincena());
    montar();
    await screen.findAllByText(/ALEJANDRA CAMAÑO/);
    expect(screen.queryByText(/no son una quincena/)).toBeNull();
  });
});
